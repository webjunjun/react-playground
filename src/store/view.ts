import { create } from 'zustand'

export type ViewKey = 'persp' | 'front' | 'top' | 'right'
export type ShadeKey = 'solid' | 'wire'

/** 可选的网格尺寸（DEV-PLAN A4-01） */
export const GRID_SIZES = [0.25, 0.5, 1, 2] as const
export type GridSize = (typeof GRID_SIZES)[number]

interface ViewState {
  view: ViewKey
  shade: ShadeKey
  /** 拖拽吸附开关；默认开启，仅影响视图操作 */
  snapEnabled: boolean
  /** 网格尺寸，同时驱动 Grid 单元格与平移吸附步进 */
  gridSize: GridSize
  setView: (view: ViewKey) => void
  setShade: (shade: ShadeKey) => void
  setSnapEnabled: (enabled: boolean) => void
  toggleSnap: () => void
  setGridSize: (size: GridSize) => void
}

/**
 * 视图工具状态（DEV-PLAN A1 / A4）
 * 不写入 history、不触发自动保存、不进入导出 JSON——属于纯视图偏好
 */
export const useViewStore = create<ViewState>((set) => ({
  view: 'persp',
  shade: 'solid',
  snapEnabled: true,
  gridSize: 1,
  setView: (view) => set({ view }),
  setShade: (shade) => set({ shade }),
  setSnapEnabled: (enabled) => set({ snapEnabled: enabled }),
  toggleSnap: () => set((state) => ({ snapEnabled: !state.snapEnabled })),
  setGridSize: (size) => set({ gridSize: size }),
}))
