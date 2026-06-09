// Input — pointer events unify mouse + touch.
// Hover feeds `mouse` (cursor lens, constellation chart, 2D fallback).
// Dragging accumulates deltas into `look` (drained by the GL camera).
// A press that never travels >6px within 500ms is a click -> supernova pulse.
// All coordinates in CSS pixel space.

const mouse = {
  x: null,
  y: null,
  vel: 0,
  active: false,
};

const pulses = [];

const look = {
  dx: 0,            // accumulated drag deltas, consumed each GL frame
  dy: 0,
  dragging: false,
  pointerType: 'mouse',
};

function inputBind(onFirstMove) {
  let firstMoveFired = false;
  const fireFirstMove = () => {
    if (firstMoveFired) return;
    firstMoveFired = true;
    if (onFirstMove) onFirstMove();
  };

  let down = false;
  let moved = 0;
  let downT = 0;
  let lastX = 0, lastY = 0;

  window.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;   // left button only
    down = true;
    moved = 0;
    downT = performance.now();
    lastX = e.clientX;
    lastY = e.clientY;
    look.pointerType = e.pointerType === 'touch' ? 'touch' : 'mouse';
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.active = true;
    fireFirstMove();
  });

  window.addEventListener('pointermove', (e) => {
    if (!e.isPrimary) return;
    if (mouse.x !== null) {
      const dx = e.clientX - mouse.x;
      const dy = e.clientY - mouse.y;
      mouse.vel = Math.min(Math.hypot(dx, dy), CURSOR_VEL_MAX);
    }
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.active = true;
    fireFirstMove();

    if (down) {
      // Context menu / browser gesture ate the pointerup — recover.
      if (e.pointerType === 'mouse' && e.buttons === 0) {
        down = false;
        look.dragging = false;
        document.body.classList.remove('grabbing');
        return;
      }
      const ddx = e.clientX - lastX;
      const ddy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      moved += Math.hypot(ddx, ddy);
      if (!look.dragging && moved > 6) {
        look.dragging = true;
        document.body.classList.add('grabbing');
      }
      if (look.dragging) {
        look.dx += ddx;
        look.dy += ddy;
      }
    }
  });

  function endPress(e, cancelled) {
    if (!down) return;
    down = false;
    const wasDrag = look.dragging;
    look.dragging = false;
    document.body.classList.remove('grabbing');
    if (cancelled || wasDrag) return;
    if (performance.now() - downT < 500) {
      pulses.push({ x: e.clientX, y: e.clientY, age: 0, life: PULSE_LIFE_MS }); // life: 2D fallback only; GL uses its own
      if (pulses.length > PULSE_MAX_COUNT) pulses.shift();
    }
  }

  window.addEventListener('pointerup', (e) => {
    if (!e.isPrimary) return;
    endPress(e, false);
    if (look.pointerType === 'touch') mouse.active = false;
  });

  window.addEventListener('pointercancel', (e) => {
    if (!e.isPrimary) return;
    endPress(e, true);
    if (look.pointerType === 'touch') mouse.active = false;
  });

  // Pointer left the page entirely.
  window.addEventListener('pointerout', (e) => {
    if (!e.relatedTarget && e.pointerType !== 'touch') mouse.active = false;
  });

  // Lost focus mid-drag (alt-tab etc.) — never leave a stuck drag.
  window.addEventListener('blur', () => {
    down = false;
    look.dragging = false;
    mouse.active = false;
    document.body.classList.remove('grabbing');
  });
}

function mouseDecay() {
  mouse.vel *= MOUSE_VEL_DECAY;
}
