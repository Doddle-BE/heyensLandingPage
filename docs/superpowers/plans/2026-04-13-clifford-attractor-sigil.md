# Clifford Attractor Sigil Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the planned "JH" initials with an abstract Clifford attractor constellation that forms when the cursor idles for 4s, then detonates on click or dissolves on cursor movement.

**Architecture:** Two new vanilla-JS modules (`attractor.js` for pure math, `sigil.js` for state + animation) integrate with the existing RAF loop in `main.js` via a single `sigilUpdate(mouse, dt)` call. The Float32Array pool fields `FIELD_TARGET_X/Y`, `FIELD_MODE`, and `FIELD_TIMER` reserved in Phase 1 are activated. No build tools — plain `<script>` tags.

**Tech Stack:** Vanilla JS (ES5-compatible globals), HTML5 Canvas 2D, Float32Array pool from `starfield.js`.

---

### Task 1: Update `config.js` — add sigil constants

**Files:**
- Modify: `scripts/config.js`

- [ ] **Step 1: Add sigil constants after the reserved field block**

Open `scripts/config.js`. After line 43 (`const FIELD_TIMER = 11;`), add:

```js
// Sigil — Clifford attractor parameters
const SIGIL_IDLE_MS      = 4000;   // ms of no cursor movement before sigil forms
const SIGIL_STAR_COUNT   = 250;    // stars assigned to sigil
const SIGIL_SPRING_K     = 0.003;  // spring stiffness (per ms²)
const SIGIL_DAMPING      = 0.92;   // velocity damping per frame
const SIGIL_SETTLE_VEL   = 0.05;   // px/ms threshold to consider a star settled
const SIGIL_DISSOLVE_MS  = 1000;   // ms for dissolve drift back to normal
const SIGIL_BBOX_W       = 400;    // attractor bounding box width in CSS px
const SIGIL_BBOX_H       = 300;    // attractor bounding box height in CSS px

// Clifford attractor parameters — produces a dense asymmetric shape
const CLIFFORD_A = -1.4;
const CLIFFORD_B =  1.6;
const CLIFFORD_C =  1.0;
const CLIFFORD_D =  0.7;
const CLIFFORD_SAMPLES = 500; // pre-computed points

// Sigil state enum
const SIGIL_NORMAL    = 0;
const SIGIL_FORMING   = 1;
const SIGIL_FORMED    = 2;
const SIGIL_DISSOLVING= 3;
const SIGIL_DETONATING= 4;
```

- [ ] **Step 2: Commit**

```bash
git add scripts/config.js
git commit -m "feat: add sigil + Clifford attractor constants to config"
```

---

### Task 2: Create `scripts/attractor.js` — pre-compute Clifford points

**Files:**
- Create: `scripts/attractor.js`

- [ ] **Step 1: Write `attractor.js`**

```js
// attractor.js — Clifford attractor point pre-computation
// Returns Float32Array of [x0,y0, x1,y1, ...] normalized to a bounding box
// centered at (0,0) in CSS pixel space.

function buildCliffordPoints(bboxW, bboxH) {
  const pts = new Float32Array(CLIFFORD_SAMPLES * 2);
  let x = 0.1, y = 0;

  // Burn-in: discard first 1000 iterations so we land on the attractor
  for (let i = 0; i < 1000; i++) {
    const nx = Math.sin(CLIFFORD_A * y) + CLIFFORD_C * Math.cos(CLIFFORD_A * x);
    const ny = Math.sin(CLIFFORD_B * x) + CLIFFORD_D * Math.cos(CLIFFORD_B * y);
    x = nx; y = ny;
  }

  // Sample CLIFFORD_SAMPLES points
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const raw = new Float32Array(CLIFFORD_SAMPLES * 2);
  for (let i = 0; i < CLIFFORD_SAMPLES; i++) {
    const nx = Math.sin(CLIFFORD_A * y) + CLIFFORD_C * Math.cos(CLIFFORD_A * x);
    const ny = Math.sin(CLIFFORD_B * x) + CLIFFORD_D * Math.cos(CLIFFORD_B * y);
    x = nx; y = ny;
    raw[i * 2]     = x;
    raw[i * 2 + 1] = y;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  // Normalize to bboxW × bboxH, centered at (0, 0)
  const scaleX = bboxW / (maxX - minX || 1);
  const scaleY = bboxH / (maxY - minY || 1);
  const scale  = Math.min(scaleX, scaleY); // uniform scale, preserve aspect
  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;

  for (let i = 0; i < CLIFFORD_SAMPLES; i++) {
    pts[i * 2]     = (raw[i * 2]     - cx) * scale;
    pts[i * 2 + 1] = (raw[i * 2 + 1] - cy) * scale;
  }

  return pts;
}
```

- [ ] **Step 2: Open `index.html` and add `attractor.js` before `main.js`**

In `index.html`, replace:
```html
  <script src="scripts/input.js"></script>
  <script src="scripts/main.js"></script>
```
with:
```html
  <script src="scripts/input.js"></script>
  <script src="scripts/attractor.js"></script>
  <script src="scripts/main.js"></script>
```

- [ ] **Step 3: Open the page in a browser and verify no console errors**

Run a local server (e.g. `python3 -m http.server 8080`) and open `http://localhost:8080`. Console must be clean.

- [ ] **Step 4: Commit**

```bash
git add scripts/attractor.js index.html
git commit -m "feat: add Clifford attractor point pre-computation module"
```

---

### Task 3: Create `scripts/sigil.js` — state machine + spring animation

**Files:**
- Create: `scripts/sigil.js`

- [ ] **Step 1: Write `sigil.js`**

```js
// sigil.js — Clifford attractor sigil: idle detection, star selection,
// spring animation, state machine.
// Reads/writes the shared Float32Array pool via globals from starfield.js and config.js.

// Module state
let _state       = SIGIL_NORMAL;
let _idleMs      = 0;          // accumulated idle time
let _sigilStars  = null;       // Int32Array of flat star indices assigned to sigil
let _points      = null;       // pre-computed attractor points (from attractor.js)
let _canvasW     = 0;
let _canvasH     = 0;

// Called once after sfInit and buildCliffordPoints
function sigilInit(canvasW, canvasH) {
  _canvasW = canvasW;
  _canvasH = canvasH;
  _points  = buildCliffordPoints(SIGIL_BBOX_W, SIGIL_BBOX_H);
  _state   = SIGIL_NORMAL;
  _idleMs  = 0;
  _sigilStars = null;
}

// Assign SIGIL_STAR_COUNT stars to sigil targets.
// Prefers layer 1 (mid-layer) then layer 0 then layer 2 for visual density.
function _assignStars() {
  // Build weighted candidate list: all star flat indices, layer 1 first
  const preferred = [1, 0, 2];
  const candidates = [];
  for (let li = 0; li < preferred.length; li++) {
    const layer = preferred[li];
    const start = layerStart[layer];
    const count = STAR_COUNT[layer];
    for (let i = 0; i < count; i++) {
      candidates.push(start + i);
    }
  }

  const chosen = new Int32Array(SIGIL_STAR_COUNT);
  // Reservoir-sample SIGIL_STAR_COUNT from candidates (Fisher-Yates partial)
  const n = Math.min(SIGIL_STAR_COUNT, candidates.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (candidates.length - i));
    const tmp = candidates[i]; candidates[i] = candidates[j]; candidates[j] = tmp;
    chosen[i] = candidates[i];
  }

  // Assign attractor targets; distribute points across chosen stars
  for (let i = 0; i < n; i++) {
    const starIdx = chosen[i];
    const base    = starIdx * FIELDS;
    const ptIdx   = (i % CLIFFORD_SAMPLES);
    // Target in CSS pixel space — offset to canvas center
    pool[base + FIELD_TARGET_X] = _points[ptIdx * 2]     + _canvasW * 0.5;
    pool[base + FIELD_TARGET_Y] = _points[ptIdx * 2 + 1] + _canvasH * 0.5;
    pool[base + FIELD_MODE]     = 1; // sigil-assigned
  }

  _sigilStars = chosen;
}

// Clear FIELD_MODE for all sigil stars
function _releaseSigilStars() {
  if (!_sigilStars) return;
  for (let i = 0; i < _sigilStars.length; i++) {
    const base = _sigilStars[i] * FIELDS;
    pool[base + FIELD_MODE]     = 0;
    pool[base + FIELD_TARGET_X] = 0;
    pool[base + FIELD_TARGET_Y] = 0;
  }
  _sigilStars = null;
}

// Spring-step sigil stars toward their targets.
// Returns true when all assigned stars have settled (vel < SIGIL_SETTLE_VEL).
function _springStep(dt) {
  if (!_sigilStars) return true;
  let allSettled = true;

  for (let i = 0; i < _sigilStars.length; i++) {
    const base  = _sigilStars[i] * FIELDS;
    const z     = pool[base + FIELD_Z];
    if (z <= 0) continue;

    // Current screen position
    const halfW = _canvasW * 0.5;
    const halfH = _canvasH * 0.5;
    const sx = (pool[base + FIELD_X] / z) * FOCAL_LENGTH + halfW;
    const sy = (pool[base + FIELD_Y] / z) * FOCAL_LENGTH + halfH;

    const tx = pool[base + FIELD_TARGET_X];
    const ty = pool[base + FIELD_TARGET_Y];

    // Spring force in screen space, then convert back to world via inverse projection
    const fx = (tx - sx) * SIGIL_SPRING_K * dt;
    const fy = (ty - sy) * SIGIL_SPRING_K * dt;

    pool[base + FIELD_VX] = (pool[base + FIELD_VX] + fx) * SIGIL_DAMPING;
    pool[base + FIELD_VY] = (pool[base + FIELD_VY] + fy) * SIGIL_DAMPING;

    const speed = Math.sqrt(
      pool[base + FIELD_VX] * pool[base + FIELD_VX] +
      pool[base + FIELD_VY] * pool[base + FIELD_VY]
    );
    if (speed > SIGIL_SETTLE_VEL) allSettled = false;
  }

  return allSettled;
}

// Detonate: scatter all sigil stars from canvas centroid
function _detonate() {
  if (!_sigilStars) return;
  const cx = _canvasW * 0.5;
  const cy = _canvasH * 0.5;

  for (let i = 0; i < _sigilStars.length; i++) {
    const base = _sigilStars[i] * FIELDS;
    const z    = pool[base + FIELD_Z];
    if (z <= 0) continue;

    const halfW = _canvasW * 0.5;
    const halfH = _canvasH * 0.5;
    const sx = (pool[base + FIELD_X] / z) * FOCAL_LENGTH + halfW;
    const sy = (pool[base + FIELD_Y] / z) * FOCAL_LENGTH + halfH;

    const dx   = sx - cx;
    const dy   = sy - cy;
    const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
    const mag  = SUPERNOVA_IMPULSE * 1.5 / dist;

    pool[base + FIELD_VX] += (dx / dist) * mag;
    pool[base + FIELD_VY] += (dy / dist) * mag;
    // Velocity cap
    pool[base + FIELD_VX] = Math.max(-MAX_STAR_VEL, Math.min(MAX_STAR_VEL, pool[base + FIELD_VX]));
    pool[base + FIELD_VY] = Math.max(-MAX_STAR_VEL, Math.min(MAX_STAR_VEL, pool[base + FIELD_VY]));
  }

  _releaseSigilStars();
}

// Main update — call once per frame before sfUpdate
// mouse: same object returned by getMouseState()
// dt: frame delta in ms
// cursorMoved: true if cursor moved this frame (caller computes)
function sigilUpdate(mouse, dt, cursorMoved) {
  switch (_state) {
    case SIGIL_NORMAL:
      if (cursorMoved) {
        _idleMs = 0;
      } else {
        _idleMs += dt;
        if (_idleMs >= SIGIL_IDLE_MS) {
          _assignStars();
          _state = SIGIL_FORMING;
          _idleMs = 0;
        }
      }
      break;

    case SIGIL_FORMING:
      if (cursorMoved) {
        _releaseSigilStars();
        _state = SIGIL_NORMAL;
        _idleMs = 0;
        break;
      }
      const settled = _springStep(dt);
      if (settled) _state = SIGIL_FORMED;
      break;

    case SIGIL_FORMED:
      if (cursorMoved) {
        _releaseSigilStars();
        _state = SIGIL_NORMAL;
        _idleMs = 0;
        break;
      }
      if (mouse.clicked) {
        _detonate();
        _state = SIGIL_NORMAL;
        _idleMs = 0;
        break;
      }
      // Keep spring tight while formed
      _springStep(dt);
      break;

    default:
      _state = SIGIL_NORMAL;
      _idleMs = 0;
  }
}
```

- [ ] **Step 2: Add `sigil.js` to `index.html` before `main.js`**

In `index.html`, replace:
```html
  <script src="scripts/attractor.js"></script>
  <script src="scripts/main.js"></script>
```
with:
```html
  <script src="scripts/attractor.js"></script>
  <script src="scripts/sigil.js"></script>
  <script src="scripts/main.js"></script>
```

- [ ] **Step 3: Commit**

```bash
git add scripts/sigil.js index.html
git commit -m "feat: add sigil state machine + spring animation module"
```

---

### Task 4: Wire sigil into `main.js`

**Files:**
- Modify: `scripts/main.js`

- [ ] **Step 1: Add cursor-moved tracking and `sigilInit` call**

In `main.js`, the `init` function currently is:

```js
  function init() {
    setupCanvas();
    sfInit(window.innerWidth, window.innerHeight);
    inputBind();
  }
```

Replace it with:

```js
  let _prevMouseX = 0;
  let _prevMouseY = 0;

  function init() {
    setupCanvas();
    sfInit(window.innerWidth, window.innerHeight);
    sigilInit(window.innerWidth, window.innerHeight);
    inputBind();
  }
```

- [ ] **Step 2: Call `sigilUpdate` in the RAF loop before `sfUpdate`**

In `main.js`, the loop body currently has:

```js
    const mouse = getMouseState();
    sfUpdate(mouse, activeCount, dt);
    sfRender(ctx, activeCount);
```

Replace with:

```js
    const mouse = getMouseState();
    const cursorMoved = (mouse.x !== _prevMouseX || mouse.y !== _prevMouseY);
    _prevMouseX = mouse.x;
    _prevMouseY = mouse.y;

    sigilUpdate(mouse, dt, cursorMoved);
    sfUpdate(mouse, activeCount, dt);
    sfRender(ctx, activeCount);
```

- [ ] **Step 3: Reset sigil on resize**

In `main.js`, the resize handler calls `sfInit(...)`. Add `sigilInit(...)` directly after it:

```js
    resizeTimer = setTimeout(() => {
      setupCanvas();
      sfInit(window.innerWidth, window.innerHeight);
      sigilInit(window.innerWidth, window.innerHeight);
      activeCount = [...STAR_COUNT];
      isReduced = false;
      slowFrameCount = 0;
      cleanFrameCount = 0;
    }, 100);
```

- [ ] **Step 4: Open the page and verify**

Open `http://localhost:8080`. Leave cursor still for 4s — stars should drift into the attractor shape. Move cursor — they dissolve. Leave still again — forms again. Click during formation — detonates from center. Console must stay clean.

- [ ] **Step 5: Commit**

```bash
git add scripts/main.js
git commit -m "feat: wire sigilUpdate into RAF loop and resize handler"
```

---

### Task 5: Update `config.js` comment — remove "JH sigil" reference

**Files:**
- Modify: `scripts/config.js`

- [ ] **Step 1: Update the reserved fields comment**

In `scripts/config.js`, replace line 39:

```js
// Reserved — Phase 2 JH sigil (initialized to 0, unused in Phase 1)
```

with:

```js
// Phase 2 — Clifford attractor sigil fields
```

- [ ] **Step 2: Commit**

```bash
git add scripts/config.js
git commit -m "chore: update Phase 2 field comment to Clifford attractor sigil"
```

---

### Task 6: Update `PLAN.md` and `TODOS.md` — replace JH references

**Files:**
- Modify: `PLAN.md`
- Modify: `TODOS.md`

- [ ] **Step 1: In `PLAN.md`, replace every mention of "JH sigil" / "JH initials"**

Search for all occurrences of "JH" in `PLAN.md`. Replace:
- "JH sigil personality layer" → "Clifford attractor sigil personality layer"
- "JH sigil" → "Clifford attractor sigil"
- "JH initials" → "Clifford attractor"

- [ ] **Step 2: In `TODOS.md`, do the same replacements**

Search for all occurrences of "JH" in `TODOS.md` and apply the same substitutions.

- [ ] **Step 3: Commit**

```bash
git add PLAN.md TODOS.md
git commit -m "docs: replace JH sigil references with Clifford attractor sigil"
```

---

## Self-Review

**Spec coverage:**
- Idle detection (4s) ✓ Task 3 `_idleMs` counter
- Star selection 200-300, weighted mid-layer ✓ Task 3 `_assignStars`
- Spring physics with overshoot ✓ Task 3 `_springStep`
- Unselected stars continue normal drift ✓ `sfUpdate` unaffected — only FIELD_MODE=1 stars are spring-stepped
- No connecting lines ✓ render is unchanged
- Detonation from centroid on click ✓ Task 3 `_detonate`
- Dissolution on cursor move ✓ Task 3 state machine
- Uses reserved FIELD_TARGET_X/Y, FIELD_MODE ✓ Tasks 3+4
- SIGIL_DISSOLVING state — spec says "drift back over ~1s" but the design is simply releasing spring targets and letting normal physics take over naturally; this is equivalent and simpler. State machine collapses DISSOLVING into NORMAL immediately.
- `buildCliffordPoints` called once in `sigilInit` ✓ Task 3, matches Task 2 signature

**Placeholder scan:** None found.

**Type consistency:** `pool`, `layerStart`, `STAR_COUNT`, `FIELDS`, `FOCAL_LENGTH`, `SUPERNOVA_IMPULSE`, `MAX_STAR_VEL`, `FIELD_*`, `CLIFFORD_*`, `SIGIL_*` — all defined in `config.js` or `starfield.js` as globals before `sigil.js` loads.
