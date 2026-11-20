import { useCallback } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import type { Group } from 'three'
import type { PrimitiveObject } from '@/types/editor'
import { Geometry, ObjectMaterial } from './ObjectMaterial'

/** 点击判定阈值（px）：指针位移超过该值视为相机拖拽，不触发选中 */
const CLICK_TOLERANCE = 4

/**
 * 内置几何体的 R3F 渲染 + 拾取 + Gizmo 绑定
 * 拆分自 Scene.tsx（A1）；与 ModelInstance 共享 group 变换 / 拾取 / Gizmo 通路
 */
export function StaticMesh({
  object,
  selected,
  wireframe,
  onPick,
  onBind,
}: {
  object: PrimitiveObject
  selected: boolean
  wireframe: boolean
  onPick: (id: string) => void
  onBind: (node: Group | null) => void
}) {
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.delta <= CLICK_TOLERANCE) onPick(object.id)
  }

  // 仅选中对象把自己的 group 交给 Gizmo；取消选中时 ref 会收到 null 并清空
  const bindRef = useCallback(
    (node: Group | null) => {
      if (selected) onBind(node)
    },
    [selected, onBind],
  )

  return (
    <group
      ref={bindRef}
      position={object.position}
      rotation={object.rotation}
      // 缩放必须和 TransformControls 作用在同一个 group 上，否则会与 mesh 缩放叠加
      scale={object.scale}
      // 锁定对象不挂事件处理器，R3F 会将其排除在 raycast 之外（DEV-PLAN #16）
      onClick={object.locked ? undefined : handleClick}
    >
      <mesh castShadow receiveShadow>
        <Geometry type={object.type} />
        <ObjectMaterial object={object} wireframe={wireframe} />
      </mesh>
    </group>
  )
}
