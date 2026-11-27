/**
 * 手势去抖状态机（纯逻辑，不碰 DOM 和 React，方便单测）。
 *
 * 为什么必须有这一层：分类器逐帧输出并不稳定，同一个「握拳」会夹杂
 * None 和低置信度的其他类别。直接把结果喂给动画，形态会疯狂闪。
 *
 * 三条规则：
 * 1. 连续 N 帧同一结果才切换（streak）；
 * 2. 切换后冷却一段时间，避免刚变形就被下一帧拉回去；
 * 3. 中间夹杂的 None 不打断计数——只按「最近一次有效识别距今多久」来兜底重置，
 *    否则手稍微一抖就前功尽弃。
 */

import type { ShapeId } from './shapes'
import { lookupGesture } from './gestureMap'

export interface GesturePolicy {
  /** 低于这个置信度不算数 */
  minScore: number
  /** 连续多少帧一致才切换 */
  framesToSwitch: number
  /** 切换后的冷却时间 */
  cooldownMs: number
  /** 手离开画面多久才回落到默认形态 */
  lostGraceMs: number
  /** 两次有效识别之间允许的最大空档，超过就重置计数 */
  gapToleranceMs: number
}

export const DEFAULT_POLICY: GesturePolicy = {
  minScore: 0.6,
  framesToSwitch: 6,
  cooldownMs: 450,
  lostGraceMs: 600,
  gapToleranceMs: 420,
}

export interface Observation {
  category: string | null
  score: number
  /** performance.now() */
  t: number
}

export interface Commit {
  shape: ShapeId | null
  label: string | null
}

export interface GestureMachine {
  /** 有实际变化时返回新的形态，否则 null */
  push(obs: Observation): Commit | null
  reset(): void
  current(): Commit
  /** 调试信息：当前候选与连续帧数 */
  debug(): { candidate: ShapeId | null; streak: number }
}

export function createGestureMachine(policy: GesturePolicy = DEFAULT_POLICY): GestureMachine {
  let shape: ShapeId | null = null
  let label: string | null = null

  let candidate: ShapeId | null = null
  let candidateLabel: string | null = null
  let streak = 0

  let lastSwitch = Number.NEGATIVE_INFINITY
  let lastSeen = Number.NEGATIVE_INFINITY
  let lastMapped = Number.NEGATIVE_INFINITY

  const reset = () => {
    shape = null
    label = null
    candidate = null
    candidateLabel = null
    streak = 0
    lastSwitch = Number.NEGATIVE_INFINITY
    lastSeen = Number.NEGATIVE_INFINITY
    lastMapped = Number.NEGATIVE_INFINITY
  }

  const push = ({ category, score, t }: Observation): Commit | null => {
    const mapped = score >= policy.minScore ? lookupGesture(category) : null

    if (mapped) {
      lastSeen = t
      lastMapped = t
      if (mapped.shape === candidate) {
        streak += 1
      } else {
        candidate = mapped.shape
        candidateLabel = mapped.label
        streak = 1
      }
    } else if (t - lastMapped > policy.gapToleranceMs) {
      // 空档太久，之前的候选作废
      candidate = null
      candidateLabel = null
      streak = 0
    }

    if (
      candidate &&
      streak >= policy.framesToSwitch &&
      candidate !== shape &&
      t - lastSwitch >= policy.cooldownMs
    ) {
      shape = candidate
      label = candidateLabel
      lastSwitch = t
      streak = 0
      return { shape, label }
    }

    // 手离开画面（不是错误）：宽容一段时间后回到默认形态
    if (shape && lastSeen !== Number.NEGATIVE_INFINITY && t - lastSeen > policy.lostGraceMs) {
      shape = null
      label = null
      candidate = null
      candidateLabel = null
      streak = 0
      return { shape: null, label: null }
    }

    return null
  }

  return {
    push,
    reset,
    current: () => ({ shape, label }),
    debug: () => ({ candidate, streak }),
  }
}
