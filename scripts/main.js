// Main — RAF loop, DPR setup, perf fallback, resize, visibilitychange
// COORDINATE CONTRACT: all game logic in CSS pixel space. DPR applied once via setTransform.

(function () {
  // Two-layer prefers-reduced-motion guard:
  //   CSS hides the canvas visually; JS returns early to prevent CPU burn.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.getElementById('starfield');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    document.body.style.background = '#0a0a0f';
    return;
  }

  let prevTimestamp = null;
  let slowFrameCount = 0;
  let cleanFrameCount = 0;
  let isReduced = false;
  let activeCount = [...STAR_COUNT]; // mutable loop cap — no pool reinit on fallback

  function setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width  = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';
    // setTransform replaces matrix — safe to call repeatedly on resize
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function init() {
    setupCanvas();
    sfInit(window.innerWidth, window.innerHeight);
    inputBind();
  }

  function loop(t) {
    // First-frame skip — prevents dt explosion on startup and after tab return
    if (!prevTimestamp) {
      prevTimestamp = t;
      requestAnimationFrame(loop);
      return;
    }

    const dt = Math.min(t - prevTimestamp, 33); // cap at 33ms (2 frames)
    prevTimestamp = t;

    // Perf fallback tracking
    if (dt > SLOW_FRAME_THRESHOLD_MS) {
      slowFrameCount++;
      cleanFrameCount = 0;
    } else {
      cleanFrameCount++;
      slowFrameCount = 0;
    }

    // Halve star counts after 3 consecutive slow frames
    if (slowFrameCount >= 3) {
      activeCount = activeCount.map(n => Math.floor(n / 2));
      console.warn('Perf fallback: halved star counts to', activeCount);
      slowFrameCount = 0;
      cleanFrameCount = 0;
      isReduced = true;
    }

    // Restore after 60 consecutive clean frames
    if (cleanFrameCount >= 60 && isReduced) {
      activeCount = [...STAR_COUNT];
      isReduced = false;
      cleanFrameCount = 0;
    }

    const mouse = getMouseState();
    sfUpdate(mouse, activeCount, dt);
    sfRender(ctx, activeCount);

    requestAnimationFrame(loop);
  }

  // Reset prevTimestamp on tab return to prevent dt spike
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) prevTimestamp = null;
  });

  // Debounced resize — reinit canvas size + DPR + pool
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      setupCanvas();
      sfInit(window.innerWidth, window.innerHeight);
      activeCount = [...STAR_COUNT];
      isReduced = false;
      slowFrameCount = 0;
      cleanFrameCount = 0;
    }, 100);
  });

  init();
  requestAnimationFrame(loop);
})();
