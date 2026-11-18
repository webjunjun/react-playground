import { useEffect } from 'react'
import { X } from 'lucide-react'
import { create } from 'zustand'

export type ToastVariant = 'info' | 'success' | 'error'

export interface ToastItem {
  id: number
  message: string
  variant: ToastVariant
  duration: number
  /** 同文案重复触发时递增，用于重置计时器（id 不变，避免重新挂载吃掉入场动画） */
  refreshKey: number
}

interface ToastStore {
  items: ToastItem[]
  show: (message: string, variant?: ToastVariant, duration?: number) => void
  dismiss: (id: number) => void
  clear: () => void
}

let seq = 0

const useToastStore = create<ToastStore>((set) => ({
  items: [],
  show: (message, variant = 'info', duration = 2200) =>
    set((s) => {
      // 同文案去重：不新增卡片，只重置已有卡片的倒计时
      const exists = s.items.some((t) => t.message === message)
      if (exists) {
        return {
          items: s.items.map((t) =>
            t.message === message
              ? { ...t, variant, duration, refreshKey: ++seq }
              : t,
          ),
        }
      }
      return {
        items: [
          ...s.items,
          { id: ++seq, message, variant, duration, refreshKey: 0 },
        ],
      }
    }),
  dismiss: (id) =>
    set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
  clear: () => set({ items: [] }),
}))

/** 全局调用入口：可在任意组件 / 非组件模块中使用 */
export const toast = {
  info: (message: string, duration?: number) =>
    useToastStore.getState().show(message, 'info', duration),
  success: (message: string, duration?: number) =>
    useToastStore.getState().show(message, 'success', duration),
  error: (message: string, duration?: number) =>
    useToastStore.getState().show(message, 'error', duration),
}

/** 挂在页面根节点一次即可，所有 toast 都渲染在这里 */
export function ToastViewport() {
  const items = useToastStore((s) => s.items)
  const clear = useToastStore((s) => s.clear)

  // 页面卸载时清空待显示的 toast，避免路由切回后旧提示重新冒出来
  useEffect(() => clear, [clear])

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {items.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
    </div>
  )
}

function ToastCard({ item }: { item: ToastItem }) {
  const dismiss = useToastStore((s) => s.dismiss)

  // dismiss 是 store action，引用稳定，不会因父组件重渲染而重置计时器
  useEffect(() => {
    const timer = setTimeout(() => dismiss(item.id), item.duration)
    return () => clearTimeout(timer)
  }, [dismiss, item.id, item.duration, item.refreshKey])

  return (
    <div className={`toast-item toast-${item.variant}`}>
      <span className="toast-message">{item.message}</span>
      <button
        className="toast-close"
        onClick={() => dismiss(item.id)}
        aria-label="关闭提示"
      >
        <X size={12} strokeWidth={2.5} />
      </button>
    </div>
  )
}
