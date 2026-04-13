// Starfield — Float32Array pool, init, update, render
// All coordinates in CSS pixel space. DPR transform is applied once in main.js.

let pool = null;       // Float32Array, TOTAL_STARS * FIELDS entries
let totalStars = 0;
let canvasW = 0;
let canvasH = 0;
let elapsedMs = 0;

// Pre-built color lookup: 256 entries from warm amber (z near) to cool blue (z far).
// Built once in sfInit — zero string allocation during render.
const COLOR_TABLE = new Array(256);

// Offsets into pool where each layer starts
let layerStart = [0, 0, 0];

function sfInit(w, h) {
  canvasW = w;
  canvasH = h;
  elapsedMs = 0;

  // Build chromatic color table: warm amber (z=Z_NEAR) → cool blue (z=Z_FAR)
  for (let i = 0; i < 256; i++) {
    const t = Math.sqrt(i / 255); // sqrt bias: more warm stars than cool
    const r = Math.round(255 + (130 - 255) * t);
    const g = Math.round(220 + (160 - 220) * t);
    const b = Math.round(160 + (255 - 160) * t);
    COLOR_TABLE[i] = `rgb(${r},${g},${b})`;
  }

  totalStars = STAR_COUNT[0] + STAR_COUNT[1] + STAR_COUNT[2];
  pool = new Float32Array(totalStars * FIELDS);

  // Precompute layer start indices
  layerStart[0] = 0;
  layerStart[1] = STAR_COUNT[0];
  layerStart[2] = STAR_COUNT[0] + STAR_COUNT[1];

  for (let layer = 0; layer < LAYER_COUNT; layer++) {
    const count = STAR_COUNT[layer];
    const start = layerStart[layer];
    for (let i = 0; i < count; i++) {
      const base = (start + i) * FIELDS;
      pool[base + FIELD_X]     = (Math.random() - 0.5) * canvasW * 2;
      pool[base + FIELD_Y]     = (Math.random() - 0.5) * canvasH * 2;
      pool[base + FIELD_Z]     = Z_NEAR + Math.random() * (Z_FAR - Z_NEAR);
      pool[base + FIELD_VX]    = (Math.random() - 0.5) * LAYER_BASE_VX[layer] * 2;
      pool[base + FIELD_VY]    = (Math.random() - 0.5) * LAYER_BASE_VY[layer] * 2;
      pool[base + FIELD_ALPHA] = 0.7 + Math.random() * 0.3;
      pool[base + FIELD_LAYER] = layer;
      pool[base + FIELD_PHASE] = Math.random() * Math.PI * 2;
      // Phase 2 reserved fields — initialize to 0
      pool[base + FIELD_TARGET_X] = 0;
      pool[base + FIELD_TARGET_Y] = 0;
      pool[base + FIELD_MODE]     = 0;
      pool[base + FIELD_TIMER]    = 0;
    }
  }
}

// Project a 3D point to 2D screen space (CSS pixels)
function project(x, y, z) {
  const halfW = canvasW * 0.5;
  const halfH = canvasH * 0.5;
  return {
    sx: (x / z) * FOCAL_LENGTH + halfW,
    sy: (y / z) * FOCAL_LENGTH + halfH,
  };
}

function sfUpdate(mouse, activeCount, dt) {
  elapsedMs += dt;

  const halfW = canvasW * 0.5;
  const halfH = canvasH * 0.5;
  const mx = mouse.x;
  const my = mouse.y;
  const mouseVelNorm = Math.min(mouse.vel / MAX_CURSOR_VEL, 1);
  const repulseStrength = mouseVelNorm * BASE_REPULSE;

  for (let layer = 0; layer < LAYER_COUNT; layer++) {
    const count = activeCount[layer];
    const start = layerStart[layer];

    for (let i = 0; i < count; i++) {
      const base = (start + i) * FIELDS;
      const x = pool[base + FIELD_X];
      const y = pool[base + FIELD_Y];
      const z = pool[base + FIELD_Z];

      if (z <= 0) continue;

      // Project to screen space (reused for force field + edge recycle)
      const sx = (x / z) * FOCAL_LENGTH + halfW;
      const sy = (y / z) * FOCAL_LENGTH + halfH;

      // Cursor force field repulsion
      if (repulseStrength > 0) {
        const dx = sx - mx;
        const dy = sy - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < INFLUENCE_RADIUS && dist > 0) {
          const scale = repulseStrength / dist;
          pool[base + FIELD_VX] += dx * scale;
          pool[base + FIELD_VY] += dy * scale;
        }
      }

      // Supernova impulse
      if (mouse.clicked) {
        const dx = sx - mouse.clickX;
        const dy = sy - mouse.clickY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const safeDist = Math.max(dist, 1);
        const mag = SUPERNOVA_IMPULSE / safeDist;
        pool[base + FIELD_VX] += (dx / safeDist) * mag;
        pool[base + FIELD_VY] += (dy / safeDist) * mag;
        // Velocity cap
        pool[base + FIELD_VX] = Math.max(-MAX_STAR_VEL, Math.min(MAX_STAR_VEL, pool[base + FIELD_VX]));
        pool[base + FIELD_VY] = Math.max(-MAX_STAR_VEL, Math.min(MAX_STAR_VEL, pool[base + FIELD_VY]));
      }

      // Integrate position (vx/vy are in CSS pixels per ms)
      pool[base + FIELD_X] += pool[base + FIELD_VX] * dt;
      pool[base + FIELD_Y] += pool[base + FIELD_VY] * dt;

      // Recompute screen pos after position update for edge check
      const nsx = (pool[base + FIELD_X] / z) * FOCAL_LENGTH + halfW;
      const nsy = (pool[base + FIELD_Y] / z) * FOCAL_LENGTH + halfH;

      // Edge recycling — skip sigil-assigned stars (they spring back on their own)
      if ((nsx < 0 || nsx > canvasW || nsy < 0 || nsy > canvasH) && pool[base + FIELD_MODE] === 0) {
        // Preserve z — stars re-enter at the same depth they left.
        // Spawn range scales with z so the star projects anywhere on screen.
        const spawnScale = z / FOCAL_LENGTH;
        pool[base + FIELD_X] = (Math.random() - 0.5) * canvasW * spawnScale;
        pool[base + FIELD_Y] = (Math.random() - 0.5) * canvasH * spawnScale;
        pool[base + FIELD_VX] = (Math.random() - 0.5) * LAYER_BASE_VX[layer] * 2;
        pool[base + FIELD_VY] = (Math.random() - 0.5) * LAYER_BASE_VY[layer] * 2;
      }

      // Twinkle alpha
      const phase = pool[base + FIELD_PHASE];
      pool[base + FIELD_ALPHA] = 0.7 + 0.3 * Math.sin(elapsedMs * 0.002 + phase);
    }
  }
}

function sfRender(ctx, activeCount) {
  ctx.clearRect(0, 0, canvasW, canvasH);

  const halfW = canvasW * 0.5;
  const halfH = canvasH * 0.5;

  // ── Normal star pass ────────────────────────────────────────────────────────
  // Per-star fillStyle from COLOR_TABLE (chromatic depth: warm near, cool far).
  // globalAlpha is already set per-star for twinkling, so the old per-layer
  // fillStyle batch was already broken — no additional perf cost here.
  for (let layer = 0; layer < LAYER_COUNT; layer++) {
    const count = activeCount[layer];
    const start = layerStart[layer];
    const baseRadius = BASE_RADIUS[layer];
    const isLayer1 = layer === 0;

    for (let i = 0; i < count; i++) {
      const base = (start + i) * FIELDS;
      const z = pool[base + FIELD_Z];
      if (z <= 0) continue;

      const x = pool[base + FIELD_X];
      const y = pool[base + FIELD_Y];
      const sx = (x / z) * FOCAL_LENGTH + halfW;
      const sy = (y / z) * FOCAL_LENGTH + halfH;

      if (sx < 0 || sx > canvasW || sy < 0 || sy > canvasH) continue;

      const r = Math.max(0.3, Math.min(3, (baseRadius / z) * FOCAL_LENGTH));

      const colorIdx = Math.min(255, Math.max(0, Math.floor((z - Z_NEAR) / (Z_FAR - Z_NEAR) * 255)));
      ctx.fillStyle = COLOR_TABLE[colorIdx];
      ctx.globalAlpha = pool[base + FIELD_ALPHA];

      if (isLayer1) {
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
      }
    }

    ctx.globalAlpha = 1;
  }

  // ── Additive glow pass (layer 0 only) ──────────────────────────────────────
  // No gradients — plain solid circles in 'lighter' (additive) compositing mode.
  // Overlapping halos stack: dense star clusters naturally bloom brighter.
  ctx.globalCompositeOperation = 'lighter';

  const glowCount = activeCount[0];
  const glowStart = layerStart[0];

  for (let i = 0; i < glowCount; i++) {
    const base = (glowStart + i) * FIELDS;
    const z = pool[base + FIELD_Z];
    if (z <= 0 || z > GLOW_MAX_Z) continue;

    const sx = (pool[base + FIELD_X] / z) * FOCAL_LENGTH + halfW;
    const sy = (pool[base + FIELD_Y] / z) * FOCAL_LENGTH + halfH;
    if (sx < 0 || sx > canvasW || sy < 0 || sy > canvasH) continue;

    const r = Math.max(0.3, Math.min(3, (BASE_RADIUS[0] / z) * FOCAL_LENGTH));
    const alpha = pool[base + FIELD_ALPHA];
    const colorIdx = Math.min(255, Math.max(0, Math.floor((z - Z_NEAR) / (Z_FAR - Z_NEAR) * 255)));
    ctx.fillStyle = COLOR_TABLE[colorIdx];

    for (let g = 0; g < 3; g++) {
      ctx.globalAlpha = alpha * GLOW_ALPHAS[g];
      ctx.beginPath();
      ctx.arc(sx, sy, r * GLOW_MULTS[g], 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}
