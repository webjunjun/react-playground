import type { PrimitiveObject, PrimitiveType } from '@/types/editor'

/**
 * 按对象材质类型渲染 R3F 材质；全局线框覆盖所有材质，Basic 自身线框仅作用于 Basic
 * 拆分自 Scene.tsx（A1）
 */
export function ObjectMaterial({
  object,
  wireframe,
}: {
  object: PrimitiveObject
  wireframe: boolean
}) {
  const { color, material } = object

  switch (material.type) {
    case 'basic':
      return (
        <meshBasicMaterial
          color={color}
          wireframe={wireframe || material.wireframe}
        />
      )
    case 'phong':
      return (
        <meshPhongMaterial
          color={color}
          shininess={material.shininess}
          specular={material.specular}
          wireframe={wireframe}
        />
      )
    case 'standard':
      return (
        <meshStandardMaterial
          color={color}
          metalness={material.metalness}
          roughness={material.roughness}
          wireframe={wireframe}
        />
      )
    case 'normal':
      return (
        <meshNormalMaterial
          // flatShading 改变后需要重新编译着色器，remount 确保切换立即生效
          key={material.flatShading ? 'flat' : 'smooth'}
          flatShading={material.flatShading}
          wireframe={wireframe}
        />
      )
  }
}

/**
 * PrimitiveType → R3F Geometry 映射
 * 拆分自 Scene.tsx（A1）
 */
export function Geometry({ type }: { type: PrimitiveType }) {
  switch (type) {
    case 'box':
      return <boxGeometry args={[1, 1, 1]} />
    case 'sphere':
      return <sphereGeometry args={[0.5, 32, 32]} />
    case 'cylinder':
      return <cylinderGeometry args={[0.5, 0.5, 1, 32]} />
    case 'cone':
      return <coneGeometry args={[0.5, 1, 32]} />
    case 'torus':
      return <torusGeometry args={[0.4, 0.15, 16, 48]} />
    case 'tetrahedron':
      return <tetrahedronGeometry args={[0.6]} />
    case 'octahedron':
      return <octahedronGeometry args={[0.6]} />
    case 'ring':
      return <ringGeometry args={[0.25, 0.5, 32]} />
    case 'torus-knot':
      return <torusKnotGeometry args={[0.35, 0.12, 64, 16]} />
    case 'capsule':
      return <capsuleGeometry args={[0.35, 0.6, 8, 16]} />
    case 'plane':
      return <planeGeometry args={[1, 1]} />
  }
}
