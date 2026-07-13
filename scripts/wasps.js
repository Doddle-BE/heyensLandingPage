// Wasp scene — a daylight nest with a persistent roaming swarm and periodic
// in/out traffic. Built to the same contract as the WebGL sky so main.js can
// drive either: waspCreate(canvas) -> { frame, resize, degrade, renderStill }.
//
// COORDINATE CONTRACT: all sim/logic in CSS pixel space; DPR is render-only
// (canvas backing store scaled via ctx.setTransform). canvas { alpha: false }.
//
// Choreography + parameters validated in the ticket #8 prototype
// (branch prototype/wasp-choreography); ported here to production shape.

// Locked parameters (owner-approved in #8). Speeds px/s, radii px, angles deg.
const WASP = {
  population:     24,   // persistent airborne swarm (desktop)
  populationCoarse: 12, // coarse-pointer / small screens
  crossingsMin:   10,   // full in/out crossings per minute (Kelber baseline ~3)
  roamRadius:    260,   // px spread of the roaming swarm around the nest
  cruiseOut:     340,   // px/s outbound transit
  cruiseIn:      260,   // px/s inbound transit
  roamSpeed:     150,   // px/s wandering near the nest
  orbitAngVel:   150,   // deg/s entrance arc (Zeil 100-200)
  orbitRadius:    60,   // px arc radius at the entrance
  arriveRadius:   46,   // px slow-down radius
  eventRate:     0.35,  // Hz: how often a roamer dips to orbit/land
  landChance:    0.30,  // fraction of those events that land vs orbit
  hoverHold:     0.9,   // s idle on the nest surface
  wanderAmp:      18,   // deg heading noise amplitude
  wanderRate:    0.9,   // Hz heading noise
  sepRadius:      26,   // px separation
  sepWeight:     1.1,
  cursorAvoid:   130,   // px avoidance radius (0 = off)
  avoidWeight:   2.4,
  parallax:       14,   // px scene parallax against the cursor
  maxForce:     1600,   // steering force clamp
};

function waspCreate(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return null;

  let W = 0, H = 0, DPR = 1;
  let prevT = 0, topup = 0, cross = 0;
  let effPop, effRoam;
  let lowDetail = false, degraded = false;
  const coarse = matchMedia('(pointer: coarse)').matches;

  const nest = { x: 0, y: 0, r: 0, entry: { x: 0, y: 0 } };
  const wasps = [];
  const scatters = [];   // ingested click pulses, aged internally

  // ---- vector helpers (CSS-pixel space) ----------------------------------
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const len = (v) => Math.hypot(v.x, v.y);
  const norm = (v) => { const l = len(v) || 1; return { x: v.x / l, y: v.y / l }; };
  function clampMag(v, m) { const l = len(v); if (l > m && l > 0) { v.x = v.x / l * m; v.y = v.y / l * m; } }

  // ---- geometry ----------------------------------------------------------
  function computeNest() {
    nest.x = W * 0.22; nest.y = H * 0.20;
    nest.r = Math.max(46, Math.min(W, H) * 0.075);
    nest.entry.x = nest.x; nest.entry.y = nest.y + nest.r * 0.92;
    // keep the roam spread inside the viewport on small screens
    effRoam = Math.min(WASP.roamRadius, Math.min(W, H) * 0.6);
  }
  function edgePoint() {
    const s = (Math.random() * 4) | 0, m = 60;
    if (s === 0) return { x: Math.random() * W, y: -m };
    if (s === 1) return { x: W + m, y: Math.random() * H };
    if (s === 2) return { x: Math.random() * W, y: H + m };
    return { x: -m, y: Math.random() * H };
  }
  function roamTarget() {
    const a = Math.random() * 6.283, r = Math.random() * effRoam;
    return { x: nest.x + Math.cos(a) * r, y: nest.y + Math.sin(a) * r * 0.8 };
  }
  function surfacePoint() {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
    return { x: nest.x + Math.cos(a) * nest.r * 0.7, y: nest.y + Math.sin(a) * nest.r * 0.75 };
  }
  function mkWasp(o) {
    return Object.assign({
      x: 0, y: 0, vx: 0, vy: 0, state: 'roam', t: Math.random() * 9,
      phase: Math.random() * 1000, wing: Math.random() * 6, tgt: roamTarget(),
      orbitA: 0, orbitLeft: 0, evt: 0, hold: 0, dir: Math.random() < 0.5 ? 1 : -1,
    }, o);
  }
  function spawnInbound() { const p = edgePoint(); wasps.push(mkWasp({ x: p.x, y: p.y, state: 'inbound' })); }
  function seedSwarm() {
    wasps.length = 0;
    for (let i = 0; i < effPop; i++) { const t = roamTarget(); wasps.push(mkWasp({ x: t.x, y: t.y, state: 'roam' })); }
  }

  // ---- steering ----------------------------------------------------------
  function arrive(w, target, speed, F, slow) {
    const to = sub(target, w), d = len(to); slow = slow || effRoam * 0.25;
    const s = d < slow ? speed * (d / slow) : speed, n = norm(to);
    F.x += n.x * s - w.vx; F.y += n.y * s - w.vy;
  }
  function wander(w, F, mag) {
    const n = Math.sin(w.t * WASP.wanderRate * 6.28 + w.phase) + 0.5 * Math.sin(w.t * WASP.wanderRate * 12.9 + w.phase * 1.7);
    const ang = Math.atan2(w.vy, w.vx) + n * WASP.wanderAmp * Math.PI / 180;
    F.x += Math.cos(ang) * mag; F.y += Math.sin(ang) * mag;
  }
  function separate(w, F) {
    let sx = 0, sy = 0, n = 0;
    for (const o of wasps) {
      if (o === w) continue;
      const dx = w.x - o.x, dy = w.y - o.y, d = Math.hypot(dx, dy);
      if (d > 0 && d < WASP.sepRadius) { sx += dx / d; sy += dy / d; n++; }
    }
    if (n) { F.x += sx / n * WASP.sepWeight * 300; F.y += sy / n * WASP.sepWeight * 300; }
  }
  function avoidCursor(w, F, mouse) {
    if (!WASP.cursorAvoid || !mouse || !mouse.active || mouse.x == null) return;
    const dx = w.x - mouse.x, dy = w.y - mouse.y, d = Math.hypot(dx, dy);
    if (d > 0 && d < WASP.cursorAvoid) { const f = (1 - d / WASP.cursorAvoid) * WASP.avoidWeight * 900; F.x += dx / d * f; F.y += dy / d * f; }
  }
  function pulseScatter(w, F) {
    for (const p of scatters) {
      const dx = w.x - p.x, dy = w.y - p.y, d = Math.hypot(dx, dy), R = 40 + p.age * 540;
      if (d > 0 && d < R && d > R - 100) { const f = 1300 * (1 - p.age); F.x += dx / d * f; F.y += dy / d * f; }
    }
  }

  function step(w, dt, mouse) {
    w.t += dt; w.wing += dt * 80;
    const F = { x: 0, y: 0 }; let maxSpeed = WASP.roamSpeed;

    if (w.state === 'inbound') {
      arrive(w, nest, WASP.cruiseIn, F, WASP.arriveRadius); wander(w, F, 220); maxSpeed = WASP.cruiseIn;
      if (len(sub(w, nest)) < effRoam * 0.7) { w.state = 'roam'; w.tgt = roamTarget(); }
    } else if (w.state === 'roam') {
      arrive(w, w.tgt, WASP.roamSpeed, F); wander(w, F, 260); maxSpeed = WASP.roamSpeed;
      if (len(sub(w, w.tgt)) < 34) w.tgt = roamTarget();
      if (len(sub(w, nest)) > effRoam * 1.15) { const b = norm(sub(nest, w)); F.x += b.x * 400; F.y += b.y * 400; }
      w.evt += dt;
      if (w.evt > 1 / Math.max(0.05, WASP.eventRate) * (0.5 + Math.random())) {
        w.evt = 0;
        if (Math.random() < WASP.landChance) { w.state = 'land'; w.tgt = surfacePoint(); }
        else { w.state = 'orbit'; w.orbitA = Math.atan2(w.y - nest.entry.y, w.x - nest.entry.x); w.orbitLeft = 1 + Math.random() * 2; }
      }
    } else if (w.state === 'orbit') {
      const av = WASP.orbitAngVel * Math.PI / 180 * w.dir;
      w.orbitA += av * dt; w.orbitLeft -= Math.abs(av * dt) / 6.283;
      const tx = nest.entry.x + Math.cos(w.orbitA) * WASP.orbitRadius, ty = nest.entry.y + Math.sin(w.orbitA) * WASP.orbitRadius;
      arrive(w, { x: tx, y: ty }, WASP.orbitAngVel * Math.PI / 180 * WASP.orbitRadius, F, 30);
      maxSpeed = WASP.orbitAngVel * Math.PI / 180 * WASP.orbitRadius * 1.4;
      if (w.orbitLeft <= 0) { w.state = 'roam'; w.tgt = roamTarget(); }
    } else if (w.state === 'land') {
      arrive(w, w.tgt, WASP.roamSpeed * 0.7, F, 40); maxSpeed = WASP.roamSpeed * 0.8;
      if (len(sub(w, w.tgt)) < 8) { w.state = 'hold'; w.hold = WASP.hoverHold; }
    } else if (w.state === 'hold') {
      w.vx *= 0.5; w.vy *= 0.5; w.hold -= dt; if (w.hold <= 0) { w.state = 'roam'; w.tgt = roamTarget(); }
    } else if (w.state === 'launch') {
      arrive(w, { x: nest.entry.x + w.dir * 80, y: nest.entry.y + 140 }, WASP.cruiseOut, F, 60); maxSpeed = WASP.cruiseOut;
      if (len(sub(w, nest.entry)) > 150) { w.state = 'outbound'; w.tgt = edgePoint(); }
    } else if (w.state === 'outbound') {
      arrive(w, w.tgt, WASP.cruiseOut, F, 80); wander(w, F, 220); maxSpeed = WASP.cruiseOut;
      if (w.x < -60 || w.x > W + 60 || w.y < -60 || w.y > H + 60) w.dead = true;
    }

    separate(w, F); avoidCursor(w, F, mouse); pulseScatter(w, F);
    clampMag(F, WASP.maxForce);
    w.vx += F.x * dt; w.vy += F.y * dt;
    const sp = Math.hypot(w.vx, w.vy);
    if (sp > maxSpeed * 1.7) { w.vx *= maxSpeed * 1.7 / sp; w.vy *= maxSpeed * 1.7 / sp; }
    w.x += w.vx * dt; w.y += w.vy * dt;
  }

  // maintain the swarm toward target population + periodic in/out crossings
  function schedule(dt) {
    topup += dt;
    if (topup > 0.4) { topup = 0; if (wasps.length < effPop) spawnInbound(); }
    cross += dt;
    const interval = 60 / Math.max(1, WASP.crossingsMin);
    while (cross >= interval) {
      cross -= interval;
      const cand = wasps.filter((w) => w.state === 'roam' || w.state === 'orbit');
      if (cand.length > 3) cand[(Math.random() * cand.length) | 0].state = 'launch';
    }
  }

  // ingest click pulses (from input.js) once, then drive them internally
  function ingestPulses(pulses) {
    if (!pulses) return;
    for (const p of pulses) { if (!p._w) { p._w = true; scatters.push({ x: p.x, y: p.y, age: 0 }); } }
  }

  // ---- drawing -----------------------------------------------------------
  function drawNest(ox, oy) {
    ctx.save(); ctx.translate(nest.x + ox, nest.y + oy);
    ctx.fillStyle = '#5c5148';
    ctx.beginPath(); ctx.moveTo(-nest.x - ox, -nest.y - oy); ctx.lineTo(W * 0.42 - nest.x, -nest.y - oy);
    ctx.lineTo(W * 0.34 - nest.x, 44 - nest.y); ctx.lineTo(-nest.x - ox, 60 - nest.y); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#6e6459'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(0, -nest.r - 30); ctx.lineTo(0, -nest.r * 0.7); ctx.stroke();
    for (let i = 4; i >= 0; i--) {
      const r = nest.r * (0.55 + i * 0.11), c = 188 - i * 14;
      ctx.fillStyle = `rgb(${c},${c - 8},${c - 22})`;
      ctx.beginPath(); ctx.ellipse(0, i * 3, r, r * 1.08, 0, 0, 6.283); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(90,80,70,.3)'; ctx.lineWidth = 1.3;
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(0, i * 6 - 8, nest.r * 0.5 + i * 8, nest.r * 0.2 + i * 4, 0, 0.4, 2.74); ctx.stroke(); }
    ctx.fillStyle = '#241a12'; ctx.beginPath(); ctx.ellipse(0, nest.r * 0.92, 11, 9, 0, 0, 6.283); ctx.fill();
    ctx.restore();
  }
  function drawWasp(w) {
    ctx.save(); ctx.translate(w.x, w.y); ctx.rotate(Math.atan2(w.vy, w.vx)); ctx.scale(1.5, 1.5);
    if (!lowDetail) {
      const fl = Math.sin(w.wing);
      ctx.fillStyle = 'rgba(150,162,185,.5)';
      ctx.beginPath(); ctx.ellipse(-1, -4 - fl * 1.6, 5, 2, -0.6, 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-1, 4 + fl * 1.6, 5, 2, 0.6, 0, 6.283); ctx.fill();
    }
    ctx.fillStyle = '#221a10'; ctx.beginPath(); ctx.ellipse(0, 0, 6.5, 2.7, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#e0a72e'; ctx.fillRect(-0.5, -2.3, 1.7, 4.6); ctx.fillRect(3, -1.9, 1.4, 3.8);
    ctx.restore();
  }
  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#cfe4f5'); g.addColorStop(0.7, '#eae9dd'); g.addColorStop(1, '#f5efe2');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const sun = ctx.createRadialGradient(W * 0.9, H * 0.08, 10, W * 0.9, H * 0.08, 360);
    sun.addColorStop(0, 'rgba(255,244,214,.85)'); sun.addColorStop(1, 'rgba(255,244,214,0)');
    ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);
  }
  function draw(mouse) {
    let px = 0, py = 0;
    if (mouse && mouse.active && mouse.x != null) { px = (mouse.x - W / 2) / W * WASP.parallax; py = (mouse.y - H / 2) / H * WASP.parallax; }
    drawSky();
    drawNest(px * 0.4, py * 0.4);
    ctx.save(); ctx.translate(px, py);
    for (const w of wasps) drawWasp(w);
    ctx.restore();
  }

  // ---- contract ----------------------------------------------------------
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    computeNest();
  }
  function frame(t, mouse, pulses /* , look — fixed framing, ignored */) {
    const dt = prevT ? Math.min((t - prevT) / 1000, 0.05) : 0.016;
    prevT = t;
    ingestPulses(pulses);
    for (const p of scatters) p.age += dt / 0.9;
    for (let i = scatters.length - 1; i >= 0; i--) if (scatters[i].age >= 1) scatters.splice(i, 1);
    schedule(dt);
    for (const w of wasps) step(w, dt, mouse);
    for (let i = wasps.length - 1; i >= 0; i--) if (wasps[i].dead) wasps.splice(i, 1);
    draw(mouse);
  }
  // Reduced-motion: one settled frame — nest + a few resting wasps, no motion.
  // Deterministic so repeated calls (present-race redraw) are identical.
  function renderStill() {
    drawSky();
    let px = 0; drawNest(0, 0);
    const rest = [
      { a: -1.9, r: 0.72, h: 2.6 }, { a: -1.2, r: 0.74, h: 0.5 },  // on the surface
      { a: -0.4, r: 0.78, h: -0.3 },
    ];
    for (const s of rest) {
      const x = nest.x + Math.cos(s.a) * nest.r * s.r, y = nest.y + Math.sin(s.a) * nest.r * s.r;
      drawWasp({ x, y, vx: Math.cos(s.h), vy: Math.sin(s.h), wing: 0 });
    }
    // two hovering just off the entrance
    drawWasp({ x: nest.entry.x - 34, y: nest.entry.y + 6, vx: 1, vy: 0.1, wing: 0 });
    drawWasp({ x: nest.entry.x + 30, y: nest.entry.y - 4, vx: -1, vy: 0.2, wing: 0 });
  }
  // One-step perf fallback: trim the swarm + drop per-wasp detail. Returns
  // whether further degradation is possible (false — single step, like the cap).
  function degrade() {
    if (degraded) return false;
    degraded = true; lowDetail = true;
    effPop = Math.max(6, Math.round(effPop * 0.6));
    while (wasps.length > effPop) wasps.pop();
    return false;
  }

  effPop = coarse ? WASP.populationCoarse : WASP.population;
  resize();
  seedSwarm();
  return { frame, resize, degrade, renderStill };
}
