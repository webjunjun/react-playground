import { useEditorStore } from '@/store/editor'
import { useViewStore } from '@/store/view'

/** 底部状态栏 */
export function StatusBar() {
  const objectCount = useEditorStore((s) => s.objects.length)
  const selectedName = useEditorStore(
    (s) => s.objects.find((o) => o.id === s.selectedId)?.name ?? null,
  )
  const snapEnabled = useViewStore((s) => s.snapEnabled)
  const gridSize = useViewStore((s) => s.gridSize)

  return (
    <footer className="status-bar">
      <div className="status-hints">
        <span>W/E/R 切换模式</span>
        <span>Ctrl+D 复制</span>
        <span>Delete 删除</span>
        <span>G 吸附</span>
      </div>
      <div className="status-info">
        <span>对象数: {objectCount}</span>
        <span>吸附: {snapEnabled ? `开 · 网格 ${gridSize}` : '关'}</span>
        {selectedName && <span>已选: {selectedName}</span>}
      </div>
    </footer>
  )
}
