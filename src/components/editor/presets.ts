import type { ComponentType, SVGProps } from 'react'
import type { Vector3Tuple } from 'three'
import {
  Box,
  Circle,
  Cylinder,
  Triangle,
  CircleDot,
  Pyramid,
  Diamond,
  Square,
  Donut,
  Infinity as InfinityIcon,
  Pill,
} from 'lucide-react'
import type { PrimitiveType, SceneObject } from '@/types/editor'

type LucideIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number }>

export interface PrimitivePreset {
  type: PrimitiveType
  label: string
  /** 纯对象名（不带卡片里的补充说明），用于新对象命名 */
  name: string
  Icon: LucideIcon
}

/** P0 内置的 5 种基础几何体（PRD 4.2）+ P1 扩展类型（PRD 5.1） */
export const PRIMITIVE_PRESETS: PrimitivePreset[] = [
  { type: 'box', label: '长方体', name: '长方体', Icon: Box },
  { type: 'sphere', label: '球体', name: '球体', Icon: Circle },
  { type: 'cylinder', label: '圆柱', name: '圆柱', Icon: Cylinder },
  { type: 'cone', label: '圆锥', name: '圆锥', Icon: Triangle },
  { type: 'torus', label: '圆环', name: '圆环', Icon: CircleDot },
  { type: 'tetrahedron', label: '四面体', name: '四面体', Icon: Pyramid },
  { type: 'octahedron', label: '八面体', name: '八面体', Icon: Diamond },
  { type: 'plane', label: '平面', name: '平面', Icon: Square },
  { type: 'ring', label: '圆环（Ring）', name: '圆环(Ring)', Icon: Donut },
  { type: 'torus-knot', label: '圆环结', name: '圆环结', Icon: InfinityIcon },
  { type: 'capsule', label: '胶囊', name: '胶囊', Icon: Pill },
]

/** 每种 primitive 的出厂参数（PRD 4.2） */
export interface PrimitiveDefaults {
  position: Vector3Tuple
  rotation: Vector3Tuple
  scale: Vector3Tuple
  color: string
}

/**
 * 类型默认值表（DEV-PLAN #2）
 * P0 五种严格对齐 PRD 4.2 的默认颜色与初始位置；
 * P1 六种按各自几何尺寸落地放置（平面类贴地 y=0.01）
 */
export const PRIMITIVE_DEFAULTS: Record<PrimitiveType, PrimitiveDefaults> = {
  box: { position: [0, 1, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#6366f1' },
  sphere: { position: [0, 1, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#f59e0b' },
  cylinder: { position: [0, 1, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#10b981' },
  cone: { position: [0, 1, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#ef4444' },
  torus: { position: [0, 1, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#8b5cf6' },
  tetrahedron: { position: [0, 1, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#14b8a6' },
  octahedron: { position: [0, 1, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#0ea5e9' },
  plane: {
    position: [0, 0.01, 0],
    rotation: [-Math.PI / 2, 0, 0],
    scale: [1, 1, 1],
    color: '#94a3b8',
  },
  ring: {
    position: [0, 0.01, 0],
    rotation: [-Math.PI / 2, 0, 0],
    scale: [1, 1, 1],
    color: '#ec4899',
  },
  'torus-knot': { position: [0, 1, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#a855f7' },
  capsule: { position: [0, 1, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#f97316' },
}

/** 静态 UI 的 mock 场景数据：仅用户对象（地面为环境元素，见 Scene.tsx） */
export const MOCK_OBJECTS: SceneObject[] = [
  {
    id: 'obj_demo_box',
    name: '示例方块',
    type: 'box',
    position: [0, 1, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    color: '#6366f1',
    visible: true,
    locked: false,
  },
]
