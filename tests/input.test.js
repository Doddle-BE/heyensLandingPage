const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/harness');

function setup() {
  const env = loadScripts({ scripts: ['config.js', 'input.js'] });
  const state = env.evaluate('({ mouse, look, pulses })');
  return { ...env, ...state };
}

function bind(env, onFirstMove) {
  env.context.inputBind(onFirstMove);
}

const ptr = (o = {}) => ({
  pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1,
  clientX: 0, clientY: 0, ...o,
});

test('inputBind registers the pointer, wheel and blur listeners', () => {
  const env = setup();
  bind(env);
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerout', 'wheel', 'blur']) {
    assert.ok(env.hasListener(type), `missing listener for ${type}`);
  }
});

test('first pointer move fires onFirstMove exactly once', () => {
  const env = setup();
  let fired = 0;
  bind(env, () => { fired++; });
  env.emit('pointermove', ptr({ clientX: 10, clientY: 10, buttons: 0 }));
  env.emit('pointermove', ptr({ clientX: 20, clientY: 20, buttons: 0 }));
  assert.equal(fired, 1);
});

test('pointermove tracks cursor position and clamps velocity', () => {
  const env = setup();
  bind(env);
  env.emit('pointermove', ptr({ clientX: 100, clientY: 100, buttons: 0 }));
  env.emit('pointermove', ptr({ clientX: 103, clientY: 104, buttons: 0 }));
  assert.equal(env.mouse.x, 103);
  assert.equal(env.mouse.y, 104);
  assert.equal(env.mouse.active, true);
  assert.equal(env.mouse.vel, 5);

  const velMax = env.evaluate('CURSOR_VEL_MAX');
  env.emit('pointermove', ptr({ clientX: 5000, clientY: 5000, buttons: 0 }));
  assert.equal(env.mouse.vel, velMax);
});

test('a drag past the 6px threshold accumulates look deltas and sets grabbing', () => {
  const env = setup();
  bind(env);
  env.emit('pointerdown', ptr({ clientX: 0, clientY: 0 }));
  env.emit('pointermove', ptr({ clientX: 4, clientY: 0 }));
  assert.equal(env.look.dragging, false, 'below threshold stays a click');
  assert.equal(env.look.dx, 0);

  env.emit('pointermove', ptr({ clientX: 20, clientY: 10 }));
  assert.equal(env.look.dragging, true);
  assert.equal(env.classList.has('grabbing'), true);
  assert.equal(env.look.dx, 16);
  assert.equal(env.look.dy, 10);
});

test('a short press without travel emits a pulse; a drag does not', () => {
  const env = setup();
  bind(env);
  env.emit('pointerdown', ptr({ clientX: 50, clientY: 60 }));
  env.setNow(100);
  env.emit('pointerup', ptr({ clientX: 50, clientY: 60 }));
  assert.equal(env.pulses.length, 1);
  assert.deepEqual(
    { x: env.pulses[0].x, y: env.pulses[0].y, age: env.pulses[0].age },
    { x: 50, y: 60, age: 0 },
  );

  env.emit('pointerdown', ptr({ clientX: 0, clientY: 0 }));
  env.emit('pointermove', ptr({ clientX: 40, clientY: 0 }));
  env.emit('pointerup', ptr({ clientX: 40, clientY: 0 }));
  assert.equal(env.pulses.length, 1, 'drag release must not fire a pulse');
  assert.equal(env.classList.has('grabbing'), false);
});

test('a long press (>500ms) is not a click', () => {
  const env = setup();
  bind(env);
  env.setNow(1000);
  env.emit('pointerdown', ptr({ clientX: 5, clientY: 5 }));
  env.setNow(1600);
  env.emit('pointerup', ptr({ clientX: 5, clientY: 5 }));
  assert.equal(env.pulses.length, 0);
});

test('pointercancel ends the press without emitting a pulse', () => {
  const env = setup();
  bind(env);
  env.emit('pointerdown', ptr({ clientX: 5, clientY: 5 }));
  env.emit('pointercancel', ptr({ clientX: 5, clientY: 5 }));
  assert.equal(env.pulses.length, 0);
  assert.equal(env.look.dragging, false);
});

test('the pulse queue is capped at PULSE_MAX_COUNT', () => {
  const env = setup();
  bind(env);
  const max = env.evaluate('PULSE_MAX_COUNT');
  for (let i = 0; i < max + 3; i++) {
    env.emit('pointerdown', ptr({ clientX: i, clientY: 0 }));
    env.emit('pointerup', ptr({ clientX: i, clientY: 0 }));
  }
  assert.equal(env.pulses.length, max);
  assert.equal(env.pulses[env.pulses.length - 1].x, max + 2, 'oldest pulses are dropped');
});

test('non-left mouse buttons never start a press', () => {
  const env = setup();
  bind(env);
  env.emit('pointerdown', ptr({ button: 2, clientX: 3, clientY: 3 }));
  env.emit('pointerup', ptr({ button: 2, clientX: 3, clientY: 3 }));
  assert.equal(env.pulses.length, 0);
});

test('a move with no buttons held recovers from a swallowed pointerup', () => {
  const env = setup();
  bind(env);
  env.emit('pointerdown', ptr({ clientX: 0, clientY: 0 }));
  env.emit('pointermove', ptr({ clientX: 30, clientY: 0 }));
  assert.equal(env.look.dragging, true);
  env.emit('pointermove', ptr({ clientX: 60, clientY: 0, buttons: 0 }));
  assert.equal(env.look.dragging, false);
  assert.equal(env.classList.has('grabbing'), false);
});

test('two touch pointers pinch instead of dragging', () => {
  const env = setup();
  bind(env);
  const touch = (id, x, y, extra = {}) => ptr({
    pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: x, clientY: y, ...extra,
  });
  env.emit('pointerdown', touch(1, 0, 0));
  env.emit('pointerdown', touch(2, 100, 0));
  assert.equal(env.look.dragging, false);

  env.emit('pointermove', touch(2, 200, 0));
  assert.equal(env.look.pinch, 2);
  assert.equal(env.look.dx, 0, 'pinch owns the gesture');

  // Lifting one finger ends the pinch without a delta jump.
  env.emit('pointerup', touch(2, 200, 0));
  env.emit('pointermove', touch(1, 40, 0));
  assert.equal(env.look.dx, 0);
});

test('touch release clears mouse.active so the cursor lens hides', () => {
  const env = setup();
  bind(env);
  const t = (x, y) => ptr({ pointerType: 'touch', clientX: x, clientY: y });
  env.emit('pointerdown', t(10, 10));
  assert.equal(env.mouse.active, true);
  env.emit('pointerup', t(10, 10));
  assert.equal(env.mouse.active, false);
  assert.equal(env.look.pointerType, 'touch');
});

test('pointerout only deactivates when the pointer left the page', () => {
  const env = setup();
  bind(env);
  env.emit('pointermove', ptr({ clientX: 10, clientY: 10, buttons: 0 }));
  env.emit('pointerout', ptr({ relatedTarget: {} }));
  assert.equal(env.mouse.active, true);
  env.emit('pointerout', ptr({ relatedTarget: null }));
  assert.equal(env.mouse.active, false);
});

test('wheel accumulates clamped zoom, scales line deltas and boosts ctrl+wheel', () => {
  const env = setup();
  bind(env);
  const wheel = (o) => { let prevented = false; env.emit('wheel', { deltaY: 0, deltaMode: 0, preventDefault() { prevented = true; }, ...o }); return prevented; };

  assert.equal(wheel({ deltaY: 40 }), true, 'wheel default is prevented');
  assert.equal(env.look.zoom, 40);

  wheel({ deltaY: 5, deltaMode: 1 });          // line mode -> ×16
  assert.equal(env.look.zoom, 120);

  env.look.zoom = 0;
  wheel({ deltaY: -900 });                      // clamped to -180
  assert.equal(env.look.zoom, -180);

  env.look.zoom = 0;
  wheel({ deltaY: 10, ctrlKey: true });         // trackpad pinch -> ×3
  assert.equal(env.look.zoom, 30);
});

test('blur clears any in-flight gesture state', () => {
  const env = setup();
  bind(env);
  env.emit('pointerdown', ptr({ clientX: 0, clientY: 0 }));
  env.emit('pointermove', ptr({ clientX: 40, clientY: 0 }));
  env.emit('blur', {});
  assert.equal(env.look.dragging, false);
  assert.equal(env.mouse.active, false);
  assert.equal(env.classList.has('grabbing'), false);

  // The stuck press is gone: a later release emits nothing.
  env.emit('pointerup', ptr({ clientX: 40, clientY: 0 }));
  assert.equal(env.pulses.length, 0);
});

test('mouseDecay damps cursor velocity by MOUSE_VEL_DECAY', () => {
  const env = setup();
  env.mouse.vel = 10;
  env.context.mouseDecay();
  assert.equal(env.mouse.vel, 10 * env.evaluate('MOUSE_VEL_DECAY'));
});
