import { useEffect, useState } from 'react'
import { Toolbar } from '@/components/editor/Toolbar'
import { Sidebar } from '@/components/editor/Sidebar'
import { PropertiesPanel } from '@/components/editor/PropertiesPanel'
import { Scene } from '@/components/editor/Scene'
import { Viewbar } from '@/components/editor/Viewbar'
import { Timeline } from '@/components/editor/Timeline'
import { StatusBar } from '@/components/editor/StatusBar'
import { HelpOverlay } from '@/components/editor/HelpOverlay'
import { ToastViewport, toast } from '@/components/ui/Toast'
import { clearAutosave, readAutosave, type SceneFile } from '@/lib/sceneIO'
import { useEditorStore } from '@/store/editor'
import '@/assets/styles/editor.css'

/**
 * 编辑器页面（PRD 3.1 三栏布局）
 * 场景数据统一来自 editor store；页面只负责布局
 * 挂载时检测 localStorage 自动草稿，提示恢复
 */
export default function Editor() {
  const [draft, setDraft] = useState<SceneFile | null>(null)
  const replaceScene = useEditorStore((s) => s.replaceScene)

  // 挂载时检查是否有自动草稿（PRD 4.9）
  useEffect(() => {
    const saved = readAutosave()
    if (saved) setDraft(saved)
  }, [])

  const handleRestore = () => {
    if (!draft) return
    replaceScene(draft)
    clearAutosave()
    toast.success(`已恢复 ${draft.objects.length} 个对象`)
    setDraft(null)
  }

  const handleDiscardDraft = () => {
    // 用户选择"不恢复"：保留草稿在 localStorage，下次进来还提示（PRD 未指定清除）
    setDraft(null)
  }

  return (
    <div className="editor-layout">
      <Toolbar />

      <div className="editor-main">
        <Sidebar />

        <div className="editor-canvas">
          <div className="canvas-frame">
            <Scene />
            <Viewbar />
          </div>
        </div>

        <PropertiesPanel />
      </div>

      <Timeline />

      <StatusBar />

      <ToastViewport />

      <HelpOverlay />

      {draft && (
        <DraftRestoreDialog
          objectCount={draft.objects.length}
          onConfirm={handleRestore}
          onCancel={handleDiscardDraft}
        />
      )}
    </div>
  )
}

/* ==================== 自动草稿恢复确认弹窗 ==================== */

function DraftRestoreDialog({
  objectCount,
  onConfirm,
  onCancel,
}: {
  objectCount: number
  onConfirm: () => void
  onCancel: () => void
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
        aria-labelledby="draft-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="draft-title">恢复上次编辑</h3>
        <p>
          检测到一份自动草稿（{objectCount} 个对象），是否恢复？
        </p>
        <div className="confirm-actions">
          <button className="confirm-btn" onClick={onCancel} autoFocus>
            不恢复
          </button>
          <button className="confirm-btn" onClick={onConfirm}>
            恢复草稿
          </button>
        </div>
      </div>
    </div>
  )
}
