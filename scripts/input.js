// Input — mouse/touch position + per-event velocity + click pulses.
// All coordinates in CSS pixel space.

const mouse = {
  x: null,
  y: null,
  vel: 0,
  active: false,
};

const pulses = [];

function inputBind(onFirstMove) {
  let firstMoveFired = false;
  const fireFirstMove = () => {
    if (firstMoveFired) return;
    firstMoveFired = true;
    if (onFirstMove) onFirstMove();
  };

  window.addEventListener('mousemove', (e) => {
    if (mouse.x !== null) {
      const dx = e.clientX - mouse.x;
      const dy = e.clientY - mouse.y;
      mouse.vel = Math.min(Math.hypot(dx, dy), CURSOR_VEL_MAX);
    }
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.active = true;
    fireFirstMove();
  });

  // window 'mouseleave' is UA-dependent; mouseout with no relatedTarget is the
  // reliable "pointer left the page" signal.
  window.addEventListener('mouseout', (e) => {
    if (!e.relatedTarget) mouse.active = false;
  });

  window.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (!t) return;
    if (mouse.x !== null) {
      const dx = t.clientX - mouse.x;
      const dy = t.clientY - mouse.y;
      mouse.vel = Math.min(Math.hypot(dx, dy), CURSOR_VEL_MAX);
    }
    mouse.x = t.clientX;
    mouse.y = t.clientY;
    mouse.active = true;
    fireFirstMove();
  }, { passive: true });

  window.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    if (!t) return;
    mouse.x = t.clientX;
    mouse.y = t.clientY;
    mouse.active = true;
    fireFirstMove();
  }, { passive: true });

  window.addEventListener('touchend', (e) => {
    if (e.touches.length === 0) mouse.active = false;
  });

  // Click → pulse ring. Capped to a small ring buffer so long sessions don't grow unbounded.
  window.addEventListener('click', (e) => {
    pulses.push({ x: e.clientX, y: e.clientY, age: 0, life: PULSE_LIFE_MS });
    if (pulses.length > PULSE_MAX_COUNT) pulses.shift();
  });
}

function mouseDecay() {
  mouse.vel *= MOUSE_VEL_DECAY;
}
