import { useEffect, useRef, useState } from 'react'
import type { ComponentType, SVGProps } from 'react'
import {
  Palette,
  Move3D,
  RotateCcw,
  Maximize2,
  Undo2,
  Redo2,
  Trash2,
  FolderOpen,
  Save,
  Download,
  Image,
  ImageOff,
  FileCode,
} from 'lucide-react'
import type { TransformMode } from '@/types/editor'
import { useEditorStore } from '@/store/editor'
import { useViewStore } from '@/store/view'
import { useAssetsStore } from '@/store/assets'
import {
  buildExportFilename,
  parseSceneJSON,
  serializeScene,
  triggerJSONDownload,
  type SceneFile,
} from '@/lib/sceneIO'
import { toast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

type LucideIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number }>

const MODES: {
  value: TransformMode
  label: string
  hotkey: string
  Icon: LucideIcon
}[] = [
  { value: 'translate', label: '平移(W)', hotkey: 'W', Icon: Move3D },
  { value: 'rotate', label: '旋转(E)', hotkey: 'E', Icon: RotateCcw },
  { value: 'scale', label: '缩放(R)', hotkey: 'R', Icon: Maximize2 },
]

/** 工具栏：变换模式三按钮读写 store.mode，并支持 W/E/R、Delete、Ctrl+D 快捷键；导出 / 导入 JSON */
export function Toolbar() {
  const mode = useEditorStore((s) => s.mode)
  const setMode = useEditorStore((s) => s.setMode)
  const clearScene = useEditorStore((s) => s.clearScene)
  const undo = useEditorStore((s) => s.undo)
  const redo = useEditorStore((s) => s.redo)
  const canUndo = useEditorStore((s) => s.historyIndex > 0)
  const canRedo = useEditorStore((s) => s.historyIndex < s.history.length - 1)
  const replaceScene = useEditorStore((s) => s.replaceScene)
  const [confirmOpen, setConfirmOpen] = useState(false)
  // 解析成功但待用户确认的导入文件
  const [pendingImport, setPendingImport] = useState<SceneFile | null>(null)

  const handleClear = () => {
    clearScene()
    setConfirmOpen(false)
  }

  const handleImportConfirm = () => {
    if (!pendingImport) return
    replaceScene(pendingImport)
    toast.success(`已导入 ${pendingImport.objects.length} 个对象`)
    setPendingImport(null)
  }

  return (
    <>
    <header className="toolbar">
      <div className="toolbar-left">
        <div className="toolbar-brand">
          <Palette size={18} strokeWidth={2} />
          <span>3D 编辑器</span>
        </div>
      </div>

      <div className="toolbar-center">
        <div className="mode-group">
          {MODES.map((m) => {
            const Icon = m.Icon
            return (
              <button
                key={m.value}
                className={`mode-btn ${mode === m.value ? 'active' : ''}`}
                onClick={() => setMode(m.value)}
                title={`${m.label}模式 · 热键 ${m.hotkey}`}
              >
                <Icon size={16} strokeWidth={2} className="mode-icon" />
                <span className="mode-label">{m.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="toolbar-right">
        <button
          className="toolbar-btn"
          title="撤销 (Ctrl+Z)"
          disabled={!canUndo}
          onClick={undo}
        >
          <Undo2 size={14} strokeWidth={2} />
          <span>撤销</span>
        </button>
        <button
          className="toolbar-btn"
          title="重做 (Ctrl+Y)"
          disabled={!canRedo}
          onClick={redo}
        >
          <Redo2 size={14} strokeWidth={2} />
          <span>重做</span>
        </button>

        <div className="toolbar-divider" />

        <OpenButton onParsed={setPendingImport} />

        <SaveMenu />

        <div className="toolbar-divider" />

        <button
          className="toolbar-btn danger"
          title="清空场景"
          onClick={() => setConfirmOpen(true)}
        >
          <Trash2 size={14} strokeWidth={2} />
          <span>清空</span>
        </button>
      </div>
    </header>

    {confirmOpen && (
      <ConfirmDialog
        title="清空场景"
        message="确定要清空整个场景吗？此操作可通过撤销恢复。"
        confirmLabel="确认清空"
        danger
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleClear}
      />
    )}

    {pendingImport && (
      <ConfirmDialog
        title="导入场景"
        message={`导入将替换当前未保存的场景（${pendingImport.objects.length} 个对象），继续？`}
        confirmLabel="确认导入"
        onCancel={() => setPendingImport(null)}
        onConfirm={handleImportConfirm}
      />
    )}

    {/* 快捷键监听（W/E/R / Delete / Ctrl+D / Ctrl+Z / Ctrl+Y） */}
    <Hotkeys confirmOpen={confirmOpen || !!pendingImport} setMode={setMode} />
    </>
  )
}

/* ==================== 打开按钮（触发隐藏 file input） ==================== */

function OpenButton({ onParsed }: { onParsed: (file: SceneFile) => void }) {
  const fileRef = useRef<HTMLInputElement | null>(null)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // 清空 input，让下次选同一个文件也能触发 change
    e.target.value = ''
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      const parsed = parseSceneJSON(text)
      if (!parsed) {
        toast.error('文件格式不正确或版本不匹配')
        return
      }
      // 校验通过后不直接替换，先交由工具栏弹二次确认
      onParsed(parsed)
    }
    reader.onerror = () => {
      toast.error('文件读取失败')
    }
    reader.readAsText(file)
  }

  return (
    <>
      <button
        className="toolbar-btn"
        title="打开 JSON 场景文件"
        onClick={() => fileRef.current?.click()}
      >
        <FolderOpen size={14} strokeWidth={2} />
        <span>打开</span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={handleFile}
      />
    </>
  )
}

/* ==================== 保存下拉菜单 ==================== */

function SaveMenu() {
  const [open, setOpen] = useState(false)

  const handleExport = () => {
    // 导出只需读当前值，不需要订阅变化；直接 getState 避免 selector 返回新对象触发无限循环
    const { objects, env, ground } = useEditorStore.getState()
    const { assets } = useAssetsStore.getState()
    const assetIds = new Set(assets.map((a) => a.id))
    const missing = objects.filter(
      (o) => o.type === 'model' && !assetIds.has(o.asset),
    ).length

    const file = serializeScene(objects, env, ground)
    triggerJSONDownload(JSON.stringify(file, null, 2), buildExportFilename())
    // A5-05：缺失资产照常导出，但提醒接收方准备同名文件
    if (missing > 0) {
      toast.info(
        `已导出，但含 ${missing} 个缺失资产实例，接收方需在约定目录准备同名模型文件`,
        3600,
      )
    } else {
      toast.success('场景已导出为 JSON')
    }
    setOpen(false)
  }

  return (
    <div className="menu-wrapper">
      <button
        className="toolbar-btn"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        title="保存场景"
      >
        <Save size={14} strokeWidth={2} />
        <span>保存</span>
      </button>

      {open && (
        <div className="toolbar-menu" role="menu">
          <button
            onMouseDown={(e) => {
              e.preventDefault()
              handleExport()
            }}
          >
            <Download size={14} strokeWidth={2} />
            <span>导出 JSON</span>
          </button>
          {/* 渲染导出（P2 6.5） */}
          <button
            onMouseDown={(e) => {
              e.preventDefault()
              setOpen(false)
            }}
          >
            <Image size={14} strokeWidth={2} />
            <span>PNG 截图</span>
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault()
              setOpen(false)
            }}
          >
            <ImageOff size={14} strokeWidth={2} />
            <span>PNG(透明背景)</span>
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault()
              setOpen(false)
            }}
          >
            <FileCode size={14} strokeWidth={2} />
            <span>静态 HTML</span>
          </button>
        </div>
      )}
    </div>
  )
}

/* ==================== 快捷键监听 ==================== */

function Hotkeys({
  confirmOpen,
  setMode,
}: {
  confirmOpen: boolean
  setMode: (mode: TransformMode) => void
}) {
  useEffect(() => {
    // 弹窗打开时只保留弹窗自己的 Escape 处理，避免误删/误切换
    if (confirmOpen) return

    const HOTKEYS: Record<string, TransformMode> = {
      KeyW: 'translate',
      KeyE: 'rotate',
      KeyR: 'scale',
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const isTyping =
        target?.isContentEditable ||
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT'
      if (isTyping) return

      const state = useEditorStore.getState()
      const selected = state.objects.find((o) => o.id === state.selectedId)
      const isMod = e.ctrlKey || e.metaKey

      // 撤销 / 重做；输入框内已在上面直接返回，保留原生文本撤销
      if (isMod && !e.altKey && e.code === 'KeyZ') {
        e.preventDefault()
        if (e.shiftKey) state.redo()
        else state.undo()
        return
      }
      if (isMod && !e.altKey && e.code === 'KeyY') {
        e.preventDefault()
        state.redo()
        return
      }

      // 复制
      if (isMod && e.code === 'KeyD') {
        if (e.altKey || e.shiftKey || e.repeat) return
        e.preventDefault()
        if (selected) state.duplicateObject(selected.id)
        return
      }

      // 删除（锁定对象需先解锁，PRD 4.6）
      if (e.code === 'Delete') {
        if (!selected || selected.locked) return
        e.preventDefault()
        state.removeObject(selected.id)
        return
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return

      // 吸附开关（DEV-PLAN A4-07）：忽略长按重复
      if (e.code === 'KeyG') {
        if (e.repeat) return
        useViewStore.getState().toggleSnap()
        return
      }

      const next = HOTKEYS[e.code]
      if (next) setMode(next)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setMode, confirmOpen])

  return null
}
