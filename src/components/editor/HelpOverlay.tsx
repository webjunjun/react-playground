import { useEffect, useState } from 'react'

/**
 * 快捷键帮助浮层（DEV-PLAN A4 / PRD 5.2）
 * `?` 键或 Shift+/ 打开，Esc 或点击遮罩关闭
 */
export function HelpOverlay() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const isTyping =
        target?.isContentEditable ||
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT'

      const isHelpKey = e.key === '?' || (e.key === '/' && e.shiftKey)
      if (e.repeat && isHelpKey) return

      if (open) {
        if (e.code === 'Escape') setOpen(false)
        return
      }

      // 非输入态：? 或 Shift+/ 触发
      if (isTyping) return
      if (isHelpKey) {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  if (!open) return null

  return (
    <div className="help-backdrop" onClick={() => setOpen(false)}>
      <div
        className="help-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="help-title">快捷键</h3>
        <table className="help-table">
          <thead>
            <tr>
              <th>快捷键</th>
              <th>功能</th>
            </tr>
          </thead>
          <tbody>
            <tr><td><kbd>W</kbd></td><td>平移模式</td></tr>
            <tr><td><kbd>E</kbd></td><td>旋转模式</td></tr>
            <tr><td><kbd>R</kbd></td><td>缩放模式</td></tr>
            <tr><td><kbd>Delete</kbd></td><td>删除选中对象</td></tr>
            <tr><td><kbd>Ctrl</kbd> + <kbd>D</kbd></td><td>复制选中对象</td></tr>
            <tr><td><kbd>Ctrl</kbd> + <kbd>Z</kbd></td><td>撤销</td></tr>
            <tr><td><kbd>Ctrl</kbd> + <kbd>Y</kbd> 或 <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd></td><td>重做</td></tr>
            <tr><td><kbd>?</kbd></td><td>显示本帮助</td></tr>
          </tbody>
        </table>
        <div className="help-hint">按 <kbd>Esc</kbd> 或点击外部关闭</div>
      </div>
    </div>
  )
}
