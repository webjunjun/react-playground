import { useEffect, useState } from 'react'
import { Toolbar } from '@/components/editor/Toolbar'
import { Sidebar } from '@/components/editor/Sidebar'
import { PropertiesPanel } from '@/components/editor/PropertiesPanel'
import { Scene } from '@/components/editor/Scene'
import { Viewbar } from '@/components/editor/Viewbar'
// import { Timeline } from '@/components/editor/Timeline'
import { StatusBar } from '@/components/editor/StatusBar'
import { HelpOverlay } from '@/components/editor/HelpOverlay'
import { ToastViewport, toast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { clearAutosave, readAutosave, type SceneFile } from '@/lib/sceneIO'
import { useEditorStore } from '@/store/editor'
import { useAssetsStore } from '@/store/assets'
import '@/assets/styles/editor.css'

/**
 * 编辑器页面（PRD 3.1 三栏布局）
 * 场景数据统一来自 editor store；页面只负责布局
 * 挂载时检测 localStorage 自动草稿，提示恢复
 */
export default function Editor() {
  const [draft, setDraft] = useState<SceneFile | null>(null)
  const replaceScene = useEditorStore((s) => s.replaceScene)
  const hydrateAssets = useAssetsStore((s) => s.hydrate)

  // 先恢复资产库，再检查自动草稿，避免模型实例先渲染成缺失态（PRD §3 M1）
  useEffect(() => {
    let cancelled = false
    void hydrateAssets().then(() => {
      if (cancelled) return
      const saved = readAutosave()
      if (saved) setDraft(saved)
    })
    return () => {
      cancelled = true
    }
  }, [hydrateAssets])

  const handleRestore = () => {
    if (!draft) return
    replaceScene(draft)
    clearAutosave()
    toast.success(`已恢复 ${draft.objects.length} 个对象`)
    setDraft(null)
  }

  /** 不恢复（按钮 / Esc / 点遮罩）：清理 localStorage 草稿 */
  const handleDiscardDraft = () => {
    clearAutosave()
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

      {/* <Timeline /> */}

      <StatusBar />

      <ToastViewport />

      <HelpOverlay />

      {draft && (
        <ConfirmDialog
          title="恢复上次编辑"
          message={`检测到一份自动草稿（${draft.objects.length} 个对象），是否恢复？`}
          cancelLabel="不恢复"
          confirmLabel="恢复草稿"
          onCancel={handleDiscardDraft}
          onConfirm={handleRestore}
        />
      )}
    </div>
  )
}
