const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/harness');

const env = loadScripts({ scripts: ['config.js'] });
const val = (name) => env.evaluate(name);

test('normalised tunables stay in 0..1', () => {
  for (const name of ['DRIFT', 'TWINKLE', 'NODE_GLOW', 'ANCHOR_PROB', 'BIG_STAR_PROB', 'MOUSE_VEL_DECAY']) {
    const v = val(name);
    assert.equal(typeof v, 'number', name);
    assert.ok(v >= 0 && v <= 1, `${name} out of range: ${v}`);
  }
});

test('distance and count tunables are positive', () => {
  for (const name of ['DENSITY', 'CURSOR_REACH', 'LINK_DIST', 'PUSH_RADIUS', 'CURSOR_VEL_MAX',
    'PULSE_MAX_R', 'PULSE_LIFE_MS', 'PULSE_RING_WIDTH', 'PULSE_MAX_COUNT',
    'SLOW_FRAME_THRESHOLD_MS', 'FALLBACK_DENSITY']) {
    assert.ok(val(name) > 0, `${name} must be positive`);
  }
});

test('the perf fallback density is lower than the default density', () => {
  assert.ok(val('FALLBACK_DENSITY') < val('DENSITY'));
});

test('links only form well inside the cursor reach', () => {
  assert.ok(val('LINK_DIST') < val('CURSOR_REACH'));
});
