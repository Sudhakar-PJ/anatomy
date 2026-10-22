const D = __DATA__;
const root = document.querySelector(".arc");
const stage = root.querySelector(".arc-stage");
const front = stage.querySelector(".arc-front");
const engine = front.querySelector(".arc-engine");
const canvas = stage.querySelector(".arc-plasma-canvas");
const liveEl = root.querySelector("[data-live]");
const readout = root.querySelector("[data-readout]");
const runBtn = root.querySelector("[data-run]");
const apartBtn = root.querySelector("[data-apart]");
const xrayBtn = root.querySelector("[data-xray]");
const partBtns = [...root.querySelectorAll(".arc-part-btn")];
const coilPills = [...root.querySelectorAll(".arc-coil-pill")];
const powerSlider = root.querySelector(".arc-power-slider");
const telemPower = root.querySelector("[data-telem-power]");
const telemTemp = root.querySelector("[data-telem-temp]");
const telemField = root.querySelector("[data-telem-field]");
const telemDensity = root.querySelector("[data-telem-density]");
const telemEff = root.querySelector("[data-telem-eff]");
const still = matchMedia("(prefers-reduced-motion: reduce)");

const nodes = [...engine.querySelectorAll(".it")].map((el) => ({
  el,
  piece: el.dataset.piece,
  ride: el.dataset.ride || el.dataset.piece,
  role: el.dataset.role || null,
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

// Reactor State
let running = !still.matches;
let apart = false;
let xray = false;
let selected = null;
let powerGj = 3.0; // 0.5 to 5.0 GJ/s (Gigawatts)
let clock = 0;
let lastTime = 0;
let frame = 0;
let visible = false;
let plasmaPhase = 0;

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

function setApart(on) {
  apart = on;
  apartBtn.toggleAttribute("data-active", on);
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

function setXray(on) {
  xray = on;
  if (xrayBtn) xrayBtn.toggleAttribute("data-active", on);
  if (on) stage.setAttribute("data-xray", "");
  else stage.removeAttribute("data-xray");
}

function selectPart(id) {
  if (id === "stand") id = null;
  if (selected === id) id = null;
  selected = id;
  for (const node of nodes) {
    if (id !== null && node.piece === id) node.el.setAttribute("data-on", "");
    else node.el.removeAttribute("data-on");
  }
  if (id) stage.setAttribute("data-focus", "");
  else stage.removeAttribute("data-focus");
  partBtns.forEach((btn) => (btn.dataset.part === id ? btn.setAttribute("data-on", "") : btn.removeAttribute("data-on")));
  describe();
}

function updateCoilPills() {
  if (!running) {
    coilPills.forEach((p) => p.removeAttribute("data-active"));
    return;
  }
  // 10 Coils distributed at 36 deg intervals
  const activeCoilIdx = Math.floor((((plasmaPhase * 180) / Math.PI) % 360) / 36);
  coilPills.forEach((p, idx) => {
    if (idx === activeCoilIdx || (idx + 5) % 10 === activeCoilIdx) {
      p.setAttribute("data-active", "");
    } else {
      p.removeAttribute("data-active");
    }
  });
}

function place() {
  for (const node of nodes) {
    const share = piece[node.ride].x;
    let tx = (D.EX[0] * node.m[0] + D.EY[0] * node.m[1] + D.EZ[0] * node.m[2]) * share;
    let ty = (D.EX[1] * node.m[0] + D.EY[1] * node.m[1] + D.EZ[1] * node.m[2]) * share;

    const text = share === 0 ? "" : `translate(${tx.toFixed(2)} ${ty.toFixed(2)})`;
    if (text !== node.shown) {
      node.shown = text;
      if (text) node.el.setAttribute("transform", text);
      else node.el.removeAttribute("transform");
    }
  }

  // Dynamic depth re-sorting during explode transitions
  const next = nodes
    .map((_, index) => index)
    .sort((a, b) => nodes[a].key + nodes[a].lift * piece[nodes[a].ride].x - (nodes[b].key + nodes[b].lift * piece[nodes[b].ride].x));
  if (next.some((index, at) => index !== order[at])) {
    const frag = document.createDocumentFragment();
    for (const index of next) frag.appendChild(nodes[index].el);
    engine.appendChild(frag);
    order = next;
  }
}

function describe() {
  const power = running ? powerGj : 0;
  const tempMK = running ? (85 + powerGj * 14.5).toFixed(1) : 0;
  const fieldT = running ? (10.2 + powerGj * 1.5).toFixed(1) : 0;
  const density = running ? (1.4 + powerGj * 0.22).toFixed(2) : 0;
  const eff = running ? 89.4 : 0;

  if (telemPower) telemPower.textContent = `${power.toFixed(2)} GJ/s (${(power * 1000).toFixed(0)} MW)`;
  if (telemTemp) telemTemp.textContent = `${tempMK} × 10⁶ K`;
  if (telemField) telemField.textContent = `${fieldT} Tesla`;
  if (telemDensity) telemDensity.textContent = `${density} × 10²⁰ m⁻³`;
  if (telemEff) telemEff.textContent = `${eff.toFixed(1)}% Direct MHD`;

  const text = running
    ? `ACTIVE · ${power.toFixed(2)} GJ/s · ${tempMK}M K CORE · ${fieldT} T CONFINEMENT · MHD ${eff.toFixed(1)}%`
    : apart
    ? `EXPLODED · ${D.order.length} ASSEMBLIES · INSPECT CORE`
    : `STANDBY · PALLADIUM CORE COLD · PRESS IGNITE`;

  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuetext", text);
}

// WebGL Volumetric Plasma Torus, Magnetic Flux & Core Arc Shader
const FRAGMENT = `
uniform float uRunning;
uniform float uApart;
uniform float uPower;
uniform float uPhase;
uniform vec3 uCenter;
uniform float uMajorR;
uniform float uMinorR;

void main() {
  vec2 vb = viewOf(gl_FragCoord.xy);
  vec3 col = vec3(0.0);
  float totalAlpha = 0.0;

  if (uRunning > 0.05) {
    // 1. Central Core Arc Discharge & Laser Pre-Ionization
    vec2 pCore = project(uCenter);
    float dCore = length(vb - pCore) / uK;

    if (dCore < 18.0) {
      float arcPulse = smoothstep(18.0, 1.0, dCore);
      float arcNoise = fbm2(vb * 0.35 + vec2(uTime * 8.0, -uTime * 6.0));
      float intensity = arcPulse * (0.8 + 0.45 * arcNoise) * (uPower / 3.0);

      // Core electric arc: incandescent white core with electric cyan halo
      vec3 coreCol = mix(vec3(0.1, 0.75, 1.0), vec3(0.95, 0.98, 1.0), smoothstep(6.0, 0.0, dCore));
      col += coreCol * intensity * 2.2;
      totalAlpha = max(totalAlpha, intensity * 0.9);
    }

    // 2. Toroidal Plasma Confinement Ring (Sampled along 36 toroidal points)
    for (int i = 0; i < 20; i++) {
      float ang = float(i) * (6.283185 / 20.0);
      vec3 torusPt = uCenter + vec3(uMajorR * cos(ang), uMajorR * sin(ang), 0.0);
      vec2 pNode = project(torusPt);
      float dNode = length(vb - pNode) / uK;

      if (dNode < uMinorR * 2.2) {
        float shape = smoothstep(uMinorR * 2.2, 1.5, dNode);
        float wave = sin(ang * 4.0 - uPhase * 5.0);
        float plasmaGlow = shape * (0.7 + 0.35 * wave);

        vec3 plasmaCol = mix(vec3(0.02, 0.5, 0.95), vec3(0.85, 0.96, 1.0), smoothstep(uMinorR * 0.8, 0.0, dNode));
        col += plasmaCol * plasmaGlow * 1.5 * (uPower / 3.0);
        totalAlpha = max(totalAlpha, plasmaGlow * 0.85);
      }
    }

    // 3. 10 Toroidal Superconducting Coil Magnetic Pinch Nodes
    for (int j = 0; j < 10; j++) {
      float coilAng = float(j) * (6.283185 / 10.0);
      vec3 coilPt = uCenter + vec3(uMajorR * cos(coilAng), uMajorR * sin(coilAng), 0.0);
      vec2 pCoil = project(coilPt);
      float dCoil = length(vb - pCoil) / uK;

      if (dCoil < 9.0) {
        float pinch = smoothstep(9.0, 1.0, dCoil) * (0.6 + 0.4 * sin(coilAng * 2.0 - uPhase * 8.0));
        vec3 pinchCol = mix(vec3(0.1, 0.85, 1.0), vec3(1.0, 0.9, 0.5), smoothstep(4.0, 0.0, dCoil));
        col += pinchCol * pinch * 1.6;
        totalAlpha = max(totalAlpha, pinch * 0.7);
      }
    }
  }

  gl_FragColor = vec4(col, totalAlpha);
}
`;

const UNIFORMS = [
  "uRunning",
  "uApart",
  "uPower",
  "uPhase",
  "uCenter",
  "uMajorR",
  "uMinorR",
];

let glContext = null;
try {
  glContext = glLayer({
    canvas,
    fragment: FRAGMENT,
    view: [D.W, D.H],
    camera: D.camera,
    uniforms: UNIFORMS,
  });
} catch (e) {
  console.warn("WebGL initialization skipped:", e);
}

function tick(now) {
  const dt = lastTime ? Math.min((now - lastTime) / 1000, 1 / 30) : 1 / 60;
  lastTime = now;
  clock += dt;
  const calm = still.matches;

  // Relativistic plasma torus circulation
  if (running && !calm) {
    const circulationSpeed = (powerGj / 3.0) * 8.5;
    plasmaPhase = (plasmaPhase + circulationSpeed * dt) % (2 * Math.PI);
  }

  // Explode spring solver
  let moving = false;
  for (const id of IDS) {
    if (steerSpring(piece[id], dt, calm)) moving = true;
  }

  // Micro-scale quantum magnetic containment vibration
  const shake = running ? 0.2 + (powerGj / 5.0) * 0.25 : 0;
  stage.style.transform = shake > 0.01
    ? `translate(${(Math.sin(clock * 86) * shake * 0.4).toFixed(2)}px, ${(Math.cos(clock * 98) * shake * 0.3).toFixed(2)}px)`
    : "";

  // Update diagnostic coil indicators
  updateCoilPills();

  // Update piece positions
  place();

  // Render WebGL plasma torus and electric arc shader
  if (glContext && (running || moving)) {
    glContext.draw({
      uRunning: running ? 1.0 : 0.0,
      uApart: piece.bezel ? piece.bezel.x : 0,
      uPower: powerGj,
      uPhase: plasmaPhase,
      uCenter: D.reactorCenter,
      uMajorR: D.majorR,
      uMinorR: D.minorR,
    }, clock);
  }

  describe();

  const active = running || moving;
  frame = visible && active ? requestAnimationFrame(tick) : 0;
}

const run = () => {
  if (!frame && visible) {
    lastTime = 0;
    frame = requestAnimationFrame(tick);
  }
};

new IntersectionObserver((entries) => {
  visible = entries[entries.length - 1].isIntersecting;
  if (visible) run();
}, { rootMargin: "120px 0px" }).observe(stage);

function updateRunButton() {
  runBtn.toggleAttribute("data-active", running);
  const label = runBtn.querySelector("[data-run-label]");
  if (label) label.textContent = running ? "Standby" : "Ignite Arc";
}

// Control Buttons
runBtn.addEventListener("click", () => {
  running = !running;
  updateRunButton();
  run();
});

apartBtn.addEventListener("click", () => {
  setApart(!apart);
});

if (xrayBtn) {
  xrayBtn.addEventListener("click", () => {
    setXray(!xray);
  });
}

partBtns.forEach((btn) => {
  btn.addEventListener("click", () => selectPart(btn.dataset.part));
});

if (powerSlider) {
  powerSlider.addEventListener("input", (e) => {
    powerGj = Number(e.target.value);
    describe();
  });
}

// Keyboard Navigation
stage.addEventListener("keydown", (event) => {
  if (event.key === " " || event.key === "Spacebar") {
    event.preventDefault();
    running = !running;
    updateRunButton();
    run();
  } else if (event.key === "e" || event.key === "E") {
    event.preventDefault();
    setApart(!apart);
  } else if (event.key === "x" || event.key === "X") {
    event.preventDefault();
    setXray(!xray);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    powerGj = Math.min(5.0, powerGj + 0.25);
    if (powerSlider) powerSlider.value = powerGj;
    describe();
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    powerGj = Math.max(0.5, powerGj - 0.25);
    if (powerSlider) powerSlider.value = powerGj;
    describe();
  } else if (event.key === "Escape") {
    selectPart(null);
    if (apart) setApart(false);
    if (xray) setXray(false);
  }
});

updateRunButton();
updateCoilPills();
place();
describe();
if (visible) run();
