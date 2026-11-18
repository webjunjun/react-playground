import { Play, Pause, Plus } from 'lucide-react'
import { useEditorStore } from '@/store/editor'

const RULER_TICKS = ['0s', '1s', '2s', '3s', '4s', '5s']

/** 播放头位置（轨道区起点偏移 92px = 轨道名 84px + 间距 8px） */
const PLAYHEAD_LEFT = 'calc(92px + (100% - 92px) * 0.4)'

/** 时间轴（PRD 6.4 的 UI 壳）：轨道区独立滚动，不随对象增多挤压画布 */
export function Timeline() {
  const objects = useEditorStore((s) => s.objects)

  return (
    <section className="timeline">
      <div className="timeline-toolbar">
        <button className="icon-btn" title="播放">
          <Play size={13} strokeWidth={2} />
        </button>
        <button className="icon-btn" title="暂停">
          <Pause size={13} strokeWidth={2} />
        </button>
        <div className="toolbar-divider" />
        <button className="timeline-add-btn" title="在当前时间添加关键帧">
          <Plus size={12} strokeWidth={2} />
          <span>添加关键帧</span>
        </button>
        <span className="timeline-object">动画对象: 示例方块</span>
        <span className="timeline-duration">时长 5s · 1×</span>
      </div>

      <div className="timeline-body">
        <div className="timeline-ruler">
          {RULER_TICKS.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>

        {objects.map((o) => {
          const keyframes =
            o.id === 'obj_demo_box'
              ? [
                  { left: '20%', title: '关键帧 @ 1s' },
                  { left: '60%', title: '关键帧 @ 3s' },
                ]
              : []
          return (
            <div className="timeline-track" key={o.id}>
              <span className="track-label">{o.name}</span>
              <div className="track-lane">
                {keyframes.map((kf) => (
                  <span key={kf.left} className="keyframe" style={{ left: kf.left }} title={kf.title} />
                ))}
              </div>
            </div>
          )
        })}

        {/* 播放头（静态展示） */}
        <div className="playhead" style={{ left: PLAYHEAD_LEFT }} />
      </div>
    </section>
  )
}
