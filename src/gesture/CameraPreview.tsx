import type { RefObject } from 'react'
import { Camera } from 'lucide-react'
import type { CameraStatus } from './useCamera'
import type { HandFrame } from './useHandTracker'
import HandSkeleton from './HandSkeleton'

interface CameraPreviewProps {
  videoRef: RefObject<HTMLVideoElement | null>
  status: CameraStatus
  onStart: () => void
  frameRef?: RefObject<HandFrame>
}

export default function CameraPreview({ videoRef, status, onStart, frameRef }: CameraPreviewProps) {
  const live = status === 'ready'

  return (
    <div className={`gesture-cam${live ? ' is-live' : ''}`}>
      <video
        ref={videoRef}
        className="gesture-cam-video"
        autoPlay
        muted
        playsInline
        aria-label="摄像头预览"
      />

      {live && frameRef && <HandSkeleton frameRef={frameRef} />}

      {!live && (
        <button
          className="gesture-cam-trigger"
          onClick={onStart}
          disabled={status === 'starting'}
          type="button"
        >
          <Camera size={15} strokeWidth={1.6} />
          <span>{status === 'starting' ? '启动中' : '开启摄像头'}</span>
        </button>
      )}

      <span className="gesture-cam-tag">CAM</span>
      {live && <span className="gesture-cam-live" title="摄像头已开启" />}
    </div>
  )
}
