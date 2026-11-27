/**
 * MediaPipe GestureRecognizer 的输出类别 → 粒子形态。
 *
 * 内置类别一共 8 个（含 None）：Closed_Fist / Open_Palm / Pointing_Up /
 * Thumb_Down / Thumb_Up / Victory / ILoveYou / None。
 * 这里只映射 5 个，其余（Thumb_Down、ILoveYou）刻意不接——
 * 与其强行凑一个形态，不如让它们保持「不改变当前形态」。
 */

import type { ShapeId } from './shapes'

export interface GestureMapping {
  shape: ShapeId
  /** 中文名，直接显示在状态条上 */
  label: string
}

export const GESTURE_MAP: Record<string, GestureMapping> = {
  Open_Palm: { shape: 'nebula', label: '张开手掌' },
  Closed_Fist: { shape: 'core', label: '握拳' },
  Victory: { shape: 'vortex', label: '剪刀手' },
  Thumb_Up: { shape: 'helix', label: '竖拇指' },
  Pointing_Up: { shape: 'ray', label: '食指指上' },
}

/** 空白 / 未识别：模型在这一类上置信度通常很高，不代表出错 */
export const NO_GESTURE = 'None'

export function lookupGesture(category: string | null | undefined): GestureMapping | null {
  if (!category) return null
  return GESTURE_MAP[category] ?? null
}
