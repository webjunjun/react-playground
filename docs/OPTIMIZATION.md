# 3D 编辑器优化建议

> 基于 2026-11-20 代码全量审计。
> 源码路径：`src/store/editor.ts`、`src/store/view.ts`、`src/store/assets.ts`、`src/types/editor.ts`、`src/lib/*`、`src/components/editor/*`

---

## 一、现状盘点（已落地功能）

| 模块 | 能力 | 完成度 |
|------|------|--------|
| 场景对象 | 添加 / 删除 / 复制 / 重命名 / 排序 / 可见性 / 锁定 | ✅ 完整 |
| 变换 | 平移 W / 旋转 E / 缩放 R（Gizmo 拖拽 + 属性面板输入） | ✅ 完整 |
| 材质 | basic / phong / standard / normal 四种；全局线框覆盖 + 对象私有线框 | ✅ 完整 |
| 环境 | day / night / studio / none 四套预设；可编辑地面 | ✅ 完整 |
| 视角 | 透视 + front/top/right 正交 | ✅ 完整 |
| 网格 & 吸附 | 吸附开关、4 档网格尺寸、平移/旋转步进 | ✅ 完整 |
| 资产库 | GLB/GLTF/FBX 导入 + IndexedDB 持久化 + 缺失重链 | ✅ 完整 |
| 场景 IO | JSON 2.1 导出 / 导入、localStorage 自动草稿（5 秒节流） | ✅ 完整 |
| 撤销 / 重做 | 历史快照（上限 50 条）、Gizmo 拖拽粒度合并、资产级联删除可撤销 | ✅ 完整 |
| 快捷键 | W/E/R / Delete / Ctrl+Z / Ctrl+Y / Ctrl+D / G / ? 帮助浮层 | ✅ 完整 |
| 侧栏 | 资源库 Tab + 场景对象 Tab（搜索 + 拖拽排序 + 右键菜单） | ✅ 完整 |

**整体评价**：核心链路闭环，功能覆盖了一个最小可用 3D 编辑器的骨架。以下是代码里已经确认的问题和可以继续推进的方向。

---

## 二、技术债（建议近期修复）

### T1. Scene JSON 2.1 校验过于刚性

**现状**：`parseSceneJSON` 对每一个字段做严格白名单校验，任何字段不合法就整体返回 `null`，文件被拒绝。

**问题**：
- `environment` 里的 `fog`、`lights`、`ground.size` 都是必填；外部应用输出一个少了 `ground.size` 的文件会被整个拒绝，没有"部分容错、能用就用"的降级。
- `objects` 数组里只要有一个对象字段不合法（例如 `scale` 数组长度不是 3），整个文件就拒绝；合理做法是跳过坏对象、接收好对象并在 Toast 里报告。
- `sceneIO.ts` 有 ~300 行纯校验逻辑，白名单常量 (`VALID_TYPES` / `VALID_MATERIAL_TYPES`) 和 `types/editor.ts` 里的 `PrimitiveType` / `MaterialType` 类型定义重复维护，新增类型时容易漏改。

**建议**：
1. 把白名单改成从 TypeScript 类型推导（`const VALID_TYPES = ['box', ...] as const satisfies PrimitiveType[]`），确保编译期一致。
2. `normalizeObject` 返回 `null` 时不要整体拒绝，而是把坏对象收集起来，导入成功后 Toast 报告"N 个对象被跳过"。
3. `environment` 缺字段时全部走预设兜底，不要拒绝。

---

### T2. Gizmo 拖拽高频写 store 导致全场景重渲染

**现状**：`Scene.tsx` 里 `onObjectChange` 每帧（~60fps）调用 `updateObject`，把 Gizmo 的 transform 实时写回 `editor.objects` 数组。

**问题**：
- `updateObject` 调用 `set` 时创建新的 `objects` 数组引用，触发 **所有** 订阅了 `s.objects` 的组件重渲染（Sidebar 的 ObjectTree、PropertiesPanel、StatusBar 等）。
- 拖拽旋转缩放时每秒 60 次 store 更新 × N 个订阅者，对象多了会卡。

**建议**：
- 拖拽期间用 `useRef` 维护临时 transform，只在属性面板需要读数时从 ref 取，不写 store。
- `commitTransform`（松手瞬间）才写 store + 提交历史。
- 属性面板加一个"实时预览 vs 松手后刷新"的开关，默认关闭实时预览。

---

### T3. ModelMesh templateCache 是进程级全局变量

**现状**：`ModelMesh.tsx` 里 `const templateCache = new Map<string, Promise<Group>>()`，所有 ModelInstance 组件共享同一份缓存。

**问题**：
- 没有 LRU 淘汰，导入 50 个大模型后会一直常驻内存。
- 页面硬刷新后缓存丢失（但这是预期行为，不算 bug）。
- `dispose={null}` 防止 React 卸载时释放共享几何体，但也意味着永远不释放。

**建议**：
- 限制缓存上限（例如 10 条），超过时淘汰最久未使用的。
- 提供"手动清除模板缓存"按钮或在资产库删除时同步清除。

---

### T4. TransformControls 绑定时序脆弱

**现状**：`selectedGroup` 通过 `useState<Group | null>` 管理，StaticMesh/ModelInstance 通过 `bindRef` 把 group 实例 `set` 进 state。TransformControls 用 `selectedGroup` 绑定。

**问题**：
- 选中对象时 `selected` 从 false 变 true，`bindRef` 会被调用并 `setSelectedGroup(node)`；但同一时刻旧对象（之前选中的）的 `selected` 变 false，它的 group ref 会收到 `null`，也调 `setSelectedGroup(null)`。React 批量更新里这两个 set 的顺序不保证，可能出现"先绑上新对象、再被 null 覆盖"的竞态。
- 每次选中切换要等两次 state 更新 + R3F 重渲染循环，Gizmo 绑定有可见的延迟。

**建议**：
- 改用一个 ref `selectedGroupRef` 直接存当前选中的 Group，TransformControls 从 ref 读，避开 React 批量更新的竞态。
- 或者让 Gizmo 绑定逻辑变成 R3F 内部的 effect（在 R3F 树里直接 `useThree().scene.getObjectByName` 之类），不穿透到 React state 层。

---

### T5. 三个 Store 之间直接互相调用，耦合脆弱

**现状**：
- `editor.ts` 的 `undo` / `redo` 直接调用 `useAssetsStore.getState().restoreAsset()` / `removeAsset()`，操作另一个 store 的状态。
- `editor.ts` 的 `duplicateObject` 调用 `useViewStore.getState()` 读吸附配置。
- `sceneIO.ts` 的 `replaceScene` 调用 `serializeScene(...)` 时传入 `state.env` 但 `env` 在 sceneIO 内部又会用 `ENVIRONMENT_PRESETS[env]` 解析一次，和 `Scene.tsx` 里 `preset = ENVIRONMENT_PRESETS[env]` 重复。

**问题**：Store 变成"上帝对象"，谁都能读写谁，边界不清晰。未来如果要做 SSR、时间旅行、或者换状态管理库，牵一发动全身。

**建议**：
1. 定义一个顶层 `EditorController`（或 React Context），把 undo/redo/import 等跨 store 协调逻辑集中起来，Store 只负责原子性的字段读写。
2. `ENVIRONMENT_PRESETS` 的解析调用点统一收敛到一个函数，不允许 Scene.tsx 和 sceneIO.ts 各自解析。

---

### T6. 自动草稿 localStorage 溢出风险

**现状**：`writeAutosave` 把整个场景 JSON 写进 localStorage（约 5MB 上限），`catch {}` 静默丢弃。

**问题**：
- 对象数量 > 几百个时 JSON 可能超过 5MB，配额满后用户不会收到任何提示——草稿丢了也不知道。
- 每次历史快照都重写完整 JSON，对象多时序列化开销大。

**建议**：
1. `writeAutosave` 里 catch 时 toast 一条 warning："自动草稿保存失败，存储空间可能已满"。
2. 加一个 `compressedAutosave` 开关，超阈值时用 `lz-string` 压缩。
3. 或者改用 IndexedDB 存草稿（已有 IndexedDB 资产库，复用基础设施）。

---

## 三、架构优化（中期可推进）

### A1. Scene.tsx 文件过大，职责混杂

**现状**：`Scene.tsx` 单文件 360 行，同时包含：
- Canvas 配置
- 相机切换逻辑
- 环境 / 光照 / 网格渲染
- 地板
- TransformControls Gizmo 逻辑
- StaticMesh / ObjectMaterial / Geometry 三个子组件

**建议拆分为**：
| 文件 | 职责 |
|------|------|
| `Scene.tsx` | 主入口：Canvas + 相机 + 环境 |
| `SceneEntities.tsx` | 遍历 objects，按 type 分发到 StaticMesh / ModelInstance |
| `ObjectGizmo.tsx` | TransformControls 包装 + gizmoBusy / dragChanged 逻辑 |
| `StaticMesh.tsx` | 几何体 mesh + 材质 |
| `GeometryMap.ts` | `PrimitiveType → R3F Geometry` 映射表 |
| `MaterialMap.tsx` | `MaterialConfig → R3F Material` 映射组件 |

StaticMesh 和 ModelInstance 的拾取 + Gizmo 绑定逻辑高度重复，可以抽一个 hook：
```ts
function useSceneObjectGroup(object, selected, onPick, onBind) { /* ... */ }
```

---

### A2. MaterialConfig 扁平结构 → 继承结构

**现状**：`MaterialConfig` 把四种材质的所有参数都平铺在一个接口里，切换类型时不会丢失其他类型的参数——这是一个设计好的特性，但有副作用：
- UI 上每个材质类型只显示自己的参数，但 TypeScript 无法帮忙约束，将来加参数时容易把某个字段漏在某个类型上。
- `normalizeMaterial` 要对每个字段逐个校验（shininess、specular、metalness、roughness、flatShading），加一个新材质类型就要多加几行校验。

**建议**：改成 discriminated union：
```ts
type MaterialConfig =
  | { type: 'basic'; wireframe: boolean }
  | { type: 'phong'; wireframe: boolean; shininess: number; specular: string }
  | { type: 'standard'; wireframe: boolean; metalness: number; roughness: number }
  | { type: 'normal'; wireframe: boolean; flatShading: boolean }
```
好处：
- TypeScript 自动约束，UI 上 `switch (material.type)` 时每个分支里 material 的字段精确。
- `normalizeMaterial` 可以按 type 分支分别校验，结构清晰。
- 代价：`switch type` 时其他类型的参数值会丢失（如果不刻意保存的话）。如果希望保留"来回切换类型不丢参数"的体验，可以把常用参数存顶层，材质特有参数存各自分支。

---

### A3. 通用 Hook 抽离

当前有几处跨组件的重复模式：

| 重复模式 | 出现位置 | 建议 |
|----------|----------|------|
| `CLICK_TOLERANCE` 点击判定 | Scene.tsx / ModelMesh.tsx | 抽 `useClickTolerance` hook |
| `[object.id === selectedId && !object.locked]` 选中判定 | Scene.tsx | 抽 helper `isInteractable(object, selectedId)` |
| `bindRef` 选中时把 group 交给 Gizmo | StaticMesh / ModelInstance | 抽 `useGizmoBind` hook |
| `updateObject(id, patch); commitHistory()` 的成对出现 | PropertiesPanel / Sidebar / Toolbar | 抽 editor store 的 `commitUpdate` action |
| Vector3 输入草稿态 + blur 提交 | PropertiesPanel.Vector3Field | 已抽 `DraftInput`，继续复用 |

---

### A4. 模块依赖图规范化

```
types/editor.ts        ← 所有依赖的基石，纯类型，0 运行时依赖
       ↑
lib/*.ts               ← 纯函数，可独立测试，不 import store
       ↑
store/*.ts             ← zustand store，可互相 getState() 但不跨 store 直接写
       ↑
components/ui/*        ← 通用 UI，不 import store
       ↑
components/editor/*     ← 编辑器组件，唯一 import store 的层
       ↑
pages/*                ← 页面布局，不做业务逻辑
```

**当前违规点**：`editor.ts` 的 undo/redo 直接操作 assets store 属于跨 store 写入，建议搬到顶层协调器。

---

## 四、功能缺口（有明确用户价值，可以规划）

### F1. 多选 & 框选

**现状**：只能单选。

**可参考路径**：
- `Ctrl + Click` 多选 / 取消
- `Shift + Click` 区间选
- 视口空白处拖拽框选（需要 R3F 的 `onPointerDown/Move/Up` + 计算框选矩形 vs 对象包围盒）

**历史快照影响**：多选时的变换应该合并为一条历史（Gizmo 整体拖，松手后统一 commit 一次）。

---

### F2. 撤销 / 重做粒度精细化

**现状**：Gizmo 拖拽是一次完整操作 = 一条历史。但其他操作（属性面板数值输入）是每次 blur = 一条历史。

**可优化**：
- 属性面板的"连续编辑窗口"：500ms 内多次输入合并为一条历史。
- 复制 + 移动 + 旋转 合并为一条历史（当前是三步三条）。
- 环境切换（day → night）+ 地面配置 各自独立，但如果用户在 2 秒内连续改了环境和地面，应该合并。

---

### F3. 运行时撤销 vs 历史深度

**现状**：历史快照上限硬编码 50 条。

**问题**：
- 50 条对复杂场景可能不够用，对简单场景又浪费内存。
- 历史快照存的是 **objects 数组的完整克隆引用**（zustand 的 `set` 会产生新引用），但 `SceneObject` 内部的 `Vector3Tuple` 是 `[number, number, number]`，每次 `updateObject` 都会 create 新数组。50 条历史 × 几百个对象 × N 个数组，内存增长快。

**建议**：
1. 提供设置页让用户调整历史上限（30 / 100 / 200）。
2. 历史快照存 diff 而不是全量快照（或用 immer 的 patch）。
3. 做 GC：对象被删除后，如果超过 N 条历史，可以丢弃更早的快照。

---

### F4. 相机书签（视角保存）

**现状**：正交视角只有三个预设，视角不可保存。

**建议**：
- Viewbar 加一个"保存当前视角"按钮，存到 localStorage。
- 支持命名视角、在 Viewbar 一键切换。
- 切换时平滑过渡（OrbitControls 的 target 和 position 插值）。

---

### F5. 对象对齐工具

**现状**：没有对齐能力。

**建议**：多选多个对象后，提供：
- 左对齐 / 右对齐 / 顶对齐 / 底对齐 / 前对齐 / 后对齐
- 水平居中 / 垂直居中
- 等距分布（水平 / 垂直）

实现方式：读取每个对象的包围盒（`group.getWorldBoundingBox`），计算目标位置，批量 `updateObject` + 一次 `commitHistory`。

---

### F6. 父子层级

**现状**：`SceneObject` 没有 parentId。右键菜单里"成组"按钮 disabled。

**影响**：
- 对象只能自由摆放，无法做"门挂在房子上"这种层级关系。
- 子对象 transform 跟随父对象但不受 Gizmo 单独控制（或者控制时是局部坐标）。

**建议**：
1. 类型里加 `parentId?: string`。
2. 序列化时用"扁平列表 + parentId"的形式（像 Blender 的 outliner），不破坏现有 JSON 契约。
3. 实现优先级：P2 （先把框选和多选做好再来做层级）。

---

### F7. R3F 的 Suspense / 加载态

**现状**：大 GLB 模型加载期间，视口是空白的——R3F 默认行为就是等待 `primitive` 渲染完成。

**建议**：
- 用 R3F 的 `Suspense` + `Canvas` 里的 `fallback`：
  ```tsx
  <Canvas>
    <Suspense fallback={<LoadingPlaceholder />}>
      {objects.map(...)}
    </Suspense>
  </Canvas>
  ```
- 或者在 ModelInstance 内部加一个加载状态 + 进度条（GLTFLoader 支持 `onProgress`）。

---

### F8. PNG 截图 / 静态 HTML 导出

**现状**：`SaveMenu` 里有这三个按钮，但只有 UI，onMouseDown 后什么都不做。

**实现提示**：
- PNG 截图：`Canvas` 提供 `gl.domElement.toDataURL()`，直接 `a.download` 即可。透明截图需要 `Canvas` 的 `gl={{ alpha: true }}`。
- 静态 HTML：把当前场景序列化成 JSON 后，生成一个独立 HTML 文件，内嵌 Three.js CDN + 一份最小的 scene 渲染脚本。用户可以双击打开直接看到场景，不需要启动编辑器。

---

## 五、测试覆盖建议

项目当前零测试。优先级：

| 模块 | 建议 |
|------|------|
| `sceneIO.ts` 的 `parseSceneJSON` | 高价值：覆盖所有校验分支（版本不匹配、字段缺失、类型错误、部分容错） |
| `editor.ts` 的 `pushSnapshot` / `undo` / `redo` | 核心逻辑：验证历史深度截断、级联删除资产撤销、重做恢复 |
| `objectFactory.ts` | 纯函数：创建对象 ID 格式、命名、复制偏移 |
| `assets.ts` 的重链逻辑 | 文件名匹配、同一个 target 不重复入库、缺失目标数 > 0 但 files 为空 |

推荐工具链：Vitest + React Testing Library。

---

## 六、技术栈评估与建议

| 依赖 | 版本 | 建议 |
|------|------|------|
| React | 19.3.1 | 保持，最新 LTS |
| @react-three/fiber | 9.8.2 | 保持，配合 drei 稳定 |
| @react-three/drei | 10.7.9 | 保持 |
| three | 0.187.0 | 保持 |
| zustand | 5.1.0 | 保持；考虑用 `subscribeWithSelector` middleware 解决 T2 问题 |
| lucide-react | 1.74.0 | 保持 |
| vite | 8.3.6 | 保持 |
| typescript | 7.0.2 | ⚠️ 注意 TypeScript 7 是 beta，生产环境建议锁定到 5.x 稳定版；如果是作者主动要尝鲜可以不动 |
| idb-keyval | 6.3.0 | 保持，IndexedDB 极简封装够用 |

**新增建议**：
- `zustand/middleware` 的 `subscribeWithSelector`：让组件只订阅需要的字段（例如 `s.objects.find(...)` vs 全量 `s.objects`）。
- `lz-string`：如果做自动草稿压缩。
- `vitest` + `@testing-library/react`：测试。

---

## 七、路线图建议

```
2026-Q4（近期）
  ├── T1  sceneIO 校验容错化
  ├── T2  Gizmo 拖拽减少 store 写入
  ├── T4  TransformControls 绑定时序修复
  ├── T6  自动草稿溢出提示
  └── A1  Scene.tsx 拆文件

2027-Q1（中期）
  ├── F1  多选 & Ctrl/Shift 点击
  ├── F2  撤销粒度精细化
  ├── F7  模型加载态
  ├── F8  PNG 截图 + 静态 HTML 导出落地
  ├── T3  templateCache LRU
  └── MaterialConfig discriminated union（A2）

2027-Q2（远期）
  ├── F3  历史快照 diff 化
  ├── F5  对齐工具
  ├── F6  父子层级
  ├── A5  EditorController 顶层协调器（解决 T5）
  └── 测试覆盖 sceneIO + editor store
```

---

## 八、备注

本文档基于当前代码审计。部分问题（如 T1/T2/T4）是明确的代码设计瑕疵，建议近期修复；部分功能缺口（F1/F2/F5/F6）需要产品决策优先级后再排期。如果后续补充了 PRD 或用户反馈，可以把文档中"建议"部分对应更新为具体的验收标准。
