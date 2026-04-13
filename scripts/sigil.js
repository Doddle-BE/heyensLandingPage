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
