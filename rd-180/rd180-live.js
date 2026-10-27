const D = __DATA__;
const root = document.querySelector(".rd");
const stage = root.querySelector(".rd-stage");
const front = stage.querySelector(".rd-front");
const engine = front.querySelector(".rd-engine");
const canvas = stage.querySelector(".rd-plume");
const veilCanvas = stage.querySelector(".rd-veil");
const glowGroup = stage.querySelector(".rd-glow-g");
const flashVeil = stage.querySelector(".rd-flash");
const live = root.querySelector("[data-live]");
const readout = root.querySelector("[data-readout]");
const fireButton = root.querySelector("[data-fire]");
const fireLabel = root.querySelector("[data-fire-label]");
const partButtons = [...root.querySelectorAll(".rd-part")];
const still = matchMedia("(prefers-reduced-motion: reduce)");

const nodes = [...engine.querySelectorAll(".it")].map((el) => ({
  el,
  piece: el.dataset.piece,
  ride: el.dataset.ride || el.dataset.piece,
  key: Number(el.dataset.k),
  m: el.dataset.m.split(",").map(Number),
  index: Number(el.dataset.i),
  shown: "",
}));
for (const node of nodes) node.lift = node.m[0] * D.V[0] + node.m[1] * D.V[1] + node.m[2] * D.V[2];
let order = nodes.map((_, index) => index);

const IDS = Object.keys(D.pieces);
const STAGGER = D.stagger;
const SPRING = D.spring;
const piece = Object.fromEntries(IDS.map((id) => [id, { x: 0, v: 0, target: 0, pending: null }]));
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const fmt = (value) => Math.round(value).toLocaleString("en-US");

let clock = 0;
let apart = false;
let selected = null;
let inside = false;
let leaveTimer = 0;
let visible = false;
let frame = 0;
let last = 0;
let jitter = [0, 0];

const VENT = 0.25;
const MAIN = 0.55;
const STEADY = 15;
const PREBURNER_PC = 0.14;
const LONGEST = D.plumeLength + 60;

const glide = () => ({ x: 0, v: 0 });
const burn = {
  on: false,
  armed: false,
  tour: false,
  t: -1,
  stopAt: Infinity,
  stopping: -1,
  pc: 0,
  pcRate: 0,
  hue: glide(),
  glowStop: null,
  lastGlow: 0,
  popped: false,
  phase: "",
  pre: glide(),
  vent: glide(),
  smoke: glide(),
  reach: glide(),
  splash: glide(),
  mainAt: -99,
  popAt: -99,
};

function say(text) {
  if (readout.textContent !== text) readout.textContent = text;
}

function idleText() {
  if (selected) return D.pieces[selected].say;
  let moving = false;
  for (const id of IDS) {
    if (Math.abs(piece[id].target - piece[id].x) > 0.01 || piece[id].pending) moving = true;
  }
  if (moving) return apart ? "taking apart" : "closing up";
  return apart ? "apart · 9 assemblies" : "5,480 kg · cold";
}

function describe() {
  const text = selected ? D.pieces[selected].say : burn.on ? "firing · 390 tf" : apart ? "apart · 9 assemblies" : "5,480 kg · cold";
  if (stage.getAttribute("aria-valuetext") !== text) stage.setAttribute("aria-valuetext", text);
}

function setApart(on) {
  if (apart === on) return;
  apart = on;
  const goal = on ? 1 : 0;
  let index = 0;
  for (const id of on ? STAGGER : [...STAGGER].reverse()) {
    if (!piece[id]) continue;
    if (piece[id].target === goal && !piece[id].pending) continue;
    piece[id].pending = { value: goal, at: clock + (still.matches ? 0 : index++ * SPRING.stagger) };
  }
  describe();
  run();
}

function select(id) {
  if (id === "stand") id = null;
  if (selected === id) return;
  selected = id;
  for (const node of nodes) {
    if (id !== null && node.piece === id) node.el.setAttribute("data-on", "");
    else node.el.removeAttribute("data-on");
  }
  if (id) stage.setAttribute("data-focus", "");
  else stage.removeAttribute("data-focus");
  partButtons.forEach((button) => (button.dataset.part === id ? button.setAttribute("data-on", "") : button.removeAttribute("data-on")));
  stage.setAttribute("aria-valuenow", String(id ? D.order.indexOf(id) + 1 : 0));
  describe();
}

function steerSpring(state, dt, calm) {
  if (state.pending && clock >= state.pending.at) {
    state.target = state.pending.value;
    state.pending = null;
  }
  if (calm) {
    state.x = state.target;
    state.v = 0;
    return false;
  }
  for (let index = 0; index < SPRING.substeps; index++) {
    const h = dt / SPRING.substeps;
    state.v += ((state.target - state.x) * SPRING.stiffness - state.v * SPRING.damping) * h;
    state.x += state.v * h;
  }
  if (Math.abs(state.target - state.x) < 2e-4 && Math.abs(state.v) < 2e-4) {
    state.x = state.target;
    state.v = 0;
    return state.pending !== null;
  }
  return true;
}

function place() {
  for (const node of nodes) {
    const share = piece[node.ride].x;
    const tx = (D.EX[0] * node.m[0] + D.EY[0] * node.m[1] + D.EZ[0] * node.m[2]) * share;
    const ty = (D.EX[1] * node.m[0] + D.EY[1] * node.m[1] + D.EZ[1] * node.m[2]) * share;
    const text = share === 0 ? "" : `translate(${tx.toFixed(2)} ${ty.toFixed(2)})`;
    if (text !== node.shown) {
      node.shown = text;
      if (text) node.el.setAttribute("transform", text);
      else node.el.removeAttribute("transform");
    }
  }
  const next = nodes.map((_, index) => index).sort((a, b) => nodes[a].key + nodes[a].lift * piece[nodes[a].ride].x - (nodes[b].key + nodes[b].lift * piece[nodes[b].ride].x));
  if (next.some((index, at) => index !== order[at])) {
    const fragment = document.createDocumentFragment();
    for (const index of next) fragment.appendChild(nodes[index].el);
    engine.appendChild(fragment);
    order = next;
  }
  const moved = Math.abs(jitter[0]) > 0.005 || Math.abs(jitter[1]) > 0.005;
  const shift = moved ? `translate(${jitter[0].toFixed(2)} ${jitter[1].toFixed(2)})` : "";
  engine.setAttribute("transform", shift);
  if (glowGroup) glowGroup.setAttribute("transform", shift);
}

// ----------------------------------------------------
// Dual Plume Volumetric WebGL Shader
// ----------------------------------------------------
const COMMON = `
uniform vec2 uJit;
uniform float uPc;
uniform float uHue;
uniform float uSmoke;
uniform float uVent;
uniform float uShockR;
uniform float uShockA;
uniform float uLight;
const float ZE = ${D.zExit.toFixed(1)};
const float R0 = ${D.exitR.toFixed(1)};
const float PL = ${D.plumeLength.toFixed(1)};
const float CHA = ${D.chamberAX.toFixed(1)};
const float CHB = ${D.chamberBX.toFixed(1)};
const vec2 COL0 = vec2(${D.columns[0][0].toFixed(1)}, ${D.columns[0][1].toFixed(1)});
const vec2 COL1 = vec2(${D.columns[1][0].toFixed(1)}, ${D.columns[1][1].toFixed(1)});
const float COLH = ${D.columnHalf.toFixed(1)};
const float COLTOP = ${D.columnTop.toFixed(1)};

float groundCone(float r) {
  if (r > 48.0) return 0.0;
  if (r > 38.0) return mix(0.0, 8.0, (48.0 - r) / 10.0);
  if (r > 26.0) return mix(8.0, 18.0, (38.0 - r) / 12.0);
  if (r > 12.0) return mix(18.0, 28.0, (26.0 - r) / 14.0);
  return mix(28.0, 32.0, (12.0 - r) / 12.0);
}
float ground(vec2 p) {
  float rA = length(p - vec2(CHA, 0.0));
  float rB = length(p - vec2(CHB, 0.0));
  return max(groundCone(rA), groundCone(rB));
}
bool solid(vec3 p) { return p.z < ground(p.xy); }
float ringField(vec3 p) {
  float dA = length(vec2(length(p.xy - vec2(CHA, 0.0)) - 48.0, p.z - 6.0)) - 2.5;
  float dB = length(vec2(length(p.xy - vec2(CHB, 0.0)) - 48.0, p.z - 6.0)) - 2.5;
  return min(dA, dB);
}
vec2 groundHit(vec3 o, vec3 V) {
  float tf = -o.z / V.z;
  float best = tf;
  float rA = length(o.xy - vec2(CHA, 0.0));
  float rB = length(o.xy - vec2(CHB, 0.0));
  if (min(rA, rB) < 56.0) {
    float ta = (36.0 - o.z) / V.z;
    float prev = ta;
    for (int i = 1; i <= 28; i++) {
      float t = mix(ta, tf, float(i) / 28.0);
      if (solid(o + t * V)) {
        float lo = t; float hi = prev;
        for (int j = 0; j < 7; j++) {
          float m = (lo + hi) * 0.5;
          if (solid(o + m * V)) lo = m; else hi = m;
        }
        best = hi;
        break;
      }
      prev = t;
    }
  }
  float t6 = (6.0 - o.z) / V.z;
  vec3 p6 = o + t6 * V;
  float p6rA = abs(length(p6.xy - vec2(CHA, 0.0)) - 48.0);
  float p6rB = abs(length(p6.xy - vec2(CHB, 0.0)) - 48.0);
  if (min(p6rA, p6rB) < 12.0) {
    float t = (9.0 - o.z) / V.z;
    for (int i = 0; i < 14; i++) {
      float d = ringField(o + t * V);
      if (d < 0.02) break;
      t -= d;
    }
    if (ringField(o + t * V) < 0.06 && t > best) return vec2(t, 1.0);
  }
  return vec2(best, 0.0);
}
float columnNear(vec3 o, vec3 V, vec2 c) {
  vec3 lo = vec3(c - COLH, 0.0);
  vec3 hi = vec3(c + COLH, COLTOP);
  vec3 a = (lo - o) / V;
  vec3 b = (hi - o) / V;
  vec3 mn = min(a, b);
  vec3 mx = max(a, b);
  float tIn = max(mn.x, max(mn.y, mn.z));
  float tOut = min(mx.x, min(mx.y, mx.z));
  return tOut > tIn ? tOut : -1e9;
}
float columnsNear(vec3 o, vec3 V) {
  return max(columnNear(o, V, COL0), columnNear(o, V, COL1));
}
float engineR(float z) {
  float s = z - ZE;
  float b = 30.0 + 16.0 * (1.0 - pow(clamp(s, 0.0, 110.0) / 110.0, 1.6)) + 2.0;
  return mix(b, 46.0, smoothstep(90.0, 120.0, s)) * smoothstep(-6.0, 0.0, s) * (1.0 - smoothstep(300.0, 320.0, s));
}
float inFrontChamber(vec3 p, vec3 V, float cx) {
  vec2 h = V.xy;
  float hl = length(h);
  vec2 pRel = p.xy - vec2(cx, 0.0);
  float tau = -dot(pRel, h) / (hl * hl);
  float d = length(pRel + tau * h);
  float re = engineR(p.z + tau * V.z);
  float inside = 1.0 - smoothstep(re - 3.0, re + 3.0, d);
  float surface = tau * hl + sqrt(max(re * re - d * d, 0.0));
  return inside * smoothstep(0.0, 5.0, -surface);
}
float inFront(vec3 p, vec3 V) {
  return max(inFrontChamber(p, V, CHA), inFrontChamber(p, V, CHB));
}
float side(float front, float veil) { return mix(1.0 - front, front, veil); }
float beyond(float t0, float tc, float sigma) { return 1.0 / (1.0 + exp(clamp(2.41 * (t0 - tc) / sigma, -30.0, 30.0))); }

vec3 steamOf(vec3 g0, vec3 V, float tA, float u, float z0, float pf, float T, float veil) {
  if (uSmoke < 0.0004 && uVent < 0.0004) return vec3(0.0);
  float sE = uCam.z;
  float Hs = 70.0 + 60.0 * uSmoke;
  vec3 start = g0 + tA * V;
  float steam = 0.0;
  float vapour = 0.0;
  for (int i = 0; i < 6; i++) {
    float w = (float(i) + 0.5) / 6.0;
    vec3 p = start + (-Hs * log(w) / sE) * V;
    float rA = length(p.xy - vec2(CHA, 0.0));
    float rB = length(p.xy - vec2(CHB, 0.0));
    float r = min(rA, rB);
    float lay = side(inFront(p, V), veil);
    float box = 1.0 - smoothstep(140.0, 195.0, max(abs(p.x), abs(p.y)));
    steam += box * (0.4 + 0.6 * exp(-pow((r - 70.0) / 75.0, 2.0))) * (1.0 - smoothstep(160.0, 310.0, p.z)) * lay;
    vapour += exp(-pow(r / 85.0, 2.0)) * (1.0 - smoothstep(35.0, 130.0, p.z)) * lay;
  }
  float layer = exp(-max(start.z, 0.0) / Hs) / 6.0;
  float b1 = fbm2(vec2(u * 0.018 + T * 0.03, z0 * 0.016 - T * 0.26 + 7.0));
  float b2 = fbm2(vec2(u * 0.045 - T * 0.05, z0 * 0.04 - T * 0.5 + 2.0));
  vec3 lit = mix(vec3(0.3, 0.3, 0.33), vec3(0.85, 0.52, 0.22), pf * exp(-max(z0, 0.0) / 140.0));
  return lit * (b1 * 0.75 + b2 * 0.4) * smoothstep(0.05, 0.6, b1) * steam * layer * uSmoke * 1.1 + vec3(0.42, 0.48, 0.55) * (b2 * 0.6 + 0.4) * vapour * layer * uVent * 0.5;
}

float shellOf(float dist, float tc, float tAir, float rs, float w, vec3 e0, vec3 V, float veil) {
  if (rs < 0.5) return 0.0;
  float m = sqrt(max(rs * rs - dist * dist, 0.0));
  float edge = exp(-pow(max(dist - rs, 0.0) / w, 2.0));
  float limb = rs * w / sqrt(m * m + 2.0 * rs * w) / sqrt(rs * w * 0.5);
  limb *= limb;
  float soft = w * 2.0 + 2.0;
  float far = tc - m;
  float near = tc + m;
  float aFar = smoothstep(tAir - soft * 0.5, tAir + soft, far) * side(inFront(e0 + far * V, V), veil);
  float aNear = smoothstep(tAir - soft * 0.5, tAir + soft, near) * side(inFront(e0 + near * V, V), veil);
  return edge * limb * (aFar + aNear) * 0.5;
}
vec3 shockOf(float dist, float tc, float tAir, vec3 e0, vec3 V, float veil) {
  if (uShockA < 0.0004) return vec3(0.0);
  float rs = uShockR;
  float sw = 1.8 + max(rs - 26.0, 0.0) * 0.01;
  float lead = shellOf(dist, tc, tAir, rs, sw, e0, V, veil);
  float trail = shellOf(dist, tc, tAir, max(rs - sw * 2.6, 0.0), sw * 2.2, e0, V, veil) * 0.3;
  return vec3(1.0, 0.88, 0.68) * (lead + trail) * 0.45 * uShockA * (1.0 - smoothstep(180.0, 280.0, rs));
}

vec4 inkOf(vec3 col) {
  col = tonemap(col, 1.15);
  float m = max(col.r, max(col.g, col.b));
  float n = (hash12(gl_FragCoord.xy + fract(uTime * 0.61) * 91.0) + hash12(gl_FragCoord.yx * 1.37 + fract(uTime * 0.37) * 57.0) - 1.0) / 255.0;
  col = max(col + n * smoothstep(0.0, 1.5 / 255.0, m), 0.0);
  m = max(col.r, max(col.g, col.b));
  vec3 ink = col / max(m, 1e-5) * vec3(0.65, 0.35, 0.25);
  vec4 light = vec4(ink * m * 0.92, m * 0.92);
  return mix(vec4(col, m), light, uLight);
}

struct Scene {
  vec3 V;
  vec3 g0;
  vec3 e0;
  vec3 hit;
  float tLow;
  float ring;
  float tCol;
  float tAir;
  float tAirE;
  float tLowE;
  float u;
  float z0;
  float s0;
  float dist;
  float tc;
};

Scene sceneOf(vec2 vb) {
  Scene S;
  S.V = towardViewer();
  float sE = uCam.z;
  S.g0 = rayOf(vb);
  vec2 gh = groundHit(S.g0, S.V);
  S.tLow = gh.x;
  S.ring = gh.y;
  S.tCol = columnsNear(S.g0, S.V);
  S.tAir = max(S.tLow, S.tCol);
  S.hit = S.g0 + S.tLow * S.V;
  S.e0 = rayOf(vb - uJit);
  S.u = (vb.x - uJit.x - uOrigin.x) / uK;
  S.z0 = S.e0.z;
  S.s0 = ZE - S.z0;
  S.tLowE = S.tLow + (S.g0.z - S.e0.z) / sE;
  S.tAirE = S.tAir + (S.g0.z - S.e0.z) / sE;
  
  vec3 CA = vec3(CHA, 0.0, ZE - 6.0);
  vec3 CB = vec3(CHB, 0.0, ZE - 6.0);
  float tcA = dot(CA - S.e0, S.V);
  float distA = length(S.e0 + tcA * S.V - CA);
  float tcB = dot(CB - S.e0, S.V);
  float distB = length(S.e0 + tcB * S.V - CB);
  if (distA < distB) {
    S.dist = distA;
    S.tc = tcA;
  } else {
    S.dist = distB;
    S.tc = tcB;
  }
  return S;
}
`;

const PLUME = `${COMMON}
uniform float uGlow;
uniform float uPre;
uniform float uReach;
uniform float uSplash;
uniform float uFlash;
uniform float uRingR;
uniform float uRingA;
uniform float uPop;
uniform float uPopR;

float onDeck(vec2 p) {
  return (1.0 - smoothstep(145.0, 165.0, abs(p.x))) * (1.0 - smoothstep(105.0, 125.0, abs(p.y)));
}

float radiusAt(float s, float pf, float warm) {
  float spread = 0.045 + 0.09 * (1.0 - pf);
  return R0 * (1.0 - 0.07 * pf * smoothstep(0.0, 40.0, s) - 0.35 * warm * smoothstep(0.0, 80.0, s)) + spread * max(s, 0.0);
}

void main() {
  vec2 vb = viewOf(gl_FragCoord.xy);
  Scene S = sceneOf(vb);
  vec3 V = S.V;
  float sE = uCam.z;
  float cE = uCam.w;
  float tanE = sE / cE;
  float T = uTime;
  float pc = clamp(uPc, 0.0, 1.0);
  float pf = pc;
  float warm = 1.0 - clamp(uHue, 0.0, 1.0);
  float glow = uGlow;
  float dith = hash12(gl_FragCoord.xy);
  vec3 col = vec3(0.0);
  vec3 g0 = S.g0;
  vec3 e0 = S.e0;
  float u = S.u;
  float z0 = S.z0;
  float s0 = S.s0;
  vec3 hit = S.hit;
  
  float tongue = fbm2(vec2(u * 0.07, s0 * 0.06 - T * 8.0));
  float reach = uReach * (1.0 + (tongue - 0.5) * 0.45 * warm);
  float rag = 1.0 + 1.4 * warm;
  float lam = 28.0 + 7.0 * pf;
  float v0 = 18.0 + 6.0 * pf;
  float cellOn = smoothstep(0.35, 0.92, pf);
  
  if (glow > 0.0004 || uVent > 0.0004) {
    float streak = 0.86 + 0.28 * fbm2(vec2(u * 0.2, s0 * 0.012 - T * 9.0));
    float flick = (0.94 + 0.06 * sin(T * 97.0 + s0 * 0.23)) * (1.0 + uPre * warm * (tongue - 0.45) * 0.9);
    float mist = fbm2(vec2(u * 0.035 + 0.4 * T, s0 * 0.022 - T * 0.7));
    
    float halfChord = 95.0 / cE;
    float ta = max(S.tAirE, -halfChord);
    float tb = min((ZE + 4.0 - z0) / sE, halfChord);
    float dt = max(tb - ta, 0.0) / 28.0;
    
    vec3 sum = vec3(0.0);
    vec3 cold = vec3(0.0);
    
    for (int i = 0; i < 28; i++) {
      float t = ta + (float(i) + dith) * dt;
      vec3 p = e0 + t * V;
      float s = ZE - p.z;
      float keep = smoothstep(-1.0, 3.5, s) * (1.0 - smoothstep(reach - 45.0, reach, s));
      
      vec2 pA = p.xy - vec2(CHA, 0.0);
      vec2 pB = p.xy - vec2(CHB, 0.0);
      float rA = length(pA);
      float rB = length(pB);
      
      float Rv = radiusAt(s, pf, warm);
      float eA = fbm2(vec2(pA.x * 0.07 + 7.0, s * 0.035 - T * 4.6));
      float eB = fbm2(vec2(pB.x * 0.07 + 19.0, s * 0.035 - T * 4.6 + 1.4));
      float ReA = Rv * (1.0 + (eA - 0.5) * 0.4 * rag * smoothstep(4.0, 100.0, s));
      float ReB = Rv * (1.0 + (eB - 0.5) * 0.4 * rag * smoothstep(4.0, 100.0, s));
      float rnA = rA / ReA;
      float rnB = rB / ReB;
      
      vec3 amberEdge = mix(vec3(1.0, 0.42, 0.08), vec3(1.0, 0.65, 0.22), tongue);
      vec3 goldBody = mix(vec3(1.0, 0.82, 0.42), vec3(1.0, 0.94, 0.72), pf);
      vec3 hypergolic = vec3(0.25, 0.95, 0.45);
      vec3 bodyCol = mix(goldBody, hypergolic, uPre * (1.0 - pf) * 0.75);
      
      float fillA = smoothstep(1.08, 0.68, rnA);
      float wBody = dt * cE / (Rv * 1.8);
      sum += bodyCol * fillA * wBody * (0.28 + 0.32 * exp(-max(s, 0.0) / 95.0)) * streak * flick * keep * 1.8;
      sum += amberEdge * exp(-rnA * rnA * 2.2) * (dt * cE / (Rv * 1.2)) * 0.25 * keep;
      float rcA = Rv * 0.32;
      sum += vec3(1.0, 0.96, 0.82) * exp(-(rA * rA) / (rcA * rcA)) * (dt * cE / (rcA * 1.77)) * 0.45 * keep;
      float swA = ReA * 0.24;
      float shellA = exp(-pow((rA - ReA * 0.88) / swA, 2.0)) * smoothstep(6.0, 140.0, s) * (dt * cE / (swA * 3.5));
      sum += vec3(1.0, 0.45, 0.12) * shellA * 1.1 * (0.4 + 1.2 * eA) * keep;
      
      float fillB = smoothstep(1.08, 0.68, rnB);
      sum += bodyCol * fillB * wBody * (0.28 + 0.32 * exp(-max(s, 0.0) / 95.0)) * streak * flick * keep * 1.8;
      sum += amberEdge * exp(-rnB * rnB * 2.2) * (dt * cE / (Rv * 1.2)) * 0.25 * keep;
      float rcB = Rv * 0.32;
      sum += vec3(1.0, 0.96, 0.82) * exp(-(rB * rB) / (rcB * rcB)) * (dt * cE / (rcB * 1.77)) * 0.45 * keep;
      float swB = ReB * 0.24;
      float shellB = exp(-pow((rB - ReB * 0.88) / swB, 2.0)) * smoothstep(6.0, 140.0, s) * (dt * cE / (swB * 3.5));
      sum += vec3(1.0, 0.45, 0.12) * shellB * 1.1 * (0.4 + 1.2 * eB) * keep;

      sum += vec3(1.0, 0.82, 0.52) * smoothstep(PL - 25.0, PL + 4.0, s) * (fillA + fillB) * wBody * 0.9 * keep;
      
      for (int c = 0; c < 4; c++) {
        float fc = float(c);
        float vc = v0 + fc * lam + sin(T * 43.0 + fc * 2.3) * 0.6;
        float Rc = R0 * (1.0 - 0.07 * pf) + (0.04 + 0.08 * (1.0 - pf)) * vc;
        float amp = exp(-fc * 0.28) * cellOn * (1.0 - smoothstep(reach - 60.0, reach - 10.0, vc)) * (1.0 - smoothstep(PL - 22.0, PL + 5.0, vc)) * keep;
        float rm = Rc * 0.32;
        float ph = (s - vc) / (lam * 0.62);
        float taper = rm * (1.06 - clamp(ph, 0.0, 1.0) * 0.8) + 0.6;
        
        float beadA = exp(-pow(rA / taper, 2.0) * 2.0) * exp(-max(ph, 0.0) * 2.2) * smoothstep(-0.16, 0.02, ph) * (1.0 - smoothstep(0.7, 1.0, ph));
        sum += vec3(1.0, 0.98, 0.9) * beadA * (dt * cE / (taper * 1.25)) * 2.6 * amp;
        float dA = rA / (Rc * 0.9) + abs(s - vc + lam * 0.08) / (lam * 0.5);
        sum += vec3(1.0, 0.65, 0.25) * pow(clamp(1.0 - dA, 0.0, 1.0), 2.2) * (dt * cE / (Rc * 0.9 * 0.62)) * 1.2 * amp;

        float beadB = exp(-pow(rB / taper, 2.0) * 2.0) * exp(-max(ph, 0.0) * 2.2) * smoothstep(-0.16, 0.02, ph) * (1.0 - smoothstep(0.7, 1.0, ph));
        sum += vec3(1.0, 0.98, 0.9) * beadB * (dt * cE / (taper * 1.25)) * 2.6 * amp;
        float dB = rB / (Rc * 0.9) + abs(s - vc + lam * 0.08) / (lam * 0.5);
        sum += vec3(1.0, 0.65, 0.25) * pow(clamp(1.0 - dB, 0.0, 1.0), 2.2) * (dt * cE / (Rc * 0.9 * 0.62)) * 1.2 * amp;
      }
      
      float sigma = R0 * (0.85 + max(s, 0.0) * 0.012);
      float coldA = exp(-(rA * rA) / (sigma * sigma));
      float coldB = exp(-(rB * rB) / (sigma * sigma));
      cold += vec3(0.5, 0.58, 0.68) * (coldA + coldB) * (dt * cE / (sigma * 1.77)) * smoothstep(0.0, 16.0, s) * (1.0 - smoothstep(45.0, 160.0, s)) * keep;
    }
    col += sum * glow;
    col += cold * mist * uVent * 0.65;
  }

  float uA = u - CHA;
  float uB = u - CHB;

  if (glow > 0.0004) {
    float sh = radiusAt(clamp(s0, 0.0, PL), pf, warm) * 2.2;
    float span = 2.6 * sh / cE;
    float h0 = max(S.tAirE, -span);
    float dh = max(span - h0, 0.0) / 8.0;
    float haloA = 0.0;
    float haloB = 0.0;
    for (int i = 0; i < 8; i++) {
      float t = h0 + (float(i) + dith) * dh;
      float z = z0 + t * sE;
      float rrA = uA * uA + t * t * cE * cE;
      float rrB = uB * uB + t * t * cE * cE;
      float zh = exp(-max(ZE - z, 0.0) / 220.0) * smoothstep(0.0, 30.0, z) * smoothstep(ZE + 25.0, ZE - 15.0, z);
      haloA += exp(-rrA / (sh * sh)) * zh;
      haloB += exp(-rrB / (sh * sh)) * zh;
    }
    col += mix(vec3(1.0, 0.55, 0.15), vec3(1.0, 0.75, 0.3), warm) * (haloA + haloB) * (dh * cE / (sh * 1.77)) * 0.18 * glow;
  }

  for (int c = 0; c < 4; c++) {
    float fc = float(c);
    float vc = v0 + fc * lam + sin(T * 47.0 + fc * 2.3) * 0.6;
    float Rc = R0 * (1.0 - 0.07 * pf) + (0.045 + 0.08 * (1.0 - pf)) * vc;
    float amp = exp(-fc * 0.28) * cellOn * (1.0 - smoothstep(reach - 65.0, reach - 10.0, vc)) * (1.0 - smoothstep(PL - 20.0, PL + 5.0, vc));
    float rm = Rc * 0.33;
    float qA = length(vec2(uA / rm, (s0 - vc) / (rm * tanE + 1.2)));
    float qB = length(vec2(uB / rm, (s0 - vc) / (rm * tanE + 1.2)));
    col += vec3(1.0, 0.98, 0.92) * (exp(-qA * qA * 2.4) + exp(-qB * qB * 2.4)) * 2.6 * amp * glow;
  }
  
  float dist = S.dist;
  col += vec3(1.0, 0.86, 0.65) * uFlash * (exp(-pow(dist / 130.0, 2.0)) * 0.38 * beyond(S.tAirE, S.tc, 130.0) + exp(-dist / 32.0) * 1.6 * beyond(S.tAirE, S.tc, 32.0));
  col += shockOf(dist, S.tc, S.tAirE, e0, V, 0.0);
  
  float floorSeen = S.tCol > S.tLow ? 0.0 : 1.0;
  float deck = onDeck(hit.xy) * floorSeen;
  float splash = uSplash * pf;
  
  if (splash > 0.0004 || uRingA > 0.0004) {
    vec2 pA = hit.xy - vec2(CHA, 0.0);
    vec2 pB = hit.xy - vec2(CHB, 0.0);
    float rhoA = length(pA);
    float rhoB = length(pB);
    float rho = min(rhoA, rhoB);
    vec2 dirH = (rhoA < rhoB ? pA : pB) / max(rho, 1e-3);
    
    float flow = fbm3(vec3(dirH * 2.4, rho * 0.035 - T * 3.8));
    float flow2 = noise3(vec3(dirH * 5.1 + 9.0, rho * 0.07 - T * 6.1));
    float reachS = 54.0 + 90.0 * splash;
    float sheet = exp(-pow(rho / reachS, 1.5)) * deck;
    vec3 hot = mix(vec3(1.0, 0.42, 0.12), vec3(1.0, 0.85, 0.55), exp(-rho / 28.0));
    col += hot * sheet * (0.28 + 0.58 * flow + 0.24 * flow2) * splash * 0.82;
    col += vec3(1.0, 0.92, 0.75) * exp(-pow(rho / 38.0, 2.0)) * splash * 0.95 * floorSeen;
    
    float dust = noise3(vec3(dirH * 7.0, rho * 0.05));
    float gw = 4.5 + uRingR * 0.034;
    float ringWellA = exp(-pow((rhoA - 48.0) / gw, 2.0));
    float ringWellB = exp(-pow((rhoB - 48.0) / gw, 2.0));
    col += vec3(1.0, 0.82, 0.58) * (ringWellA + ringWellB) * (0.45 + dust) * deck * 0.65 * (splash + uRingA);
    
    if (splash > 0.0004) {
      float tS = (70.0 - g0.z) / sE;
      float dS = max(tS - S.tAir, 0.0) / 10.0;
      float curtain = 0.0;
      for (int i = 0; i < 10; i++) {
        vec3 p = g0 + (S.tAir + (float(i) + dith) * dS) * V;
        float rA = length(p.xy - vec2(CHA, 0.0));
        float rB = length(p.xy - vec2(CHB, 0.0));
        float r = min(rA, rB);
        float h = max(p.z - ground(p.xy), 0.0);
        curtain += exp(-pow((r - reachS * 0.8) / (reachS * 0.35), 2.0)) * exp(-h / 28.0) * onDeck(p.xy) * dS * sE / 28.0;
      }
      float lick = fbm2(vec2(u * 0.05 + T * 0.3, z0 * 0.06 - T * 1.4));
      col += vec3(1.0, 0.52, 0.18) * curtain * lick * 0.6 * splash;
    }
  }
  
  col += steamOf(g0, V, S.tAir, u, z0, pf, T, 0.0);
  
  if (uPop > 0.0004) {
    vec3 CpA = vec3(CHA, 0.0, ZE - uPopR * 0.55);
    vec3 CpB = vec3(CHB, 0.0, ZE - uPopR * 0.55);
    float tpA = dot(CpA - e0, V);
    float tpB = dot(CpB - e0, V);
    float pdA = length(e0 + tpA * V - CpA);
    float pdB = length(e0 + tpB * V - CpB);
    float pd = min(pdA, pdB);
    float tp = pdA < pdB ? tpA : tpB;
    float pn = fbm2(vec2(u * 0.045, s0 * 0.045 - T * 2.4));
    col += vec3(1.0, 0.48, 0.16) * exp(-pow(pd / uPopR, 2.0)) * (0.55 + 0.7 * pn) * smoothstep(ZE + 24.0, ZE - 12.0, z0) * beyond(S.tAirE, tp, uPopR) * uPop * 0.95;
  }
  
  gl_FragColor = inkOf(col);
}
`;

const VEIL = `${COMMON}
void main() {
  vec2 vb = viewOf(gl_FragCoord.xy);
  Scene S = sceneOf(vb);
  float pf = clamp(uPc, 0.0, 1.0);
  vec3 col = steamOf(S.g0, S.V, S.tAir, S.u, S.z0, pf, uTime, 1.0);
  col += shockOf(S.dist, S.tc, S.tAirE, S.e0, S.V, 1.0);
  gl_FragColor = inkOf(col);
}
`;

const SHARED = ["uJit", "uPc", "uHue", "uSmoke", "uVent", "uShockR", "uShockA", "uLight"];
const layer = glLayer({
  canvas,
  fragment: PLUME,
  view: [D.W, D.H],
  camera: D.camera,
  uniforms: [...SHARED, "uGlow", "uPre", "uReach", "uSplash", "uFlash", "uRingR", "uRingA", "uPop", "uPopR"],
});

const veil = layer && veilCanvas
  ? glLayer({
      canvas: veilCanvas,
      fragment: VEIL,
      view: [D.W, D.H],
      camera: D.camera,
      uniforms: SHARED,
    })
  : null;

if (layer) stage.setAttribute("data-gl", "");
const LIGHT = document.body.dataset.theme === "light" || root.closest('[data-theme="light"]') ? 1 : 0;

let lastKey = "";
function paintPlume(values, active) {
  if (!layer) return;
  if (!active) {
    layer.clear();
    if (veil) veil.clear();
    lastKey = "";
    return;
  }
  const time = still.matches ? 0.8 : clock;
  const key = still.matches ? JSON.stringify(values) : "";
  if (key && key === lastKey) return;
  lastKey = key;
  layer.draw(values, time);
  if (veil) veil.draw(values, time);
}

function announce(phase) {
  if (burn.phase === phase) return;
  burn.phase = phase;
  if (live) live.textContent = phase;
}

function fireState(state) {
  if (state) fireButton.dataset.state = state;
  else delete fireButton.dataset.state;
}

function ignite(fromTour = false) {
  if (burn.on) return;
  setApart(false);
  select(null);
  burn.on = true;
  describe();
  burn.armed = true;
  burn.armedAt = clock;
  burn.tour = fromTour;
  burn.t = 0;
  burn.stopping = -1;
  burn.glowStop = null;
  burn.popped = false;
  burn.stopAt = fromTour ? MAIN + 4.2 : MAIN + STEADY;
  fireState("armed");
  fireLabel.textContent = "Shut down";
  run();
}

function shutdown() {
  if (!burn.on || burn.stopping >= 0) return;
  burn.stopping = burn.t;
}

function pcTarget() {
  if (!burn.on || burn.armed || burn.stopping >= 0) return 0;
  if (burn.t >= MAIN) return 1;
  if (burn.t >= VENT) return PREBURNER_PC;
  return 0;
}

function stepBurn(dt, calm) {
  if (burn.on && burn.armed) {
    if (IDS.every((id) => piece[id].x < 0.05 && !piece[id].pending) || clock - burn.armedAt > 0.25) {
      burn.armed = false;
      fireState("on");
      if (calm) burn.t = MAIN + 0.5;
    }
  }
  const before = burn.t;
  if (burn.on && !burn.armed) burn.t += dt;
  const t = burn.t;
  if (burn.on && burn.stopping < 0 && t >= burn.stopAt) burn.stopping = t;
  const lit = burn.on && !burn.armed && burn.stopping < 0;
  if (lit && t >= MAIN && before < MAIN && !calm) burn.mainAt = clock;
  const target = pcTarget();
  if (calm) {
    burn.pc = target;
    burn.pcRate = 0;
  } else {
    const falling = burn.stopping >= 0;
    const stiff = falling ? 16 : target > PREBURNER_PC ? 20 : 64;
    const drag = falling ? 8.2 : 2 * Math.sqrt(stiff);
    for (let index = 0; index < 4; index++) {
      const h = dt / 4;
      burn.pcRate += ((target - burn.pc) * stiff - burn.pcRate * drag) * h;
      burn.pc = clamp(burn.pc + burn.pcRate * h, 0, 1);
    }
  }
  settle(burn.hue, lit && burn.pc > 0.2 ? 1 : 0, dt, lit ? 0.32 : 0.5, calm);
  const onset = smooth(0, 0.1, burn.pc);
  let glow = onset * (1.15 - 0.15 * burn.hue.x);
  if (!burn.on) glow = 0;
  burn.lastGlow = glow;
  settle(burn.pre, lit && t > VENT && t < MAIN + 0.1 ? 1 : 0, dt, lit && t < MAIN ? 0.06 : 0.12, calm);
  settle(burn.vent, lit && t < MAIN ? 1 : 0, dt, lit && t < MAIN ? 0.16 : 0.24, calm);
  settle(burn.reach, 80 * smooth(0, 0.12, burn.pc) + (LONGEST - 80) * smooth(0.16, 0.75, burn.pc), dt, burn.stopping >= 0 ? 0.12 : 0.07, calm);
  settle(burn.splash, smooth(0.35, 0.9, burn.pc) * smooth(D.plumeLength - 10, D.plumeLength + 40, burn.reach.x), dt, 0.16, calm);
  settle(burn.smoke, lit && t > MAIN + 0.4 ? 1 : 0, dt, lit ? 0.9 : 1.8, calm);
  if (burn.on && burn.stopping >= 0 && burn.pc < 0.2 && !burn.popped && !calm) {
    burn.popAt = clock;
    burn.popped = true;
  }
  if (burn.on && burn.stopping >= 0 && burn.pc < 0.003 && Math.abs(burn.pcRate) < 0.01 && t - burn.stopping > 0.9) {
    burn.on = false;
    burn.t = -1;
    burn.pc = 0;
    burn.pcRate = 0;
    burn.glowStop = null;
    fireState("");
    fireLabel.textContent = "Ignite";
    announce("cold");
    describe();
  }

  const sinceMain = clock - burn.mainAt;
  const sincePop = burn.popAt >= 0 ? clock - burn.popAt : -1;
  const flash = calm ? 0 : burst(sinceMain, 0.08, 0.13);
  const shockA = calm ? 0 : burst(sinceMain, 0.05, 0.12);
  const ringA = calm ? 0 : burst(sinceMain - 0.08, 0.08, 0.16);
  const pop = calm || sincePop < 0 ? 0 : burst(sincePop, 0.09, 0.2);
  const shake = calm ? 0 : 3.8 * burst(sinceMain, 0.05, 0.12);
  const hum = calm ? 0 : 0.4 * burn.pc * smooth(0.02, 0.12, burn.pc);
  jitter = [Math.sin(clock * 89) * hum + Math.sin(clock * 51) * shake, Math.cos(clock * 73) * hum * 0.7 + Math.cos(clock * 59) * shake];

  const values = {
    uJit: jitter,
    uPc: burn.pc,
    uHue: burn.hue.x,
    uGlow: glow,
    uLight: LIGHT,
    uPre: burn.pre.x,
    uVent: burn.vent.x,
    uSmoke: burn.smoke.x,
    uReach: burn.reach.x,
    uSplash: burn.splash.x,
    uFlash: flash,
    uShockR: 26 + 900 * Math.max(0, sinceMain),
    uShockA: shockA,
    uRingR: 600 * Math.max(0, sinceMain - 0.08),
    uRingA: ringA,
    uPop: pop,
    uPopR: 24 + 70 * (1 - Math.exp(-Math.max(0, sincePop) / 0.25)),
  };
  const active = burn.pc > 1e-3 || burn.pre.x > 1e-3 || burn.vent.x > 1e-3 || burn.smoke.x > 1e-3 || flash > 1e-3 || shockA > 1e-3 || ringA > 1e-3 || pop > 1e-3 || (sinceMain > 0 && sinceMain < 0.6);
  paintPlume(values, active);

  const rim = clamp(burn.pc * 0.88 + burn.pre.x * 0.45 * smooth(0, 0.05, burn.pc) + flash * 0.6 + pop * 0.7, 0, 1);
  stage.style.setProperty("--rim", rim.toFixed(3));
  stage.style.setProperty("--deck-glow", clamp(burn.pc * 0.9 * burn.splash.x + flash * 0.5 + burn.pre.x * 0.12 * smooth(0, 0.05, burn.pc) + pop * 0.25, 0, 1).toFixed(3));
  if (flashVeil) flashVeil.style.opacity = (flash * 0.32).toFixed(3);
  stage.style.transform = shake > 0.01 ? `translate(${(Math.sin(clock * 47) * shake * 0.5).toFixed(2)}px, ${(Math.cos(clock * 59) * shake * 0.5).toFixed(2)}px)` : "";

  if (burn.on) {
    const bar = fmt(burn.pc * D.chamberBar);
    const thrust = fmt(Math.max(0, D.vacuumTf * burn.pc - D.backTf));
    if (burn.armed) {
      say("closing up · arming");
      announce("arming");
    } else if (burn.stopping >= 0) {
      say(burn.pc > 0.01 ? `shutdown · ${bar} bar` : "shutdown · purging");
      announce("shutdown");
    } else if (t < VENT) {
      say("chill-down · LOX venting");
      announce("chill-down, LOX venting");
    } else if (t < MAIN) {
      say(`preburner lit · TEA-TEB · ${bar} bar`);
      announce("preburner lit");
    } else {
      say(`Pc ${bar} bar · ${thrust} tf · dual chambers`);
      announce("main stage");
    }
  }
  return burn.on || active;
}

function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  clock += dt;
  const calm = still.matches;
  let moving = false;
  for (const id of IDS) if (steerSpring(piece[id], dt, calm)) moving = true;
  const burning = stepBurn(dt, calm);
  place();
  if (!burn.on) say(idleText());
  frame = (moving || burning || burn.on) ? requestAnimationFrame(tick) : 0;
}

function run() {
  if (!frame) {
    last = 0;
    frame = requestAnimationFrame(tick);
  }
}

new IntersectionObserver(
  (entries) => {
    visible = entries[entries.length - 1].isIntersecting;
    if (visible) run();
  },
  { rootMargin: "120px 0px" },
).observe(stage);

function pieceAt(event) {
  const hit = document.elementFromPoint(event.clientX, event.clientY);
  const item = hit && hit.closest ? hit.closest(".it") : null;
  return item ? item.dataset.piece : null;
}

stage.addEventListener("pointermove", (event) => {
  if (event.pointerType === "touch") return;
  inside = true;
  clearTimeout(leaveTimer);
  if (burn.on) return;
  setApart(true);
  select(pieceAt(event));
  run();
});

stage.addEventListener("pointerleave", () => {
  inside = false;
  clearTimeout(leaveTimer);
  leaveTimer = setTimeout(() => {
    if (inside) return;
    select(null);
    setApart(false);
  }, 260);
});

stage.addEventListener("pointerdown", (event) => {
  if (event.pointerType !== "touch" || burn.on) return;
  const id = pieceAt(event);
  if (!id || id === "stand") {
    select(null);
    setApart(!apart);
  } else {
    setApart(true);
    select(id);
  }
  run();
});

let lastFireClick = 0;
fireButton.addEventListener("click", () => {
  const now = performance.now();
  if (now - lastFireClick < 400) return;
  lastFireClick = now;
  if (burn.on) shutdown();
  else ignite(false);
  run();
});

partButtons.forEach((button) => {
  const show = () => {
    if (burn.on) return;
    clearTimeout(leaveTimer);
    setApart(true);
    select(button.dataset.part);
    run();
  };
  const hide = () => {
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => {
      if (inside || partButtons.some((other) => other.matches(":hover, :focus-visible"))) return;
      select(null);
      setApart(false);
    }, 260);
  };
  button.addEventListener("pointerenter", show);
  button.addEventListener("focus", show);
  button.addEventListener("pointerleave", hide);
  button.addEventListener("blur", hide);
  button.addEventListener("click", show);
});

stage.addEventListener("keydown", (event) => {
  const index = selected ? D.order.indexOf(selected) : -1;
  let next = null;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") next = Math.min(D.order.length - 1, index + 1);
  else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = Math.max(0, index - 1);
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = D.order.length - 1;
  else if (event.key === "Escape") {
    event.preventDefault();
    if (burn.on) shutdown();
    select(null);
    setApart(false);
    run();
    return;
  } else if (event.key === "i" || event.key === "I" || event.key === "Enter") {
    event.preventDefault();
    if (burn.on) shutdown();
    else ignite(false);
    run();
    return;
  } else if (event.key === " ") {
    event.preventDefault();
    if (!burn.on) setApart(!apart);
    if (!apart) select(null);
    run();
    return;
  }
  if (next === null || burn.on) return;
  event.preventDefault();
  setApart(true);
  select(D.order[next]);
  run();
});

window.addEventListener("keydown", (event) => {
  if (event.target && event.target.matches && event.target.matches("input, textarea")) return;
  if (event.key === "i" || event.key === "I") {
    if (burn.on) shutdown();
    else ignite(false);
    run();
  } else if (event.key === "Escape") {
    if (burn.on) shutdown();
    select(null);
    setApart(false);
    run();
  }
});

window.addEventListener("resize", () => {
  lastKey = "";
  run();
});

place();
say(idleText());
run();
