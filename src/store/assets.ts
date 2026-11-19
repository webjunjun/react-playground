import { create } from 'zustand'
import type { ModelAsset } from '@/types/editor'
import {
  createAssetId,
  detectFormat,
  readAllAssets,
  removeAssetRecord,
  stripExtension,
  writeAsset,
} from '@/lib/assetStore'

export interface ImportSummary {
  /** 成功入库数量 */
  added: number
  /** 因 fileName + size 重复被跳过 */
  skipped: number
  /** 扩展名不支持或写入失败 */
  invalid: number
  /** 本次含 gltf / fbx 的数量，用于外部资源提示 */
  external: number
}

interface AssetsState {
  assets: ModelAsset[]
  /** 资产 id → blob URL，只在运行时存在 */
  blobUrls: Record<string, string>
  status: 'idle' | 'loading' | 'ready'
  /** 从 IndexedDB 恢复资产库；重复调用共享同一个 Promise */
  hydrate: () => Promise<void>
  /** 导入本地文件：多选、判重、入库；返回汇总供 Toast 使用 */
  importFiles: (files: File[]) => Promise<ImportSummary>
  /** 删除单个资产及其 blob URL */
  removeAsset: (id: string) => Promise<void>
  /** 撤销删除时把资产重新入库并恢复 blob URL；已存在则跳过 */
  restoreAsset: (asset: ModelAsset) => Promise<void>
}

let hydration: Promise<void> | null = null
let unloadBound = false

/** 页面卸载时统一回收 blob URL，避免内存泄漏 */
function bindUnloadRevoke() {
  if (unloadBound || typeof window === 'undefined') return
  unloadBound = true
  window.addEventListener('beforeunload', () => {
    const { blobUrls } = useAssetsStore.getState()
    Object.values(blobUrls).forEach((url) => URL.revokeObjectURL(url))
  })
}

export const useAssetsStore = create<AssetsState>((set, get) => ({
  assets: [],
  blobUrls: {},
  status: 'idle',

  hydrate: () => {
    if (get().status === 'ready') return Promise.resolve()
    if (hydration) return hydration

    hydration = (async () => {
      set({ status: 'loading' })
      try {
        const assets = await readAllAssets()
        const blobUrls: Record<string, string> = {}
        for (const asset of assets) {
          blobUrls[asset.id] = URL.createObjectURL(asset.blob)
        }
        bindUnloadRevoke()
        set({ assets, blobUrls, status: 'ready' })
      } catch (error) {
        // 隐私模式 / IndexedDB 不可用时降级为空库，不阻塞编辑器
        console.error('[assets] 资产库读取失败', error)
        set({ assets: [], blobUrls: {}, status: 'ready' })
      }
    })()

    return hydration
  },

  importFiles: async (files) => {
    const existing = get().assets
    const existingKeys = new Set(existing.map((a) => `${a.fileName}|${a.size}`))
    const sessionKeys = new Set<string>()
    const added: ModelAsset[] = []
    let skipped = 0
    let invalid = 0
    let external = 0

    for (const file of files) {
      const format = detectFormat(file.name)
      if (!format) {
        invalid += 1
        continue
      }
      const key = `${file.name}|${file.size}`
      if (existingKeys.has(key) || sessionKeys.has(key)) {
        skipped += 1
        continue
      }
      sessionKeys.add(key)
      if (format === 'gltf' || format === 'fbx') external += 1

      const asset: ModelAsset = {
        id: createAssetId(),
        name: stripExtension(file.name),
        fileName: file.name,
        format,
        size: file.size,
        unitScale: 1,
        createdAt: Date.now(),
        blob: file,
      }

      try {
        await writeAsset(asset)
      } catch (error) {
        console.error('[assets] 资产写入失败', file.name, error)
        invalid += 1
        continue
      }
      added.push(asset)
    }

    if (added.length > 0) {
      const blobUrls = { ...get().blobUrls }
      for (const asset of added) {
        blobUrls[asset.id] = URL.createObjectURL(asset.blob)
      }
      set({ assets: [...get().assets, ...added], blobUrls })
    }

    return { added: added.length, skipped, invalid, external }
  },

  removeAsset: async (id) => {
    const { blobUrls } = get()
    const url = blobUrls[id]
    if (url) URL.revokeObjectURL(url)

    try {
      await removeAssetRecord(id)
    } catch (error) {
      console.error('[assets] 资产删除失败', id, error)
    }

    const nextUrls = { ...blobUrls }
    delete nextUrls[id]
    set({
      assets: get().assets.filter((asset) => asset.id !== id),
      blobUrls: nextUrls,
    })
  },

  restoreAsset: async (asset) => {
    if (get().assets.some((item) => item.id === asset.id)) return

    try {
      await writeAsset(asset)
    } catch (error) {
      // 写库失败时仍在内存中恢复，至少保证本次会话的撤销可用
      console.error('[assets] 资产恢复入库失败', asset.id, error)
    }

    const url = URL.createObjectURL(asset.blob)
    set((state) => ({
      assets: [...state.assets, asset],
      blobUrls: { ...state.blobUrls, [asset.id]: url },
    }))
  },
}))
