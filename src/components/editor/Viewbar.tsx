import { Magnet } from 'lucide-react'
import {
  GRID_SIZES,
  useViewStore,
  type GridSize,
  type ShadeKey,
  type ViewKey,
} from '@/store/view'

const VIEWPOINTS: { key: ViewKey; label: string }[] = [
  { key: 'persp', label: '透视' },
  { key: 'front', label: '前' },
  { key: 'top', label: '顶' },
  { key: 'right', label: '右' },
]

const SHADE_MODES: { key: ShadeKey; label: string }[] = [
  { key: 'solid', label: '实体' },
  { key: 'wire', label: '线框' },
]

/** 画布视图控制条：相机视角 + 着色模式 + 吸附（DEV-PLAN A1 / A4） */
export function Viewbar() {
  const view = useViewStore((s) => s.view)
  const shade = useViewStore((s) => s.shade)
  const snapEnabled = useViewStore((s) => s.snapEnabled)
  const gridSize = useViewStore((s) => s.gridSize)
  const setView = useViewStore((s) => s.setView)
  const setShade = useViewStore((s) => s.setShade)
  const toggleSnap = useViewStore((s) => s.toggleSnap)
  const setGridSize = useViewStore((s) => s.setGridSize)

  return (
    <div className="viewbar">
      {VIEWPOINTS.map((v) => (
        <button
          key={v.key}
          className={`view-btn ${view === v.key ? 'active' : ''}`}
          onClick={() => setView(v.key)}
          title={v.key === 'persp' ? '透视相机' : '正交相机视图'}
        >
          {v.label}
        </button>
      ))}

      <div className="viewbar-divider" />

      {SHADE_MODES.map((s) => (
        <button
          key={s.key}
          className={`view-btn ${shade === s.key ? 'active' : ''}`}
          onClick={() => setShade(s.key)}
          title={s.key === 'solid' ? '实体着色' : '线框着色'}
        >
          {s.label}
        </button>
      ))}

      <div className="viewbar-divider" />

      {/* 吸附开关（DEV-PLAN A4-08） */}
      <button
        className={`view-btn view-btn-icon ${snapEnabled ? 'active' : ''}`}
        onClick={toggleSnap}
        title={`吸附 (G) · 当前${snapEnabled ? '开启' : '关闭'}`}
        aria-pressed={snapEnabled}
        aria-label="切换吸附"
      >
        <Magnet size={14} strokeWidth={2} />
      </button>

      {/* 网格大小下拉：同时驱动 Grid 与平移吸附步进 */}
      <select
        className="grid-size-select"
        value={gridSize}
        onChange={(e) => setGridSize(Number(e.target.value) as GridSize)}
        title="网格大小"
        aria-label="网格大小"
      >
        {GRID_SIZES.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
    </div>
  )
}
