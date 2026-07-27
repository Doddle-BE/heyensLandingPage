// Scene runtime — the per-scene plumbing shared by every renderer: failure
// reporting, the frame-capped RAF loop with adaptive degrade, the
// reduced-motion still draw, hint chrome, debounced resize, and hi-DPI canvas
// sizing.
// A scene is { frame(t, mouse, pulses, look), resize(), degrade(), renderStill() }.
// COORDINATE CONTRACT: all logic in CSS pixel space; DPR is render-only.

// Frame cap: 60fps active (120Hz+ buys heat, not beauty), 30fps when the page
// is visible but nobody is interacting with an unfocused window.
const FRAME_MS_ACTIVE = 1000 / 60;
const FRAME_MS_BG = 1000 / 30;
const RECENT_INPUT_MS = 10000;
const SLOW_FRAMES_TO_DEGRADE = 20;
const RESIZE_DEBOUNCE_MS = 150;
const STILL_TICKS = 12;
const HINT_FADE_MS = 2600;
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'wheel', 'keydown'];

// ---- Failure reporting ------------------------------------------------------
// A dead scene must never look like an intentionally empty page: say why in the
// console and paint the scene's own backdrop so the canvas isn't a void.
const FALLBACK_BG = { wasps: '#cfe4f5', starfield: '#05060c' };
function sceneFailed(scene, reason, err) {
  if (err !== undefined) console.error(`main: ${scene} scene unavailable — ${reason}`, err);
  else console.error(`main: ${scene} scene unavailable — ${reason}`);
  // The canvas carries its own background and covers the viewport, so the body
  // colour alone would stay hidden behind it.
  document.body.style.background = FALLBACK_BG[scene];
  const c = document.getElementById('starfield');
  if (c) c.style.background = FALLBACK_BG[scene];
}

// Guards a renderer call. Without this a throw inside frame() repeats on every
// rAF forever; returns false so the caller can stop the loop.
function guard(scene, reason, fn) {
  try {
    fn();
    return true;
  } catch (err) {
    sceneFailed(scene, reason, err);
    return false;
  }
}

// Builds a renderer without letting an init throw take down the page. Returns
// null both for "factory missing" and "factory failed"; callers that have a
// fallback path (the sky's 2D field) decide what null means.
function createScene(factory, label) {
  if (typeof factory !== 'function') {
    console.error(`main: ${label} is not loaded`);
    return null;
  }
  try {
    return factory(document.getElementById('starfield'));
  } catch (err) {
    console.error(`main: ${label} threw during init —`, err);
    return null;
  }
}

// ---- Scene script loading ---------------------------------------------------
// Renderers are plain globals (no build step), so the active scene's scripts are
// appended at runtime and awaited: a visitor never downloads the other scene.
const SCENE_SRC = {
  wasps: ['scripts/wasps.js'],
  starfield: ['scripts/starfield.js', 'scripts/starfield-gl.js'],
};
function loadSceneScripts(name) {
  return Promise.all((SCENE_SRC[name] || []).map((src) => new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = resolve;
    el.onerror = () => reject(new Error(src));
    document.head.appendChild(el);
  })));
}

function onDebouncedResize(handler, delay) {
  let timer = null;
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(handler, delay === undefined ? RESIZE_DEBOUNCE_MS : delay);
  });
}

// Backing store at device resolution, drawing coordinates in CSS pixels.
function sizeCanvasToDisplay(canvas, ctx, maxDpr) {
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr || Infinity);
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h, dpr };
}

// Applies the coarse-pointer wording and returns the one-shot fade scheduler.
function bindSceneHint(coarseText) {
  const hintEl = document.getElementById('hint');
  if (hintEl && coarseText && matchMedia('(pointer: coarse)').matches) {
    hintEl.textContent = coarseText;
  }
  let timer = null;
  return function scheduleHintFade() {
    if (!hintEl || timer) return;
    timer = setTimeout(() => hintEl.classList.add('fade'), HINT_FADE_MS);
  };
}

// prefers-reduced-motion: one settled frame, no loop.
// Present-race workaround: a single draw right after the canvas becomes visible
// can land before its first composite and show black. Re-draw the identical
// frame (scenes keep renderStill deterministic) for a few rAF ticks, then stop.
function runStillScene(scene, name) {
  document.body.classList.add('gl-still');
  let ticks = 0;
  function draw() {
    if (!guard(name, 'still frame failed', () => { scene.resize(); scene.renderStill(); })) return;
    if (++ticks < STILL_TICKS) requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
  onDebouncedResize(() => {
    guard(name, 'still frame failed after resize', () => { scene.resize(); scene.renderStill(); });
  });
}

function runSceneLoop(scene, name) {
  let prevTimestamp = null;
  let lastRender = 0;
  let lastInputMs = performance.now();
  let slowFrameCount = 0;
  let frameEma = 16.7;            // rolling rendered-frame-time estimate
  let canDegrade = true;
  let running = true;
  let lastDpr = window.devicePixelRatio || 1;

  for (const ev of ACTIVITY_EVENTS) {
    window.addEventListener(ev, () => { lastInputMs = performance.now(); }, { passive: true });
  }

  function loop(t) {
    if (!running) return;
    requestAnimationFrame(loop);
    const focused = document.hasFocus() || performance.now() - lastInputMs < RECENT_INPUT_MS;
    const targetMs = focused ? FRAME_MS_ACTIVE : FRAME_MS_BG;
    if (t - lastRender < targetMs - 1) return;
    lastRender = Math.max(lastRender + targetMs, t - targetMs);   // accumulate, clamp catch-up

    // First-frame skip — prevents a dt explosion on startup and after tab return.
    if (prevTimestamp === null) {
      prevTimestamp = t;
      return;
    }
    const dt = t - prevTimestamp;
    prevTimestamp = t;

    // Adaptive slow-frame detection: a fixed ms threshold would ratchet quality
    // down forever on 30Hz/power-saver displays. Degrade only when frames run
    // well past the display's own rolling cadence.
    frameEma += (Math.min(dt, 100) - frameEma) * 0.05;
    const slowThreshold = Math.max(SLOW_FRAME_THRESHOLD_MS, frameEma * 1.7);
    if (canDegrade && !document.hidden) {
      if (dt > slowThreshold) {
        if (++slowFrameCount >= SLOW_FRAMES_TO_DEGRADE) {
          slowFrameCount = 0;
          // A failed degrade must not keep re-firing: treat it as "no more
          // headroom" and stop asking.
          if (!guard(name, 'degrade failed', () => { canDegrade = scene.degrade(); })) canDegrade = false;
        }
      } else if (slowFrameCount > 0) {
        slowFrameCount--;
      }
    }

    // Monitor swap can change DPR without a resize event.
    const dprNow = window.devicePixelRatio || 1;
    if (dprNow !== lastDpr) {
      lastDpr = dprNow;
      running = guard(name, 'resize failed', () => scene.resize());
      if (!running) return;
    }

    mouseDecay();
    running = guard(name, 'renderer threw while drawing a frame', () => scene.frame(t, mouse, pulses, look));
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      prevTimestamp = null;
      lastRender = 0;             // render immediately on return
    }
  });
  onDebouncedResize(() => {
    if (running) running = guard(name, 'resize failed', () => scene.resize());
  });
  requestAnimationFrame(loop);
}
