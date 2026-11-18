import { create } from 'zustand'
import type {
  EnvironmentKey,
  GroundConfig,
  HistoryEntry,
  PrimitiveType,
  SceneObject,
  TransformMode,
} from '@/types/editor'
import { MOCK_OBJECTS } from '@/components/editor/presets'
import { createCopyObject, createSceneObject } from '@/lib/objectFactory'
import { serializeScene, writeAutosave, type SceneFile } from '@/lib/sceneIO'

/** 历史快照上限（PRD 7.1：最多保留 50 条，超出丢弃最旧） */
const MAX_HISTORY = 50

interface EditorState {
  /** 场景对象：全应用唯一数据源 */
  objects: SceneObject[]
  selectedId: string | null
  mode: TransformMode
  ground: GroundConfig
  env: EnvironmentKey
  /** 历史快照：history[0] 为初始场景，historyIndex 指向当前状态 */
  history: HistoryEntry[]
  historyIndex: number

  select: (id: string | null) => void
  setMode: (mode: TransformMode) => void
  /** 局部更新地面配置，未传字段保持原值 */
  setGround: (patch: Partial<GroundConfig>) => void
  setEnv: (env: EnvironmentKey) => void
  /** 按类型添加对象并自动选中（PRD 4.3） */
  addObject: (type: PrimitiveType) => void
  /** 局部更新对象属性（PRD 4.6），不可改 id / type；静默写入，不产生快照 */
  updateObject: (id: string, patch: Partial<Omit<SceneObject, 'id' | 'type'>>) => void
  /** 切换对象显隐；产生历史快照 */
  toggleVisible: (id: string) => void
  /** 删除对象；若删的是选中项则清空选中（PRD 4.7） */
  removeObject: (id: string) => void
  /** 复制对象并选中副本（PRD 4.7） */
  duplicateObject: (id: string) => void
  /** 清空场景对象与选中 */
  clearScene: () => void
  /** 把当前状态提交为一条历史快照（Gizmo 松手、属性提交等时机） */
  commitHistory: () => void
  undo: () => void
  redo: () => void
  /** 用导入的 SceneFile 替换当前场景；清空历史栈，仅保留当前状态一条 */
  replaceScene: (file: SceneFile) => void
  /** 切换对象锁定状态；产生历史快照 */
  toggleLock: (id: string) => void
}

type SnapshotFields = Pick<EditorState, 'objects' | 'selectedId' | 'history' | 'historyIndex'>

/** 在 historyIndex 处截断重做分支，追加新快照并限制上限 */
function pushSnapshot(
  state: EditorState,
  next: { objects: SceneObject[]; selectedId: string | null },
): SnapshotFields {
  const history = [
    ...state.history.slice(0, state.historyIndex + 1),
    { objects: next.objects, selectedId: next.selectedId },
  ]
  const trimmed =
    history.length > MAX_HISTORY ? history.slice(history.length - MAX_HISTORY) : history
  return {
    objects: next.objects,
    selectedId: next.selectedId,
    history: trimmed,
    historyIndex: trimmed.length - 1,
  }
}

const initialSelectedId = MOCK_OBJECTS[0]?.id ?? null

export const useEditorStore = create<EditorState>((set) => ({
  objects: MOCK_OBJECTS,
  selectedId: initialSelectedId,
  mode: 'translate',
  ground: { visible: true, color: '#475569' },
  env: 'day',
  history: [{ objects: MOCK_OBJECTS, selectedId: initialSelectedId }],
  historyIndex: 0,

  select: (id) => set({ selectedId: id }),
  setMode: (mode) => set({ mode }),
  setGround: (patch) => set((state) => ({ ground: { ...state.ground, ...patch } })),
  setEnv: (env) => set({ env }),
  addObject: (type) =>
    set((state) => {
      const object = createSceneObject(type, state.objects)
      return pushSnapshot(state, { objects: [...state.objects, object], selectedId: object.id })
    }),
  updateObject: (id, patch) =>
    set((state) => ({
      objects: state.objects.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    })),
  toggleVisible: (id) =>
    set((state) => {
      const target = state.objects.find((o) => o.id === id)
      if (!target) return state
      const next = state.objects.map((o) =>
        o.id === id ? { ...o, visible: !o.visible } : o,
      )
      return pushSnapshot(state, { objects: next, selectedId: state.selectedId })
    }),
  removeObject: (id) =>
    set((state) => {
      if (!state.objects.some((o) => o.id === id)) return state
      return pushSnapshot(state, {
        objects: state.objects.filter((o) => o.id !== id),
        selectedId: state.selectedId === id ? null : state.selectedId,
      })
    }),
  duplicateObject: (id) =>
    set((state) => {
      const source = state.objects.find((o) => o.id === id)
      if (!source) return state
      const copy = createCopyObject(source)
      return pushSnapshot(state, { objects: [...state.objects, copy], selectedId: copy.id })
    }),
  clearScene: () =>
    set((state) => {
      if (state.objects.length === 0) return state
      return pushSnapshot(state, { objects: [], selectedId: null })
    }),
  commitHistory: () =>
    set((state) => {
      const top = state.history[state.historyIndex]
      // 与栈顶完全一致（引用比较）时视为无变化，避免空快照
      if (top && top.objects === state.objects && top.selectedId === state.selectedId) {
        return state
      }
      const result = pushSnapshot(state, {
        objects: state.objects,
        selectedId: state.selectedId,
      })
      // PRD 4.9：每次产生历史快照时静默写 localStorage 自动草稿
      writeAutosave(serializeScene(result.objects, state.env, state.ground))
      return result
    }),
  undo: () =>
    set((state) => {
      if (state.historyIndex <= 0) return state
      const index = state.historyIndex - 1
      const entry = state.history[index]
      return { objects: entry.objects, selectedId: entry.selectedId, historyIndex: index }
    }),
  redo: () =>
    set((state) => {
      if (state.historyIndex >= state.history.length - 1) return state
      const index = state.historyIndex + 1
      const entry = state.history[index]
      return { objects: entry.objects, selectedId: entry.selectedId, historyIndex: index }
    }),
  replaceScene: (file) =>
    set(() => {
      const { objects, environment } = file
      const freshEntry: HistoryEntry = { objects, selectedId: null }
      // 导入后也写一次 autosave，覆盖旧草稿
      writeAutosave(serializeScene(objects, environment.sky, environment.ground))
      return {
        objects,
        selectedId: null,
        env: environment.sky,
        ground: environment.ground,
        history: [freshEntry],
        historyIndex: 0,
      }
    }),
  toggleLock: (id) =>
    set((state) => {
      const target = state.objects.find((o) => o.id === id)
      if (!target) return state
      const next = state.objects.map((o) =>
        o.id === id ? { ...o, locked: !o.locked } : o,
      )
      return pushSnapshot(state, { objects: next, selectedId: state.selectedId })
    }),
}))
