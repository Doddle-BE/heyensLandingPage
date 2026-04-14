// Input — mouse tracking with frame-rate-independent velocity EMA
// All coordinates in CSS pixel space.

const TAU_MS = 80; // EMA time constant in ms

let _x = 0;
let _y = 0;
let _prevX = 0;
let _prevY = 0;
let _smoothedVel = 0;
let _clicked = false;
let _clickX = 0;
let _clickY = 0;
let _lastMoveTime = 0;

function _applyMove(clientX, clientY) {
  const now = performance.now();
  const dt = now - _lastMoveTime;
  _lastMoveTime = now;

  _prevX = _x;
  _prevY = _y;
  _x = clientX;
  _y = clientY;

  if (dt > 0 && dt < 200) {
    const dx = _x - _prevX;
    const dy = _y - _prevY;
    const currentVel = Math.sqrt(dx * dx + dy * dy) / dt; // pixels/ms
    const alpha = 1 - Math.exp(-dt / TAU_MS);
    _smoothedVel = _smoothedVel * (1 - alpha) + currentVel * alpha;
  }
}

function inputBind() {
  document.addEventListener('mousemove', (e) => {
    _applyMove(e.clientX, e.clientY);
  });

  document.addEventListener('click', (e) => {
    _clicked = true;
    _clickX = e.clientX;
    _clickY = e.clientY;
  });

  // Touch support — single touch only
  document.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    _lastMoveTime = performance.now();
    _x = t.clientX;
    _y = t.clientY;
    _prevX = _x;
    _prevY = _y;
    _clicked = true;
    _clickX = _x;
    _clickY = _y;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    e.preventDefault();
    _applyMove(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });
}

// Destructive read — resets clicked=false after returning state
function getMouseState() {
  const state = {
    x: _x,
    y: _y,
    vel: _smoothedVel,
    clicked: _clicked,
    clickX: _clickX,
    clickY: _clickY,
  };
  _clicked = false; // consume the click — prevents per-frame re-application
  return state;
}
