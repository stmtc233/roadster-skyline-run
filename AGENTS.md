# AGENTS.md

Roadster · 公路飞跃：手机竖屏的 Three.js 无尽公路小游戏。纯静态网页，无构建、无依赖安装；`dist/` 既是源码也是发布产物。玩家说明见 `README.md`。

## 常用命令

- 测试：`npm test`（即 `node --test tests/*.test.mjs`，Node 22，无需 `npm install`）。
- 本地运行：`npm run dev`，然后打开 http://127.0.0.1:4173/ 。ES 模块必须走 HTTP，不能直接双击 HTML。
- Three.js 固定为 0.180.0，只在 `dist/index.html` 的 import map 里配置，从 BootCDN 加载（`three.module.js` 和它引用的 `three.core.js`）。升级时两者必须同源、同版本。
- 访问不到 BootCDN 时（例如云端沙盒），可以在别处 `npm i three@0.180.0`，再用 Playwright 的 `page.route('https://cdn.bootcdn.net/**', …)` 把请求转到本地 `node_modules/three/build/`。不要为了测试去改 import map。

## 模块分工

| 文件 | 职责 |
|---|---|
| `dist/game.js` | 纯规则模拟，不碰 DOM 和 Three.js，可在 Node 中直接测试 |
| `dist/scene.js` | `createScene(canvas)` → `{render(state,dt), resize()}`，只读游戏状态 |
| `dist/models.js` | 车辆和电池模型工厂；没有 `document` 时跳过画布徽标，能解析 `three` 的 Node 环境里也可实例化 |
| `dist/app.js` | 触屏/键盘输入、HUD、暂停与倒数、记录存储，串起其他模块 |
| `dist/audio.js` | WebAudio 引擎声与风声，必须在用户手势之后才创建 |
| `tests/game-v2.test.mjs` | 规则测试 |
| `tests/pilot.mjs` | 测试用的前瞻自动驾驶，用于生存测试 |

## 模拟约定（`dist/game.js`）

- 单位：米、秒；`speed` 为 km/h，换算 `v = speed / 3.6` m/s。
- 坐标：`x` 横向，三条车道中心为 `-4 / 0 / 4`（`lane` 为 `-1 / 0 / 1`）；`z` 为相对玩家的纵向距离，正值在前方，玩家在 `z = 0`。`scene.js` 把模拟的 `z` 映射为场景的 `-Z`。
- 固定步长 `1/120` s；`update(dt)` 单帧最多吃进 0.1 s，30/60/120 Hz 结果必须一致。
- 车速由 `SPEED`（`start` / `top` / `ramp`）决定，是时间的函数；`pace` getter 给出 0–1 的速度进度，镜头、风线和风声都读它。调手感先改 `SPEED`。
- 气量与飞行：喷气每秒耗 25，地面每秒回 24；上升 8.5 m/s，下降 6 m/s，高度上限 8 m。气量耗尽后必须松手才能再次起飞。变道横移 13 m/s。
- 危险事件 `front` / `rear` / `battery`，同一时间最多一个未解决事件。从出现到接触的时间按秒设计（前后车约 2.1 s，电池约 3 s），不随车速变化，提速不会压缩反应时间。
- `spawn(kind)` 在入场区域被占用时返回 `null`，自动生成会在 0.2 s 后重试；不要为了腾位置删掉玩家已经看到的车。
- `obstacles()` 汇总普通车、特殊事件和停车的 SUV；生成普通车时的占位检查覆盖它返回的全部障碍。
- 警告文案在 `WARNINGS` 中，后车文案必须保持「后方车辆刹车断裂」。

## 渲染约定（`dist/scene.js`、`dist/models.js`）

- 渲染器只读状态，不写回模拟；每帧不要新建对象，场景物件用 InstancedMesh 或对象池。
- 后视镜按 `#mirror-view` 的矩形用 scissor 视口单独渲染；该渲染过程中要隐藏玩家车和风线。
- 矮屏（高度 < 844px）由 compact 镜头逻辑压低视角，保证玩家车留在底部操作区上方。改镜头后至少检查 390×844 和 375×667。
- 模型接口：`createSedan({color, braking})`；车辆的 `userData.wheels` 用于转轮；MPV/SUV 的 `userData.hazardLights` 是 6 个各自独立材质的双闪灯；轿车的 `userData.brakeLights` 是刹车灯。

## 输入约定（`dist/app.js`）

- 起飞按钮和滑动变道各自跟踪独立的指针，按住飞行时可以另一根手指滑动；松开起飞不能取消另一根手指的滑动。
- `pointercancel`、`lostpointercapture`、窗口失焦、切到后台都会暂停；继续时倒数 3 秒。
- `localStorage`（`roadster-best`、`roadster-muted`）读写都包在 try/catch 中，存储不可用时游戏照常运行。

## 测试注意事项

- 改车速、生成或碰撞后，`attentive lane pilot survives varied high-speed traffic` 和顶速防穿透测试必须通过。不要放宽断言来让测试变绿。
- `tests/pilot.mjs` 用 `Object.assign` 复制游戏实例的自有属性来做前瞻预测。不要在传给 `drive()` 的实例上猴子补丁方法（例如包一层 `step`），否则补丁会被复制进预测副本并改动真实对局。
- 调整玩法数值时，除了 `npm test`，最好再用更多随机种子、从开局和顶速分别跑几分钟 `drive()`，确认仍然可以存活。

## 代码风格

- 原生 ESM，无打包、无框架、无运行时依赖。
- 贴合所在文件的写法：`game.js`、`app.js` 是紧凑的单行风格（`game.js` 缩进 1 空格），`scene.js`、`models.js`、`audio.js` 缩进 2 空格。
- 代码注释用英文，界面文案用中文。
- 玩法规则或数值有变化时，同步更新 `README.md` 的「怎么玩」。
- 提交信息用英文，首行是祈使句摘要。
