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

/** 模型资产格式（PRD §3 M1） */
export type ModelFormat = 'glb' | 'gltf' | 'fbx'

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

/** 场景对象的公共字段 */
export interface BaseObject {
  id: string
  name: string
  position: Vector3Tuple
  rotation: Vector3Tuple
  scale: Vector3Tuple
  visible: boolean
  /** 锁定：视口拾取跳过 + 全选/框选排除 + 删除需先解锁；列表内仍可选中（解锁入口） */
  locked: boolean
}

/** 几何体对象（PRD §4） */
export interface PrimitiveObject extends BaseObject {
  type: PrimitiveType
  color: string
  material: MaterialConfig
}

/** 模型实例：只存资产引用，不内嵌模型数据（PRD §4） */
export interface ModelObject extends BaseObject {
  type: 'model'
  /** 资产 id（编辑器内部键） */
  asset: string
  /** 原始文件名（渲染端契约键） */
  file: string
}

/** 3D 对象在编辑器中的数据模型 */
export type SceneObject = PrimitiveObject | ModelObject

/** 入库的模型资产：blob 只存在于 IndexedDB 与运行时，不进入场景 JSON */
export interface ModelAsset {
  id: string
  name: string
  fileName: string
  format: ModelFormat
  size: number
  /** FBX 单位补救，默认 1 */
  unitScale?: number
  createdAt: number
  blob: Blob
}

/** 创建实例时需要的资产字段子集 */
export type ModelAssetRef = Pick<ModelAsset, 'id' | 'name' | 'fileName' | 'unitScale'>

/** 对象操作历史记录（用于撤销/重做） */
export interface HistoryEntry {
  objects: SceneObject[]
  selectedId: string | null
  /** 该次操作删除的资产；撤销时重新入库，重做时再次删除 */
  deletedAssets?: ModelAsset[]
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
