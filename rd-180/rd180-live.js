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
let touring = !still.matches;
let tourClock = -1;
let idleTimer = 0;
let visible = false;
let frame = 0;
let last = 0;
let jitter = [0, 0];

const VENT = 0.7;
const MAIN = 1.25;
const STEADY = 9;
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
    if (piece[id].target === goal) piece[id].pending = null;
    else piece[id].pending = { value: goal, at: clock + (still.matches ? 0 : index++ * SPRING.stagger) };
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

// Dual Plume WebGL Shader
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
const vec2 EXIT_A = vec2(${D.exitA[0].toFixed(1)}, ${D.exitA[1].toFixed(1)});
const vec2 EXIT_B = vec2(${D.exitB[0].toFixed(1)}, ${D.exitB[1].toFixed(1)});

float noise(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
float fbm(vec2 p){float v=0.;float a=.5;for(int i=0;i<3;i++){v+=a*noise(p);p*=2.02;a*=.5;}return v;}

vec4 inkOf(vec3 col){
  float a=clamp(max(col.r,max(col.g,col.b)),0.,1.);
  return vec4(col,a);
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

void main(){
  vec2 uv = gl_FragCoord.xy / vec2(${D.W.toFixed(1)}, ${D.H.toFixed(1)});
  vec2 pWorld = viewOf(gl_FragCoord.xy);
  
  // Dual chamber centers in screen space
  vec2 pA = pWorld - vec2(${D.screenExitA[0].toFixed(1)}, ${D.screenExitA[1].toFixed(1)});
  vec2 pB = pWorld - vec2(${D.screenExitB[0].toFixed(1)}, ${D.screenExitB[1].toFixed(1)});
  
  float dA = length(pA);
  float dB = length(pB);
  
  vec3 col = vec3(0.0);
  float pf = clamp(uPc, 0.0, 1.0);
  
  if (pf > 0.001 || uPre > 0.001) {
    // Jet core for Nozzle A
    float yA = pA.y;
    float xA = pA.x;
    if (yA > 0.0 && yA < uReach) {
      float wA = R0 * (0.8 + 0.3 * (yA / uReach));
      float rA = abs(xA) / wA;
      if (rA < 1.4) {
        float coreA = exp(-rA * rA * 3.0) * (1.0 - yA / uReach);
        // Supersonic kerosene-LOX rich flame: intense white-yellow core with golden amber edges
        vec3 flameA = mix(vec3(1.0, 0.95, 0.8), vec3(1.0, 0.55, 0.12), rA);
        // Shock diamonds
        float shockA = sin(yA * 0.18 - uTime * 35.0) * 0.5 + 0.5;
        col += flameA * coreA * (1.2 + 0.8 * shockA) * pf;
      }
    }
    
    // Jet core for Nozzle B
    float yB = pB.y;
    float xB = pB.x;
    if (yB > 0.0 && yB < uReach) {
      float wB = R0 * (0.8 + 0.3 * (yB / uReach));
      float rB = abs(xB) / wB;
      if (rB < 1.4) {
        float coreB = exp(-rB * rB * 3.0) * (1.0 - yB / uReach);
        vec3 flameB = mix(vec3(1.0, 0.95, 0.8), vec3(1.0, 0.55, 0.12), rB);
        float shockB = sin(yB * 0.18 - uTime * 35.0 + 1.2) * 0.5 + 0.5;
        col += flameB * coreB * (1.2 + 0.8 * shockB) * pf;
      }
    }
    
    // Deluge splash on the deck
    if (uSplash > 0.01) {
      float deckDistA = length(pA - vec2(0.0, PL));
      float deckDistB = length(pB - vec2(0.0, PL));
      float splashA = exp(-pow(deckDistA / 70.0, 1.8)) * uSplash;
      float splashB = exp(-pow(deckDistB / 70.0, 1.8)) * uSplash;
      vec3 splashCol = vec3(1.0, 0.65, 0.25);
      col += splashCol * (splashA + splashB) * 0.7;
    }
    
    // Flash & thermal illumination
    col += vec3(1.0, 0.8, 0.5) * uFlash * exp(-min(dA, dB) / 120.0);
  }
  
  gl_FragColor = inkOf(col);
}
`;

const layer = glLayer({
  canvas,
  fragment: PLUME,
  view: [D.W, D.H],
  camera: D.camera,
  uniforms: ["uJit", "uPc", "uHue", "uSmoke", "uVent", "uShockR", "uShockA", "uLight", "uGlow", "uPre", "uReach", "uSplash", "uFlash", "uRingR", "uRingA", "uPop", "uPopR"],
});
if (layer) stage.setAttribute("data-gl", "");
const LIGHT = document.body.dataset.theme === "light" || root.closest('[data-theme="light"]') ? 1 : 0;

let lastKey = "";
function paintPlume(values, active) {
  if (!layer) return;
  if (!active) {
    layer.clear();
    lastKey = "";
    return;
  }
  const time = still.matches ? 0.8 : clock;
  const key = still.matches ? JSON.stringify(values) : "";
  if (key && key === lastKey) return;
  lastKey = key;
  layer.draw(values, time);
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
  if (burn.on && burn.armed && IDS.every((id) => piece[id].x < 0.002 && !piece[id].pending)) {
    burn.armed = false;
    fireState("on");
    if (calm) burn.t = MAIN + 0.5;
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
    if (burn.tour) tourClock = 0;
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

function run() {
  if (frame) return;
  last = performance.now();
  frame = requestAnimationFrame(loop);
}

function loop(now) {
  frame = 0;
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  clock += dt;

  let moving = false;
  for (const id of IDS) {
    if (steerSpring(piece[id], dt, still.matches)) moving = true;
  }
  place();

  const burning = stepBurn(dt, still.matches);
  if (!burn.on && !moving) say(selected ? D.pieces[selected].say : apart ? "apart · 9 assemblies" : "5,480 kg · cold");

  if (moving || burning || burn.on) run();
}

// Event Listeners
stage.addEventListener("mouseenter", () => {
  inside = true;
  clearTimeout(leaveTimer);
  setApart(true);
});

stage.addEventListener("mouseleave", () => {
  inside = false;
  leaveTimer = setTimeout(() => {
    if (!burn.on) setApart(false);
  }, 400);
});

fireButton.addEventListener("click", () => {
  if (burn.on) shutdown();
  else ignite();
});

partButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const part = button.dataset.part;
    if (selected === part) select(null);
    else select(part);
  });
});

window.addEventListener("keydown", (e) => {
  if (e.key === "i" || e.key === "I") {
    if (burn.on) shutdown();
    else ignite();
  } else if (e.key === "Escape") {
    select(null);
    setApart(false);
  }
});

run();
