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
  zoom: 0,          // accumulated wheel px (+away/-toward), consumed each GL frame
  pinch: 1,         // accumulated pinch scale factor, consumed each GL frame
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

  // Two-finger pinch (touch): track every touch pointer, not just the primary.
  const touches = new Map();      // pointerId -> {x, y}
  let pinching = false;
  let pinchDist = 0;
  function touchDist() {
    const [a, b] = [...touches.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) {
        // Second finger: drag becomes pinch; suppress click + look deltas.
        pinching = true;
        pinchDist = touchDist();
        down = false;
        look.dragging = false;
        document.body.classList.remove('grabbing');
      }
    }
    if (!e.isPrimary) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;   // left button only
    if (pinching) return;
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
    if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinching && touches.size >= 2) {
        const d = touchDist();
        if (pinchDist > 0 && d > 0) look.pinch *= d / pinchDist;
        pinchDist = d;
        return;                   // pinch owns the gesture
      }
    }
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

  function touchLift(e) {
    if (e.pointerType !== 'touch') return;
    touches.delete(e.pointerId);
    if (pinching && touches.size < 2) {
      pinching = false;
      pinchDist = 0;
      // Remaining finger must re-touch to drag; prevents a delta jump.
    }
  }

  window.addEventListener('pointerup', (e) => {
    touchLift(e);
    if (!e.isPrimary) return;
    endPress(e, false);
    if (look.pointerType === 'touch') mouse.active = false;
  });

  window.addEventListener('pointercancel', (e) => {
    touchLift(e);
    if (!e.isPrimary) return;
    endPress(e, true);
    if (look.pointerType === 'touch') mouse.active = false;
  });

  // Pointer left the page entirely.
  window.addEventListener('pointerout', (e) => {
    if (!e.relatedTarget && e.pointerType !== 'touch') mouse.active = false;
  });

  // Telescope zoom: wheel (incl. trackpad pinch, which arrives as ctrl+wheel).
  window.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    look.zoom += Math.max(-180, Math.min(180, dy)) * (e.ctrlKey ? 3 : 1);
  }, { passive: false });

  // Lost focus mid-drag (alt-tab etc.) — never leave a stuck drag.
  window.addEventListener('blur', () => {
    down = false;
    look.dragging = false;
    mouse.active = false;
    pinching = false;
    touches.clear();
    document.body.classList.remove('grabbing');
  });
}

function mouseDecay() {
  mouse.vel *= MOUSE_VEL_DECAY;
}
