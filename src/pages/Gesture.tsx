import { useEffect, useMemo, useRef, useState } from 'react'
import ParticleField from '@/gesture/ParticleField'
import CameraPreview from '@/gesture/CameraPreview'
import CameraNotice from '@/gesture/CameraNotice'
import { useCamera } from '@/gesture/useCamera'
import { useHandTracker } from '@/gesture/useHandTracker'
import { SHAPES, SHAPE_IDS, type ShapeId } from '@/gesture/shapes'
import { isHandheldDevice } from '@/gesture/device'
import '@/assets/styles/gesture.css'

export default function Gesture() {
  const [shapeId, setShapeId] = useState<ShapeId>(() => {
    const preset = new URLSearchParams(window.location.search).get('shape')
    return preset && (SHAPE_IDS as string[]).includes(preset) ? (preset as ShapeId) : 'nebula'
  })
  const pointerRef = useRef({ x: 0, y: 0 })
  const handheld = useMemo(() => isHandheldDevice(), [])

  const camera = useCamera()
  const startCamera = camera.start
  /** 用户主动选择不接摄像头（出错后点「用鼠标模式」，或本来就想用鼠标） */
  const [mouseOnly, setMouseOnly] = useState(false)

  /**
   * 切到鼠标模式必须真的把流停掉：只置状态的话摄像头指示灯还亮着，
   * 而且 start() 会因为 streamRef 仍有值而直接返回，再也回不到摄像头模式。
   */
  const switchToMouse = () => {
    setMouseOnly(true)
    camera.stop()
  }

  const [debug, setDebug] = useState<Record<string, unknown> | null>(null)
  const active = SHAPES.find((s) => s.id === shapeId) ?? SHAPES[0]

  const cameraLive = camera.status === 'ready' && !mouseOnly

  const tracker = useHandTracker({
    videoRef: camera.videoRef,
    active: cameraLive,
    pointerRef,
    // 手离开画面会拿到 null，落回默认的星云态
    onShape: (next) => setShapeId(next ?? 'nebula'),
  })

  const tracking = cameraLive && tracker.status === 'ready'
  const showError = Boolean(camera.error) && !mouseOnly
  const showTrackerError = cameraLive && tracker.status === 'error'

  let statusText: string
  if (cameraLive) {
    if (tracker.status === 'loading') statusText = `手势模型加载中 · ${Math.round(tracker.progress * 100)}%`
    else if (tracker.status === 'error') statusText = '手势不可用 · 摄像头已就绪'
    else if (tracker.readout.label) statusText = `已识别 ${tracker.readout.label} · ${active.name}`
    else statusText = '摄像头已就绪 · 把手举到画面中'
  } else if (camera.status === 'starting') statusText = '正在启动摄像头…'
  else if (showError) statusText = '摄像头不可用'
  else statusText = `鼠标模式 · ${active.name}`

  const dotClass = showError || showTrackerError ? ' is-error' : tracking ? ' is-live' : ''

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('debug')) return
    const store = window as unknown as { __dbg?: Record<string, unknown> }
    store.__dbg = { frames: 0 }
    const id = window.setInterval(() => setDebug({ ...store.__dbg }), 300)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      // 手势接管时不再让鼠标抢引力点，否则两者互相打架
      if (tracking) return
      pointerRef.current = {
        x: (e.clientX / window.innerWidth) * 2 - 1,
        y: (e.clientY / window.innerHeight) * 2 - 1,
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      const hit = SHAPES.find((s) => s.key === e.key)
      if (hit) setShapeId(hit.id)
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [tracking])

  if (handheld) {
    return (
      <div className="gesture-gate">
        <div className="gesture-gate-card">
          <p className="gesture-gate-tag">需要电脑</p>
          <h1>请在电脑上打开这个页面</h1>
          <p>
            它靠摄像头追踪你的手势，并实时驱动两万个粒子。手机上的摄像头视角、算力和屏幕尺寸都不适合做这件事。
          </p>
          <p className="gesture-gate-note">换一台电脑，用同一个地址访问即可。</p>
        </div>
      </div>
    )
  }

  return (
    <div className="gesture-page">
      <div className="gesture-stage">
        <ParticleField shapeId={shapeId} pointerRef={pointerRef} />
      </div>

      <header className="gesture-bar">
        <span className="gesture-title">手势粒子场</span>
      </header>

      <div className="gesture-status">
        <span className={`gesture-dot${dotClass}`} />
        <span>{statusText}</span>
      </div>

      <aside className="gesture-guide">
        <p className="gesture-guide-title">可用手势</p>
        {SHAPES.map((s) => (
          <button
            key={s.id}
            className={`gesture-guide-row${s.id === shapeId ? ' is-active' : ''}${
              tracking && s.id === shapeId ? ' is-detected' : ''
            }`}
            onClick={() => setShapeId(s.id)}
            type="button"
          >
            <span className="gesture-keycap">{s.key}</span>
            <span className="gesture-guide-gesture">{s.gesture}</span>
            <span className="gesture-guide-name">{s.name}</span>
          </button>
        ))}
        <p className="gesture-guide-note">
          {!cameraLive
            ? '也可以按 1–5 直接切换'
            : tracker.status === 'loading'
              ? '模型加载中，可先用数字键'
              : tracker.status === 'error'
                ? '手势不可用，数字键仍有效'
                : '手掌完整入镜，握拳试试'}
        </p>
      </aside>

      <CameraPreview
        videoRef={camera.videoRef}
        status={mouseOnly ? 'idle' : camera.status}
        onStart={() => {
          setMouseOnly(false)
          startCamera()
        }}
        frameRef={tracker.frameRef}
      />

      <p className="gesture-hint">
        {tracking
          ? '手势识别已开启 · 张开手掌回到星云，手移出画面会缓慢回落'
          : cameraLive && tracker.status === 'loading'
            ? '正在加载手势模型，完成后即可用手势驱动'
            : '移动鼠标带动粒子，按 1–5 切换形态'}
      </p>

      {showError && camera.error && (
        <CameraNotice
          error={camera.error}
          onRetry={camera.retry}
          onUseMouse={switchToMouse}
        />
      )}

      {showTrackerError && tracker.error && (
        <div className="gesture-notice" role="alert">
          <p className="gesture-notice-head">
            <span className="gesture-dot is-error" />
            {tracker.error.title}
          </p>
          <p className="gesture-notice-detail">{tracker.error.detail}</p>
          <div className="gesture-notice-actions">
            <button className="gesture-btn gesture-btn-primary" onClick={tracker.retry} type="button">
              重试
            </button>
            <button className="gesture-btn" onClick={switchToMouse} type="button">
              用鼠标模式
            </button>
          </div>
        </div>
      )}

      {debug && (
        <pre className="gesture-debug">
          {Object.entries({ ...debug, tracker: `${tracker.status} ${Math.round(tracker.progress * 100)}%` })
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.map((n) => Number(n).toFixed(2)).join(', ') : String(v)}`)
            .join('\n')}
        </pre>
      )}
    </div>
  )
}
