# 🐝 heyens.be

Two full-screen animated scenes, built from scratch with no frameworks, no build
step and no dependencies: just static HTML, CSS, and vanilla JavaScript.

**Live:** https://heyens.be

---

## Scenes

Exactly one scene plays at a time; `?scene=` picks it and only that scene's
renderer is downloaded.

| URL | Scene |
| --- | --- |
| https://heyens.be | **Wasps** (default) — a daylight nest with a roaming swarm and in/out traffic, on a 2D canvas |
| https://heyens.be/?scene=starfield | **Starfield** — the photoreal WebGL2 night sky you float through |

### Wasp controls

| Action | Mouse / trackpad | Touch |
| --- | --- | --- |
| Part the swarm | move the cursor | swipe |
| Scatter them | click | tap |

Wasps roam around the nest, dip in to land on it, arc at the entrance, and leave
for the edge of the screen on a scheduled rhythm. Motion parameters and their
evidence status live in [`docs/research/wasp-flight.md`](docs/research/wasp-flight.md).

### Starfield controls

The visitor drifts forward through a procedurally generated galaxy. Grab the sky and
turn a full 360°, zoom in like a telescope, and click to send a wish across the stars.

| Action | Mouse / trackpad | Touch |
| --- | --- | --- |
| Look around (full 360°) | drag | swipe |
| Make a wish (supernova + meteor) | click | tap |
| Zoom (telescope ~28°–80°) | scroll wheel | pinch |
| Reveal the constellation chart | hover near bright stars | — |

Leave it alone and the sky keeps living: constant forward drift, a breathing sway,
and a slow idle auto-pan after a few seconds of inactivity.

---

## Quick start

No toolchain required. Serve the folder with any static file server and open it:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

(A local server is required: the active scene's renderer is appended as a script
at runtime, which `file://` blocks.)

---

## How it works

The sky is a real 3D scene, not a flat parallax trick. A perspective camera drifts
along a fixed world vector; dragging rotates the view (yaw is unbounded, pitch is
clamped near the poles) with fling inertia. Stars are stored in world space and
projected each frame, so turning around genuinely shows the far side of the galaxy.

Two star populations create depth:

- **Far celestial shell** (~42,000 points at "infinity") — band-clustered, with
  blackbody colors, atmospheric scintillation, organically scattered halos, and 24
  brilliant diffraction-spiked "hero" stars. Stable; this layer carries the
  constellation chart.
- **Volumetric tier** (~21,000 points in a wrapped cube around the camera) — these
  stream past as you move, selling the sense of flight.

The Milky Way itself is baked once into a 2048×1024 equirectangular texture using
seamless 3D noise (dust lanes, a warm galactic core, faint nebulae) and sampled per
pixel by the view ray.

On top of the scene: meteors, a rare distant beacon, a supernova shockwave on click
that ignites stars along its wavefront, the cursor constellation chart, an HDR bloom
pass with a filmic tonemap, and a vignette + film-grain finish.

### Rendering pipeline (per frame)

1. Scene renders into a full-resolution **RGBA16F** target (so bright cores exceed 1.0
   instead of clipping)
2. Equirect sky sphere → far shell → volumetric stars → constellation lines → meteors
   / beacon → supernova rings
3. **Bloom**: bright-extract (soft knee) → separable gaussian at half + quarter res
4. **Composite**: scene + bloom → filmic shoulder tonemap, with vignette, grain, and
   dither folded in

If half-float render targets aren't available, it draws straight to the backbuffer
and applies vignette + grain directly.

---

## Project layout

```
index.html              Entry point; loads the five scripts + stylesheet
styles/main.css         Layout, hint text, reduced-motion overlay
scripts/
  starfield-gl.js       The WebGL2 renderer (camera, bake, stars, bloom, effects)
  starfield.js          2D <canvas> fallback renderer
  config.js             Tunables for the 2D fallback
  input.js              Pointer events → drag / click / pinch / wheel
  main.js               Renderer selection, RAF loop, frame cap, reduced motion
.github/workflows/      Deploy workflow (rsync on push to main)
ROADMAP.md              Future ideas + recorded design decisions
```

---

## Performance & accessibility

The renderer is built to stay smooth and behave well everywhere:

- **WebGL2-first, graceful fallback.** No WebGL2 → an automatic 2D canvas starfield.
- **Frame cap.** 60 fps active; drops to 30 fps when the tab is visible but
  unfocused and idle (saves battery and heat).
- **Adaptive quality ladder.** Sustained slow frames step down: device-pixel-ratio,
  then star counts, then grain — so it self-tunes to the GPU instead of stuttering.
- **Reduced motion.** With `prefers-reduced-motion: reduce`, it renders a single
  settled GL frame (no animation); if there's no GL, a calm CSS overlay.
- **Resilient.** WebGL context-loss recovery, DPR capped at 2, and a session-seeded
  sky so resizing never reshuffles the stars.

---

## Tuning

Every visual and motion knob lives in the `CFG` object at the top of
`scripts/starfield-gl.js`. A few of the load-bearing ones:

| Constant | Meaning | Default |
| --- | --- | --- |
| `SHELL_BRIGHT` / `SHELL_DUST` | far-shell star / powder counts | 20000 / 22000 |
| `VOLUME_STARS` | fly-through tier count | 21000 |
| `DRIFT_SPEED` | forward cruise (world units/s) | 20 |
| `FOV_Y` | base vertical field of view | 68° |
| `ZOOM_MIN` / `ZOOM_MAX` | telescope range (FOV scale) | 0.40 / 1.20 |
| `BLOOM_STR` / `TONEMAP_E` | glow strength / tonemap shoulder | 0.70 / 1.65 |

---

## Deploy

Pushing to `main` triggers `.github/workflows/deploy.yml`, which rsyncs the three
shipped paths — `index.html`, `styles/`, `scripts/` — over SSH to the production host.
Everything else in the repo is development-only and never deployed.

---

## Browser support

Best on any current browser with **WebGL2**. The full pipeline (HDR bloom) also needs
floating-point render targets (`EXT_color_buffer_half_float` / `EXT_color_buffer_float`);
without them, bloom is skipped and everything else still runs. Browsers without WebGL2
fall back to the 2D canvas field.

---

## License

No license file is present — treat as all rights reserved unless the owner states
otherwise.
