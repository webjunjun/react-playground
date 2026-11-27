import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  animateShape,
  buildShape,
  LAYER_CORE,
  LAYER_DUST,
  LAYER_STAR,
  SHAPE_GLOW,
  SHAPE_HEAT,
  SHAPE_TILT,
  type ShapeId,
} from './shapes'

/**
 * 银河系粒子场。
 *
 * 三层粒子（尘埃 / 核球 / 亮星）共用一套 Points：
 * - 位置由 CPU 做弹簧积分，形态由 shapes.ts 的采样器决定；
 * - 颜色、闪烁、光晕、冲击波都在着色器里算，避免每帧回写颜色；
 * - 背景星场是独立的静态 Points，不参与形态变化，负责景深。
 */

const BACKGROUND_COUNT = 1600

const vertexShader = /* glsl */ `
  attribute float aSeed;
  attribute float aLayer;
  attribute float aSize;
  attribute float aTemp;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uFlash;
  uniform float uRipple;
  uniform float uRippleR;
  uniform vec3 uHot;
  uniform vec3 uMid;
  uniform vec3 uCold;
  uniform vec3 uEmber;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vLayer;

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float depth = max(0.8, -mv.z);

    // 亮星独立闪烁，尘埃只做轻微呼吸
    float twinkle = aLayer > 1.5
      ? 0.72 + 0.28 * sin(uTime * (1.0 + aSeed * 2.4) + aSeed * 43.0)
      : 0.94 + 0.06 * sin(uTime * 0.7 + aSeed * 31.0);

    // 形态切换时从银心向外扩散的冲击波
    float ripple = 0.0;
    if (uRipple > 0.001) {
      float rr = length(position.xz);
      float d = rr - uRippleR;
      ripple = exp(-d * d * 3.0) * uRipple;
    }

    // 按温度做冷暖渐变：外缘紫 -> 中段蓝 -> 核心暖白，少数外缘粒子带橙色
    float t = clamp(aTemp, 0.0, 1.0);
    vec3 col = t < 0.5 ? mix(uCold, uMid, t * 2.0) : mix(uMid, uHot, (t - 0.5) * 2.0);
    col = mix(col, uEmber, smoothstep(0.62, 1.0, aSeed) * (1.0 - t));

    float size = aSize * (1.0 + ripple * 1.1 + uFlash * 0.35);
    gl_PointSize = clamp(size * uPixelRatio * 18.0 / depth, 0.8, 30.0);

    float layerAlpha = aLayer < 0.5 ? 0.76 : 1.0;
    vColor = col * (1.0 + uFlash * 0.8 + ripple * 0.9);
    vAlpha = clamp(1.55 - depth * 0.1, 0.06, 1.0) * twinkle * layerAlpha * (1.0 + ripple * 0.9);
    vLayer = aLayer;
  }
`

const fragmentShader = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vLayer;

  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;

    // 内核 + 外晕两段，加法混合下自然叠出光感
    float core = pow(1.0 - d, 3.2);
    float halo = pow(1.0 - d, 1.35) * 0.42;
    float a = core + halo;

    // 亮星再加十字星芒
    if (vLayer > 1.5) {
      vec2 p = gl_PointCoord - 0.5;
      float fx = (1.0 - smoothstep(0.0, 0.03, abs(p.y))) * (1.0 - smoothstep(0.04, 0.5, abs(p.x)));
      float fy = (1.0 - smoothstep(0.0, 0.03, abs(p.x))) * (1.0 - smoothstep(0.04, 0.5, abs(p.y)));
      a += (fx + fy) * 0.5 * core;
    }

    gl_FragColor = vec4(vColor, a * vAlpha * uOpacity);
    #include <colorspace_fragment>
  }
`

const starVertex = /* glsl */ `
  attribute float aSeed;
  attribute float aSize;

  uniform float uTime;
  uniform float uPixelRatio;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float depth = max(2.0, -mv.z);

    gl_PointSize = clamp(aSize * uPixelRatio * 5.0 / depth, 0.5, 5.0);

    float twinkle = 0.5 + 0.5 * sin(uTime * (0.4 + aSeed * 1.6) + aSeed * 60.0);
    vColor = mix(vec3(0.45, 0.58, 0.98), vec3(1.0, 0.84, 0.68), aSeed);
    vAlpha = (0.18 + twinkle * 0.42) * (0.6 + aSeed * 0.4);
  }
`

const starFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float a = pow(1.0 - d, 2.0);
    gl_FragColor = vec4(vColor, a * vAlpha);
    #include <colorspace_fragment>
  }
`

/** 背景星场只有一份，uniform 放在模块级，useFrame 里直接改值 */
const starUniforms = {
  uTime: { value: 0 },
  uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 1.5) },
}

interface Pointer {
  x: number
  y: number
}

interface GlowEffect {
  flash: number
  ripple: number
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 银心光晕：一张程序生成的径向渐变贴图，跟随形态热度变亮变大 */
function CoreGlow({ shapeId, fxRef }: { shapeId: ShapeId; fxRef: { current: GlowEffect } }) {
  const spriteRef = useRef<THREE.Sprite>(null)
  const heatRef = useRef(SHAPE_HEAT[shapeId])
  const glowRef = useRef(SHAPE_GLOW[shapeId])

  const texture = useMemo(() => {
    const size = 256
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (ctx) {
      const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
      g.addColorStop(0, 'rgba(255, 246, 220, 0.95)')
      g.addColorStop(0.22, 'rgba(255, 214, 158, 0.4)')
      g.addColorStop(0.55, 'rgba(150, 172, 255, 0.12)')
      g.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, size, size)
    }
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }, [])

  const colors = useMemo(
    () => ({
      cool: new THREE.Color('#8fa6ff'),
      warm: new THREE.Color('#ffd39a'),
    }),
    [],
  )

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30)
    heatRef.current += (SHAPE_HEAT[shapeId] - heatRef.current) * Math.min(1, dt * 2)
    const cfg = SHAPE_GLOW[shapeId]
    glowRef.current = {
      scale: glowRef.current.scale + (cfg.scale - glowRef.current.scale) * Math.min(1, dt * 2),
      opacity: glowRef.current.opacity + (cfg.opacity - glowRef.current.opacity) * Math.min(1, dt * 2),
    }
    const sprite = spriteRef.current
    if (!sprite) return
    const mat = sprite.material
    const flash = fxRef.current.flash
    mat.opacity = (0.14 + heatRef.current * 0.3 + flash * 0.3) * glowRef.current.opacity
    const scale = (2.0 + heatRef.current * 1.4 + flash * 0.6) * glowRef.current.scale
    sprite.scale.set(scale, scale, 1)
    mat.color.copy(colors.cool).lerp(colors.warm, heatRef.current)
  })

  return (
    <sprite ref={spriteRef}>
      <spriteMaterial
        map={texture}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </sprite>
  )
}

interface CloudProps {
  shapeId: ShapeId
  count: number
  pointerRef: { current: Pointer }
}

function Cloud({ shapeId, count, pointerRef }: CloudProps) {
  const groupRef = useRef<THREE.Group>(null)
  const outerRef = useRef<THREE.Group>(null)
  const fxRef = useRef<GlowEffect>({ flash: 0, ripple: 0 })
  const prevShape = useRef(shapeId)

  // 每颗粒子的固定属性：种子、层、相位、基准尺寸、刚度。只在 count 变化时重建
  const data = useMemo(() => {
    const seeds = new Float32Array(count)
    const layers = new Float32Array(count)
    const layerIds = new Uint8Array(count)
    const phases = new Float32Array(count)
    const sizes = new Float32Array(count)
    const stiffness = new Float32Array(count)
    const rnd = mulberry32(20261127)

    for (let i = 0; i < count; i++) {
      const s = rnd()
      seeds[i] = s
      phases[i] = rnd()

      const roll = rnd()
      const layer = roll < 0.02 ? LAYER_STAR : roll < 0.18 ? LAYER_CORE : LAYER_DUST
      layerIds[i] = layer
      layers[i] = layer

      sizes[i] =
        layer === LAYER_STAR
          ? 2.6 + rnd() * 1.9
          : layer === LAYER_CORE
            ? 0.9 + rnd() * 0.6
            : 0.5 + rnd() * 0.55

      // 每颗粒子刚度略有差别，聚散时才不会像一整块布
      stiffness[i] = 14 + rnd() * 14
    }

    return { seeds, layers, layerIds, phases, sizes, stiffness }
  }, [count])

  const [initialShape] = useState(shapeId)
  const initialField = useMemo(
    () => buildShape(initialShape, data.layerIds, data.seeds, count),
    [initialShape, data, count],
  )
  const field = useMemo(
    () =>
      shapeId === initialShape
        ? initialField
        : buildShape(shapeId, data.layerIds, data.seeds, count),
    [shapeId, initialShape, initialField, data, count],
  )

  const buffers = useMemo(() => {
    // 初始位置直接取首个形态的基准位置，避免开场粒子从原点炸开
    const position = new Float32Array(initialField.pos)
    const velocity = new Float32Array(count * 3)
    const target = new Float32Array(initialField.pos)
    return { position, velocity, target }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count])

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(buffers.position, 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(data.seeds, 1))
    g.setAttribute('aLayer', new THREE.BufferAttribute(data.layers, 1))
    g.setAttribute('aSize', new THREE.BufferAttribute(data.sizes, 1))
    g.setAttribute('aTemp', new THREE.BufferAttribute(new Float32Array(count), 1))
    return g
  }, [buffers, data, count])

  // 形态切换只更新温度属性，几何本身复用，避免重建缓冲区
  useLayoutEffect(() => {
    const attr = geometry.getAttribute('aTemp') as THREE.BufferAttribute
    ;(attr.array as Float32Array).set(field.temp)
    attr.needsUpdate = true
  }, [geometry, field])

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 1.5) },
      uFlash: { value: 0 },
      uRipple: { value: 0 },
      uRippleR: { value: 0 },
      uOpacity: { value: 0.86 },
      uHot: { value: new THREE.Color('#fff3d6') },
      uMid: { value: new THREE.Color('#9fd0ff') },
      uCold: { value: new THREE.Color('#8f6bff') },
      uEmber: { value: new THREE.Color('#ff9e64') },
    }),
    [],
  )

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 30)
    const t = state.clock.elapsedTime
    const { position, velocity, target } = buffers
    const { phases, stiffness } = data
    const fx = fxRef.current

    // 形态切换：核心闪一下 + 一圈冲击波
    if (prevShape.current !== shapeId) {
      prevShape.current = shapeId
      fx.flash = 1
      fx.ripple = 0
    }

    animateShape(shapeId, t, field, phases, target, count)

    const damping = Math.pow(0.86, dt * 60)
    for (let i = 0; i < count; i++) {
      const i3 = i * 3
      const dx = target[i3] - position[i3]
      const dy = target[i3 + 1] - position[i3 + 1]
      const dz = target[i3 + 2] - position[i3 + 2]
      const k = stiffness[i] * dt

      const vx = (velocity[i3] + dx * k) * damping
      const vy = (velocity[i3 + 1] + dy * k) * damping
      const vz = (velocity[i3 + 2] + dz * k) * damping

      velocity[i3] = vx
      velocity[i3 + 1] = vy
      velocity[i3 + 2] = vz

      position[i3] += vx * dt
      position[i3 + 1] += vy * dt
      position[i3 + 2] += vz * dt
    }

    geometry.attributes.position.needsUpdate = true

    fx.flash = Math.max(0, fx.flash - dt * 1.8)
    fx.ripple += dt
    const rippleLife = 1.5
    const rippleK = fx.ripple < rippleLife ? 1 - fx.ripple / rippleLife : 0

    uniforms.uTime.value = t
    uniforms.uFlash.value = fx.flash
    uniforms.uRipple.value = rippleK
    uniforms.uRippleR.value = 0.4 + fx.ripple * 3.2

    const dbg = (window as unknown as { __dbg?: Record<string, unknown> }).__dbg
    if (dbg) {
      dbg.frames = ((dbg.frames as number) ?? 0) + 1
      dbg.dt = dt
      dbg.flash = fx.flash
      dbg.ripple = rippleK
      dbg.p0 = [position[0], position[1], position[2]]
      dbg.t0 = [target[0], target[1], target[2]]
      dbg.clock = t
    }

    const g = groupRef.current
    if (g) {
      const p = pointerRef.current
      g.rotation.y += (p.x * 0.16 - g.rotation.y) * Math.min(1, dt * 3)
      g.rotation.x += (-p.y * 0.1 - g.rotation.x) * Math.min(1, dt * 3)
      g.position.x += (p.x * 0.22 - g.position.x) * Math.min(1, dt * 2.4)
      g.position.y += (-p.y * 0.16 - g.position.y) * Math.min(1, dt * 2.4)
    }

    // 盘状形态俯视、柱状形态平视，切换时缓慢过渡
    const outer = outerRef.current
    if (outer) {
      outer.rotation.x += (SHAPE_TILT[shapeId] - outer.rotation.x) * Math.min(1, dt * 2)
    }
  })

  return (
    // 外层固定倾角（随形态过渡），内层交给指针做视差，避免两套旋转互相覆盖
    <group ref={outerRef} rotation={[0.42, 0, -0.14]}>
      <group ref={groupRef}>
        <CoreGlow shapeId={shapeId} fxRef={fxRef} />
        <points geometry={geometry} frustumCulled={false}>
          <shaderMaterial
            vertexShader={vertexShader}
            fragmentShader={fragmentShader}
            uniforms={uniforms}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </points>
      </group>
    </group>
  )
}

/** 背景星场：完全不参与形态变化，提供视差和景深 */
function BackgroundStars({ count = BACKGROUND_COUNT }: { count?: number }) {
  const groupRef = useRef<THREE.Group>(null)

  const geometry = useMemo(() => {
    const rnd = mulberry32(9917)
    const position = new Float32Array(count * 3)
    const seeds = new Float32Array(count)
    const sizes = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      const i3 = i * 3
      position[i3] = (rnd() - 0.5) * 42
      position[i3 + 1] = (rnd() - 0.5) * 26
      position[i3 + 2] = -8 - rnd() * 26
      seeds[i] = rnd()
      sizes[i] = 0.6 + Math.pow(rnd(), 2) * 2.2
    }

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(position, 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    g.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    return g
  }, [count])

  const uniforms = starUniforms

  useFrame((state, delta) => {
    uniforms.uTime.value = state.clock.elapsedTime
    const g = groupRef.current
    if (g) g.rotation.y += delta * 0.006
  })

  return (
    <group ref={groupRef}>
      <points geometry={geometry} frustumCulled={false}>
        <shaderMaterial
          vertexShader={starVertex}
          fragmentShader={starFragment}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  )
}

interface ParticleFieldProps {
  shapeId: ShapeId
  pointerRef: { current: Pointer }
  count?: number
}

export default function ParticleField({ shapeId, pointerRef, count = 20000 }: ParticleFieldProps) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 8.8], fov: 45 }}
      gl={{ antialias: false, alpha: true, powerPreference: 'high-performance' }}
    >
      <BackgroundStars />
      <Cloud shapeId={shapeId} count={count} pointerRef={pointerRef} />
    </Canvas>
  )
}
