import { useEffect, useRef, type RefObject } from 'react'
import type { HandFrame } from './useHandTracker'

/** MediaPipe 手部骨架的 21 点连接表 */
const CONNECTIONS: Array<[number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
]

const TIPS = new Set([4, 8, 12, 16, 20])

interface HandSkeletonProps {
  frameRef: RefObject<HandFrame>
}

/**
 * 叠在摄像头小窗上的骨架。
 *
 * 两处坐标要跟视频对齐：
 * 1. 视频是镜像的（selfie 视角），x 要翻转；
 * 2. object-fit: cover 会裁切，得按同一条规则算缩放和偏移，否则骨架会飘。
 */
export default function HandSkeleton({ frameRef }: HandSkeletonProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let raf = 0

    const draw = () => {
      raf = requestAnimationFrame(draw)
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.max(1, Math.round(rect.width * dpr))
      const h = Math.max(1, Math.round(rect.height * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, rect.width, rect.height)

      const frame = frameRef.current
      const lms = frame?.landmarks
      if (!lms || lms.length < 21) return

      const vw = frame.videoWidth || 640
      const vh = frame.videoHeight || 480
      const scale = Math.max(rect.width / vw, rect.height / vh)
      const dw = vw * scale
      const dh = vh * scale
      const ox = (rect.width - dw) / 2
      const oy = (rect.height - dh) / 2

      const px = (x: number) => ox + (1 - x) * dw
      const py = (y: number) => oy + y * dh

      ctx.lineCap = 'round'
      ctx.lineWidth = 1.4
      ctx.strokeStyle = 'rgba(120, 226, 196, 0.78)'
      ctx.beginPath()
      for (const [a, b] of CONNECTIONS) {
        ctx.moveTo(px(lms[a].x), py(lms[a].y))
        ctx.lineTo(px(lms[b].x), py(lms[b].y))
      }
      ctx.stroke()

      ctx.fillStyle = 'rgba(232, 255, 247, 0.95)'
      for (let i = 0; i < lms.length; i++) {
        const r = TIPS.has(i) ? 2.1 : 1.4
        ctx.beginPath()
        ctx.arc(px(lms[i].x), py(lms[i].y), r, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [frameRef])

  return <canvas ref={canvasRef} className="gesture-cam-skeleton" aria-hidden />
}
