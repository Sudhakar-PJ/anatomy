const D = __DATA__;
const root = document.querySelector(".turbo");
const stage = root.querySelector(".turbo-stage");
const front = stage.querySelector(".turbo-front");
const engine = front.querySelector(".turbo-assembly");
const canvas = stage.querySelector(".turbo-flow-canvas");
const liveEl = root.querySelector("[data-live]");
const readout = root.querySelector("[data-readout]");
const runBtn = root.querySelector("[data-run]");
const apartBtn = root.querySelector("[data-apart]");
const cutawayBtn = root.querySelector("[data-cutaway]");
const slider = root.querySelector("[data-throttle-slider]");
const throttleVal = root.querySelector("[data-throttle-val]");
const presetBtns = [...root.querySelectorAll(".turbo-preset-btn")];
const partBtns = [...root.querySelectorAll(".turbo-part-btn")];

// Telemetry DOM elements
const teleRpm = root.querySelector("[data-tele-rpm]");
const teleBoost = root.querySelector("[data-tele-boost]");
const teleEgt = root.querySelector("[data-tele-egt]");
const teleCharge = root.querySelector("[data-tele-charge]");
const teleFlow = root.querySelector("[data-tele-flow]");
const teleWaste = root.querySelector("[data-tele-waste]");

// Animated gauge needles & dynamic elements in SVG
const boostNeedle = front.querySelector(".turbo-needle-boost");
const rpmNeedle = front.querySelector(".turbo-needle-rpm");
const compBlades = [...front.querySelectorAll(".turbo-blade-comp")];
const turbBlades = [...front.querySelectorAll(".turbo-blade-turb")];
const wgRod = front.querySelector(".turbo-wg-rod");
const wgFlapper = front.querySelector(".turbo-wg-flapper");

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

for (const node of nodes) {
  node.lift = node.m[0] * D.V[0] + node.m[1] * D.V[1] + node.m[2] * D.V[2];
}

const IDS = Object.keys(D.pieces);
const STAGGER = D.stagger;
const SPRING = D.spring;
const piece = Object.fromEntries(IDS.map((id) => [id, { x: 0, v: 0, target: 0, pending: null }]));

// Engine & Turbocharger Operational State
let running = !still.matches;
let apart = false;
let cutaway = false;
let selected = null;
let throttle = 0.55;    // 0.0 (idle) to 1.0 (overboost WOT)
let targetThrottle = 0.55;
let clock = 0;
let lastTime = 0;
let frame = 0;
let visible = false;
let wheelAngle = 0;

// Dynamic Turbo Physics State (smoothed)
const state = {
  turboRpm: 120000,
  boostPsi: 11.5,
  egtC: 720,
  chargeC: 85,
  flowLbMin: 23.5,
  wgLiftMm: 0,
  wgBypassPct: 0,
};

// Canvas flow particle simulation
const ctx = canvas.getContext("2d");
let particlesCold = [];
let particlesHot = [];
let particlesWaste = [];

function initParticles() {
  particlesCold = Array.from({ length: 42 }, () => ({
    progress: Math.random(),
    speed: 0.15 + Math.random() * 0.1,
    offset: (Math.random() - 0.5) * 16,
  }));
  particlesHot = Array.from({ length: 48 }, () => ({
    progress: Math.random(),
    speed: 0.2 + Math.random() * 0.12,
    offset: (Math.random() - 0.5) * 14,
  }));
  particlesWaste = Array.from({ length: 24 }, () => ({
    progress: Math.random(),
    speed: 0.28 + Math.random() * 0.15,
    offset: (Math.random() - 0.5) * 10,
  }));
}
initParticles();

// Thermodynamic Model of Turbocharger
function computeTurboPhysics(th, dt) {
  // Target values based on throttle position:
  // 0.0 -> Idle: 15k RPM, -10.8 PSI (vacuum), 380°C EGT, 24°C Charge, 2.4 lb/min, WG closed
  // 0.25 -> Cruise: 48k RPM, +1.8 PSI, 560°C EGT, 45°C Charge, 8.8 lb/min, WG closed
  // 0.55 -> Spool/Mid: 125k RPM, +12.0 PSI, 750°C EGT, 90°C Charge, 24.5 lb/min, WG closed
  // 0.80 -> Peak Boost: 175k RPM, +18.5 PSI, 895°C EGT, 122°C Charge, 36.5 lb/min, WG cracking (1.5mm)
  // 1.00 -> Overboost: 205k RPM, +22.0 PSI, 965°C EGT, 138°C Charge, 44.2 lb/min, WG full open (6.5mm)

  let tRpm, tBoost, tEgt, tCharge, tFlow, tLift, tBypass;
  if (!running) {
    tRpm = 0;
    tBoost = 0;
    tEgt = 25;
    tCharge = 22;
    tFlow = 0;
    tLift = 0;
    tBypass = 0;
  } else if (th <= 0.1) {
    tRpm = 15000 + th * 40000;
    tBoost = -10.8 + th * 25;
    tEgt = 380 + th * 300;
    tCharge = 24 + th * 30;
    tFlow = 2.4 + th * 12;
    tLift = 0;
    tBypass = 0;
  } else if (th <= 0.75) {
    const f = (th - 0.1) / 0.65;
    tRpm = 19000 + f * 145000;
    tBoost = -8.3 + f * 26.5; // reaches ~18.2 PSI
    tEgt = 410 + f * 470;     // reaches ~880°C
    tCharge = 27 + f * 90;    // reaches ~117°C
    tFlow = 3.6 + f * 31.5;   // reaches ~35 lb/min
    tLift = f > 0.95 ? (f - 0.95) * 15 : 0;
    tBypass = f > 0.95 ? (f - 0.95) * 80 : 0;
  } else {
    const f = (th - 0.75) / 0.25;
    tRpm = 164000 + f * 41000; // up to 205,000 RPM
    tBoost = 18.2 + f * 3.8;   // reaches 22.0 PSI
    tEgt = 880 + f * 85;       // reaches 965°C
    tCharge = 117 + f * 21;    // reaches 138°C
    tFlow = 35.1 + f * 9.1;    // reaches 44.2 lb/min
    tLift = 1.0 + f * 5.5;     // up to 6.5 mm lift
    tBypass = 5 + f * 27;      // up to 32% bypass
  }

  // Smooth follow physics
  const alpha = 1 - Math.exp(-dt / 0.18);
  state.turboRpm += (tRpm - state.turboRpm) * alpha;
  state.boostPsi += (tBoost - state.boostPsi) * alpha;
  state.egtC += (tEgt - state.egtC) * (1 - Math.exp(-dt / 0.35));
  state.chargeC += (tCharge - state.chargeC) * (1 - Math.exp(-dt / 0.4));
  state.flowLbMin += (tFlow - state.flowLbMin) * alpha;
  state.wgLiftMm += (tLift - state.wgLiftMm) * (1 - Math.exp(-dt / 0.12));
  state.wgBypassPct += (tBypass - state.wgBypassPct) * (1 - Math.exp(-dt / 0.12));
}

function updateTelemetryUI() {
  if (teleRpm) teleRpm.textContent = `${Math.round(state.turboRpm).toLocaleString()} RPM`;
  if (teleBoost) {
    const b = state.boostPsi;
    teleBoost.textContent = b < 0 ? `${b.toFixed(1)} PSI (vac)` : `+${b.toFixed(1)} PSI (${(b * 0.0689476).toFixed(2)} bar)`;
    teleBoost.dataset.cold = b > 5 ? "" : null;
    teleBoost.dataset.warn = b > 20 ? "" : null;
  }
  if (teleEgt) {
    teleEgt.textContent = `${Math.round(state.egtC)} °C (${Math.round(state.egtC * 1.8 + 32)} °F)`;
    teleEgt.dataset.hot = state.egtC > 650 ? "" : null;
    teleEgt.dataset.warn = state.egtC > 920 ? "" : null;
  }
  if (teleCharge) teleCharge.textContent = `${Math.round(state.chargeC)} °C`;
  if (teleFlow) teleFlow.textContent = `${state.flowLbMin.toFixed(1)} lb/min`;
  if (teleWaste) {
    if (state.wgLiftMm < 0.2) {
      teleWaste.textContent = "Closed · 100% Flow to Turbine";
      teleWaste.removeAttribute("data-warn");
      teleWaste.removeAttribute("data-hot");
    } else {
      teleWaste.textContent = `Open (${state.wgLiftMm.toFixed(1)} mm) · ${Math.round(state.wgBypassPct)}% Bypassed`;
      teleWaste.setAttribute(state.wgLiftMm > 4 ? "data-warn" : "data-hot", "");
    }
  }

  // Update corner readout
  if (readout) {
    let msg = "";
    if (selected) {
      msg = D.pieces[selected]?.say || "";
    } else if (apart) {
      msg = "apart · 10 precision assemblies";
    } else if (!running) {
      msg = "Dyno idle · engine off";
    } else if (state.wgLiftMm > 0.4) {
      msg = `${Math.round(state.turboRpm).toLocaleString()} RPM · +${state.boostPsi.toFixed(1)} PSI · Wastegate Regulating (${state.wgLiftMm.toFixed(1)} mm)`;
    } else {
      msg = `${Math.round(state.turboRpm).toLocaleString()} RPM · ${state.boostPsi >= 0 ? "+" : ""}${state.boostPsi.toFixed(1)} PSI · ${Math.round(state.egtC)} °C EGT`;
    }
    if (readout.textContent !== msg) readout.textContent = msg;
  }
}

// Update Mechanical Gauges & Rotating Wheels in SVG
function updateSvgMechanisms(dt) {
  // 1. Boost Gauge Needle (Vac 30 inHg to +35 PSI)
  // Center is [D.gaugeBoost.x, D.gaugeBoost.y]
  if (boostNeedle && D.gaugeBoost) {
    const psi = state.boostPsi;
    // Map -14.7 PSI to -135 deg, 0 PSI to -45 deg, +30 PSI to +135 deg
    const deg = psi <= 0 ? -45 + (psi / 14.7) * 90 : -45 + (psi / 30) * 180;
    const rad = (deg * Math.PI) / 180;
    const len = 9.8;
    const [gx, gy] = D.gaugeBoost;
    const x2 = (gx + Math.cos(rad) * len).toFixed(1);
    const y2 = (gy + Math.sin(rad) * len).toFixed(1);
    boostNeedle.setAttribute("x2", x2);
    boostNeedle.setAttribute("y2", y2);
  }

  // 2. Tachometer & EGT Needle (0 to 220 krpm)
  if (rpmNeedle && D.gaugeRpm) {
    const rpm = state.turboRpm;
    // Map 0 to -135 deg, 220,000 to +135 deg
    const deg = -135 + Math.min(1.0, rpm / 220000) * 270;
    const rad = (deg * Math.PI) / 180;
    const len = 9.8;
    const [rx, ry] = D.gaugeRpm;
    const x2 = (rx + Math.cos(rad) * len).toFixed(1);
    const y2 = (ry + Math.sin(rad) * len).toFixed(1);
    rpmNeedle.setAttribute("x2", x2);
    rpmNeedle.setAttribute("y2", y2);
  }

  // 3. High-speed Wheel Blade Rotation (Optical Strobe)
  if (running && state.turboRpm > 100) {
    wheelAngle = (wheelAngle + state.turboRpm * dt * 0.008) % 360;
    const strobe = (Math.sin((wheelAngle * Math.PI) / 18) * 0.2 + 0.8).toFixed(2);
    for (const b of compBlades) b.style.opacity = strobe;
    for (const b of turbBlades) b.style.opacity = strobe;
  }

  // 4. Wastegate Linkage Rod & Flapper Door Kinematics
  if (wgRod && wgFlapper) {
    const lift = state.wgLiftMm;
    const strokeX = (lift * 0.8).toFixed(1);
    wgRod.setAttribute("transform", `translate(${strokeX} 0)`);
    const flapAngle = (lift * 4.8).toFixed(1);
    wgFlapper.setAttribute("transform", `rotate(${flapAngle} ${D.wgPivot[0]} ${D.wgPivot[1]})`);
  }
}

// WebGL/Canvas Particle Flow Rendering
function renderGasFlow(dt) {
  if (!canvas) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  if (!running || state.turboRpm < 500) return;

  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  const speedScale = 0.4 + (state.turboRpm / 200000) * 1.8;

  // Path coordinates precalculated in D (screen points)
  const compIn = D.flowCompIn;     // [x, y] inlet
  const compVol = D.flowCompVol;   // [[x, y]...] spiral
  const compOut = D.flowCompOut;   // [x, y] discharge

  const turbIn = D.flowTurbIn;     // [x, y] exhaust inlet flange
  const turbVol = D.flowTurbVol;   // [[x, y]...] turbine spiral
  const turbOut = D.flowTurbOut;   // [x, y] v-band discharge
  const wastePort = D.flowWaste;   // [x, y] wastegate bypass

  // 1. Draw Cold Compressed Air Flow (Blue / Cyan)
  ctx.lineWidth = isLight ? 2.2 : 1.8;
  ctx.lineCap = "round";

  for (const p of particlesCold) {
    p.progress += p.speed * speedScale * dt;
    if (p.progress > 1) p.progress -= 1;

    // Sample along comp trajectory: In -> Volute -> Out
    let pt;
    const pr = p.progress;
    if (pr < 0.35) {
      const t = pr / 0.35;
      pt = lerp2(compIn, compVol[0], t);
    } else if (pr < 0.75) {
      const t = (pr - 0.35) / 0.4;
      const idx = Math.min(compVol.length - 2, Math.floor(t * (compVol.length - 1)));
      const subT = t * (compVol.length - 1) - idx;
      pt = lerp2(compVol[idx], compVol[idx + 1], subT);
    } else {
      const t = (pr - 0.75) / 0.25;
      pt = lerp2(compVol[compVol.length - 1], compOut, t);
    }

    const alpha = Math.sin(pr * Math.PI);
    ctx.strokeStyle = isLight
      ? `rgba(0, 95, 115, ${(alpha * 0.75).toFixed(2)})`
      : `rgba(0, 180, 216, ${(alpha * 0.85).toFixed(2)})`;

    ctx.beginPath();
    ctx.arc(pt[0] + p.offset * (1 - pr), pt[1], 1.6, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 2. Draw Hot Exhaust Gas Stream (Incandescent Red -> Orange -> Yellow)
  // Color depends on EGT
  const egt = state.egtC;
  let hotColor;
  if (isLight) {
    hotColor = egt > 850 ? "rgba(186, 34, 0," : "rgba(217, 56, 0,";
  } else {
    hotColor = egt > 900 ? "rgba(255, 170, 34," : egt > 750 ? "rgba(255, 119, 0," : "rgba(204, 34, 0,";
  }

  for (const p of particlesHot) {
    p.progress += p.speed * speedScale * dt;
    if (p.progress > 1) p.progress -= 1;

    let pt;
    const pr = p.progress;
    if (pr < 0.3) {
      const t = pr / 0.3;
      pt = lerp2(turbIn, turbVol[0], t);
    } else if (pr < 0.7) {
      const t = (pr - 0.3) / 0.4;
      const idx = Math.min(turbVol.length - 2, Math.floor(t * (turbVol.length - 1)));
      const subT = t * (turbVol.length - 1) - idx;
      pt = lerp2(turbVol[idx], turbVol[idx + 1], subT);
    } else {
      const t = (pr - 0.7) / 0.3;
      pt = lerp2(turbVol[turbVol.length - 1], turbOut, t);
    }

    const alpha = Math.sin(pr * Math.PI);
    ctx.strokeStyle = `${hotColor} ${(alpha * (isLight ? 0.7 : 0.9)).toFixed(2)})`;

    ctx.beginPath();
    ctx.arc(pt[0] + p.offset * 0.8, pt[1], 1.8, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 3. Draw Wastegate Bypass Jet when Valve Cracks Open
  if (state.wgLiftMm > 0.2) {
    const bypassAlpha = Math.min(1.0, state.wgLiftMm / 3.0);
    for (const p of particlesWaste) {
      p.progress += p.speed * speedScale * 1.3 * dt;
      if (p.progress > 1) p.progress -= 1;

      const pt = lerp2(turbIn, wastePort, p.progress);
      const alpha = Math.sin(p.progress * Math.PI) * bypassAlpha;

      ctx.strokeStyle = isLight
        ? `rgba(186, 34, 0, ${(alpha * 0.8).toFixed(2)})`
        : `rgba(255, 68, 0, ${(alpha * 0.95).toFixed(2)})`;

      ctx.beginPath();
      ctx.arc(pt[0] + p.offset * 0.5, pt[1], 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function lerp2(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

// Exploded View Spring Simulation
function updateExplodedAssemblies(dt) {
  let anyMoving = false;
  for (const id of IDS) {
    const p = piece[id];
    if (!p) continue;
    if (p.pending !== null) {
      p.pending -= dt;
      if (p.pending <= 0) {
        p.pending = null;
        p.target = apart ? 1 : 0;
      }
    }
    // Damped harmonic oscillator
    const force = -SPRING.stiffness * (p.x - p.target) - SPRING.damping * p.v;
    p.v += force * dt;
    p.x += p.v * dt;

    if (Math.abs(p.x - p.target) > 0.001 || Math.abs(p.v) > 0.001) {
      anyMoving = true;
    } else {
      p.x = p.target;
      p.v = 0;
    }
  }

  // Apply transforms to SVG item nodes
  for (const node of nodes) {
    const p = piece[node.piece];
    if (!p) continue;
    const fraction = p.x;
    const dx = node.m[0] * fraction * D.EX[0] + node.m[1] * fraction * D.EY[0] + node.m[2] * fraction * D.EZ[0];
    const dy = node.m[0] * fraction * D.EX[1] + node.m[1] * fraction * D.EY[1] + node.m[2] * fraction * D.EZ[1];

    if (dx !== 0 || dy !== 0) {
      node.el.setAttribute("transform", `translate(${dx.toFixed(2)} ${dy.toFixed(2)})`);
    } else {
      node.el.removeAttribute("transform");
    }
  }

  return anyMoving;
}

function setApart(on) {
  if (apart === on) return;
  apart = on;
  apartBtn?.toggleAttribute("data-active", apart);

  let delay = 0;
  const list = on ? STAGGER : [...STAGGER].reverse();
  for (const id of list) {
    if (!piece[id]) continue;
    piece[id].pending = delay;
    delay += SPRING.stagger;
  }
}

function setCutaway(on) {
  cutaway = on;
  cutawayBtn?.toggleAttribute("data-active", cutaway);
  stage?.toggleAttribute("data-cutaway", cutaway);
}

function setThrottle(val) {
  targetThrottle = Math.max(0, Math.min(1, val));
  if (slider) slider.value = Math.round(targetThrottle * 100);
  if (throttleVal) throttleVal.textContent = `${Math.round(targetThrottle * 100)}%`;

  // Update preset buttons state
  presetBtns.forEach((btn) => {
    const pVal = Number(btn.dataset.preset);
    btn.toggleAttribute("data-active", Math.abs(pVal - targetThrottle) < 0.06);
  });
}

function selectPart(id) {
  selected = selected === id ? null : id;
  stage?.toggleAttribute("data-focus", Boolean(selected));

  for (const node of nodes) {
    node.el.toggleAttribute("data-on", selected ? node.piece === selected : false);
  }
  for (const btn of partBtns) {
    btn.toggleAttribute("data-on", btn.dataset.part === selected);
  }
}

// Main Animation Loop
function loop(time) {
  if (!lastTime) lastTime = time;
  const dt = Math.min((time - lastTime) / 1000, 1 / 20);
  lastTime = time;
  clock += dt;

  // Smooth throttle interpolation
  throttle += (targetThrottle - throttle) * (1 - Math.exp(-dt / 0.15));

  computeTurboPhysics(throttle, dt);
  updateTelemetryUI();
  updateSvgMechanisms(dt);
  renderGasFlow(dt);
  updateExplodedAssemblies(dt);

  frame = requestAnimationFrame(loop);
}

// Setup Event Listeners
runBtn?.addEventListener("click", () => {
  running = !running;
  runBtn.toggleAttribute("data-active", running);
  runBtn.querySelector("[data-run-label]").textContent = running ? "Spooling Run" : "Engine Idle";
});

apartBtn?.addEventListener("click", () => setApart(!apart));
cutawayBtn?.addEventListener("click", () => setCutaway(!cutaway));

slider?.addEventListener("input", (e) => {
  setThrottle(Number(e.target.value) / 100);
});

presetBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const val = Number(btn.dataset.preset);
    setThrottle(val);
  });
});

partBtns.forEach((btn) => {
  btn.addEventListener("click", () => selectPart(btn.dataset.part));
});

// Click on SVG nodes to inspect
front?.addEventListener("click", (e) => {
  const item = e.target.closest(".it");
  if (item && item.dataset.piece) {
    selectPart(item.dataset.piece);
  } else {
    selectPart(null);
  }
});

// Keyboard Accessibility
stage?.addEventListener("keydown", (e) => {
  if (e.key === " " || e.code === "Space") {
    e.preventDefault();
    running = !running;
    runBtn?.toggleAttribute("data-active", running);
  } else if (e.key === "e" || e.key === "E") {
    e.preventDefault();
    setApart(!apart);
  } else if (e.key === "c" || e.key === "C") {
    e.preventDefault();
    setCutaway(!cutaway);
  } else if (e.key === "ArrowUp" || e.key === "ArrowRight") {
    e.preventDefault();
    setThrottle(throttle + 0.05);
  } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
    e.preventDefault();
    setThrottle(throttle - 0.05);
  } else if (e.key >= "1" && e.key <= "5") {
    const presets = [0.0, 0.25, 0.55, 0.8, 1.0];
    setThrottle(presets[Number(e.key) - 1]);
  } else if (e.key === "Escape") {
    setApart(false);
    selectPart(null);
  }
});

// Canvas resizing
function resizeCanvas() {
  if (!canvas) return;
  const rect = stage.getBoundingClientRect();
  canvas.width = D.W;
  canvas.height = D.H;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// Initial states
runBtn?.toggleAttribute("data-active", running);
setThrottle(0.55);

// Start loop
frame = requestAnimationFrame(loop);
