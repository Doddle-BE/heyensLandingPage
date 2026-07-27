const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/harness');

function setup(opts = {}) {
  const env = loadScripts({ scripts: ['wasps.js'], ...opts });
  return env;
}

const mouse = (o = {}) => ({ x: null, y: null, vel: 0, active: false, ...o });

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

test('the swarm stays near the nest over a long run', () => {
  const env = setup();
  const scene = env.context.waspCreate(env.canvas);
  for (let t = 16; t <= 8000; t += 16) scene.frame(t, mouse(), []);
  const positions = env.ctx2d.calls
    .filter((c) => c.name === 'translate')
    .slice(-env.evaluate('WASP.population'));
  assert.ok(positions.length > 0);
  for (const p of positions) {
    const [x, y] = p.args;
    assert.ok(Number.isFinite(x) && Number.isFinite(y), 'no NaN leaks into the sim');
    assert.ok(x > -200 && x < 1000 && y > -200 && y < 800, `wasp escaped: ${x},${y}`);
  }
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
