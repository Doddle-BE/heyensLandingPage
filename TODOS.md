# TODOS

## P1 — High Priority

### Content overlay layer (Phase 2)
After the Phase 1 starfield ships, add actual landing page content: name, tagline,
links (GitHub, LinkedIn, email). Currently the page is a pure starfield effect.

**Why:** The starfield is the visual identity; content is the actual product. Without
it, the page communicates nothing to a visitor beyond "cool animation."

**Pros:** Makes the page functional, not just beautiful. Visitors can find you.

**Cons:** CSS refactor needed — `overflow:hidden` + fixed canvas fights responsive
layout. Plan for that when building content.

**Context:** Start with an absolutely-positioned div overlay (z-index > canvas),
pointer-events on the overlay only. Revisit CSS layout for responsive.

**Effort:** M (human: ~4 hrs / CC: ~20 min)
**Depends on:** Phase 1 starfield working

---

## P2 — Future

### ~~Touch/mobile cursor interaction~~ ✓ DONE
Implemented in `scripts/input.js`: `touchstart` sets origin + triggers supernova,
`touchmove` runs through the same EMA velocity pipeline as `mousemove`, single-touch only.

---

### Clifford attractor sigil personality layer (Phase 2 of the animation)
When cursor is idle, nearby stars cluster toward mouse forming a temporary
constellation. On click: stars snap into Clifford attractor shapes for ~500ms, then
detonate into the supernova.

**Why:** The "wait, the page noticed me" moment. Turns a pretty effect into a
memorable one that gets screenshotted and shared (per Codex cold read).

**Pros:** The differentiating feature. Makes this page unique vs. any other
starfield portfolio.

**Cons:** Requires extending the Float32Array data model with formation fields:
`targetX, targetY, mode (particle=0/formation=1), timer`. Plan for this extension
before Phase 1 schema is locked — adding fields later means reinitializing the
entire pool. Idle detection needs a threshold (~2s no significant cursor movement).

**Context:** Letter glyph coordinates for `J` and `H` can be hand-authored as
small arrays of target positions (~20 points each). Stars nearest to each point
get assigned targets; others continue normal physics.

**Effort:** L (human: ~2 days / CC: ~1 hr)
**Depends on:** Phase 1 stable. Data model fields reserved or extended.
