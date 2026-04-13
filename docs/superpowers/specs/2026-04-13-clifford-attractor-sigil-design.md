# Clifford Attractor Sigil — Phase 2 Design Spec

**Date:** 2026-04-13
**Replaces:** "JH initials constellation" concept from PLAN.md

## Summary

Replace the planned "JH" initials sigil with an abstract Clifford attractor shape. On cursor idle, a subset of stars migrate to sample points along the attractor path, forming a mysterious nebula-like figure at canvas center. A click detonates it; cursor movement dissolves it.

## Why Clifford Over Initials

"JH" initials require letter-path geometry and feel literal. A Clifford attractor is:
- Natively 2D — no projection math needed
- Tunable via 4 parameters (a, b, c, d) — shape can be dialed in aesthetically
- Thematically resonant — order emerging from chaos, mirroring the starfield itself
- Abstract and mysterious — fits the creative project's mood

## Attractor Formula

```
x' = sin(a·y) + c·cos(a·x)
y' = sin(b·x) + d·cos(b·y)
```

Parameters are chosen at build time for a visually dense, asymmetric shape (e.g. a=-1.4, b=1.6, c=1.0, d=0.7). Pre-compute ~500 sample points; normalize to a target bounding box centered on canvas.

## Behaviour

### Idle Detection
- Threshold: 4 seconds of no cursor movement
- Once triggered, enter `SIGIL_FORMING` mode

### Formation
- Select 200–300 stars across all layers (weighted toward mid-layer for visual density)
- Assign each a target point sampled from the pre-computed attractor path
- Animate with spring physics: `velocity += (target - pos) * stiffness - velocity * damping`
- Duration: ~1.5s to settle; stars overshoot slightly for organic feel
- Unselected stars continue normal drift — sigil emerges from the field

### Appearance
- No connecting lines — stars form the shape as a loose cloud/nebula
- Natural size and opacity variation preserved — reads as a stellar formation, not a diagram
- Attractor centered at canvas midpoint

### Detonation (click during SIGIL_FORMED state)
- Supernova from attractor centroid
- Scatter velocity proportional to distance from center + base radial velocity
- All sigil stars rejoin normal drift pool after scatter

### Dissolution (cursor moves before click)
- Stars drift back to normal positions over ~1s
- No special animation — just re-enter standard physics

## Data Layout

Uses reserved Phase 2 fields already in `config.js`:
- `FIELD_TARGET_X = 8` — target attractor point x
- `FIELD_TARGET_Y = 9` — target attractor point y
- `FIELD_MODE = 10` — star mode: 0=normal, 1=sigil-assigned
- `FIELD_TIMER = 11` — spring settle timer (unused, kept for future)

## New Modules

| File | Purpose |
|------|---------|
| `scripts/attractor.js` | Pre-compute Clifford sample points, export normalized point array |
| `scripts/sigil.js` | Idle detection, star selection, spring animation, mode transitions |

## State Machine

```
NORMAL → (4s idle) → SIGIL_FORMING → (settled) → SIGIL_FORMED
SIGIL_FORMING → (cursor moves) → DISSOLVING → NORMAL
SIGIL_FORMED → (cursor moves) → DISSOLVING → NORMAL
SIGIL_FORMED → (click) → DETONATING → NORMAL
```

## Out of Scope

- Connecting lines between stars
- Multiple attractor parameter sets / switching
- Sigil on mobile / touch (idle detection only via pointer events)
- Sound
