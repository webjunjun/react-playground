import { createStore, del, entries, set } from 'idb-keyval'
import type { ModelAsset, ModelFormat } from '@/types/editor'

/**
 * 资产持久层：IndexedDB 只存资产记录与文件本体，不存 blob URL。
 * key = 资产 id，value = ModelAsset。
 */
const assetDb = createStore('model-stage', 'model-assets')

/** 从文件名判定模型格式；不支持时返回 null */
export function detectFormat(fileName: string): ModelFormat | null {
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (ext === 'glb' || ext === 'gltf' || ext === 'fbx') return ext
  return null
}

/** 默认资产名：去掉扩展名 */
export function stripExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 ? fileName.slice(0, dot) : fileName
}

/** 资产 id：asset_ + 8 位随机十六进制（PRD §3 M1） */
export function createAssetId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4))
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `asset_${hex}`
}

/** 读取全部资产，按入库时间升序 */
export async function readAllAssets(): Promise<ModelAsset[]> {
  const rows = await entries<string, ModelAsset>(assetDb)
  return rows
    .map(([, asset]) => asset)
    .filter(
      (asset): asset is ModelAsset =>
        !!asset &&
        typeof asset.id === 'string' &&
        typeof asset.fileName === 'string' &&
        asset.blob instanceof Blob,
    )
    .sort((a, b) => a.createdAt - b.createdAt)
}

/** 写入单个资产（含文件本体） */
export async function writeAsset(asset: ModelAsset): Promise<void> {
  await set(asset.id, asset, assetDb)
}

/** 删除单个资产记录 */
export async function removeAssetRecord(id: string): Promise<void> {
  await del(id, assetDb)
}
