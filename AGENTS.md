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
| `dist/scene.js` | `createScene(canvas)` → `{render(state,dt), resize(), ready}`，只读游戏状态；`ready` 是材质预热 Promise，启动前等待 |
| `dist/models.js` | 车辆和电池模型工厂；没有 `document` 时跳过画布徽标，能解析 `three` 的 Node 环境里也可实例化 |
| `dist/app.js` | 触屏/键盘输入、HUD、暂停与倒数、记录存储，串起其他模块 |
| `dist/audio.js` | `AudioEngine` 负责 WebAudio 音效，`BackgroundMusic` 独立控制 `#bgm` 的媒体播放；两者都在用户手势后解锁 |
| `tests/game-v2.test.mjs` | 规则测试 |
| `tests/modes.test.mjs` | 两种模式、尾喷状态与普通模式的预警、生存及碰撞测试 |
| `tests/su7.test.mjs` | SU7 车流占比、蓝色车漆及不同模式和帧率下的碰撞、飞越测试 |
| `tests/slow-row.test.mjs` | 三车并排生成、同步减速、解散、飞越及混合车流生存测试 |
| `tests/pilot.mjs` | 测试用的前瞻自动驾驶，用于生存测试 |

## 模拟约定（`dist/game.js`）

- 单位：米、秒；`speed` 为 km/h，换算 `v = speed / 3.6` m/s。
- 坐标：`x` 横向，三条车道中心为 `-4 / 0 / 4`（`lane` 为 `-1 / 0 / 1`）；`z` 为相对玩家的纵向距离，正值在前方，玩家在 `z = 0`。`scene.js` 把模拟的 `z` 映射为场景的 `-Z`。
- 固定步长 `1/120` s；`update(dt)` 单帧最多吃进 0.1 s，30/60/120 Hz 结果必须一致。
- 时间：`time` 只在行驶时走，决定车速和危险节奏；`clock` 在撞车后的滑行阶段也继续走，用于车灯闪烁、变道计时等动画和车辆脚本。
- 距离：`distance` 是成绩，撞车瞬间冻结；`travel` 是画面滚动用的实际行驶距离，撞车后随滑行继续增加。
- 车速由 `MODES`（`start` / `top` / `ramp`）决定，是时间的函数；普通模式 `normal` 为 112→320 km/h，喷气模式 `jet` 沿用 `SPEED` 的 140→400 km/h，时间常数均为 28 s。`speedCurve` 读取本局配置；`pace` 是本模式的 0–1 速度进度，镜头、风线和风声都读它。初始车流的车速按模式同比缩放。
- `new Game({mode})` 默认普通模式；`start(mode)` 可切换并重开，省略时保留当前模式，未知模式退回普通模式。`mode` 保持字符串，配置存在模块级常量中；`boosting` 仅在喷气模式的 `running` 阶段为 true，不额外扣气。两种模式共用飞行、侧翻和计分规则。
- 气量与飞行：喷气每秒耗 25，地面和货车顶每秒回 20；上升 8.5 m/s，下降 6 m/s，高度上限 8 m。气量耗尽后必须松手才能再次起飞。变道横移 13 m/s。
- 空中变道参数在 `AIR_LANE`：每跨一条车道额外耗 25 气量，0.425 s 完成 360° 翻滚（`rollRemaining` / `rollDirection`），完成前不再接收变道。`moveLane()` 返回是否成功，拒绝、越界、暂停都不扣气。以 `altitude - deck() > .05` 判断空中，地面和货车顶免费；扣到 0 同样进入耗尽状态。动画只读模拟时间，暂停冻结，重开清空。
- 所有车辆都在 `traffic` 里（`model` 为 `sedan` / `su7` / `suv` / `mpv` / `m9` / `truck` / `semi`），各自有真实车速、跟车刹车、转向灯变道（`signal` 先闪 `SIGNAL` 秒再横移）。弹出的电池在 `batteries` 里。`obstacles()` 返回两者合集。车身尺寸都在 `BODY`；货车很长，凡是按车距判断的地方（`laneClear`、生成、`launchRear`）都要用 `length` 计算，不要写死车距。
- 车流比例在 `spawnTraffic`：轿车约一半，其中蓝色 SU7 为总车流的 8%、普通轿车 40%；MPV 和 M9 各约 1/7，iCAR SUV 约 1/10，货车约 1/7。新车有 35% 放在玩家当前车道，保证前方常有可能急刹的车。货车车速贴近玩家（0.70–0.78 倍），方便落上去。
- 并排慢车：`spawnTraffic` 在开局 15 s 后每次补车以 10% 概率尝试 `spawnSlowRow(v)`，三条车道各一辆，分别按普通车流比例随机选车型，共用 300–360 m 的生成距离及玩家当时速度 0.50–0.55 倍的巡航速度。三条车道须同时满足车距、前后车刹车距离、预计接触间隔和总数上限（前方最多 10 辆）；抽中后 `rowUntil` 最多等 5 s 空位，期间不补普通车，超时跳过。成功后 `rowAfter` 冷却 22 s，场上最多一组。`row` 是车辆的扁平布尔字段；成组时不主动并线，不被危险导演选中，`drive()` 用 `followSpeed()` 算出三辆车中最保守的速度统一减速，不绕过碰撞。三车全部通过或队列碰撞、不完整时解散，恢复普通规则；接近队列前导演暂停计划新的危险。后续普通车同样须留出对队列的刹车距离。
- 货车（`deck: true`）的车厢顶是高 `height`（3.9 m）的平台：`deck()` 给出玩家脚下的平台高度，存在 `floor` 里。判定和 `hit()` 一致：投影重叠且 `altitude + .1 >= height` 就站在上面，否则就是撞车。站在车厢顶上算落地，照常攒气；开过车头或变道离开后从车厢高度往下落。身后的车只在玩家低到会被撞时才把玩家当成前车（`leader()`），所以玩家站在货车顶上或从车上方飞过时，下面的车照常行驶。
- 急刹（每秒减速超过 6.5 m/s²）时 `flash` 为 true，刹车灯频闪；普通减速只是常亮。
- 车与车接触时按质量交换动量，双方进入 `crashed`：打双闪、打转、以 `SLIDE` 减速滑行到停，之后作为事故车留在原地成为障碍。司机看到事故车或急停车会紧急刹车，并尽量变道绕开。
- 危险事件有 `front`（急刹）/ `battery`（iCAR SUV 双闪急停后弹出电池）/ `rear`（V800 MPV 后车刹车失灵）/ `breakdown`（M9 悬挂断裂“崴脚”）/ `parked`（路边抛锚的 M9）。并线是普通车流的行为，不算危险事件。
- 节奏：同一时间最多一个排队中的事件、两个进行中的事件；相邻两个危险撞到玩家的时刻（`contactAt`）至少相隔 `spacing` 秒（开局 2.2 s，一分钟后收紧到 1.2 s）。
- 危险都来自路上已有的车：`plan()` 先挑一辆车（`stage: 'planned'`），等玩家靠近到 `gain()` 算出的距离再触发，让从第一个视听信号到接触的时间固定为 `CUE` 中的秒数，不随车速变化。几种都能做时按 `WEIGHT` 加权挑，急刹是主力，并尽量不和上一次同类（急刹除外）。排队中的车会按玩家当前所在车道改做还能做的事（同车道急刹或崴脚，相邻车道的 SUV 弹电池），做不了就放弃重排。
- 不需要特定前车的两种危险是补位：刹车失灵的 MPV 从玩家身后（主镜头外）出现，要求身后车道是空的；路边抛锚车由 `park()` 直接放在 215–400 m 外的雾里，`contactAt` 按 `arrival()` 算，两次之间至少隔 25 s。它们平时偶尔出现，只有前方 1.8 s 都没有可用的车（`wanting`）时才顶上来。
- 崴脚（`snap()`）：只有玩家车道里第一辆 M9 会发生。车辆进入 `mode: 'broken'`，`broken` 是断掉的车轮（1–4，对应模型 `userData.wheels` 的顺序），`brokenAt` 是断裂时刻；以 `DRAG` 拖地减速到停，同时向断轮一侧偏到 `drift`：外侧车道偏到路边（车道中心外 `SHOULDER` 米），中间车道只偏 0.9 m，始终不离开本车道。路边抛锚车也是 `broken` 状态、车速 0、`triangle` 为 true，停在外侧车道中心外 `SHOULDER` 米处，仍然挡住这条车道。
- 新车只在 210 m 以外的雾里出现，开局车辆由 `OPENING` 预先摆好。不要在玩家看得见的地方凭空放车或删车。
- `spawn(kind)` 只给测试用：立刻在触发距离上摆出一个危险。正式游戏不调用它。
- 普通车会打灯并线到玩家前方，但从开始打灯到玩家撞上至少要有 `MERGE`（3 s），由 `laneClear` 保证。
- 玩家撞车后 `phase` 立即变为 `over`，但模拟继续跑约 1.5 s 的滑行（`settled` 变为 true 才结束），界面在此之后才弹出结果。
- 声音提示通过 `cues` 队列交给界面（`screech` / `crash` / `impact` / `eject` / `scrape`）；刹车失灵的车 `horn` 为 true 时持续鸣笛。
- `HINTS` 是每种危险（以及第一次看到大货车）时的一句提示；之后不再有横幅，只靠刹车灯、转向灯、双闪、喇叭、火花和后视镜。

## 渲染约定（`dist/scene.js`、`dist/models.js`）

- 渲染器只读状态，不写回模拟；每帧不要新建对象，场景物件用 InstancedMesh 或对象池。
- 翻滚角度用模拟进度加 `accumulator` 的不足一步时间连续呈现；暂停时保留已显示的进度，避免清空累积时间造成倒跳。喷气材质在开始按钮启用前预热，透明双面气雾用 `forceSinglePass` 减少绘制。
- 横排四个尾部喷口和主动尾翼仅在喷气模式显示。尾部气雾由 `boosting` 驱动，暂停与碰撞时熄灭；尾翼由 `createRoadster()` 的 `userData.setWing(amount, enabled)` 控制，跟随开局前 1.1 s 的模拟时间平滑展开，暂停和碰撞时冻结，重开复位。几何体复用，和侧翻喷气一起预热；尾喷与尾翼跟随车身，不改变模拟速度或飞行气量。
- 后视镜是车内镜：按 `#mirror-view` 的矩形用 scissor 视口单独渲染，并把整个场景 `scale.x = -1` 做左右镜像（这样 three.js 的面剔除和光照仍然正确），渲染完立刻恢复。镜像渲染时隐藏玩家车、玩家阴影和风线。
- 车辆按 `model` 分池复用；刹车灯（`flash` 时频闪）、转向灯/双闪、失控车的闪灯都由模拟里的 `brake` / `flash` / `signal` / `hazard` / `horn` 驱动。急刹时车头下沉（视图自己平滑的 `pitch`）。
- 崴脚的 M9 每帧调用 `userData.setBroken(index, amount)`，`amount` 由 `clock - brokenAt` 在 0.3 s 内从 0 到 1；复用到正常车时用 `amount = 0` 复原。拖地时按模型对应轮位向后喷火花。M9 视图自带一个三角警示牌，只在 `triangle` 为 true 时显示，放在车后 32 m。
- 玩家影子落在 `floor` 上（站在货车上时在车厢顶）。
- 侧翻以车身中心为轴，起止平滑加减速、侧向喷气交叠切换；车身在 `altitude` 上叠加平滑抬升，中段保持平稳，避免落上货车时因 `floor` 改变而跳动；碰撞高度、HUD 和镜头仍读模拟的 `altitude`。
- 矮屏（高度 < 844px）由 compact 镜头逻辑压低视角，保证玩家车留在底部操作区上方。改镜头后至少检查 390×844 和 375×667。
- 模型接口：`createSedan({color, braking})`、`createSU7({color})`、`createSUV()`、`createMPV()`、`createM9()`、`createTruck()`、`createSemi()`、`createTriangle()`；车辆的 `userData.wheels` 用于转轮；`userData.hazardLights` 是各自独立材质的琥珀色灯（按 `position.x` 的正负区分左右，兼作转向灯）；`userData.brakeLights` 是刹车灯（材质的 `userData.base` 是平时亮度）；`userData.paint` 用于复用时换色；MPV 的 `userData.headLight` 用于闪大灯，M9 的 `userData.setBroken` 用于崴脚姿态。SU7 的轮胎半径为 `.355` m、轴距 3 m，独立截面车身和静态饰件按材质合并并缓存，车漆和左右转向灯材质按车独立。货车的车厢顶必须是正好 3.9 m 高的平面，和模拟里的 `BODY` 一致。车辆共享的几何体不要由场景 dispose。

## 输入约定（`dist/app.js`）

- 起飞按钮和滑动变道各自跟踪独立的指针，按住飞行时可以另一根手指滑动；松开起飞不能取消另一根手指的滑动。
- `pointercancel`、`lostpointercapture`、窗口失焦、切到后台都会暂停；继续时倒数 3 秒。
- 模式只在开始页切换，重开保留模式。`localStorage` 的 `roadster-mode` 保存选择，`roadster-best-normal` / `roadster-best-jet` 分别记成绩；旧 `roadster-best` 只用于读取喷气模式的历史成绩。静音和危险提示仍用 `roadster-muted`、`roadster-hints`。`roadster-music` 单独保存音乐开关（默认 `1` 开启）；不与音效静音联动。所有存储读写包在 try/catch 中，存储不可用时游戏照常运行。
- BGM 用独立 HTMLAudioElement，子 `<source>` 优先选 `dist/audio/bgm.webm`（Opus 32 kbps 受限 VBR / 48 kHz 立体声，约 817 KB），备用 `dist/audio/bgm.m4a`（AAC-LC 40 kbps / 32 kHz 立体声，约 991 KB，faststart）；两份都是约 3 分 7 秒的完整曲目。不要再添加音频元素的 `src` 属性，它会覆盖子 source 的格式选择。正常只下载浏览器支持的一个来源，`preload="none"` 按需加载，循环播放、音量 `.45`，不接入音效 master。主页右上角的圆形 `#music` 按钮位于 `#sound` 下方，其他阶段隐藏。只在用户点击开始或音乐开关后解锁，不强行自动播放。`phase()` 和窗口前后台事件统一通过 `syncMusic()` 控制暂停，继续倒数期间保持暂停；不要在动画帧里调用 `play()`。播放拒绝应被捕获，音频失败不影响游戏。

## 测试注意事项

- 改车速、生成或碰撞后，`attentive lane pilot survives varied high-speed traffic` 和顶速防穿透测试必须通过。不要放宽断言来让测试变绿。
- `tests/pilot.mjs` 复制游戏实例的自有属性来做前瞻预测，数组里的对象会浅拷贝。车辆、事件、电池都要保持扁平（只放原始值，用 id 互相引用），否则预测副本会改动真实对局。也不要在传给 `drive()` 的实例上猴子补丁方法，补丁同样会被复制进预测副本。
- 测试里改了 `time` 之后先 `update(1/120)` 一次，让 `speed` 跟上，再调用 `spawn()`。`spawn('parked')` 只在外侧车道有效，测试用 `staged()` 先把玩家移到右车道。
- 调整玩法数值时，除了 `npm test`，最好再用更多随机种子、从开局和顶速分别跑几分钟 `drive()`，确认仍然可以存活。

## 代码风格

- 原生 ESM，无打包、无框架、无运行时依赖。
- 贴合所在文件的写法：`game.js`、`app.js` 是紧凑的单行风格（`game.js` 缩进 1 空格），`scene.js`、`models.js`、`audio.js` 缩进 2 空格。
- 代码注释用英文，界面文案用中文。
- 玩法规则或数值有变化时，同步更新 `README.md` 的「怎么玩」。
- 提交信息用英文，首行是祈使句摘要。
