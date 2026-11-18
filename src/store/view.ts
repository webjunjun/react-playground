import { create } from 'zustand'

export type ViewKey = 'persp' | 'front' | 'top' | 'right'
export type ShadeKey = 'solid' | 'wire'

interface ViewState {
  view: ViewKey
  shade: ShadeKey
  setView: (view: ViewKey) => void
  setShade: (shade: ShadeKey) => void
}

/**
 * 视图工具状态（DEV-PLAN A1）
 * 不写入 history、不触发自动保存——属于纯视图偏好
 */
export const useViewStore = create<ViewState>((set) => ({
  view: 'persp',
  shade: 'solid',
  setView: (view) => set({ view }),
  setShade: (shade) => set({ shade }),
}))
