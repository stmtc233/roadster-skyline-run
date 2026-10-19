# Roadster Implementation Plan

> **For agentic workers:** Execute the coupled gameplay/UI work inline with executing-plans; delegate the isolated scene asset task under Sites guidance, then request a whole-project review.

**Goal:** Deliver the approved mobile single-touch endless highway flight game.
**Architecture:** Browser-local simulation independent of Three.js scene, DOM controller and sound. No server state; best distance stored locally with safe fallback. Static dist directory with vendored Three.js; private Sites publishing.
**Tech Stack:** JavaScript ESM, HTML/CSS, Three.js 0.180.0, node:test.
**Spec:** ../../../outputs/首版游戏方案.md

## Global Constraints
- Portrait mobile, daytime highway, fixed center lane; only hold-to-fly and release-to-land.
- Gas 100; burn 25/s; refill 15/s grounded; altitude 3.4 m; rise 0.4 s, fall 0.6 s. Exhaustion requires release before rearming.
- Speed starts at 80 km/h, asymptotically approaches 220. Distance / 10 floored is score.
- Exact rear warning: 后方车辆刹车断裂. Front braking and lateral battery events too.
- Models reference new Roadster, V800 MPV, iCAR 03T SUV; gameplay events are fictional.
- Pause on background/system cancellation, explicit 3 s resume countdown, local record, one-click restart, mute, and visual warnings.

## Task 1: Simulation and behavior tests
Files: dist/game.js, tests/game.test.mjs, package.json.
Interface: new Game({random=Math.random,autoSpawn=true}); start(), setHeld(boolean), pause(), resume(), update(dt). Public state is instance; state.phase ready/running/paused/over; time, distance, score, speed (km/h), gas, altitude, thrusting, events, dodged, cause. spawn(kind) creates event. Event fields: id, kind front/rear/battery, x meters, z meters positive ahead, height, length, width, age, resolved, sourceX. Front/rear render sedan/MPV; battery has source SUV in adjacent lane. Notice derived from nearest unresolved event.
- [ ] Write node:test fixtures exercising actual flight, ground recharge, exhaustion lock, pause, collision and distance. `g.start(); g.setHeld(true); for(let i=0;i<60;i++)g.update(1/60); assert.ok(g.altitude>3); assert.ok(Math.abs(g.gas-75)<1);` Test missing Game implementation fails before implementation.
- [ ] Implement fixed substeps <=1/120 s, real elapsed time up to 0.1 s per UI frame; skip paused time. Constant per-event relative closing speed chosen so contact occurs after >=2.2 s. Only generate next event after prior resolved + sufficient physical gap, allow recovery with reasonable control (not unlimited wasted gas).
- [ ] Run `node --test tests/game.test.mjs`; test all three hazards on ground (collision) and safely airborne (pass), 30/60/120 Hz parity, conservative automated pilot over many seeds/high speeds. Each realistic failure gets a behavioral regression.

## Task 2: Isolated 3D scene and vehicle assets
Files: dist/scene.js, dist/models.js. Read scene-brief.md. Consume Game state; export createScene(canvas) returning render(state,dt), resize(). Import local './vendor/three.module.js'. Models are visibly distinct, lighting shadows, highway scenery and rear camera. No mutation of Game state.
- [ ] Build Roadster, MPV and SUV from reusable geometries/materials with deliberate proportions and front/rear details. Smooth daytime scene, moving lane marks, simple hills and guardrails, land shadow and gas jets.
- [ ] Render gameplay hazard objects and source SUV in exact simulation positions; implement rear mirror inside DOM element #mirror-view with matching scissor camera viewport.
- [ ] Browser inspect at portrait and desktop sizes; cap device pixel ratio and geometry. Review source for scene/simulation agreement.

## Task 3: Mobile UI and integration
Files: dist/index.html, dist/style.css, dist/app.js, dist/audio.js.
- [ ] Build HUD, distinctive title/start panel, gas bar and large hold control, three warnings, mirror frame, pause/countdown and result dialog.
- [ ] Pointer capture on thrust button, one active pointer, release only active pointer; pointercancel/lost focus pause. Space as desktop equivalent. Native touch scrolling disabled inside game.
- [ ] Bind state to scene + HUD. Sound only after user start gesture, mute persisted, no autoplay. Best record storage exceptions must not prevent play. Render loading/failure states including absent WebGL.
- [ ] Verify real UI with browser tools and independent headless automation when available: start, flight release, all warnings, restart, pause, viewport, mute, persistence. Screenshots are inspected before delivery.

## Task 4: Review, packaging and private publication
- [ ] Independent reviewer reads spec and code, verifies substantive gaps and state/model math. Fix actionable issues and rerun affected tests.
- [ ] Use Sites source helper to commit/push exact source and package static archive, then save_version_and_deploy_private. Preserve opaque project ID and credentials only in memory/stdin.
- [ ] Deliver verified private deployment URL and source zip in outputs. Describe actual testing and absence of real-device validation if applicable.

## Progress
2026-10-19: Empty project directory verified; no existing git repository or app to protect. New isolated subdirectory work/roadster-game used. User approved implementation. Numeric values are playable defaults subject to testing. No additional approval necessary for reversible development or private Sites publication.

Task 1: complete. Tests written against missing Game implementation first; 12 behavior tests passed after implementation. Reviewer reproduced early-warning fuel exhaustion; added regression which failed at44.77s, then fixed bounded ground-recovery scheduling and staged timing prompts;14 tests now pass.
Task 2: complete. Isolated scene worker delivered models/scene, syntax and finite geometry checked. Browser visual review corrected ready framing and mirror overlay background. Compact-phone framing refinement pending final screenshot.
Task 3: complete. Browser touch emulation verified hold, pointer capture outside button, release, cancellation pause, frozen fuel/distance, resume countdown, all3 warnings, collision results, restart, local record/mute persistence,320px layout. Test-response instrumentation only; not deployed. A fixture initially reset event IDs across different types without letting rendering clear prior state; corrected fixture to render the actual restart between scenarios. Runtime errors absent in final UI test. No physical phone validation.
Task 4: in progress. Independent review fixes implemented; scoped re-review pending, then source packaging/private deployment.

## 试玩后第二版（2026-10-19）

用户确认改为左右滑动变道＋按住起飞，取代首版固定车道。
- 起步提高到120 km/h、加快提速和事件出现，加入不同车道普通车辆。
- iCAR车辆依次减速、停止、双闪、弹出电池；停车车身也参与碰撞。
- 飞行高度上限8m，镜头同步抬高。
- 重新按车型参考调整V800双色比例、灯组与前脸，以及iCAR灯组、保险杠和尾箱。
- 支持独立双指：按住飞行时可用另一根手指滑动；系统取消触控自动暂停。
