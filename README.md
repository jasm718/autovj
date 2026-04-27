# AutoVJ

AutoVJ 是一个 AI 驱动的实时 VJ 视频生成工具。它使用 Web 界面作为展示空间，让后端 agent 根据音乐状态实时生成受限的视觉渲染模块，由前端稳定运行、校验、挂载和渲染。

## MVP 目标

第一版只做一条主链路：

```text
音乐播放
  -> 前端实时音乐分析
  -> 后端 agent 生成受限整画布视觉模块
  -> 前端 Visual Runtime 校验并挂载模块
  -> p5.js 背景层 + three.js 前景层持续渲染
```

MVP 不做视频导出、不做复杂资产编辑器、不允许 agent 操作页面 DOM、不允许 agent 创建 WebGL 容器。

## 核心原则

- 前端是稳定的 Visual Runtime，负责 canvas、renderer、scene、camera 和 render loop。
- 后端 agent 只生成受限 Visual Module，不生成完整前端页面代码。
- p5.js 作为背景绘制层，由 AI 模块通过受限 API 决定画什么。
- three.js 作为前景层，承载 AI 实时生成的 3D 视觉模块。
- 页面不刷新，canvas 不重建，WebGLRenderer 不重建。
- 新旧视觉模块通过 crossfade 平滑切换。
- 任何校验失败都 failfast，拒绝新模块，不影响当前画面。

## 系统架构

```text
autovj/
├─ backend/
│  ├─ main.py
│  ├─ agent/
│  │  ├─ graph.py
│  │  ├─ prompt.py
│  │  └─ schema.py
│  ├─ strategy/
│  │  ├─ engine.py
│  │  ├─ validator.py
│  │  └─ capability.py
│  └─ realtime/
│     └─ websocket.py
│
├─ frontend/
│  ├─ src/
│  │  ├─ app/
│  │  │  └─ App.tsx
│  │  ├─ audio/
│  │  │  ├─ audioEngine.ts
│  │  │  └─ analyzer.ts
│  │  ├─ visual/
│  │  │  ├─ runtime.ts
│  │  │  ├─ moduleLoader.ts
│  │  │  ├─ moduleValidator.ts
│  │  │  ├─ visualApi.ts
│  │  │  ├─ background/
│  │  │  │  └─ p5Layer.ts
│  │  │  └─ foreground/
│  │  │     ├─ threeLayer.ts
│  │  │     ├─ modelRegistry.ts
│  │  │     └─ transition.ts
│  │  └─ realtime/
│  │     └─ socket.ts
│  └─ package.json
│
└─ shared/
   └─ visual-module-contract.md
```

当前仓库已完成 MVP 主链路的本地可运行实现：前端 runtime、受限 Visual Module API、模块校验/编译/回滚、Web Audio 音乐分析，以及后端 LangGraph agent 管线都已经接入。

## 本地运行

当前仓库支持 fresh clone 后直接启动 MVP 主链路：

- 后端：FastAPI + WebSocket。
- 前端：Vite + React + TypeScript。
- 当前页面会挂载 p5.js 背景层和 three.js 前景层，但不会内置预设视觉元素。
- 可以选择本地音频文件播放，也可以使用内置 demo 音频分析。
- 页面初始化时前端会自动连接后端 WebSocket；当你开始播放或切回 Demo 音频后，前端会每 30 秒发送音乐窗口摘要，后端会生成 Visual Module Envelope 并推回前端。

### 环境要求

- Node.js `>=18`
- Python `>=3.13`
- 建议安装 `uv`

如果本机 Python 不是 `3.13+`，`uv sync` 会自动下载项目所需的 Python 版本并创建 `.venv`。

### 1. 安装后端依赖

```bash
uv sync
```

### 2. 安装前端依赖

```bash
cd frontend
npm install
```

### 3. 启动后端

在仓库根目录执行：

```bash
uv run uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

后端健康检查：

```bash
curl http://127.0.0.1:8000/health
```

期望返回：

```json
{"status":"ok"}
```

### 4. 启动前端

在 `frontend/` 目录执行：

```bash
npm run dev
```

默认访问地址：

```text
http://127.0.0.1:5173/
```

如果后端 WebSocket 不在默认地址，可以通过环境变量覆盖：

```bash
VITE_AUTOVJ_WS_URL=ws://127.0.0.1:8000/ws npm run dev
```

### 5. 使用页面

打开页面后前端会自动接入后端 WebSocket，并在右侧 `Backend Timeline` 中显示关键链路日志。收到有效模块后，画布内容才会开始由 AI 决定。可选操作：

- 点击“选择本地音频”加载本地音频文件。
- 点击“播放 / 暂停”控制真实 Web Audio 播放。
- 点击“用 Demo 音频”切回内置 demo 分析。

连接后端后，右侧状态会显示：

```text
backend: server_ready
```

开始播放或切回 Demo 音频后，前端会发送 `music_window`，后端返回 `visual_module`，前端校验、编译、预热成功后平滑切入新模块。

### 6. 可选：接入模型 agent

当前版本要求配置真实模型；如果要让 LangChain 调用外部模型，可以设置：

```bash
AUTOVJ_AGENT_MODEL=<model-name> AUTOVJ_AGENT_PROVIDER=<provider> uv run uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

具体 provider 所需的 API key 和额外依赖取决于 LangChain 当前支持的模型供应商。后端会先校验输出；模型失败或输出不合规时，不会注入预设视觉，只会返回错误并保留当前画面。

## 渲染分层

```text
浏览器页面
├─ p5.js canvas
│  └─ 背景层：由当前 AI 模块通过受限 bg API 实时绘制
│
└─ three.js canvas
   └─ 前景层：3D 几何、粒子、灯光、后处理、AI 生成模块
```

前景 three.js canvas 使用透明背景叠加在 p5.js 背景上：

```ts
const renderer = new THREE.WebGLRenderer({
  alpha: true,
  antialias: true,
})

renderer.setClearColor(0x000000, 0)
```

## 运行流程

```text
用户播放音乐
  -> Web Audio API 提取 energy / bassEnergy / beat / bpm
  -> 前端每帧驱动 p5.js 背景和 three.js 前景
  -> 前端每 30 秒发送音乐窗口摘要到后端
  -> 后端 agent 生成 Visual Module Envelope
  -> 前端校验 envelope 和代码
  -> 前端创建受限 api
  -> init 新模块
  -> hidden group 预热
  -> activeModule 与 nextModule crossfade
  -> dispose 旧模块
```

## Visual Module Envelope

后端不能只发送代码，必须发送完整 envelope：

```json
{
  "type": "visual_module",
  "apiVersion": "1",
  "moduleId": "bass-orb-001",
  "targetLayer": "canvas",
  "duration": 30,
  "transitionSeconds": 4,
  "code": "export function createVisualModule(api) { ... }"
}
```

字段约束：

- `type` 必须是 `visual_module`。
- `apiVersion` MVP 固定为 `1`。
- `moduleId` 必须唯一。
- `targetLayer` 当前版本固定为 `canvas`。
- `duration` 默认 `30` 秒。
- `transitionSeconds` 建议 `2-6` 秒。
- `code` 只能包含一个 `createVisualModule(api)`。

## Visual Module API v1

AI 只能生成这种模块：

```js
export function createVisualModule(api) {
  return {
    init() {},
    drawBackground(frame, bg) {},
    update(frame) {},
    dispose() {},
  }
}
```

生命周期约束：

- `init` 只初始化模块对象。
- `drawBackground` 只通过受限 bg API 绘制 p5 背景。
- `update` 只更新对象状态。
- `dispose` 只清理模块内部资源。
- 模块不能自己启动动画循环。
- 模块不能异步加载资源。
- 模块不能创建 renderer、canvas、scene、camera。

## 受限 API

前端只暴露受限 `api`，不暴露完整 `THREE`：

```ts
type VisualApiV1 = {
  root: SafeGroup

  createGroup(input?: {
    name?: string
  }): SafeGroup

  createMesh(input: {
    geometry: GeometryType
    material: MaterialType
    color: string
    opacity?: number
    size?: number
    radius?: number
    tube?: number
    width?: number
    height?: number
    depth?: number
    segments?: number
  }): SafeMesh

  createParticles(input: {
    count: number
    color: string
    size: number
    spread: number
    opacity?: number
  }): SafeParticles

  getModel(name: ModelName): SafeObject3D

  createLight(input: {
    type: 'point' | 'directional'
    color: string
    intensity: number
    x?: number
    y?: number
    z?: number
  }): SafeLight

  setCamera(input: {
    mode: 'static' | 'orbit' | 'push_pull'
    distance?: number
    height?: number
    speed?: number
  }): void

  setBloom(value: number): void
  setRgbShift(value: number): void
  setAfterimage(value: number): void

  color(value: string): SafeColor
  lerp(a: number, b: number, t: number): number
  clamp(value: number, min: number, max: number): number
  sin(value: number): number
  cos(value: number): number
  noise(x: number, y?: number, z?: number): number
}
```

允许的 geometry：

```ts
type GeometryType =
  | 'sphere'
  | 'box'
  | 'torus'
  | 'plane'
  | 'cone'
  | 'cylinder'
```

允许的 material：

```ts
type MaterialType =
  | 'basic'
  | 'standard'
  | 'emissive'
  | 'wireframe'
```

MVP 不允许 AI 创建自定义 `BufferGeometry`，也不允许自定义 shader。

## Frame 输入

runtime 每帧调用：

```ts
module.update(frame)
```

`frame` 结构：

```ts
type VisualFrame = {
  time: number
  delta: number
  progress: number

  audio: {
    energy: number
    bassEnergy: number
    midEnergy: number
    highEnergy: number
    beat: boolean
    beatStrength: number
    bpm: number
  }

  transition: {
    in: number
    out: number
  }
}
```

字段范围：

- `delta` 单位秒，runtime 应 clamp 到 `0-0.05`。
- `progress` 范围 `0-1`。
- `energy`、`bassEnergy`、`midEnergy`、`highEnergy` 范围 `0-1`。
- `beatStrength` 范围 `0-1`。
- `transition.in` 和 `transition.out` 范围 `0-1`。

## 合法模块示例

```js
export function createVisualModule(api) {
  const root = api.root

  const ring = api.createMesh({
    geometry: 'torus',
    material: 'emissive',
    color: '#00e5ff',
    radius: 1.2,
    tube: 0.12,
    opacity: 0.9,
  })

  const core = api.createMesh({
    geometry: 'sphere',
    material: 'standard',
    color: '#ff3d81',
    radius: 0.45,
    opacity: 0.85,
  })

  return {
    init() {
      root.add(ring)
      root.add(core)

      api.setCamera({
        mode: 'orbit',
        distance: 4,
        height: 1.2,
        speed: 0.25,
      })

      api.setBloom(0.6)
    },

    update(frame) {
      const bass = frame.audio.bassEnergy
      const high = frame.audio.highEnergy
      const pulse = 1 + bass * 0.35 + frame.audio.beatStrength * 0.25

      ring.rotation.x += frame.delta * (0.4 + high)
      ring.rotation.y += frame.delta * (0.7 + bass)
      ring.scale.setScalar(pulse)

      core.scale.setScalar(0.8 + frame.audio.energy * 0.6)
      core.material.setEmissiveIntensity(0.4 + high * 1.5)

      api.setRgbShift(frame.audio.beat ? 0.18 : 0.04)
    },

    dispose() {
      root.clear()
      api.setBloom(0)
      api.setRgbShift(0)
    },
  }
}
```

## 禁止内容

模块代码中禁止出现：

```text
import
export default
class
async
await
Promise
fetch
eval
Function
new Function
window
document
globalThis
self
requestAnimationFrame
setTimeout
setInterval
WebSocket
Worker
localStorage
sessionStorage
XMLHttpRequest
new THREE.WebGLRenderer
```

禁止原因：

- 不能操作 DOM。
- 不能创建页面生命周期。
- 不能创建新的渲染容器。
- 不能发起网络请求。
- 不能访问浏览器存储。
- 不能启动自己的循环。
- 不能异步加载未知资源。

## 资源限制

MVP 建议硬限制：

- 每个模块最多 `40` 个 mesh。
- 每个模块最多 `2` 个 particle system。
- 每个 particle system 最多 `3000` 个粒子。
- 每个模块最多 `4` 个 light。
- 代码长度最多 `12000` 字符。
- 禁止 `while`。
- `for` 循环必须是固定上限。
- 禁止超过 `2` 层循环嵌套。
- `init` 目标执行时间不超过 `16ms`。
- 单帧 `update` 目标执行时间不超过 `4ms`。

如果模块校验失败或执行失败，runtime 必须拒绝该模块并保留当前画面。

## 前端校验流程

```text
receive envelope
  -> validate envelope
  -> extract code
  -> parse AST
  -> reject forbidden syntax
  -> transform export function to factory·
  -> compile module
  -> create api sandbox
  -> call createVisualModule(api)
  -> call init()
  -> warmup update(frame)
  -> crossfade mount
```

这里不是绝对安全沙箱。MVP 面向本地工具或可信用户环境。如果未来开放公网使用，需要升级到更强隔离，例如 iframe sandbox 或其他独立执行环境。

## 后端 agent 职责

后端 agent 输入：

- 最近 30 秒音乐窗口摘要。
- 当前 active module 摘要。
- Visual Module API v1 文档。
- 可用模型和资产列表。
- 禁止语法列表。
- 目标时长和过渡时间。

后端 agent 输出：

- 一个 `Visual Module Envelope`。
- 代码中只包含 `createVisualModule(api)`。
- 不输出 Markdown。
- 不输出解释文本。
- 不输出完整页面代码。

后端也要先做一次校验，前端再做最终校验。不能信任模型输出。

## 音乐窗口摘要

前端每 30 秒向后端发送：

```json
{
  "windowSeconds": 30,
  "bpm": 128,
  "energy": 0.76,
  "bassEnergy": 0.82,
  "midEnergy": 0.5,
  "highEnergy": 0.63,
  "beatDensity": 0.7,
  "moodHint": "intense"
}
```

`moodHint` 只用于后端生成策略，不由前端直接解析。

## WebSocket 消息

前端发送：

```json
{
  "type": "music_window",
  "payload": {
    "windowSeconds": 30,
    "bpm": 128,
    "energy": 0.76,
    "bassEnergy": 0.82,
    "midEnergy": 0.5,
    "highEnergy": 0.63,
    "beatDensity": 0.7,
    "moodHint": "intense"
  }
}
```

后端成功返回完整 `Visual Module Envelope`，其中 `type` 为 `visual_module`。

后端校验或 agent 生成失败时返回：

```json
{
  "type": "agent_error",
  "message": "..."
}
```

前端收到 `agent_error` 只更新状态，不会卸载当前画面。

## 切换策略

runtime 维护两个模块槽：

```text
activeModule
nextModule
```

切换流程：

```text
nextModule 初始化到 hidden group
  -> nextModule opacity: 0 -> 1
  -> activeModule opacity: 1 -> 0
  -> 过渡结束
  -> dispose activeModule
  -> nextModule 变成 activeModule
```

模块切换不刷新页面，不重建 canvas，不重建 renderer。

## 阶段计划

### 阶段 1：项目骨架

- 搭建 FastAPI 后端。
- 搭建 Vite + React + TypeScript 前端。
- 建立 WebSocket 通道。
- 建立基础页面和全屏 canvas 容器。

### 阶段 2：前端 Visual Runtime

- 实现 p5.js 背景层。
- 实现 three.js 前景层。
- 实现 render loop。
- 实现 activeModule / nextModule 管理。
- 实现 crossfade。

### 阶段 3：Visual Module API v1

- 实现 `api.root`。
- 实现 `createMesh`、`createGroup`、`createParticles`、`createLight`。
- 实现 SafeObject 包装。
- 实现资源计数和限制。
- 实现模块生命周期。

### 阶段 4：模块校验

- 实现 envelope 校验。
- 实现 AST 禁止语法检查。
- 实现代码编译和加载。
- 实现失败回滚。

### 阶段 5：音乐分析

- 实现 Web Audio 播放。
- 实现 energy、bassEnergy、midEnergy、highEnergy。
- 实现 beat 检测。
- 每 30 秒生成音乐窗口摘要。

### 阶段 6：后端 agent

- 定义 prompt。
- 接入 LangGraph。
- 根据音乐窗口生成 Visual Module Envelope。
- 后端先校验输出。
- 通过 WebSocket 推送给前端。

## 当前状态

当前仓库已完成阶段 1-6 的 MVP 主链路：

- 阶段 1：FastAPI、Vite React、WebSocket 和基础页面已完成。
- 阶段 2：p5.js 背景层、three.js 前景层、render loop 和 crossfade 已完成。
- 阶段 3：Visual Module API v1、SafeObject、资源计数和生命周期已完成。
- 阶段 4：前端 envelope 校验、AST 禁止语法检查、代码编译加载和失败回滚已完成。
- 阶段 5：Web Audio 播放、频段能量、beat 检测和 30 秒音乐窗口摘要已完成。
- 阶段 6：后端 prompt、LangGraph 管线、后端校验和 WebSocket 推送已完成。

后续重点可以继续补强真实模型 provider 配置、更多视觉策略、资产加载、性能监控和打包体积优化。
