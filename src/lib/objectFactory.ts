import type { Vector3Tuple } from 'three'
import type { PrimitiveType, SceneObject } from '@/types/editor'
import { PRIMITIVE_DEFAULTS, PRIMITIVE_PRESETS } from '@/components/editor/presets'

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
export function createSceneObject(type: PrimitiveType, objects: SceneObject[]): SceneObject {
  const defaults = PRIMITIVE_DEFAULTS[type]
  return {
    id: createObjectId(),
    name: createObjectName(type, objects),
    type,
    position: [...defaults.position] as Vector3Tuple,
    rotation: [...defaults.rotation] as Vector3Tuple,
    scale: [...defaults.scale] as Vector3Tuple,
    color: defaults.color,
    visible: true,
    locked: false,
  }
}

/** 复制对象：新 id、名称加“副本”后缀、X / Z 各偏移 +1（PRD 4.7） */
export function createCopyObject(source: SceneObject): SceneObject {
  return {
    ...source,
    id: createObjectId(),
    name: `${source.name} 副本`,
    position: [source.position[0] + 1, source.position[1], source.position[2] + 1],
    rotation: [...source.rotation] as Vector3Tuple,
    scale: [...source.scale] as Vector3Tuple,
  }
}
