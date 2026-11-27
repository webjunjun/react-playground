/**
 * 摄像头相关的纯逻辑：错误归类与提示文案。
 * 错误文案在这里统一维护，页面只负责渲染。
 */

export type CameraErrorKind =
  | 'unsupported'
  | 'insecure'
  | 'denied'
  | 'no-device'
  | 'busy'
  | 'timeout'
  | 'unknown'

export interface CameraError {
  kind: CameraErrorKind
  title: string
  detail: string
}

const MESSAGES: Record<CameraErrorKind, { title: string; detail: string }> = {
  unsupported: {
    title: '当前浏览器不支持摄像头',
    detail: '浏览器没有提供 mediaDevices 接口。换 Chrome 或 Edge 的较新版本再试。',
  },
  insecure: {
    title: '这个地址无法访问摄像头',
    detail: '浏览器只在 HTTPS 或 localhost 下允许调用摄像头。局域网 IP 访问会被直接拒绝。',
  },
  denied: {
    title: '摄像头权限被拒绝',
    detail: '点地址栏左侧的图标，把摄像头权限改回「允许」，然后重试。',
  },
  'no-device': {
    title: '没有检测到摄像头',
    detail: '确认设备已连接且没有被禁用。也可以用鼠标模式体验粒子效果。',
  },
  busy: {
    title: '摄像头正被其他程序占用',
    detail: '会议软件、录屏工具可能占着摄像头，关掉之后再重试。',
  },
  timeout: {
    title: '摄像头没有响应',
    detail: '浏览器在预期时间内没有给出画面，可能是系统权限或设备策略拦住了。可以重试，或先用鼠标模式。',
  },
  unknown: {
    title: '摄像头启动失败',
    detail: '发生了预料之外的错误，可以重试，或先用鼠标模式。',
  },
}

export function describeCameraError(err: unknown): CameraError {
  const name = err instanceof DOMException ? err.name : ''
  let kind: CameraErrorKind = 'unknown'

  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      kind = 'denied'
      break
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      kind = 'no-device'
      break
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      kind = 'busy'
      break
    default:
      kind = 'unknown'
  }

  const base = MESSAGES[kind]
  const raw = err instanceof Error && err.message ? err.message : ''
  return {
    kind,
    ...base,
    detail: kind === 'unknown' && raw ? `${base.detail}（${raw}）` : base.detail,
  }
}

export function cameraErrorOf(kind: CameraErrorKind): CameraError {
  return { kind, ...MESSAGES[kind] }
}

/** 640×480、前置摄像头、不带音频：够手势识别用，也不必吃满带宽 */
export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    width: { ideal: 640 },
    height: { ideal: 480 },
    frameRate: { ideal: 30 },
    facingMode: 'user',
  },
}
