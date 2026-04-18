// Main — RAF loop, DPR setup, perf fallback, resize, visibilitychange.
// COORDINATE CONTRACT: all render/logic in CSS pixel space. DPR applied once via setTransform.

(function () {
  // Two-layer prefers-reduced-motion guard:
  //   CSS hides the canvas + shows the static overlay; JS returns early to avoid CPU burn.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.getElementById('starfield');
  // alpha:false lets the browser skip compositing the backdrop — measurable perf win.
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) {
    document.body.style.background = '#0a0a0f';
    return;
  }

  const hintEl = document.getElementById('hint');
  let hintFadeTimer = null;
  function scheduleHintFade() {
    if (!hintEl || hintFadeTimer) return;
    hintFadeTimer = setTimeout(() => hintEl.classList.add('fade'), 1400);
  }

  let prevTimestamp = null;
  let slowFrameCount = 0;
  let cleanFrameCount = 0;
  let isReduced = false;
  let currentDensity = DENSITY;

  function setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    canvas.width  = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }

  function init() {
    const { w, h } = setupCanvas();
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
      sfInit(canvas.clientWidth, canvas.clientHeight, currentDensity);
      isReduced = true;
      slowFrameCount = 0;
      cleanFrameCount = 0;
    } else if (cleanFrameCount >= 60 && isReduced) {
      currentDensity = DENSITY;
      sfInit(canvas.clientWidth, canvas.clientHeight, currentDensity);
      isReduced = false;
      cleanFrameCount = 0;
    }

    mouseDecay();
    sfUpdate(mouse, pulses, dt);
    sfRender(ctx, t, mouse, pulses);

    requestAnimationFrame(loop);
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) prevTimestamp = null;
  });

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const { w, h } = setupCanvas();
      // Reseed so density stays well-distributed across the new bounds.
      sfInit(w, h, currentDensity);
      slowFrameCount = 0;
      cleanFrameCount = 0;
    }, 120);
  });

  init();
  requestAnimationFrame(loop);
})();
