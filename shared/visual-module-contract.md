# Visual Module Contract v1

MVP 中后端 agent 只能生成 `foreground` three.js 前景模块。前端 runtime 拥有 canvas、renderer、scene、camera 和 render loop。

## Envelope

```json
{
  "type": "visual_module",
  "apiVersion": "1",
  "moduleId": "bass-orb-001",
  "targetLayer": "foreground",
  "duration": 30,
  "transitionSeconds": 4,
  "code": "export function createVisualModule(api) { ... }"
}
```

## 模块入口

```js
export function createVisualModule(api) {
  return {
    init() {},
    update(frame) {},
    dispose() {},
  }
}
```

## 硬边界

- 模块不能操作 DOM。
- 模块不能创建 canvas、renderer、scene、camera。
- 模块不能启动自己的动画循环。
- 模块不能发起网络请求。
- 模块不能异步加载未知资源。
- 校验失败必须拒绝模块，保留当前画面。
