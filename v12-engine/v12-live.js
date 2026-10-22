const D = __DATA__;
const root = document.querySelector(".v12");
const stage = root.querySelector(".v12-stage");
const front = stage.querySelector(".v12-front");
const engine = front.querySelector(".v12-engine");
const canvas = stage.querySelector(".v12-gas-canvas");
const liveEl = root.querySelector("[data-live]");
const readout = root.querySelector("[data-readout]");
const runBtn = root.querySelector("[data-run]");
const apartBtn = root.querySelector("[data-apart]");
const xrayBtn = root.querySelector("[data-xray]");
const partBtns = [...root.querySelectorAll(".v12-part-btn")];
const cylPills = [...root.querySelectorAll(".v12-cyl-pill")];
const flowBtns = [...root.querySelectorAll(".v12-flow-btn")];
const scrubSlider = root.querySelector(".v12-scrub-slider");
const beltEl = front.querySelector(".v12-belt");
const spinDots = [...front.querySelectorAll(".v12-dot-spin")];
const still = matchMedia("(prefers-reduced-motion: reduce)");

const nodes = [...engine.querySelectorAll(".it")].map((el) => ({
  el,
  piece: el.dataset.piece,
  ride: el.dataset.ride || el.dataset.piece,
  cyl: el.dataset.cyl ? Number(el.dataset.cyl) : null,
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

// Engine State
let running = !still.matches;
let apart = false;
let xray = false;
let selected = null;
let flowMode = 0; // 0: All, 1: Fire, 2: Air, 3: Fuel, 4: Exhaust
let crank = 0;    // 0 to 720 degrees
let rpm = 3600;   // live RPM (1000 - 9000)
let clock = 0;
let lastTime = 0;
let frame = 0;
let visible = false;
let isDragging = false;
let dragStartX = 0;
let dragStartCrank = 0;

// 12-Cylinder Firing Order: 1 - 7 - 5 - 11 - 3 - 9 - 6 - 12 - 2 - 8 - 4 - 10
const CYL_FIRE = D.CYL_FIRE;

function strokeOf(cycleDeg) {
  const a = ((cycleDeg % 720) + 720) % 720;
  if (a < 180) return "power";
  if (a < 360) return "exhaust";
  if (a < 540) return "intake";
  return "compression";
}

function updateCylinders() {
  let activeFiringCyl = 1;
  let minCycle = 720;
  for (let c = 1; c <= 12; c++) {
    const fireTdc = CYL_FIRE[c];
    const cycleDeg = ((crank - fireTdc) % 720 + 720) % 720;
    const stroke = strokeOf(cycleDeg);
    if (stroke === "power" && cycleDeg < minCycle) {
      minCycle = cycleDeg;
      activeFiringCyl = c;
    }

    const pill = cylPills[c - 1];
    if (pill) {
      pill.dataset.stroke = stroke;
      const strokeEl = pill.querySelector(".v12-cyl-stroke");
      if (strokeEl) strokeEl.textContent = stroke.slice(0, 3).toUpperCase();
    }
  }
  return activeFiringCyl;
}

const PULLEY_SPEEDS = {
  crank: 1.0,
  wp: 1.25,
  alt: 2.85,
  drysump: 0.9,
  tens: -1.75,
  flywheel: 1.0,
};

function updatePulleys(crankDeg) {
  const crankRad = (crankDeg * Math.PI) / 180;
  if (beltEl) {
    beltEl.style.strokeDashoffset = (-crankDeg * 1.05).toFixed(1) + "px";
  }

  for (const dot of spinDots) {
    const pid = dot.dataset.pulley;
    const center = D.pulleyCenters[pid];
    if (!center) continue;
    const r = Number(dot.dataset.r);
    const phase = Number(dot.dataset.phase);
    const speed = PULLEY_SPEEDS[pid] || 1.0;
    const ang = crankRad * speed + phase;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    const sx = center[0] + r * (cos * D.EY[0] + sin * D.EZ[0]);
    const sy = center[1] + r * (cos * D.EY[1] + sin * D.EZ[1]);
    dot.setAttribute("cx", sx.toFixed(1));
    dot.setAttribute("cy", sy.toFixed(1));
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

function setFlowMode(mode) {
  flowMode = mode;
  flowBtns.forEach((btn, idx) => {
    if (idx === mode) btn.setAttribute("data-active", "");
    else btn.removeAttribute("data-active");
  });
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

function place() {
  for (const node of nodes) {
    const share = piece[node.ride].x;
    let tx = (D.EX[0] * node.m[0] + D.EY[0] * node.m[1] + D.EZ[0] * node.m[2]) * share;
    let ty = (D.EX[1] * node.m[0] + D.EY[1] * node.m[1] + D.EZ[1] * node.m[2]) * share;

    // Reciprocating kinematic motion for all 12 pistons and rods
    if (node.cyl && (node.piece === "pistons_l" || node.piece === "pistons_r")) {
      const fireTdc = CYL_FIRE[node.cyl];
      const thetaRad = ((crank - fireTdc) * Math.PI) / 180;
      // 9.2 mm crank throw radius (18.4 mm stroke) gives realistic kinematic displacement:
      const strokeDist = 9.2 * (1 - Math.cos(thetaRad)) + 0.66 * (1 - Math.cos(2 * thetaRad));
      const isLeft = node.cyl <= 6;
      const boreVec = isLeft ? D.boreL : D.boreR;
      tx += strokeDist * boreVec[0];
      ty += strokeDist * boreVec[1];
    }

    const text = (share === 0 && !node.cyl) ? "" : `translate(${tx.toFixed(2)} ${ty.toFixed(2)})`;
    if (text !== node.shown) {
      node.shown = text;
      if (text) node.el.setAttribute("transform", text);
      else node.el.removeAttribute("transform");
    }

    // Dynamic exhaust primary runner thermal incandescence
    if (node.cyl && (node.piece === "headers_l" || node.piece === "headers_r")) {
      const fireTdc = CYL_FIRE[node.cyl];
      const cycleDeg = ((crank - fireTdc) % 720 + 720) % 720;
      if (running && cycleDeg >= 180 && cycleDeg < 340) {
        const glow = (1 - (cycleDeg - 180) / 160) * 0.85;
        node.el.style.filter = `drop-shadow(0 0 6px rgba(255, 60, 20, ${glow.toFixed(2)}))`;
      } else if (running && cycleDeg < 120) {
        const glow = (1 - cycleDeg / 120) * 0.5;
        node.el.style.filter = `drop-shadow(0 0 4px rgba(255, 120, 30, ${glow.toFixed(2)}))`;
      } else if (node.el.style.filter) {
        node.el.style.filter = "";
      }
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
  const firingCyl = updateCylinders();
  const torque = running ? Math.round(718 * (0.8 + 0.2 * Math.sin((crank * Math.PI) / 30))) : 0;
  const kw = Math.round((torque * (rpm * 2 * Math.PI / 60)) / 1000);
  const hp = Math.round(kw * 1.3596);
  const text = running
    ? "CRANK " + Math.round(crank) + "° · " + rpm + " RPM · CYL " + firingCyl + " FIRING · " + torque + " N·m · " + kw + " kW (" + hp + " HP)"
    : apart
    ? "EXPLODED · " + D.order.length + " ASSEMBLIES · INSPECT"
    : "ASSEMBLED · STANDBY · PRESS DYNO RUN";
  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuetext", text);
  if (scrubSlider && !isDragging) {
    scrubSlider.value = Math.round(crank);
  }
}

// WebGL Volumetric Multi-Gas & Combustion Shader:
// - Flame & Ignition (Power stroke)
// - Air Intake Stream (Intake stroke)
// - Fuel Injection Atomization (Intake stroke)
// - Exhaust Gas Pulse (Exhaust stroke)
const FRAGMENT = `
uniform float uCrank;
uniform float uRunning;
uniform float uApart;
uniform float uFlowMode;
uniform vec3 uCylPos[12];
uniform float uCylPhase[12];
uniform vec3 uInjectorPos[12];
uniform vec3 uIntakePos[12];
uniform vec3 uExhaustPos[12];

void main() {
  vec2 vb = viewOf(gl_FragCoord.xy);
  vec3 col = vec3(0.0);
  float totalAlpha = 0.0;

  if (uRunning > 0.05) {
    for (int i = 0; i < 12; i++) {
      float fireTdc = uCylPhase[i];
      float cycle = mod(uCrank - fireTdc + 720.0, 720.0);

      // 1. IGNITION & POWER STROKE COMBUSTION FLASH (0 to 95 deg)
      if ((uFlowMode < 0.5 || abs(uFlowMode - 1.0) < 0.1) && cycle < 95.0) {
        float env = smoothstep(0.0, 6.0, cycle) * (1.0 - smoothstep(12.0, 95.0, cycle));
        vec2 centerScreen = project(uCylPos[i]);
        float d = length(vb - centerScreen) / uK;

        if (d < 22.0) {
          float shape = smoothstep(22.0, 2.0, d);
          float n = fbm2(vb * 0.20 + vec2(float(i) * 19.3, uCrank * 0.07));
          float intensity = env * shape * (0.85 + 0.35 * n);

          vec3 flameCol = mix(vec3(1.0, 0.30, 0.03), vec3(1.0, 0.95, 0.75), smoothstep(5.0, 0.0, d));
          col += flameCol * intensity * 1.7;
          totalAlpha = max(totalAlpha, intensity * 0.9);
        }
      }

      // 2. FUEL INJECTION SPRAY CONE (330 to 450 deg)
      if ((uFlowMode < 0.5 || abs(uFlowMode - 3.0) < 0.1) && cycle >= 330.0 && cycle < 450.0) {
        float envFuel = smoothstep(330.0, 350.0, cycle) * (1.0 - smoothstep(410.0, 450.0, cycle));
        vec2 injScreen = project(uInjectorPos[i]);
        float d = length(vb - injScreen) / uK;

        if (d < 16.0) {
          float shape = smoothstep(16.0, 1.0, d);
          float n = fbm2(vb * 0.35 + vec2(float(i) * 31.7, uCrank * 0.12));
          float intensity = envFuel * shape * (0.7 + 0.4 * n);

          // Atomized gasoline spray: crisp emerald-cyan mist
          vec3 fuelCol = mix(vec3(0.08, 0.85, 0.55), vec3(0.7, 1.0, 0.9), smoothstep(4.0, 0.0, d));
          col += fuelCol * intensity * 1.5;
          totalAlpha = max(totalAlpha, intensity * 0.75);
        }
      }

      // 3. AIR INTAKE AERODYNAMIC STREAM PULSE (360 to 520 deg)
      if ((uFlowMode < 0.5 || abs(uFlowMode - 2.0) < 0.1) && cycle >= 360.0 && cycle < 520.0) {
        float envAir = smoothstep(360.0, 390.0, cycle) * (1.0 - smoothstep(480.0, 520.0, cycle));
        vec2 airScreen = project(uIntakePos[i]);
        float d = length(vb - airScreen) / uK;

        if (d < 18.0) {
          float shape = smoothstep(18.0, 1.5, d);
          float swirl = noise2(vb * 0.25 - vec2(0.0, cycle * 0.1));
          float intensity = envAir * shape * (0.65 + 0.45 * swirl);

          // Electric cyan-blue laminar intake charge
          vec3 airCol = mix(vec3(0.15, 0.65, 1.0), vec3(0.8, 0.95, 1.0), smoothstep(5.0, 0.0, d));
          col += airCol * intensity * 1.4;
          totalAlpha = max(totalAlpha, intensity * 0.7);
        }
      }

      // 4. EXHAUST GAS INCANDESCENT EXPANSION PULSE (180 to 350 deg)
      if ((uFlowMode < 0.5 || abs(uFlowMode - 4.0) < 0.1) && cycle >= 180.0 && cycle < 350.0) {
        float envEx = smoothstep(180.0, 205.0, cycle) * (1.0 - smoothstep(300.0, 350.0, cycle));
        vec2 exhScreen = project(uExhaustPos[i]);
        float d = length(vb - exhScreen) / uK;

        if (d < 20.0) {
          float shape = smoothstep(20.0, 2.0, d);
          float n = fbm2(vb * 0.22 + vec2(float(i) * 23.1, -uCrank * 0.09));
          float intensity = envEx * shape * (0.75 + 0.35 * n);

          // Hot incandescent exhaust gas: crimson-amber plasma
          vec3 exhCol = mix(vec3(0.9, 0.15, 0.5), vec3(1.0, 0.55, 0.1), smoothstep(6.0, 0.0, d));
          col += exhCol * intensity * 1.5;
          totalAlpha = max(totalAlpha, intensity * 0.8);
        }
      }
    }
  }

  gl_FragColor = vec4(col, totalAlpha);
}
`;

const UNIFORMS = [
  "uCrank",
  "uRunning",
  "uApart",
  "uFlowMode",
  "uCylPos",
  "uCylPhase",
  "uInjectorPos",
  "uIntakePos",
  "uExhaustPos",
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

  // Kinematic crank rotation
  if (running && !calm) {
    const visualDegPerSec = (rpm / 3600) * 420;
    crank = (crank + visualDegPerSec * dt) % 720;
  }

  // Explode spring solver
  let moving = false;
  for (const id of IDS) {
    if (steerSpring(piece[id], dt, calm)) moving = true;
  }

  // High-frequency dyno harmonic vibration (V12 signature buttery micro-hum)
  const shake = running ? 0.22 + (rpm / 9000) * 0.25 : 0;
  stage.style.transform = shake > 0.01
    ? `translate(${(Math.sin(clock * 68) * shake * 0.5).toFixed(2)}px, ${(Math.cos(clock * 82) * shake * 0.35).toFixed(2)}px)`
    : "";

  // Update rotating pulleys, serpentine belt
  updatePulleys(crank);

  // Reciprocating pistons & explode positioning
  place();

  // Render WebGL multi-gas flame/intake/exhaust shader
  if (glContext && (running || moving || isDragging)) {
    glContext.draw({
      uCrank: crank,
      uRunning: running || isDragging ? 1.0 : 0.0,
      uApart: piece.intake ? piece.intake.x : 0,
      uFlowMode: flowMode,
      uCylPos: D.cylPosFlat,
      uCylPhase: D.cylPhases,
      uInjectorPos: D.injPosFlat,
      uIntakePos: D.intakePosFlat,
      uExhaustPos: D.exhPosFlat,
    }, clock);
  }

  describe();

  const active = running || moving || isDragging;
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
  if (label) label.textContent = running ? "Pause Dyno" : "Dyno Run";
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

flowBtns.forEach((btn, idx) => {
  btn.addEventListener("click", () => setFlowMode(idx));
});

partBtns.forEach((btn) => {
  btn.addEventListener("click", () => selectPart(btn.dataset.part));
});

// Click cylinder pill to jump crank to that cylinder's firing TDC!
cylPills.forEach((pill) => {
  pill.addEventListener("click", () => {
    const c = Number(pill.dataset.cyl);
    if (CYL_FIRE[c] !== undefined) {
      crank = CYL_FIRE[c];
      updatePulleys(crank);
      place();
      describe();
      if (glContext) {
        glContext.draw({
          uCrank: crank,
          uRunning: 1.0,
          uApart: piece.intake ? piece.intake.x : 0,
          uFlowMode: flowMode,
          uCylPos: D.cylPosFlat,
          uCylPhase: D.cylPhases,
          uInjectorPos: D.injPosFlat,
          uIntakePos: D.intakePosFlat,
          uExhaustPos: D.exhPosFlat,
        }, clock);
      }
    }
  });
});

// Slider scrubbing
if (scrubSlider) {
  scrubSlider.addEventListener("input", (e) => {
    crank = Number(e.target.value);
    updatePulleys(crank);
    place();
    describe();
    if (glContext) {
      glContext.draw({
        uCrank: crank,
        uRunning: 1.0,
        uApart: piece.intake ? piece.intake.x : 0,
        uFlowMode: flowMode,
        uCylPos: D.cylPosFlat,
        uCylPhase: D.cylPhases,
        uInjectorPos: D.injPosFlat,
        uIntakePos: D.intakePosFlat,
        uExhaustPos: D.exhPosFlat,
      }, clock);
    }
  });
}

// Interactive Drag Scrubbing on Stage
stage.addEventListener("pointerdown", (event) => {
  isDragging = true;
  dragStartX = event.clientX;
  dragStartCrank = crank;
  stage.setPointerCapture(event.pointerId);
});

stage.addEventListener("pointermove", (event) => {
  if (!isDragging) return;
  const dx = event.clientX - dragStartX;
  if (!running) {
    // Scrub crank angle directly
    crank = ((dragStartCrank + dx * 1.5) % 720 + 720) % 720;
    updatePulleys(crank);
    place();
    describe();
    if (glContext) {
      glContext.draw({
        uCrank: crank,
        uRunning: 1.0,
        uApart: piece.intake ? piece.intake.x : 0,
        uFlowMode: flowMode,
        uCylPos: D.cylPosFlat,
        uCylPhase: D.cylPhases,
        uInjectorPos: D.injPosFlat,
        uIntakePos: D.intakePosFlat,
        uExhaustPos: D.exhPosFlat,
      }, clock);
    }
  } else {
    // Throttle RPM
    rpm = Math.min(9000, Math.max(1000, 3600 + dx * 20));
    describe();
  }
});

stage.addEventListener("pointerup", (event) => {
  if (isDragging) {
    isDragging = false;
    try { stage.releasePointerCapture(event.pointerId); } catch (_) {}
  }
});

stage.addEventListener("pointercancel", () => { isDragging = false; });

// Keyboard Controls
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
  } else if (event.key === "f" || event.key === "F") {
    event.preventDefault();
    setFlowMode((flowMode + 1) % 5);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    running = false;
    updateRunButton();
    crank = (crank + 10) % 720;
    updatePulleys(crank);
    place();
    describe();
    if (glContext) {
      glContext.draw({
        uCrank: crank,
        uRunning: 1.0,
        uApart: piece.intake ? piece.intake.x : 0,
        uFlowMode: flowMode,
        uCylPos: D.cylPosFlat,
        uCylPhase: D.cylPhases,
        uInjectorPos: D.injPosFlat,
        uIntakePos: D.intakePosFlat,
        uExhaustPos: D.exhPosFlat,
      }, clock);
    }
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    running = false;
    updateRunButton();
    crank = (crank - 10 + 720) % 720;
    updatePulleys(crank);
    place();
    describe();
    if (glContext) {
      glContext.draw({
        uCrank: crank,
        uRunning: 1.0,
        uApart: piece.intake ? piece.intake.x : 0,
        uFlowMode: flowMode,
        uCylPos: D.cylPosFlat,
        uCylPhase: D.cylPhases,
        uInjectorPos: D.injPosFlat,
        uIntakePos: D.intakePosFlat,
        uExhaustPos: D.exhPosFlat,
      }, clock);
    }
  } else if (event.key === "Escape") {
    selectPart(null);
    if (apart) setApart(false);
    if (xray) setXray(false);
  }
});

updateRunButton();
updatePulleys(crank);
place();
describe();
if (visible) run();
