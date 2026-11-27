import { AlertTriangle } from 'lucide-react'
import type { CameraError } from './camera'

interface CameraNoticeProps {
  error: CameraError
  onRetry: () => void
  onUseMouse: () => void
}

export default function CameraNotice({ error, onRetry, onUseMouse }: CameraNoticeProps) {
  return (
    <div className="gesture-notice" role="alert">
      <div className="gesture-notice-head">
        <AlertTriangle size={15} strokeWidth={1.7} />
        <span>{error.title}</span>
      </div>
      <p className="gesture-notice-detail">{error.detail}</p>
      <div className="gesture-notice-actions">
        <button className="gesture-btn gesture-btn-primary" onClick={onRetry} type="button">
          重试
        </button>
        <button className="gesture-btn" onClick={onUseMouse} type="button">
          用鼠标模式
        </button>
      </div>
    </div>
  )
}
