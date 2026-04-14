// attractor.js — Celestial formation library
// Each shape returns Float32Array [x0,y0, x1,y1, ...] centered at (0,0).
// buildCliffordPoints() picks one at random each call.

// Sun: dense filled disc with concentric rings
function _shapeSun(n, r) {
  const pts = new Float32Array(n * 2);
  const rings = 7;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const ring = Math.floor(t * rings);
    const pos  = (t * rings) - ring;
    const radius = r * (0.15 + (ring / (rings - 1)) * 0.85);
    const angle  = pos * Math.PI * 2 + ring * 0.7;
    pts[i * 2]     = Math.cos(angle) * radius;
    pts[i * 2 + 1] = Math.sin(angle) * radius;
  }
  return pts;
}

// Crescent moon: two overlapping arcs, thick crescent silhouette
function _shapeCrescent(n, r) {
  const pts = new Float32Array(n * 2);
  // Outer arc: full circle. Inner arc: offset circle that cuts the crescent.
  const offset = r * 0.38;
  for (let i = 0; i < n; i++) {
    const t     = i / n;
    const depth = Math.floor(t * 5); // 0..4 = thickness layers
    const pos   = (t * 5) - depth;
    const angle = pos * Math.PI * 2;
    const ro    = r * (0.55 + depth * 0.09);
    // Outer ring point
    let x = Math.cos(angle) * ro;
    let y = Math.sin(angle) * ro;
    // Subtract inner disc: discard points inside offset circle
    const dx = x - offset;
    const innerR = r * 0.52;
    if (dx * dx + y * y < innerR * innerR) {
      // Push to crescent edge instead
      const edgeAngle = Math.atan2(y, dx);
      x = Math.cos(edgeAngle) * innerR + offset;
      y = Math.sin(edgeAngle) * innerR;
    }
    pts[i * 2]     = x;
    pts[i * 2 + 1] = y;
  }
  return pts;
}

// Ringed planet (Saturn): filled disc + tilted elliptical ring
function _shapeRingedPlanet(n, r) {
  const pts = new Float32Array(n * 2);
  const planetR = r * 0.42;
  const split   = Math.floor(n * 0.55); // 55% planet body, 45% rings

  // Planet body: concentric circles
  for (let i = 0; i < split; i++) {
    const t     = i / split;
    const ro    = planetR * (0.2 + t * 0.8);
    const angle = t * Math.PI * 14; // dense spiral fill
    pts[i * 2]     = Math.cos(angle) * ro;
    pts[i * 2 + 1] = Math.sin(angle) * ro;
  }

  // Rings: 3 elliptical bands, tilted ~20°
  const tilt   = Math.PI * 0.11;
  const cosT   = Math.cos(tilt);
  const sinT   = Math.sin(tilt);
  const ringWidths = [0.62, 0.78, 0.95];
  const ringBand   = Math.floor((n - split) / ringWidths.length);
  for (let ri = 0; ri < ringWidths.length; ri++) {
    const rRing = r * ringWidths[ri];
    const start = split + ri * ringBand;
    const end   = Math.min(start + ringBand, n);
    for (let i = start; i < end; i++) {
      const angle = ((i - start) / (end - start)) * Math.PI * 2;
      const ex = Math.cos(angle) * rRing;
      const ey = Math.sin(angle) * rRing * 0.28; // squash to ellipse
      // Rotate by tilt
      pts[i * 2]     = ex * cosT - ey * sinT;
      pts[i * 2 + 1] = ex * sinT + ey * cosT;
    }
  }
  return pts;
}

// Spiral galaxy: 3 logarithmic arms + central bulge
function _shapeGalaxy(n, r) {
  const pts  = new Float32Array(n * 2);
  const arms = 3;
  const bulge = Math.floor(n * 0.2);

  // Central bulge
  for (let i = 0; i < bulge; i++) {
    const t     = i / bulge;
    const ro    = r * 0.18 * Math.sqrt(t);
    const angle = t * Math.PI * 10;
    pts[i * 2]     = Math.cos(angle) * ro;
    pts[i * 2 + 1] = Math.sin(angle) * ro;
  }

  // Arms
  const armPts = n - bulge;
  for (let i = 0; i < armPts; i++) {
    const t       = i / armPts;
    const arm     = i % arms;
    const armT    = Math.floor(i / arms) / Math.floor(armPts / arms);
    const radius  = r * 0.15 + r * 0.82 * armT;
    const angle   = (arm / arms) * Math.PI * 2 + armT * Math.PI * 2.8;
    // Small scatter perpendicular to arm
    const scatter = (Math.random() - 0.5) * r * 0.12 * (0.2 + armT);
    const perpA   = angle + Math.PI * 0.5;
    const idx     = bulge + i;
    pts[idx * 2]     = Math.cos(angle) * radius + Math.cos(perpA) * scatter;
    pts[idx * 2 + 1] = Math.sin(angle) * radius + Math.sin(perpA) * scatter;
  }
  return pts;
}

// Nova burst: radial spikes radiating from centre
function _shapeNovaBurst(n, r) {
  const pts    = new Float32Array(n * 2);
  const spikes = 12;
  for (let i = 0; i < n; i++) {
    const t     = i / n;
    const spike = i % spikes;
    const pos   = Math.floor(i / spikes) / Math.floor(n / spikes);
    const baseA = (spike / spikes) * Math.PI * 2;
    // Alternate long/short spikes
    const maxR  = spike % 2 === 0 ? r : r * 0.55;
    const ro    = maxR * (0.05 + pos * 0.95);
    // Slight angular taper
    const angle = baseA + (pos - 0.5) * 0.18;
    pts[i * 2]     = Math.cos(angle) * ro;
    pts[i * 2 + 1] = Math.sin(angle) * ro;
  }
  return pts;
}

// Eclipse / corona: thin bright ring with radial corona wisps
function _shapeEclipse(n, r) {
  const pts    = new Float32Array(n * 2);
  const ring   = Math.floor(n * 0.45);
  const corona = n - ring;

  // Ring: 4 tight concentric circles
  for (let i = 0; i < ring; i++) {
    const t     = i / ring;
    const layer = Math.floor(t * 4);
    const pos   = (t * 4) - layer;
    const ro    = r * (0.58 + layer * 0.04);
    const angle = pos * Math.PI * 2;
    pts[i * 2]     = Math.cos(angle) * ro;
    pts[i * 2 + 1] = Math.sin(angle) * ro;
  }

  // Corona: wispy rays
  const rays = 20;
  for (let i = 0; i < corona; i++) {
    const ray   = i % rays;
    const pos   = Math.floor(i / rays) / Math.floor(corona / rays);
    const angle = (ray / rays) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
    const ro    = r * (0.72 + pos * 0.28);
    pts[(ring + i) * 2]     = Math.cos(angle) * ro;
    pts[(ring + i) * 2 + 1] = Math.sin(angle) * ro;
  }
  return pts;
}

// Comet: dense nucleus + elongated dispersing tail
function _shapeComet(n, r) {
  const pts      = new Float32Array(n * 2);
  const headFrac = 0.35;
  const head     = Math.floor(n * headFrac);
  const tail     = n - head;
  const headR    = r * 0.22;

  // Head: tight disc
  for (let i = 0; i < head; i++) {
    const t     = i / head;
    const ro    = headR * Math.sqrt(t);
    const angle = t * Math.PI * 14;
    pts[i * 2]     = Math.cos(angle) * ro;
    pts[i * 2 + 1] = Math.sin(angle) * ro;
  }

  // Tail: fan spreading to the left, dispersing
  for (let i = 0; i < tail; i++) {
    const t      = i / tail;
    const spread = 0.18 + t * 0.52; // opens up
    const angle  = Math.PI + (Math.random() - 0.5) * spread * 1.6;
    const ro     = headR * 0.8 + t * r * 0.75;
    // Fade density — fewer points at tip by using sqrt dist
    pts[(head + i) * 2]     = Math.cos(angle) * ro;
    pts[(head + i) * 2 + 1] = Math.sin(angle) * ro * 0.55;
  }
  return pts;
}

// Nebula: several gaussian blobs scattered around centre
function _shapeNebula(n, r) {
  const pts     = new Float32Array(n * 2);
  const blobs   = 6;
  // Blob centres on a ring
  const blobCentres = Array.from({ length: blobs }, (_, i) => {
    const a = (i / blobs) * Math.PI * 2;
    return [Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42];
  });
  // Extra central blob
  blobCentres.push([0, 0]);

  for (let i = 0; i < n; i++) {
    const blob = i % blobCentres.length;
    const [cx, cy] = blobCentres[blob];
    // Box-Muller gaussian scatter
    const u1 = Math.max(1e-6, Math.random());
    const u2 = Math.random();
    const mag = Math.sqrt(-2 * Math.log(u1)) * r * 0.18;
    const a   = u2 * Math.PI * 2;
    pts[i * 2]     = cx + Math.cos(a) * mag;
    pts[i * 2 + 1] = cy + Math.sin(a) * mag;
  }
  return pts;
}

// Shape registry
const _shapes = [
  _shapeSun,
  _shapeCrescent,
  _shapeRingedPlanet,
  _shapeGalaxy,
  _shapeNovaBurst,
  _shapeEclipse,
  _shapeComet,
  _shapeNebula,
];

// Called by sigil.js on each idle trigger — picks a new random shape every time
function buildCliffordPoints(bboxW, bboxH) {
  const r    = Math.min(bboxW, bboxH) * 0.45;
  const fn   = _shapes[Math.floor(Math.random() * _shapes.length)];
  return fn(CLIFFORD_SAMPLES, r);
}
