import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { CAMERA_CONSTRAINTS, cameraErrorOf, describeCameraError, type CameraError } from './camera'
import { hasCameraSupport, isSecureForCamera } from './device'

export type CameraStatus = 'idle' | 'starting' | 'ready' | 'error'

export interface UseCameraResult {
  videoRef: RefObject<HTMLVideoElement | null>
  stream: MediaStream | null
  status: CameraStatus
  error: CameraError | null
  start: () => void
  stop: () => void
  retry: () => void
}

/**
 * 摄像头开流与释放。
 *
 * 两个约束值得记住：
 * 1. 必须由用户点击触发开流 —— 自动申请会被浏览器拦，也会在 StrictMode 双挂载时请求两次；
 * 2. 卸载时一定要 stop 所有 track，否则摄像头指示灯一直亮着，用户会以为被偷拍。
 */
export function useCamera(): UseCameraResult {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const pendingRef = useRef(false)
  const aliveRef = useRef(true)
  /** 每次 start 自增，stop() 也自增：序号对不上说明这次开流已经作废 */
  const seqRef = useRef(0)

  const [stream, setStream] = useState<MediaStream | null>(null)
  const [status, setStatus] = useState<CameraStatus>('idle')
  const [error, setError] = useState<CameraError | null>(null)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [])

  const start = useCallback(async () => {
    if (pendingRef.current || streamRef.current) return

    if (!hasCameraSupport()) {
      setError(cameraErrorOf('unsupported'))
      setStatus('error')
      return
    }
    if (!isSecureForCamera()) {
      setError(cameraErrorOf('insecure'))
      setStatus('error')
      return
    }

    pendingRef.current = true
    const seq = ++seqRef.current
    /**
     * 本次调用是否还作数：卸载或 stop() 之后序号就对不上了。
     * 必须是局部序号而不是共享 ref —— 否则「超时后重试」会把上一次的
     * 迟到流当成本次结果，那个流没有任何人持有，摄像头就一直亮着。
     */
    const valid = () => aliveRef.current && seqRef.current === seq

    setError(null)
    setStatus('starting')

    let timer = 0
    try {
      // 有些环境（策略拦截、无任何设备）下 getUserMedia 既不给画面也不报错，
      // 必须自己设上限，否则界面会永远停在「启动中」。
      let timedOut = false
      const timeout = new Promise<null>((resolve) => {
        timer = window.setTimeout(() => {
          timedOut = true
          resolve(null)
        }, 9000)
      })

      const streamPromise = navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS).then((s) => {
        // 超时 / 被 stop / 组件已卸载之后才到的流没人会接管，立刻释放
        if (timedOut || !valid()) {
          s.getTracks().forEach((track) => track.stop())
          return null
        }
        return s
      })

      const next = await Promise.race([streamPromise, timeout])
      window.clearTimeout(timer)

      if (!next) {
        if (!valid()) return
        setError(cameraErrorOf('timeout'))
        setStatus('error')
        return
      }
      if (!valid()) {
        next.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = next
      setStream(next)
      setStatus('ready')
    } catch (err) {
      window.clearTimeout(timer)
      if (!valid()) return
      setError(describeCameraError(err))
      setStatus('error')
    } finally {
      // 只清理自己那一轮的 pending，别把后来那次 start 的标记抹掉
      if (seqRef.current === seq) pendingRef.current = false
    }
  }, [])

  const stop = useCallback(() => {
    // 序号 +1：正在进行的 start 作废，迟到的流会在 then 里被释放
    seqRef.current += 1
    pendingRef.current = false
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setStream(null)
    setStatus('idle')
  }, [])

  const retry = useCallback(() => {
    setError(null)
    setStatus('idle')
    void start()
  }, [start])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !stream) return
    video.srcObject = stream
    void video.play().catch(() => {
      // 自动播放被拦时忽略：静音视频通常不会触发，真触发也只是无画面
    })
    return () => {
      video.srcObject = null
    }
  }, [stream])

  return { videoRef, stream, status, error, start, stop, retry }
}
