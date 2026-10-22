const D = __DATA__;
const root = document.querySelector(".v8");
const stage = root.querySelector(".v8-stage");
const front = stage.querySelector(".v8-front");
const engine = front.querySelector(".v8-engine");
const canvas = stage.querySelector(".v8-fire-canvas");
const liveEl = root.querySelector("[data-live]");
const readout = root.querySelector("[data-readout]");
const runBtn = root.querySelector("[data-run]");
const apartBtn = root.querySelector("[data-apart]");
const xrayBtn = root.querySelector("[data-xray]");
const partBtns = [...root.querySelectorAll(".v8-part-btn")];
const cylPills = [...root.querySelectorAll(".v8-cyl-pill")];
const beltEl = front.querySelector(".v8-belt");
const spinDots = [...front.querySelectorAll(".v8-dot-spin")];
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
let crank = 0;         // 0 to 720 degrees
let rpm = 2400;        // live RPM
let clock = 0;
let lastTime = 0;
let frame = 0;
let visible = false;
let isDragging = false;
let dragStartX = 0;
let dragStartCrank = 0;

// Cylinder Firing Order: 1 - 8 - 4 - 3 - 6 - 5 - 7 - 2
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
  for (let c = 1; c <= 8; c++) {
    const fireTdc = CYL_FIRE[c];
    const cycleDeg = ((crank - fireTdc) % 720 + 720) % 720;
    const stroke = strokeOf(cycleDeg);
    if (stroke === "power" && cycleDeg < 90) activeFiringCyl = c;

    const pill = cylPills[c - 1];
    if (pill) {
      pill.dataset.stroke = stroke;
      pill.textContent = "C" + c + " " + stroke.slice(0, 3).toUpperCase();
    }
  }
  return activeFiringCyl;
}

const PULLEY_SPEEDS = {
  crank: 1.0,
  wp: 1.25,
  alt: 2.8,
  tens: -1.8,
  flywheel: 1.0,
};

function updatePulleys(crankDeg) {
  const crankRad = (crankDeg * Math.PI) / 180;
  if (beltEl) {
    beltEl.style.strokeDashoffset = (-crankDeg * 0.95).toFixed(1) + "px";
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

    // Reciprocating motion for pistons and rods
    if (node.cyl && (node.piece === "pistons_l" || node.piece === "pistons_r")) {
      const fireTdc = CYL_FIRE[node.cyl];
      const thetaRad = ((crank - fireTdc) * Math.PI) / 180;
      // 9.5 mm stroke gives ~46px bold reciprocating travel
      const strokeDist = 9.5 * (1 - Math.cos(thetaRad)) + 1.8 * Math.pow(Math.sin(thetaRad), 2);
      const boreVec = node.cyl % 2 !== 0 ? D.boreL : D.boreR;
      tx += strokeDist * boreVec[0];
      ty += strokeDist * boreVec[1];
    }

    const text = (share === 0 && !node.cyl) ? "" : `translate(${tx.toFixed(2)} ${ty.toFixed(2)})`;
    if (text !== node.shown) {
      node.shown = text;
      if (text) node.el.setAttribute("transform", text);
      else node.el.removeAttribute("transform");
    }

    // Exhaust primary runner thermal pulse during expansion
    if (node.cyl && (node.piece === "headers_l" || node.piece === "headers_r")) {
      const fireTdc = CYL_FIRE[node.cyl];
      const cycleDeg = ((crank - fireTdc) % 720 + 720) % 720;
      if (running && cycleDeg < 130) {
        const glow = (1 - cycleDeg / 130) * 0.8;
        node.el.style.filter = `drop-shadow(0 0 6px rgba(255, 90, 20, ${glow.toFixed(2)}))`;
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
  const torque = running ? 480 : 0;
  const kw = Math.round((torque * (rpm * 2 * Math.PI / 60)) / 1000);
  const text = running
    ? "CRANK " + Math.round(crank) + "° · " + rpm + " RPM · CYL " + firingCyl + " FIRING · " + torque + " N·m · " + kw + " kW"
    : apart
    ? "EXPLODED · " + D.order.length + " ASSEMBLIES · INSPECT"
    : "ASSEMBLED · STANDBY · PRESS RUN";
  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuetext", text);
}

// WebGL Combustion Chamber Volumetric Flame Shader
const FRAGMENT = `
uniform float uCrank;
uniform float uRunning;
uniform float uApart;
uniform vec3 uCylPos[8];
uniform float uCylPhase[8];

void main() {
  vec2 vb = viewOf(gl_FragCoord.xy);
  vec3 col = vec3(0.0);
  float totalAlpha = 0.0;

  if (uRunning > 0.1) {
    for (int i = 0; i < 8; i++) {
      float fireTdc = uCylPhase[i];
      float cycle = mod(uCrank - fireTdc + 720.0, 720.0);
      
      // Combustion flash during power stroke expansion (0 to 85 deg)
      if (cycle < 85.0) {
        float env = smoothstep(0.0, 6.0, cycle) * (1.0 - smoothstep(10.0, 85.0, cycle));
        vec2 centerScreen = project(uCylPos[i]);
        float d = length(vb - centerScreen) / uK;
        
        if (d < 22.0) {
          float shape = smoothstep(22.0, 2.0, d);
          float n = fbm2(vb * 0.18 + vec2(float(i) * 17.3, uCrank * 0.08));
          float intensity = env * shape * (0.85 + 0.35 * n);
          
          vec3 flameCol = mix(vec3(1.0, 0.32, 0.04), vec3(1.0, 0.94, 0.72), smoothstep(5.0, 0.0, d));
          col += flameCol * intensity * 1.6;
          totalAlpha = max(totalAlpha, intensity * 0.85);
        }
      }
    }
  }

  gl_FragColor = vec4(col, totalAlpha);
}
`;

const UNIFORMS = ["uCrank", "uRunning", "uApart", "uCylPos", "uCylPhase"];
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

  // Kinematic crank rotation (calibrated visual cadence so every stroke is smooth & observable)
  if (running && !calm) {
    // 75 visual RPM (~1.25 rev/s = 450 deg/s) provides 48 smooth frames/rev, preventing stroboscopic aliasing
    const visualDegPerSec = (rpm / 2400) * 450;
    crank = (crank + visualDegPerSec * dt) % 720;
  }

  // Explode spring solver
  let moving = false;
  for (const id of IDS) {
    if (steerSpring(piece[id], dt, calm)) moving = true;
  }

  // Dyno high-frequency engine vibration
  const shake = running ? 0.35 + (rpm / 6500) * 0.35 : 0;
  stage.style.transform = shake > 0.01
    ? `translate(${(Math.sin(clock * 57) * shake * 0.6).toFixed(2)}px, ${(Math.cos(clock * 73) * shake * 0.4).toFixed(2)}px)`
    : "";

  // Update rotating pulleys, harmonic balancer, belt
  updatePulleys(crank);

  // Reciprocating pistons & explode positioning
  place();

  // Render WebGL flame layer
  if (glContext && (running || moving)) {
    glContext.draw({
      uCrank: crank,
      uRunning: running ? 1.0 : 0.0,
      uApart: piece.intake ? piece.intake.x : 0,
      uCylPos: D.cylPosFlat,
      uCylPhase: D.cylPhases,
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

partBtns.forEach((btn) => {
  btn.addEventListener("click", () => selectPart(btn.dataset.part));
});

// Interactive Drag Scrubbing
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
        uCylPos: D.cylPosFlat,
        uCylPhase: D.cylPhases,
      }, clock);
    }
  } else {
    // Throttle RPM
    rpm = Math.min(6500, Math.max(1000, 2400 + dx * 15));
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
        uCylPos: D.cylPosFlat,
        uCylPhase: D.cylPhases,
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
        uCylPos: D.cylPosFlat,
        uCylPhase: D.cylPhases,
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
