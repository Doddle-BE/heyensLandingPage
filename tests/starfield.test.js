const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/harness');

// Deterministic stand-in for Math.random so star seeding is reproducible.
function withRandom(env, values) {
  let i = 0;
  env.context.Math = Object.create(Math);
  env.context.Math.random = () => values[i++ % values.length];
}

function setup(seedValues) {
  const env = loadScripts({ scripts: ['config.js', 'starfield.js'] });
  if (seedValues) withRandom(env, seedValues);
  return env;
}

const mouseAt = (o = {}) => ({ x: null, y: null, vel: 0, active: false, ...o });

test('sfInit seeds the requested star count inside the canvas bounds', () => {
  const env = setup();
  env.context.sfInit(800, 600, 120);
  const stars = env.evaluate('stars');
  assert.equal(stars.length, 120);
  for (const s of stars) {
    assert.ok(s.x >= 0 && s.x <= 800);
    assert.ok(s.y >= 0 && s.y <= 600);
    assert.ok(s.r > 0);
    assert.equal(typeof s.anchor, 'boolean');
  }
});

test('sfInit rounds fractional densities', () => {
  const env = setup();
  env.context.sfInit(100, 100, 9.6);
  assert.equal(env.evaluate('stars.length'), 10);
});

test('star size and anchor flags follow the configured probabilities', () => {
  const env = setup([0.01]);       // below both thresholds -> big + anchor
  env.context.sfInit(100, 100, 3);
  let stars = env.evaluate('stars');
  assert.ok(stars.every((s) => s.anchor));
  assert.ok(stars.every((s) => s.r >= 1.5));

  const env2 = setup([0.99]);      // above both thresholds -> small + plain
  env2.context.sfInit(100, 100, 3);
  stars = env2.evaluate('stars');
  assert.ok(stars.every((s) => !s.anchor));
  assert.ok(stars.every((s) => s.r < 1.5));
});

test('sfUpdate drifts stars along their velocity', () => {
  const env = setup();
  env.context.sfInit(800, 600, 1);
  env.evaluate('stars[0].x = 400; stars[0].y = 300; stars[0].vx = 0.01; stars[0].vy = -0.02;');
  const DRIFT = env.evaluate('DRIFT');
  env.context.sfUpdate(mouseAt(), [], 16);
  const s = env.evaluate('stars[0]');
  assert.equal(s.x, 400 + 0.01 * 16 * DRIFT * 3);
  assert.equal(s.y, 300 - 0.02 * 16 * DRIFT * 3);
});

test('sfUpdate wraps stars that leave the canvas', () => {
  const env = setup();
  env.context.sfInit(800, 600, 2);
  env.evaluate('stars[0].x = -5; stars[0].y = 300; stars[0].vx = 0; stars[0].vy = 0;');
  env.evaluate('stars[1].x = 400; stars[1].y = 610; stars[1].vx = 0; stars[1].vy = 0;');
  env.context.sfUpdate(mouseAt(), [], 16);
  assert.equal(env.evaluate('stars[0].x'), 802);
  assert.equal(env.evaluate('stars[1].y'), -2);
});

test('a fast cursor pushes nearby stars away and leaves distant ones alone', () => {
  const env = setup();
  env.context.sfInit(800, 600, 2);
  env.evaluate('stars[0].x = 420; stars[0].y = 400; stars[0].vx = 0; stars[0].vy = 0;');
  env.evaluate('stars[1].x = 700; stars[1].y = 400; stars[1].vx = 0; stars[1].vy = 0;');
  env.context.sfUpdate(mouseAt({ x: 400, y: 400, vel: 20, active: true }), [], 16);
  assert.ok(env.evaluate('stars[0].x') > 420, 'near star is pushed outward');
  assert.equal(env.evaluate('stars[1].x'), 700, 'star beyond PUSH_RADIUS is untouched');
});

test('a slow or inactive cursor does not push', () => {
  const env = setup();
  env.context.sfInit(800, 600, 1);
  env.evaluate('stars[0].x = 420; stars[0].y = 400; stars[0].vx = 0; stars[0].vy = 0;');
  env.context.sfUpdate(mouseAt({ x: 400, y: 400, vel: 1, active: true }), [], 16);
  assert.equal(env.evaluate('stars[0].x'), 420);
  env.context.sfUpdate(mouseAt({ x: 400, y: 400, vel: 30, active: false }), [], 16);
  assert.equal(env.evaluate('stars[0].x'), 420);
});

test('sfUpdate ages pulses and drops expired ones', () => {
  const env = setup();
  env.context.sfInit(800, 600, 1);
  const pulses = [
    { x: 0, y: 0, age: 0, life: 100 },
    { x: 1, y: 1, age: 90, life: 100 },
  ];
  env.context.sfUpdate(mouseAt(), pulses, 20);
  assert.equal(pulses.length, 1);
  assert.equal(pulses[0].age, 20);
});

test('sfResize updates the wrap bounds without discarding stars', () => {
  const env = setup();
  env.context.sfInit(800, 600, 5);
  const before = env.evaluate('stars.map((s) => s.x)');
  env.context.sfResize(400, 300);
  assert.deepEqual(env.evaluate('stars.map((s) => s.x)'), before);

  env.evaluate('stars[0].x = 500; stars[0].vx = 0; stars[0].vy = 0;');
  env.context.sfUpdate(mouseAt(), [], 16);
  assert.equal(env.evaluate('stars[0].x'), -2, 'wraps against the new width');
});

test('sfRender clears the canvas and draws every star', () => {
  const env = setup();
  env.context.sfInit(800, 600, 10);
  env.evaluate('stars.forEach((s) => { s.anchor = false; s.r = 2; });');
  env.context.sfRender(env.ctx2d, 0, mouseAt(), []);
  const clear = env.ctx2d.calls.find((c) => c.name === 'fillRect');
  assert.deepEqual(clear.args, [0, 0, 800, 600]);
  assert.equal(env.ctx2d.countOf('arc'), 10);
  assert.equal(env.ctx2d.globalAlpha, 1);
});

test('sfRender draws the cursor ring only while the cursor is active', () => {
  const env = setup();
  env.context.sfInit(800, 600, 4);
  env.evaluate('stars.forEach((s, i) => { s.x = 400 + i; s.y = 300; s.anchor = false; s.r = 0.5; });');

  env.context.sfRender(env.ctx2d, 0, mouseAt(), []);
  assert.equal(env.ctx2d.countOf('arc'), 0, 'small stars draw as rects, no ring');

  env.ctx2d.calls.length = 0;
  env.context.sfRender(env.ctx2d, 0, mouseAt({ x: 400, y: 300, vel: 10, active: true }), []);
  assert.equal(env.ctx2d.countOf('arc'), 1, 'cursor ring');
  assert.ok(env.ctx2d.countOf('stroke') > 1, 'plus constellation links between the clustered stars');
});

test('anchor stars add an additive glow pass', () => {
  const env = setup();
  env.context.sfInit(800, 600, 3);
  env.evaluate('stars.forEach((s) => { s.anchor = true; s.r = 2; });');
  env.context.sfRender(env.ctx2d, 0, mouseAt(), []);
  // 2 glow arcs per anchor + 1 body arc
  assert.equal(env.ctx2d.countOf('arc'), 9);
});

test('a pulse renders its ring', () => {
  const env = setup();
  env.context.sfInit(800, 600, 2);
  env.evaluate('stars.forEach((s) => { s.x = 400; s.y = 300; s.anchor = false; s.r = 0.5; });');
  env.context.sfRender(env.ctx2d, 0, mouseAt(), [{ x: 400, y: 300, age: 450, life: 900 }]);
  const ring = env.ctx2d.calls.find((c) => c.name === 'arc');
  assert.equal(ring.args[2], 0.5 * env.evaluate('PULSE_MAX_R'), 'radius tracks pulse age');
});

test('a pulse flashes links between neighbouring stars on its wavefront', () => {
  const env = setup();
  env.context.sfInit(800, 600, 2);
  const r = 0.5 * env.evaluate('PULSE_MAX_R');
  // Both stars sit on the ring and within the (tightened) link distance.
  env.evaluate(`stars[0].x = ${400 + r}; stars[0].y = 300; stars[0].anchor = false; stars[0].r = 0.5;`);
  env.evaluate(`stars[1].x = ${400 + r + 10}; stars[1].y = 300; stars[1].anchor = false; stars[1].r = 0.5;`);
  env.context.sfRender(env.ctx2d, 0, mouseAt(), [{ x: 400, y: 300, age: 450, life: 900 }]);
  const flash = env.ctx2d.calls.filter((c) => c.name === 'moveTo');
  assert.equal(flash.length, 1, 'one link flash between the pair');
  assert.deepEqual(flash[0].args, [400 + r, 300]);
});
