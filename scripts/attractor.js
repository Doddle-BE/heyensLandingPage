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
