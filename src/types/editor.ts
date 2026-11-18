import type { Vector3Tuple } from 'three'

/** 支持的预设几何体类型（P0：PRD 4.2；P1 扩展：PRD 5.1） */
export type PrimitiveType =
  | 'box'
  | 'sphere'
  | 'cylinder'
  | 'cone'
  | 'torus'
  | 'tetrahedron'
  | 'octahedron'
  | 'plane'
  | 'ring'
  | 'torus-knot'
  | 'capsule'

/** 材质类型（PRD 5.3） */
export type MaterialType = 'basic' | 'phong' | 'standard' | 'normal'

/** 扁平材质配置：切换类型时保留所有参数，各材质仅读取自己支持的字段 */
export interface MaterialConfig {
  type: MaterialType
  wireframe: boolean
  shininess: number
  specular: string
  metalness: number
  roughness: number
  flatShading: boolean
}

/** 3D 对象在编辑器中的数据模型 */
export interface SceneObject {
  id: string
  name: string
  type: PrimitiveType
  position: Vector3Tuple
  rotation: Vector3Tuple
  scale: Vector3Tuple
  color: string
  material: MaterialConfig
  visible: boolean
  /** 锁定：视口拾取跳过 + 全选/框选排除 + 删除需先解锁；列表内仍可选中（解锁入口） */
  locked: boolean
}

/** 对象操作历史记录（用于撤销/重做） */
export interface HistoryEntry {
  objects: SceneObject[]
  selectedId: string | null
}

/** 默认场景地面配置（PRD 3.3 可选地板，作为环境元素在环境区调节） */
export interface GroundConfig {
  visible: boolean
  color: string
}

/** 变换模式 */
export type TransformMode = 'translate' | 'rotate' | 'scale'

/** 环境预设（PRD 5.5） */
export type EnvironmentKey = 'day' | 'night' | 'studio' | 'none'
