const D = __DATA__;
const root = document.querySelector(".loco-figure");
const stage = root.querySelector(".loco-stage");
const front = stage.querySelector(".loco-front");
const assembly = front.querySelector(".loco-assembly");
const fireboxCanvas = stage.querySelector(".loco-firebox-gl");
const plumeCanvas = stage.querySelector(".loco-plume-gl");
const veilCanvas = stage.querySelector(".loco-veil-gl");
const live = root.querySelector("[data-live]");
const readout = root.querySelector("[data-readout]");

// Controls
const runBtn = root.querySelector("[data-run]");
const runLabel = root.querySelector("[data-run-label]");
const apartBtn = root.querySelector("[data-apart]");
const apartLabel = root.querySelector("[data-apart-label]");
const cutawayBtn = root.querySelector("[data-cutaway]");
const cutawayLabel = root.querySelector("[data-cutaway-label]");
const fireBtn = root.querySelector("[data-fire]");
const regulatorSlider = root.querySelector("[data-regulator-slider]");
const regulatorVal = root.querySelector("[data-regulator-val]");
const reverserSlider = root.querySelector("[data-reverser-slider]");
const reverserVal = root.querySelector("[data-reverser-val]");
const presetBtns = [...root.querySelectorAll(".loco-preset-btn")];
const partBtns = [...root.querySelectorAll(".loco-part-btn")];

// Telemetry
const teleBoiler = root.querySelector("[data-tele-boiler]");
const teleChest = root.querySelector("[data-tele-chest]");
const teleTemp = root.querySelector("[data-tele-temp]");
const teleSpeed = root.querySelector("[data-tele-speed]");
const teleForce = root.querySelector("[data-tele-force]");
const teleDraft = root.querySelector("[data-tele-draft]");

const still = matchMedia("(prefers-reduced-motion: reduce)");

// Extract SVG items for staggered explode and depth re-sorting
const nodes = [...assembly.querySelectorAll(".it")].map((el) => {
  const m = el.dataset.m ? el.dataset.m.split(",").map(Number) : [0, 0, 0];
  const lift = m[0] * D.V[0] + m[1] * D.V[1] + m[2] * D.V[2];
  return {
    el,
    name: el.dataset.name || "",
    piece: el.dataset.piece,
    ride: el.dataset.ride || el.dataset.piece,
    key: Number(el.dataset.k || 0),
    m,
    lift,
    index: Number(el.dataset.i || 0),
    shown: "",
  };
});

let order = nodes.map((_, index) => index);
const IDS = Object.keys(D.pieces);
const STAGGER = D.stagger;
const SPRING = D.spring;
const piece = Object.fromEntries(IDS.map((id) => [id, { x: 0, v: 0, target: 0, pending: null }]));

// Engine Simulation State
let running = true;
let apart = false;
let cutaway = true;
let selected = null;
let clock = 0;
let lastTime = performance.now();

// Thermodynamic & Kinematic Variables
let regulator = 0.75; // 0.0 to 1.0
let reverser = 0.25;  // -0.75 to +0.75
let boilerPressure = 225.0; // PSI
let steamChestPressure = 170.0; // PSI
let superheatTemp = 365.0; // °C
let wheelAngle = 0; // radians
let speedMph = 65.4; // mph
let wheelRpm = 278.0; // rpm
let tractiveForce = 24500; // lbf
let chuffPulse = 0; // 0 to 1 pulse for exhaust puffing
let chuffRate = 18.5; // chuffs per second
let smokeboxDraft = 4.8; // in H2O
let coalGlow = 0.85; // 0 to 1
let coalShovelTimer = 0;

// Presets
const PRESETS = {
  idle:   { reg: 0.0,  rev: 0.75, speed: 0.0,  boiler: 220, temp: 205, glow: 0.4 },
  start:  { reg: 0.65, rev: 0.75, speed: 8.5,  boiler: 225, temp: 290, glow: 0.95 },
  accel:  { reg: 0.85, rev: 0.45, speed: 38.0, boiler: 222, temp: 340, glow: 0.9 },
  cruise: { reg: 0.75, rev: 0.25, speed: 65.4, boiler: 225, temp: 365, glow: 0.85 },
  drift:  { reg: 0.0,  rev: 0.15, speed: 52.0, boiler: 228, temp: 330, glow: 0.5 },
};

function say(text) {
  if (readout.textContent !== text) readout.textContent = text;
}

function updateAria() {
  const status = apart
    ? "Exploded view · 10 subsystems"
    : running
    ? `Running at ${speedMph.toFixed(1)} MPH · ${boilerPressure.toFixed(0)} PSI Boiler Pressure`
    : "Paused · Running gear stopped";
  stage.setAttribute("aria-valuetext", status);
  if (live) live.textContent = status;
}

// ---------------------------------------------------------------------------
// GROUPING MOVING ELEMENTS FOR KINEMATICS
// ---------------------------------------------------------------------------
const animGroups = {
  // Driving wheels (Right & Left)
  driverRearR: [],
  driverRearL: [],
  driverMainR: [],
  driverMainL: [],
  driverFrontR: [],
  driverFrontL: [],

  // Bogie, Trailing & Dyno Rollers
  bogie1R: [],
  bogie1L: [],
  bogie2R: [],
  bogie2L: [],
  trailR: [],
  trailL: [],
  dynoR: [],
  dynoL: [],

  // Outside Motion Linkage (Right Y=36, Left Y=-36)
  sideRodsR: [],
  sideRodsL: [],
  mainRodsR: [],
  mainRodsL: [],
  crossheadsR: [],
  crossheadsL: [],
  pistonRodsR: [],
  pistonRodsL: [],
  eccCranksR: [],
  eccCranksL: [],
  eccRodsR: [],
  eccRodsL: [],
  expLinksR: [],
  expLinksL: [],
  radRodsR: [],
  radRodsL: [],
  combLeversR: [],
  combLeversL: [],
  unionLinksR: [],
  unionLinksL: [],
  valveStemsR: [],
  valveStemsL: [],
};

for (const n of nodes) {
  const nm = n.name;
  if (!nm) continue;

  // Rear Driver (X = -32)
  if (nm.startsWith("wheels.spoke_-32_23.5") || nm === "wheels.counterweight_-32_23.5" || nm === "wheels.crankpin_-32_23.5") {
    animGroups.driverRearR.push(n);
  } else if (nm.startsWith("wheels.spoke_-32_-23.5") || nm === "wheels.counterweight_-32_-23.5" || nm === "wheels.crankpin_-32_-23.5") {
    animGroups.driverRearL.push(n);
  }
  // Main Driver (X = 10)
  else if (nm.startsWith("wheels.spoke_10_23.5") || nm === "wheels.counterweight_10_23.5" || nm === "wheels.crankpin_10_23.5") {
    animGroups.driverMainR.push(n);
  } else if (nm.startsWith("wheels.spoke_10_-23.5") || nm === "wheels.counterweight_10_-23.5" || nm === "wheels.crankpin_10_-23.5") {
    animGroups.driverMainL.push(n);
  }
  // Front Driver (X = 52)
  else if (nm.startsWith("wheels.spoke_52_23.5") || nm === "wheels.counterweight_52_23.5" || nm === "wheels.crankpin_52_23.5") {
    animGroups.driverFrontR.push(n);
  } else if (nm.startsWith("wheels.spoke_52_-23.5") || nm === "wheels.counterweight_52_-23.5" || nm === "wheels.crankpin_52_-23.5") {
    animGroups.driverFrontL.push(n);
  }
  // Bogie wheels (X = 96, 120)
  else if (nm.startsWith("wheels.bogie_wheel_96_23.5") || nm === "wheels.bogie_hub_96_23.5") {
    animGroups.bogie1R.push(n);
  } else if (nm.startsWith("wheels.bogie_wheel_96_-23.5") || nm === "wheels.bogie_hub_96_-23.5") {
    animGroups.bogie1L.push(n);
  } else if (nm.startsWith("wheels.bogie_wheel_120_23.5") || nm === "wheels.bogie_hub_120_23.5") {
    animGroups.bogie2R.push(n);
  } else if (nm.startsWith("wheels.bogie_wheel_120_-23.5") || nm === "wheels.bogie_hub_120_-23.5") {
    animGroups.bogie2L.push(n);
  }
  // Trailing wheels (X = -82)
  else if (nm.startsWith("wheels.trailing_wheel_23.5")) {
    animGroups.trailR.push(n);
  } else if (nm.startsWith("wheels.trailing_wheel_-23.5")) {
    animGroups.trailL.push(n);
  }
  // Dynamometer Rollers
  else if (nm.startsWith("track.dyno_drum_") && nm.endsWith("_22")) {
    animGroups.dynoR.push(n);
  } else if (nm.startsWith("track.dyno_drum_") && nm.endsWith("_-22")) {
    animGroups.dynoL.push(n);
  }
  // Motion Linkages
  else if (nm.startsWith("motion.side_rod_36")) animGroups.sideRodsR.push(n);
  else if (nm.startsWith("motion.side_rod_-36")) animGroups.sideRodsL.push(n);
  else if (nm.startsWith("motion.main_rod_36")) animGroups.mainRodsR.push(n);
  else if (nm.startsWith("motion.main_rod_-36")) animGroups.mainRodsL.push(n);
  else if (nm.startsWith("motion.crosshead_36")) animGroups.crossheadsR.push(n);
  else if (nm.startsWith("motion.crosshead_-36")) animGroups.crossheadsL.push(n);
  else if (nm.startsWith("motion.piston_rod_36")) animGroups.pistonRodsR.push(n);
  else if (nm.startsWith("motion.piston_rod_-36")) animGroups.pistonRodsL.push(n);
  else if (nm.startsWith("motion.eccentric_crank_36")) animGroups.eccCranksR.push(n);
  else if (nm.startsWith("motion.eccentric_crank_-36")) animGroups.eccCranksL.push(n);
  else if (nm.startsWith("motion.eccentric_rod_36")) animGroups.eccRodsR.push(n);
  else if (nm.startsWith("motion.eccentric_rod_-36")) animGroups.eccRodsL.push(n);
  else if (nm.startsWith("motion.expansion_link_36")) animGroups.expLinksR.push(n);
  else if (nm.startsWith("motion.expansion_link_-36")) animGroups.expLinksL.push(n);
  else if (nm.startsWith("motion.radius_rod_36")) animGroups.radRodsR.push(n);
  else if (nm.startsWith("motion.radius_rod_-36")) animGroups.radRodsL.push(n);
  else if (nm.startsWith("motion.combination_lever_36")) animGroups.combLeversR.push(n);
  else if (nm.startsWith("motion.combination_lever_-36")) animGroups.combLeversL.push(n);
  else if (nm.startsWith("motion.union_link_36")) animGroups.unionLinksR.push(n);
  else if (nm.startsWith("motion.union_link_-36")) animGroups.unionLinksL.push(n);
  else if (nm.startsWith("motion.valve_stem_36")) animGroups.valveStemsR.push(n);
  else if (nm.startsWith("motion.valve_stem_-36")) animGroups.valveStemsL.push(n);
}

// ---------------------------------------------------------------------------
// ISOMETRIC ROTATION & AFFINE TRANSFORMS
// ---------------------------------------------------------------------------
// Calculates 2D SVG affine transform matrix for exact 3D rotation in X-Z vertical plane
function isoRotMatrix(theta) {
  const m00 = D.EX[0], m01 = D.EZ[0];
  const m10 = D.EX[1], m11 = D.EZ[1];
  const det = m00 * m11 - m01 * m10;
  const c = Math.cos(theta), s = Math.sin(theta);

  const inv00 =  m11 / det, inv01 = -m01 / det;
  const inv10 = -m10 / det, inv11 =  m00 / det;

  const r00 = c * inv00 - s * inv10;
  const r01 = c * inv01 - s * inv11;
  const r10 = s * inv00 + c * inv10;
  const r11 = s * inv01 + c * inv11;

  const a = m00 * r00 + m01 * r10;
  const b = m10 * r00 + m11 * r10;
  const c_ = m00 * r01 + m01 * r11;
  const d = m10 * r01 + m11 * r11;

  return [a, b, c_, d];
}

function rotAround(mat, pt) {
  if (!pt || !mat || typeof pt[0] !== "number" || typeof pt[1] !== "number") return "";
  const [a, b, c_, d] = mat;
  const cx = pt[0], cy = pt[1];
  const tx = cx - (a * cx + c_ * cy);
  const ty = cy - (b * cx + d * cy);
  return `matrix(${a.toFixed(5)}, ${b.toFixed(5)}, ${c_.toFixed(5)}, ${d.toFixed(5)}, ${tx.toFixed(2)}, ${ty.toFixed(2)})`;
}

// ---------------------------------------------------------------------------
// KINEMATICS SOLVER FOR WALSCHAERTS VALVE GEAR & COUPLED DRIVERS
// ---------------------------------------------------------------------------
function solveKinematics(angleR) {
  const transforms = new Map();
  if (!D || !D.centers) return transforms;
  const crankR = 13.0;
  const rodL = 51.0;
  const C = D.centers;

  // Process side (Right = true, Left = false)
  const sides = [
    { isRight: true, theta: angleR, suffix: "R" },
    { isRight: false, theta: angleR - Math.PI * 0.5, suffix: "L" }, // 90° quartering phase
  ];

  for (const { isRight, theta, suffix } of sides) {
    const rotMat = isoRotMatrix(theta);

    // 1. Driving Wheels (Rear, Main, Front)
    const tRear = rotAround(rotMat, C[`driverRear${suffix}`]);
    const tMain = rotAround(rotMat, C[`driverMain${suffix}`]);
    const tFront = rotAround(rotMat, C[`driverFront${suffix}`]);

    for (const n of animGroups[`driverRear${suffix}`]) transforms.set(n, tRear);
    for (const n of animGroups[`driverMain${suffix}`]) transforms.set(n, tMain);
    for (const n of animGroups[`driverFront${suffix}`]) transforms.set(n, tFront);

    // 2. Bogie Wheels (rotate 2x faster due to half diameter)
    const rotBogie = isoRotMatrix(theta * 2.0);
    const tBogie1 = rotAround(rotBogie, C[`bogie1${suffix}`]);
    const tBogie2 = rotAround(rotBogie, C[`bogie2${suffix}`]);
    for (const n of animGroups[`bogie1${suffix}`]) transforms.set(n, tBogie1);
    for (const n of animGroups[`bogie2${suffix}`]) transforms.set(n, tBogie2);

    // 3. Trailing Wheels
    const rotTrail = isoRotMatrix(theta * (32 / 18));
    const tTrail = rotAround(rotTrail, C[`trail${suffix}`]);
    for (const n of animGroups[`trail${suffix}`]) transforms.set(n, tTrail);

    // 4. Dynamometer Rollers (counter-rotate)
    const rotDyno = isoRotMatrix(-theta * (32 / 6.8));
    const tDyno = rotAround(rotDyno, C[`dynoMain${suffix}`] || C[`dynoMainR`]);
    for (const n of animGroups[`dyno${suffix}`]) transforms.set(n, tDyno);

    // 5. Side Coupling Rods (circular parallel translation of crankpins)
    const cpDx = crankR * Math.cos(theta) - crankR;
    const cpDz = crankR * Math.sin(theta);
    const sideTx = cpDx * D.EX[0] + cpDz * D.EZ[0];
    const sideTy = cpDx * D.EX[1] + cpDz * D.EZ[1];
    const tSide = `translate(${sideTx.toFixed(2)} ${sideTy.toFixed(2)})`;
    for (const n of animGroups[`sideRods${suffix}`]) transforms.set(n, tSide);

    // 6. Crosshead & Piston Rod (slider-crank reciprocating along X)
    const curCpX = 10 + crankR * Math.cos(theta);
    const curCpZ = 10 + crankR * Math.sin(theta);
    const curXhX = curCpX + Math.sqrt(Math.max(1, rodL * rodL - Math.pow(curCpZ - 10, 2)));
    const deltaXh = curXhX - 60.3; // displacement from rest midpoint (approx ±13 units)
    const xhTx = deltaXh * D.EX[0];
    const xhTy = deltaXh * D.EX[1];
    const tCrosshead = `translate(${xhTx.toFixed(2)} ${xhTy.toFixed(2)})`;

    for (const n of animGroups[`crossheads${suffix}`]) transforms.set(n, tCrosshead);
    for (const n of animGroups[`pistonRods${suffix}`]) transforms.set(n, tCrosshead);
    for (const n of animGroups[`unionLinks${suffix}`]) transforms.set(n, tCrosshead);

    // 7. Main Connecting Rod (orbits with crankpin and tilts toward crosshead)
    const midX = (curCpX + curXhX) * 0.5;
    const midZ = (curCpZ + 10) * 0.5;
    const deltaMidX = midX - 42.0;
    const deltaMidZ = midZ - 10.0;
    const rodPitch = -Math.asin((curCpZ - 10) / rodL); // tilt angle in radians
    const rodPitchMat = isoRotMatrix(rodPitch);
    const baseMain = C[`driverMain${suffix}`] || C[`driverMainR`];
    const rodMidScreen = baseMain ? [
      baseMain[0] + 25.5 * D.EX[0],
      baseMain[1] + 25.5 * D.EX[1],
    ] : [0, 0];
    const rodMidShiftX = deltaMidX * D.EX[0] + deltaMidZ * D.EZ[0];
    const rodMidShiftY = deltaMidX * D.EX[1] + deltaMidZ * D.EZ[1];
    const tMainRod = `translate(${rodMidShiftX.toFixed(2)} ${rodMidShiftY.toFixed(2)}) ${rotAround(rodPitchMat, rodMidScreen)}`;
    for (const n of animGroups[`mainRods${suffix}`]) transforms.set(n, tMainRod);

    // 8. Walschaerts Valve Gear:
    // Eccentric crank is clamped to main pin; rotating around axle matches crank motion
    for (const n of animGroups[`eccCranks${suffix}`]) transforms.set(n, tMain);

    // Expansion link rocks around trunnion at (28, 22)
    const linkAngle = Math.sin(theta + Math.PI * 0.5) * (14.0 * Math.PI / 180);
    const tExpLink = rotAround(isoRotMatrix(linkAngle), C[`expLink${suffix}`]);
    for (const n of animGroups[`expLinks${suffix}`]) transforms.set(n, tExpLink);

    // Eccentric rod translates between crankpin and link tail
    const eccShiftX = (cpDx * 0.6) * D.EX[0] + (cpDz * 0.6) * D.EZ[0];
    const eccShiftY = (cpDx * 0.6) * D.EX[1] + (cpDz * 0.6) * D.EZ[1];
    const tEccRod = `translate(${eccShiftX.toFixed(2)} ${eccShiftY.toFixed(2)})`;
    for (const n of animGroups[`eccRods${suffix}`]) transforms.set(n, tEccRod);

    // Radius rod travel depends on reverser cutoff setting
    const radTravel = (linkAngle / (14.0 * Math.PI / 180)) * reverser * 7.5 + deltaXh * 0.12;
    const radTx = radTravel * D.EX[0];
    const radTy = radTravel * D.EX[1];
    const tRadRod = `translate(${radTx.toFixed(2)} ${radTy.toFixed(2)})`;
    for (const n of animGroups[`radRods${suffix}`]) transforms.set(n, tRadRod);

    // Combination lever & valve spool travel
    const valveTravel = radTravel * 0.75 + deltaXh * 0.22;
    const valveTx = valveTravel * D.EX[0];
    const valveTy = valveTravel * D.EX[1];
    const tValve = `translate(${valveTx.toFixed(2)} ${valveTy.toFixed(2)})`;

    for (const n of animGroups[`combLevers${suffix}`]) transforms.set(n, `translate(${(valveTx * 0.8).toFixed(2)} ${(valveTy * 0.8).toFixed(2)})`);
    for (const n of animGroups[`valveStems${suffix}`]) transforms.set(n, tValve);
  }

  return transforms;
}

// ---------------------------------------------------------------------------
// STAGGERED EXPLODE LOGIC
// ---------------------------------------------------------------------------
function setApart(on) {
  if (apart === on) return;
  apart = on;
  apartBtn.dataset.active = on ? "true" : "false";
  apartLabel.textContent = on ? "Assemble View" : "Explode View";

  const goal = on ? 1 : 0;
  const list = on ? STAGGER : [...STAGGER].reverse();
  list.forEach((id, i) => {
    if (piece[id]) {
      piece[id].target = goal;
      piece[id].pending = clock + i * SPRING.stagger;
    }
  });
  updateAria();
}

function stepSprings(dt) {
  const k = SPRING.stiffness;
  const c = SPRING.damping;
  for (const id of IDS) {
    const p = piece[id];
    if (p.pending !== null && clock >= p.pending) {
      p.pending = null;
    }
    if (p.pending === null) {
      const d = p.target - p.x;
      const f = d * k - p.v * c;
      p.v += f * dt;
      p.x += p.v * dt;
      if (Math.abs(d) < 0.001 && Math.abs(p.v) < 0.001) {
        p.x = p.target;
        p.v = 0;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// UNIFIED FRAME RENDERER: COMBINES EXPLODE & KINEMATICS
// ---------------------------------------------------------------------------
function renderAll(kinMap) {
  for (const n of nodes) {
    const share = piece[n.ride] ? piece[n.ride].x : 0;
    const exX = n.m[0] * share * D.EX[0] + n.m[1] * share * D.EY[0] + n.m[2] * share * D.EZ[0];
    const exY = n.m[0] * share * D.EX[1] + n.m[1] * share * D.EY[1] + n.m[2] * share * D.EZ[1];
    const exStr = Math.abs(exX) > 0.01 || Math.abs(exY) > 0.01 ? `translate(${exX.toFixed(2)} ${exY.toFixed(2)})` : "";

    const kStr = kinMap ? kinMap.get(n) || "" : "";

    const full = exStr && kStr ? `${exStr} ${kStr}` : exStr || kStr;
    if (full !== n.shown) {
      n.shown = full;
      if (full) n.el.setAttribute("transform", full);
      else n.el.removeAttribute("transform");
    }
  }

  // Dynamic depth re-sorting during explode
  const next = nodes.map((_, index) => index).sort((a, b) => {
    const ka = nodes[a].key + nodes[a].lift * piece[nodes[a].ride].x;
    const kb = nodes[b].key + nodes[b].lift * piece[nodes[b].ride].x;
    return ka - kb;
  });

  if (next.some((index, at) => index !== order[at])) {
    const fragment = document.createDocumentFragment();
    for (const index of next) fragment.appendChild(nodes[index].el);
    assembly.appendChild(fragment);
    order = next;
  }
}

// ---------------------------------------------------------------------------
// THERMODYNAMIC CYCLE & TELEMETRY
// ---------------------------------------------------------------------------
function updateThermodynamics(dt) {
  if (running) {
    // 79-inch driver circumference = 20.68 feet
    const radPerSec = (speedMph * 88 / 20.68) * (Math.PI * 2) * (reverser >= 0 ? 1 : -1);
    wheelAngle += radPerSec * dt;
    wheelRpm = Math.abs(speedMph * 88 / 20.68) * 60;
  }

  // Fire coal cooldown / shoveling effect
  if (coalShovelTimer > 0) {
    coalShovelTimer -= dt;
    coalGlow = Math.min(1.0, coalGlow + dt * 0.5);
  } else {
    coalGlow = Math.max(0.4, coalGlow - dt * 0.015);
  }

  // Steam chest pressure scales with regulator throttle
  steamChestPressure = regulator * boilerPressure * 0.95;

  // Smokebox vacuum draft proportional to steam exhaust velocity
  const steamFlow = (regulator * Math.abs(reverser) * wheelRpm) / 300;
  smokeboxDraft = Math.max(0.5, steamFlow * 5.8 + (running ? 1.0 : 0.2));

  // Superheater temperature reaches up to 375°C under high draft and load
  const targetTemp = 200 + regulator * 140 + (smokeboxDraft / 6.0) * 35;
  superheatTemp += (targetTemp - superheatTemp) * Math.min(1.0, dt * 0.8);

  // Mean effective pressure & tractive force
  const mepRatio = Math.max(0.12, Math.abs(reverser) * (1.0 - speedMph * 0.006));
  tractiveForce = Math.round(regulator * mepRatio * 38500);

  // Train resistance and speed adjustment
  if (running && Math.abs(reverser) > 0.01 && regulator > 0.02) {
    const targetSpeed = Math.max(0, (regulator * 88.0) * (Math.abs(reverser) / 0.75) * 1.05);
    speedMph += (targetSpeed - speedMph) * Math.min(1.0, dt * 0.5);
  } else if (!running || regulator <= 0.02) {
    speedMph = Math.max(0, speedMph - dt * 4.5);
  }

  // Exhaust Chuff Cycle (4 chuffs per wheel rev, 2 per cylinder)
  chuffRate = Math.max(0.8, (wheelRpm / 60) * 4);
  const chuffPhase = (wheelAngle * 4 / (Math.PI * 2)) % 1;
  chuffPulse = Math.exp(-Math.pow((chuffPhase - 0.2) * 5.0, 2));

  // Update UI Telemetry fields
  if (teleBoiler) teleBoiler.textContent = `${boilerPressure.toFixed(0)} PSI (${(boilerPressure * 0.06895).toFixed(1)} bar)`;
  if (teleChest) teleChest.textContent = `${steamChestPressure.toFixed(0)} PSI`;
  if (teleTemp) teleTemp.textContent = `${superheatTemp.toFixed(0)} °C (${(superheatTemp * 1.8 + 32).toFixed(0)} °F)`;
  if (teleSpeed) teleSpeed.textContent = `${speedMph.toFixed(1)} MPH (${wheelRpm.toFixed(0)} RPM)`;
  if (teleForce) teleForce.textContent = `${tractiveForce.toLocaleString()} lbf (${(tractiveForce * 0.004448).toFixed(1)} kN)`;
  if (teleDraft) teleDraft.textContent = `${chuffRate.toFixed(1)} chuffs/s · ${smokeboxDraft.toFixed(1)} in H₂O`;

  // Corner Live Readout
  say(`${boilerPressure.toFixed(0)} PSI · ${superheatTemp.toFixed(0)} °C Superheat · ${speedMph.toFixed(1)} MPH · ${tractiveForce.toLocaleString()} lbf`);
}

// ---------------------------------------------------------------------------
// WEBGL SHADERS: FIREBOX COAL COMBUSTION & SMOKEBOX CHIMNEY EXHAUST PLUME
// ---------------------------------------------------------------------------
function initWebGL() {
  if (still.matches) return null;

  const glOptions = { alpha: true, antialias: true, premultipliedAlpha: true };
  const glPlume = plumeCanvas.getContext("webgl", glOptions);
  const glFire = fireboxCanvas.getContext("webgl", glOptions);

  if (!glPlume || !glFire) return null;

  const VS = `
    attribute vec2 aPos;
    void main() {
      gl_Position = vec4(aPos, 0.0, 1.0);
    }
  `;

  const FS_PLUME = `
    precision mediump float;
    uniform vec2 uCanvas;
    uniform vec2 uChimney;
    uniform float uTime;
    uniform float uSpeed;
    uniform float uChuff;
    uniform float uDraft;
    uniform float uTheme;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }
    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    float fbm(vec2 p) {
      float v = 0.0;
      v += 0.5 * noise(p); p *= 2.02;
      v += 0.25 * noise(p); p *= 2.03;
      v += 0.125 * noise(p); p *= 2.01;
      return v;
    }

    void main() {
      vec2 pt = gl_FragCoord.xy;
      vec2 chim = vec2(uChimney.x, uCanvas.y - uChimney.y);
      vec2 d = pt - chim;

      float windTrail = uSpeed * 0.045;
      float xShift = d.x + d.y * windTrail;
      float yUp = d.y;

      if (yUp < 0.0 || yUp > 420.0 || abs(xShift) > (30.0 + yUp * 0.65)) {
        discard;
      }

      float coneRadius = 14.0 + yUp * 0.38;
      float distToAxis = abs(xShift) / coneRadius;
      if (distToAxis > 1.0) discard;

      float chuffWave = sin(yUp * 0.06 - uTime * (uSpeed * 0.12 + 6.0));
      float puffMod = 0.75 + 0.25 * chuffWave + uChuff * 0.35;

      vec2 np = vec2(xShift * 0.035, yUp * 0.025 - uTime * 2.2);
      float n = fbm(np);
      float density = smoothstep(1.0, 0.15, distToAxis) * (1.0 - yUp / 420.0) * n * puffMod;

      if (density < 0.03) discard;

      if (uTheme > 0.5) {
        float alpha = clamp(density * 0.65, 0.0, 0.82);
        vec3 ink = vec3(0.18, 0.20, 0.24);
        gl_FragColor = vec4(ink * alpha, alpha);
      } else {
        float glowFactor = clamp((60.0 - yUp) / 60.0, 0.0, 1.0) * (uDraft / 6.0);
        vec3 col = mix(vec3(0.88, 0.92, 0.96), vec3(1.0, 0.65, 0.25), glowFactor * 0.6);
        float alpha = clamp(density * 0.75, 0.0, 0.85);
        gl_FragColor = vec4(col * alpha, alpha);
      }
    }
  `;

  const FS_FIRE = `
    precision mediump float;
    uniform vec2 uCanvas;
    uniform vec2 uFireDoor;
    uniform float uTime;
    uniform float uGlow;
    uniform float uDraft;
    uniform float uTheme;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(17.1, 43.7))) * 38241.2); }
    float noise(vec2 p) {
      vec2 i = floor(p); vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    float fbm(vec2 p) {
      return 0.5 * noise(p) + 0.25 * noise(p * 2.0) + 0.125 * noise(p * 4.0);
    }

    void main() {
      vec2 pt = gl_FragCoord.xy;
      vec2 door = vec2(uFireDoor.x, uCanvas.y - uFireDoor.y);
      vec2 d = pt - door;

      float r = length(d / vec2(38.0, 26.0));
      if (r > 1.0) discard;

      float t = uTime * (3.0 + uDraft * 0.8);
      float flame = fbm(vec2(d.x * 0.08, d.y * 0.08 - t));
      float intensity = smoothstep(1.0, 0.2, r) * (0.6 + 0.4 * flame) * uGlow;

      if (uTheme > 0.5) {
        vec3 col = mix(vec3(0.9, 0.25, 0.05), vec3(1.0, 0.7, 0.1), intensity);
        float alpha = clamp(intensity * 0.85, 0.0, 0.9);
        gl_FragColor = vec4(col * alpha, alpha);
      } else {
        vec3 col = mix(vec3(0.95, 0.25, 0.02), vec3(1.0, 0.92, 0.65), smoothstep(0.4, 0.9, intensity));
        float alpha = clamp(intensity * 0.95, 0.0, 0.95);
        gl_FragColor = vec4(col * alpha, alpha);
      }
    }
  `;

  function createProg(gl, fsSource) {
    const p = gl.createProgram();
    const vs = gl.createShader(gl.VERTEX_SHADER);
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(vs, VS);
    gl.compileShader(vs);
    gl.shaderSource(fs, fsSource);
    gl.compileShader(fs);
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    return { p, buf };
  }

  const plumeProg = createProg(glPlume, FS_PLUME);
  const fireProg = createProg(glFire, FS_FIRE);

  function resize() {
    const rect = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);

    for (const c of [plumeCanvas, fireboxCanvas, veilCanvas]) {
      if (c && (c.width !== w || c.height !== h)) {
        c.width = w;
        c.height = h;
      }
    }
  }

  function render(time) {
    resize();
    const isLight = root.closest(".iso[data-theme='light']") !== null ? 1.0 : 0.0;
    const w = plumeCanvas.width;
    const h = plumeCanvas.height;

    const scaleX = w / D.W;
    const scaleY = h / D.H;
    const chimX = D.chimneyExit[0] * scaleX;
    const chimY = D.chimneyExit[1] * scaleY;
    const doorX = D.fireboxDoor[0] * scaleX;
    const doorY = D.fireboxDoor[1] * scaleY;

    // Plume Shader
    glPlume.viewport(0, 0, w, h);
    glPlume.clearColor(0, 0, 0, 0);
    glPlume.clear(glPlume.COLOR_BUFFER_BIT);
    glPlume.useProgram(plumeProg.p);

    const aPosPlume = glPlume.getAttribLocation(plumeProg.p, "aPos");
    glPlume.bindBuffer(glPlume.ARRAY_BUFFER, plumeProg.buf);
    glPlume.enableVertexAttribArray(aPosPlume);
    glPlume.vertexAttribPointer(aPosPlume, 2, glPlume.FLOAT, false, 0, 0);

    glPlume.uniform2f(glPlume.getUniformLocation(plumeProg.p, "uCanvas"), w, h);
    glPlume.uniform2f(glPlume.getUniformLocation(plumeProg.p, "uChimney"), chimX, chimY);
    glPlume.uniform1f(glPlume.getUniformLocation(plumeProg.p, "uTime"), time);
    glPlume.uniform1f(glPlume.getUniformLocation(plumeProg.p, "uSpeed"), speedMph);
    glPlume.uniform1f(glPlume.getUniformLocation(plumeProg.p, "uChuff"), chuffPulse);
    glPlume.uniform1f(glPlume.getUniformLocation(plumeProg.p, "uDraft"), smokeboxDraft);
    glPlume.uniform1f(glPlume.getUniformLocation(plumeProg.p, "uTheme"), isLight);

    glPlume.drawArrays(glPlume.TRIANGLE_STRIP, 0, 4);

    // Firebox Shader
    glFire.viewport(0, 0, w, h);
    glFire.clearColor(0, 0, 0, 0);
    glFire.clear(glFire.COLOR_BUFFER_BIT);
    glFire.useProgram(fireProg.p);

    const aPosFire = glFire.getAttribLocation(fireProg.p, "aPos");
    glFire.bindBuffer(glFire.ARRAY_BUFFER, fireProg.buf);
    glFire.enableVertexAttribArray(aPosFire);
    glFire.vertexAttribPointer(aPosFire, 2, glFire.FLOAT, false, 0, 0);

    glFire.uniform2f(glFire.getUniformLocation(fireProg.p, "uCanvas"), w, h);
    glFire.uniform2f(glFire.getUniformLocation(fireProg.p, "uFireDoor"), doorX, doorY);
    glFire.uniform1f(glFire.getUniformLocation(fireProg.p, "uTime"), time);
    glFire.uniform1f(glFire.getUniformLocation(fireProg.p, "uGlow"), coalGlow);
    glFire.uniform1f(glFire.getUniformLocation(fireProg.p, "uDraft"), smokeboxDraft);
    glFire.uniform1f(glFire.getUniformLocation(fireProg.p, "uTheme"), isLight);

    glFire.drawArrays(glFire.TRIANGLE_STRIP, 0, 4);
  }

  return { render };
}

const glEngine = initWebGL();

// ---------------------------------------------------------------------------
// INTERACTION HANDLERS & LISTENERS
// ---------------------------------------------------------------------------
runBtn.addEventListener("click", () => {
  running = !running;
  runBtn.dataset.active = running ? "true" : "false";
  runLabel.textContent = running ? "Running Gear" : "Gear Paused";
  updateAria();
});

apartBtn.addEventListener("click", () => {
  setApart(!apart);
});

cutawayBtn.addEventListener("click", () => {
  cutaway = !cutaway;
  stage.dataset.cutaway = cutaway ? "true" : "false";
  cutawayBtn.dataset.active = cutaway ? "true" : "false";
  cutawayLabel.textContent = cutaway ? "Boiler Cutaway" : "Closed Casing";
  updateAria();
});

fireBtn.addEventListener("click", () => {
  coalShovelTimer = 6.0;
  coalGlow = 1.0;
  boilerPressure = Math.min(230, boilerPressure + 4.0);
  fireBtn.dataset.active = "true";
  setTimeout(() => {
    fireBtn.dataset.active = "false";
  }, 600);
});

regulatorSlider.addEventListener("input", (e) => {
  regulator = Number(e.target.value) / 100;
  regulatorVal.textContent = `${Math.round(regulator * 100)}%`;
});

reverserSlider.addEventListener("input", (e) => {
  reverser = Number(e.target.value) / 100;
  const pct = Math.round(Math.abs(reverser) * 100);
  reverserVal.textContent = reverser >= 0 ? `+${pct}% Fwd` : `-${pct}% Rev`;
});

presetBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    presetBtns.forEach((b) => (b.dataset.active = "false"));
    btn.dataset.active = "true";

    const key = btn.dataset.preset;
    const p = PRESETS[key];
    if (p) {
      regulator = p.reg;
      reverser = p.rev;
      regulatorSlider.value = Math.round(regulator * 100);
      regulatorVal.textContent = `${Math.round(regulator * 100)}%`;
      reverserSlider.value = Math.round(reverser * 100);
      reverserVal.textContent = reverser >= 0 ? `+${Math.round(reverser * 100)}% Fwd` : `-${Math.round(Math.abs(reverser) * 100)}% Rev`;
      speedMph = p.speed;
      boilerPressure = p.boiler;
      superheatTemp = p.temp;
      coalGlow = p.glow;
      running = key !== "idle";
      runBtn.dataset.active = running ? "true" : "false";
      runLabel.textContent = running ? "Running Gear" : "Gear Paused";
      updateAria();
    }
  });
});

function selectPart(id) {
  selected = selected === id ? null : id;
  partBtns.forEach((b) => (b.dataset.selected = b.dataset.part === selected ? "true" : "false"));

  const allItems = assembly.querySelectorAll(".it");
  allItems.forEach((el) => {
    if (!selected) {
      el.classList.remove("dimmed", "highlighted");
    } else if (el.dataset.piece === selected) {
      el.classList.add("highlighted");
      el.classList.remove("dimmed");
    } else {
      el.classList.add("dimmed");
      el.classList.remove("highlighted");
    }
  });

  if (selected && D.pieces[selected]) {
    say(`${D.pieces[selected].name}: ${D.pieces[selected].say}`);
  } else {
    updateAria();
  }
}

partBtns.forEach((btn) => {
  btn.addEventListener("click", () => selectPart(btn.dataset.part));
});

assembly.addEventListener("mouseover", (e) => {
  const item = e.target.closest(".it");
  if (item && !selected) {
    const id = item.dataset.piece;
    if (D.pieces[id]) say(`${D.pieces[id].name}: ${D.pieces[id].say}`);
  }
});

assembly.addEventListener("mouseleave", () => {
  if (!selected) updateAria();
});

window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON") return;
  if (e.code === "Space") {
    e.preventDefault();
    running = !running;
    runBtn.dataset.active = running ? "true" : "false";
    runLabel.textContent = running ? "Running Gear" : "Gear Paused";
    updateAria();
  } else if (e.code === "KeyE") {
    setApart(!apart);
  } else if (e.code === "KeyC") {
    cutawayBtn.click();
  } else if (e.code === "KeyF") {
    fireBtn.click();
  } else if (e.code === "KeyR") {
    reverser = -reverser;
    reverserSlider.value = Math.round(reverser * 100);
    const pct = Math.round(Math.abs(reverser) * 100);
    reverserVal.textContent = reverser >= 0 ? `+${pct}% Fwd` : `-${pct}% Rev`;
  } else if (e.key >= "1" && e.key <= "5") {
    const keys = ["idle", "start", "accel", "cruise", "drift"];
    const idx = Number(e.key) - 1;
    if (presetBtns[idx]) presetBtns[idx].click();
  } else if (e.code === "Escape") {
    if (selected) selectPart(selected);
    else if (apart) setApart(false);
  }
});

// ---------------------------------------------------------------------------
// MAIN RAF ANIMATION LOOP
// ---------------------------------------------------------------------------
function tick(now) {
  try {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    clock += dt;

    stepSprings(dt);
    updateThermodynamics(dt);

    // Compute live kinematics transforms for wheels, linkage and rods
    const kinMap = solveKinematics(wheelAngle);

    // Apply unified transforms (explode + kinematics) to SVG DOM
    renderAll(kinMap);

    if (glEngine) {
      glEngine.render(clock);
    }
  } catch (err) {
    console.error("Locomotive animation tick error:", err);
  }

  requestAnimationFrame(tick);
}

// Initial setup
stage.dataset.cutaway = "true";
cutawayBtn.dataset.active = "true";
runBtn.dataset.active = "true";
requestAnimationFrame(tick);
