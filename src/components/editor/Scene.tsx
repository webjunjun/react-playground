import { useCallback, useRef, useState } from 'react'
import { Canvas, type ThreeEvent } from '@react-three/fiber'
import {
  OrbitControls,
  PerspectiveCamera,
  OrthographicCamera,
  Sky,
  Grid,
  TransformControls,
} from '@react-three/drei'
import type { Group, Object3D, Vector3Tuple } from 'three'
import { useEditorStore } from '@/store/editor'
import { useViewStore } from '@/store/view'
import type { SceneObject, TransformMode } from '@/types/editor'

/** 点击判定阈值（px）：指针位移超过该值视为相机拖拽，不触发选中 */
const CLICK_TOLERANCE = 4

/** 缩放下限（与属性面板一致，禁止 0 / 负数 / 镜像） */
const MIN_SCALE = 0.01

/** Gizmo 视觉尺寸 */
const GIZMO_SIZE = 0.8

/** 正交相机四个预设视角：(position, up)，lookAt 始终 (0,0,0) */
const ORTHO_VIEWPOINTS: Record<
  Exclude<ReturnType<typeof useViewStore.getState>['view'], 'persp'>,
  { position: Vector3Tuple; up: Vector3Tuple }
> = {
  front: { position: [0, 0, 15], up: [0, 1, 0] },
  top: { position: [0, 15, 0.01], up: [0, 0, -1] },
  right: { position: [15, 0, 0], up: [0, 1, 0] },
}

/** 把 Three.js target.scale 夹紧到 [MIN_SCALE, +∞) 并返回 clamp 后的 Vector3Tuple */
function clampScale(target: Object3D): Vector3Tuple {
  const x = Math.max(MIN_SCALE, target.scale.x)
  const y = Math.max(MIN_SCALE, target.scale.y)
  const z = Math.max(MIN_SCALE, target.scale.z)
  if (x !== target.scale.x || y !== target.scale.y || z !== target.scale.z) {
    target.scale.set(x, y, z)
  }
  return [x, y, z]
}

/**
 * 画布场景（PRD 3.3 / 4.1 / 4.5）
 * 渲染 store 中的对象与环境配置；选中对象绑定 TransformControls
 * 视口拾取：点对象选中、点空白取消、锁定对象不参与 raycast
 */
export function Scene() {
  const objects = useEditorStore((s) => s.objects)
  const selectedId = useEditorStore((s) => s.selectedId)
  const mode = useEditorStore((s) => s.mode)
  const ground = useEditorStore((s) => s.ground)
  const env = useEditorStore((s) => s.env)
  const select = useEditorStore((s) => s.select)
  const updateObject = useEditorStore((s) => s.updateObject)
  const commitHistory = useEditorStore((s) => s.commitHistory)
  const view = useViewStore((s) => s.view)
  const shade = useViewStore((s) => s.shade)

  // 当前选中对象的 group 实例，供 TransformControls 绑定
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null)
  // Gizmo 交互中：TransformControls 的拾取面不能交给 R3F，否则会吞掉空白点击
  const gizmoBusy = useRef(false)
  // 本次按下是否真的产生过变换，用于避免"单击 Gizmo"也生成快照
  const dragChanged = useRef(false)

  /** 拖拽过程中实时写回 store（供属性面板读数），不产生历史快照 */
  const syncTransform = (id: string, target: Object3D, currentMode: TransformMode) => {
    if (currentMode === 'translate') {
      updateObject(id, {
        position: [target.position.x, target.position.y, target.position.z],
      })
      return
    }
    if (currentMode === 'rotate') {
      updateObject(id, {
        rotation: [target.rotation.x, target.rotation.y, target.rotation.z],
      })
      return
    }
    // 缩放：拖到 0.01 以下立即夹紧，禁止负数与镜像
    updateObject(id, { scale: clampScale(target) })
  }

  /** 松手后做一次最终同步（#8 历史快照的唯一提交点） */
  const commitTransform = (id: string, target: Object3D) => {
    updateObject(id, {
      position: [target.position.x, target.position.y, target.position.z],
      rotation: [target.rotation.x, target.rotation.y, target.rotation.z],
      scale: clampScale(target),
    })
  }

  return (
    <Canvas
      shadows
      gl={{ antialias: true, alpha: env === 'none' }}
      onPointerMissed={() => {
        // 点击/拖拽 Gizmo 时不算空白；TransformControls 内部有 100000 见方的拾取面，
        // 不能让它进入 R3F 的 raycast，否则所有空白点击都会被拦截
        if (gizmoBusy.current) return
        select(null)
      }}
    >
      {/* === 相机（DEV-PLAN A1） === */}
      {view === 'persp' ? (
        <PerspectiveCamera makeDefault position={[8, 8, 12]} fov={50} />
      ) : (
        <OrthographicCamera
          makeDefault
          position={ORTHO_VIEWPOINTS[view].position}
          up={ORTHO_VIEWPOINTS[view].up}
          zoom={50}
          near={0.1}
          far={200}
        />
      )}
      {/* === 环境背景（PRD 5.5） === */}
      {env === 'day' && <Sky sunPosition={[100, 20, 100]} turbidity={8} rayleigh={0.5} />}
      {env === 'night' && (
        <>
          <color attach="background" args={['#0a0e1a']} />
          <fog attach="fog" args={['#0a0e1a', 20, 60]} />
        </>
      )}
      {env === 'studio' && <color attach="background" args={['#d4d4d8']} />}
      {/* none：透明背景，不挂任何 sky/color */}

      {/* === 光照（按环境微调） === */}
      <ambientLight intensity={env === 'night' ? 0.15 : 0.4} />
      <directionalLight
        position={[10, 20, 10]}
        intensity={env === 'night' ? 0.4 : env === 'studio' ? 1.0 : 1.2}
        color={env === 'night' ? '#7eb8da' : '#ffffff'}
        castShadow={env !== 'none'}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
      />

      {/* === 网格（PRD 5.5：day / night 显示，studio / none 隐藏） === */}
      {env !== 'studio' && env !== 'none' && (
        <Grid
          position={[0, 0.01, 0]}
          args={[40, 40]}
          cellSize={1}
          cellThickness={0.5}
          cellColor={env === 'night' ? '#2a3a52' : '#6b7280'}
          sectionSize={5}
          sectionThickness={1}
          sectionColor={env === 'night' ? '#3d5270' : '#374151'}
          fadeDistance={40}
          fadeStrength={1}
          infiniteGrid
        />
      )}

      {/* 地板：默认场景环境元素（PRD 3.3，可选），非场景对象，由环境区配置 */}
      {ground.visible && (
        <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[20, 20]} />
          <meshStandardMaterial color={ground.color} />
        </mesh>
      )}

      {/* 场景对象（仅渲染可见项；选中且未锁定时绑定 Gizmo） */}
      {objects.filter((o) => o.visible).map((o) => (
        <StaticMesh
          key={o.id}
          object={o}
          selected={o.id === selectedId && !o.locked}
          wireframe={shade === 'wire'}
          onPick={select}
          onBind={setSelectedGroup}
        />
      ))}

      {/* Gizmo：不进入 R3F 拾取；用 busy 标记避免点 Gizmo 被误判为空白 */}
      {selectedGroup && selectedId && (
        <TransformControls
          object={selectedGroup}
          mode={mode}
          size={GIZMO_SIZE}
          onMouseDown={() => {
            gizmoBusy.current = true
            dragChanged.current = false
          }}
          onMouseUp={() => {
            // 延迟到本次 pointerup 派发结束后再复位，保证空白判定能读到 busy
            setTimeout(() => {
              gizmoBusy.current = false
            }, 0)
            commitTransform(selectedId, selectedGroup)
            // 一次完整拖拽只提交一条历史；单击不拖动不入栈
            if (dragChanged.current) {
              dragChanged.current = false
              commitHistory()
            }
          }}
          onObjectChange={() => {
            dragChanged.current = true
            syncTransform(selectedId, selectedGroup, mode)
          }}
        />
      )}

      {/* 轨道控制（仅观察视角）；拖 Gizmo 时 drei 自动禁用 */}
      <OrbitControls
        makeDefault
        minDistance={3}
        maxDistance={60}
        maxPolarAngle={Math.PI / 2 - 0.05}
        enableDamping
        dampingFactor={0.08}
      />
    </Canvas>
  )
}

function StaticMesh({
  object,
  selected,
  wireframe,
  onPick,
  onBind,
}: {
  object: SceneObject
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
        <meshStandardMaterial color={object.color} wireframe={wireframe} />
      </mesh>
    </group>
  )
}

function Geometry({ type }: { type: SceneObject['type'] }) {
  switch (type) {
    case 'box':
      return <boxGeometry args={[1, 1, 1]} />
    case 'sphere':
      return <sphereGeometry args={[0.5, 32, 32]} />
    case 'cylinder':
      return <cylinderGeometry args={[0.5, 0.5, 1, 32]} />
    case 'cone':
      return <coneGeometry args={[0.5, 1, 32]} />
    case 'torus':
      return <torusGeometry args={[0.4, 0.15, 16, 48]} />
    case 'tetrahedron':
      return <tetrahedronGeometry args={[0.6]} />
    case 'octahedron':
      return <octahedronGeometry args={[0.6]} />
    case 'ring':
      return <ringGeometry args={[0.25, 0.5, 32]} />
    case 'torus-knot':
      return <torusKnotGeometry args={[0.35, 0.12, 64, 16]} />
    case 'capsule':
      return <capsuleGeometry args={[0.35, 0.6, 8, 16]} />
    case 'plane':
      return <planeGeometry args={[1, 1]} />
  }
}
