const D = __DATA__;
const root = document.querySelector(".gearbox");
const stage = root.querySelector(".gearbox-stage");
const front = stage.querySelector(".gearbox-front");
const engine = front.querySelector(".gearbox-engine");
const canvas = stage.querySelector(".gearbox-flow-canvas");
const liveEl = root.querySelector("[data-live]");
const readout = root.querySelector("[data-readout]");
const runBtn = root.querySelector("[data-run]");
const apartBtn = root.querySelector("[data-apart]");
const xrayBtn = root.querySelector("[data-xray]");
const clutchBtn = root.querySelector("[data-clutch]");
const partBtns = [...root.querySelectorAll(".gearbox-part-btn")];
const shiftBtns = [...root.querySelectorAll(".gearbox-shift-btn")];
const rpmSlider = root.querySelector(".gearbox-rpm-slider");
const spinDots = [...front.querySelectorAll(".gearbox-dot-spin")];
const telemGear = root.querySelector("[data-telem-gear]");
const telemInRpm = root.querySelector("[data-telem-inrpm]");
const telemOutRpm = root.querySelector("[data-telem-outrpm]");
const telemRatio = root.querySelector("[data-telem-ratio]");
const telemTorque = root.querySelector("[data-telem-torque]");
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

// Gearbox State
let running = !still.matches;
let apart = false;
let xray = false;
let selected = null;
let currentGear = "1"; // "N", "1", "2", "3", "4", "5", "R"
let clutchDisengaged = false; // true = pedal pressed (torque cut)
let clutchFriction = 1.0;     // smoothed 0.0 to 1.0
let inputRpm = 2400;          // engine RPM
let clock = 0;
let lastTime = 0;
let frame = 0;
let visible = false;

// Shaft Rotation Angles (radians)
let angleIn = 0;
let angleCounter = 0;
let angleOut = 0;
let angleGears = {
  1: 0,
  2: 0,
  3: 0,
  4: 0,
  5: 0,
  R: 0,
};

// Gearbox Gear Ratios & Properties
const GEAR_PROPS = {
  N: { ratio: 0, speed: 0, name: "Neutral", desc: "Output disengaged · freewheeling" },
  1: { ratio: 3.36, speed: 1 / 3.36, name: "1st Gear", desc: "3.36:1 · Maximum torque multiplication" },
  2: { ratio: 2.07, speed: 1 / 2.07, name: "2nd Gear", desc: "2.07:1 · Intermediate acceleration" },
  3: { ratio: 1.35, speed: 1 / 1.35, name: "3rd Gear", desc: "1.35:1 · Urban cruising & passing" },
  4: { ratio: 1.00, speed: 1.00, name: "4th Gear", desc: "1.00:1 · Direct Drive (1:1 lockup)" },
  5: { ratio: 0.75, speed: 1 / 0.75, name: "5th Gear", desc: "0.75:1 · Overdrive highway efficiency" },
  R: { ratio: -3.28, speed: -1 / 3.28, name: "Reverse", desc: "-3.28:1 · Reverse idler direction change" },
};

// Target and smoothed axial sleeve displacement (X coordinate in mm)
// Neutral positions:
// Sleeve 3-4 at X = -22 (moves to -27 for 4th, -17 for 3rd)
// Sleeve 1-2 at X = 22  (moves to 17 for 2nd, 27 for 1st)
// Sleeve 5-R at X = 58  (moves to 53 for R, 63 for 5th)
const sleevePos = {
  s34: { current: -22, target: -22 },
  s12: { current: 22, target: 22 },
  s5r: { current: 58, target: 58 },
};

function updateSleeveTargets(gear) {
  // Reset all to neutral
  sleevePos.s34.target = -22;
  sleevePos.s12.target = 22;
  sleevePos.s5r.target = 58;

  if (gear === "4") sleevePos.s34.target = -27; // 4th gear (direct drive forward)
  if (gear === "3") sleevePos.s34.target = -17; // 3rd gear (backward)
  if (gear === "2") sleevePos.s12.target = 17;  // 2nd gear (forward)
  if (gear === "1") sleevePos.s12.target = 27;  // 1st gear (backward)
  if (gear === "R") sleevePos.s5r.target = 53;  // Reverse (forward)
  if (gear === "5") sleevePos.s5r.target = 63;  // 5th gear (backward)
}

function setGear(gear) {
  currentGear = gear;
  updateSleeveTargets(gear);
  shiftBtns.forEach((btn) => {
    if (btn.dataset.gear === gear) btn.setAttribute("data-active", "");
    else btn.removeAttribute("data-active");
  });
  describe();
}

function setClutch(disengaged) {
  clutchDisengaged = disengaged;
  if (clutchBtn) {
    clutchBtn.toggleAttribute("data-clutch-active", disengaged);
    const label = clutchBtn.querySelector("[data-clutch-label]");
    if (label) label.textContent = disengaged ? "Clutch: Pressed" : "Clutch: Engaged";
  }
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

// Update Rotating Index Markers / Gears
function updateRotatingGears() {
  for (const dot of spinDots) {
    const role = dot.dataset.shaft;
    const r = Number(dot.dataset.r);
    const phase = Number(dot.dataset.phase);
    const center = D.shaftCenters[role];
    if (!center) continue;

    let ang = 0;
    if (role === "input") ang = angleIn + phase;
    else if (role === "counter") ang = angleCounter + phase;
    else if (role === "output") ang = angleOut + phase;
    else if (role === "gear1") ang = angleGears[1] + phase;
    else if (role === "gear2") ang = angleGears[2] + phase;
    else if (role === "gear3") ang = angleGears[3] + phase;
    else if (role === "gear5") ang = angleGears[5] + phase;
    else if (role === "gearR") ang = angleGears.R + phase;

    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    // In isometric projection on Y-Z plane perpendicular to X axis:
    const sx = center[0] + r * (cos * D.EY[0] + sin * D.EZ[0]);
    const sy = center[1] + r * (cos * D.EY[1] + sin * D.EZ[1]);
    dot.setAttribute("cx", sx.toFixed(1));
    dot.setAttribute("cy", sy.toFixed(1));
  }
}

function place() {
  for (const node of nodes) {
    const share = piece[node.ride].x;
    let tx = (D.EX[0] * node.m[0] + D.EY[0] * node.m[1] + D.EZ[0] * node.m[2]) * share;
    let ty = (D.EX[1] * node.m[0] + D.EY[1] * node.m[1] + D.EZ[1] * node.m[2]) * share;

    // Shift fork and sleeve axial sliding motion along X axis
    if (node.role === "sleeve-12" || node.role === "fork-12") {
      const dx = sleevePos.s12.current - 22;
      tx += dx * D.EX[0];
      ty += dx * D.EX[1];
    } else if (node.role === "sleeve-34" || node.role === "fork-34") {
      const dx = sleevePos.s34.current - (-22);
      tx += dx * D.EX[0];
      ty += dx * D.EX[1];
    } else if (node.role === "sleeve-5r" || node.role === "fork-5r") {
      const dx = sleevePos.s5r.current - 58;
      tx += dx * D.EX[0];
      ty += dx * D.EX[1];
    }

    const text = share === 0 && !node.role ? "" : `translate(${tx.toFixed(2)} ${ty.toFixed(2)})`;
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
  const p = GEAR_PROPS[currentGear];
  const outRpm = running ? Math.round(inputRpm * p.speed * clutchFriction) : 0;
  const torqueIn = 380; // N·m rated engine input torque
  const torqueOut = running && p.ratio !== 0
    ? Math.round(torqueIn * Math.abs(p.ratio) * 0.96 * clutchFriction)
    : 0;
  const kw = Math.round((Math.abs(torqueOut) * (Math.abs(outRpm) * 2 * Math.PI / 60)) / 1000);

  if (telemGear) telemGear.textContent = p.name;
  if (telemInRpm) telemInRpm.textContent = `${running ? Math.round(inputRpm * clutchFriction) : 0} RPM`;
  if (telemOutRpm) telemOutRpm.textContent = `${outRpm} RPM`;
  if (telemRatio) telemRatio.textContent = p.ratio !== 0 ? `${p.ratio.toFixed(2)}:1` : "N/A";
  if (telemTorque) telemTorque.textContent = `${torqueOut} N·m (${kw} kW)`;

  const text = running
    ? `${p.name.toUpperCase()} · ${p.ratio !== 0 ? p.ratio.toFixed(2) + ':1 · ' : ''}INPUT ${Math.round(inputRpm)} RPM → OUTPUT ${outRpm} RPM · ${torqueOut} N·m`
    : apart
    ? `EXPLODED · ${D.order.length} ASSEMBLIES · INSPECT GEARS`
    : `ASSEMBLED · STANDBY · PRESS MOTOR RUN`;

  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuetext", text);
}

// WebGL Mechanical Power / Torque Flow Shader
const FRAGMENT = `
uniform float uRunning;
uniform float uClutch;
uniform float uGearIndex; // 0: N, 1: 1st, 2: 2nd, 3: 3rd, 4: 4th, 5: 5th, 6: R
uniform vec3 uInputShaft[2];
uniform vec3 uCounterShaft[2];
uniform vec3 uMainShaft[2];
uniform vec3 uActiveGearMesh;

void main() {
  vec2 vb = viewOf(gl_FragCoord.xy);
  vec3 col = vec3(0.0);
  float totalAlpha = 0.0;

  if (uRunning > 0.05 && uClutch > 0.05) {
    // 1. Input Shaft Torque Stream
    vec2 pIn0 = project(uInputShaft[0]);
    vec2 pIn1 = project(uInputShaft[1]);
    vec2 dirIn = pIn1 - pIn0;
    float lenIn = length(dirIn);
    if (lenIn > 1.0) {
      vec2 u = dirIn / lenIn;
      vec2 rel = vb - pIn0;
      float along = dot(rel, u);
      float perp = length(rel - u * clamp(along, 0.0, lenIn)) / uK;
      if (perp < 8.0) {
        float flow = fract(along * 0.05 - uTime * 4.0);
        float pulse = smoothstep(8.0, 1.0, perp) * (0.6 + 0.4 * sin(flow * 6.283));
        vec3 c = mix(vec3(0.1, 0.6, 1.0), vec3(1.0, 0.6, 0.1), uClutch);
        col += c * pulse * 1.4;
        totalAlpha = max(totalAlpha, pulse * 0.75);
      }
    }

    // 2. Countershaft Torque Stream (active in 1st, 2nd, 3rd, 5th, Rev)
    if (uGearIndex > 0.5 && abs(uGearIndex - 4.0) > 0.1) {
      vec2 pC0 = project(uCounterShaft[0]);
      vec2 pC1 = project(uCounterShaft[1]);
      vec2 dirC = pC1 - pC0;
      float lenC = length(dirC);
      if (lenC > 1.0) {
        vec2 u = dirC / lenC;
        vec2 rel = vb - pC0;
        float along = dot(rel, u);
        float perp = length(rel - u * clamp(along, 0.0, lenC)) / uK;
        if (perp < 7.5) {
          float flow = fract(along * 0.05 - uTime * 3.5);
          float pulse = smoothstep(7.5, 1.0, perp) * (0.6 + 0.4 * sin(flow * 6.283));
          col += vec3(1.0, 0.45, 0.1) * pulse * 1.5;
          totalAlpha = max(totalAlpha, pulse * 0.75);
        }
      }
    }

    // 3. Active Gear Mesh Node
    if (uGearIndex > 0.5) {
      vec2 pMesh = project(uActiveGearMesh);
      float dMesh = length(vb - pMesh) / uK;
      if (dMesh < 16.0) {
        float pulse = smoothstep(16.0, 2.0, dMesh) * (0.7 + 0.3 * fbm2(vb * 0.2 + vec2(uTime * 2.0, 0.0)));
        vec3 cMesh = mix(vec3(1.0, 0.7, 0.2), vec3(1.0, 0.2, 0.05), smoothstep(4.0, 12.0, dMesh));
        col += cMesh * pulse * 1.8;
        totalAlpha = max(totalAlpha, pulse * 0.85);
      }
    }

    // 4. Output Mainshaft Torque Stream (active when in gear)
    if (uGearIndex > 0.5) {
      vec2 pOut0 = project(uMainShaft[0]);
      vec2 pOut1 = project(uMainShaft[1]);
      vec2 dirOut = pOut1 - pOut0;
      float lenOut = length(dirOut);
      if (lenOut > 1.0) {
        vec2 u = dirOut / lenOut;
        vec2 rel = vb - pOut0;
        float along = dot(rel, u);
        float perp = length(rel - u * clamp(along, 0.0, lenOut)) / uK;
        if (perp < 8.0) {
          float flow = fract(along * 0.05 - uTime * 4.5);
          float pulse = smoothstep(8.0, 1.0, perp) * (0.6 + 0.4 * sin(flow * 6.283));
          col += vec3(1.0, 0.3, 0.05) * pulse * 1.6;
          totalAlpha = max(totalAlpha, pulse * 0.8);
        }
      }
    }
  }

  gl_FragColor = vec4(col, totalAlpha);
}
`;

const UNIFORMS = [
  "uRunning",
  "uClutch",
  "uGearIndex",
  "uInputShaft",
  "uCounterShaft",
  "uMainShaft",
  "uActiveGearMesh",
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

const GEAR_INDICES = { N: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, R: 6 };

function getActiveMeshPoint(gear) {
  if (gear === "1") return D.meshPoints[1];
  if (gear === "2") return D.meshPoints[2];
  if (gear === "3") return D.meshPoints[3];
  if (gear === "4") return D.meshPoints[4]; // direct drive input clutch point
  if (gear === "5") return D.meshPoints[5];
  if (gear === "R") return D.meshPoints.R;
  return [0, 0, 0];
}

function tick(now) {
  const dt = lastTime ? Math.min((now - lastTime) / 1000, 1 / 30) : 1 / 60;
  lastTime = now;
  clock += dt;
  const calm = still.matches;

  // Smooth clutch engagement transition
  const clutchTarget = clutchDisengaged ? 0.0 : 1.0;
  clutchFriction += (clutchTarget - clutchFriction) * Math.min(1.0, dt * 12.0);

  // Smooth synchronizer sleeve slide transition
  for (const s of Object.values(sleevePos)) {
    s.current += (s.target - s.current) * Math.min(1.0, dt * 18.0);
  }

  // Gearbox Kinematics & Rotation Integration
  if (running && !calm) {
    const visualRadPerSec = (inputRpm / 60) * (2 * Math.PI) * 0.05 * clutchFriction;
    angleIn += visualRadPerSec * dt;

    // Countershaft turns at constant ratio driven by input pinion
    const counterRatio = 11.0 / 15.0; // 0.733
    angleCounter -= visualRadPerSec * counterRatio * dt;

    // Freewheeling speed gears on mainshaft
    angleGears[1] += visualRadPerSec * counterRatio * (6.0 / 20.0) * dt;
    angleGears[2] += visualRadPerSec * counterRatio * (8.5 / 17.5) * dt;
    angleGears[3] += visualRadPerSec * counterRatio * (11.5 / 14.5) * dt;
    angleGears[4] = angleIn;
    angleGears[5] += visualRadPerSec * counterRatio * (15.0 / 11.0) * dt;
    angleGears.R -= visualRadPerSec * counterRatio * (6.5 / 18.5) * dt;

    // Output shaft follows engaged gear
    const p = GEAR_PROPS[currentGear];
    if (p.speed !== 0) {
      angleOut += visualRadPerSec * p.speed * dt;
    }
  }

  // Explode spring solver
  let moving = false;
  for (const id of IDS) {
    if (steerSpring(piece[id], dt, calm)) moving = true;
  }

  // Engine dyno vibration
  const shake = running ? 0.15 + (inputRpm / 6000) * 0.2 : 0;
  stage.style.transform = shake > 0.01
    ? `translate(${(Math.sin(clock * 74) * shake * 0.4).toFixed(2)}px, ${(Math.cos(clock * 88) * shake * 0.3).toFixed(2)}px)`
    : "";

  // Update rotating tooth dots on all gears
  updateRotatingGears();

  // Update axial sleeve positions and explode
  place();

  // Render WebGL torque flow shader
  if (glContext && (running || moving)) {
    glContext.draw({
      uRunning: running ? 1.0 : 0.0,
      uClutch: clutchFriction,
      uGearIndex: GEAR_INDICES[currentGear] || 0,
      uInputShaft: D.torqueRoutes.input,
      uCounterShaft: D.torqueRoutes.counter,
      uMainShaft: D.torqueRoutes.output,
      uActiveGearMesh: getActiveMeshPoint(currentGear),
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
  if (label) label.textContent = running ? "Pause Motor" : "Run Motor";
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

if (clutchBtn) {
  clutchBtn.addEventListener("click", () => {
    setClutch(!clutchDisengaged);
  });
}

partBtns.forEach((btn) => {
  btn.addEventListener("click", () => selectPart(btn.dataset.part));
});

shiftBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    setGear(btn.dataset.gear);
  });
});

if (rpmSlider) {
  rpmSlider.addEventListener("input", (e) => {
    inputRpm = Number(e.target.value);
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
  } else if (event.key === "c" || event.key === "C") {
    event.preventDefault();
    setClutch(!clutchDisengaged);
  } else if (event.key === "e" || event.key === "E") {
    event.preventDefault();
    setApart(!apart);
  } else if (event.key === "x" || event.key === "X") {
    event.preventDefault();
    setXray(!xray);
  } else if (["1", "2", "3", "4", "5"].includes(event.key)) {
    event.preventDefault();
    setGear(event.key);
  } else if (event.key === "r" || event.key === "R") {
    event.preventDefault();
    setGear("R");
  } else if (event.key === "n" || event.key === "N") {
    event.preventDefault();
    setGear("N");
  } else if (event.key === "Escape") {
    selectPart(null);
    if (apart) setApart(false);
    if (xray) setXray(false);
  }
});

updateRunButton();
setGear(currentGear);
updateRotatingGears();
place();
describe();
if (visible) run();
