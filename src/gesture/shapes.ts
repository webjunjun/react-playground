/**
 * 银河系粒子采样器。
 *
 * 设计约定：
 * - `buildShape` 只在形态切换时调用一次，负责生成「基准位置」「温度」和「径向分桶」；
 * - `animateShape` 每帧调用，只做廉价的整体旋转 / 起伏 / 流动，
 *   差速旋转的三角函数按径向桶预先算好，2 万粒子才能稳在 60fps。
 */

export type ShapeId = 'nebula' | 'core' | 'vortex' | 'helix' | 'ray'

export interface ShapeMeta {
  id: ShapeId
  /** 键盘兜底快捷键 */
  key: string
  /** 对应手势 */
  gesture: string
  /** 形态名 */
  name: string
}

export const SHAPES: ShapeMeta[] = [
  { id: 'nebula', key: '1', gesture: '张开手掌', name: '星系展开' },
  { id: 'core', key: '2', gesture: '握拳', name: '银心坍缩' },
  { id: 'vortex', key: '3', gesture: '剪刀手', name: '双星系并合' },
  { id: 'helix', key: '4', gesture: '竖拇指', name: '螺旋光柱' },
  { id: 'ray', key: '5', gesture: '食指指上', name: '类星体喷流' },
]

export const SHAPE_IDS = SHAPES.map((s) => s.id)

/** 粒子层：尘埃 / 核球 / 亮星 */
export const LAYER_DUST = 0
export const LAYER_CORE = 1
export const LAYER_STAR = 2

/** 差速旋转的径向分桶数 */
export const RADIUS_BUCKETS = 64
/** 不参与差速旋转的粒子：双星系的潮汐桥、喷流的中心盘、光柱的核球 */
export const BUCKET_STATIC = 255

const TAU = Math.PI * 2
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** 固定种子的散列，用每颗粒子自己的 seed 生成多个互相独立的随机量 */
function hash(a: number, b: number): number {
  const t = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return t - Math.floor(t)
}

export interface ShapeField {
  /** 基准位置（xyz 连续排布） */
  pos: Float32Array
  /** 0..1 温度，供着色器做冷暖渐变：0 冷（紫/橙），1 热（暖白） */
  temp: Float32Array
  /** 径向分桶，用于按半径做差速旋转 */
  bucket: Uint8Array
}

/** 生成某个形态的静态基准位置、温度与径向分桶 */
export function buildShape(
  id: ShapeId,
  layers: Uint8Array,
  seeds: Float32Array,
  count: number,
): ShapeField {
  const pos = new Float32Array(count * 3)
  const temp = new Float32Array(count)
  const bucket = new Uint8Array(count)

  for (let i = 0; i < count; i++) {
    const i3 = i * 3
    const s = seeds[i]
    const r1 = hash(s, 1)
    const r2 = hash(s, 2)
    const r3 = hash(s, 3)
    const r4 = hash(s, 4)
    const layer = layers[i]

    let x = 0
    let y = 0
    let z = 0
    let rLocal = 0
    let isStatic = false

    switch (id) {
      case 'nebula': {
        if (layer === LAYER_CORE) {
          // 银心核球：向中心高度聚集的扁球
          const rad = Math.pow(r1, 1.9) * 1.05
          const phi = r2 * TAU
          const cosT = r3 * 2 - 1
          const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT))
          x = Math.cos(phi) * sinT * rad
          y = cosT * rad * 0.5
          z = Math.sin(phi) * sinT * rad
          rLocal = rad * 0.5
        } else if (hash(s, 7) < (layer === LAYER_DUST ? 0.18 : 0.07)) {
          // 弥散盘：只靠螺旋臂会显得又薄又断，用一层薄雾把底填住
          const rr = 0.45 + Math.pow(r2, 0.55) * 2.8
          const ang = r1 * TAU
          const rad = rr + (r3 - 0.5) * 0.42
          x = Math.cos(ang) * rad
          z = Math.sin(ang) * rad
          y = (hash(s, 5) - 0.5) * (0.16 + rr * 0.1)
          rLocal = rad / 3.2
        } else {
          // 两条对数螺旋臂 + 角向散布，外圈更松散
          const rr = 0.5 + Math.pow(r2, 0.7) * 2.75
          const arm = (r3 < 0.5 ? 0 : Math.PI) + Math.log(rr / 0.5) * 2.05
          const ang = arm + (r1 - 0.5) * (0.26 + rr * 0.2)
          const rad = rr + (r4 - 0.5) * (0.1 + rr * 0.12)
          x = Math.cos(ang) * rad
          z = Math.sin(ang) * rad
          y = (hash(s, 5) - 0.5) * (0.1 + rr * 0.07)
          rLocal = rad / 3.2
        }
        break
      }
      case 'core': {
        // 坍缩的银心：致密、扁平的核球
        const rad = 0.06 + Math.pow(r1, 2.0) * 0.9
        const phi = r2 * TAU
        const cosT = r3 * 2 - 1
        const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT))
        x = Math.cos(phi) * sinT * rad
        y = cosT * rad * 0.62
        z = Math.sin(phi) * sinT * rad
        rLocal = rad
        break
      }
      case 'vortex': {
        // 双星系并合：两个小旋涡 + 中间的潮汐桥
        const side = i % 2 === 0 ? 1 : -1
        const cx = side * 1.32
        const bridge = layer !== LAYER_CORE && r4 < 0.18
        if (bridge) {
          const sway = Math.sin(r1 * Math.PI)
          x = (r1 * 2 - 1) * 1.32
          y = -0.16 * sway + (r2 - 0.5) * 0.18
          z = (r3 - 0.5) * 0.46 * sway
          rLocal = 0.5
          isStatic = true
        } else if (layer === LAYER_CORE) {
          const rad = Math.pow(r1, 1.9) * 0.46
          const phi = r2 * TAU
          const cosT = r3 * 2 - 1
          const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT))
          x = cx + Math.cos(phi) * sinT * rad
          y = cosT * rad * 0.6
          z = Math.sin(phi) * sinT * rad
          rLocal = rad / 1.6
        } else {
          const rr = 0.16 + Math.pow(r2, 0.75) * 1.05
          const arm = (r3 < 0.5 ? 0 : Math.PI) + Math.log(rr / 0.1) * 1.35
          const ang = arm + (r1 - 0.5) * 0.55
          const rad = rr + (r4 - 0.5) * 0.08
          x = cx + Math.cos(ang) * rad
          z = Math.sin(ang) * rad
          y = (hash(s, 5) - 0.5) * (0.06 + rr * 0.1)
          rLocal = rad / 1.5
        }
        break
      }
      case 'helix': {
        // 垂直双螺旋光柱，中心留一个小核
        if (layer === LAYER_CORE) {
          const rad = Math.pow(r1, 1.8) * 0.5
          const phi = r2 * TAU
          const cosT = r3 * 2 - 1
          const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT))
          x = Math.cos(phi) * sinT * rad
          y = cosT * rad * 0.8
          z = Math.sin(phi) * sinT * rad
          rLocal = rad
          isStatic = true
        } else if (hash(s, 8) < 0.16) {
          // 横向梯级把两股螺旋连起来，光柱才立得住，不会散成几段弧
          const y0 = (r1 - 0.5) * 3.8
          const base = y0 * 4.6
          const rad = 1.02 + (r3 - 0.5) * 0.16
          const t = r2 * 2 - 1
          x = Math.cos(base) * rad * t
          z = Math.sin(base) * rad * t
          y = y0 + (r4 - 0.5) * 0.05
          rLocal = Math.abs(y0) / 1.9
        } else {
          // 双股螺旋，散度收窄、螺距收紧，才能看出「光柱」而不是一团云
          const y0 = (r1 - 0.5) * 3.8
          const offset = i % 2 === 0 ? 0 : Math.PI
          const ang = y0 * 4.6 + offset + (r2 - 0.5) * 0.16
          const rad = 1.02 + (r3 - 0.5) * 0.16
          x = Math.cos(ang) * rad
          z = Math.sin(ang) * rad
          y = y0 + (r4 - 0.5) * 0.08
          rLocal = Math.abs(y0) / 1.9
        }
        break
      }
      case 'ray': {
        // 类星体喷流：上下双锥 + 中心吸积盘
        if (layer === LAYER_CORE || r4 < 0.16) {
          const rad = Math.pow(r2, 1.7) * 0.8
          const phi = r3 * TAU
          x = Math.cos(phi) * rad
          z = Math.sin(phi) * rad
          y = (r1 - 0.5) * 0.16
          rLocal = rad
          isStatic = true
        } else {
          const dir = r1 < 0.5 ? 1 : -1
          const ay = 0.4 + Math.pow(r2, 0.6) * 2.85
          const cone = (0.04 + ay * 0.13) * Math.sqrt(r3)
          const ang = r4 * TAU
          x = Math.cos(ang) * cone
          z = Math.sin(ang) * cone
          y = dir * ay
          rLocal = ay / 3.2
        }
        break
      }
    }

    pos[i3] = x
    pos[i3 + 1] = y
    pos[i3 + 2] = z

    // 温度：越靠内越热，核球整体偏热，随机抖动一点点避免色带太硬
    const cold = clamp01(1.05 - rLocal * 0.9 + (hash(s, 6) - 0.5) * 0.15)
    temp[i] = layer === LAYER_CORE ? Math.min(1, cold + 0.28) : cold

    bucket[i] = isStatic ? BUCKET_STATIC : Math.round(clamp01(rLocal) * (RADIUS_BUCKETS - 1))
  }

  return { pos, temp, bucket }
}

/** 差速旋转的三角函数查找表：内圈角速度更快，螺旋臂会被自然剪切出丝状结构 */
const lutCos = new Float32Array(RADIUS_BUCKETS)
const lutSin = new Float32Array(RADIUS_BUCKETS)

function fillLut(time: number, base: number, span: number) {
  for (let k = 0; k < RADIUS_BUCKETS; k++) {
    const speed = base + span * (1 - k / (RADIUS_BUCKETS - 1))
    lutCos[k] = Math.cos(time * speed)
    lutSin[k] = Math.sin(time * speed)
  }
}

/** 每帧把基准位置变换成当前目标位置 */
export function animateShape(
  id: ShapeId,
  time: number,
  field: ShapeField,
  phases: Float32Array,
  out: Float32Array,
  count: number,
) {
  const { pos, bucket } = field

  switch (id) {
    case 'nebula': {
      fillLut(time, 0.08, 0.3)
      for (let i = 0; i < count; i++) {
        const i3 = i * 3
        const b = bucket[i] === BUCKET_STATIC ? 0 : bucket[i]
        const c = lutCos[b]
        const s = lutSin[b]
        const x = pos[i3]
        const z = pos[i3 + 2]
        out[i3] = x * c - z * s
        out[i3 + 1] = pos[i3 + 1] + Math.sin(time * 0.75 + phases[i] * TAU) * 0.03
        out[i3 + 2] = x * s + z * c
      }
      break
    }
    case 'core': {
      fillLut(time, 0.5, 0.35)
      const pulse = 1 + Math.sin(time * 2.4) * 0.03
      for (let i = 0; i < count; i++) {
        const i3 = i * 3
        const b = bucket[i] === BUCKET_STATIC ? 0 : bucket[i]
        const c = lutCos[b] * pulse
        const s = lutSin[b] * pulse
        const x = pos[i3]
        const z = pos[i3 + 2]
        out[i3] = x * c - z * s
        out[i3 + 1] = pos[i3 + 1] * pulse
        out[i3 + 2] = x * s + z * c
      }
      break
    }
    case 'vortex': {
      // 两个星系反向旋转
      fillLut(time, 0.12, 0.42)
      for (let i = 0; i < count; i++) {
        const i3 = i * 3
        const b = bucket[i]
        const y = pos[i3 + 1] + Math.sin(time * 0.9 + phases[i] * TAU) * 0.02
        if (b === BUCKET_STATIC) {
          // 潮汐桥保持静止，只轻轻起伏
          out[i3] = pos[i3]
          out[i3 + 1] = y
          out[i3 + 2] = pos[i3 + 2]
          continue
        }
        const cx = pos[i3] >= 0 ? 1.32 : -1.32
        const c = lutCos[b]
        const s = cx > 0 ? lutSin[b] : -lutSin[b]
        const ox = pos[i3] - cx
        const oz = pos[i3 + 2]
        out[i3] = cx + ox * c - oz * s
        out[i3 + 1] = y
        out[i3 + 2] = ox * s + oz * c
      }
      break
    }
    case 'helix': {
      const c = Math.cos(time * 0.55)
      const s = Math.sin(time * 0.55)
      const rise = 3.8
      for (let i = 0; i < count; i++) {
        const i3 = i * 3
        let y = pos[i3 + 1]
        if (bucket[i] !== BUCKET_STATIC) {
          y += time * 0.35
          y = (((y + 1.9) % rise) + rise) % rise - 1.9
        }
        out[i3] = pos[i3] * c - pos[i3 + 2] * s
        out[i3 + 1] = y
        out[i3 + 2] = pos[i3] * s + pos[i3 + 2] * c
      }
      break
    }
    case 'ray': {
      // 喷流沿锥体向外流动，循环回到银心；吸积盘只做缓慢自转
      const c = Math.cos(time * 0.22)
      const s = Math.sin(time * 0.22)
      const pulse = 1 + Math.sin(time * 2.0) * 0.02
      for (let i = 0; i < count; i++) {
        const i3 = i * 3
        if (bucket[i] === BUCKET_STATIC) {
          const x = pos[i3] * pulse
          const z = pos[i3 + 2] * pulse
          out[i3] = x * c - z * s
          out[i3 + 1] = pos[i3 + 1]
          out[i3 + 2] = x * s + z * c
          continue
        }
        const flow = ((phases[i] + time * 0.3) % 1 + 1) % 1
        const k = 0.08 + 0.92 * flow
        out[i3] = (pos[i3] * c - pos[i3 + 2] * s) * k
        out[i3 + 1] = pos[i3 + 1] * k
        out[i3 + 2] = (pos[i3] * s + pos[i3 + 2] * c) * k
      }
      break
    }
  }
}

/** 形态的「热度」：银心坍缩最热，星系展开最冷。给核心光晕用 */
export const SHAPE_HEAT: Record<ShapeId, number> = {
  nebula: 0.32,
  core: 0.95,
  vortex: 0.5,
  helix: 0.58,
  ray: 0.68,
}

/** 银心光晕的相对大小与亮度：双星系中间是空的，光晕必须收掉 */
export const SHAPE_GLOW: Record<ShapeId, { scale: number; opacity: number }> = {
  nebula: { scale: 1.0, opacity: 0.85 },
  core: { scale: 1.3, opacity: 1 },
  vortex: { scale: 0.5, opacity: 0.28 },
  helix: { scale: 0.85, opacity: 0.72 },
  ray: { scale: 1.05, opacity: 0.9 },
}

/** 观察角度：盘状形态可以俯视，竖向的柱/喷流要更接近平视才立得住 */
export const SHAPE_TILT: Record<ShapeId, number> = {
  nebula: 0.42,
  core: 0.34,
  vortex: 0.42,
  helix: 0.14,
  ray: 0.16,
}
