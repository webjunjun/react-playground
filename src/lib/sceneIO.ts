import type {
  EnvironmentKey,
  GroundConfig,
  PrimitiveType,
  SceneObject,
  Vector3Tuple,
} from '@/types/editor'

/** JSON schema 版本号（PRD 4.9） */
export const SCENE_SCHEMA_VERSION = '1.1'

/** localStorage 自动草稿 key（PRD 4.9） */
export const AUTOSAVE_KEY = 'editor.autosave'

/** 导出文件名前缀 */
export const EXPORT_PREFIX = 'scene-'

/** JSON 顶层结构（PRD 4.9 schema） */
export interface SceneFile {
  version: string
  objects: SceneObject[]
  environment: {
    sky: EnvironmentKey
    ground: GroundConfig
  }
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

/** 校验单个 SceneObject */
function isValidObject(obj: unknown): obj is SceneObject {
  if (!obj || typeof obj !== 'object') return false
  const o = obj as Record<string, unknown>

  if (typeof o.id !== 'string' || o.id.length === 0) return false
  if (typeof o.name !== 'string') return false
  if (!VALID_TYPES.includes(o.type as PrimitiveType)) return false
  if (!isVec3(o.position)) return false
  if (!isVec3(o.rotation)) return false
  if (!isVec3(o.scale)) return false
  if (typeof o.color !== 'string' || !HEX_COLOR.test(o.color)) return false
  if (typeof o.visible !== 'boolean') return false
  if (typeof o.locked !== 'boolean') return false

  return true
}

/**
 * 序列化：把 store 数据转成可下载的 JSON 对象
 */
export function serializeScene(
  objects: SceneObject[],
  env: EnvironmentKey,
  ground: GroundConfig,
): SceneFile {
  return {
    version: SCENE_SCHEMA_VERSION,
    objects,
    environment: {
      sky: env,
      ground,
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

  // version 必须是字符串
  if (typeof d.version !== 'string') return null

  // objects 必须是非空数组，且每项校验通过
  if (!Array.isArray(d.objects)) return null
  if (!d.objects.every(isValidObject)) return null

  // environment 可选；如果提供了必须合法
  if (d.environment !== undefined) {
    if (typeof d.environment !== 'object' || d.environment === null) return null
    const env = d.environment as Record<string, unknown>
    if (env.sky !== undefined && !VALID_ENVS.includes(env.sky as EnvironmentKey))
      return null
    if (env.ground !== undefined) {
      if (typeof env.ground !== 'object' || env.ground === null) return null
      const g = env.ground as Record<string, unknown>
      if (typeof g.visible !== 'boolean') return null
      if (typeof g.color !== 'string' || !HEX_COLOR.test(g.color)) return null
    }
  }

  // 组装最终结构（environment 缺失时补默认值）
  const env = (d.environment as SceneFile['environment'] | undefined) ?? {
    sky: 'day',
    ground: { visible: true, color: '#475569' },
  }

  return {
    version: d.version,
    objects: d.objects as SceneObject[],
    environment: {
      sky: env.sky ?? 'day',
      ground: env.ground ?? { visible: true, color: '#475569' },
    },
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

/** 写自动草稿；静默，不抛错 */
export function writeAutosave(file: SceneFile) {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(file))
  } catch {
    // 配额满 / 隐私模式下 localStorage 不可用，静默丢弃
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
