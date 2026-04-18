// Starfield — 2D graph-trace field.
// Stars drift slowly; the cursor reveals a graph by drawing links between
// nearby stars inside a reach radius; clicks emit expanding pulse rings.
// See starfield/project/Starfield.html for the source design.

const TAU = Math.PI * 2;

let stars = [];
let canvasW = 0;
let canvasH = 0;

// Spatial grid — rebuilt each frame while the cursor is active
let grid = null;
let gridW = 0;
let gridH = 0;
let gridCell = 0;

function sfInit(w, h, density) {
  canvasW = w;
  canvasH = h;
  const n = Math.round(density);
  stars = new Array(n);
  for (let i = 0; i < n; i++) {
    stars[i] = {
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.02,
      vy: (Math.random() - 0.5) * 0.02,
      r: Math.random() < BIG_STAR_PROB
        ? 1.5 + Math.random() * 0.9
        : 0.5 + Math.random() * 0.7,
      ph: Math.random() * TAU,
      anchor: Math.random() < ANCHOR_PROB,
    };
  }
}

function sfResize(w, h) {
  // Stars keep their relative positions; just update the bounds.
  canvasW = w;
  canvasH = h;
}

function _rebuildGrid() {
  gridCell = Math.max(40, LINK_DIST);
  gridW = Math.max(1, Math.ceil(canvasW / gridCell));
  gridH = Math.max(1, Math.ceil(canvasH / gridCell));
  const cells = gridW * gridH;
  grid = new Array(cells);
  for (let i = 0; i < cells; i++) grid[i] = [];
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    const gx = Math.max(0, Math.min(gridW - 1, (s.x / gridCell) | 0));
    const gy = Math.max(0, Math.min(gridH - 1, (s.y / gridCell) | 0));
    grid[gy * gridW + gx].push(i);
  }
}

function sfUpdate(mouse, pulses, dt) {
  // Drift + optional cursor nudge + wrap.
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    s.x += s.vx * dt * DRIFT * 3;
    s.y += s.vy * dt * DRIFT * 3;

    // Short-range push when the cursor is moving — displaces position, not velocity
    if (mouse.active && mouse.vel > 3) {
      const dx = s.x - mouse.x;
      const dy = s.y - mouse.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < PUSH_RADIUS * PUSH_RADIUS && d2 > 1) {
        const d = Math.sqrt(d2);
        const push = (1 - d / PUSH_RADIUS) * (mouse.vel / CURSOR_VEL_MAX) * 0.3;
        s.x += (dx / d) * push;
        s.y += (dy / d) * push;
      }
    }

    // Wrap around edges
    if (s.x < -2) s.x = canvasW + 2; else if (s.x > canvasW + 2) s.x = -2;
    if (s.y < -2) s.y = canvasH + 2; else if (s.y > canvasH + 2) s.y = -2;
  }

  // Age pulses and drop expired ones
  for (let i = pulses.length - 1; i >= 0; i--) {
    pulses[i].age += dt;
    if (pulses[i].age > pulses[i].life) pulses.splice(i, 1);
  }
}

function sfRender(ctx, t, mouse, pulses) {
  // Opaque clear — canvas was requested with alpha:false
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Grid is only consulted when the cursor is active
  if (USE_GRID && mouse.active) _rebuildGrid();

  // ── Cursor graph trace ───────────────────────────────────────────────────
  if (mouse.active && mouse.x !== null) {
    _drawCursorLinks(ctx, mouse);
    _drawCursorRing(ctx, mouse);
  }

  // ── Click pulses (rings + secondary link flashes) ────────────────────────
  for (let i = 0; i < pulses.length; i++) {
    _drawPulse(ctx, pulses[i]);
  }

  // ── Anchor glow (additive) ───────────────────────────────────────────────
  if (NODE_GLOW > 0.01) _drawAnchorGlow(ctx, t);

  // ── Main star pass ───────────────────────────────────────────────────────
  _drawStars(ctx, t);

  ctx.globalAlpha = 1;
}

function _drawCursorLinks(ctx, mouse) {
  const reachSq = CURSOR_REACH * CURSOR_REACH;
  const linkSq = LINK_DIST * LINK_DIST;

  // Gather candidate star indices within cursor reach
  const candidates = [];
  if (USE_GRID) {
    const gx = Math.max(0, Math.min(gridW - 1, (mouse.x / gridCell) | 0));
    const gy = Math.max(0, Math.min(gridH - 1, (mouse.y / gridCell) | 0));
    const span = Math.ceil(CURSOR_REACH / gridCell);
    const yMin = Math.max(0, gy - span);
    const yMax = Math.min(gridH - 1, gy + span);
    const xMin = Math.max(0, gx - span);
    const xMax = Math.min(gridW - 1, gx + span);
    for (let yy = yMin; yy <= yMax; yy++) {
      for (let xx = xMin; xx <= xMax; xx++) {
        const cell = grid[yy * gridW + xx];
        for (let k = 0; k < cell.length; k++) {
          const idx = cell[k];
          const s = stars[idx];
          const dx = s.x - mouse.x, dy = s.y - mouse.y;
          if (dx * dx + dy * dy < reachSq) candidates.push(idx);
        }
      }
    }
  } else {
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const dx = s.x - mouse.x, dy = s.y - mouse.y;
      if (dx * dx + dy * dy < reachSq) candidates.push(i);
    }
  }

  // Draw links — opacity is the product of (pair distance falloff) × (cursor distance falloff)
  ctx.lineWidth = 0.6;
  ctx.strokeStyle = 'rgba(232, 218, 186, 1)';

  for (let a = 0; a < candidates.length; a++) {
    const sa = stars[candidates[a]];
    const dax = sa.x - mouse.x, day = sa.y - mouse.y;
    const dCursorA = Math.sqrt(dax * dax + day * day);
    const cursorFadeA = 1 - dCursorA / CURSOR_REACH;
    for (let b = a + 1; b < candidates.length; b++) {
      const sb = stars[candidates[b]];
      const dx = sa.x - sb.x, dy = sa.y - sb.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < linkSq) {
        const d = Math.sqrt(d2);
        const linkFade = 1 - d / LINK_DIST;
        const dbx = sb.x - mouse.x, dby = sb.y - mouse.y;
        const dCursorB = Math.sqrt(dbx * dbx + dby * dby);
        const cursorFadeB = 1 - dCursorB / CURSOR_REACH;
        const cursorFade = (cursorFadeA + cursorFadeB) * 0.5;
        const alpha = Math.pow(linkFade, 1.1) * Math.pow(cursorFade, 1.4) * 0.55;
        if (alpha > 0.02) {
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.moveTo(sa.x, sa.y);
          ctx.lineTo(sb.x, sb.y);
          ctx.stroke();
        }
      }
    }
  }
}

function _drawCursorRing(ctx, mouse) {
  const pulseR = 6 + mouse.vel * 0.6;
  ctx.globalAlpha = 0.15 + Math.min(0.35, mouse.vel * 0.015);
  ctx.strokeStyle = 'rgba(255, 220, 170, 1)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(mouse.x, mouse.y, pulseR, 0, TAU);
  ctx.stroke();
}

function _drawPulse(ctx, p) {
  const k = p.age / p.life;
  const r = k * PULSE_MAX_R;
  const a = (1 - k) * 0.45;

  ctx.globalAlpha = a;
  ctx.strokeStyle = 'rgba(255, 220, 170, 1)';
  ctx.lineWidth = 1.2 * (1 - k) + 0.4;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, TAU);
  ctx.stroke();

  // Secondary: flash links between stars near the ring
  const linkSq = LINK_DIST * LINK_DIST * 0.8;
  ctx.strokeStyle = 'rgba(255, 230, 180, 1)';
  ctx.lineWidth = 0.8;
  for (let j = 0; j < stars.length; j++) {
    const s = stars[j];
    const dx = s.x - p.x, dy = s.y - p.y;
    const dd = Math.sqrt(dx * dx + dy * dy);
    if (Math.abs(dd - r) < PULSE_RING_WIDTH) {
      const limit = Math.min(stars.length, j + 40);
      for (let kk = j + 1; kk < limit; kk++) {
        const s2 = stars[kk];
        const dxx = s.x - s2.x, dyy = s.y - s2.y;
        const d2 = dxx * dxx + dyy * dyy;
        if (d2 < linkSq) {
          const nearness = 1 - Math.abs(dd - r) / PULSE_RING_WIDTH;
          ctx.globalAlpha = nearness * (1 - k) * 0.6;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(s2.x, s2.y);
          ctx.stroke();
          break;
        }
      }
    }
  }
}

function _drawAnchorGlow(ctx, t) {
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgb(255, 225, 180)';
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    if (!s.anchor) continue;
    const tw2 = 0.5 + 0.5 * Math.sin(t * 0.0014 + s.ph);
    const a = (0.6 + tw2 * 0.4) * NODE_GLOW;
    ctx.globalAlpha = a * 0.10;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 10, 0, TAU); ctx.fill();
    ctx.globalAlpha = a * 0.22;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 4, 0, TAU); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function _drawStars(ctx, t) {
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    const phase = Math.sin(t * 0.0014 + s.ph);
    const alpha = (1 - TWINKLE) * 0.85 + TWINKLE * (0.45 + 0.55 * (phase * 0.5 + 0.5));
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.fillStyle = s.anchor ? 'rgb(255, 232, 195)' : 'rgb(226, 218, 200)';
    if (s.r < 0.9) {
      ctx.fillRect(s.x - s.r * 0.5, s.y - s.r * 0.5, s.r, s.r);
    } else {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fill();
    }
  }
}
