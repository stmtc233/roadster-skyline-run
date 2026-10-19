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
- 时间：`time` 只在行驶时走，决定车速和危险节奏；`clock` 在撞车后的滑行阶段也继续走，用于车灯闪烁、变道计时等动画和车辆脚本。
- 距离：`distance` 是成绩，撞车瞬间冻结；`travel` 是画面滚动用的实际行驶距离，撞车后随滑行继续增加。
- 车速由 `SPEED`（`start` / `top` / `ramp`）决定，是时间的函数；`pace` getter 给出 0–1 的速度进度，镜头、风线和风声都读它。调手感先改 `SPEED`。
- 气量与飞行：喷气每秒耗 25，地面每秒回 24；上升 8.5 m/s，下降 6 m/s，高度上限 8 m。气量耗尽后必须松手才能再次起飞。变道横移 13 m/s。
- 所有车辆都在 `traffic` 里（`model` 为 `sedan` / `suv` / `mpv`），各自有真实车速、跟车刹车、转向灯变道（`signal` 先闪 `SIGNAL` 秒再横移）。弹出的电池在 `batteries` 里。`obstacles()` 返回两者合集。
- 车与车接触时按质量交换动量，双方进入 `crashed`：打双闪、打转、以 `SLIDE` 减速滑行到停，之后作为事故车留在原地成为障碍。司机看到事故车或急停车会紧急刹车，并尽量变道绕开。
- 危险事件只有 `front`（急刹）/ `battery`（双闪急停后弹出电池）/ `rear`（后车刹车失灵）。并线是普通车流的行为，不算危险事件。
- 节奏：同一时间最多一个排队中的事件、两个进行中的事件；相邻两个危险撞到玩家的时刻（`contactAt`）至少相隔 `spacing` 秒（开局 2.2 s，一分钟后收紧到 1.2 s）。
- 危险都来自路上已有的车：`plan()` 先挑一辆车（`stage: 'planned'`），等玩家靠近到 `gain()` 算出的距离再触发，让从第一个视听信号到接触的时间固定为 `CUE` 中的秒数，不随车速变化。排队中的车会按玩家当前所在车道改做还能做的事（同车道急刹，相邻车道的 SUV 弹电池），做不了就放弃重排。只有刹车失灵的 MPV 从玩家身后（主镜头外）出现，而且要求身后车道是空的。
- 新车只在 210 m 以外的雾里出现，开局车辆由 `OPENING` 预先摆好。不要在玩家看得见的地方凭空放车或删车。
- `spawn(kind)` 只给测试用：立刻在触发距离上摆出一个危险。正式游戏不调用它。
- 普通车会打灯并线到玩家前方，但从开始打灯到玩家撞上至少要有 `MERGE`（3 s），由 `laneClear` 保证。
- 玩家撞车后 `phase` 立即变为 `over`，但模拟继续跑约 1.5 s 的滑行（`settled` 变为 true 才结束），界面在此之后才弹出结果。
- 声音提示通过 `cues` 队列交给界面（`screech` / `crash` / `impact` / `eject`）；刹车失灵的车 `horn` 为 true 时持续鸣笛。
- `HINTS` 是每种危险第一次出现时的一句提示；之后不再有横幅，只靠刹车灯、转向灯、双闪、喇叭和后视镜。

## 渲染约定（`dist/scene.js`、`dist/models.js`）

- 渲染器只读状态，不写回模拟；每帧不要新建对象，场景物件用 InstancedMesh 或对象池。
- 后视镜是车内镜：按 `#mirror-view` 的矩形用 scissor 视口单独渲染，并把整个场景 `scale.x = -1` 做左右镜像（这样 three.js 的面剔除和光照仍然正确），渲染完立刻恢复。镜像渲染时隐藏玩家车、玩家阴影和风线。
- 车辆按 `model` 分池复用；刹车灯、转向灯/双闪、失控车的闪灯都由模拟里的 `brake` / `signal` / `hazard` / `horn` 驱动。
- 矮屏（高度 < 844px）由 compact 镜头逻辑压低视角，保证玩家车留在底部操作区上方。改镜头后至少检查 390×844 和 375×667。
- 模型接口：`createSedan({color, braking})`；车辆的 `userData.wheels` 用于转轮；`userData.hazardLights` 是各自独立材质的琥珀色灯（按 `position.x` 的正负区分左右，兼作转向灯）；`userData.brakeLights` 是刹车灯（材质的 `userData.base` 是平时亮度）；轿车的 `userData.paint` 用于复用时换色；MPV 的 `userData.headLight` 用于闪大灯。

## 输入约定（`dist/app.js`）

- 起飞按钮和滑动变道各自跟踪独立的指针，按住飞行时可以另一根手指滑动；松开起飞不能取消另一根手指的滑动。
- `pointercancel`、`lostpointercapture`、窗口失焦、切到后台都会暂停；继续时倒数 3 秒。
- `localStorage`（`roadster-best`、`roadster-muted`、`roadster-hints`）读写都包在 try/catch 中，存储不可用时游戏照常运行。

## 测试注意事项

- 改车速、生成或碰撞后，`attentive lane pilot survives varied high-speed traffic` 和顶速防穿透测试必须通过。不要放宽断言来让测试变绿。
- `tests/pilot.mjs` 复制游戏实例的自有属性来做前瞻预测，数组里的对象会浅拷贝。车辆、事件、电池都要保持扁平（只放原始值，用 id 互相引用），否则预测副本会改动真实对局。也不要在传给 `drive()` 的实例上猴子补丁方法，补丁同样会被复制进预测副本。
- 测试里改了 `time` 之后先 `update(1/120)` 一次，让 `speed` 跟上，再调用 `spawn()`。
- 调整玩法数值时，除了 `npm test`，最好再用更多随机种子、从开局和顶速分别跑几分钟 `drive()`，确认仍然可以存活。

## 代码风格

- 原生 ESM，无打包、无框架、无运行时依赖。
- 贴合所在文件的写法：`game.js`、`app.js` 是紧凑的单行风格（`game.js` 缩进 1 空格），`scene.js`、`models.js`、`audio.js` 缩进 2 空格。
- 代码注释用英文，界面文案用中文。
- 玩法规则或数值有变化时，同步更新 `README.md` 的「怎么玩」。
- 提交信息用英文，首行是祈使句摘要。
