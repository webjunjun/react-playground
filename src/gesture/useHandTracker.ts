import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import {
  FilesetResolver,
  GestureRecognizer,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision'
import { createGestureMachine } from './gestureMachine'
import { lookupGesture } from './gestureMap'
import type { ShapeId } from './shapes'

export type TrackerStatus = 'idle' | 'loading' | 'ready' | 'error'

/** 每帧识别结果，走 ref 传递，不触发 React 重渲染 */
export interface HandFrame {
  landmarks: NormalizedLandmark[] | null
  category: string | null
  score: number
  videoWidth: number
  videoHeight: number
}

export interface TrackerReadout {
  /** 当前看到的手势中文名（未识别为 null） */
  label: string | null
}

export interface TrackerError {
  title: string
  detail: string
}

const BASE = import.meta.env.BASE_URL
const MODEL_URL = `${BASE}models/gesture_recognizer.task`
const WASM_DIR = `${BASE}mediapipe`

/** 推理频率上限：30fps 足够，把余下的算力留给粒子 */
const INFER_INTERVAL = 1000 / 30

/**
 * MediaPipe 的视频模式要求时间戳严格递增，而识别器是跨挂载复用的。
 * video.currentTime 在重新开流后会归零，直接用它会让时间戳倒退，
 * 识别器随后每一帧都抛错（被下面的 catch 吞掉，表现为永远识别不到手）。
 * 所以维护一个模块级单调时钟：正常情况下跟随视频时间，倒退时就接着上一帧往后走。
 */
let lastStamp = -1

function monotonicStamp(videoMs: number): number {
  lastStamp = videoMs > lastStamp ? videoMs : lastStamp + 1
  return lastStamp
}

interface CachedRecognizer {
  promise: Promise<GestureRecognizer>
  refs: number
  timer: number
}

/**
 * 识别器做成模块级单例：StrictMode 会双挂载组件，
 * 每次挂载都新建一个 8MB 模型会让首屏直接翻倍。
 */
let cache: CachedRecognizer | null = null

async function warmModel(onProgress: (p: number) => void) {
  try {
    const res = await fetch(MODEL_URL)
    if (!res.ok || !res.body) return
    const total = Number(res.headers.get('content-length') ?? 0)
    const reader = res.body.getReader()
    let loaded = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      loaded += value?.length ?? 0
      const ratio = total ? loaded / total : Math.min(1, loaded / 8_400_000)
      // 留 14% 给 wasm 初始化，进度条不会先跑到 100% 再卡住
      onProgress(0.02 + Math.min(0.84, ratio * 0.84))
    }
  } catch {
    // 读不到就让 MediaPipe 自己再请求一次，真正的失败在 create 阶段抛
  }
}

async function buildRecognizer(onProgress: (p: number) => void): Promise<GestureRecognizer> {
  onProgress(0.02)
  await warmModel(onProgress)
  onProgress(0.88)

  const fileset = await FilesetResolver.forVisionTasks(WASM_DIR)

  const options = (delegate: 'GPU' | 'CPU') => ({
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: 'VIDEO' as const,
    numHands: 1,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  })

  try {
    return await GestureRecognizer.createFromOptions(fileset, options('GPU'))
  } catch {
    // 集显 / 无 WebGL2 的环境下 GPU delegate 会失败，退回 CPU 仍可 30fps
    return GestureRecognizer.createFromOptions(fileset, options('CPU'))
  }
}

function acquireRecognizer(onProgress: (p: number) => void): Promise<GestureRecognizer> {
  if (cache) {
    cache.refs += 1
    if (cache.timer) {
      window.clearTimeout(cache.timer)
      cache.timer = 0
    }
    return cache.promise
  }

  const entry: CachedRecognizer = {
    refs: 1,
    timer: 0,
    promise: guardTimeout(buildRecognizer(onProgress), 45_000),
  }
  cache = entry
  entry.promise.catch(() => {
    if (cache === entry) cache = null
  })
  return entry.promise
}

/**
 * 与摄像头的 9 秒超时同理：wasm 初始化可能既不成功也不报错（策略拦截、显存不足），
 * 没有上限的话界面会永远停在「88%」，连重试入口都没有。
 */
function guardTimeout<T extends { close(): void }>(task: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error('模型初始化超时'))
      // 晚到的实例直接销毁，别挂在后台占显存
      task.then((t) => t.close()).catch(() => {})
    }, ms)
    task.then(
      (t) => {
        window.clearTimeout(timer)
        resolve(t)
      },
      (e: unknown) => {
        window.clearTimeout(timer)
        reject(e instanceof Error ? e : new Error(String(e)))
      },
    )
  })
}

function releaseRecognizer() {
  if (!cache) return
  cache.refs = Math.max(0, cache.refs - 1)
  if (cache.refs > 0) return

  const entry = cache
  // 延迟释放：StrictMode 卸载后马上会再挂载，此时不该真的销毁
  entry.timer = window.setTimeout(() => {
    if (entry.refs > 0 || cache !== entry) return
    cache = null
    entry.promise.then((r) => r.close()).catch(() => {})
  }, 1500)
}

/** 把 MediaPipe 的原始报错压成一句人话：它抛出的堆栈有几十行，不能直接给用户看 */
function friendlyReason(err: unknown): string {
  const raw = err instanceof Error ? err.message : ''
  if (!raw) return ''
  if (/超时|timeout/i.test(raw)) return '初始化超时，可能是设备算力不足或浏览器拦截了 WebAssembly。'
  if (/zip|archive|模型文件|task/i.test(raw)) return '模型文件无法读取，可能是文件不完整。'
  if (/fetch|network|load|404/i.test(raw)) return '模型文件请求失败，检查部署路径与网络。'
  return ''
}

/** 掌心 = 腕点 + 四个掌指关节的均值，比单点稳 */
function palmCenter(lms: NormalizedLandmark[]) {
  const ids = [0, 5, 9, 13, 17]
  let x = 0
  let y = 0
  for (const id of ids) {
    x += lms[id].x
    y += lms[id].y
  }
  return { x: x / ids.length, y: y / ids.length }
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

interface UseHandTrackerOptions {
  videoRef: RefObject<HTMLVideoElement | null>
  /** 摄像头是否已经出画面，false 时不加载模型、不跑循环 */
  active: boolean
  pointerRef?: { current: { x: number; y: number } }
  onShape?: (shape: ShapeId | null) => void
}

export interface UseHandTrackerResult {
  status: TrackerStatus
  /** 0..1，仅 loading 时有意义 */
  progress: number
  error: TrackerError | null
  readout: TrackerReadout
  frameRef: RefObject<HandFrame>
  retry: () => void
}

export function useHandTracker({
  videoRef,
  active,
  pointerRef,
  onShape,
}: UseHandTrackerOptions): UseHandTrackerResult {
  const [status, setStatus] = useState<TrackerStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<TrackerError | null>(null)
  const [readout, setReadout] = useState<TrackerReadout>({ label: null })
  const [attempt, setAttempt] = useState(0)

  const frameRef = useRef<HandFrame>({
    landmarks: null,
    category: null,
    score: 0,
    videoWidth: 0,
    videoHeight: 0,
  })

  const onShapeRef = useRef(onShape)
  const pointerTargetRef = useRef(pointerRef)

  useEffect(() => {
    onShapeRef.current = onShape
  }, [onShape])

  useEffect(() => {
    pointerTargetRef.current = pointerRef
  }, [pointerRef])

  useEffect(() => {
    if (!active) {
      setStatus('idle')
      setProgress(0)
      setError(null)
      frameRef.current = {
        landmarks: null,
        category: null,
        score: 0,
        videoWidth: 0,
        videoHeight: 0,
      }
      return
    }

    let cancelled = false
    let raf = 0
    let recognizer: GestureRecognizer | null = null
    const machine = createGestureMachine()

    let lastInfer = 0
    let lastVideoMs = -1
    let smooth: { x: number; y: number } | null = null
    let lastCategory: string | null = null
    let fpsFrames = 0
    let fpsSince = performance.now()

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const video = videoRef.current
      if (!recognizer || !video || video.readyState < 2 || !video.videoWidth) return

      const now = performance.now()
      if (now - lastInfer < INFER_INTERVAL) return
      lastInfer = now

      // 视频暂停 / 回跳（时间没前进）时跳过这一帧，避免重复推理同一画面
      const videoMs = Math.round(video.currentTime * 1000)
      if (videoMs <= lastVideoMs) return
      lastVideoMs = videoMs
      const ts = monotonicStamp(videoMs)

      let result
      try {
        result = recognizer.recognizeForVideo(video, ts)
      } catch {
        return
      }

      const landmarks = result.landmarks?.[0] ?? null
      const cat = result.gestures?.[0]?.[0]
      const category = cat?.categoryName ?? null
      const score = cat?.score ?? 0

      frameRef.current = {
        landmarks,
        category,
        score,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
      }

      // 掌心跟随：镜像后映射到 [-1,1]，作为粒子场的引力偏置
      if (landmarks) {
        const p = palmCenter(landmarks)
        smooth = smooth ? { x: smooth.x + (p.x - smooth.x) * 0.34, y: smooth.y + (p.y - smooth.y) * 0.34 } : p
        const target = pointerTargetRef.current
        if (target) {
          target.current.x = clamp(1 - smooth.x * 2, -1.2, 1.2)
          target.current.y = clamp(smooth.y * 2 - 1, -1.2, 1.2)
        }
      } else {
        smooth = null
        // 手移出画面后让引力点缓慢回中，否则粒子会一直偏向最后的位置
        const target = pointerTargetRef.current
        if (target) {
          target.current.x *= 0.92
          target.current.y *= 0.92
        }
      }

      if (category !== lastCategory) {
        lastCategory = category
        setReadout({ label: lookupGesture(category)?.label ?? null })
      }

      const dbg = (window as unknown as { __dbg?: Record<string, unknown> }).__dbg
      if (dbg) {
        fpsFrames += 1
        if (now - fpsSince > 1000) {
          dbg.handFps = Math.round((fpsFrames * 1000) / (now - fpsSince))
          fpsFrames = 0
          fpsSince = now
        }
        dbg.hand = landmarks ? (category ?? '-') : 'none'
        dbg.handScore = score
        const m = machine.debug()
        dbg.candidate = m.candidate ?? '-'
        dbg.streak = m.streak
      }

      const commit = machine.push({ category, score, t: now })
      if (commit) onShapeRef.current?.(commit.shape)
    }

    setStatus('loading')
    setError(null)
    setProgress(0)
    setReadout({ label: null })

    acquireRecognizer((p) => {
      if (!cancelled) setProgress(p)
    })
      .then((r) => {
        if (cancelled) {
          releaseRecognizer()
          return
        }
        recognizer = r
        setProgress(1)
        setStatus('ready')
        raf = requestAnimationFrame(tick)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setStatus('error')
        setError({
          title: '手势模型加载失败',
          detail: `无法加载识别模型（约 8MB）。确认 public/models/gesture_recognizer.task 已部署、地址可访问，然后重试。${friendlyReason(
            err,
          )}`,
        })
      })

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      machine.reset()
      if (recognizer) releaseRecognizer()
      recognizer = null
    }
  }, [active, attempt, videoRef])

  const retry = useCallback(() => {
    // 失败的实例在 buildRecognizer 的 catch 里已经把 cache 清掉了；
    // 这里不能无脑置空，否则会把正在用的识别器丢掉。
    setError(null)
    setStatus('idle')
    setAttempt((n) => n + 1)
  }, [])

  return { status, progress, error, readout, frameRef, retry }
}
