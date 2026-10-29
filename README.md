# dsh-whale-boot · 星海鲸跃

DeepSeek Harness 启动动画插件：**纯代码 Canvas 粒子星海 + 跃出水面的鲸鱼**，同步真实启动进度，零素材、零视频、包体几十 KB、第一个渲染帧就能开画。**不改 DSH 本体源码**，升级 DSH 不受影响。

> English: see [English](#english) below.

## 特性

- **星海鲸跃**：深蓝星云渐变 + 闪烁星野 + 缓缓上升的气泡 + 周期跃出海面的鲸鱼（尾鳍摆动、水花、拖尾、喷水、水下回游发光），全程 Canvas 程序化绘制
- **真实启动进度**：底部进度条直接读取内核启动页的 `--dsh-boot-arc`，与 DSH 自己的加载进度一致
- **三种主题**：星海（默认）/ 极光 / 流星，在设置里切换，刷新即生效
- **任意时刻跳过**：点击画面或按 Esc / 空格 / 回车立刻淡出进入界面
- **兜底不卡死**：内核启动失败时显示「启动失败，点击查看诊断」；启动超过 15 秒自动放行
- **尊重系统设置**：`prefers-reduced-motion: reduce` 时只画一帧静态画面，不做循环动画
- **设置面板**：主题、淡出时长、粒子数量、底部提示、总开关，都在「设置 → 插件」里
- **关掉即真关**：总开关关闭后连注入行都不会加，完全回到 DSH 原生启动页

## 安装

**设置 → 插件 → 添加插件**，输入框里贴以下任意一种，装完按提示重启：

| 贴什么 | 例子 |
|---|---|
| GitHub 仓库 | `https://github.com/lyc-create-blip/dsh-whale-boot` |
| npm 包名 | `dsh-whale-boot`（若已发布到 npm） |
| 本地目录 | 解压后目录的绝对路径 |

依赖（设置卡片要用的 `@deepseek-ai/schemastery@^3.18.4`）由 pnpm 自动装好，不用手改任何配置文件。

## 设置在哪里

**设置 → 插件 → 「插件配置」**，展开「星海鲸跃」卡片：

| 项 | 作用 |
|---|---|
| **开启启动动画** | 总开关。关掉后完全不注入，回到 DSH 原生启动页 |
| **主题** | 星海（深蓝星云 + 星野）/ 极光（流动极光飘带）/ 流星（不时划过的流星） |
| **淡出时长** | 0.6 / 1.2 / 2 / 3 秒，默认 1.2 秒 |
| **粒子数量** | 星星密度：60 / 110 / 160 / 220，默认 110（按屏幕面积自动折算） |
| **显示底部提示文字** | 默认开；关掉后底部不再显示「点击进入」提示 |

改完**刷新页面生效**，不用重启 DSH。

## 它是怎么接进去的

启动页的难点在于：内核在自己的启动脚本里**同步**构建原生启动页，晚一步就抢不到第一帧。本插件沿用 DSH 预留给外部插件的路径（与 `dsh-boot-animation` 相同）：

1. **Host 侧**（`entry.js`）：监听 `webserver/index-inject`，每次渲染 index 时在 `<head>` 里注入两行**解析阻塞**脚本——一行配置全局变量，一行启动屏源码。启动屏因此在内核构建启动页之前就接管了视口。
2. **启动屏**（`src/boot-screen.js`）：Canvas 绘制动画；用 `MutationObserver` 观察内核启动页 spinner 的 `--dsh-boot-arc` 同步进度；观察启动卡文字检测 `Failed to load plugins` / `did not activate` 失败渲染；暴露 `globalThis.__DSH_WHALE_BOOT__.clientReady()`。
3. **浏览器侧**（`lib/client.js`）：插件 bundle 被激活时第一件事就是调用 `clientReady()`——动画结束 + 内核就绪两个条件都满足才淡出；随后把设置卡片注册进 `plugins.item` 槽位（命名空间 = profile 补丁里的条目 id `dsh-whale-boot`）。
4. **设置**：`entry.js` 导出 `Config`（schemastery，全部字段 `.volatile()`），DSH 设置服务据此派生设置命名空间；浏览器侧通过 `configForms.whileServed` 挂载卡片，写入走 `mutate([{ op: 'set', ... }])`。

## 兼容与共存

- 要求 DSH `>=0.2.0-rc.2`
- 与视频版 `dsh-boot-animation` 互斥使用（两者都会替换原生启动页，装一个即可）
- 与 `@local/whale-boot`（启动**后**的浮层 splash）不冲突，但两个启动动画叠在一起没必要，建议二选一

## 常见问题

- **设置了但不生效**：改完设置要**刷新页面**（下一次 index 渲染才带上新配置）；总开关的「关」是下次加载生效。
- **看不到设置卡片**：确认 profile 里解析到的是 `@deepseek-ai/schemastery@^3.18.4`（`.volatile()` 从 3.18.4 才有）。Host 会在日志里留下对应告警。
- **启动失败卡在动画上**：动画会显示「启动失败，点击查看诊断」，点一下就能看到内核的失败报告。
- **动画没出现，只有原生启动页**：说明总开关被关掉了，或该页面是已启动后的重新加载（启动屏只在完整页面加载时出现一次）。

## 开发自检

```bash
# 语法检查（node 自带）
node --check src/boot-screen.js
node --check lib/client.js

# entry.js 导入 + 注入行为（tools/verify-entry.mjs，需先链接 schemastery）
node tools/verify-entry.mjs

# 启动屏无头冒烟测试（DOM 桩 + Canvas 桩，tools/smoke-boot-screen.mjs）
node tools/smoke-boot-screen.mjs

# 浏览器侧 bundle 自检（模块加载器桩 + 服务桩，tools/verify-client.mjs）
node tools/verify-client.mjs
```

---

## English

**dsh-whale-boot** is a DeepSeek Harness boot-animation plugin: a fully
procedural Canvas star ocean with a leaping whale, no video assets, a few
dozen KB, painting from the very first frame. It replaces the native boot
page, mirrors the kernel's real boot progress (`--dsh-boot-arc`) in a
progress bar, and dissolves into the app when the kernel reports ready —
click, Esc, Space or Enter skips at any moment.

- **Themes**: Nebula (default) / Aurora / Meteor, switchable in Settings →
  Plugins, applied on the next page load.
- **Settings**: theme, fade duration (0.6–3 s), particle density, bottom
  hint, master switch (off restores DSH's own boot page).
- **Safety nets**: startup-failure detection shows the diagnosis on click;
  a 15 s hold budget always releases the screen;
  `prefers-reduced-motion` draws a single static frame.
- **Install**: Settings → Plugins → Add plugin →
  `https://github.com/lyc-create-blip/dsh-whale-boot`, then restart as
  prompted. Requires DSH `>=0.2.0-rc.2`.

## License

MIT © 2026 [lyc-create-blip](https://github.com/lyc-create-blip)
