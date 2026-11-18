import { useState, useEffect, useRef } from 'react'
import { Copy, X, FolderInput, GripVertical, Lock, LockOpen } from 'lucide-react'
import { PRIMITIVE_PRESETS } from './presets'
import type { SceneObject } from '@/types/editor'
import { useEditorStore } from '@/store/editor'

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

function ObjectTree() {
  const objects = useEditorStore((s) => s.objects)
  const selectedId = useEditorStore((s) => s.selectedId)
  const onSelect = useEditorStore((s) => s.select)
  const [keyword, setKeyword] = useState('')

  const kw = keyword.trim().toLowerCase()
  const filtered = kw ? objects.filter((o) => o.name.toLowerCase().includes(kw)) : objects

  return (
    <>
      {/* 搜索过滤（DEV-PLAN A2） */}
      <div className="object-search">
        <input
          type="text"
          placeholder="搜索对象"
          maxLength={64}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
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
}: {
  object: SceneObject
  depth: number
  selectedId: string | null
  onSelect: (id: string) => void
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
        className={`object-item depth-${depth} ${selectedId === object.id ? 'selected' : ''}`}
        onClick={() => onSelect(object.id)}
        onContextMenu={handleContextMenu}
      >
        {/* 拖拽排序把手（PRD 5.4 的 UI 壳，不接拖拽逻辑） */}
        <GripVertical size={12} strokeWidth={2} className="object-grip" />

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
        <div className="confirm-backdrop" onClick={handleRenameCancel}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>重命名对象</h3>
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
            <div className="confirm-actions">
              <button className="confirm-btn" onClick={handleRenameCancel}>取消</button>
              <button className="confirm-btn primary" onClick={handleRenameSubmit}>确定</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
