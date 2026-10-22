const D = __DATA__;
const root = document.querySelector(".sc");
const stage = root.querySelector(".sc-stage");
const front = stage.querySelector(".sc-front");
const assembly = front.querySelector(".sc-assembly");
const canvas = stage.querySelector(".sc-flow-canvas");
const liveEl = root.querySelector("[data-live]");
const readout = root.querySelector("[data-readout]");
const runBtn = root.querySelector("[data-run]");
const apartBtn = root.querySelector("[data-apart]");
const cutawayBtn = root.querySelector("[data-cutaway]");
const slider = root.querySelector("[data-throttle-slider]");
const throttleVal = root.querySelector("[data-throttle-val]");
const presetBtns = [...root.querySelectorAll(".sc-preset-btn")];
const partBtns = [...root.querySelectorAll(".sc-part-btn")];

// Telemetry DOM elements
const teleRotorRpm = root.querySelector("[data-tele-rotor-rpm]");
const teleCrankRpm = root.querySelector("[data-tele-crank-rpm]");
const teleBoost = root.querySelector("[data-tele-boost]");
const telePreTemp = root.querySelector("[data-tele-pre-temp]");
const telePostTemp = root.querySelector("[data-tele-post-temp]");
const telePowerLoss = root.querySelector("[data-tele-power-loss]");
const teleBypass = root.querySelector("[data-tele-bypass]");
const teleFlow = root.querySelector("[data-tele-flow]");

// Animated SVG dynamic elements
const needleBoost = front.querySelector(".sc-needle-boost");
const needleIat = front.querySelector(".sc-needle-iat");
const pulleySpokes = [...front.querySelectorAll(".sc-pulley-spoke")];
const beltTicks = [...front.querySelectorAll(".sc-belt-tick")];
const maleLobes = [...front.querySelectorAll(".sc-male-lobe")];
const femaleLobes = [...front.querySelectorAll(".sc-female-lobe")];
const gearTeethMale = [...front.querySelectorAll(".sc-gear-male-tooth")];
const gearTeethFemale = [...front.querySelectorAll(".sc-gear-female-tooth")];
const bypassRod = front.querySelector(".sc-bypass-rod");
const bypassFlapper = front.querySelector(".sc-bypass-flapper");
const throttlePlate = front.querySelector(".sc-throttle-plate");
const throttleLever = front.querySelector(".sc-throttle-lever");

const still = matchMedia("(prefers-reduced-motion: reduce)");

const nodes = [...assembly.querySelectorAll(".it")].map((el) => ({
  el,
  piece: el.dataset.piece,
  ride: el.dataset.ride || el.dataset.piece,
  key: Number(el.dataset.k),
  m: el.dataset.m.split(",").map(Number),
  index: Number(el.dataset.i),
  shown: "",
}));

for (const node of nodes) {
  node.lift = node.m[0] * D.V[0] + node.m[1] * D.V[1] + node.m[2] * D.V[2];
}

const IDS = Object.keys(D.pieces);
const STAGGER = D.stagger;
const SPRING = D.spring;
const piece = Object.fromEntries(IDS.map((id) => [id, { x: 0, v: 0, target: 0, pending: null }]));

// Engine & Supercharger Operational State
let running = !still.matches;
let apart = false;
let cutaway = true; // Cutaway enabled by default to showcase twin helical rotors!
let selected = null;
let throttle = 0.55;    // 0.0 (idle) to 1.0 (overboost WOT)
let targetThrottle = 0.55;
let clock = 0;
let lastTime = 0;
let frame = 0;
let visible = false;
let rotorAngle = 0;
let beltOffset = 0;

// Dynamic Physical State (smoothly interpolated)
const state = {
  crankRpm: 4320,
  rotorRpm: 10584,
  boostPsi: 8.5,
  vacuumInHg: 0,
  preTempC: 88,
  postTempC: 38,
  powerLossHp: 21.5,
  bypassPct: 0,
  flowLbMin: 39.8,
  volEffPct: 96.5,
};

// Canvas Airflow Particles
const ctx = canvas.getContext("2d");
let particlesIntake = [];
let particlesDischarge = [];
let particlesBypass = [];

function initParticles() {
  particlesIntake = Array.from({ length: 48 }, () => ({
    progress: Math.random(),
    speed: 0.18 + Math.random() * 0.12,
    offsetY: (Math.random() - 0.5) * 16,
    offsetZ: (Math.random() - 0.5) * 16,
  }));
  particlesDischarge = Array.from({ length: 56 }, () => ({
    progress: Math.random(),
    speed: 0.22 + Math.random() * 0.15,
    offsetY: (Math.random() - 0.5) * 22,
    offsetZ: (Math.random() - 0.5) * 14,
  }));
  particlesBypass = Array.from({ length: 28 }, () => ({
    progress: Math.random(),
    speed: 0.25 + Math.random() * 0.14,
    offsetY: (Math.random() - 0.5) * 10,
    offsetZ: (Math.random() - 0.5) * 10,
  }));
}

function resizeCanvas() {
  const rect = stage.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
}

function updatePhysics(dt) {
  // Smooth throttle interpolation
  const throttleSpeed = 3.5;
  throttle += (targetThrottle - throttle) * Math.min(1, dt * throttleSpeed);

  if (!running) {
    state.crankRpm += (0 - state.crankRpm) * Math.min(1, dt * 2.5);
    state.rotorRpm += (0 - state.rotorRpm) * Math.min(1, dt * 2.5);
    state.boostPsi += (0 - state.boostPsi) * Math.min(1, dt * 2.0);
    state.vacuumInHg += (0 - state.vacuumInHg) * Math.min(1, dt * 2.0);
    state.preTempC += (22 - state.preTempC) * Math.min(1, dt * 0.5);
    state.postTempC += (22 - state.postTempC) * Math.min(1, dt * 0.5);
    state.powerLossHp += (0 - state.powerLossHp) * Math.min(1, dt * 3.0);
    state.bypassPct += (100 - state.bypassPct) * Math.min(1, dt * 2.0);
    state.flowLbMin += (0 - state.flowLbMin) * Math.min(1, dt * 2.0);
    return;
  }

  // Engine Crankshaft RPM: 800 (idle) to 7,200 (redline)
  const targetCrankRpm = 800 + throttle * 6400;
  state.crankRpm += (targetCrankRpm - state.crankRpm) * Math.min(1, dt * 4.0);

  // Supercharger Step-Up Pulley Ratio: 2.45:1
  const targetRotorRpm = state.crankRpm * 2.45;
  state.rotorRpm += (targetRotorRpm - state.rotorRpm) * Math.min(1, dt * 4.5);

  // Bypass valve logic:
  // Under light throttle (< 0.35), manifold vacuum keeps bypass OPEN.
  // Above 0.38 throttle, vacuum drops and internal spring slams bypass SHUT.
  let targetBypass = 0;
  if (throttle < 0.25) {
    targetBypass = 100;
  } else if (throttle < 0.42) {
    targetBypass = ((0.42 - throttle) / (0.42 - 0.25)) * 100;
  } else {
    targetBypass = 0;
  }
  state.bypassPct += (targetBypass - state.bypassPct) * Math.min(1, dt * 8.0);

  // Manifold Pressure & Boost:
  // When bypass is open, manifold is under vacuum (-20 to -6 inHg).
  // When bypass shuts, positive boost develops instantaneously!
  let targetBoost = 0;
  let targetVac = 0;
  if (throttle < 0.28) {
    targetVac = 20.0 - throttle * 35.0; // 20 inHg down to 10 inHg
    targetBoost = 0;
  } else {
    targetVac = 0;
    // Positive displacement boost scales with throttle and RPM
    const boostFactor = (throttle - 0.28) / 0.72;
    targetBoost = 1.0 + boostFactor * 17.5; // up to +18.5 PSI at WOT
  }
  state.boostPsi += (targetBoost - state.boostPsi) * Math.min(1, dt * 6.0);
  state.vacuumInHg += (targetVac - state.vacuumInHg) * Math.min(1, dt * 6.0);

  // Compression Heating & Intercooler Cooling:
  // Pre-intercooler discharge temperature: 22°C ambient to ~138°C at full boost
  const compressionRatio = 1.0 + (state.boostPsi / 14.7);
  const targetPreTemp = 22 + Math.pow(compressionRatio, 0.286) * 32 * (state.boostPsi / 18.5) + (state.rotorRpm / 18000) * 15;
  state.preTempC += (targetPreTemp - state.preTempC) * Math.min(1, dt * 2.0);

  // Post-intercooler charge air temperature (IAT2):
  // Air-to-water heat exchanger brick cools boost air down to 36°C - 42°C
  const intercoolerEfficiency = 0.82;
  const coolantTemp = 26;
  const targetPostTemp = state.preTempC - intercoolerEfficiency * (state.preTempC - coolantTemp);
  state.postTempC += (targetPostTemp - state.postTempC) * Math.min(1, dt * 2.0);

  // Parasitic Horsepower Loss:
  // Cruising with bypass open: < 1.0 HP!
  // At full boost (18,000 RPM, +18.5 PSI): up to 54 HP absorbed from crank
  let targetHp = 0.6 + (state.rotorRpm / 18000) * 1.5;
  if (state.boostPsi > 0.5) {
    targetHp += Math.pow(state.boostPsi / 18.5, 1.4) * 48.0;
  }
  state.powerLossHp += (targetHp - state.powerLossHp) * Math.min(1, dt * 4.0);

  // Mass Airflow: 8.5 lb/min (idle) to 76.5 lb/min (redline WOT)
  const targetFlow = 8.5 + (state.rotorRpm / 17640) * (throttle * 58.0 + 10.0);
  state.flowLbMin += (targetFlow - state.flowLbMin) * Math.min(1, dt * 3.5);

  // Rotor spin angle and belt motion
  const rps = state.rotorRpm / 60;
  rotorAngle += rps * dt * 360;
  beltOffset = (beltOffset + rps * dt * 24) % 100;
}

function updateDOM() {
  if (teleRotorRpm) teleRotorRpm.textContent = `${Math.round(state.rotorRpm).toLocaleString()} RPM`;
  if (teleCrankRpm) teleCrankRpm.textContent = `${Math.round(state.crankRpm).toLocaleString()} RPM`;

  if (teleBoost) {
    if (state.boostPsi > 0.2) {
      teleBoost.textContent = `+${state.boostPsi.toFixed(1)} PSI (${(state.boostPsi * 0.0689476).toFixed(2)} bar)`;
      teleBoost.setAttribute("data-boost", "true");
      teleBoost.removeAttribute("data-cold");
    } else {
      teleBoost.textContent = `-${state.vacuumInHg.toFixed(1)} inHg Vacuum`;
      teleBoost.setAttribute("data-cold", "true");
      teleBoost.removeAttribute("data-boost");
    }
  }

  if (telePreTemp) telePreTemp.textContent = `${Math.round(state.preTempC)} °C (${Math.round(state.preTempC * 1.8 + 32)} °F)`;
  if (telePostTemp) telePostTemp.textContent = `${Math.round(state.postTempC)} °C (${Math.round(state.postTempC * 1.8 + 32)} °F)`;
  if (telePowerLoss) telePowerLoss.textContent = `${state.powerLossHp.toFixed(1)} HP (${(state.powerLossHp * 0.7457).toFixed(1)} kW)`;

  if (teleBypass) {
    if (state.bypassPct > 80) {
      teleBypass.textContent = `Open (${Math.round(state.bypassPct)}% Recirculation · Cruising)`;
    } else if (state.bypassPct > 10) {
      teleBypass.textContent = `Modulating (${Math.round(state.bypassPct)}% · Transition)`;
    } else {
      teleBypass.textContent = `Closed (0% · 100% Boost Output)`;
    }
  }

  if (teleFlow) teleFlow.textContent = `${state.flowLbMin.toFixed(1)} lb/min (${(state.flowLbMin * 7.55987).toFixed(0)} g/s)`;

  if (readout) {
    readout.textContent = `${Math.round(state.rotorRpm).toLocaleString()} Rotor RPM · ${state.boostPsi > 0.2 ? "+" + state.boostPsi.toFixed(1) + " PSI" : "-" + state.vacuumInHg.toFixed(1) + " inHg"} · ${Math.round(state.postTempC)} °C IAT`;
  }

  if (throttleVal) {
    throttleVal.textContent = `${Math.round(targetThrottle * 100)}%`;
  }

  // Update Analog Gauges:
  // 1. Boost Gauge: scale -30 inHg to +30 PSI (span 60). -130° to +130°
  if (needleBoost) {
    let boostAngle = 0;
    if (state.boostPsi > 0.1) {
      boostAngle = (state.boostPsi / 30) * 130;
    } else {
      boostAngle = (-state.vacuumInHg / 30) * 130;
    }
    boostAngle = Math.max(-130, Math.min(130, boostAngle));
    needleBoost.style.transform = `rotate(${boostAngle.toFixed(1)}deg)`;
  }

  // 2. IAT Temperature Gauge: 0 to 160°C. -125° to +125°
  if (needleIat) {
    const iatNormalized = (state.postTempC - 80) / 80;
    const iatAngle = Math.max(-125, Math.min(125, iatNormalized * 125));
    needleIat.style.transform = `rotate(${iatAngle.toFixed(1)}deg)`;
  }

  // Animate Pulley Spokes & Belt Ticks
  const pRot = (rotorAngle % 360).toFixed(1);
  for (const spoke of pulleySpokes) {
    spoke.style.transform = `rotate(${pRot}deg)`;
  }

  // Animate Twin Counter-Rotating Rotor Lobes
  const maleRot = ((-rotorAngle) % 360).toFixed(1);
  for (const lobe of maleLobes) {
    lobe.style.transform = `rotate(${maleRot}deg)`;
  }

  // Female rotor turns opposite direction (ratio 3:5 for 3-lobe/5-flute)
  const femaleRot = ((rotorAngle * 0.6) % 360).toFixed(1);
  for (const lobe of femaleLobes) {
    lobe.style.transform = `rotate(${femaleRot}deg)`;
  }

  // Timing gears counter-rotate
  for (const g of gearTeethMale) g.style.transform = `rotate(${maleRot}deg)`;
  for (const g of gearTeethFemale) g.style.transform = `rotate(${femaleRot}deg)`;

  // Animate Bypass Actuator Rod & Flapper
  if (bypassRod && bypassFlapper) {
    const rodTravel = ((100 - state.bypassPct) / 100) * 6; // 0 to 6mm stroke
    bypassRod.style.transform = `translateX(${rodTravel.toFixed(1)}px)`;
    const flapAngle = ((100 - state.bypassPct) / 100) * 68; // 0° (flat open) to 68° (closed shut)
    bypassFlapper.style.transform = `rotate(${flapAngle.toFixed(1)}deg)`;
  }

  // Animate Throttle Butterfly Plate & Quadrant Lever
  if (throttlePlate && throttleLever) {
    const thAngle = 12 + throttle * 78; // 12° (idle crack) to 90° (WOT)
    throttlePlate.style.transform = `rotate(${thAngle.toFixed(1)}deg)`;
    throttleLever.style.transform = `rotate(${(throttle * 75).toFixed(1)}deg)`;
  }
}

// -------------------------------------------------------------
// SPRING EXPLODED ASSEMBLY UPDATE
// -------------------------------------------------------------
function updateExplode(dt) {
  let anyMoving = false;
  for (const id of IDS) {
    const p = piece[id];
    if (!p) continue;
    if (p.pending !== null && clock >= p.pending) {
      p.target = apart ? 1 : 0;
      p.pending = null;
    }
    const delta = p.target - p.x;
    const force = delta * SPRING.stiffness;
    const damp = -p.v * SPRING.damping;
    p.v += (force + damp) * dt;
    p.x += p.v * dt;
    if (Math.abs(delta) > 0.001 || Math.abs(p.v) > 0.001) {
      anyMoving = true;
    } else {
      p.x = p.target;
      p.v = 0;
    }
  }

  // Update node SVG transforms
  for (const node of nodes) {
    const p = piece[node.ride];
    if (!p) continue;
    const f = p.x;
    const tx = node.m[0] * f * D.scale;
    const ty = node.m[1] * f * D.scale;
    const tz = node.m[2] * f * D.scale;
    
    // Convert 3D world translation vector to 2D screen isometric delta
    const sx = (tx * D.P.sinA - ty * D.P.cosA) * D.P.k;
    const sy = ((tx * D.P.cosA + ty * D.P.sinA) * D.P.sinE - tz * D.P.cosE) * D.P.k;
    
    node.el.style.transform = Math.abs(sx) > 0.05 || Math.abs(sy) > 0.05 ? `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)` : "";
  }
}

// -------------------------------------------------------------
// CANVAS AIRFLOW & THERMAL PARTICLE SIMULATION
// -------------------------------------------------------------
function renderParticles() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!running || state.rotorRpm < 200) return;

  const w = canvas.width;
  const h = canvas.height;
  const scale = w / D.W;

  // Key screen anchors projected from 3D world points
  const pInlet = D.anchors.inlet;          // Rear throttle body inlet
  const pElbow = D.anchors.elbow;          // Rear 90° intake elbow
  const pRotorIn = D.anchors.rotorIn;      // Rear intake face of rotors
  const pRotorMid = D.anchors.rotorMid;    // Center meshing zone of rotors
  const pDischarge = D.anchors.discharge;  // Bottom discharge port
  const pIntercooler = D.anchors.intercooler; // Passing through cooler core
  const pManifold = D.anchors.manifold;    // Lower manifold runners
  const pBypassRun = D.anchors.bypassRun;  // Bypass recirculation runner

  const flowSpeed = (state.flowLbMin / 40.0) * 0.8;

  // 1. Ambient Intake Flow (Cyan/Blue particles entering throttle body)
  ctx.lineWidth = 2.2 * scale;
  for (const p of particlesIntake) {
    p.progress = (p.progress + p.speed * flowSpeed * 0.016) % 1.0;
    let sx, sy;
    if (p.progress < 0.45) {
      // From inlet to elbow
      const t = p.progress / 0.45;
      sx = pInlet[0] + (pElbow[0] - pInlet[0]) * t;
      sy = pInlet[1] + (pElbow[1] - pInlet[1]) * t + p.offsetZ;
    } else {
      // From elbow into rotor rear intake
      const t = (p.progress - 0.45) / 0.55;
      sx = pElbow[0] + (pRotorIn[0] - pElbow[0]) * t + p.offsetY * 0.5;
      sy = pElbow[1] + (pRotorIn[1] - pElbow[1]) * t;
    }

    const alpha = Math.sin(p.progress * Math.PI) * 0.85;
    ctx.strokeStyle = `rgba(0, 229, 255, ${alpha.toFixed(2)})`;
    ctx.beginPath();
    ctx.moveTo(sx * scale, sy * scale);
    ctx.lineTo((sx - 6 * scale) * scale, (sy - 3 * scale) * scale);
    ctx.stroke();
  }

  // 2. High-Pressure Discharge & Intercooler Flow
  // Particles heat up to vibrant orange/red in rotors, then cool to cyan through intercooler
  for (const p of particlesDischarge) {
    p.progress = (p.progress + p.speed * flowSpeed * 0.016) % 1.0;
    let sx, sy, r, g, b;

    if (p.progress < 0.35) {
      // Inside rotor compression chamber (Heating up)
      const t = p.progress / 0.35;
      sx = pRotorIn[0] + (pRotorMid[0] - pRotorIn[0]) * t;
      sy = pRotorIn[1] + (pRotorMid[1] - pRotorIn[1]) * t + p.offsetZ * 0.3;
      // Interpolate from cyan to heated amber
      r = Math.round(t * 255);
      g = Math.round(229 - t * 80);
      b = Math.round(255 - t * 255);
    } else if (p.progress < 0.65) {
      // Discharge through intercooler brick
      const t = (p.progress - 0.35) / 0.30;
      sx = pDischarge[0] + (pIntercooler[0] - pDischarge[0]) * t + p.offsetY * 0.6;
      sy = pDischarge[1] + (pIntercooler[1] - pDischarge[1]) * t;
      // High heat orange/red cooling down through liquid brick
      r = Math.round(255 * (1 - t * 0.8));
      g = Math.round(145 + t * 80);
      b = Math.round(t * 255);
    } else {
      // Exit manifold runners (Cooled boost air)
      const t = (p.progress - 0.65) / 0.35;
      sx = pIntercooler[0] + (pManifold[0] - pIntercooler[0]) * t;
      sy = pIntercooler[1] + (pManifold[1] - pIntercooler[1]) * t + p.offsetY * 0.8;
      r = 0;
      g = 210;
      b = 255;
    }

    const alpha = Math.sin(p.progress * Math.PI) * 0.9;
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
    ctx.beginPath();
    ctx.moveTo(sx * scale, sy * scale);
    ctx.lineTo((sx + 5 * scale) * scale, (sy + 7 * scale) * scale);
    ctx.stroke();
  }

  // 3. Bypass Recirculation Loop (Active when bypass valve is open)
  if (state.bypassPct > 5) {
    const bypassAlphaFactor = (state.bypassPct / 100);
    for (const p of particlesBypass) {
      p.progress = (p.progress + p.speed * 0.018) % 1.0;
      let sx, sy;
      if (p.progress < 0.5) {
        // Lower discharge up through bypass runner
        const t = p.progress / 0.5;
        sx = pDischarge[0] + (pBypassRun[0] - pDischarge[0]) * t;
        sy = pDischarge[1] + (pBypassRun[1] - pDischarge[1]) * t + p.offsetY;
      } else {
        // Back into inlet elbow
        const t = (p.progress - 0.5) / 0.5;
        sx = pBypassRun[0] + (pElbow[0] - pBypassRun[0]) * t;
        sy = pBypassRun[1] + (pElbow[1] - pBypassRun[1]) * t;
      }

      const alpha = Math.sin(p.progress * Math.PI) * 0.75 * bypassAlphaFactor;
      ctx.strokeStyle = `rgba(255, 170, 0, ${alpha.toFixed(2)})`;
      ctx.beginPath();
      ctx.moveTo(sx * scale, sy * scale);
      ctx.lineTo((sx - 5 * scale) * scale, (sy - 5 * scale) * scale);
      ctx.stroke();
    }
  }
}

// -------------------------------------------------------------
// INTERACTION & CONTROL HANDLERS
// -------------------------------------------------------------
function setApart(on) {
  if (apart === on) return;
  apart = on;
  apartBtn.toggleAttribute("data-active", apart);
  const goal = on ? 1 : 0;
  const list = on ? STAGGER : [...STAGGER].reverse();
  list.forEach((id, index) => {
    if (!piece[id]) return;
    if (piece[id].target === goal) piece[id].pending = null;
    else piece[id].pending = clock + index * SPRING.stagger;
  });

  if (liveEl) liveEl.textContent = apart ? "Supercharger exploded view active" : "Supercharger assembled view active";
}

function setCutaway(on) {
  cutaway = on;
  stage.toggleAttribute("data-cutaway", cutaway);
  cutawayBtn.toggleAttribute("data-active", cutaway);
  if (liveEl) liveEl.textContent = cutaway ? "Cutaway view on: internal twin helical rotors visible" : "Cutaway view off: full stator case visible";
}

function setRun(on) {
  running = on;
  runBtn.toggleAttribute("data-active", running);
  if (liveEl) liveEl.textContent = running ? "Supercharger dyno run active" : "Supercharger dyno stopped";
}

function setThrottle(val) {
  targetThrottle = Math.max(0, Math.min(1, val));
  if (slider) slider.value = Math.round(targetThrottle * 100);
  presetBtns.forEach((btn) => {
    const pVal = Number(btn.dataset.preset);
    btn.toggleAttribute("data-active", Math.abs(pVal - targetThrottle) < 0.06);
  });
}

function selectPart(id) {
  if (selected === id) {
    selected = null;
    stage.removeAttribute("data-focus");
    partBtns.forEach((b) => b.removeAttribute("data-active"));
    nodes.forEach((n) => n.el.removeAttribute("data-on"));
    if (liveEl) liveEl.textContent = "All parts shown";
    return;
  }
  selected = id;
  stage.setAttribute("data-focus", "true");
  partBtns.forEach((b) => b.toggleAttribute("data-active", b.dataset.part === id));
  nodes.forEach((n) => n.el.toggleAttribute("data-on", n.piece === id));
  if (liveEl && D.pieces[id]) liveEl.textContent = `${D.pieces[id].name}: ${D.pieces[id].say}`;
}

// Button click listeners
if (runBtn) runBtn.addEventListener("click", () => setRun(!running));
if (apartBtn) apartBtn.addEventListener("click", () => setApart(!apart));
if (cutawayBtn) cutawayBtn.addEventListener("click", () => setCutaway(!cutaway));

if (slider) {
  slider.addEventListener("input", (e) => {
    setThrottle(Number(e.target.value) / 100);
  });
}

presetBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    setThrottle(Number(btn.dataset.preset));
  });
});

partBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    selectPart(btn.dataset.part);
  });
});

// Click SVG nodes directly to select
for (const node of nodes) {
  node.el.addEventListener("click", (e) => {
    e.stopPropagation();
    selectPart(node.piece);
  });
}

// Click background stage to clear selection
stage.addEventListener("click", () => {
  if (selected) selectPart(selected);
});

// Keyboard shortcuts
window.addEventListener("keydown", (e) => {
  if (e.target.matches("input, textarea, select")) return;
  if (e.code === "Space") {
    e.preventDefault();
    setRun(!running);
  } else if (e.code === "KeyE") {
    e.preventDefault();
    setApart(!apart);
  } else if (e.code === "KeyC") {
    e.preventDefault();
    setCutaway(!cutaway);
  } else if (e.key >= "1" && e.key <= "5") {
    const presets = [0.0, 0.22, 0.48, 0.82, 1.0];
    const idx = Number(e.key) - 1;
    if (idx < presets.length) setThrottle(presets[idx]);
  }
});

// Initialize state
initParticles();
resizeCanvas();
window.addEventListener("resize", resizeCanvas);
setRun(running);
setCutaway(cutaway);

// -------------------------------------------------------------
// MAIN RAF ANIMATION LOOP
// -------------------------------------------------------------
function loop(time) {
  if (!lastTime) lastTime = time;
  const dt = Math.min(0.06, (time - lastTime) / 1000);
  lastTime = time;
  clock += dt;
  frame++;

  updatePhysics(dt);
  updateExplode(dt);
  updateDOM();
  renderParticles();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
