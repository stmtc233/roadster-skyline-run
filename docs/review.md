# Independent gameplay review

Reviewed 2026-10-19. Scope: the new static game in `dist`, approved Chinese spec, implementation plan, and simulation tests. No prior commit base exists. Application code was not modified. Ready-screen framing and browser/mobile visual QA are being handled separately by the parent agent.

## Finding

### Resolved P2 — The warning instructed a flight policy that ran out of gas within the first minute

Location: `dist/app.js:56`, with recovery scheduling at `dist/game.js:86–94`.

The warning displays “按住起飞 · 越过危险” immediately upon an event appearing, then “保持高度 · 注意落点”. A player who follows these instructions, holds until the visible “安全越过” confirmation, and releases immediately uses about 70 gas per event. The ground recovery between warnings does not replenish that amount. The approved design requires viable fuel/recovery windows and clear one-touch teaching. Although a delayed-takeoff solution exists, the displayed instructions do not teach that solution and actively encourage the losing policy.

Reproduction: use the existing seed-1 LCG from `tests/game.test.mjs`; run at 120 Hz; before each update call `g.setHeld(g.events.some(e => !e.resolved))`. Gas at consecutive spawns is 100, 91.33, 87.29, 78.67, 64.38, 61.88. The sixth event kills the player at 44.733 seconds, 116.10 km/h, after five dodges, with “气量耗尽 · 被后方车辆追尾”. No fuel was spent outside a warning. Conversely, delaying flight until event age 1.55 seconds survives 1,200 seconds, 212 dodges, at approximately 220 km/h.

Suggested fix: give an explicit preparation/takeoff timing cue so that the demonstrated policy is sustainable, and/or make the inter-event recovery budget accommodate the instructed flight window. Add a behavior test for the policy actually communicated by the UI, rather than relying exclusively on the current test pilot’s undocumented 1.55-second delay.

Resolution re-reviewed: `dist/app.js:56` now stages preparation, explicit takeoff at approximately 1.5 seconds after appearance, and holding until the obstacle passes. `dist/game.js:92–95` delays a due event while the player is grounded, released, and below 80 gas, capped at four seconds beyond the unchanged original deadline. Recovery still uses the normal 15 gas/second rule. The cap is not reset on each update. No further issue found in this scoped fix review.

## Verified evidence

- Fresh post-fix `node --test tests/game.test.mjs`: 14 tests passed, zero failed. Covers all three collision types, normal flight/recharge, exhaustion rearm, pause, restart, frame-rate parity, seeded conservative-pilot survival, immediate-warning flight survival, and bounded recovery delay.
- Independent post-fix simulation: 96 runs (24 seeds × immediate/cued takeoff × ordinary/late-game starts), each lasting 20 simulated minutes at 60 Hz, all survived. Every run cleared at least 152 hazards; minimum gas was 9.583, minimum spawn gas was 80.000, and maximum speed approached 220 km/h. A separate probe forced fuel to zero on every simulation update and still spawned the due obstacle at 4.008 seconds, confirming that the recovery deadline cannot be extended indefinitely.
- Independent 20-minute seeded simulation with delayed takeoff survived 212 hazards; fuel remained bounded. Single unresolved-event scheduling prevents forced simultaneous front/rear traps.
- At 220 km/h, direct ground-collision probes gave warning-to-contact times of 2.500 s (front), 2.450 s (rear), and 2.533 s (battery), above the specified approximately 1.5-second minimum.
- Measured Three.js model bounds: battery top 0.350 m, sedan top 1.425 m, MPV top 1.925 m, close to simulation heights 0.35/1.45/2 m. Lengths similarly match within small gameplay margins. No substantial hidden obstacle or flight-through geometry defect found. Source SUV remains in an adjacent lane, and the battery collision only activates after its model appears.
- Rear warning is exactly “后方车辆刹车断裂”. No lateral movement control exists. Rear vehicles continue forward after passing rather than abruptly braking.
- Input code uses a single active pointer and capture, ignores secondary-pointer release, and pauses on active cancellation, lost capture, blur, and hidden document. Pause countdown holds simulation paused and can be canceled by interruption. These are code-review findings, not physical-device validation.
- Best-distance and mute reads/writes catch storage exceptions; restart clears simulation state. Browser persistence remains part of separate browser QA.
- Mobile safe-area rules and portrait layout are present. No browser-layout or real-mobile claim is made by this review.

## Verdict

The identified P2 teaching/fuel-policy mismatch is resolved and independently verified. No outstanding actionable findings in the reviewed scope; no P0/P1 found. The parent agent separately reports passing browser mobile-emulation QA for capture/move/release/cancel, pause and countdown, all three warnings/collisions/restart, best/mute persistence, and runtime errors. That browser evidence is parent-reported rather than independently rerun here; no physical-phone validation is claimed.
