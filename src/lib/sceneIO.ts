import type { Vector3Tuple } from 'three'
import type {
  EnvironmentKey,
  GroundConfig,
  MaterialConfig,
  MaterialType,
  PrimitiveType,
  SceneBackground,
  SceneEnvironmentConfig,
  SceneFogConfig,
  SceneLightsConfig,
  SceneObject,
} from '@/types/editor'
import { ENVIRONMENT_PRESETS, GROUND_SIZE } from './environmentPresets'

/** JSON schema 版本号（PRD §5；仅接受当前版本） */
export const SCENE_SCHEMA_VERSION = '2.1'

/** localStorage 自动草稿 key（PRD 4.9） */
export const AUTOSAVE_KEY = 'editor.autosave'

/** 导出文件名前缀 */
export const EXPORT_PREFIX = 'scene-'

/** JSON 顶层结构（PRD 4.9 schema） */
export interface SceneFile {
  version: string
  objects: SceneObject[]
  environment: SceneEnvironmentConfig
}

/** PrimitiveType 白名单（校验用） */
const VALID_TYPES: readonly PrimitiveType[] = [
  'box',
  'sphere',
  'cylinder',
  'cone',
  'torus',
  'tetrahedron',
  'octahedron',
  'plane',
  'ring',
  'torus-knot',
  'capsule',
]

/** MaterialType 白名单（校验用） */
const VALID_MATERIAL_TYPES: readonly MaterialType[] = [
  'basic',
  'phong',
  'standard',
  'normal',
]

/** EnvironmentKey 白名单（校验用） */
const VALID_ENVS: readonly EnvironmentKey[] = ['day', 'night', 'studio', 'none']

/** 颜色正则：#rgb / #rrggbb */
const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

/** 校验三维向量：必须是长度 3 的数字数组 */
function isVec3(value: unknown): value is Vector3Tuple {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((v) => typeof v === 'number' && Number.isFinite(v))
  )
}

/** 校验有限数字 */
function isNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** 校验背景：color / sky / transparent 三选一 */
function normalizeBackground(value: unknown): SceneBackground | null {
  if (!value || typeof value !== 'object') return null
  const b = value as Record<string, unknown>

  if (b.type === 'transparent') return { type: 'transparent' }
  if (b.type === 'color') {
    if (typeof b.color !== 'string' || !HEX_COLOR.test(b.color)) return null
    return { type: 'color', color: b.color }
  }
  if (b.type === 'sky') {
    if (!isVec3(b.sunPosition) || !isNum(b.turbidity) || !isNum(b.rayleigh)) return null
    return {
      type: 'sky',
      sunPosition: b.sunPosition,
      turbidity: b.turbidity,
      rayleigh: b.rayleigh,
    }
  }
  return null
}

/** 校验雾（顶层 null 由调用方处理） */
function normalizeFog(value: unknown): SceneFogConfig | null {
  if (!value || typeof value !== 'object') return null
  const f = value as Record<string, unknown>
  if (typeof f.color !== 'string' || !HEX_COLOR.test(f.color)) return null
  if (!isNum(f.near) || !isNum(f.far)) return null
  return { color: f.color, near: f.near, far: f.far }
}

/** 校验灯光 */
function normalizeLights(value: unknown): SceneLightsConfig | null {
  if (!value || typeof value !== 'object') return null
  const l = value as Record<string, unknown>
  const ambient = l.ambient
  const directional = l.directional as Record<string, unknown> | undefined

  if (!ambient || typeof ambient !== 'object') return null
  if (!isNum((ambient as Record<string, unknown>).intensity)) return null
  if (!directional || typeof directional !== 'object') return null
  if (typeof directional.color !== 'string' || !HEX_COLOR.test(directional.color)) return null
  if (!isNum(directional.intensity) || !isVec3(directional.position)) return null
  if (typeof directional.castShadow !== 'boolean') return null

  return {
    ambient: { intensity: (ambient as { intensity: number }).intensity },
    directional: {
      color: directional.color,
      intensity: directional.intensity,
      position: directional.position,
      castShadow: directional.castShadow,
    },
  }
}

/** 缺省环境：日间预设 + 默认地面 */
function defaultEnvironment(): SceneEnvironmentConfig {
  const preset = ENVIRONMENT_PRESETS.day
  return {
    sky: 'day',
    background: preset.background,
    fog: preset.fog,
    lights: preset.lights,
    ground: { visible: true, color: '#475569', size: GROUND_SIZE },
  }
}

/** 校验并归一化材质；几何体材质必填 */
function normalizeMaterial(value: unknown): MaterialConfig | null {
  if (value === undefined) return null
  if (!value || typeof value !== 'object') return null
  const m = value as Record<string, unknown>

  if (!VALID_MATERIAL_TYPES.includes(m.type as MaterialType)) return null
  if (typeof m.wireframe !== 'boolean') return null
  if (typeof m.shininess !== 'number' || !Number.isFinite(m.shininess) || m.shininess < 0)
    return null
  if (typeof m.specular !== 'string' || !HEX_COLOR.test(m.specular)) return null
  if (
    typeof m.metalness !== 'number' ||
    !Number.isFinite(m.metalness) ||
    m.metalness < 0 ||
    m.metalness > 1
  )
    return null
  if (
    typeof m.roughness !== 'number' ||
    !Number.isFinite(m.roughness) ||
    m.roughness < 0 ||
    m.roughness > 1
  )
    return null
  if (typeof m.flatShading !== 'boolean') return null

  return {
    type: m.type as MaterialType,
    wireframe: m.wireframe,
    shininess: m.shininess,
    specular: m.specular,
    metalness: m.metalness,
    roughness: m.roughness,
    flatShading: m.flatShading,
  }
}

/** 校验并归一化单个 SceneObject */
function normalizeObject(obj: unknown): SceneObject | null {
  if (!obj || typeof obj !== 'object') return null
  const o = obj as Record<string, unknown>

  if (typeof o.id !== 'string' || o.id.length === 0) return null
  if (typeof o.name !== 'string') return null
  if (!isVec3(o.position)) return null
  if (!isVec3(o.rotation)) return null
  if (!isVec3(o.scale)) return null
  if (typeof o.visible !== 'boolean') return null
  if (typeof o.locked !== 'boolean') return null

  // 模型实例：只认资产引用，不允许带颜色 / 材质
  if (o.type === 'model') {
    if (typeof o.asset !== 'string' || o.asset.length === 0) return null
    if (typeof o.file !== 'string' || o.file.length === 0) return null
    return {
      id: o.id,
      name: o.name,
      type: 'model',
      asset: o.asset,
      file: o.file,
      position: o.position,
      rotation: o.rotation,
      scale: o.scale,
      visible: o.visible,
      locked: o.locked,
    }
  }

  if (!VALID_TYPES.includes(o.type as PrimitiveType)) return null
  if (typeof o.color !== 'string' || !HEX_COLOR.test(o.color)) return null

  const material = normalizeMaterial(o.material)
  if (!material) return null

  return {
    id: o.id,
    name: o.name,
    type: o.type as PrimitiveType,
    position: o.position,
    rotation: o.rotation,
    scale: o.scale,
    color: o.color,
    material,
    visible: o.visible,
    locked: o.locked,
  }
}

/**
 * 序列化单个对象：只输出契约字段（PRD §5）
 * 模型实例仅 asset + file，几何体保留 color + material；运行时字段一律不外泄
 */
function serializeObject(object: SceneObject): SceneObject {
  const base = {
    id: object.id,
    name: object.name,
    position: object.position,
    rotation: object.rotation,
    scale: object.scale,
    visible: object.visible,
    locked: object.locked,
  }
  if (object.type === 'model') {
    return { ...base, type: 'model', asset: object.asset, file: object.file }
  }
  return {
    ...base,
    type: object.type,
    color: object.color,
    material: { ...object.material },
  }
}

/**
 * 序列化：把 store 数据转成可下载的 JSON 对象
 * 环境按预设解析成具体值，外部应用可直接套用，不需要复刻编辑器的预设表
 */
export function serializeScene(
  objects: SceneObject[],
  env: EnvironmentKey,
  ground: GroundConfig,
): SceneFile {
  const preset = ENVIRONMENT_PRESETS[env]
  return {
    version: SCENE_SCHEMA_VERSION,
    objects: objects.map(serializeObject),
    environment: {
      sky: env,
      background: preset.background,
      fog: preset.fog,
      lights: preset.lights,
      ground: {
        visible: ground.visible,
        color: ground.color,
        size: GROUND_SIZE,
      },
    },
  }
}

/**
 * 反序列化 + 校验：解析 JSON 文本并验证 schema
 * @returns 成功返回 SceneFile，失败返回 null
 */
export function parseSceneJSON(text: string): SceneFile | null {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }

  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>

  // 只接受当前版本（开发期不做旧版本兼容）
  if (d.version !== SCENE_SCHEMA_VERSION) return null

  if (!Array.isArray(d.objects)) return null
  const objects: SceneObject[] = []
  for (const value of d.objects) {
    const object = normalizeObject(value)
    if (!object) return null
    objects.push(object)
  }

  // environment 可选；字段缺失时按 sky 预设补全（2.1 起导出的是解析后的具体值）
  let environment: SceneEnvironmentConfig
  if (d.environment === undefined) {
    environment = defaultEnvironment()
  } else {
    if (typeof d.environment !== 'object' || d.environment === null) return null
    const raw = d.environment as Record<string, unknown>

    const sky = raw.sky === undefined ? 'day' : raw.sky
    if (!VALID_ENVS.includes(sky as EnvironmentKey)) return null
    const base = ENVIRONMENT_PRESETS[sky as EnvironmentKey]

    const background =
      raw.background === undefined ? base.background : normalizeBackground(raw.background)
    if (!background) return null

    const fog =
      raw.fog === undefined ? base.fog : raw.fog === null ? null : normalizeFog(raw.fog)
    if (raw.fog !== undefined && raw.fog !== null && !fog) return null

    const lights = raw.lights === undefined ? base.lights : normalizeLights(raw.lights)
    if (!lights) return null

    let ground: SceneEnvironmentConfig['ground'] = {
      visible: true,
      color: '#475569',
      size: GROUND_SIZE,
    }
    if (raw.ground !== undefined) {
      if (typeof raw.ground !== 'object' || raw.ground === null) return null
      const g = raw.ground as Record<string, unknown>
      if (typeof g.visible !== 'boolean') return null
      if (typeof g.color !== 'string' || !HEX_COLOR.test(g.color)) return null
      if (g.size !== undefined && (!isNum(g.size) || g.size <= 0)) return null
      ground = {
        visible: g.visible,
        color: g.color,
        size: g.size === undefined ? GROUND_SIZE : (g.size as number),
      }
    }

    environment = { sky: sky as EnvironmentKey, background, fog, lights, ground }
  }

  return {
    version: SCENE_SCHEMA_VERSION,
    objects,
    environment,
  }
}

/** 生成带时间戳的默认文件名 */
export function buildExportFilename(): string {
  const now = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  const ts =
    now.getFullYear().toString() +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    '-' +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds())
  return `${EXPORT_PREFIX}${ts}.json`
}

/** 触发浏览器下载（Blob） */
export function triggerJSONDownload(content: string, filename: string) {
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  // 必须插到 DOM 里点击，Safari 要求
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // 释放 objectURL
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/* ==================== localStorage 自动草稿 ==================== */

/** 读自动草稿；不存在或解析失败返回 null */
export function readAutosave(): SceneFile | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY)
    if (!raw) return null
    return parseSceneJSON(raw)
  } catch {
    return null
  }
}

/** 写自动草稿；返回 true 成功，false 失败（配额满 / 隐私模式 / 其他异常） */
export function writeAutosave(file: SceneFile): boolean {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(file))
    return true
  } catch {
    return false
  }
}

/** 清除自动草稿（恢复后调用） */
export function clearAutosave() {
  try {
    localStorage.removeItem(AUTOSAVE_KEY)
  } catch {
    /* 忽略 */
  }
}
