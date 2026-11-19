import type { Vector3Tuple } from 'three'
import type {
  ModelAssetRef,
  ModelObject,
  PrimitiveObject,
  PrimitiveType,
  SceneObject,
} from '@/types/editor'
import {
  DEFAULT_MATERIAL,
  PRIMITIVE_DEFAULTS,
  PRIMITIVE_PRESETS,
} from '@/components/editor/presets'

/** 类型 → 纯对象名，如 sphere → 球体 */
const NAME_BY_TYPE = Object.fromEntries(
  PRIMITIVE_PRESETS.map((p) => [p.type, p.name]),
) as Record<PrimitiveType, string>

/** 对象 id：obj_ + 8 位随机十六进制（PRD 4.3） */
export function createObjectId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4))
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `obj_${hex}`
}

/** 名称：{纯名称} {场景内同类型数量 + 1}（PRD 4.3） */
export function createObjectName(type: PrimitiveType, objects: SceneObject[]): string {
  const count = objects.filter((o) => o.type === type).length
  return `${NAME_BY_TYPE[type]} ${count + 1}`
}

/** 按类型默认值表创建一个场景对象 */
export function createSceneObject(
  type: PrimitiveType,
  objects: SceneObject[],
): PrimitiveObject {
  const defaults = PRIMITIVE_DEFAULTS[type]
  return {
    id: createObjectId(),
    name: createObjectName(type, objects),
    type,
    position: [...defaults.position] as Vector3Tuple,
    rotation: [...defaults.rotation] as Vector3Tuple,
    scale: [...defaults.scale] as Vector3Tuple,
    color: defaults.color,
    material: { ...DEFAULT_MATERIAL },
    visible: true,
    locked: false,
  }
}

/**
 * 模型实例：只存资产引用（PRD §4）
 * 默认 position / rotation 归零，scale = unitScale × 3；名称按同资产实例数递增
 */
export function createModelObject(
  asset: ModelAssetRef,
  objects: SceneObject[],
): ModelObject {
  const count = objects.filter(
    (o) => o.type === 'model' && o.asset === asset.id,
  ).length
  const scale = (asset.unitScale ?? 1) * 3
  return {
    id: createObjectId(),
    name: `${asset.name} ${count + 1}`,
    type: 'model',
    asset: asset.id,
    file: asset.fileName,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [scale, scale, scale],
    visible: true,
    locked: false,
  }
}

/** 模型实例的默认变换（属性面板重置用） */
export function getModelDefaults(asset?: ModelAssetRef): {
  position: Vector3Tuple
  rotation: Vector3Tuple
  scale: Vector3Tuple
} {
  const scale = (asset?.unitScale ?? 1) * 3
  return {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [scale, scale, scale],
  }
}

/**
 * 复制对象：新 id、名称加“副本”后缀、X / Z 各偏移 +offset（DEV-PLAN A4-06）
 * offset 由视图吸附配置决定：吸附开 = 1 格，关 = 0.5
 */
export function createCopyObject(source: SceneObject, offset: number): SceneObject {
  const position: Vector3Tuple = [
    source.position[0] + offset,
    source.position[1],
    source.position[2] + offset,
  ]

  if (source.type === 'model') {
    return {
      ...source,
      id: createObjectId(),
      name: `${source.name} 副本`,
      position,
      rotation: [...source.rotation] as Vector3Tuple,
      scale: [...source.scale] as Vector3Tuple,
    }
  }

  return {
    ...source,
    id: createObjectId(),
    name: `${source.name} 副本`,
    position,
    rotation: [...source.rotation] as Vector3Tuple,
    scale: [...source.scale] as Vector3Tuple,
    material: { ...source.material },
  }
}
