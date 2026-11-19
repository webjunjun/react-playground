import { create } from 'zustand'
import type {
  EnvironmentKey,
  GroundConfig,
  HistoryEntry,
  ModelAsset,
  ModelAssetRef,
  PrimitiveType,
  SceneObject,
  TransformMode,
} from '@/types/editor'
import { MOCK_OBJECTS } from '@/components/editor/presets'
import { createCopyObject, createModelObject, createSceneObject } from '@/lib/objectFactory'
import { serializeScene, writeAutosave, type SceneFile } from '@/lib/sceneIO'
import { useAssetsStore } from '@/store/assets'

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
  /** 按资产添加模型实例并自动选中（PRD §3 M1） */
  addModel: (asset: ModelAssetRef) => void
  /** 局部更新对象属性（PRD 4.6），不可改 id / type；静默写入，不产生快照 */
  updateObject: (id: string, patch: Partial<SceneObject>) => void
  /** 切换对象显隐；产生历史快照 */
  toggleVisible: (id: string) => void
  /** 删除对象；若删的是选中项则清空选中（PRD 4.7） */
  removeObject: (id: string) => void
  /**
   * 删除资产并级联删除其全部实例，合并为一条可撤销历史。
   * 返回被删除的实例数；无实例时不入历史。
   */
  deleteAssetInstances: (assetId: string, asset: ModelAsset) => number
  /** 复制对象并选中副本（PRD 4.7） */
  duplicateObject: (id: string) => void
  /** 将源对象插入目标对象前/后；有效排序产生一条历史快照（PRD 5.4） */
  reorderObject: (
    sourceId: string,
    targetId: string,
    placement: 'before' | 'after',
  ) => void
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
  deletedAssets?: ModelAsset[],
): SnapshotFields {
  const entry: HistoryEntry = {
    objects: next.objects,
    selectedId: next.selectedId,
    ...(deletedAssets && deletedAssets.length > 0 ? { deletedAssets } : {}),
  }
  const history = [
    ...state.history.slice(0, state.historyIndex + 1),
    entry,
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

/** 提交快照并同步自动草稿（PRD 4.9：历史快照时静默写 localStorage） */
function snapshotAndSave(
  state: EditorState,
  next: { objects: SceneObject[]; selectedId: string | null },
  deletedAssets?: ModelAsset[],
): SnapshotFields {
  const result = pushSnapshot(state, next, deletedAssets)
  writeAutosave(serializeScene(result.objects, state.env, state.ground))
  return result
}

const initialSelectedId = MOCK_OBJECTS[0]?.id ?? null

export const useEditorStore = create<EditorState>((set, get) => ({
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
      return snapshotAndSave(state, {
        objects: [...state.objects, object],
        selectedId: object.id,
      })
    }),
  addModel: (asset) =>
    set((state) => {
      const object = createModelObject(asset, state.objects)
      return snapshotAndSave(state, {
        objects: [...state.objects, object],
        selectedId: object.id,
      })
    }),
  updateObject: (id, patch) =>
    set((state) => ({
      objects: state.objects.map((o) =>
        o.id === id ? ({ ...o, ...patch } as SceneObject) : o,
      ),
    })),
  toggleVisible: (id) =>
    set((state) => {
      const target = state.objects.find((o) => o.id === id)
      if (!target) return state
      const next = state.objects.map((o) =>
        o.id === id ? { ...o, visible: !o.visible } : o,
      )
      return snapshotAndSave(state, { objects: next, selectedId: state.selectedId })
    }),
  removeObject: (id) =>
    set((state) => {
      if (!state.objects.some((o) => o.id === id)) return state
      return snapshotAndSave(state, {
        objects: state.objects.filter((o) => o.id !== id),
        selectedId: state.selectedId === id ? null : state.selectedId,
      })
    }),
  deleteAssetInstances: (assetId, asset) => {
    const removed = get().objects.filter(
      (o) => o.type === 'model' && o.asset === assetId,
    ).length
    if (removed === 0) return 0

    set((state) => {
      const objects = state.objects.filter(
        (o) => !(o.type === 'model' && o.asset === assetId),
      )
      const keepSelection =
        state.selectedId !== null && objects.some((o) => o.id === state.selectedId)
      return snapshotAndSave(
        state,
        { objects, selectedId: keepSelection ? state.selectedId : null },
        [asset],
      )
    })
    return removed
  },
  duplicateObject: (id) =>
    set((state) => {
      const source = state.objects.find((o) => o.id === id)
      if (!source) return state
      const copy = createCopyObject(source)
      return snapshotAndSave(state, {
        objects: [...state.objects, copy],
        selectedId: copy.id,
      })
    }),
  reorderObject: (sourceId, targetId, placement) =>
    set((state) => {
      if (sourceId === targetId) return state
      const sourceIndex = state.objects.findIndex((o) => o.id === sourceId)
      if (sourceIndex < 0 || !state.objects.some((o) => o.id === targetId)) return state

      const objects = state.objects.filter((o) => o.id !== sourceId)
      const targetIndex = objects.findIndex((o) => o.id === targetId)
      const insertAt = targetIndex + (placement === 'after' ? 1 : 0)
      // 移除源对象后，插入点仍等于原索引说明顺序未变
      if (insertAt === sourceIndex) return state

      objects.splice(insertAt, 0, state.objects[sourceIndex])
      return snapshotAndSave(state, { objects, selectedId: state.selectedId })
    }),
  clearScene: () =>
    set((state) => {
      if (state.objects.length === 0) return state
      return snapshotAndSave(state, { objects: [], selectedId: null })
    }),
  commitHistory: () =>
    set((state) => {
      const top = state.history[state.historyIndex]
      // 与栈顶完全一致（引用比较）时视为无变化，避免空快照
      if (top && top.objects === state.objects && top.selectedId === state.selectedId) {
        return state
      }
      return snapshotAndSave(state, {
        objects: state.objects,
        selectedId: state.selectedId,
      })
    }),
  undo: () =>
    set((state) => {
      if (state.historyIndex <= 0) return state
      const index = state.historyIndex - 1
      const entry = state.history[index]
      // 离开的快照若删过资产，撤销时把资产恢复到资产库（PRD §6 M1：级联删除可撤销）
      const leaving = state.history[state.historyIndex]
      if (leaving.deletedAssets && leaving.deletedAssets.length > 0) {
        const restore = useAssetsStore.getState().restoreAsset
        leaving.deletedAssets.forEach((asset) => void restore(asset))
      }
      writeAutosave(serializeScene(entry.objects, state.env, state.ground))
      return { objects: entry.objects, selectedId: entry.selectedId, historyIndex: index }
    }),
  redo: () =>
    set((state) => {
      if (state.historyIndex >= state.history.length - 1) return state
      const index = state.historyIndex + 1
      const entry = state.history[index]
      // 重做删除动作时再次把资产移出资产库
      if (entry.deletedAssets && entry.deletedAssets.length > 0) {
        const remove = useAssetsStore.getState().removeAsset
        entry.deletedAssets.forEach((asset) => void remove(asset.id))
      }
      writeAutosave(serializeScene(entry.objects, state.env, state.ground))
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
      return snapshotAndSave(state, { objects: next, selectedId: state.selectedId })
    }),
}))
