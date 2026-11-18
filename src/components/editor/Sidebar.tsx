import { useState, useEffect, useRef } from 'react'
import { Copy, X, FolderInput, GripVertical, Lock, LockOpen } from 'lucide-react'
import { PRIMITIVE_PRESETS } from './presets'
import type { SceneObject } from '@/types/editor'
import { useEditorStore } from '@/store/editor'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

/** 侧栏：资源库卡片接添加行为；场景 Tab 的计数、选中与列表读写 store */
export function Sidebar() {
  const [tab, setTab] = useState<'library' | 'objects'>('library')
  const objectCount = useEditorStore((s) => s.objects.length)

  return (
    <aside className="sidebar">
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab ${tab === 'library' ? 'active' : ''}`}
          onClick={() => setTab('library')}
        >
          资源库
        </button>
        <button
          className={`sidebar-tab ${tab === 'objects' ? 'active' : ''}`}
          onClick={() => setTab('objects')}
        >
          场景 ({objectCount})
        </button>
      </div>

      <div className="sidebar-content">
        {tab === 'library' ? (
          <LibraryPanel />
        ) : (
          <ObjectTree />
        )}
      </div>
    </aside>
  )
}

/* ==================== 资源库（P0 + P1 卡片 / P2 导入模型） ==================== */

function LibraryPanel() {
  const addObject = useEditorStore((s) => s.addObject)

  return (
    <div className="library-grid">
      {PRIMITIVE_PRESETS.map((p) => {
        const Icon = p.Icon
        return (
          <button
            key={p.type}
            className="library-item"
            title={`添加${p.label}`}
            onClick={() => addObject(p.type)}
          >
            <Icon size={26} strokeWidth={1.8} className="library-icon" />
            <span className="library-label">{p.label}</span>
          </button>
        )
      })}

      {/* 导入模型（P2 6.1） */}
      <button className="library-item import-item" title="导入 GLB / GLTF 模型">
        <FolderInput size={26} strokeWidth={1.8} className="library-icon" />
        <span className="library-label">导入模型</span>
      </button>
    </div>
  )
}

/* ==================== 场景对象列表（分组见 DEV-PLAN #17，当前平铺） ==================== */

type DropPlacement = 'before' | 'after'
type RowDragHandler = (id: string, e: React.DragEvent<HTMLLIElement>) => void

/** 目标行上半部分插入其前，下半部分插入其后 */
function getDropPlacement(e: React.DragEvent<HTMLLIElement>): DropPlacement {
  const rect = e.currentTarget.getBoundingClientRect()
  return e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
}

function ObjectTree() {
  const objects = useEditorStore((s) => s.objects)
  const selectedId = useEditorStore((s) => s.selectedId)
  const onSelect = useEditorStore((s) => s.select)
  const reorderObject = useEditorStore((s) => s.reorderObject)
  const [keyword, setKeyword] = useState('')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{
    id: string
    placement: DropPlacement
  } | null>(null)

  const kw = keyword.trim().toLowerCase()
  const filtered = kw ? objects.filter((o) => o.name.toLowerCase().includes(kw)) : objects
  // 过滤只是局部视图，禁用排序可避免把局部索引误映射到全量数组
  const sortDisabled = kw.length > 0

  const clearDrag = () => {
    setDraggingId(null)
    setDropTarget(null)
  }

  const handleDragStart: RowDragHandler = (id, e) => {
    if (sortDisabled) {
      e.preventDefault()
      return
    }
    e.dataTransfer.setData('text/plain', id)
    e.dataTransfer.effectAllowed = 'move'
    setDraggingId(id)
    setDropTarget(null)
  }

  const handleDragOver: RowDragHandler = (id, e) => {
    if (sortDisabled || !draggingId) return
    e.preventDefault()
    if (draggingId === id) {
      e.dataTransfer.dropEffect = 'none'
      setDropTarget(null)
      return
    }
    e.dataTransfer.dropEffect = 'move'
    const placement = getDropPlacement(e)
    setDropTarget((current) =>
      current?.id === id && current.placement === placement
        ? current
        : { id, placement },
    )
  }

  const handleDrop: RowDragHandler = (id, e) => {
    if (sortDisabled || !draggingId) return
    e.preventDefault()
    const sourceId = draggingId
    const placement = getDropPlacement(e)
    clearDrag()
    if (sourceId !== id) reorderObject(sourceId, id, placement)
  }

  return (
    <>
      {/* 搜索过滤（DEV-PLAN A2） */}
      <div className="object-search">
        <input
          type="text"
          placeholder="搜索对象"
          maxLength={64}
          value={keyword}
          onChange={(e) => {
            setKeyword(e.target.value)
            clearDrag()
          }}
        />
      </div>

      <ul className="object-list">
        {filtered.map((object) => (
          <ObjectRow
            key={object.id}
            object={object}
            depth={0}
            selectedId={selectedId}
            onSelect={onSelect}
            dragging={draggingId === object.id}
            dropPlacement={dropTarget?.id === object.id ? dropTarget.placement : null}
            sortDisabled={sortDisabled}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragEnd={clearDrag}
          />
        ))}
      </ul>
    </>
  )
}

function ObjectRow({
  object,
  depth,
  selectedId,
  onSelect,
  dragging,
  dropPlacement,
  sortDisabled,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  object: SceneObject
  depth: number
  selectedId: string | null
  onSelect: (id: string) => void
  dragging: boolean
  dropPlacement: DropPlacement | null
  sortDisabled: boolean
  onDragStart: RowDragHandler
  onDragOver: RowDragHandler
  onDrop: RowDragHandler
  onDragEnd: () => void
}) {
  const duplicateObject = useEditorStore((s) => s.duplicateObject)
  const removeObject = useEditorStore((s) => s.removeObject)
  const toggleVisible = useEditorStore((s) => s.toggleVisible)
  const toggleLock = useEditorStore((s) => s.toggleLock)
  const updateObject = useEditorStore((s) => s.updateObject)
  const commitHistory = useEditorStore((s) => s.commitHistory)

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
  const renameInputRef = useRef<HTMLInputElement | null>(null)

  // 点击外部 / Esc 关闭右键菜单
  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(null)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') setMenu(null)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    onSelect(object.id)
    setMenu({ x: e.clientX, y: e.clientY })
  }

  const handleRenameClick = () => {
    setMenu(null)
    setRenameDraft(object.name)
    setRenameOpen(true)
  }

  // 弹窗打开时自动聚焦
  useEffect(() => {
    if (renameOpen) {
      renameInputRef.current?.focus()
    }
  }, [renameOpen])

  const handleRenameSubmit = () => {
    setRenameOpen(false)
    const name = renameDraft.trim()
    if (name && name !== object.name) {
      updateObject(object.id, { name })
      commitHistory()
    }
  }

  const handleRenameCancel = () => setRenameOpen(false)

  const handleDelete = () => {
    if (object.locked) return
    removeObject(object.id)
    setMenu(null)
  }

  return (
    <>
      <li
        key={object.id}
        className={`object-item depth-${depth} ${selectedId === object.id ? 'selected' : ''} ${dragging ? 'dragging' : ''} ${dropPlacement ? `drop-${dropPlacement}` : ''}`}
        onClick={() => onSelect(object.id)}
        onContextMenu={handleContextMenu}
        onDragStart={(e) => onDragStart(object.id, e)}
        onDragOver={(e) => onDragOver(object.id, e)}
        onDrop={(e) => onDrop(object.id, e)}
        onDragEnd={onDragEnd}
      >
        {/* 仅把手可发起拖拽，保留整行点击与右键行为（PRD 5.4） */}
        <span
          className={`object-drag-handle ${sortDisabled ? 'disabled' : ''}`}
          draggable={!sortDisabled}
          title={sortDisabled ? '清空搜索后可拖拽排序' : '拖拽排序'}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical size={12} strokeWidth={2} className="object-grip" />
        </span>

        <label className="object-visibility" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={object.visible}
            onChange={() => toggleVisible(object.id)}
          />
          <span className="color-dot" style={{ background: object.color }} />
        </label>

        <span className="object-name">{object.name}</span>

        {/* 锁定图标（DEV-PLAN A5：点击直接切换锁定状态） */}
        <span
          className={`object-lock-slot ${object.locked ? 'locked' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            toggleLock(object.id)
          }}
          title={
            object.locked
              ? '已锁定：视口点选跳过，解锁后可编辑删除'
              : '锁定后视口点选将跳过此对象'
          }
        >
          {object.locked ? (
            <Lock size={12} strokeWidth={2} />
          ) : (
            <LockOpen size={12} strokeWidth={2} />
          )}
        </span>

        <div className="object-actions" onClick={(e) => e.stopPropagation()}>
          <button
            title="复制"
            className="icon-btn"
            onClick={() => duplicateObject(object.id)}
          >
            <Copy size={13} strokeWidth={2} />
          </button>
          <button
            title={object.locked ? '请先解锁' : '删除'}
            className="icon-btn danger"
            disabled={object.locked}
            onClick={() => removeObject(object.id)}
          >
            <X size={13} strokeWidth={2.5} />
          </button>
        </div>
      </li>

      {/* 右键菜单（DEV-PLAN A5） */}
      {menu && (
        <div
          ref={menuRef}
          className="context-menu"
          style={{ top: menu.y, left: menu.x }}
          role="menu"
        >
          <button onClick={handleRenameClick}>重命名</button>
          <button
            onClick={() => {
              duplicateObject(object.id)
              setMenu(null)
            }}
          >
            复制
          </button>
          <button disabled title="成组将在分组 / 父子层级功能中实装（#17）">
            成组
          </button>
          <button
            onClick={() => {
              toggleLock(object.id)
              setMenu(null)
            }}
          >
            {object.locked ? '解锁' : '锁定'}
          </button>
          <div className="context-menu-divider" />
          <button
            className="danger"
            disabled={object.locked}
            onClick={handleDelete}
            title={object.locked ? '请先解锁再删除' : undefined}
          >
            删除
          </button>
        </div>
      )}

      {/* 重命名弹窗 */}
      {renameOpen && (
        <ConfirmDialog
          title="重命名对象"
          autoFocusCancel={false}
          onCancel={handleRenameCancel}
          onConfirm={handleRenameSubmit}
        >
          <input
            ref={renameInputRef}
            type="text"
            maxLength={64}
            className="confirm-input"
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameSubmit()
              else if (e.key === 'Escape') handleRenameCancel()
            }}
          />
        </ConfirmDialog>
      )}
    </>
  )
}
