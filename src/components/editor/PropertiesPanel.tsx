import { Fragment, useRef, useState } from 'react'
import { RotateCcw, ChevronDown, ChevronRight } from 'lucide-react'
import type { Vector3Tuple } from 'three'
import { useEditorStore } from '@/store/editor'
import { useAssetsStore } from '@/store/assets'
import { toast } from '@/components/ui/Toast'
import type {
  MaterialConfig,
  MaterialType,
  PrimitiveObject,
} from '@/types/editor'
import { getModelDefaults } from '@/lib/objectFactory'
import { PRIMITIVE_DEFAULTS } from './presets'

/** 环境预设（P1 5.5），默认日间 */
const ENV_PRESETS = [
  { key: 'day', label: '日间', sky: 'Sun + Sky', grid: '显示', shadow: '启用' },
  { key: 'night', label: '夜晚', sky: '深色渐变', grid: '显示', shadow: '启用' },
  { key: 'studio', label: '工作室', sky: '纯色浅灰', grid: '隐藏', shadow: '启用' },
  { key: 'none', label: '无', sky: '透明', grid: '隐藏', shadow: '禁用' },
] as const

/** 资产文件大小展示：B / KB / MB */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * 属性面板：选中对象、环境、地面读写 store；
 * 对象字段的提交逻辑见 DEV-PLAN #5
 */
export function PropertiesPanel() {
  const object = useEditorStore(
    (s) => s.objects.find((o) => o.id === s.selectedId) ?? null,
  )
  const asset = useAssetsStore((s) =>
    s.assets.find((item) => item.id === (object?.type === 'model' ? object.asset : '')),
  )
  const assetsStatus = useAssetsStore((s) => s.status)
  const defaults =
    object?.type === 'model' ? getModelDefaults(asset) : object ? PRIMITIVE_DEFAULTS[object.type] : null
  const ground = useEditorStore((s) => s.ground)
  const setGround = useEditorStore((s) => s.setGround)
  const env = useEditorStore((s) => s.env)
  const setEnv = useEditorStore((s) => s.setEnv)
  const updateObject = useEditorStore((s) => s.updateObject)
  const commitHistory = useEditorStore((s) => s.commitHistory)
  const currentEnv = ENV_PRESETS.find((e) => e.key === env)!

  return (
    <aside className="properties-panel">
      {/* 全局环境设置区（P1 5.5：属性面板顶部） */}
      <section className="env-section">
        <div className="panel-section-title">环境</div>
        <div className="env-chips">
          {ENV_PRESETS.map((e) => (
            <button
              key={e.key}
              className={`env-chip ${env === e.key ? 'active' : ''}`}
              onClick={() => setEnv(e.key)}
            >
              {e.label}
            </button>
          ))}
        </div>
        <div className="env-detail">
          <span>天空: {currentEnv.sky}</span>
          <span>网格: {currentEnv.grid}</span>
          <span>阴影: {currentEnv.shadow}</span>
        </div>

        {/* 地面配置：默认场景环境元素（PRD 3.3），非场景对象 */}
        <div className="env-ground">
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={ground.visible}
              onChange={(e) => setGround({ visible: e.target.checked })}
            />
            <span>地面</span>
          </label>
          <input
            type="color"
            value={ground.color}
            disabled={!ground.visible}
            onChange={(e) => setGround({ color: e.target.value })}
            title="地面颜色"
          />
        </div>
      </section>

      {!object ? (
        <div className="empty-hint">选中对象以编辑属性</div>
      ) : (
        <Fragment key={object.id}>
          <h3 className="panel-title">{object.name}</h3>

          {/* 名称：blur / Enter 提交，空值回退（PRD 4.6） */}
          <Field label="名称">
            <DraftInput
              value={object.name}
              maxLength={64}
              onCommit={(raw) => {
                const name = raw.trim()
                if (name && name !== object.name) {
                  updateObject(object.id, { name })
                  commitHistory()
                }
              }}
            />
          </Field>

          {/* 模型实例：只读资产信息 + 缺失警示（PRD §3 M1 / M2 验收） */}
          {object.type === 'model' && (
            <>
              <Field label="资产">
                <span className="prop-readonly" title={asset?.fileName ?? object.file}>
                  {asset?.fileName ?? object.file}
                </span>
              </Field>
              <Field label="格式">
                <span className="prop-readonly">
                  {asset ? asset.format.toUpperCase() : '缺失'}
                </span>
              </Field>
              <Field label="大小">
                <span className="prop-readonly">
                  {asset ? formatFileSize(asset.size) : '—'}
                </span>
              </Field>
              {assetsStatus === 'ready' && !asset && (
                <div className="model-missing-warning">
                  <span>资产缺失，实例仅显示占位盒。</span>
                  <button
                    className="model-missing-action"
                    onClick={() =>
                      toast.info('请先在资源库重新导入同名文件；批量重链将在 A3 支持')
                    }
                  >
                    重新关联
                  </button>
                </div>
              )}
            </>
          )}

          {/* 颜色：取色器实时写入，失焦时提交一条历史快照；模型实例不适用 */}
          {object.type !== 'model' && (
            <Field label="颜色">
              <input
                type="color"
                value={object.color}
                disabled={object.material.type === 'normal'}
                style={{ width: 60 }}
                onChange={(e) => updateObject(object.id, { color: e.target.value })}
                onBlur={() => commitHistory()}
              />
            </Field>
          )}

          {/* 位置 */}
          <Vector3Field
            label="位置"
            values={object.position}
            step={0.01}
            onCommit={(axis, value) => {
              if (value === object.position[axis]) return
              const position = [...object.position] as Vector3Tuple
              position[axis] = value
              updateObject(object.id, { position })
              commitHistory()
            }}
            onReset={() => {
              const pos = defaults!.position
              updateObject(object.id, { position: [...pos] as Vector3Tuple })
              commitHistory()
            }}
          />

          {/* 旋转：弧度直接覆盖，不做归一化（PRD 7.3） */}
          <Vector3Field
            label="旋转 (弧度)"
            values={object.rotation}
            step={0.01}
            onCommit={(axis, value) => {
              if (value === object.rotation[axis]) return
              const rotation = [...object.rotation] as Vector3Tuple
              rotation[axis] = value
              updateObject(object.id, { rotation })
              commitHistory()
            }}
            onReset={() => {
              const rot = defaults!.rotation
              updateObject(object.id, { rotation: [...rot] as Vector3Tuple })
              commitHistory()
            }}
          />

          {/* 缩放：下限 0.01 */}
          <Vector3Field
            label="缩放"
            values={object.scale}
            step={0.1}
            min={0.01}
            onCommit={(axis, value) => {
              if (value === object.scale[axis]) return
              const scale = [...object.scale] as Vector3Tuple
              scale[axis] = value
              updateObject(object.id, { scale })
              commitHistory()
            }}
            onReset={() => {
              const sc = defaults!.scale
              updateObject(object.id, { scale: [...sc] as Vector3Tuple })
              commitHistory()
            }}
          />

          {/* 可见：取消后不渲染，但保持选中、仍在列表 */}
          <Field label="可见">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={object.visible}
                onChange={(e) => {
                  updateObject(object.id, { visible: e.target.checked })
                  commitHistory()
                }}
              />
              <span>{object.visible ? '渲染中' : '已隐藏'}</span>
            </label>
          </Field>

          {/* 锁定（PS 式图层锁：渲染但视口点选跳过，删除需先解锁，列表内仍可选中；绑定见 #16） */}
          <Field label="锁定">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={object.locked}
                onChange={() => {
                  useEditorStore.getState().toggleLock(object.id)
                }}
              />
              <span>{object.locked ? '已锁定 · 视口点选跳过' : '未锁定'}</span>
            </label>
          </Field>

          {/* 材质（P1 5.3）；模型实例保留资产原材质 */}
          {object.type !== 'model' && <MaterialSection object={object} />}
        </Fragment>
      )}
    </aside>
  )
}

/* ==================== 材质区 ==================== */

type NumericMaterialKey = 'shininess' | 'metalness' | 'roughness'

function MaterialSection({ object }: { object: PrimitiveObject }) {
  const updateObject = useEditorStore((s) => s.updateObject)
  const commitHistory = useEditorStore((s) => s.commitHistory)
  const { material } = object

  /** 所有类型共用一份扁平配置，切换类型不会丢失其他类型已调参数 */
  const patchMaterial = (patch: Partial<MaterialConfig>, commit = true) => {
    updateObject(object.id, { material: { ...material, ...patch } })
    if (commit) commitHistory()
  }

  /** 数字参数仅在 blur / Enter 提交；空值和非法数字回退，越界值夹紧 */
  const commitNumber = (
    key: NumericMaterialKey,
    raw: string,
    min: number,
    max?: number,
  ) => {
    if (raw.trim() === '') return
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return
    const value = Math.max(min, max === undefined ? parsed : Math.min(max, parsed))
    if (value === material[key]) return
    patchMaterial({ [key]: value } as Partial<MaterialConfig>)
  }

  return (
    <div className="material-section">
      <Field label="材质类型">
        <select
          value={material.type}
          onChange={(e) => patchMaterial({ type: e.target.value as MaterialType })}
        >
          <option value="basic">MeshBasicMaterial</option>
          <option value="phong">MeshPhongMaterial</option>
          <option value="standard">MeshStandardMaterial</option>
          <option value="normal">MeshNormalMaterial</option>
        </select>
      </Field>

      {material.type === 'basic' && (
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={material.wireframe}
            onChange={(e) => patchMaterial({ wireframe: e.target.checked })}
          />
          <span>线框 wireframe</span>
        </label>
      )}

      {material.type === 'phong' && (
        <>
          <Field label="高光强度 shininess">
            <DraftInput
              type="number"
              step={1}
              min={0}
              value={String(material.shininess)}
              onCommit={(raw) => commitNumber('shininess', raw, 0)}
            />
          </Field>
          <Field label="高光色 specular">
            <input
              type="color"
              value={material.specular}
              style={{ width: 60 }}
              onChange={(e) => patchMaterial({ specular: e.target.value }, false)}
              onBlur={() => commitHistory()}
            />
          </Field>
        </>
      )}

      {material.type === 'standard' && (
        <>
          <Field label="金属度 metalness">
            <DraftInput
              type="number"
              step={0.01}
              min={0}
              max={1}
              value={String(material.metalness)}
              onCommit={(raw) => commitNumber('metalness', raw, 0, 1)}
            />
          </Field>
          <Field label="粗糙度 roughness">
            <DraftInput
              type="number"
              step={0.01}
              min={0}
              max={1}
              value={String(material.roughness)}
              onCommit={(raw) => commitNumber('roughness', raw, 0, 1)}
            />
          </Field>
        </>
      )}

      {material.type === 'normal' && (
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={material.flatShading}
            onChange={(e) => patchMaterial({ flatShading: e.target.checked })}
          />
          <span>平面着色 flatShading</span>
        </label>
      )}
    </div>
  )
}

/* ==================== 通用字段 ==================== */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="prop-field">
      <label>{label}</label>
      <div className="prop-input">{children}</div>
    </div>
  )
}

interface DraftInputProps {
  value: string
  type?: 'text' | 'number'
  step?: number
  min?: number
  max?: number
  maxLength?: number
  style?: React.CSSProperties
  onCommit: (raw: string) => void
}

/**
 * 带草稿态的输入框：聚焦时自由输入，blur / Enter 提交，Escape 回退；
 * 未聚焦时跟随外部值（兼容 Gizmo 拖拽后的实时刷新）
 */
function DraftInput({
  value,
  type = 'text',
  step,
  min,
  max,
  maxLength,
  style,
  onCommit,
}: DraftInputProps) {
  const [draft, setDraft] = useState(value)
  const [focused, setFocused] = useState(false)
  const cancelling = useRef(false)

  return (
    <input
      type={type}
      // 未聚焦时直接显示外部值，聚焦时显示草稿（外部变更无需 effect 同步）
      value={focused ? draft : value}
      step={step}
      min={min}
      max={max}
      maxLength={maxLength}
      style={style}
      onFocus={() => {
        setDraft(value)
        setFocused(true)
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setFocused(false)
        // Escape 已放弃本次编辑，不再提交
        if (cancelling.current) {
          cancelling.current = false
          return
        }
        onCommit(draft)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          cancelling.current = true
          e.currentTarget.blur()
        }
      }}
    />
  )
}

interface Vector3FieldProps {
  label: string
  values: Vector3Tuple
  step?: number
  min?: number
  onCommit: (axis: number, value: number) => void
  onReset: () => void
}

function Vector3Field({
  label,
  values,
  step = 0.01,
  min,
  onCommit,
  onReset,
}: Vector3FieldProps) {
  const [open, setOpen] = useState(true)
  const axes: ('X' | 'Y' | 'Z')[] = ['X', 'Y', 'Z']
  const colors = ['#ef4444', '#22c55e', '#3b82f6']

  return (
    <div className="prop-field">
      <div className="vec3-header">
        <label>{label}</label>
        <span className="vec3-header-actions" onClick={(e) => e.stopPropagation()}>
          <button
            className="icon-btn"
            title="重置为默认值"
            onClick={onReset}
          >
            <RotateCcw size={11} strokeWidth={2} />
          </button>
        </span>
        <span style={{ cursor: 'pointer' }} onClick={() => setOpen((v) => !v)}>
          {open ? (
            <ChevronDown size={12} strokeWidth={2} className="chev" />
          ) : (
            <ChevronRight size={12} strokeWidth={2} className="chev" />
          )}
        </span>
      </div>

      {open && (
        <div className="vec3-row">
          {axes.map((axis, i) => (
            <div key={axis} className="vec3-input">
              <span className="vec3-axis" style={{ color: colors[i] }}>
                {axis}
              </span>
              <DraftInput
                type="number"
                step={step}
                min={min}
                value={String(Number(values[i].toFixed(4)))}
                onCommit={(raw) => {
                  const n = Number(raw)
                  // 空值 / 非法值不提交，失焦后回退原值
                  if (raw.trim() === '' || Number.isNaN(n)) return
                  onCommit(i, min !== undefined ? Math.max(min, n) : n)
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
