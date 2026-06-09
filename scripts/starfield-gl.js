// Starfield GL — photoreal night-sky renderer (WebGL2).
//
// The whole sky lives on a rotating "celestial disc" centered on an on-screen
// pole (like a long-exposure polar shot). Layers, back to front:
//   1. Baked sky texture (FBO, once per resize): deep-space gradient, domain-
//      warped Milky Way with dust lanes + core bulge, two faint nebulae,
//      unresolved star speckle, dither.
//   2. ~8k stars, one gl.POINTS draw: blackbody colors, power-law magnitudes,
//      per-star scintillation, gaussian PSF + halo, diffraction spikes on the
//      brightest few. Brightened by cursor proximity and supernova shells.
//   3. Constellation overlay near the cursor (thin additive lines).
//   4. Meteors (trail quads), one slow satellite, supernova rings on click.
//   5. Vignette (alpha-over) + film grain (additive).
//
// Coordinates: CSS pixels, y-down. Star positions are stored pole-relative;
// rotation is applied in the vertex shader from a CPU-computed (cosθ, sinθ)
// so float precision never degrades. Exposes a single global:
//   sfglCreate(canvas) -> { frame(tMs, mouse, pulses), resize(), degrade() } | null

function sfglCreate(canvas) {
  'use strict';

  const CFG = {
    DPR_MAX: 2,
    STAR_DENSITY: 1 / 110,        // stars per CSS px² (real points carry the faint field)
    STAR_MIN: 3000,
    STAR_MAX: 46000,              // whole disc; only ~1/4 is on screen at once
    BAND_FRACTION: 0.36,          // share of stars clustered along the galactic band
    HERO_COUNT: 26,               // brilliant named-star tier (spikes), disc-wide
    ROT_RATE: 0.0016,             // rad/s sky rotation (~5.5°/min)
    POLE: [0.78, 0.16],           // pole position, fraction of viewport
    BAND_ANGLE: -0.56,            // rad, galactic band tilt (y-down space)
    PARALLAX_NEAR: 22,            // px shift of nearest stars at screen edge
    PARALLAX_BG: 5,               // px shift of baked sky
    ZOOM_SETTLE_S: 4.0,           // opening lens settle 1.05 -> 1.0
    EXPOSURE_S: 1.9,              // opening fade-in
    METEOR_MIN_GAP: 6000,         // ms between spontaneous meteors
    METEOR_RAND_GAP: 12000,
    FIRST_METEOR_AT: 2600,        // ms — choreographed opening streak
    SAT_MIN_GAP: 55000,
    SAT_RAND_GAP: 60000,
    PULSE_LIFE: 1500,             // ms — GL supernova life (input.js life ignored)
    PULSE_MAX_R: 460,
    MAX_PULSES: 6,
    LINE_REACH: 320,              // constellation overlay radius around cursor
    LINE_MAX_DIST: 200,
    LINE_NODES: 14,
    BAKE_SIZE: 2048,
  };

  // ---------------------------------------------------------------- GL setup
  const gl = canvas.getContext('webgl2', {
    alpha: false, antialias: false, depth: false, stencil: false,
    powerPreference: 'high-performance',
  });
  if (!gl) return null;

  // ------------------------------------------------------------- GLSL source
  const VS_FULL = `#version 300 es
layout(location=0) in vec2 aClip;
out vec2 vUv;
void main(){ vUv = aClip*0.5+0.5; gl_Position = vec4(aClip,0.,1.); }`;

  const NOISE = `
float hash12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*0.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),u.x), mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),u.x), u.y); }
float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ s+=a*vnoise(p); p=p*2.03+vec2(13.1,7.7); a*=0.5; } return s; }`;

  // Bakes the deep sky into a texture. uv spans the celestial disc:
  // world = (uv-0.5)*2*Rmax, pole-relative, y-down CSS orientation.
  const FS_BAKE = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform float uRmax;
uniform vec2 uBandC;     // point on band axis (pole-relative)
uniform vec2 uBandDir;   // unit axis direction
uniform float uBandSigma;
uniform float uCoreAlong;
uniform vec4 uNebA;      // xy, radius, amp  (H-alpha red)
uniform vec4 uNebB;      // xy, radius, amp  (teal reflection)
${NOISE}
// Round unresolved-star dots: jittered gaussian per cell, sized >= 2 bake
// texels so bilinear sampling keeps them circular (never square confetti).
float starDots(vec2 w, float cell, float sigma, float thresh){
  vec2 g = floor(w/cell);
  float h = hash12(g);
  vec2 jit = vec2(hash12(g+11.3), hash12(g+27.7));
  vec2 cpos = (g + 0.25 + 0.5*jit)*cell;
  float d = length(w - cpos);
  return exp(-d*d/(2.0*sigma*sigma)) * pow(h, thresh);
}
void main(){
  vec2 w = (vUv-0.5)*(2.0*uRmax);
  float rN = length(w)/uRmax;

  // Base space: near-black blue, darker toward the rim, mottled at huge scale.
  vec3 col = mix(vec3(0.018,0.026,0.048), vec3(0.005,0.007,0.014), smoothstep(0.0,1.05,rN));
  col *= 0.90 + 0.20*fbm(w*0.0016+7.3);

  // Galactic band geometry.
  vec2 rel = w - uBandC;
  float along  = dot(rel, uBandDir);
  float across = dot(rel, vec2(-uBandDir.y, uBandDir.x));
  float widthMod = 0.72 + 0.55*fbm(vec2(along*0.0011, 3.7));
  float sigma = uBandSigma*widthMod;
  float prof = exp(-0.5*pow(across/sigma, 2.0));

  // Cloud structure: domain-warped fbm.
  vec2 q = vec2(fbm(w*0.004), fbm(w*0.004+vec2(5.2,1.3)));
  float clouds = 0.34 + 1.05*fbm(w*0.006 + 3.0*q);
  float band = prof*clouds;
  float glow = exp(-0.5*pow(across/(sigma*2.7), 2.0));   // wide luminous halo

  // Core bulge — warm, wider.
  float coreD = length(rel - uBandDir*uCoreAlong);
  float core = exp(-0.5*pow(coreD/(uBandSigma*1.45), 2.0));

  // Dust lanes: ridged noise hugging the axis, absorbs band light.
  float ridge = 1.0 - abs(2.0*fbm(w*0.0045 + 2.0*q + 11.0) - 1.0);
  float ridge2 = 1.0 - abs(2.0*fbm(w*0.0021 + q + 5.0) - 1.0);
  float trunks = smoothstep(0.30, 0.78, fbm(w*0.0012 + 19.0));
  float dust = clamp(pow(ridge, 3.2)*0.55 + pow(ridge2, 2.7)*0.85*trunks, 0.0, 1.0)
             * smoothstep(sigma*1.7, sigma*0.25, abs(across));
  band *= 1.0 - 0.80*dust;
  core *= 1.0 - 0.45*dust;

  vec3 bandCool = vec3(0.42,0.54,0.78);
  vec3 bandWarm = vec3(1.0,0.80,0.50);
  col += glow*0.080*mix(bandCool, bandWarm, clamp(core*0.6,0.,1.));
  col += band*0.30*mix(bandCool, bandWarm, clamp(core*1.1,0.,1.));
  col += core*0.32*vec3(1.0,0.82,0.52);
  col *= 1.0 - 0.28*dust*prof;            // absorption also dims base sky

  // Faint nebulae, fbm-modulated.
  col += uNebA.w*vec3(0.55,0.10,0.12)*exp(-0.5*pow(length(w-uNebA.xy)/uNebA.z,2.0))*(0.45+0.9*fbm(w*0.010+4.2));
  col += uNebB.w*vec3(0.07,0.24,0.26)*exp(-0.5*pow(length(w-uNebB.xy)/uNebB.z,2.0))*(0.45+0.9*fbm(w*0.012+9.1));

  // Powdered starlight: dense micro-dots that thicken inside the band and
  // warm up near the core — the granular texture of unresolved millions.
  float sp = starDots(w, 3.4, 1.05, 26.0)*1.0 + starDots(w, 6.0, 1.5, 13.0)*0.55;
  col += sp*(0.05 + 1.30*prof)*mix(vec3(0.80,0.85,1.0), vec3(1.0,0.88,0.70), clamp(core*1.2,0.,1.))*0.45;

  // Dither kills gradient banding in the deep blacks.
  col += (hash12(w+0.5)-0.5)*(1.6/255.0);
  o = vec4(max(col, 0.0), 1.0);
}`;

  // Draws the baked sky: inverse-rotate the sampling coordinate around the pole.
  const FS_BG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex;
uniform vec2 uRes, uPole, uRot, uShift;
uniform float uRmax, uZoom, uExposure;
void main(){
  vec2 screen = vec2(vUv.x, 1.0-vUv.y)*uRes;       // y-down CSS px
  vec2 c = uRes*0.5;
  screen = c + (screen-c)/uZoom;
  screen -= uShift;
  vec2 rel = screen - uPole;
  rel = vec2(rel.x*uRot.x + rel.y*uRot.y, -rel.x*uRot.y + rel.y*uRot.x);  // R(-θ)
  vec2 uv = rel/(2.0*uRmax)+0.5;
  o = vec4(texture(uTex, uv).rgb*uExposure, 1.0);
}`;

  const VS_STARS = `#version 300 es
layout(location=0) in vec2 aPos;        // pole-relative, unrotated
layout(location=1) in float aDepth;     // 0 far .. 1 near
layout(location=2) in vec3 aColor;
layout(location=3) in float aIntensity;
layout(location=4) in vec3 aTwk;        // omega, phase, amp
uniform vec2 uRes, uPole, uRot, uPar, uMouse;
uniform float uDpr, uTime, uZoom, uMouseStr, uRotMix, uMaxPt;
uniform vec4 uPulse[6];
uniform int uPulseCount;
out vec3 vColor; out float vI; out float vSize; out float vSpike;
void main(){
  vec2 rotated = vec2(aPos.x*uRot.x - aPos.y*uRot.y, aPos.x*uRot.y + aPos.y*uRot.x);
  vec2 p = uPole + mix(aPos, rotated, uRotMix);
  p += uPar*mix(0.25, 1.0, aDepth);
  vec2 c = uRes*0.5;
  p = c + (p-c)*uZoom;

  // Scintillation: two incommensurate sines + slow seeing envelope.
  float env = 0.7 + 0.3*sin(uTime*0.13 + aTwk.y*0.7);
  float tw = 1.0 + aTwk.z*env*(0.6*sin(uTime*aTwk.x + aTwk.y) + 0.4*sin(uTime*aTwk.x*2.33 + aTwk.y*1.91));
  float I = aIntensity*tw;

  // Cursor lens — nearby stars swell gently.
  float md = distance(p, uMouse);
  I *= 1.0 + uMouseStr*0.7*exp(-md*md/(240.0*240.0));

  // Supernova shells brighten stars as the wavefront passes.
  for(int i=0;i<6;i++){
    if(i>=uPulseCount) break;
    vec4 q = uPulse[i];
    float d = distance(p, q.xy);
    I *= 1.0 + q.w*exp(-pow((d-q.z)/46.0, 2.0));
  }

  vI = I;
  vColor = aColor;
  vSpike = step(0.85, aIntensity);
  float size = (1.7 + 7.5*sqrt(aIntensity))*uDpr*(1.0 + 0.10*(tw-1.0));
  if (aIntensity > 0.85) size = max(size, (17.0 + 11.0*aIntensity)*uDpr);
  size = min(size, uMaxPt);
  vSize = size;
  gl_PointSize = size;
  vec2 clip = (p/uRes)*2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

  const FS_STARS = `#version 300 es
precision highp float;
in vec3 vColor; in float vI; in float vSize; in float vSpike;
uniform float uDpr, uExposure;
out vec4 o;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float rp = length(d)*vSize;                 // radius in device px
  float sig = (0.55 + 0.50*sqrt(min(vI,2.2)))*uDpr;
  float core = exp(-rp*rp/(2.0*sig*sig));
  float halo = exp(-rp/(vSize*0.22))*0.13;
  float spike = 0.0;
  if (vSpike > 0.5) {
    float th = 0.80*uDpr;
    float sx = exp(-pow(d.y*vSize/th, 2.0))*pow(max(0.0, 1.0-abs(d.x)*2.0), 2.4);
    float sy = exp(-pow(d.x*vSize/th, 2.0))*pow(max(0.0, 1.0-abs(d.y)*2.0), 2.4);
    spike = (sx+sy)*0.16;
  }
  vec3 col = core*mix(vColor, vec3(1.0), 0.58)
           + halo*vColor
           + spike*mix(vColor, vec3(1.0), 0.5);
  o = vec4(col*vI*uExposure, 1.0);
}`;

  const VS_LINES = `#version 300 es
layout(location=0) in vec2 aPos;       // final screen px
layout(location=1) in float aAlpha;
uniform vec2 uRes;
out float vA;
void main(){
  vA = aAlpha;
  vec2 clip = (aPos/uRes)*2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

  const FS_LINES = `#version 300 es
precision highp float;
in float vA; out vec4 o;
uniform vec3 uColor; uniform float uExposure;
void main(){ o = vec4(uColor*vA*uExposure, 1.0); }`;

  const VS_STREAK = `#version 300 es
layout(location=0) in vec2 aPos;       // final screen px
layout(location=1) in vec2 aUv;        // x: 0 head -> 1 tail, y: -1..1 across
layout(location=2) in vec2 aMeta;      // alpha, colorMix (0 cool / 1 warm)
uniform vec2 uRes;
out vec2 vUv; out vec2 vMeta;
void main(){
  vUv = aUv; vMeta = aMeta;
  vec2 clip = (aPos/uRes)*2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

  const FS_STREAK = `#version 300 es
precision highp float;
in vec2 vUv; in vec2 vMeta; out vec4 o;
uniform float uExposure, uTime;
float hash12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*0.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
void main(){
  float across = exp(-vUv.y*vUv.y*3.2);
  float along = pow(max(0.0, 1.0-vUv.x), 1.8)*0.5;
  float head = exp(-vUv.x*24.0)*1.9;
  float sputter = 0.92 + 0.16*hash12(vec2(vUv.x*23.0, floor(uTime*60.0)));
  float a = (along + head)*across*vMeta.x*sputter;
  vec3 cool = vec3(0.72,0.88,1.0), warm = vec3(1.0,0.82,0.58);
  vec3 col = mix(vec3(1.0), mix(cool, warm, vMeta.y), clamp(vUv.x*1.5, 0.0, 1.0));
  o = vec4(col*a*uExposure, 1.0);
}`;

  const VS_RING = `#version 300 es
layout(location=0) in vec2 aUnit;      // [-1,1] quad
uniform vec2 uRes, uCenter;
uniform float uHalf;
out vec2 vLocal;
void main(){
  vLocal = aUnit*uHalf;
  vec2 p = uCenter + vLocal;
  vec2 clip = (p/uRes)*2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

  const FS_RING = `#version 300 es
precision highp float;
in vec2 vLocal; out vec4 o;
uniform float uR, uW, uK, uExposure;
void main(){
  float d = length(vLocal);
  float ring = exp(-0.5*pow((d-uR)/uW, 2.0));
  float frontT = smoothstep(uR, uR+uW*1.6, d);
  vec3 col = mix(vec3(0.88,0.93,1.0), vec3(0.50,0.72,1.0), frontT);
  float fade = (1.0-uK)*(1.0-uK);
  float flash = exp(-d*d/(2.0*pow(26.0+uR*0.16, 2.0)))*pow(1.0-uK, 6.0)*1.3;
  float a = ring*fade*0.12 + flash;
  o = vec4(col*a*uExposure, 1.0);
}`;

  const FS_VIGNETTE = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform float uAspect;
void main(){
  vec2 p = (vUv-0.5)*vec2(uAspect,1.0);
  float d = length(p)/0.72;
  float vig = smoothstep(0.62, 1.18, d)*0.40;
  vig += smoothstep(0.10, 0.0, vUv.y)*0.10;     // settle the very bottom
  o = vec4(0.0, 0.0, 0.0, vig);
}`;

  const FS_GRAIN = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform vec2 uRes;
uniform float uTime;
float hash12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*0.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
void main(){
  float n = hash12(vUv*uRes + fract(uTime*0.731)*913.7);
  float g = max(0.0, n-0.55)*0.030;             // sparse positive sensor noise
  o = vec4(vec3(g), 1.0);
}`;

  // ----------------------------------------------------------- GL utilities
  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error('shader: ' + log);
    }
    return s;
  }
  function program(vsSrc, fsSrc) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('link: ' + gl.getProgramInfoLog(p));
    }
    return p;
  }
  function uniforms(p, names) {
    const u = {};
    for (const n of names) u[n] = gl.getUniformLocation(p, n);
    return u;
  }

  // ------------------------------------------------------------- Star colors
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  // Session-stable PRNG: resize re-seeds with the same sequence, so the sky
  // doesn't reshuffle on every window drag / mobile URL-bar collapse.
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const SESSION_SEED = (Math.random() * 0x7fffffff) | 0;
  let srand = Math.random;        // rebound to the seeded stream in buildStars
  function kelvinRGB(kelvin) {
    const k = kelvin / 100;
    let r, g, b;
    r = k <= 66 ? 255 : 329.698727446 * Math.pow(k - 60, -0.1332047592);
    g = k <= 66 ? 99.4708025861 * Math.log(k) - 161.1195681661
                : 288.1221695283 * Math.pow(k - 60, -0.0755148492);
    b = k >= 66 ? 255 : (k <= 19 ? 0 : 138.5177312231 * Math.log(k - 10) - 305.0447927307);
    return [clamp01(r / 255), clamp01(g / 255), clamp01(b / 255)];
  }
  function pickTemperature(bright) {
    const r = srand();
    if (bright) {
      if (r < 0.35) return 9500 + srand() * 9000;   // blue-white giants
      if (r < 0.60) return 6800 + srand() * 2200;
      if (r < 0.82) return 5000 + srand() * 1500;
      return 3100 + srand() * 1200;                  // orange/red giants
    }
    if (r < 0.10) return 8500 + srand() * 6000;
    if (r < 0.55) return 5400 + srand() * 2800;
    if (r < 0.82) return 4300 + srand() * 1100;
    if (r < 0.95) return 3400 + srand() * 900;
    return 2700 + srand() * 700;
  }
  function pickIntensity() {
    const u = srand();
    if (u < 0.62) return 0.018 + 0.050 * Math.pow(srand(), 1.5);
    if (u < 0.90) return 0.070 + 0.100 * srand();
    if (u < 0.985) return 0.180 + 0.220 * srand();
    return 0.450 + 0.480 * srand();
  }

  // --------------------------------------------------------------- Programs
  let progBake, progBg, progStars, progLines, progStreak, progRing, progVig, progGrain;
  let uBake, uBg, uStars, uLines, uStreak, uRing, uVig, uGrain;
  let vaoFull, vaoStars, vaoSat, vaoLines, vaoStreak, vaoRing;
  let bufFull, bufStars, bufSat, bufLines, bufStreak, bufRing;
  let skyTex = null, skyFbo = null;
  let maxPointSize = 64;

  // ------------------------------------------------------------------ State
  let W = 0, H = 0, DPR = 1;
  let pole = [0, 0], Rmax = 1;
  let starCount = 0, starDrawCount = 0;
  const STAR_STRIDE = 10;                        // floats per star
  let brightSet = [];                            // {x,y,depth} for constellation overlay
  let startMs = -1;
  let lastMs = -1;
  let theta = 0;
  let parX = 0, parY = 0;                        // smoothed parallax
  let mouseStr = 0;
  let quality = 0;                               // 0 full, 1 dpr=1, 2 trimmed, 3 minimal
  let grainOn = true;
  let contextLost = false;

  // Meteors / satellite / pulses
  const meteors = [];                            // {x,y,dx,dy,speed,len,bright,mix,born,dies,dead}
  let nextMeteorAt = CFG.FIRST_METEOR_AT;
  let satellite = null;                          // {x,y,dx,dy,speed,until}
  let nextSatAt = 15000 + Math.random() * CFG.SAT_RAND_GAP;
  const seenPulses = new WeakSet();
  const wishQueue = [];                          // spawn times for click meteors
  let pulsesRef = null;                          // last-seen shared pulses array

  // Scratch buffers (no per-frame allocation)
  const MAX_STREAK_QUADS = 8;
  const streakVerts = new Float32Array(MAX_STREAK_QUADS * 6 * 6); // 6 verts × (pos2 uv2 meta2)
  const MAX_LINES = 64;
  const lineVerts = new Float32Array(MAX_LINES * 2 * 3);          // 2 verts × (pos2 alpha)
  const satVerts = new Float32Array(2 * STAR_STRIDE);
  const pulseUni = new Float32Array(CFG.MAX_PULSES * 4);

  // ------------------------------------------------------------- Build steps
  function buildPrograms() {
    progBake = program(VS_FULL, FS_BAKE);
    uBake = uniforms(progBake, ['uRmax', 'uBandC', 'uBandDir', 'uBandSigma', 'uCoreAlong', 'uNebA', 'uNebB']);
    progBg = program(VS_FULL, FS_BG);
    uBg = uniforms(progBg, ['uTex', 'uRes', 'uPole', 'uRot', 'uShift', 'uRmax', 'uZoom', 'uExposure']);
    progStars = program(VS_STARS, FS_STARS);
    uStars = uniforms(progStars, ['uRes', 'uPole', 'uRot', 'uPar', 'uMouse', 'uDpr', 'uTime', 'uZoom',
      'uMouseStr', 'uRotMix', 'uMaxPt', 'uPulseCount', 'uExposure']);
    uStars.uPulse = gl.getUniformLocation(progStars, 'uPulse[0]') ||
                    gl.getUniformLocation(progStars, 'uPulse');
    progLines = program(VS_LINES, FS_LINES);
    uLines = uniforms(progLines, ['uRes', 'uColor', 'uExposure']);
    progStreak = program(VS_STREAK, FS_STREAK);
    uStreak = uniforms(progStreak, ['uRes', 'uExposure', 'uTime']);
    progRing = program(VS_RING, FS_RING);
    uRing = uniforms(progRing, ['uRes', 'uCenter', 'uHalf', 'uR', 'uW', 'uK', 'uExposure']);
    progVig = program(VS_FULL, FS_VIGNETTE);
    uVig = uniforms(progVig, ['uAspect']);
    progGrain = program(VS_FULL, FS_GRAIN);
    uGrain = uniforms(progGrain, ['uRes', 'uTime']);

    const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
    // Device-px cap for gl_PointSize: never hand the FS a sprite size the
    // rasterizer will silently clamp, or hero PSF math goes wrong.
    maxPointSize = Math.min(range[1] || 64, 128);
  }

  function buildStaticBuffers() {
    // Fullscreen triangle
    vaoFull = gl.createVertexArray();
    gl.bindVertexArray(vaoFull);
    bufFull = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bufFull);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // Unit quad for rings
    vaoRing = gl.createVertexArray();
    gl.bindVertexArray(vaoRing);
    bufRing = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bufRing);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // Dynamic: constellation lines
    vaoLines = gl.createVertexArray();
    gl.bindVertexArray(vaoLines);
    bufLines = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bufLines);
    gl.bufferData(gl.ARRAY_BUFFER, lineVerts.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 12, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 12, 8);

    // Dynamic: meteor/streak quads
    vaoStreak = gl.createVertexArray();
    gl.bindVertexArray(vaoStreak);
    bufStreak = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bufStreak);
    gl.bufferData(gl.ARRAY_BUFFER, streakVerts.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 24, 16);

    // Dynamic: satellite (rendered through the star program, uRotMix=0)
    vaoSat = gl.createVertexArray();
    gl.bindVertexArray(vaoSat);
    bufSat = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bufSat);
    gl.bufferData(gl.ARRAY_BUFFER, satVerts.byteLength, gl.DYNAMIC_DRAW);
    bindStarAttribs();

    gl.bindVertexArray(null);
  }

  function bindStarAttribs() {
    const S = STAR_STRIDE * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, S, 0);   // aPos
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, S, 8);   // aDepth
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, S, 12);  // aColor
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, S, 24);  // aIntensity
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 3, gl.FLOAT, false, S, 28);  // aTwk
  }

  // Band geometry in pole-relative world coords (shared by bake + star seeding).
  function bandGeometry() {
    // Portrait: steepen the band and push the core toward a lower corner so
    // the cool blue stretch crosses the upper half of a phone screen.
    const portrait = H > W;
    const angle = portrait ? -0.95 : CFG.BAND_ANGLE;
    const dir = [Math.cos(angle), Math.sin(angle)];
    const cScreen = portrait ? [W * 0.42, H * 0.62] : [W * 0.46, H * 0.64];
    const c = [cScreen[0] - pole[0], cScreen[1] - pole[1]];
    const coreAlong = (portrait ? -0.34 : -0.22) * Rmax;
    return { dir, c, sigma: 0.16 * Rmax, coreAlong };
  }

  function buildStars() {
    // Density is per visible px²; scale by disc/viewport area ratio so the
    // on-screen density holds no matter where the pole pushes Rmax.
    const target = Math.round(Math.PI * Rmax * Rmax * CFG.STAR_DENSITY);
    starCount = Math.max(CFG.STAR_MIN, Math.min(CFG.STAR_MAX, target));
    const data = new Float32Array(starCount * STAR_STRIDE);
    const band = bandGeometry();
    const perp = [-band.dir[1], band.dir[0]];

    srand = mulberry32(SESSION_SEED);
    const hrand = mulberry32(SESSION_SEED ^ 0x9e3779b9);
    const tmp = new Array(starCount);
    for (let i = 0; i < starCount; i++) {
      let x, y;
      if (srand() < CFG.BAND_FRACTION) {
        // Cluster along the galactic plane (gaussian across, uniform along).
        const along = (srand() * 2.4 - 1.2) * Rmax;
        let across = 0;
        for (let k = 0; k < 3; k++) across += srand();   // Irwin–Hall ≈ gaussian
        across = (across / 1.5 - 1) * band.sigma * 1.5;
        x = band.c[0] + band.dir[0] * along + perp[0] * across;
        y = band.c[1] + band.dir[1] * along + perp[1] * across;
        const r = Math.hypot(x, y);
        if (r > Rmax) { const s = (Rmax * 0.985) / r; x *= s; y *= s; }
      } else {
        const r = Rmax * Math.sqrt(srand());
        const a = srand() * Math.PI * 2;
        x = Math.cos(a) * r;
        y = Math.sin(a) * r;
      }
      tmp[i] = { x, y, I: pickIntensity() };
    }
    // Hero tier — brilliant, spiked.
    for (let h = 0; h < CFG.HERO_COUNT; h++) {
      const i = (hrand() * starCount) | 0;
      tmp[i].I = 1.3 + hrand() * 1.1;
    }
    // Bright-first so quality fallback can truncate the tail (faint stars).
    tmp.sort((a, b) => b.I - a.I);

    brightSet = [];
    for (let i = 0; i < starCount; i++) {
      const s = tmp[i];
      const bright = s.I > 0.4;
      const [cr, cg, cb] = kelvinRGB(pickTemperature(bright));
      // Faint stars desaturate toward white — the eye/photo sees little color in them.
      const sat = clamp01(0.30 + s.I * 1.1);
      const depth = srand() * srand();             // bias far
      const o = i * STAR_STRIDE;
      data[o] = s.x;
      data[o + 1] = s.y;
      data[o + 2] = bright ? Math.min(1, depth + 0.25) : depth;
      data[o + 3] = 1 + (cr - 1) * sat;
      data[o + 4] = 1 + (cg - 1) * sat;
      data[o + 5] = 1 + (cb - 1) * sat;
      data[o + 6] = s.I;
      data[o + 7] = (0.4 + srand() * 1.8) * Math.PI * 2; // omega rad/s
      data[o + 8] = srand() * Math.PI * 2;               // phase
      data[o + 9] = 0.08 + 0.42 * (1 - clamp01((s.I - 0.05) / 0.55)); // amp: faint twinkles harder
      if (s.I >= 0.22 && brightSet.length < 420) {
        brightSet.push({ x: s.x, y: s.y, depth: data[o + 2] });
      }
    }

    vaoStars = vaoStars || gl.createVertexArray();
    gl.bindVertexArray(vaoStars);
    bufStars = bufStars || gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bufStars);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    bindStarAttribs();
    gl.bindVertexArray(null);

    starDrawCount = starCount;
    applyQualityCounts();
  }

  function bakeSky() {
    const size = CFG.BAKE_SIZE;
    if (!skyTex) {
      skyTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, skyTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      skyFbo = gl.createFramebuffer();
    }
    gl.bindTexture(gl.TEXTURE_2D, skyTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, skyFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, skyTex, 0);

    const band = bandGeometry();
    gl.viewport(0, 0, size, size);
    gl.disable(gl.BLEND);
    gl.useProgram(progBake);
    gl.uniform1f(uBake.uRmax, Rmax);
    gl.uniform2f(uBake.uBandC, band.c[0], band.c[1]);
    gl.uniform2f(uBake.uBandDir, band.dir[0], band.dir[1]);
    gl.uniform1f(uBake.uBandSigma, band.sigma);
    gl.uniform1f(uBake.uCoreAlong, band.coreAlong);
    // Nebulae sit just off the band axis.
    const perp = [-band.dir[1], band.dir[0]];
    gl.uniform4f(uBake.uNebA,
      band.c[0] + band.dir[0] * 0.34 * Rmax + perp[0] * 0.10 * Rmax,
      band.c[1] + band.dir[1] * 0.34 * Rmax + perp[1] * 0.10 * Rmax,
      0.085 * Rmax, 0.22);
    gl.uniform4f(uBake.uNebB,
      band.c[0] - band.dir[0] * 0.40 * Rmax - perp[0] * 0.14 * Rmax,
      band.c[1] - band.dir[1] * 0.40 * Rmax - perp[1] * 0.14 * Rmax,
      0.11 * Rmax, 0.12);
    gl.bindVertexArray(vaoFull);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function layout() {
    DPR = Math.min(window.devicePixelRatio || 1, CFG.DPR_MAX);
    if (quality >= 1) DPR = 1;
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.max(1, Math.round(W * DPR));
    canvas.height = Math.max(1, Math.round(H * DPR));
    pole = [W * CFG.POLE[0], H * CFG.POLE[1]];
    // Disc must cover the farthest corner through a full rotation, plus parallax margin.
    let r = 0;
    for (const [cx, cy] of [[0, 0], [W, 0], [0, H], [W, H]]) {
      r = Math.max(r, Math.hypot(cx - pole[0], cy - pole[1]));
    }
    Rmax = r + CFG.PARALLAX_NEAR + 60;
  }

  function applyQualityCounts() {
    if (quality >= 3) starDrawCount = Math.round(starCount * 0.4);
    else if (quality >= 2) starDrawCount = Math.round(starCount * 0.6);
    else starDrawCount = starCount;
    grainOn = quality < 2;
  }

  function buildAll() {
    buildPrograms();
    buildStaticBuffers();
    layout();
    buildStars();
    bakeSky();
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 1);
  }

  // ------------------------------------------------------------ Sky dynamics
  function spawnMeteor(now, opts) {
    if (meteors.length >= 4) return;
    const band = bandGeometry();
    // Direction roughly along the band ± spread, random sign.
    const flip = Math.random() < 0.5 ? 1 : -1;
    const jitter = (Math.random() - 0.5) * 0.9;
    const ang = Math.atan2(band.dir[1] * flip, band.dir[0] * flip) + jitter;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    // Start upstream so the streak crosses the viewport.
    const px = (opts && opts.x != null) ? opts.x : W * (0.15 + Math.random() * 0.7);
    const py = (opts && opts.y != null) ? opts.y : H * (0.10 + Math.random() * 0.55);
    const lead = 200 + Math.random() * 300;
    const speed = 1100 + Math.random() * 1000;
    const travel = (Math.max(W, H) + 700) / speed * 1000;
    meteors.push({
      x: px - dx * lead, y: py - dy * lead,
      dx, dy, speed,
      len: speed * (0.16 + Math.random() * 0.10),
      bright: 0.7 + Math.random() * 1.0,
      mix: Math.random() < 0.3 ? 1 : 0,
      born: now, dies: now + travel, dead: 0,
    });
  }

  function spawnSatellite(now) {
    const fromLeft = Math.random() < 0.5;
    const y0 = H * (0.12 + Math.random() * 0.6);
    const y1 = H * (0.12 + Math.random() * 0.6);
    const x0 = fromLeft ? -20 : W + 20;
    const x1 = fromLeft ? W + 20 : -20;
    const d = Math.hypot(x1 - x0, y1 - y0);
    const speed = 24 + Math.random() * 14;          // px/s — slow, deliberate
    satellite = {
      x: x0, y: y0,
      dx: (x1 - x0) / d, dy: (y1 - y0) / d,
      speed, until: now + (d / speed) * 1000,
    };
  }

  function updateSky(now, dt, pulses) {
    // Spontaneous + choreographed meteors.
    if (now >= nextMeteorAt) {
      spawnMeteor(now);
      nextMeteorAt = now + CFG.METEOR_MIN_GAP + Math.random() * CFG.METEOR_RAND_GAP;
    }
    while (wishQueue.length && now >= wishQueue[0].at) {
      const w = wishQueue.shift();
      spawnMeteor(now, { x: w.x, y: Math.min(w.y, H * 0.5) });
    }
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      m.x += m.dx * m.speed * dt;
      m.y += m.dy * m.speed * dt;
      if (now > m.dies && !m.dead) m.dead = now;
      if (m.dead && now - m.dead > 650) meteors.splice(i, 1);
    }
    // Satellite lifecycle.
    if (!satellite && now >= nextSatAt && quality < 3) {
      spawnSatellite(now);
    } else if (satellite) {
      satellite.x += satellite.dx * satellite.speed * dt;
      satellite.y += satellite.dy * satellite.speed * dt;
      if (now > satellite.until) {
        satellite = null;
        nextSatAt = now + CFG.SAT_MIN_GAP + Math.random() * CFG.SAT_RAND_GAP;
      }
    }
    // Pulses: GL owns aging; a fresh pulse also queues a wish meteor.
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      if (!seenPulses.has(p)) {
        seenPulses.add(p);
        wishQueue.push({ at: now + 260, x: p.x + (Math.random() - 0.5) * 300, y: p.y });
      }
      p.age += dt * 1000;
      if (p.age >= CFG.PULSE_LIFE) pulses.splice(i, 1);
    }
  }

  // --------------------------------------------------------------- Geometry
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  // CPU twin of the star vertex transform (for overlay lines + streak parallax).
  // Writes into a shared scratch pair — zero allocation on the hot path.
  const TP = [0, 0];
  function transformPoint(x, y, depth, cosT, sinT, zoom) {
    let px = x * cosT - y * sinT + pole[0];
    let py = x * sinT + y * cosT + pole[1];
    const par = 0.25 + 0.75 * depth;
    px += parX * par;
    py += parY * par;
    const cx = W * 0.5, cy = H * 0.5;
    TP[0] = cx + (px - cx) * zoom;
    TP[1] = cy + (py - cy) * zoom;
    return TP;
  }

  // Pooled nodes: collecting ~400 candidates per frame must not churn the GC.
  const NODE_POOL_MAX = 420;
  const lineNodes = new Array(NODE_POOL_MAX);
  for (let i = 0; i < NODE_POOL_MAX; i++) lineNodes[i] = { x: 0, y: 0, d: 0 };
  function buildConstellation(mouse, cosT, sinT, zoom) {
    if (!mouse.active || mouse.x == null || mouseStr < 0.02) return 0;
    let count = 0;
    for (let i = 0; i < brightSet.length && count < NODE_POOL_MAX; i++) {
      const b = brightSet[i];
      const p = transformPoint(b.x, b.y, b.depth, cosT, sinT, zoom);
      const d = Math.hypot(p[0] - mouse.x, p[1] - mouse.y);
      if (d < CFG.LINE_REACH) {
        const n = lineNodes[count++];
        n.x = p[0]; n.y = p[1]; n.d = d;
      }
    }
    // Partial selection: move the K nearest nodes to the front (K is tiny).
    const K = Math.min(CFG.LINE_NODES, count);
    for (let i = 0; i < K; i++) {
      let best = i;
      for (let j = i + 1; j < count; j++) {
        if (lineNodes[j].d < lineNodes[best].d) best = j;
      }
      if (best !== i) {
        const sw = lineNodes[i]; lineNodes[i] = lineNodes[best]; lineNodes[best] = sw;
      }
    }
    let v = 0, lines = 0;
    for (let i = 0; i < K && lines < MAX_LINES; i++) {
      for (let j = i + 1; j < K && lines < MAX_LINES; j++) {
        const a = lineNodes[i], b = lineNodes[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > CFG.LINE_MAX_DIST) continue;
        const reach = 1 - Math.max(a.d, b.d) / CFG.LINE_REACH;
        const alpha = (1 - d / CFG.LINE_MAX_DIST) * reach * mouseStr;
        if (alpha <= 0.004) continue;
        lineVerts[v++] = a.x; lineVerts[v++] = a.y; lineVerts[v++] = alpha;
        lineVerts[v++] = b.x; lineVerts[v++] = b.y; lineVerts[v++] = alpha;
        lines++;
      }
    }
    return lines;
  }

  function emitStreakQuad(out, base, hx, hy, tx, ty, halfW, alpha, mix) {
    // Two triangles: head edge (uv.x=0) -> tail edge (uv.x=1). Direct stores.
    const dx = tx - hx, dy = ty - hy;
    const L = Math.hypot(dx, dy) || 1;
    const px = -dy / L * halfW, py = dx / L * halfW;
    let o = base;
    out[o++] = hx + px; out[o++] = hy + py; out[o++] = 0; out[o++] = -1; out[o++] = alpha; out[o++] = mix;
    out[o++] = hx - px; out[o++] = hy - py; out[o++] = 0; out[o++] = 1;  out[o++] = alpha; out[o++] = mix;
    out[o++] = tx + px; out[o++] = ty + py; out[o++] = 1; out[o++] = -1; out[o++] = alpha; out[o++] = mix;
    out[o++] = tx + px; out[o++] = ty + py; out[o++] = 1; out[o++] = -1; out[o++] = alpha; out[o++] = mix;
    out[o++] = hx - px; out[o++] = hy - py; out[o++] = 0; out[o++] = 1;  out[o++] = alpha; out[o++] = mix;
    out[o++] = tx - px; out[o++] = ty - py; out[o++] = 1; out[o++] = 1;  out[o++] = alpha; out[o++] = mix;
    return o;
  }

  function buildStreaks(now) {
    let o = 0, quads = 0;
    for (const m of meteors) {
      if (quads >= MAX_STREAK_QUADS) break;
      const lifeIn = Math.min(1, (now - m.born) / 220);
      const fade = m.dead ? Math.max(0, 1 - (now - m.dead) / 650) : 1;
      const alpha = m.bright * lifeIn * fade * fade;
      if (alpha <= 0.01) continue;
      const hx = m.x + parX * 1.05, hy = m.y + parY * 1.05;
      const tx = hx - m.dx * m.len, ty = hy - m.dy * m.len;
      o = emitStreakQuad(streakVerts, o, hx, hy, tx, ty, 3.2, alpha, m.mix);
      quads++;
    }
    return quads;
  }

  // ------------------------------------------------------------------ Frame
  function frame(tMs, mouse, pulses) {
    pulsesRef = pulses;
    if (contextLost) return;
    if (startMs < 0) { startMs = tMs; lastMs = tMs; }
    const now = tMs - startMs;
    const dt = Math.min((tMs - lastMs) / 1000, 0.05) || 0.016;
    lastMs = tMs;

    theta = now / 1000 * CFG.ROT_RATE;
    const cosT = Math.cos(theta), sinT = Math.sin(theta);
    const uTime = (now / 1000) % 4096;

    // Opening choreography.
    const exposure = Math.min(1, now / 1000 / CFG.EXPOSURE_S);
    const exp2 = exposure * exposure * (3 - 2 * exposure);    // smoothstep
    const settle = Math.min(1, now / 1000 / CFG.ZOOM_SETTLE_S);
    const zoom = 1.05 - 0.05 * easeOutCubic(settle);

    // Parallax target: cursor offset from center, plus an idle lissajous drift.
    let tx = Math.sin(now * 0.00005) * 6, ty = Math.cos(now * 0.000037) * 6;
    if (mouse.active && mouse.x != null) {
      tx += ((mouse.x / W) - 0.5) * 2 * CFG.PARALLAX_NEAR;
      ty += ((mouse.y / H) - 0.5) * 2 * CFG.PARALLAX_NEAR;
    }
    const k = 1 - Math.exp(-dt * 3.2);
    parX += (tx - parX) * k;
    parY += (ty - parY) * k;

    const strTarget = (mouse.active && mouse.x != null) ? 1 : 0;
    mouseStr += (strTarget - mouseStr) * (1 - Math.exp(-dt * 4));

    updateSky(now, dt, pulses);

    // Pulse uniforms (shared by star brighten + ring draws).
    const pulseCount = Math.min(pulses.length, CFG.MAX_PULSES);
    for (let i = 0; i < pulseCount; i++) {
      const p = pulses[i];
      const kk = Math.min(1, p.age / CFG.PULSE_LIFE);
      pulseUni[i * 4] = p.x;
      pulseUni[i * 4 + 1] = p.y;
      pulseUni[i * 4 + 2] = 8 + easeOutCubic(kk) * Math.min(CFG.PULSE_MAX_R, 0.42 * Math.min(W, H));
      pulseUni[i * 4 + 3] = 1.4 * (1 - kk);
    }

    gl.viewport(0, 0, canvas.width, canvas.height);

    // 1 — baked sky.
    gl.disable(gl.BLEND);
    gl.useProgram(progBg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, skyTex);
    gl.uniform1i(uBg.uTex, 0);
    gl.uniform2f(uBg.uRes, W, H);
    gl.uniform2f(uBg.uPole, pole[0], pole[1]);
    gl.uniform2f(uBg.uRot, cosT, sinT);
    gl.uniform2f(uBg.uShift, parX * (CFG.PARALLAX_BG / CFG.PARALLAX_NEAR), parY * (CFG.PARALLAX_BG / CFG.PARALLAX_NEAR));
    gl.uniform1f(uBg.uRmax, Rmax);
    gl.uniform1f(uBg.uZoom, zoom);
    gl.uniform1f(uBg.uExposure, exp2);
    gl.bindVertexArray(vaoFull);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Everything else is additive light.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    // 2 — stars.
    gl.useProgram(progStars);
    gl.uniform2f(uStars.uRes, W, H);
    gl.uniform2f(uStars.uPole, pole[0], pole[1]);
    gl.uniform2f(uStars.uRot, cosT, sinT);
    gl.uniform2f(uStars.uPar, parX, parY);
    gl.uniform2f(uStars.uMouse, mouse.x == null ? -9999 : mouse.x, mouse.y == null ? -9999 : mouse.y);
    gl.uniform1f(uStars.uDpr, DPR);
    gl.uniform1f(uStars.uTime, uTime);
    gl.uniform1f(uStars.uZoom, zoom);
    gl.uniform1f(uStars.uMouseStr, mouseStr);
    gl.uniform1f(uStars.uRotMix, 1);
    gl.uniform1f(uStars.uMaxPt, maxPointSize);
    gl.uniform1f(uStars.uExposure, exp2);
    gl.uniform4fv(uStars.uPulse, pulseUni);
    gl.uniform1i(uStars.uPulseCount, pulseCount);
    gl.bindVertexArray(vaoStars);
    gl.drawArrays(gl.POINTS, 0, starDrawCount);

    // 2b — satellite, same program, no sky rotation.
    if (satellite) {
      const glint = 0.16 + 0.45 * Math.pow(Math.max(0, Math.sin(now * 0.0009)), 16);
      satVerts[0] = satellite.x - pole[0];
      satVerts[1] = satellite.y - pole[1];
      satVerts[2] = 0.9;                       // near depth
      satVerts[3] = 0.85; satVerts[4] = 0.88; satVerts[5] = 0.92;
      satVerts[6] = glint;
      satVerts[7] = 0.0; satVerts[8] = 0.0; satVerts[9] = 0.0;
      gl.uniform1f(uStars.uRotMix, 0);
      gl.bindVertexArray(vaoSat);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufSat);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, satVerts, 0, STAR_STRIDE);
      gl.drawArrays(gl.POINTS, 0, 1);
    }

    // 3 — constellation overlay.
    const lines = buildConstellation(mouse, cosT, sinT, zoom);
    if (lines > 0) {
      gl.useProgram(progLines);
      gl.uniform2f(uLines.uRes, W, H);
      gl.uniform3f(uLines.uColor, 0.24, 0.32, 0.48);
      gl.uniform1f(uLines.uExposure, exp2);
      gl.bindVertexArray(vaoLines);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufLines);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, lineVerts, 0, lines * 6);
      gl.drawArrays(gl.LINES, 0, lines * 2);
    }

    // 4 — meteors.
    const quads = buildStreaks(now);
    if (quads > 0) {
      gl.useProgram(progStreak);
      gl.uniform2f(uStreak.uRes, W, H);
      gl.uniform1f(uStreak.uExposure, exp2);
      gl.uniform1f(uStreak.uTime, uTime);
      gl.bindVertexArray(vaoStreak);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufStreak);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, streakVerts, 0, quads * 36);
      gl.drawArrays(gl.TRIANGLES, 0, quads * 6);
    }

    // 5 — supernova rings.
    if (pulseCount > 0) {
      gl.useProgram(progRing);
      gl.uniform2f(uRing.uRes, W, H);
      gl.uniform1f(uRing.uExposure, exp2);
      gl.bindVertexArray(vaoRing);
      for (let i = 0; i < pulseCount; i++) {
        const r = pulseUni[i * 4 + 2];
        const kk = Math.min(1, pulses[i].age / CFG.PULSE_LIFE);
        const w = 16 + 30 * kk;
        gl.uniform2f(uRing.uCenter, pulseUni[i * 4], pulseUni[i * 4 + 1]);
        gl.uniform1f(uRing.uHalf, r + w * 4 + 40);
        gl.uniform1f(uRing.uR, r);
        gl.uniform1f(uRing.uW, w);
        gl.uniform1f(uRing.uK, kk);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
    }

    // 6 — vignette (alpha-over), then grain (additive).
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(progVig);
    gl.uniform1f(uVig.uAspect, W / H);
    gl.bindVertexArray(vaoFull);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (grainOn) {
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(progGrain);
      gl.uniform2f(uGrain.uRes, W, H);
      gl.uniform1f(uGrain.uTime, uTime);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.bindVertexArray(null);
  }

  // ------------------------------------------------------------ Public shell
  function resize() {
    if (contextLost) return;
    layout();
    buildStars();
    bakeSky();
  }

  function degrade() {
    if (contextLost || quality >= 3) return false;
    quality++;
    if (quality === 1) layout();              // drop to DPR 1
    applyQualityCounts();
    return quality < 3;
  }

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    contextLost = true;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    skyTex = null; skyFbo = null;
    vaoStars = null; bufStars = null;
    // Stale interactions must not replay on the restored context.
    if (pulsesRef) pulsesRef.length = 0;
    wishQueue.length = 0;
    meteors.length = 0;
    try { buildAll(); } catch (err) { contextLost = true; }
  });

  try {
    buildAll();
  } catch (err) {
    console.warn('starfield-gl: init failed, falling back to 2D —', err);
    // The canvas is already claimed as webgl2; swap in a clone so the 2D
    // fallback can still call getContext('2d') on #starfield.
    const fresh = canvas.cloneNode(false);
    canvas.parentNode.replaceChild(fresh, canvas);
    return null;
  }

  return { frame, resize, degrade };
}
