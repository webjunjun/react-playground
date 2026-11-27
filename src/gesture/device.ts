/**
 * 设备与能力检测。
 * 用能力检测代替 UA 嗅探：UA 字符串现在太不可靠，
 * 但「有没有精确指针」是可信信号。
 */
export function isHandheldDevice(): boolean {
  if (typeof window === 'undefined') return false
  const coarse = window.matchMedia('(hover: none) and (pointer: coarse)').matches
  const touchPoints = navigator.maxTouchPoints || 0
  const narrow = window.innerWidth < 860
  return coarse || (touchPoints > 0 && narrow)
}

export function hasCameraSupport(): boolean {
  return Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
}

export function isSecureForCamera(): boolean {
  return window.isSecureContext || location.hostname === 'localhost'
}
