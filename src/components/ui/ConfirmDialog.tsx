import { useEffect, type ReactNode } from 'react'

/**
 * 通用二次确认弹窗
 * 遮罩点击 / Esc / 取消按钮 → onCancel；确认按钮 → onConfirm
 * 支持通过 children 插入额外表单控件（如重命名输入框）
 */
export function ConfirmDialog({
  title,
  message,
  children,
  confirmLabel = '确定',
  cancelLabel = '取消',
  danger = false,
  autoFocusCancel = true,
  onCancel,
  onConfirm,
}: {
  title: string
  message?: string
  children?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  autoFocusCancel?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div className="confirm-backdrop" onClick={onCancel}>
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="confirm-title">{title}</h3>
        {message && <p>{message}</p>}
        {children}
        <div className="confirm-actions">
          <button className="confirm-btn" onClick={onCancel} autoFocus={autoFocusCancel}>
            {cancelLabel}
          </button>
          <button
            className={`confirm-btn ${danger ? 'danger' : 'primary'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
