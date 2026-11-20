import { useCallback, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
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
import { ENVIRONMENT_PRESETS } from '@/lib/environmentPresets'
import { ModelInstance } from './ModelMesh'
import { StaticMesh } from './StaticMesh'

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
  const snapEnabled = useViewStore((s) => s.snapEnabled)
  const gridSize = useViewStore((s) => s.gridSize)
  // 环境预设的唯一真源；视口与导出共用，避免两边配置漂移
  const preset = ENVIRONMENT_PRESETS[env]

  // T4：用 ref 存当前选中的 group，避开 React useState 批量更新的竞态
  // 子组件 bindRef 回调直接写 ref，不触发全场景重渲染
  const selectedGroupRef = useRef<Group | null>(null)
  // 仅用于触发 TransformControls 重渲染的最小代价 state
  const [, setGizmoTick] = useState(0)
  /** 子组件注册 group 的唯一入口：直接写 ref + 触发一次重渲染让 Gizmo 绑定 */
  const registerGroup = useCallback((node: Group | null) => {
    selectedGroupRef.current = node
    setGizmoTick((t) => t + 1)
  }, [])
  // Gizmo 交互中：TransformControls 的拾取面不能交给 R3F，否则会吞掉空白点击
  const gizmoBusy = useRef(false)
  // 本次按下是否真的产生过变换，用于避免"单击 Gizmo"也生成快照
  const dragChanged = useRef(false)

  /** 松手后把 Gizmo 变换一次性同步到 store + 夹紧缩放（T2：拖拽期间不写 store，避免全场景高频重渲染） */
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
      {/* === 环境背景（PRD 5.5，配置见 environmentPresets） === */}
      {preset.background.type === 'sky' && (
        <Sky
          sunPosition={preset.background.sunPosition}
          turbidity={preset.background.turbidity}
          rayleigh={preset.background.rayleigh}
        />
      )}
      {preset.background.type === 'color' && (
        <color attach="background" args={[preset.background.color]} />
      )}
      {/* none：透明背景，不挂任何 sky/color */}
      {preset.fog && (
        <fog attach="fog" args={[preset.fog.color, preset.fog.near, preset.fog.far]} />
      )}

      {/* === 光照（与导出的 lights 字段同源） === */}
      <ambientLight intensity={preset.lights.ambient.intensity} />
      <directionalLight
        position={preset.lights.directional.position}
        intensity={preset.lights.directional.intensity}
        color={preset.lights.directional.color}
        castShadow={preset.lights.directional.castShadow}
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
          cellSize={gridSize}
          cellThickness={0.5}
          cellColor={env === 'night' ? '#2a3a52' : '#6b7280'}
          sectionSize={gridSize * 5}
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
      {objects.filter((o) => o.visible).map((o) =>
        o.type === 'model' ? (
          <ModelInstance
            key={o.id}
            object={o}
            selected={o.id === selectedId && !o.locked}
            wireframe={shade === 'wire'}
            onPick={select}
            onBind={registerGroup}
          />
        ) : (
          <StaticMesh
            key={o.id}
            object={o}
            selected={o.id === selectedId && !o.locked}
            wireframe={shade === 'wire'}
            onPick={select}
            onBind={registerGroup}
          />
        ),
      )}

      {/* Gizmo：不进入 R3F 拾取；用 busy 标记避免点 Gizmo 被误判为空白 */}
      {/* eslint-disable-next-line react-refresh/only-export-components */}
      {/* T4：selectedGroupRef 存当前选中 group，registerGroup 写 ref + setGizmoTick 强制重渲染，
          所以 JSX 里读 ref.current 时一定能拿到最新值——这是绕开 useState 竞态的刻意模式 */}
      {/* eslint-disable react-refs/refs-no-direct-access-in-jsx */}
      {selectedGroupRef.current && selectedId && (
        <TransformControls
          object={selectedGroupRef.current}
          mode={mode}
          size={GIZMO_SIZE}
          // 吸附属于视图偏好（DEV-PLAN A4）：开启时按网格 / 90° 步进，关闭恢复自由拖拽
          translationSnap={snapEnabled ? gridSize : null}
          rotationSnap={snapEnabled ? Math.PI / 2 : null}
          onMouseDown={() => {
            gizmoBusy.current = true
            dragChanged.current = false
          }}
          onMouseUp={() => {
            // 延迟到本次 pointerup 派发结束后再复位，保证空白判定能读到 busy
            setTimeout(() => {
              gizmoBusy.current = false
            }, 0)
            commitTransform(selectedId, selectedGroupRef.current!)
            // 一次完整拖拽只提交一条历史；单击不拖动不入栈
            if (dragChanged.current) {
              dragChanged.current = false
              commitHistory()
            }
          }}
          onObjectChange={() => {
            // T2：只记录"是否真的拖过"，拖拽期间完全不写 store
            // Gizmo 直接操作 Three.js group，视觉反馈即时；松手后 commitTransform 才同步到 React store
            dragChanged.current = true
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
