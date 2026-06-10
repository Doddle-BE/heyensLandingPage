# Starfield — what's missing (wow-per-effort order)

Gap analysis after Phase 1.6 (3D drift + 360° free-look). Headroom: ~8ms/frame at 120fps.

## 1. HDR bloom + filmic tonemap — ✓ DONE 2026-06-10
Scene renders into full-res RGBA16F FBO (gated on `caps.halfFloatRenderable`),
bright-extract w/ soft knee → separable gaussian at half + quarter res →
single composite: scene + dual-level bloom, `1-exp(-c*E)` shoulder (E=1.65),
vignette/grain/dither folded in. Direct path kept for no-FP16 + quality 3.
Verified: desktop/mobile/reduced-still/no-FP16, zero fps cost at the 60 cap.

## 2. Something to drift toward — ✗ REMOVED 2026-06-10
Built (procedural ringed gas giant flybys), shipped, then removed same day:
owner verdict — no planets in this sky, ever. Keep the drift abstract.
If "destination" ever returns, it must be non-planetary (e.g. comet, cluster).

## 3. Foreground occluders
Parallax only between luminous layers; nothing passes in front.
- 6–10 large near-black soft dust-wisp billboards in the volumetric cube
- Alpha-over (dims stars behind) → triples depth perception, near-zero cost.

## 4. Velocity streaking on fast look
Hard fling → stretch points along angular velocity (vertex shader + 1 uniform).
Settles back to points at rest. Instant "camera in space".

## 5. Findable landmarks
360° sky rewards exploration with only core + 2 nebulae.
- Add Andromeda-style oval galaxy (dust lane) + 1 globular cluster to the bake
- Discoverability = reason to look around.

## 6. Sound
Generative sub drone + sparse shimmer, Web Audio, ~40 lines.
Off by default, tiny unmute toggle (user-gesture gated).
Biggest emotional multiplier per byte.

## 7. The actual page (ties into TODOS Phase 2 content overlay)
Nav links as named stars wired into the constellation-chart mechanic:
hover star → name; click → navigate. Backdrop becomes the interface.

## Engineering debts — ✓ DONE 2026-06-10
- ~~Frame-cap 60~~ (30 when visible-but-unfocused; accumulator-based, vsync-jitter safe)
- ~~FP16 capability detection~~ (`sky.caps.halfFloatRenderable`, ready for bloom)
- ~~`prefers-reduced-motion`: static GL frame~~ (`renderStill()`; CSS overlay stays as no-GL fallback)
- ~~Pinch / scroll-wheel FOV zoom~~ (telescope 28°–80°, smoothed, zoom-scaled drag sensitivity)

**Recommended order: 1 → 2 → 3 → 4, rest opportunistic.**
