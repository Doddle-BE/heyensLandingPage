const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/harness');

function setup(opts = {}) {
  const env = loadScripts({ scripts: ['wasps.js'], ...opts });
  return env;
}

const mouse = (o = {}) => ({ x: null, y: null, vel: 0, active: false, ...o });

// Deterministic Math.random (mulberry32) so long sim runs are reproducible.
function seedRandom(env, seed = 0x9e3779b9) {
  let a = seed;
  const random = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  env.context.Math = Object.assign(Object.create(Math), { random });
}

// The swarm lives in waspCreate's closure; reach it through the drawn output.
function drawnWaspCount(env) {
  // Each wasp body is one `rotate` inside its own save/restore.
  return env.ctx2d.countOf('rotate');
}

test('waspCreate returns the renderer contract', () => {
  const env = setup();
  const scene = env.context.waspCreate(env.canvas);
  for (const key of ['frame', 'resize', 'degrade', 'renderStill']) {
    assert.equal(typeof scene[key], 'function', `missing ${key}`);
  }
});

test('waspCreate returns null when the 2D context is unavailable', () => {
  const env = setup();
  const scene = env.context.waspCreate({ getContext: () => null });
  assert.equal(scene, null);
});

test('resize sizes the backing store by DPR and applies the CSS-pixel transform', () => {
  const env = setup();
  const scene = env.context.waspCreate(env.canvas);
  env.context.devicePixelRatio = 3;          // clamped to 2
  env.context.innerWidth = 500;
  env.context.innerHeight = 400;
  scene.resize();
  assert.equal(env.canvas.width, 1000);
  assert.equal(env.canvas.height, 800);
  const t = env.ctx2d.calls.filter((c) => c.name === 'setTransform').pop();
  assert.deepEqual(t.args, [2, 0, 0, 2, 0, 0]);
});

test('the swarm seeds to the desktop population and draws every wasp', () => {
  const env = setup();
  const scene = env.context.waspCreate(env.canvas);
  const pop = env.evaluate('WASP.population');
  scene.frame(0, mouse(), []);
  assert.equal(drawnWaspCount(env), pop);
});

test('coarse pointers seed the smaller population', () => {
  const env = setup({ coarse: true });
  const scene = env.context.waspCreate(env.canvas);
  scene.frame(0, mouse(), []);
  assert.equal(drawnWaspCount(env), env.evaluate('WASP.populationCoarse'));
});

test('frame advances the simulation — wasps move', () => {
  const env = setup();
  const scene = env.context.waspCreate(env.canvas);
  scene.frame(0, mouse(), []);
  const first = env.ctx2d.calls.filter((c) => c.name === 'translate').map((c) => c.args.join());
  env.ctx2d.calls.length = 0;
  for (let t = 16; t <= 320; t += 16) scene.frame(t, mouse(), []);
  const later = env.ctx2d.calls.filter((c) => c.name === 'translate').map((c) => c.args.join());
  assert.notDeepEqual(later.slice(-first.length), first);
});

test('the swarm keeps roaming near the nest over a long run', () => {
  const env = setup();
  // Deterministic sim: the swarm's targets, events and crossings are all random.
  seedRandom(env);
  const scene = env.context.waspCreate(env.canvas);
  for (let t = 16; t < 8000; t += 16) scene.frame(t, mouse(), []);
  env.ctx2d.calls.length = 0;
  scene.frame(8000, mouse(), []);

  const nest = { x: 800 * 0.22, y: 600 * 0.20 };
  const roam = Math.min(env.evaluate('WASP.roamRadius'), Math.min(800, 600) * 0.6);
  const positions = env.ctx2d.calls
    .filter((c) => c.name === 'translate')
    .slice(-drawnWaspCount(env))
    .map((c) => c.args);
  assert.ok(positions.length > 0);
  for (const [x, y] of positions) {
    assert.ok(Number.isFinite(x) && Number.isFinite(y), 'no NaN leaks into the sim');
  }
  // Outbound wasps legitimately fly off-screen before being culled, so only the
  // bulk of the swarm is expected to still be circling the nest.
  const nearNest = positions.filter(([x, y]) => Math.hypot(x - nest.x, y - nest.y) < roam * 2);
  assert.ok(nearNest.length >= positions.length * 0.6,
    `only ${nearNest.length}/${positions.length} wasps stayed near the nest`);
});

// Regression: `land` used to exit only within 8px of its surface point, which
// separation (26px) could prevent forever, and cursor avoidance (130px) is wider
// than the nest — parking the cursor on it stalled the whole swarm on the nest.
test('a cursor resting on the nest does not strand the swarm on it', () => {
  const env = setup();
  seedRandom(env);
  env.context.innerWidth = 1440;
  env.context.innerHeight = 900;
  const scene = env.context.waspCreate(env.canvas);
  scene.resize();
  const nest = { x: 1440 * 0.22, y: 900 * 0.20 };
  const onNest = mouse({ x: nest.x, y: nest.y, active: true });
  for (let t = 16; t < 60000; t += 16) scene.frame(t, onNest, []);

  const sample = (t) => {
    env.ctx2d.calls.length = 0;
    scene.frame(t, onNest, []);
    const n = drawnWaspCount(env);
    return env.ctx2d.calls.filter((c) => c.name === 'translate').slice(-n).map((c) => c.args);
  };
  // Nest traffic is the liveness signal: a stalled swarm never launches again,
  // so no wasp is ever seen in transit past the edge of the canvas.
  let transitFrames = 0;
  for (let t = 60000; t < 120000; t += 16) {
    for (const [x, y] of sample(t)) {
      if (x < -10 || x > 1450 || y < -10 || y > 910) { transitFrames++; break; }
    }
  }
  assert.ok(transitFrames > 200,
    `only ${transitFrames} frames with a wasp in transit — the swarm stalled on the nest`);
});

// Regression: only `roam` was contained, so wasps chasing the nest's entrance
// arc trailed off the canvas (a quarter of resident wasp-frames at 390px wide).
test('the swarm stays framed on a narrow viewport', () => {
  const env = setup({ coarse: true });
  seedRandom(env);
  env.context.innerWidth = 390;
  env.context.innerHeight = 740;
  const scene = env.context.waspCreate(env.canvas);
  scene.resize();
  let inside = 0;
  let total = 0;
  for (let t = 16; t < 30000; t += 16) {
    env.ctx2d.calls.length = 0;
    scene.frame(t, mouse(), []);
    const n = drawnWaspCount(env);
    for (const [x, y] of env.ctx2d.calls.filter((c) => c.name === 'translate').slice(-n).map((c) => c.args)) {
      total++;
      if (x >= 0 && x <= 390 && y >= 0 && y <= 740) inside++;
    }
  }
  assert.ok(total > 0);
  // The rest are wasps deliberately in transit to or from the screen edge.
  assert.ok(inside > total * 0.85, `only ${((inside / total) * 100).toFixed(1)}% of wasp-frames were on canvas`);
});

test('click pulses are ingested once and marked on the shared queue', () => {
  const env = setup();
  const scene = env.context.waspCreate(env.canvas);
  const pulses = [{ x: 100, y: 100, age: 0, life: 900 }];
  scene.frame(16, mouse(), pulses);
  assert.equal(pulses[0]._w, true);
  scene.frame(32, mouse(), pulses);
  assert.equal(pulses[0]._w, true, 'the same pulse is not re-ingested');
});

test('frame tolerates a missing pulse queue and a null mouse', () => {
  const env = setup();
  const scene = env.context.waspCreate(env.canvas);
  assert.doesNotThrow(() => scene.frame(16, null, null));
});

test('an active cursor parallaxes the scene', () => {
  const env = setup();
  const scene = env.context.waspCreate(env.canvas);
  scene.frame(0, mouse(), []);
  const centred = env.ctx2d.calls.find((c) => c.name === 'translate' && c.args[0] === 0 && c.args[1] === 0);
  assert.ok(centred, 'no parallax offset without a cursor');

  env.ctx2d.calls.length = 0;
  scene.frame(16, mouse({ x: 0, y: 0, active: true }), []);
  const par = env.ctx2d.calls.filter((c) => c.name === 'translate').map((c) => c.args);
  const amp = env.evaluate('WASP.parallax');
  assert.ok(par.some(([x, y]) => x === -amp / 2 && y === -amp / 2), 'top-left cursor shifts the layer');
});

// Regression: the stalk was a fixed length, so on many viewports the nest hung
// in mid-air below the eave instead of touching it.
test('the nest stalk reaches the eave on every viewport', () => {
  for (const [w, h] of [[1440, 900], [1920, 1080], [800, 600], [600, 900], [500, 400], [1200, 380]]) {
    const env = setup();
    env.context.innerWidth = w;
    env.context.innerHeight = h;
    const scene = env.context.waspCreate(env.canvas);
    scene.resize();
    env.ctx2d.calls.length = 0;
    scene.frame(0, mouse(), []);

    const translates = env.ctx2d.calls.filter((c) => c.name === 'translate').map((c) => c.args);
    const [branchOx, branchOy] = translates[0];
    const [nestX, nestY] = translates[1];
    const eave = env.ctx2d.calls.filter((c) => c.name === 'lineTo').slice(0, 3).map((c) => c.args);
    const [midX, midY] = eave[1];
    const nearY = eave[2][1];
    const stalkTop = env.ctx2d.calls.find((c) => c.name === 'moveTo' && c.args[0] === 0).args[1];

    const localX = nestX - branchOx;
    const underside = nearY + (midY - nearY) * (localX / midX);
    const gap = (nestY + stalkTop) - (branchOy + underside);
    assert.ok(gap <= 0 && gap > -8, `${w}x${h}: stalk is ${gap.toFixed(1)}px off the eave`);
    assert.ok(localX < midX, `${w}x${h}: nest hangs past the eave`);
  }
});

test('degrade trims the swarm once and refuses a second step', () => {
  const env = setup();
  const scene = env.context.waspCreate(env.canvas);
  const pop = env.evaluate('WASP.population');
  assert.equal(scene.degrade(), false, 'single-step fallback reports no further steps');
  env.ctx2d.calls.length = 0;
  scene.frame(16, mouse(), []);
  const trimmed = drawnWaspCount(env);
  assert.equal(trimmed, Math.max(6, Math.round(pop * 0.6)));
  assert.ok(trimmed < pop);

  assert.equal(scene.degrade(), false);
  env.ctx2d.calls.length = 0;
  scene.frame(32, mouse(), []);
  assert.equal(drawnWaspCount(env), trimmed, 'already degraded — population unchanged');
});

test('renderStill is deterministic and draws the resting tableau', () => {
  const env = setup();
  const scene = env.context.waspCreate(env.canvas);
  env.ctx2d.calls.length = 0;
  scene.renderStill();
  const first = JSON.stringify(env.ctx2d.calls);
  assert.equal(drawnWaspCount(env), 5, 'three resting + two hovering wasps');
  env.ctx2d.calls.length = 0;
  scene.renderStill();
  assert.equal(JSON.stringify(env.ctx2d.calls), first);
});

test('the swarm is topped up after wasps are removed', () => {
  const env = setup();
  const scene = env.context.waspCreate(env.canvas);
  scene.degrade();                     // shrink the target population
  for (let t = 16; t <= 2000; t += 16) scene.frame(t, mouse(), []);
  env.ctx2d.calls.length = 0;
  scene.frame(2016, mouse(), []);
  assert.ok(drawnWaspCount(env) >= 6, 'population never collapses');
});
