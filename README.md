# React Playground · 3D 场景编辑器

一个基于 React + TypeScript + Three.js 的浏览器端 3D 场景编辑器。左侧资源库添加几何体，中间视口选中并用 Gizmo 变换，右侧属性面板精确编辑，底部时间轴与状态栏为后续动画能力预留。

场景数据统一由 Zustand 管理，支持撤销 / 重做、JSON 导入导出与 localStorage 自动草稿恢复。

## 技术栈

| 分层 | 选型 |
| --- | --- |
| 框架 | React 19 + TypeScript + Vite |
| 3D 渲染 | three.js + @react-three/fiber + @react-three/drei |
| 状态管理 | Zustand |
| 路由 | React Router |
| 图标 | lucide-react |
| 代码检查 | oxlint |

## 快速开始

```bash
npm install
npm run dev
```

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动开发服务器（HMR） |
| `npm run build` | 类型检查并构建到 `dist/` |
| `npm run preview` | 本地预览构建产物 |
| `npm run lint` | 运行 oxlint |

## 页面

| 路由 | 说明 |
| --- | --- |
| `/` | 起始页（模板默认首页） |
| `/counter` | Zustand 最小示例 |
| `/editor` | 3D 编辑器主页面 |

## 编辑器功能

### 场景编辑

- **11 种几何体**：长方体、球体、圆柱、圆锥、圆环、四面体、八面体、平面、圆环（Ring）、圆环结、胶囊，添加后自动选中并按类型命名（如「球体 2」）。
- **视口拾取**：点击对象选中，点击空白取消；相机拖拽不会误触选中。锁定对象不参与视口拾取。
- **Gizmo 变换**：选中对象绑定 TransformControls，支持平移 / 旋转 / 缩放；一次拖拽只产生一条历史记录，缩放下限 0.01。
- **属性面板**：名称、颜色、位置、旋转（弧度）、缩放、可见、锁定双向绑定；输入框 blur / Enter 提交，Esc 回退，Vec3 支持一键重置默认值。
- **对象列表**：按名称搜索、可见性开关、锁定开关、复制 / 删除按钮，右键菜单支持重命名、复制、锁定、删除。
- **撤销 / 重做**：历史栈最多保留 50 条，覆盖添加、变换、属性编辑、删除、显隐、锁定、清空等写操作。

### 环境与视图

- **环境预设**：日间（Sky + 网格）、夜晚（深色 + 雾）、工作室（浅灰背景）、无（透明背景），网格、阴影与光照随之调整。
- **地面**：可选的环境元素，支持开关与颜色配置（不计入场景对象）。
- **视图控制条**：透视 / 前 / 顶 / 右正交相机切换，实体 / 线框着色切换；视图偏好不写入历史与草稿。

### 文件与持久化

- **导出 / 导入 JSON**：工具栏「保存 → 导出 JSON」下载带时间戳的 `scene-*.json`；「打开」导入并做 schema 校验，版本或字段非法时给出提示。
- **自动草稿**：每次产生历史快照时静默写入 localStorage；下次进入 `/editor` 会询问是否恢复（也可放弃，草稿保留）。
- **清空场景**：二次确认，可通过撤销恢复。

### 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `W` / `E` / `R` | 切换平移 / 旋转 / 缩放模式 |
| `Delete` | 删除选中对象（锁定对象需先解锁） |
| `Ctrl/Cmd + D` | 复制选中对象 |
| `G` | 切换拖拽吸附 |
| `Ctrl/Cmd + Z` | 撤销 |
| `Ctrl/Cmd + Shift + Z`、`Ctrl/Cmd + Y` | 重做 |
| `?` | 打开 / 关闭快捷键帮助 |
| `Esc` | 关闭弹窗 / 帮助浮层 |

## 项目结构

```text
src/
├── components/
│   ├── editor/          编辑器各区域组件
│   │   ├── Toolbar.tsx          工具栏、导入导出、快捷键
│   │   ├── Sidebar.tsx          资源库 / 场景列表
│   │   ├── Scene.tsx            R3F 画布、拾取、Gizmo、环境
│   │   ├── PropertiesPanel.tsx  属性与环境面板
│   │   ├── Viewbar.tsx          视角与着色控制条
│   │   ├── Timeline.tsx         时间轴（UI 壳）
│   │   ├── StatusBar.tsx        状态栏
│   │   ├── HelpOverlay.tsx      快捷键帮助
│   │   └── presets.ts           几何体预设与默认值
│   └── ui/              通用 UI（Toast）
├── lib/
│   ├── objectFactory.ts 场景对象工厂（id / 命名 / 复制）
│   └── sceneIO.ts       JSON 序列化、校验、下载、自动草稿
├── pages/               路由页面
├── store/               Zustand store（editor / view / counter）
├── types/               SceneObject 等类型定义
└── assets/styles/       全局样式与编辑器样式
```

## 场景文件格式

导出的 JSON 结构（`version` 固定为 `2.0`）：

```json
{
  "version": "2.0",
  "objects": [
    {
      "id": "obj_a1b2c3d4",
      "name": "直墙 1",
      "type": "model",
      "asset": "asset_9f8e7d6c",
      "file": "wall_01.glb",
      "position": [0, 0, 0],
      "rotation": [0, 1.5708, 0],
      "scale": [1, 1, 1],
      "visible": true,
      "locked": false
    },
    {
      "id": "obj_1a2b3c4d",
      "name": "长方体 1",
      "type": "box",
      "position": [0, 1, 0],
      "rotation": [0, 0, 0],
      "scale": [1, 1, 1],
      "color": "#6366f1",
      "material": {
        "type": "standard",
        "wireframe": false,
        "shininess": 30,
        "specular": "#111111",
        "metalness": 0.1,
        "roughness": 0.6,
        "flatShading": false
      },
      "visible": true,
      "locked": false
    }
  ],
  "environment": {
    "sky": "day",
    "ground": { "visible": true, "color": "#475569" }
  }
}
```

`type` 取值：`box` | `sphere` | `cylinder` | `cone` | `torus` | `tetrahedron` | `octahedron` | `plane` | `ring` | `torus-knot` | `capsule` | `model`；`sky` 取值：`day` | `night` | `studio` | `none`。

- 坐标系：Three.js 右手系，Y 向上；`rotation` 为弧度（Euler Y-X-Z）。
- 单位：1 世界单位 = 网格 1 格（建议 1 单位 = 1 米）。
- `locked` 属于编辑器状态，渲染端可忽略；`environment` 可选消费；未知字段一律忽略。

### 渲染端消费

模型文件由使用者自行管理：把 `.glb` / `.gltf` / `.fbx` 放到约定目录（如 `public/models/`），渲染端按 `file` 加载并应用变换。`asset` 是编辑器内部键，可忽略。

```ts
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const MODELS_DIR = '/models/' // 约定目录

for (const obj of scene.objects) {
  if (obj.type === 'model') {
    // 按原始文件名加载；文件需与 JSON 一并分发
    const gltf = await new GLTFLoader().loadAsync(MODELS_DIR + obj.file)
    gltf.scene.position.fromArray(obj.position)
    gltf.scene.rotation.fromArray(obj.rotation) // 或 rotation.set(x, y, z, 'YXZ')
    gltf.scene.scale.fromArray(obj.scale)
    gltf.scene.visible = obj.visible
    scene.add(gltf.scene)
  } else {
    // 几何体按 type + color + material 自行重建
  }
}
```

分享场景时需同时分发 JSON 与模型文件；编辑器接收方若缺文件，会以占位盒显示并提供批量重链入口。

## 文档

- [PRD-3D-Editor.html](docs/PRD-3D-Editor.html)：产品需求（P0 / P1 / P2）
- [DEV-PLAN.md](docs/DEV-PLAN.md)：功能实现清单与进度
- [ROADMAP.md](docs/ROADMAP.md)：V1.1 → V2 路线图

时间轴动画、分组层级、多选、PNG / 静态 HTML 导出等能力尚未接入数据，详见 DEV-PLAN 与 ROADMAP。

## 许可证

[MIT](LICENSE)
