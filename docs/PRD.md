# 模型摆场工具 · 产品需求文档

> 本文档是项目唯一需求依据。
> 一句话定位：**把本地 3D 模型导入浏览器，摆成场景，导出 JSON，交给自己的 three.js 页面渲染。**
> 纯前端、单用户、无后端；后续能力按真实痛点扩展，不超前设计。

---

## 1. 产品合同

| 维度 | 内容 |
| --- | --- |
| 核心流程 | 导入模型 → 资产库添加实例 → 吸附摆齐 → 导出 JSON → 渲染端按契约加载 |
| 资产形态 | 使用者运行时导入 GLB / GLTF / FBX，文件本体存 IndexedDB，刷新自动恢复 |
| 场景产物 | 纯 JSON（schema 2.1），只存资产引用（id + 文件名）与环境快照，不含模型文件、不含 blob URL |
| 渲染端 | 独立工程，按"约定目录 + 文件名"加载模型并应用变换（契约见 §5） |
| 完成标志 | 导入模型 → 摆放 → 刷新不丢 → 导出 JSON → 渲染端用同名文件还原场景 |
| 明确边界 | 不做后端与账号、不做桌面客户端、不做模型材质级编辑、不做建模能力 |

---

## 2. 功能现状（已完成）

以下功能已在代码中实装，作为新功能的底座直接复用：

### 2.1 场景编辑

- **几何体对象**：11 种预设几何体（长方体/球体/圆柱/圆锥/圆环/四面体/八面体/平面/Ring/圆环结/胶囊），点击资源库卡片添加，自动选中、按类型递增命名。
- **视口拾取**：点击选中、空白取消；相机拖拽不误触（4px 位移阈值）；锁定对象跳过拾取。
- **Gizmo 变换**：平移/旋转/缩放三模式（W/E/R 切换），拖拽实时写回、结束提交一条历史，缩放下限 0.01。
- **属性面板**：名称/颜色/位置/旋转(弧度)/缩放/可见双向绑定，blur/Enter 提交、Esc 回退，Vec3 一键重置。
- **对象列表**：名称搜索、显隐开关、锁定开关、复制/删除按钮、右键菜单（重命名/复制/锁定/删除）、居中重命名弹窗、拖拽排序（已实装，随本期验收）。
- **锁定**：视口跳过拾取、删除需先解锁、列表与面板均可切换。
- **撤销/重做**：历史栈 50 条，覆盖添加/变换/属性/删除/显隐/锁定/清空等写操作（Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y）。
- **清空场景**：二次确认，可撤销。

### 2.2 材质与环境

- **材质系统**：几何体支持 basic / phong / standard / normal 四种材质，参数按类型保留；全局线框强制覆盖，对象私有线框仅在对应材质下生效。第三方模型没有对象私有材质，仅受全局线框控制，切回实体时恢复文件自带材质。
- **环境预设**：日间/夜晚/工作室/无，天空/网格/光照/阴影联动；地面为环境元素（开关 + 颜色）。
- **视图控制**：透视与前/顶/右正交相机切换，实体/线框切换（视图状态不入历史、不进草稿）。

### 2.3 持久化与通用 UI

- **JSON 导入/导出**：schema 2.1（仅接受当前版本），导出带时间戳文件名，导入校验失败不改动场景。
- **自动草稿**：历史快照时静默写 localStorage，下次进入询问恢复，放弃即清除。
- **快捷键体系**：W/E/R、Delete、Ctrl+D、Ctrl+Z/Y、`?` 打开帮助（Esc/遮罩关闭）。
- **通用 UI**：Toast（顶部、去重、自动换行）、暗色确认弹窗、fixed 居中弹窗体系。

---

## 3. 本期需求（待完成）

三个里程碑，按顺序实施，各自独立可验收。

### M1 · 模型资产（导入 + 持久化 + 实例化）

**资产模型**

- 资产 = 入库的模型文件，可反复实例化；实例 = 场景中的摆放对象，只存 `asset` id 与 `file` 文件名引用。
- 资产记录：`id`（asset_ + 8 位 hex）、`name`（默认文件名去扩展名）、`fileName`、`format`（glb/gltf/fbx）、`size`、`unitScale?`（FBX 单位补救，默认 1）、`blob`、`createdAt`。
- 存储：IndexedDB（新增 idb-keyval 依赖）；blob URL 仅运行时由资产 store 创建/回收，**禁止进入任何持久化**。

**导入**

- 资源库「导入模型」卡片 → 文件选择器，多选，接受 .glb/.gltf/.fbx。
- 判重：`fileName + size` 相同跳过并 Toast；同名不同 size 允许共存。
- 格式提示：`.gltf` 外部资源与 FBX 外链贴图在 blob URL 下不可用，引导使用自包含 `.glb`。

**资源库**

- 两区：模型资产（上）/ 几何体（下，可折叠）；资产卡片点击添加实例并自动选中，卡片悬停提供删除入口。
- 资产卡片固定 88px 宽，列数随侧栏宽度自适应；长文件名在卡片内省略，不撑破网格。几何体区共用同一网格规格。
- 删除资产：无引用直接删；有 N 个实例引用时确认后级联删除，合并一条历史可撤销。

**渲染与面板**

- 模型实例与几何体走同一 group 变换/拾取/Gizmo 通路；同资产多实例必须 clone；加载失败或资产缺失时渲染半透明占位盒 + 名称，不阻塞画布。
- 属性面板：模型实例隐藏颜色与材质区，显示只读资产信息；缺失时显示警示与重链入口。

**缺失重链**

- 实例引用的资产在本地库不存在（导入他人 JSON / 清库 / 换浏览器）：实例占位、资源库出现「N 个资产缺失」入口；多选文件按 `fileName` 匹配，以原 asset id 入库，实例自动恢复。

### M2 · 网格吸附

| 项 | 规则 |
| --- | --- |
| 平移 | Gizmo 拖拽按网格步进（TransformControls `translationSnap`） |
| 旋转 | 90° 步进（`rotationSnap = Math.PI / 2`）；缩放不吸附 |
| 手动输入 | 属性面板精确输入不吸附 |
| 网格大小 | 0.25 / 0.5 / 1 / 2 可选，默认 1；Grid `cellSize` 联动 |
| 复制偏移 | 吸附开启 = 1 个网格单位，关闭 = +0.5 |
| 开关与状态 | 默认开启；`G` 切换；Viewbar 磁铁开关 + 大小下拉 + 状态栏提示 + 帮助表更新 |
| 持久化 | view store 管理；不写历史、不进 JSON、不进草稿 |

### M3 · JSON 契约 2.1

- 序列化升级 2.1：模型对象输出 `asset` + `file`，无 color/material；几何体结构不变。
- 环境升级 2.1：`environment` 输出解析后的具体值（background / fog / lights / ground.size），外部应用无需复刻编辑器预设表。
- 仅接受 2.1；1.1 / 1.2 / 2.0 等旧版本整文件拒绝并提示（开发期不做旧版本兼容）。
- 模型对象 asset/file 缺失或非法则整文件拒绝。
- 导出时存在缺失资产实例：照常导出 + Toast 提醒接收方需准备同名文件。
- README 补渲染端消费说明（约定目录 + 按 file 加载的最小伪码）。

---

## 4. 数据模型

```ts
interface BaseObject {
  id: string; name: string
  position: [number, number, number]
  rotation: [number, number, number]   // 弧度，欧拉顺序 XYZ（Three.js 默认）
  scale: [number, number, number]
  visible: boolean; locked: boolean
}
interface PrimitiveObject extends BaseObject {
  type: PrimitiveType                  // 现有 11 种几何体
  color: string; material: MaterialConfig
}
interface ModelObject extends BaseObject {
  type: 'model'
  asset: string                        // 资产 id（编辑器内部键）
  file: string                         // 原始文件名（渲染端契约键）
}
type SceneObject = PrimitiveObject | ModelObject

interface SceneEnvironmentConfig {
  sky: 'day' | 'night' | 'studio' | 'none'   // 预设提示字段，渲染端可忽略
  background:
    | { type: 'color'; color: string }
    | { type: 'sky'; sunPosition: [number, number, number]; turbidity: number; rayleigh: number }
    | { type: 'transparent' }
  fog: { color: string; near: number; far: number } | null
  lights: {
    ambient: { intensity: number }
    directional: {
      color: string; intensity: number
      position: [number, number, number]
      castShadow: boolean
    }
  }
  ground: { visible: boolean; color: string; size: number }
}
```

- 环境预设（`day / night / studio / none`）的唯一真源是 `src/lib/environmentPresets.ts`，视口与导出共用同一份配置。
- 吸附开关、网格大小属于视图偏好，不进入环境快照，也不进 JSON（PRD M2）。

- 模型实例默认：`position [0,0,0]`、`rotation [0,0,0]`、`scale [unitScale × 3]`；原点/朝向由资产制作约定负责，编辑器不自动居中/落地。
- 实现可退化为单接口 + 可选字段，但 JSON 输出必须遵守 §5 契约。

---

## 5. JSON schema 2.1（渲染端契约）

```json
{
  "version": "2.1",
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
    }
  ],
  "environment": {
    "sky": "night",
    "background": { "type": "color", "color": "#0a0e1a" },
    "fog": { "color": "#0a0e1a", "near": 20, "far": 60 },
    "lights": {
      "ambient": { "intensity": 0.15 },
      "directional": {
        "color": "#7eb8da",
        "intensity": 0.4,
        "position": [10, 20, 10],
        "castShadow": true
      }
    },
    "ground": { "visible": true, "color": "#475569", "size": 20 }
  }
}
```

1. **坐标系**：Three.js 右手系，Y 向上；旋转弧度，欧拉顺序 XYZ（与 Three.js 默认一致）。
2. **单位**：1 世界单位 = 网格 1 格（建议 1 单位 = 1 米，资产制作约定）。
3. **渲染端加载**：模型文件由使用者自行管理，渲染端按 `约定目录 + file` 加载（如 `loadModel('/models/' + obj.file)`），应用 position/rotation/scale；`asset` 可忽略。
4. **环境**：`background / fog / lights / ground` 已是解析后的具体值，直接套用即可；`sky` 仅作提示，渲染端可忽略。`lights` 属于可选消费，外部应用有自己的美术方向时可覆盖。
5. **分享场景**：JSON + 模型文件一起分发；编辑器接收方走缺失重链，渲染端保证约定目录存在同名文件。
6. **字段容忍**：`locked` 为编辑器状态可忽略；`environment` 可选消费；未知字段一律忽略。
7. **演进规则**：新字段必须可选 + 版本递增 + 渲染端忽略未知字段；已有字段语义不变。
8. **渲染端校验**：加载前检查 `version === "2.1"`、`objects` 为数组、模型对象必须带 `file`；加载失败的 `file` 汇总成一条错误上报，不逐条刷屏。校验失败应整体拒绝，不渲染半个场景。

---

## 6. 里程碑与手动验收

### M1 验收

导入 3 个模型（含 1 个 FBX、多选）→ 卡片添加实例 → 可拾取、Gizmo 可变换 → 同资产 3 实例互不影响 → 属性面板无材质区 → 切换全局线框时模型同步显示线框、切回实体恢复原材质 → 撤销/重做/复制/删除正常 → **刷新后资产库与场景自动恢复** → 有引用资产删除弹级联确认且可撤销 → 清库后实例缺失占位，批量重链恢复 → 重复导入同文件判重 Toast。

### M2 验收

吸附开启：拖拽按格步进、旋转 90° 步进；关闭恢复自由拖拽；切换网格大小 Grid 同步；手输 0.37 不被改写；复制偏移随开关变化；吸附操作不产生历史快照、不进 JSON；`G` 与帮助表一致。

### M3 验收

5 个模型实例 + 1 个几何体导出：字段符合 §5、无 blob URL → 重新导入还原一致 → 旧 1.1/1.2 文件被拒绝且场景不变 → 篡改 asset/file 拒绝并 Toast → 模拟接收方（清库导入 JSON）：缺失占位 → 批量导入文件全部恢复 → 草稿含模型实例刷新正常。

---

## 7. 后续扩展（暂缓，有痛点再立项）

### 7.1 已登记延后项

- 编辑效率：完整快捷键（方向键微调、全选）、多选与批量操作、分组/父子层级（层级可编辑后再考虑写进 JSON）。
- 资产增强：zip 场景包（JSON + 模型文件打包）、静态托管 URL 资产、File System Access API 自动重链、内置公共资产库、缩略图自动生成、资产重命名、容量管理。
- 场景表现：时间轴动画、PNG/静态 HTML 导出、灯光对象、视角书签（含相机状态持久化）。
- 工程：代码分割、自动化测试、性能优化、错误边界。
- 契约层：
  - `models + instances` 实例表：仅当出现“单实例覆盖资产属性”的真实需求时立项。
  - 导出浮点取整（4 位小数）：纯可读性与 diff 优化，不影响语义，优先级最低。
  - 压缩资产支持（DRACO / KTX2 解码器）：等素材实际出现压缩 GLB 再补。

### 7.2 已裁决不纳入 JSON

以下提案经评估后否决，后续不再重复讨论（论证见 `docs/scene-json-2.1.md`）：

- `rotationUnit` 字段：编辑器与渲染端共用契约文档，单位不存在误读；真正要保证的是欧拉顺序 XYZ。
- `assetRoot` 字段：约定目录属于部署配置，写进数据会破坏同一份 JSON 的跨目录复用。
- 稳定业务键 `key`：`id` 已随导出/草稿持久化且跨刷新不变，足够承担选中、高亮与替换。
- 网格与吸附：属于视图偏好，不进环境快照，也不进 JSON（M2）。

扩展规则：立项前先更新本文档；写入 JSON 的新字段遵守 §5 演进规则。

---

## 8. 资产制作约定（建议）

- 新资产统一自包含 `.glb`；FBX 仅作存量兼容（注意厘米单位，必要时配 unitScale）。
- 统一底部中心原点、正面朝向一致、1 单位 = 1 米。
- 文件名即契约键：不重复、不随意改名，放入渲染端约定目录。
