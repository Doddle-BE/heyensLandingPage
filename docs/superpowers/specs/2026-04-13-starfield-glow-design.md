# Starfield Glow Enhancement — Design Spec

**Date:** 2026-04-13
**Status:** Approved
**Scope:** Visual render enhancement only — no physics, data model, or interaction changes

---

## Summary

Add chromatic depth coloring and cinematic additive glow to the existing starfield.
Stars shift from warm amber (close, z=1) to cool blue (far, z=1000). Close stars bloom
with a multi-ring additive glow. Result: cosmic depth, astrophotography aesthetic.

---

## What was decided

| Question | Choice |
|----------|--------|
| Enhancement direction | Glow + Chromatic depth (no interaction change) |
| Glow intensity | Cinematic — multi-ring bloom like astrophotography |
| Implementation approach | Additive compositing (`'lighter'`) — no per-star gradients |

---

## Files changed

| File | Change |
|------|--------|
| `scripts/config.js` | 3 new glow constants |
| `scripts/starfield.js` | `sfInit` builds color table; `sfRender` uses chromatic colors + additive glow pass |

**Not touched:** `main.js`, `input.js`, `sigil.js`, `attractor.js`, `index.html`, `styles/`

---

## Color system

A 256-entry lookup table (`COLOR_TABLE`) is built once in `sfInit`. Zero string allocation
during render.

```
for i in 0..255:
  t = sqrt(i / 255)          // sqrt bias: more warm stars than cool
  r = lerp(255, 130, t)      // 255 (warm amber) → 130 (cool blue)
  g = lerp(220, 160, t)
  b = lerp(160, 255, t)
  COLOR_TABLE[i] = `rgb(${r},${g},${b})`
```

In `sfRender`, per-star color lookup replaces the per-layer `layerColors` array:

```
idx = clamp(floor((z - Z_NEAR) / (Z_FAR - Z_NEAR) * 255), 0, 255)
ctx.fillStyle = COLOR_TABLE[idx]
```

---

## Glow pass

Added after the normal star render loop. Layer 0 only (300 closest stars).

```
ctx.globalCompositeOperation = 'lighter'

for each layer-0 star where z < GLOW_MAX_Z:
  compute sx, sy, r  (same projection as normal render)
  for g in [0, 1, 2]:
    ctx.globalAlpha = star_alpha * GLOW_ALPHAS[g]
    ctx.fillStyle   = COLOR_TABLE[idx]
    ctx.beginPath()
    ctx.arc(sx, sy, r * GLOW_MULTS[g], 0, 2π)
    ctx.fill()

ctx.globalCompositeOperation = 'source-over'
ctx.globalAlpha = 1
```

No gradients. Additive blending causes overlapping halos to stack naturally — dense
star clusters become brighter without any explicit brightness logic.

---

## New config constants

```js
const GLOW_MAX_Z   = 300;              // only stars closer than this bloom
const GLOW_MULTS   = [8, 4, 2];       // glow ring radii as multiples of star radius
const GLOW_ALPHAS  = [0.015, 0.030, 0.060];  // per-ring alpha (outer → inner)
```

---

## Performance notes

- Glow pass: max 300 stars × 3 arc calls = 900 draw calls/frame (layer 0 count)
- In practice fewer, since `z > GLOW_MAX_Z` skips ~70% of stars
- No `createRadialGradient` — solid circles only
- `COLOR_TABLE` is pre-built: zero string allocation in the render hot path
- `globalCompositeOperation` toggle: 2 state changes per frame
- Per-star `fillStyle` change breaks layer batch — acceptable since `globalAlpha`
  is already set per-star (batch was already broken for twinkling)

---

## What it looks like

- Close stars: warm amber-white cores with wide soft glow rings
- Far stars: cool blue-grey, no glow (z > GLOW_MAX_Z)
- Dense clusters: halos stack additively → organically brighter nebula regions
- Supernova: scattered stars carry their warm/cool tints through the explosion

---

## Not in scope

- Motion trails
- Magnetic attract/repel cursor mode
- Touch/mobile interaction
- Any content overlay
