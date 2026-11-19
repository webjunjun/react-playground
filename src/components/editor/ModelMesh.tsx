import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import type { Group, Mesh } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { useAssetsStore } from '@/store/assets'
import type { ModelFormat, ModelObject } from '@/types/editor'

/** 点击判定阈值（px）：指针位移超过该值视为相机拖拽，不触发选中 */
const CLICK_TOLERANCE = 4

/** 资产 id → 已解析模板，避免同资产多实例重复下载 */
const templateCache = new Map<string, Promise<Group>>()

function loadTemplate(assetId: string, url: string, format: ModelFormat): Promise<Group> {
  const cached = templateCache.get(assetId)
  if (cached) return cached

  const request: Promise<Group> =
    format === 'fbx'
      ? new FBXLoader().loadAsync(url)
      : new GLTFLoader().loadAsync(url).then((gltf) => gltf.scene)

  const prepared = request.then((root) => {
    root.traverse((child) => {
      if ((child as Mesh).isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    return root
  })

  templateCache.set(assetId, prepared)
  prepared.catch(() => templateCache.delete(assetId))
  return prepared
}

interface ModelInstanceProps {
  object: ModelObject
  selected: boolean
  onPick: (id: string) => void
  onBind: (node: Group | null) => void
}

/**
 * 模型实例（PRD §3 M1）
 * 与几何体共用 group 变换 / 拾取 / Gizmo 通路；同资产多实例用 SkeletonUtils.clone 隔离
 */
export function ModelInstance({ object, selected, onPick, onBind }: ModelInstanceProps) {
  const asset = useAssetsStore((state) =>
    state.assets.find((item) => item.id === object.asset),
  )
  const blobUrl = useAssetsStore((state) => state.blobUrls[object.asset])
  const status = useAssetsStore((state) => state.status)
  const [template, setTemplate] = useState<Group | null>(null)
  // 记录加载失败的资产 id，资产变化时失败态自动失效
  const [failedAssetId, setFailedAssetId] = useState<string | null>(null)

  useEffect(() => {
    if (!asset || !blobUrl) return
    let cancelled = false
    loadTemplate(asset.id, blobUrl, asset.format)
      .then((root) => {
        if (!cancelled) setTemplate(root)
      })
      .catch((error) => {
        if (!cancelled) {
          setFailedAssetId(asset.id)
          console.error('[model] 加载失败', object.file, error)
        }
      })
    return () => {
      cancelled = true
    }
  }, [asset, blobUrl, object.file])

  // 模板一变就克隆一份；dispose={null} 避免卸载时释放共享几何体 / 材质
  const instance = useMemo(
    () => (template ? cloneSkeleton(template) : null),
    [template],
  )

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.delta <= CLICK_TOLERANCE) onPick(object.id)
  }

  const bindRef = useCallback(
    (node: Group | null) => {
      if (selected) onBind(node)
    },
    [selected, onBind],
  )

  // 资产库就绪后仍找不到资产，或文件加载失败 → 半透明占位盒 + 名称
  const missing = status === 'ready' && (!asset || !blobUrl)
  const failed = !!asset && failedAssetId === asset.id
  const showPlaceholder = missing || failed

  return (
    <group
      ref={bindRef}
      position={object.position}
      rotation={object.rotation}
      scale={object.scale}
      // 锁定对象不挂事件处理器，R3F 会将其排除在 raycast 之外
      onClick={object.locked ? undefined : handleClick}
    >
      {instance && <primitive object={instance} dispose={null} />}
      {showPlaceholder && (
        <>
          <mesh>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial
              color="#94a3b8"
              transparent
              opacity={0.18}
              wireframe
              depthWrite={false}
            />
          </mesh>
          <Html center position={[0, 0.9, 0]} distanceFactor={10} zIndexRange={[20, 0]}>
            <div className="model-placeholder-label">{object.name}</div>
          </Html>
        </>
      )}
    </group>
  )
}
