import { useViewStore, type ShadeKey, type ViewKey } from '@/store/view'

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

/** 画布视图控制条：相机视角 + 着色模式（DEV-PLAN A1） */
export function Viewbar() {
  const view = useViewStore((s) => s.view)
  const shade = useViewStore((s) => s.shade)
  const setView = useViewStore((s) => s.setView)
  const setShade = useViewStore((s) => s.setShade)

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
    </div>
  )
}
