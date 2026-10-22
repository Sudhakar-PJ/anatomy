const D = __DATA__;
const root = document.querySelector(".bk");
const stage = root.querySelector(".bk-stage");
const front = stage.querySelector(".bk-front");
const assembly = front.querySelector(".bk-assembly");
const liveEl = root.querySelector("[data-live]");
const readout = root.querySelector("[data-readout]");

// Controls buttons
const playBtn = root.querySelector("[data-play]");
const playLabel = root.querySelector("[data-play-label]");
const apartBtn = root.querySelector("[data-apart]");
const xrayBtn = root.querySelector("[data-xray]");
const windBtn = root.querySelector("[data-wind]");
const cranesBtn = root.querySelector("[data-cranes]");
const speedBtns = [...root.querySelectorAll("[data-speed]")];

// Timeline scrubbing
const slider = root.querySelector("[data-scrub-slider]");
const scrubPhaseLabel = root.querySelector("[data-scrub-phase]");
const phasePills = [...root.querySelectorAll(".bk-phase-pill")];
const partBtns = [...root.querySelectorAll(".bk-part-btn")];

// Telemetry DOM elements
const teleElevation = root.querySelector("[data-tele-elevation]");
const teleYear = root.querySelector("[data-tele-year]");
const teleFloor = root.querySelector("[data-tele-floor]");
const teleConcrete = root.querySelector("[data-tele-concrete]");
const telePump = root.querySelector("[data-tele-pump]");
const telePanels = root.querySelector("[data-tele-panels]");
const teleWind = root.querySelector("[data-tele-wind]");

// Dynamic climbing elements
const dokaJumpForms = [...front.querySelectorAll('[data-role="doka"]')];
const climbingCranes = [...front.querySelectorAll('[data-role="crane"]')];
const craneJibs = [...front.querySelectorAll('[data-role="crane-jib"]')];
const concretePumpPipes = [...front.querySelectorAll('[data-role="pump-pipe"]')];
const telescopicSpire = front.querySelector('[data-role="spire-core"]');

const still = matchMedia("(prefers-reduced-motion: reduce)");

const nodes = [...assembly.querySelectorAll(".it")].map((el) => ({
  el,
  piece: el.dataset.piece,
  ride: el.dataset.ride || el.dataset.piece,
  key: Number(el.dataset.k),
  m: el.dataset.m ? el.dataset.m.split(",").map(Number) : [0, 0, 0],
  index: Number(el.dataset.i),
  kind: el.dataset.kind || "structure",
  zMin: el.dataset.zmin !== undefined ? Number(el.dataset.zmin) : -100,
  zMax: el.dataset.zmax !== undefined ? Number(el.dataset.zmax) : 1000,
  isGlass: el.dataset.kind === "glass",
}));

for (const node of nodes) {
  node.lift = node.m[0] * D.V[0] + node.m[1] * D.V[1] + node.m[2] * D.V[2];
}

const IDS = Object.keys(D.pieces);
const STAGGER = D.stagger;
const SPRING = D.spring;
const piece = Object.fromEntries(IDS.map((id) => [id, { x: 0, v: 0, target: 0, pending: null }]));

// Operational State
let playing = false; // Start paused at full building so user sees the complete tower immediately
let playSpeed = 1.0;
let progress = 1.0; // 0.0 (Foundation/Piles) to 1.0 (828m Spire Topped Out)
let apart = false;
let xray = false;
let wind = false;
let cranesOnly = false;
let selectedPart = null;
let lastTime = 0;
let craneAngle = 0;

// Dynamic Physical Telemetry State
const state = {
  elevationM: 828.0,
  elevationFt: 2717,
  year: 2010,
  floorCount: 163,
  concreteM3: 330000,
  concreteTonnes: 825000,
  pumpBar: 320,
  panels: 24348,
  windReduction: 42,
  currentPhaseIdx: 8,
};

// Phase milestones definitions
const PHASES = [
  { id: 0, name: "Phase 0: Deep Friction Piles", year: 2004, elevation: 0, floors: "Subterranean", concrete: 35000, pump: 40, panels: 0, wind: 0, zThresh: -2.1, desc: "192 bored cast-in-place friction piles (1.5m diameter, 50m depth) anchored into deep calcisiltite bedrock with titanium cathodic protection mesh." },
  { id: 1, name: "Phase 1: 3.7m Raft Foundation", year: 2005, elevation: 5, floors: "L0 Concourse", concrete: 75000, pump: 80, panels: 0, wind: 5, zThresh: 0, desc: "12,500 m³ of C80 self-consolidating concrete cast in 4 monolithic pours, creating a 3.7m thick Y-shaped raft foundation mat weighing 110,000 tonnes." },
  { id: 2, name: "Phase 2: Buttressed Core (L1–42)", year: 2006, elevation: 150, floors: "Levels 1–42", concrete: 140000, pump: 140, panels: 1200, wind: 15, zThresh: 88, desc: "Central hexagonal torsion core and three 120° buttress wings taking shape. Doka SKE 100 jump forms establish 3-day cycle. Outriggers 1 & 2 cast." },
  { id: 3, name: "Phase 3: Spiral Wind Setbacks (L43–75)", year: 2007, elevation: 270, floors: "Levels 43–75", concrete: 210000, pump: 195, panels: 6800, wind: 24, zThresh: 152, desc: "26 spiraling setbacks begin counter-clockwise helix to disrupt vortex shedding. High-pressure concrete pumping at night with ice-cooled water." },
  { id: 4, name: "Phase 4: Cladding Chases Core (L76–108)", year: 2007, elevation: 390, floors: "Levels 76–108", concrete: 265000, pump: 245, panels: 13500, wind: 31, zThresh: 216, desc: "Unitized Low-E double glazed reflective curtain wall installation trails 25 floors below the casting deck using perimeter monorail suction hoists." },
  { id: 5, name: "Phase 5: High-Altitude Climb (L109–138)", year: 2008, elevation: 500, floors: "Levels 109–138", concrete: 300000, pump: 285, panels: 19200, wind: 36, zThresh: 276, desc: "Outer wing sections terminate sequentially, tapering the profile. Concrete pumped past 450m mark under extreme 285 bar pump cylinder pressures." },
  { id: 6, name: "Phase 6: Concrete Summit 606m (L139–156)", year: 2008, elevation: 585, floors: "Levels 139–156", concrete: 330000, pump: 320, panels: 22800, wind: 39, zThresh: 316, desc: "World record concrete vertical single-stage pumping reaches 606 meters! Level 156 concrete casting terminates, transitioning to structural steel." },
  { id: 7, name: "Phase 7: Steel Framing & Strand Jack", year: 2009, elevation: 685, floors: "Levels 157–163", concrete: 330000, pump: 320, panels: 24100, wind: 41, zThresh: 350, desc: "Over 4,000 tonnes of structural steel framing erected. 143m telescopic spire fabricated in 25 modular segments inside core; strand jack gantry installed." },
  { id: 8, name: "Phase 8: Spire Jacking & Topping Out", year: 2010, elevation: 828, floors: "L163 · Spire", concrete: 330000, pump: 320, panels: 24348, wind: 42, zThresh: 460, desc: "Hydraulic strand jacks lift 350-tonne steel spire 143m out through top of tower to reach 828.0m (2,717 ft). Crowned with aircraft beacon and lightning rod!" },
];

function updatePhaseFromProgress(prog) {
  // Map progress (0..1) to Phase index 0..8
  const idx = Math.min(8, Math.floor(prog * 8.999));
  const phase = PHASES[idx];
  state.currentPhaseIdx = idx;

  // Linear interpolation within phase for continuous telemetry
  const pStart = idx / 8.0;
  const pEnd = (idx + 1) / 8.0;
  const f = Math.max(0, Math.min(1, (prog - pStart) / (pEnd - pStart || 1)));

  const nextPhase = PHASES[Math.min(8, idx + 1)];
  state.elevationM = Math.round(phase.elevation + f * (nextPhase.elevation - phase.elevation));
  state.elevationFt = Math.round(state.elevationM * 3.28084);
  state.year = phase.year;
  state.concreteM3 = Math.round(phase.concrete + f * (nextPhase.concrete - phase.concrete));
  state.concreteTonnes = Math.round(state.concreteM3 * 2.5);
  state.pumpBar = Math.round(phase.pump + f * (nextPhase.pump - phase.pump));
  state.panels = Math.round(phase.panels + f * (nextPhase.panels - phase.panels));
  state.windReduction = Math.round(phase.wind + f * (nextPhase.wind - phase.wind));

  // Telemetry HUD DOM update
  if (teleElevation) teleElevation.innerHTML = `${state.elevationM.toFixed(1)} <small>m</small> / ${state.elevationFt} <small>ft</small>`;
  if (teleYear) teleYear.textContent = String(state.year);
  if (teleFloor) teleFloor.textContent = phase.floors;
  if (teleConcrete) teleConcrete.innerHTML = `${(state.concreteM3 / 1000).toFixed(0)}k <small>m³</small>`;
  if (telePump) telePump.innerHTML = `${state.pumpBar} <small>bar</small>`;
  if (telePanels) telePanels.textContent = state.panels.toLocaleString();
  if (teleWind) teleWind.innerHTML = `-${state.windReduction}% <small>vortex</small>`;

  if (scrubPhaseLabel) scrubPhaseLabel.textContent = `${phase.name} (${state.elevationM}m)`;

  // Update phase pills active state
  phasePills.forEach((pill, i) => {
    if (i === idx) {
      pill.setAttribute("data-active", "");
    } else {
      pill.removeAttribute("data-active");
    }
  });

  // Calculate current construction Z threshold in world units
  // World units Z: Bedrock is -28, Ground is 0, Top of concrete is 316, Summit is 460
  // Map elevationM (0 to 828) to world Z (-2.1 to 460)
  const currentZ = -2.1 + (state.elevationM / 828.0) * (460 - (-2.1));
  const glassZ = Math.max(0, currentZ - 52); // Glass cladding trails ~50m below concrete deck

  // Filter nodes visibility based on construction progression
  for (const node of nodes) {
    if (node.isGlass) {
      // Glass facade appears with lag
      if (node.zMin <= glassZ) {
        node.el.style.display = "";
      } else {
        node.el.style.display = "none";
      }
    } else {
      // Structural element visibility
      if (node.zMin <= currentZ) {
        node.el.style.display = "";
      } else {
        node.el.style.display = "none";
      }
    }
  }

  // Update dynamic climbing Doka formwork position
  // Position jump forms at current construction deck
  const dokaZ = Math.max(0, Math.min(316, currentZ));
  const dokaScreenY = -dokaZ * D.cosE * D.k;
  for (const d of dokaJumpForms) {
    if (currentZ >= 0 && currentZ <= 325) {
      d.style.display = "";
      d.setAttribute("transform", `translate(0, ${dokaScreenY.toFixed(1)})`);
    } else {
      d.style.display = "none";
    }
  }

  // Update Climbing Cranes position
  const craneZ = Math.max(0, Math.min(330, currentZ - 8));
  const craneScreenY = -craneZ * D.cosE * D.k;
  for (const c of climbingCranes) {
    if (currentZ >= 8 && currentZ <= 360) {
      c.style.display = "";
      c.setAttribute("transform", `translate(0, ${craneScreenY.toFixed(1)})`);
    } else {
      c.style.display = "none";
    }
  }

  // Slewing crane jibs
  craneAngle += 0.02 * playSpeed;
  const slewX = Math.cos(craneAngle) * 6;
  const slewY = Math.sin(craneAngle) * 3;
  for (const j of craneJibs) {
    j.setAttribute("transform", `translate(${slewX.toFixed(1)}, ${slewY.toFixed(1)})`);
  }

  // Spire Strand-Jacking motion in Phase 7-8:
  // Spire starts inside core at z = 316, telescopes up to 460
  if (telescopicSpire) {
    if (state.elevationM >= 585) {
      telescopicSpire.style.display = "";
      const spireFrac = Math.max(0, Math.min(1, (state.elevationM - 585) / (828 - 585)));
      // Telescopic travel is 110 world units (downwards when fraction < 1)
      const spireScreenY = (1.0 - spireFrac) * 110.0 * D.cosE * D.k;
      telescopicSpire.setAttribute("transform", `translate(0, ${spireScreenY.toFixed(1)})`);
    } else {
      telescopicSpire.style.display = "none";
    }
  }

  if (readout) {
    readout.textContent = `${phase.name} · Elev: ${state.elevationM}m (${state.elevationFt}ft) · Conc: ${(state.concreteM3 / 1000).toFixed(0)}k m³ · Cladding: ${state.panels} panels`;
  }
}

// Spring Animation for Exploded / Apart mode
function updateApartSprings(dt) {
  let moving = false;
  const sub = dt / SPRING.substeps;

  for (let s = 0; s < SPRING.substeps; s++) {
    for (const id of IDS) {
      const p = piece[id];
      const target = p.pending !== null ? p.pending : p.target;
      const f = -SPRING.stiffness * (p.x - target) - SPRING.damping * p.v;
      p.v += f * sub;
      p.x += p.v * sub;
      if (Math.abs(p.v) > 0.001 || Math.abs(p.x - target) > 0.001) {
        moving = true;
      }
    }
  }

  for (const node of nodes) {
    const p = piece[node.ride];
    if (!p) continue;
    const factor = p.x;
    const dx = node.m[0] * factor;
    const dy = node.m[1] * factor;
    const dz = node.m[2] * factor;

    // Convert 3D offset to 2D screen offset
    const sx = (dx * D.sinA - dy * D.cosA) * D.k;
    const sy = ((dx * D.cosA + dy * D.sinA) * D.sinE - dz * D.cosE) * D.k;

    if (Math.abs(sx) > 0.1 || Math.abs(sy) > 0.1) {
      node.el.setAttribute("transform", `translate(${sx.toFixed(1)}, ${sy.toFixed(1)})`);
    } else {
      node.el.removeAttribute("transform");
    }
  }

  return moving;
}

function setApart(active) {
  apart = active;
  if (apartBtn) {
    if (apart) apartBtn.setAttribute("data-active", "");
    else apartBtn.removeAttribute("data-active");
  }

  // Stagger targets
  STAGGER.forEach((id, index) => {
    const p = piece[id];
    if (!p) return;
    const delay = index * SPRING.stagger * 1000;
    setTimeout(() => {
      p.target = apart ? 1.0 : 0.0;
    }, delay);
  });
}

function setXray(active) {
  xray = active;
  if (xrayBtn) {
    if (xray) xrayBtn.setAttribute("data-active", "");
    else xrayBtn.removeAttribute("data-active");
  }
  if (xray) stage.setAttribute("data-xray-active", "");
  else stage.removeAttribute("data-xray-active");
}

function setWind(active) {
  wind = active;
  if (windBtn) {
    if (wind) windBtn.setAttribute("data-active", "");
    else windBtn.removeAttribute("data-active");
  }
  if (wind) stage.setAttribute("data-wind-active", "");
  else stage.removeAttribute("data-wind-active");
}

function setCranes(active) {
  cranesOnly = active;
  if (cranesBtn) {
    if (cranesOnly) cranesBtn.setAttribute("data-active", "");
    else cranesBtn.removeAttribute("data-active");
  }
  if (cranesOnly) stage.setAttribute("data-cranes-active", "");
  else stage.removeAttribute("data-cranes-active");
}

function setPlay(active) {
  playing = active;
  if (playing && progress >= 0.98) {
    progress = 0.0;
  }
  if (playBtn) {
    if (playing) {
      playBtn.setAttribute("data-active", "");
      if (playLabel) playLabel.textContent = "Pause Animation";
    } else {
      playBtn.removeAttribute("data-active");
      if (playLabel) playLabel.textContent = "Play Construction";
    }
  }
}

function selectPart(partId) {
  selectedPart = partId;
  partBtns.forEach((btn) => {
    if (btn.dataset.part === partId) btn.setAttribute("data-active", "");
    else btn.removeAttribute("data-active");
  });

  if (partId) {
    stage.setAttribute("data-focus", "");
    nodes.forEach((n) => {
      if (n.piece === partId || n.ride === partId) n.el.setAttribute("data-on", "");
      else n.el.removeAttribute("data-on");
    });
    const pInfo = D.pieces[partId];
    if (pInfo && readout) {
      readout.textContent = `${pInfo.name}: ${pInfo.say}`;
    }
  } else {
    stage.removeAttribute("data-focus");
    nodes.forEach((n) => n.el.removeAttribute("data-on"));
    const phase = PHASES[state.currentPhaseIdx];
    if (readout) {
      readout.textContent = `${phase.name} · Elev: ${state.elevationM}m (${state.elevationFt}ft) · Conc: ${(state.concreteM3 / 1000).toFixed(0)}k m³`;
    }
  }
}

// Main Animation Loop
function loop(timestamp) {
  if (!lastTime) lastTime = timestamp;
  const dt = Math.min(0.05, (timestamp - lastTime) / 1000);
  lastTime = timestamp;

  if (playing && !still.matches) {
    // 24 seconds for full construction cycle at 1x
    progress += (dt / 24.0) * playSpeed;
    if (progress > 1.0) {
      progress = 0.0; // Loop seamlessly
    }
    if (slider) slider.value = Math.round(progress * 1000);
    updatePhaseFromProgress(progress);
  }

  updateApartSprings(dt);

  requestAnimationFrame(loop);
}

// Event Listeners
if (playBtn) {
  playBtn.addEventListener("click", () => setPlay(!playing));
}

if (apartBtn) {
  apartBtn.addEventListener("click", () => setApart(!apart));
}

if (xrayBtn) {
  xrayBtn.addEventListener("click", () => setXray(!xray));
}

if (windBtn) {
  windBtn.addEventListener("click", () => setWind(!wind));
}

if (cranesBtn) {
  cranesBtn.addEventListener("click", () => setCranes(!cranesOnly));
}

speedBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    speedBtns.forEach((b) => b.removeAttribute("data-active"));
    btn.setAttribute("data-active", "");
    playSpeed = Number(btn.dataset.speed || 1.0);
  });
});

if (slider) {
  slider.addEventListener("input", (e) => {
    progress = Number(e.target.value) / 1000;
    updatePhaseFromProgress(progress);
  });
  slider.addEventListener("mousedown", () => setPlay(false));
  slider.addEventListener("touchstart", () => setPlay(false), { passive: true });
}

phasePills.forEach((pill, idx) => {
  pill.addEventListener("click", () => {
    setPlay(false);
    progress = idx / 8.0;
    if (slider) slider.value = Math.round(progress * 1000);
    updatePhaseFromProgress(progress);
    const phase = PHASES[idx];
    if (liveEl) liveEl.textContent = `${phase.name}: ${phase.desc}`;
  });
});

partBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const p = btn.dataset.part;
    if (selectedPart === p) {
      selectPart(null);
    } else {
      selectPart(p);
    }
  });
});

// Click on SVG nodes to inspect
assembly.addEventListener("click", (e) => {
  const item = e.target.closest(".it");
  if (item && item.dataset.piece) {
    const p = item.dataset.piece;
    selectPart(selectedPart === p ? null : p);
  } else {
    selectPart(null);
  }
});

// Keyboard Navigation
window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  const key = e.key.toLowerCase();

  if (e.code === "Space") {
    e.preventDefault();
    setPlay(!playing);
  } else if (key === "a") {
    setApart(!apart);
  } else if (key === "c" || key === "x") {
    setXray(!xray);
  } else if (key === "w") {
    setWind(!wind);
  } else if (key === "m") {
    setCranes(!cranesOnly);
  } else if (key === "arrowright") {
    setPlay(false);
    progress = Math.min(1.0, progress + 1 / 8.0);
    if (slider) slider.value = Math.round(progress * 1000);
    updatePhaseFromProgress(progress);
  } else if (key === "arrowleft") {
    setPlay(false);
    progress = Math.max(0.0, progress - 1 / 8.0);
    if (slider) slider.value = Math.round(progress * 1000);
    updatePhaseFromProgress(progress);
  } else if (key >= "0" && key <= "8") {
    const idx = Number(key);
    setPlay(false);
    progress = idx / 8.0;
    if (slider) slider.value = Math.round(progress * 1000);
    updatePhaseFromProgress(progress);
  }
});

// Initial Setup
updatePhaseFromProgress(1.0);
requestAnimationFrame(loop);
