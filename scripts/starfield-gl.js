// Starfield GL v2 — first-person drift through a photoreal galaxy (WebGL2).
//
// The visitor floats forward through space and can grab the sky (drag) to look
// around a full 360°. Layers, back to front:
//   1. Equirect sky sphere (baked once, 2048x1024): seamless 3D-noise Milky
//      Way with dust trunks, gold core, two nebulae. Sampled per-pixel by
//      view ray.
//   2. Far celestial shell (~32k gl.POINTS at "infinity"): band-clustered
//      star powder + bright tier with blackbody colors, scintillation and
//      diffraction-spiked heroes. Stable — carries the constellation chart.
//   3. Volumetric tier (~18k points wrapped in a cube around the camera):
//      these stream past as you drift — the "floating through space" layer.
//   4. Meteors (3D streaks), a distant drifting beacon, supernova shockwaves
//      on click (screen-space ring + star ignition), constellation overlay.
//   5. Vignette + film grain.
//
// Camera: yaw unbounded (full 360), pitch clamped; grab-the-sky drag with
// fling inertia; constant forward drift along a fixed world direction plus a
// breathing sway; idle auto-pan so the scene is never static.
// Exposes: sfglCreate(canvas) -> { frame(tMs, mouse, pulses, look), resize(), degrade() } | null

function sfglCreate(canvas) {
  'use strict';

  const CFG = {
    DPR_MAX: 2,
    // Tiers
    SHELL_BRIGHT: 20000,          // far-shell resolvable stars
    SHELL_DUST: 22000,            // far-shell unresolved powder
    VOLUME_STARS: 21000,          // wrapped fly-through tier
    HERO_COUNT: 24,               // brilliant spiked tier (far shell)
    BAND_FRACTION: 0.62,          // shell stars clustered along the galactic band
    // Camera / motion
    FOV_Y: 68 * Math.PI / 180,
    FOV_SETTLE: 74 * Math.PI / 180, // opening: slightly wide, eases to FOV_Y
    WRAP: 1600,                   // volumetric cube period (world units)
    DRIFT_SPEED: 20,              // u/s forward cruise
    DRIFT_DIR: [0.10, 0.06, -1],  // fixed world drift direction (normalized later)
    SWAY_AMP: 2.6,                // u, breathing sway
    D0: 260,                      // volumetric intensity falloff scale (units)
    VOL_GAIN: 3.0,                // luminosity scale of volumetric tier
    NEAR_CLAMP: 20,               // min distance used in falloff (anti-blind)
    DRAG_SENS: 0.0025,            // rad per px (mouse) — near-true grab mapping
    DRAG_SENS_TOUCH: 0.0065,
    FLING_DAMP: 2.0,              // 1/s exponential decay of look velocity
    FLING_MAX: 2.5,               // rad/s cap on release velocity
    PITCH_MAX: 1.53,              // ~87.7°
    IDLE_YAW_RATE: 0.022,         // rad/s auto-pan when idle
    IDLE_AFTER: 5000,             // ms without drag before auto-pan resumes
    HOVER_LOOK: 0.030,            // rad micro-look toward cursor
    ZOOM_MIN: 0.40,               // fovScale floor — ~28° telescope
    ZOOM_MAX: 1.20,               // fovScale ceiling — ~80° wide
    // Choreography
    EXPOSURE_S: 1.4,
    SETTLE_S: 4.5,                // FOV + speed ramp
    FIRST_METEOR_AT: 2600,
    METEOR_MIN_GAP: 6000,
    METEOR_RAND_GAP: 12000,
    BEACON_MIN_GAP: 55000,
    BEACON_RAND_GAP: 60000,
    // Interaction
    PULSE_LIFE: 1500,
    PULSE_MAX_R: 460,
    MAX_PULSES: 6,
    LINE_REACH: 320,
    LINE_MAX_DIST: 200,
    LINE_NODES: 14,
    // Bake
    BAKE_W: 2048,
    BAKE_H: 1024,
    R_FAR: 4000,                  // far-shell radius (beyond any volumetric star)
    // Bloom (ROADMAP #1) — only when FP16 render targets are available.
    BLOOM_THRESH: 0.55,           // luminance where glow starts
    BLOOM_KNEE: 0.45,             // soft-knee width below the threshold
    BLOOM_STR: 0.70,              // bloom energy added in composite
    TONEMAP_E: 1.65,              // filmic shoulder: 1 - exp(-c*E)
  };

  // ---------------------------------------------------------------- GL setup
  const gl = canvas.getContext('webgl2', {
    alpha: false, antialias: false, depth: false, stencil: false,
    powerPreference: 'high-performance',
  });
  if (!gl) return null;

  // Capability probe — bloom (ROADMAP #1) needs renderable+filterable FP16.
  // WebGL2 makes RGBA16F filterable by default; renderability needs the ext.
  const caps = {
    halfFloatRenderable: !!(gl.getExtension('EXT_color_buffer_half_float') ||
                            gl.getExtension('EXT_color_buffer_float')),
  };

  // ------------------------------------------------------------- GLSL source
  const VS_FULL = `#version 300 es
layout(location=0) in vec2 aClip;
out vec2 vUv;
void main(){ vUv = aClip*0.5+0.5; gl_Position = vec4(aClip,0.,1.); }`;

  const NOISE3 = `
float hash13(vec3 p){ p=fract(p*0.1031); p+=dot(p,p.zyx+31.32); return fract((p.x+p.y)*p.z); }
float vnoise3(vec3 p){
  vec3 i=floor(p), f=fract(p); vec3 u=f*f*(3.-2.*f);
  float a=hash13(i),             b=hash13(i+vec3(1,0,0));
  float c=hash13(i+vec3(0,1,0)), d=hash13(i+vec3(1,1,0));
  float e=hash13(i+vec3(0,0,1)), g=hash13(i+vec3(1,0,1));
  float h=hash13(i+vec3(0,1,1)), k=hash13(i+vec3(1,1,1));
  return mix(mix(mix(a,b,u.x),mix(c,d,u.x),u.y), mix(mix(e,g,u.x),mix(h,k,u.x),u.y), u.z);
}
float fbm3(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ s+=a*vnoise3(p); p=p*2.03+vec3(13.1,7.7,3.9); a*=0.5; } return s; }`;

  // Equirect mapping shared by bake (uv->dir) and bg (dir->uv).
  const EQUIRECT = `
const float PI = 3.14159265358979;
vec3 uvToDir(vec2 uv){
  float lon = (uv.x*2.0-1.0)*PI;
  float lat = (uv.y-0.5)*PI;
  float cl = cos(lat);
  return vec3(cl*sin(lon), sin(lat), -cl*cos(lon));
}
vec2 dirToUv(vec3 d){
  float u = atan(d.x, -d.z)/(2.0*PI)+0.5;
  float v = asin(clamp(d.y,-1.0,1.0))/PI+0.5;
  return vec2(u,v);
}`;

  // Bakes the galaxy onto the equirect sphere. All features are functions of
  // the unit direction (3D noise) — no seams, no pole pinch artifacts.
  const FS_BAKE = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform vec3 uGalN;       // galactic plane normal
uniform vec3 uCoreDir;    // core bulge direction (on the plane)
uniform vec3 uNebDirA, uNebDirB;
${NOISE3}
${EQUIRECT}
void main(){
  vec3 dir = uvToDir(vUv);

  // Base space — near-black blue with huge-scale mottling.
  vec3 col = vec3(0.018,0.025,0.048)*(0.70 + 0.75*fbm3(dir*2.2+7.3));

  // Galactic band geometry: angular distance from the plane.
  float dAng = asin(clamp(dot(dir, uGalN), -1.0, 1.0));
  float widthMod = 0.72 + 0.55*fbm3(dir*3.1 + 7.0);
  float sigma = 0.13*widthMod;
  float prof = exp(-0.5*pow(dAng/sigma, 2.0));
  float glow = exp(-0.5*pow(dAng/(sigma*2.7), 2.0));

  // Cloud structure: domain-warped fbm on the sphere.
  vec3 q = vec3(fbm3(dir*4.0), fbm3(dir*4.0+vec3(5.2,1.3,2.1)), fbm3(dir*4.0+vec3(1.7,9.2,3.8)));
  float clouds = 0.34 + 1.05*fbm3(dir*10.0 + 4.2*q);
  float band = prof*clouds;

  // Core bulge — warm angular gaussian around uCoreDir.
  float coreA = acos(clamp(dot(dir, uCoreDir), -1.0, 1.0));
  float core = exp(-0.5*pow(coreA/0.40, 2.0));

  // Dust: two ridge scales gated into trunks, hugging the plane.
  float ridge  = 1.0 - abs(2.0*fbm3(dir*14.0 + 2.0*q + 11.0) - 1.0);
  float ridge2 = 1.0 - abs(2.0*fbm3(dir*6.5  + q + 5.0) - 1.0);
  float trunks = smoothstep(0.30, 0.78, fbm3(dir*3.4 + 19.0));
  float dust = clamp(pow(ridge, 3.2)*0.55 + pow(ridge2, 2.7)*0.85*trunks, 0.0, 1.0)
             * smoothstep(sigma*1.7, sigma*0.25, abs(dAng));
  band *= 1.0 - 0.80*dust;
  core *= 1.0 - 0.45*dust;

  vec3 bandCool = vec3(0.42,0.54,0.78);
  vec3 bandWarm = vec3(1.0,0.84,0.56);
  col += glow*0.080*mix(bandCool, bandWarm, clamp(core*0.6,0.,1.));
  col += band*0.30*mix(bandCool, bandWarm, clamp(core*1.1,0.,1.));
  col += core*prof*0.34*vec3(1.0,0.86,0.60);
  col *= 1.0 - 0.28*dust*prof;

  // Nebulae — committed colors, fbm-modulated.
  float nebA = exp(-0.5*pow(acos(clamp(dot(dir,uNebDirA),-1.,1.))/0.11, 2.0));
  float nebB = exp(-0.5*pow(acos(clamp(dot(dir,uNebDirB),-1.,1.))/0.15, 2.0));
  col += 0.22*nebA*vec3(0.55,0.10,0.12)*(0.45+0.9*fbm3(dir*9.0+4.2));
  col += 0.16*nebB*vec3(0.07,0.24,0.26)*(0.45+0.9*fbm3(dir*11.0+9.1));

  // Dither against banding in the deep blacks.
  col += (hash13(dir*451.7)-0.5)*(1.6/255.0);
  o = vec4(max(col, 0.0), 1.0);
}`;

  // Per-pixel view ray -> world ray -> equirect sample.
  const FS_BG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex;
uniform mat3 uCam;
uniform float uTanHalf, uAspect, uExposure;
${EQUIRECT}
void main(){
  vec2 ndc = vUv*2.0-1.0;
  vec3 rc = normalize(vec3(ndc.x*uTanHalf*uAspect, ndc.y*uTanHalf, -1.0));
  vec3 rd = uCam*rc;
  o = vec4(texture(uTex, dirToUv(rd)).rgb*uExposure, 1.0);
}`;

  const VS_STARS = `#version 300 es
layout(location=0) in vec3 aPos;        // shell: dir*R_FAR; volume: cube coords
layout(location=1) in vec3 aColor;
layout(location=2) in float aIntensity; // shell: apparent; volume: luminosity
layout(location=3) in vec3 aTwk;        // omega, phase, amp
uniform mat3 uCam;                       // cam->world (columns)
uniform vec3 uCamPos;
uniform vec2 uRes, uMouse;
uniform float uDpr, uTime, uTanHalf, uAspect, uMouseStr, uMaxPt, uExposure;
uniform float uShell;                    // 1 = far shell (no wrap, no falloff)
uniform float uWrap, uD0, uVolGain, uNearClamp;
uniform vec4 uPulse[6];
uniform int uPulseCount;
out vec3 vColor; out float vI; out float vSize; out float vSpike; out float vSeed;
void main(){
  vec3 rel;
  if (uShell > 0.5) {
    rel = aPos;
  } else {
    rel = aPos - uCamPos;
    rel = mod(rel + 0.5*uWrap, uWrap) - 0.5*uWrap;   // nearest periodic image
  }
  // World -> camera: columns of uCam are camera axes, so transpose() inverts.
  vec3 view = transpose(uCam)*rel;
  if (view.z > -2.0) {                   // behind the camera
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vI = 0.0; vColor = vec3(0.0); vSize = 1.0; vSpike = 0.0; vSeed = 0.0;
    return;
  }
  float invZ = -1.0/view.z;
  vec2 ndc = vec2(view.x/uAspect, view.y)*invZ/uTanHalf;
  gl_Position = vec4(ndc, 0.0, 1.0);
  vec2 scr = vec2((ndc.x*0.5+0.5)*uRes.x, (0.5-ndc.y*0.5)*uRes.y);

  // Scintillation: two incommensurate sines + slow seeing envelope.
  float env = 0.7 + 0.3*sin(uTime*0.13 + aTwk.y*0.7);
  float tw = 1.0 + aTwk.z*env*(0.6*sin(uTime*aTwk.x + aTwk.y) + 0.4*sin(uTime*aTwk.x*2.33 + aTwk.y*1.91));

  float I;
  if (uShell > 0.5) {
    I = aIntensity*tw;
  } else {
    float dist = max(length(rel), uNearClamp);
    I = aIntensity*uVolGain*tw / (1.0 + pow(dist/uD0, 2.0));
    I = min(I, 3.2);
  }

  // Cursor lens.
  float md = distance(scr, uMouse);
  I *= 1.0 + uMouseStr*0.7*exp(-md*md/(240.0*240.0));

  // Supernova shells ignite stars as the wavefront passes (screen space).
  for(int i=0;i<6;i++){
    if(i>=uPulseCount) break;
    vec4 q = uPulse[i];
    float d = distance(scr, q.xy);
    I *= 1.0 + q.w*exp(-pow((d-q.z)/46.0, 2.0));
  }

  vI = I;
  vColor = aColor;
  vSpike = step(0.85, aIntensity)*step(0.5, uShell);
  vSeed = aTwk.y;                       // per-star random phase doubles as PSF seed
  float size = (1.6 + 6.8*sqrt(min(I, 3.2)))*uDpr*(1.0 + 0.10*(tw-1.0));
  if (uShell > 0.5 && aIntensity > 0.85) size = max(size, (17.0 + 11.0*aIntensity)*uDpr);
  size = min(size, uMaxPt);
  vSize = size;
  gl_PointSize = size;
}`;

  const FS_STARS = `#version 300 es
precision highp float;
in vec3 vColor; in float vI; in float vSize; in float vSpike; in float vSeed;
uniform float uDpr, uExposure;
out vec4 o;
float hash12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*0.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
void main(){
  vec2 d = gl_PointCoord - 0.5;
  // Per-star anisotropy: real scattered light is never a perfect disc.
  vec2 da = d*vec2(1.0 + 0.16*sin(vSeed*3.1), 1.0 + 0.16*cos(vSeed*2.3));
  float r = length(d);
  float ra = length(da);
  // Radial window: every term must reach zero before the sprite quad rim.
  float edge = 1.0 - smoothstep(0.34, 0.47, ra);
  float rp = r*vSize;                         // radius in device px
  float sig = (0.55 + 0.50*sqrt(min(vI,2.2)))*uDpr;
  float core = exp(-rp*rp/(2.0*sig*sig));

  // Scattered halo: angular ray lumps + radial-banded grain, growing with
  // radius so the inner glow stays clean while the rim frays organically.
  float ang = atan(d.y, d.x);
  float rayA = sin(ang*7.0 + vSeed*4.0)*sin(ang*11.0 - vSeed*2.0);
  float rayB = sin(ang*4.0 + vSeed*9.0);
  float rays = 0.42 + 0.58*(0.5 + 0.5*rayA) + 0.30*max(0.0, rayB);
  float fray = smoothstep(0.05, 0.30, ra);
  float grain = 0.80 + 0.40*hash12(vec2(floor(ang*22.0 + vSeed*5.0), floor(ra*36.0)));
  float halo = exp(-ra/0.20)*0.15
             * mix(1.0, rays*0.82, fray)
             * mix(1.0, grain, smoothstep(0.10, 0.32, ra));
  // Outer scatter drifts warm — dust does that to starlight.
  vec3 haloCol = mix(vColor, vColor*vec3(1.10,0.96,0.84), smoothstep(0.08, 0.34, ra));

  float spike = 0.0;
  if (vSpike > 0.5) {
    float th = 0.80*uDpr;
    float sx = exp(-pow(d.y*vSize/th, 2.0))*pow(max(0.0, 1.0-abs(d.x)*2.0), 2.4);
    float sy = exp(-pow(d.x*vSize/th, 2.0))*pow(max(0.0, 1.0-abs(d.y)*2.0), 2.4);
    spike = (sx+sy)*0.16*(0.85 + 0.30*hash12(vec2(floor(ang*14.0), vSeed)));
  }
  vec3 col = core*mix(vColor, vec3(1.0), 0.58)
           + halo*haloCol
           + spike*mix(vColor, vec3(1.0), 0.5);
  o = vec4(col*vI*uExposure*edge, 1.0);
}`;

  const VS_LINES = `#version 300 es
layout(location=0) in vec2 aPos;       // screen px
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
layout(location=0) in vec2 aPos;       // screen px
layout(location=1) in vec2 aUv;        // x: 0 head -> 1 tail, y: -1..1 across
layout(location=2) in vec2 aMeta;      // alpha, colorMix
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
layout(location=0) in vec2 aUnit;
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
  float flash = exp(-d*d/(2.0*pow(12.0+uR*0.05, 2.0)))*pow(1.0-uK, 6.0)*1.3;
  float a = ring*fade*0.12 + flash;
  o = vec4(col*a*uExposure, 1.0);
}`;

  // --- Bloom chain (scene FBO -> bright -> blur -> composite) -------------
  const FS_BRIGHT = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex;
uniform float uThresh, uKnee;
void main(){
  vec3 c = texture(uTex, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float t = max(0.0, l - uThresh);
  t = t*t / (t + uKnee + 1e-4);               // soft knee
  o = vec4(c * (t / max(l, 1e-4)), 1.0);
}`;

  const FS_BLUR = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex;
uniform vec2 uDir;                             // texel-scaled blur direction
void main(){
  vec3 s = texture(uTex, vUv).rgb * 0.227027;
  s += texture(uTex, vUv + uDir*1.0).rgb * 0.1945946;
  s += texture(uTex, vUv - uDir*1.0).rgb * 0.1945946;
  s += texture(uTex, vUv + uDir*2.0).rgb * 0.1216216;
  s += texture(uTex, vUv - uDir*2.0).rgb * 0.1216216;
  s += texture(uTex, vUv + uDir*3.0).rgb * 0.054054;
  s += texture(uTex, vUv - uDir*3.0).rgb * 0.054054;
  s += texture(uTex, vUv + uDir*4.0).rgb * 0.016216;
  s += texture(uTex, vUv - uDir*4.0).rgb * 0.016216;
  o = vec4(s, 1.0);
}`;

  // Scene + dual-level bloom -> filmic shoulder; vignette/grain/dither folded in.
  const FS_COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uScene, uBloomA, uBloomB;
uniform vec2 uRes;
uniform float uBloomStr, uTonemapE, uAspect, uTime, uGrainAmt, uLevelB;
float hash12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*0.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
void main(){
  vec3 c = texture(uScene, vUv).rgb;
  vec3 bloom = texture(uBloomA, vUv).rgb * 0.65
             + texture(uBloomB, vUv).rgb * 0.45 * uLevelB;
  c += bloom * uBloomStr;
  c = 1.0 - exp(-c * uTonemapE);               // filmic-ish shoulder
  vec2 p = (vUv-0.5)*vec2(uAspect,1.0);
  float d = length(p)/0.72;
  c *= 1.0 - smoothstep(0.62, 1.18, d)*0.40;   // vignette (matches direct path)
  float n = hash12(vUv*uRes + fract(uTime*0.731)*913.7);
  c += vec3(max(0.0, n-0.55)*uGrainAmt);       // sensor grain
  c += (hash12(vUv*uRes+17.7)-0.5)*(1.5/255.0); // output dither
  o = vec4(c, 1.0);
}`;

  const FS_VIGNETTE = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform float uAspect;
void main(){
  vec2 p = (vUv-0.5)*vec2(uAspect,1.0);
  float d = length(p)/0.72;
  float vig = smoothstep(0.62, 1.18, d)*0.40;
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
  float g = max(0.0, n-0.55)*0.030;
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
  // Session-stable PRNG: rebuilds (context restore) regenerate the same sky.
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const SESSION_SEED = (Math.random() * 0x7fffffff) | 0;
  let srand = Math.random;        // rebound to the seeded stream in build
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
      if (r < 0.35) return 9500 + srand() * 9000;
      if (r < 0.60) return 6800 + srand() * 2200;
      if (r < 0.82) return 5000 + srand() * 1500;
      return 3100 + srand() * 1200;
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

  // ------------------------------------------------------- Galaxy directions
  // Galactic plane basis (fixed world geometry, shared by bake + star seeding).
  const GAL_N = norm3([0.40, 0.86, 0.26]);          // plane normal
  const GAL_E1 = norm3(cross3(GAL_N, [0, 0, 1]));
  const GAL_E2 = cross3(GAL_N, GAL_E1);
  const CORE_PSI = 0.6;                             // core azimuth on the plane
  const CORE_DIR = planeDir(CORE_PSI, 0);
  const NEB_A = planeDir(CORE_PSI + 0.55, 0.10);
  const NEB_B = planeDir(CORE_PSI - 2.2, -0.55);   // cool landmark for the dark hemisphere

  function norm3(v) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }
  function cross3(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  // Direction on/near the galactic plane: azimuth psi, elevation off-plane.
  function planeDir(psi, off) {
    const cp = Math.cos(psi), sp = Math.sin(psi);
    const co = Math.cos(off), so = Math.sin(off);
    return norm3([
      (GAL_E1[0] * cp + GAL_E2[0] * sp) * co + GAL_N[0] * so,
      (GAL_E1[1] * cp + GAL_E2[1] * sp) * co + GAL_N[1] * so,
      (GAL_E1[2] * cp + GAL_E2[2] * sp) * co + GAL_N[2] * so,
    ]);
  }

  // --------------------------------------------------------------- Programs
  let progBake, progBg, progStars, progLines, progStreak, progRing, progVig, progGrain;
  let progBright, progBlur, progComposite;
  let uBake, uBg, uStars, uLines, uStreak, uRing, uVig, uGrain;
  let uBright, uBlur, uComposite;
  let vaoFull, vaoShell, vaoVol, vaoLines, vaoStreak, vaoRing;
  let bufFull, bufShell, bufVol, bufLines, bufStreak, bufRing;
  let skyTex = null, skyFbo = null;
  // Bloom render targets: full-res FP16 scene + half/quarter ping-pongs.
  let sceneT = null, halfA = null, halfB = null, quartA = null, quartB = null;
  let maxPointSize = 64;

  // ------------------------------------------------------------------ State
  let W = 0, H = 0, DPR = 1;
  let shellCount = 0, shellDrawCount = 0;
  let volCount = 0, volDrawCount = 0;
  const STAR_STRIDE = 10;                        // pos3 color3 I twk3
  let brightSet = [];                            // unit dirs of chart stars
  let startMs = -1, lastMs = -1;
  let mouseStr = 0;
  let quality = 0;
  let grainOn = true;
  let contextLost = false;

  // Camera
  let yaw = -0.614, pitch = 0.162;               // opening: core low-left, band sweeps up-right
  let yawVel = 0, pitchVel = 0;
  let fovScale = 1, fovTarget = 1;               // telescope zoom (smoothed)
  let camPos = [0, 0, 0];
  const driftDir = norm3(CFG.DRIFT_DIR);
  let lastInputAt = 0;            // idle pan eases in IDLE_AFTER ms after load
  let hoverYaw = 0, hoverPitch = 0;
  const camMat = new Float32Array(9);

  // Sky objects
  const meteors = [];                            // world-space 3D streaks
  let nextMeteorAt = CFG.FIRST_METEOR_AT;
  let beacon = null;                             // far drifting dot
  let nextBeaconAt = 18000 + Math.random() * CFG.BEACON_RAND_GAP;
  const seenPulses = new WeakSet();
  const wishQueue = [];
  let pulsesRef = null;
  let lastPulseAt = -1e9;                        // suppress chart during shockwave
  const camS = [0, 0, 0];                        // sway-included camera (unwrapped)

  // Scratch (no per-frame allocation)
  const MAX_STREAK_QUADS = 8;
  const streakVerts = new Float32Array(MAX_STREAK_QUADS * 6 * 6);
  const MAX_LINES = 64;
  const lineVerts = new Float32Array(MAX_LINES * 2 * 3);
  const pulseUni = new Float32Array(CFG.MAX_PULSES * 4);
  const V3A = [0, 0, 0], V3B = [0, 0, 0];
  const PRJ = [0, 0, 0];                         // x px, y px, ok flag

  // ------------------------------------------------------------- Build steps
  function buildPrograms() {
    progBake = program(VS_FULL, FS_BAKE);
    uBake = uniforms(progBake, ['uGalN', 'uCoreDir', 'uNebDirA', 'uNebDirB']);
    progBg = program(VS_FULL, FS_BG);
    uBg = uniforms(progBg, ['uTex', 'uCam', 'uTanHalf', 'uAspect', 'uExposure']);
    progStars = program(VS_STARS, FS_STARS);
    uStars = uniforms(progStars, ['uCam', 'uCamPos', 'uRes', 'uMouse', 'uDpr', 'uTime',
      'uTanHalf', 'uAspect', 'uMouseStr', 'uMaxPt', 'uExposure',
      'uShell', 'uWrap', 'uD0', 'uVolGain', 'uNearClamp', 'uPulseCount']);
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
    if (caps.halfFloatRenderable) {
      progBright = program(VS_FULL, FS_BRIGHT);
      uBright = uniforms(progBright, ['uTex', 'uThresh', 'uKnee']);
      progBlur = program(VS_FULL, FS_BLUR);
      uBlur = uniforms(progBlur, ['uTex', 'uDir']);
      progComposite = program(VS_FULL, FS_COMPOSITE);
      uComposite = uniforms(progComposite, ['uScene', 'uBloomA', 'uBloomB', 'uRes',
        'uBloomStr', 'uTonemapE', 'uAspect', 'uTime', 'uGrainAmt', 'uLevelB']);
    }

    const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
    maxPointSize = Math.min(range[1] || 64, 128);
  }

  function bindStarAttribs() {
    const S = STAR_STRIDE * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, S, 0);   // aPos
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, S, 12);  // aColor
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, S, 24);  // aIntensity
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 3, gl.FLOAT, false, S, 28);  // aTwk
  }

  function buildStaticBuffers() {
    vaoFull = gl.createVertexArray();
    gl.bindVertexArray(vaoFull);
    bufFull = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bufFull);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    vaoRing = gl.createVertexArray();
    gl.bindVertexArray(vaoRing);
    bufRing = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bufRing);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    vaoLines = gl.createVertexArray();
    gl.bindVertexArray(vaoLines);
    bufLines = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bufLines);
    gl.bufferData(gl.ARRAY_BUFFER, lineVerts.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 12, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 12, 8);

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

    gl.bindVertexArray(null);
  }

  // Gaussian-ish sample via Irwin–Hall.
  function gauss() { return (srand() + srand() + srand()) / 1.5 - 1; }

  // Random unit direction, optionally clustered around the galactic plane.
  function randomDir(banded) {
    if (banded) {
      const psi = srand() * Math.PI * 2;
      const off = gauss() * 0.16;
      return planeDir(psi, off);
    }
    const z = srand() * 2 - 1;
    const a = srand() * Math.PI * 2;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    return [Math.cos(a) * r, Math.sin(a) * r, z];
  }

  function writeStar(data, o, x, y, z, I, bright, twAmpScale) {
    const [cr, cg, cb] = kelvinRGB(pickTemperature(bright));
    const sat = clamp01(0.30 + I * 1.1);
    data[o] = x; data[o + 1] = y; data[o + 2] = z;
    data[o + 3] = 1 + (cr - 1) * sat;
    data[o + 4] = 1 + (cg - 1) * sat;
    data[o + 5] = 1 + (cb - 1) * sat;
    data[o + 6] = I;
    data[o + 7] = (0.4 + srand() * 1.8) * Math.PI * 2;
    data[o + 8] = srand() * Math.PI * 2;
    data[o + 9] = (0.08 + 0.42 * (1 - clamp01((I - 0.05) / 0.55))) * twAmpScale;
  }

  function buildStars() {
    srand = mulberry32(SESSION_SEED);
    const hrand = mulberry32(SESSION_SEED ^ 0x9e3779b9);

    // ---- Far shell: bright tier + powder, band-clustered, bright-first sort.
    shellCount = CFG.SHELL_BRIGHT + CFG.SHELL_DUST;
    const shell = new Float32Array(shellCount * STAR_STRIDE);
    const tmp = new Array(shellCount);
    for (let i = 0; i < CFG.SHELL_BRIGHT; i++) {
      tmp[i] = { d: randomDir(srand() < CFG.BAND_FRACTION), I: pickIntensity() };
    }
    for (let h = 0; h < CFG.HERO_COUNT; h++) {
      const i = (hrand() * CFG.SHELL_BRIGHT) | 0;
      tmp[i].I = 1.3 + hrand() * 1.1;
    }
    for (let i = CFG.SHELL_BRIGHT; i < shellCount; i++) {
      // Powder: very faint, strongly banded — the granular glow of the band.
      tmp[i] = { d: randomDir(srand() < 0.85), I: 0.016 + 0.060 * Math.pow(srand(), 1.3) };
    }
    tmp.sort((a, b) => b.I - a.I);
    brightSet = [];
    for (let i = 0; i < shellCount; i++) {
      const s = tmp[i];
      writeStar(shell, i * STAR_STRIDE,
        s.d[0] * CFG.R_FAR, s.d[1] * CFG.R_FAR, s.d[2] * CFG.R_FAR,
        s.I, s.I > 0.4, 1);
      if (s.I >= 0.22 && brightSet.length < 420) {
        brightSet.push({ x: s.d[0] * CFG.R_FAR, y: s.d[1] * CFG.R_FAR, z: s.d[2] * CFG.R_FAR });
      }
    }
    vaoShell = vaoShell || gl.createVertexArray();
    gl.bindVertexArray(vaoShell);
    bufShell = bufShell || gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bufShell);
    gl.bufferData(gl.ARRAY_BUFFER, shell, gl.STATIC_DRAW);
    bindStarAttribs();

    // ---- Volumetric tier: uniform in the wrap cube, luminosity-based.
    volCount = CFG.VOLUME_STARS;
    const vol = new Float32Array(volCount * STAR_STRIDE);
    const vtmp = new Array(volCount);
    for (let i = 0; i < volCount; i++) {
      vtmp[i] = {
        x: srand() * CFG.WRAP, y: srand() * CFG.WRAP, z: srand() * CFG.WRAP,
        L: 0.04 + 0.5 * Math.pow(srand(), 3.0),
      };
    }
    vtmp.sort((a, b) => b.L - a.L);
    for (let i = 0; i < volCount; i++) {
      const s = vtmp[i];
      writeStar(vol, i * STAR_STRIDE, s.x, s.y, s.z, s.L, s.L > 0.3, 0.6);
    }
    vaoVol = vaoVol || gl.createVertexArray();
    gl.bindVertexArray(vaoVol);
    bufVol = bufVol || gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bufVol);
    gl.bufferData(gl.ARRAY_BUFFER, vol, gl.STATIC_DRAW);
    bindStarAttribs();
    gl.bindVertexArray(null);

    applyQualityCounts();
  }

  function bakeSky() {
    if (!skyTex) {
      skyTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, skyTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);       // lon seam
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      skyFbo = gl.createFramebuffer();
    }
    gl.bindTexture(gl.TEXTURE_2D, skyTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, CFG.BAKE_W, CFG.BAKE_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, skyFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, skyTex, 0);
    gl.viewport(0, 0, CFG.BAKE_W, CFG.BAKE_H);
    gl.disable(gl.BLEND);
    gl.useProgram(progBake);
    gl.uniform3f(uBake.uGalN, GAL_N[0], GAL_N[1], GAL_N[2]);
    gl.uniform3f(uBake.uCoreDir, CORE_DIR[0], CORE_DIR[1], CORE_DIR[2]);
    gl.uniform3f(uBake.uNebDirA, NEB_A[0], NEB_A[1], NEB_A[2]);
    gl.uniform3f(uBake.uNebDirB, NEB_B[0], NEB_B[1], NEB_B[2]);
    gl.bindVertexArray(vaoFull);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function makeTarget(w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fbo, tex, w, h };
  }
  function dropTarget(t) {
    if (!t) return null;
    gl.deleteTexture(t.tex);
    gl.deleteFramebuffer(t.fbo);
    return null;
  }
  function allocTargets() {
    sceneT = dropTarget(sceneT); halfA = dropTarget(halfA); halfB = dropTarget(halfB);
    quartA = dropTarget(quartA); quartB = dropTarget(quartB);
    if (!caps.halfFloatRenderable) return;
    const w = canvas.width, h = canvas.height;
    const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
    const qw = Math.max(1, w >> 2), qh = Math.max(1, h >> 2);
    sceneT = makeTarget(w, h);
    halfA = makeTarget(hw, hh);
    halfB = makeTarget(hw, hh);
    quartA = makeTarget(qw, qh);
    quartB = makeTarget(qw, qh);
  }

  function layout() {
    DPR = Math.min(window.devicePixelRatio || 1, CFG.DPR_MAX);
    if (quality >= 1) DPR = 1;
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.max(1, Math.round(W * DPR));
    canvas.height = Math.max(1, Math.round(H * DPR));
    allocTargets();
  }

  function applyQualityCounts() {
    const f = quality >= 3 ? 0.4 : quality >= 2 ? 0.6 : 1;
    shellDrawCount = Math.round(shellCount * f);
    volDrawCount = Math.round(volCount * f);
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
  function spawnMeteor(now, viewBias) {
    if (meteors.length >= 4 || quality >= 3) return;
    // Spawn in front of the camera at mid distance, flying tangentially.
    const fx = -camMat[6], fy = -camMat[7], fz = -camMat[8];   // forward = -c2
    const rx = camMat[0], ry = camMat[1], rz = camMat[2];      // right = c0
    const ux = camMat[3], uy = camMat[4], uz = camMat[5];      // up = c1
    const dist = 280 + Math.random() * 380;
    const ox = (viewBias ? viewBias[0] : (Math.random() - 0.5) * 1.2);
    const oy = (viewBias ? viewBias[1] : (Math.random() - 0.2) * 0.9);
    const px = camS[0] + (fx + rx * ox + ux * oy) * dist;
    const py = camS[1] + (fy + ry * ox + uy * oy) * dist;
    const pz = camS[2] + (fz + rz * ox + uz * oy) * dist;
    // Velocity: mostly tangential (across the view), slight camera-ward pull.
    // Constrain the tangent near screen-horizontal so the streak crosses the
    // view legibly instead of exiting the 68° FOV in a blink.
    const ta = (Math.random() - 0.5) * 1.6 + (Math.random() < 0.5 ? 0 : Math.PI);
    const tvx = rx * Math.cos(ta) + ux * Math.sin(ta);
    const tvy = ry * Math.cos(ta) + uy * Math.sin(ta);
    const tvz = rz * Math.cos(ta) + uz * Math.sin(ta);
    const spd = 280 + Math.random() * 320;
    meteors.push({
      x: px, y: py, z: pz,
      vx: (tvx - fx * 0.25) * spd, vy: (tvy - fy * 0.25) * spd, vz: (tvz - fz * 0.25) * spd,
      bright: 0.7 + Math.random() * 1.0,
      mix: Math.random() < 0.3 ? 1 : 0,
      born: now, dies: now + 1900 + Math.random() * 1100, dead: 0,
    });
  }

  function spawnBeacon(now) {
    // A far, slow drifter — reads as a distant station catching sunlight.
    const d = randomDir(false);
    const axis = randomDir(false);
    beacon = { d, axis, w: 0.012 + Math.random() * 0.01, until: now + 60000 };
  }

  function rotateAround(v, axis, ang) {
    // Rodrigues, allocation-free into V3A.
    const c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
    const [x, y, z] = v, [ax, ay, az] = axis;
    const dot = ax * x + ay * y + az * z;
    V3A[0] = x * c + (ay * z - az * y) * s + ax * dot * t;
    V3A[1] = y * c + (az * x - ax * z) * s + ay * dot * t;
    V3A[2] = z * c + (ax * y - ay * x) * s + az * dot * t;
    return V3A;
  }

  function updateSky(now, dt, pulses) {
    if (now >= nextMeteorAt) {
      spawnMeteor(now);
      nextMeteorAt = now + CFG.METEOR_MIN_GAP + Math.random() * CFG.METEOR_RAND_GAP;
    }
    while (wishQueue.length && now >= wishQueue[0].at) {
      const w = wishQueue.shift();
      spawnMeteor(now, w.bias);
    }
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt;
      if (now > m.dies && !m.dead) m.dead = now;
      if (m.dead && now - m.dead > 650) meteors.splice(i, 1);
    }
    if (!beacon && now >= nextBeaconAt && quality < 3) {
      spawnBeacon(now);
    } else if (beacon && now > beacon.until) {
      beacon = null;
      nextBeaconAt = now + CFG.BEACON_MIN_GAP + Math.random() * CFG.BEACON_RAND_GAP;
    }
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      if (!seenPulses.has(p)) {
        seenPulses.add(p);
        // Wish meteor flies through the clicked direction a beat later.
        const bx = (p.x / W - 0.5) * 1.6;
        const by = (0.5 - p.y / H) * 1.0;
        wishQueue.push({ at: now + 260, bias: [bx, by] });
        lastPulseAt = now;
      }
      p.age += dt * 1000;
      if (p.age >= CFG.PULSE_LIFE) pulses.splice(i, 1);
    }
  }

  // --------------------------------------------------------------- Geometry
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  // World-relative-to-camera point -> screen px. Returns false if behind.
  function project(rx, ry, rz, tanHalf) {
    // view = camMatᵀ · rel  (columns of camMat are the camera axes)
    const vx = camMat[0] * rx + camMat[1] * ry + camMat[2] * rz;
    const vy = camMat[3] * rx + camMat[4] * ry + camMat[5] * rz;
    const vz = camMat[6] * rx + camMat[7] * ry + camMat[8] * rz;
    if (vz > -2) return false;
    const invZ = -1 / vz;
    const nx = (vx / (W / H)) * invZ / tanHalf;
    const ny = vy * invZ / tanHalf;
    PRJ[0] = (nx * 0.5 + 0.5) * W;
    PRJ[1] = (0.5 - ny * 0.5) * H;
    return true;
  }

  // Pooled constellation nodes.
  const NODE_POOL_MAX = 420;
  const lineNodes = new Array(NODE_POOL_MAX);
  for (let i = 0; i < NODE_POOL_MAX; i++) lineNodes[i] = { x: 0, y: 0, d: 0 };
  function buildConstellation(mouse, look, tanHalf, now) {
    if (!mouse.active || mouse.x == null || mouseStr < 0.02 || look.dragging) return 0;
    if (now - lastPulseAt < 600) return 0;       // let the shockwave own the moment
    let count = 0;
    for (let i = 0; i < brightSet.length && count < NODE_POOL_MAX; i++) {
      const b = brightSet[i];
      if (!project(b.x, b.y, b.z, tanHalf)) continue;
      const d = Math.hypot(PRJ[0] - mouse.x, PRJ[1] - mouse.y);
      if (d < CFG.LINE_REACH) {
        const n = lineNodes[count++];
        n.x = PRJ[0]; n.y = PRJ[1]; n.d = d;
      }
    }
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

  function buildStreaks(now, tanHalf) {
    let o = 0, quads = 0;
    for (const m of meteors) {
      if (quads >= MAX_STREAK_QUADS) break;
      const lifeIn = Math.min(1, (now - m.born) / 220);
      const fade = m.dead ? Math.max(0, 1 - (now - m.dead) / 650) : 1;
      const alpha = m.bright * lifeIn * fade * fade;
      if (alpha <= 0.01) continue;
      const trail = 0.22;                       // s of motion forming the tail
      if (!project(m.x - camS[0], m.y - camS[1], m.z - camS[2], tanHalf)) continue;
      const hx = PRJ[0], hy = PRJ[1];
      if (!project(m.x - m.vx * trail - camS[0], m.y - m.vy * trail - camS[1], m.z - m.vz * trail - camS[2], tanHalf)) continue;
      o = emitStreakQuad(streakVerts, o, hx, hy, PRJ[0], PRJ[1], 3.2, alpha, m.mix);
      quads++;
    }
    if (beacon) {
      // Slowly rotating far direction; rendered as a near-dot streak.
      const d = beacon.d;
      if (project(d[0] * CFG.R_FAR, d[1] * CFG.R_FAR, d[2] * CFG.R_FAR, tanHalf) && quads < MAX_STREAK_QUADS) {
        const glint = 0.18 + 0.90 * Math.pow(Math.max(0, Math.sin(now * 0.0011)), 16);
        o = emitStreakQuad(streakVerts, o, PRJ[0], PRJ[1], PRJ[0] + 2.5, PRJ[1] + 1.2, 1.4, glint, 0);
        quads++;
      }
    }
    return quads;
  }

  // ------------------------------------------------------------------ Frame
  // One separable blur step: src -> dst along (dx, dy) in dst texel units.
  function blurPass(src, dst, dx, dy) {
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    gl.viewport(0, 0, dst.w, dst.h);
    gl.uniform2f(uBlur.uDir, dx / dst.w, dy / dst.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function frame(tMs, mouse, pulses, look) {
    pulsesRef = pulses;
    if (contextLost) return;
    if (startMs < 0) { startMs = tMs; lastMs = tMs; }
    const now = tMs - startMs;
    const rawDt = Math.max((tMs - lastMs) / 1000, 0.008);   // for drag velocity
    const dt = Math.min((tMs - lastMs) / 1000, 0.05) || 0.016;
    lastMs = tMs;
    const uTime = (now / 1000) % 4096;

    // Opening choreography: exposure bloom + wide-angle settle + speed ramp.
    const exposure = Math.min(1, now / 1000 / CFG.EXPOSURE_S);
    const exp2 = exposure * exposure * (3 - 2 * exposure);
    const settle = easeOutCubic(Math.min(1, now / 1000 / CFG.SETTLE_S));
    const fovBase = CFG.FOV_SETTLE + (CFG.FOV_Y - CFG.FOV_SETTLE) * settle;
    // Telescope zoom: wheel / pinch drive a smoothed FOV scale.
    if (look.zoom !== 0) {
      fovTarget *= Math.exp(look.zoom * 0.0011);
      look.zoom = 0;
      lastInputAt = now;
    }
    if (look.pinch !== 1) {
      fovTarget /= look.pinch;
      look.pinch = 1;
      lastInputAt = now;
    }
    fovTarget = Math.max(CFG.ZOOM_MIN, Math.min(CFG.ZOOM_MAX, fovTarget));
    fovScale += (fovTarget - fovScale) * (1 - Math.exp(-dt * 8));
    const tanHalf = Math.tan(fovBase / 2) * fovScale;

    // --- Camera: drag (grab the sky) + fling inertia + idle auto-pan.
    // Sensitivity tracks zoom: telescope mode gets proportionally finer control.
    const sens = (look.pointerType === 'touch' ? CFG.DRAG_SENS_TOUCH : CFG.DRAG_SENS) * fovScale;
    if (look.dx !== 0 || look.dy !== 0) {
      yaw += look.dx * sens;
      pitch += look.dy * sens;
      // Release velocity: EMA over recent frames against the REAL frame gap
      // (clamped dt would 4x-overshoot on a rAF stall), capped to stay civil.
      const instY = look.dx * sens / rawDt;
      const instP = look.dy * sens / rawDt;
      yawVel += (instY - yawVel) * 0.45;
      pitchVel += (instP - pitchVel) * 0.45;
      const mag = Math.hypot(yawVel, pitchVel);
      if (mag > CFG.FLING_MAX) {
        const s = CFG.FLING_MAX / mag;
        yawVel *= s; pitchVel *= s;
      }
      look.dx = 0; look.dy = 0;
      lastInputAt = now;
    } else if (look.dragging) {
      // Holding still mid-drag: bleed velocity fast so release ≠ phantom fling.
      const hold = Math.exp(-14 * dt);
      yawVel *= hold; pitchVel *= hold;
    } else {
      yaw += yawVel * dt;
      pitch += pitchVel * dt;
      const damp = Math.exp(-CFG.FLING_DAMP * dt);
      yawVel *= damp; pitchVel *= damp;
    }
    if (look.dragging) lastInputAt = now;
    // Idle: slow pan so the sky is never frozen.
    if (now - lastInputAt > CFG.IDLE_AFTER) {
      const idleIn = Math.min(1, (now - lastInputAt - CFG.IDLE_AFTER) / 4000);
      yaw += CFG.IDLE_YAW_RATE * idleIn * dt;
      pitch += Math.cos(now * 0.00007) * 0.006 * idleIn * dt;
    }
    const pitchClamped = Math.max(-CFG.PITCH_MAX, Math.min(CFG.PITCH_MAX, pitch));
    if (pitchClamped !== pitch) pitchVel = 0;    // don't pin a fling at the pole
    pitch = pitchClamped;

    // Hover micro-look (desktop): the view leans gently toward the cursor.
    let hTargetY = 0, hTargetP = 0;
    if (mouse.active && mouse.x != null && !look.dragging) {
      hTargetY = ((mouse.x / W) - 0.5) * 2 * CFG.HOVER_LOOK;
      hTargetP = (0.5 - (mouse.y / H)) * 2 * CFG.HOVER_LOOK;
    }
    const hk = 1 - Math.exp(-dt * 3.2);
    hoverYaw += (hTargetY - hoverYaw) * hk;
    hoverPitch += (hTargetP - hoverPitch) * hk;

    const cy = Math.cos(yaw + hoverYaw), sy = Math.sin(yaw + hoverYaw);
    const cp = Math.cos(pitch + hoverPitch), sp = Math.sin(pitch + hoverPitch);
    // R = Ry(yaw)·Rx(pitch), column-major.
    camMat[0] = cy;       camMat[1] = 0;   camMat[2] = -sy;
    camMat[3] = sy * sp;  camMat[4] = cp;  camMat[5] = cy * sp;
    camMat[6] = sy * cp;  camMat[7] = -sp; camMat[8] = cy * cp;

    // --- Drift: constant world direction + breathing sway; wrap for precision.
    const speed = CFG.DRIFT_SPEED * settle;
    camPos[0] += driftDir[0] * speed * dt;
    camPos[1] += driftDir[1] * speed * dt;
    camPos[2] += driftDir[2] * speed * dt;
    const swx = Math.sin(now * 0.00011) * CFG.SWAY_AMP;
    const swy = Math.cos(now * 0.000073) * CFG.SWAY_AMP * 0.7;
    camS[0] = camPos[0] + swx;
    camS[1] = camPos[1] + swy;
    camS[2] = camPos[2];
    const cpx = (camS[0] % CFG.WRAP + CFG.WRAP) % CFG.WRAP;
    const cpy = (camS[1] % CFG.WRAP + CFG.WRAP) % CFG.WRAP;
    const cpz = (camS[2] % CFG.WRAP + CFG.WRAP) % CFG.WRAP;

    const strTarget = (mouse.active && mouse.x != null && !look.dragging) ? 1 : 0;
    mouseStr += (strTarget - mouseStr) * (1 - Math.exp(-dt * 4));

    updateSky(now, dt, pulses);

    const pulseCount = Math.min(pulses.length, CFG.MAX_PULSES);
    for (let i = 0; i < pulseCount; i++) {
      const p = pulses[i];
      const kk = Math.min(1, p.age / CFG.PULSE_LIFE);
      pulseUni[i * 4] = p.x;
      pulseUni[i * 4 + 1] = p.y;
      pulseUni[i * 4 + 2] = 8 + easeOutCubic(kk) * Math.min(CFG.PULSE_MAX_R, 0.42 * Math.min(W, H));
      pulseUni[i * 4 + 3] = 1.4 * (1 - kk);
    }

    // HDR path: render the scene into the FP16 target, glow + tonemap after.
    const bloomOn = !!sceneT && quality < 3;
    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomOn ? sceneT.fbo : null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    if (bloomOn) gl.clear(gl.COLOR_BUFFER_BIT);

    // 1 — sky sphere.
    gl.disable(gl.BLEND);
    gl.useProgram(progBg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, skyTex);
    gl.uniform1i(uBg.uTex, 0);
    gl.uniformMatrix3fv(uBg.uCam, false, camMat);
    gl.uniform1f(uBg.uTanHalf, tanHalf);
    gl.uniform1f(uBg.uAspect, W / H);
    gl.uniform1f(uBg.uExposure, exp2);
    gl.bindVertexArray(vaoFull);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    // 2 — stars: far shell, then volumetric fly-through tier.
    gl.useProgram(progStars);
    gl.uniformMatrix3fv(uStars.uCam, false, camMat);
    gl.uniform3f(uStars.uCamPos, cpx, cpy, cpz);
    gl.uniform2f(uStars.uRes, W, H);
    gl.uniform2f(uStars.uMouse, mouse.x == null ? -9999 : mouse.x, mouse.y == null ? -9999 : mouse.y);
    gl.uniform1f(uStars.uDpr, DPR);
    gl.uniform1f(uStars.uTime, uTime);
    gl.uniform1f(uStars.uTanHalf, tanHalf);
    gl.uniform1f(uStars.uAspect, W / H);
    gl.uniform1f(uStars.uMouseStr, mouseStr);
    gl.uniform1f(uStars.uMaxPt, maxPointSize);
    gl.uniform1f(uStars.uExposure, exp2);
    gl.uniform1f(uStars.uWrap, CFG.WRAP);
    gl.uniform1f(uStars.uD0, CFG.D0);
    gl.uniform1f(uStars.uVolGain, CFG.VOL_GAIN);
    gl.uniform1f(uStars.uNearClamp, CFG.NEAR_CLAMP);
    gl.uniform4fv(uStars.uPulse, pulseUni);
    gl.uniform1i(uStars.uPulseCount, pulseCount);
    gl.uniform1f(uStars.uShell, 1);
    gl.bindVertexArray(vaoShell);
    gl.drawArrays(gl.POINTS, 0, shellDrawCount);
    gl.uniform1f(uStars.uShell, 0);
    gl.bindVertexArray(vaoVol);
    gl.drawArrays(gl.POINTS, 0, volDrawCount);

    // 3 — constellation chart near the cursor.
    const lines = buildConstellation(mouse, look, tanHalf, now);
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

    // 4 — meteors + beacon.
    const quads = buildStreaks(now, tanHalf);
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
        const w = 10 + 18 * kk;
        gl.uniform2f(uRing.uCenter, pulseUni[i * 4], pulseUni[i * 4 + 1]);
        gl.uniform1f(uRing.uHalf, r + w * 4 + 40);
        gl.uniform1f(uRing.uR, r);
        gl.uniform1f(uRing.uW, w);
        gl.uniform1f(uRing.uK, kk);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
    }

    if (bloomOn) {
      // 6 — bloom chain: bright-extract at half res, blur half + quarter.
      gl.disable(gl.BLEND);
      gl.bindVertexArray(vaoFull);
      gl.useProgram(progBright);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sceneT.tex);
      gl.uniform1i(uBright.uTex, 0);
      gl.uniform1f(uBright.uThresh, CFG.BLOOM_THRESH);
      gl.uniform1f(uBright.uKnee, CFG.BLOOM_KNEE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, halfA.fbo);
      gl.viewport(0, 0, halfA.w, halfA.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.useProgram(progBlur);
      gl.uniform1i(uBlur.uTex, 0);
      blurPass(halfA, halfB, 1, 0);
      blurPass(halfB, halfA, 0, 1);
      const levelB = quality < 2 ? 1 : 0;
      if (levelB) {
        // Downsample blurred half into quarter (plain blit via blur dir 0).
        gl.bindTexture(gl.TEXTURE_2D, halfA.tex);
        gl.bindFramebuffer(gl.FRAMEBUFFER, quartA.fbo);
        gl.viewport(0, 0, quartA.w, quartA.h);
        gl.uniform2f(uBlur.uDir, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        blurPass(quartA, quartB, 1, 0);
        blurPass(quartB, quartA, 0, 1);
      }

      // 7 — composite: scene + bloom -> tonemap, vignette, grain, dither.
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(progComposite);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sceneT.tex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, halfA.tex);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, quartA.tex);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(uComposite.uScene, 0);
      gl.uniform1i(uComposite.uBloomA, 1);
      gl.uniform1i(uComposite.uBloomB, 2);
      gl.uniform2f(uComposite.uRes, W, H);
      gl.uniform1f(uComposite.uBloomStr, CFG.BLOOM_STR);
      gl.uniform1f(uComposite.uTonemapE, CFG.TONEMAP_E);
      gl.uniform1f(uComposite.uAspect, W / H);
      gl.uniform1f(uComposite.uTime, uTime);
      gl.uniform1f(uComposite.uGrainAmt, grainOn ? 0.030 : 0.0);
      gl.uniform1f(uComposite.uLevelB, levelB);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      // 6 — direct path (no FP16 / minimal quality): vignette, then grain.
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
    }
    gl.bindVertexArray(null);

    // Beacon precession (cheap, after draw).
    if (beacon) {
      const r = rotateAround(beacon.d, beacon.axis, beacon.w * dt);
      beacon.d[0] = r[0]; beacon.d[1] = r[1]; beacon.d[2] = r[2];
    }
  }

  // ------------------------------------------------------------ Public shell
  function resize() {
    if (contextLost) return;
    layout();                 // stars + bake are viewport-independent in v2
  }

  // One settled frame for prefers-reduced-motion: no loop, choreography done.
  const stillMouse = { x: null, y: null, vel: 0, active: false };
  const stillLook = { dx: 0, dy: 0, zoom: 0, pinch: 1, dragging: false, pointerType: 'mouse' };
  const stillPulses = [];
  function renderStill() {
    if (contextLost) return;
    // Synthetic timestamp, floored so startMs stays >= 0 — early in page life
    // performance.now() < 12000 would go negative and trip frame()'s
    // first-frame guard, resetting now to 0 (exposure 0 -> black frame).
    const t = Math.max(
      (typeof performance !== 'undefined' ? performance.now() : Date.now()),
      12001);
    startMs = t - 12000;          // 12s in: exposure, settle, drift ramp all done
    lastMs = t - 16;
    frame(t, stillMouse, stillPulses, stillLook);
  }

  function degrade() {
    if (contextLost || quality >= 3) return false;
    quality++;
    if (quality === 1) layout();
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
    sceneT = null; halfA = null; halfB = null; quartA = null; quartB = null;
    vaoShell = null; bufShell = null;
    vaoVol = null; bufVol = null;
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

  return { frame, resize, degrade, renderStill, caps };
}
