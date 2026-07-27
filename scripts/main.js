// Main — scene dispatch on ?scene= (wasps default; starfield preserved); the
// loop, perf fallback, resize and still-frame plumbing live in scene.js.
// COORDINATE CONTRACT: all logic in CSS pixel space; DPR is render-only.

(function () {
  // ---- Scene dispatch (Option model) -------------------------------------
  // ?scene= selects the scene; wasps is the default. The static <head> carries
  // the wasp identity; the starfield branch swaps the chrome back to the sky's.
  const activeScene = new URLSearchParams(location.search).get('scene') === 'starfield' ? 'starfield' : 'wasps';

  if (activeScene === 'wasps') {
    const waspCanvas = document.getElementById('starfield');
    const scheduleWaspHintFade = bindSceneHint('swipe to part them · tap to scatter');
    const wasp = (typeof waspCreate === 'function') ? waspCreate(waspCanvas) : null;
    if (!wasp) return;                       // no 2D context: CSS overlay remains

    // Reduced motion: one settled still frame (no loop), mirroring the sky.
    // CSS overlay remains the no-JS fallback.
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      runStillScene(wasp);
      return;
    }

    inputBind(scheduleWaspHintFade);
    runSceneLoop(wasp);
    return;
  }

  // ---- Starfield: swap chrome back to the star identity, then fall through
  // to the existing (unchanged) sky renderer below. -----------------------
  document.title = '\u2726';
  { const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', '#05060c'); }
  { const f = document.querySelector('link[rel="icon"]'); if (f) f.setAttribute('href', "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><circle cx='16' cy='16' r='6' fill='%23FFDCA0'/></svg>"); }
  { const h = document.getElementById('hint'); if (h) h.textContent = 'drag to look around \u00b7 click to make a wish'; }
  const canvas = document.getElementById('starfield');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ------------------------------------------------------------ WebGL path
  const sky = (typeof sfglCreate === 'function') ? sfglCreate(canvas) : null;

  // Reduced motion: render ONE settled GL frame (no loop, no choreography)
  // instead of the CSS box-shadow stars. CSS overlay remains the no-GL fallback.
  if (reducedMotion) {
    if (sky && sky.renderStill) runStillScene(sky);
    return;
  }

  const scheduleHintFade = bindSceneHint('swipe to look around · tap to make a wish');

  if (sky) {
    inputBind(scheduleHintFade);
    runSceneLoop(sky);
    return;
  }

  // ----------------------------------------------------- Legacy 2D fallback
  // Re-query: a failed GL init swaps the claimed canvas for a fresh clone.
  const canvas2d = document.getElementById('starfield');
  const ctx = canvas2d.getContext('2d', { alpha: false });
  if (!ctx) {
    document.body.style.background = '#05060c';
    return;
  }

  let prevTimestamp = null;
  let slowFrameCount = 0;
  let cleanFrameCount = 0;
  let isReduced = false;
  let currentDensity = DENSITY;

  function init() {
    const { w, h } = sizeCanvasToDisplay(canvas2d, ctx);
    sfInit(w, h, currentDensity);
    inputBind(scheduleHintFade);
  }

  function loop(t) {
    // First-frame skip — prevents dt explosion on startup and after tab return
    if (!prevTimestamp) {
      prevTimestamp = t;
      requestAnimationFrame(loop);
      return;
    }

    const dt = Math.min(t - prevTimestamp, 33);
    prevTimestamp = t;

    if (dt > SLOW_FRAME_THRESHOLD_MS) {
      slowFrameCount++;
      cleanFrameCount = 0;
    } else {
      cleanFrameCount++;
      slowFrameCount = 0;
    }

    // Halve density after 3 slow frames, restore after 60 clean frames
    if (slowFrameCount >= 3 && !isReduced) {
      currentDensity = FALLBACK_DENSITY;
      sfInit(canvas2d.clientWidth, canvas2d.clientHeight, currentDensity);
      isReduced = true;
      slowFrameCount = 0;
      cleanFrameCount = 0;
    } else if (cleanFrameCount >= 60 && isReduced) {
      currentDensity = DENSITY;
      sfInit(canvas2d.clientWidth, canvas2d.clientHeight, currentDensity);
      isReduced = false;
      cleanFrameCount = 0;
    }

    mouseDecay();
    look.dx = 0; look.dy = 0; look.zoom = 0; look.pinch = 1;   // free-look has no 2D meaning
    sfUpdate(mouse, pulses, dt);
    sfRender(ctx, t, mouse, pulses);

    requestAnimationFrame(loop);
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) prevTimestamp = null;
  });

  onDebouncedResize(() => {
    const { w, h } = sizeCanvasToDisplay(canvas2d, ctx);
    sfResize(w, h);
  }, 100);

  init();
  requestAnimationFrame(loop);
})();
