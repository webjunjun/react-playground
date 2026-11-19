import type {
  EnvironmentKey,
  SceneBackground,
  SceneFogConfig,
  SceneLightsConfig,
} from '@/types/editor'

/** 地面平面边长（世界单位）：导出给外部应用，避免各自硬编码 */
export const GROUND_SIZE = 20

/** 方向光位置：四套预设共用，与视口保持一致 */
const DIRECTIONAL_POSITION: [number, number, number] = [10, 20, 10]

export interface EnvironmentPreset {
  background: SceneBackground
  fog: SceneFogConfig | null
  lights: SceneLightsConfig
}

/**
 * 环境预设的唯一真源（PRD §5.1）
 * 视口渲染与 JSON 导出共用同一份配置；编辑器内部只认 key，
 * 导出时解析成外部应用可直接套用的具体值，避免预设含义散落在两侧代码里
 */
export const ENVIRONMENT_PRESETS: Record<EnvironmentKey, EnvironmentPreset> = {
  day: {
    background: {
      type: 'sky',
      sunPosition: [100, 20, 100],
      turbidity: 8,
      rayleigh: 0.5,
    },
    fog: null,
    lights: {
      ambient: { intensity: 0.4 },
      directional: {
        color: '#ffffff',
        intensity: 1.2,
        position: DIRECTIONAL_POSITION,
        castShadow: true,
      },
    },
  },
  night: {
    background: { type: 'color', color: '#0a0e1a' },
    fog: { color: '#0a0e1a', near: 20, far: 60 },
    lights: {
      ambient: { intensity: 0.15 },
      directional: {
        color: '#7eb8da',
        intensity: 0.4,
        position: DIRECTIONAL_POSITION,
        castShadow: true,
      },
    },
  },
  studio: {
    background: { type: 'color', color: '#d4d4d8' },
    fog: null,
    lights: {
      ambient: { intensity: 0.4 },
      directional: {
        color: '#ffffff',
        intensity: 1,
        position: DIRECTIONAL_POSITION,
        castShadow: true,
      },
    },
  },
  none: {
    background: { type: 'transparent' },
    fog: null,
    lights: {
      ambient: { intensity: 0.4 },
      directional: {
        color: '#ffffff',
        intensity: 1.2,
        position: DIRECTIONAL_POSITION,
        castShadow: false,
      },
    },
  },
}
