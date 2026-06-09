// Main — picks the renderer (WebGL2 photoreal sky, else legacy 2D field),
// owns the RAF loop, perf fallback, resize, visibilitychange.
// COORDINATE CONTRACT: all logic in CSS pixel space; DPR is render-only.

(function () {
  // Two-layer prefers-reduced-motion guard:
  //   CSS hides the canvas + shows the static overlay; JS returns early to avoid CPU burn.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.getElementById('starfield');

  const hintEl = document.getElementById('hint');
  if (hintEl && matchMedia('(pointer: coarse)').matches) {
    hintEl.textContent = 'drift · tap to make a wish';
  }
  let hintFadeTimer = null;
  function scheduleHintFade() {
    if (!hintEl || hintFadeTimer) return;
    hintFadeTimer = setTimeout(() => hintEl.classList.add('fade'), 2600);
  }

  // ------------------------------------------------------------ WebGL path
  const sky = (typeof sfglCreate === 'function') ? sfglCreate(canvas) : null;
  if (sky) {
    inputBind(scheduleHintFade);

    let prevTimestamp = null;
    let slowFrameCount = 0;
    let frameEma = 16.7;            // rolling frame-time estimate
    let canDegrade = true;

    function glLoop(t) {
      if (!prevTimestamp) {
        prevTimestamp = t;
        requestAnimationFrame(glLoop);
        return;
      }
      const dt = t - prevTimestamp;
      prevTimestamp = t;

      // Adaptive slow-frame detection: a fixed ms threshold would ratchet
      // quality down forever on 30Hz/power-saver displays. Degrade only when
      // frames run well past the display's own rolling cadence.
      frameEma += (Math.min(dt, 100) - frameEma) * 0.05;
      const slowThreshold = Math.max(SLOW_FRAME_THRESHOLD_MS, frameEma * 1.7);
      if (canDegrade && !document.hidden) {
        if (dt > slowThreshold) {
          if (++slowFrameCount >= 20) {
            canDegrade = sky.degrade();
            slowFrameCount = 0;
          }
        } else if (slowFrameCount > 0) {
          slowFrameCount--;
        }
      }

      mouseDecay();
      sky.frame(t, mouse, pulses);
      requestAnimationFrame(glLoop);
    }

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) prevTimestamp = null;
    });

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => sky.resize(), 150);
    });

    requestAnimationFrame(glLoop);
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

  function setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas2d.clientWidth || window.innerWidth;
    const h = canvas2d.clientHeight || window.innerHeight;
    canvas2d.width  = Math.round(w * dpr);
    canvas2d.height = Math.round(h * dpr);
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
      sfResize(w, h);
    }, 100);
  });

  init();
  requestAnimationFrame(loop);
})();
