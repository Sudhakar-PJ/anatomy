const D = __DATA__;
const root = document.querySelector(".f9");
const stage = root.querySelector(".f9-stage");
const front = stage.querySelector(".f9-front");
const assembly = front.querySelector(".f9-assembly");
const canvas = stage.querySelector(".f9-plume-canvas");
const liveEl = root.querySelector("[data-live]");
const readout = root.querySelector("[data-readout]");
const burnBtn = root.querySelector("[data-burn]");
const apartBtn = root.querySelector("[data-apart]");
const cutawayBtn = root.querySelector("[data-cutaway]");
const legsBtn = root.querySelector("[data-legs]");
const finsBtn = root.querySelector("[data-fins]");
const slider = root.querySelector("[data-throttle-slider]");
const throttleVal = root.querySelector("[data-throttle-val]");
const presetBtns = [...root.querySelectorAll(".f9-preset-btn")];
const partBtns = [...root.querySelectorAll(".f9-part-btn")];

// Telemetry DOM elements
const teleThrust = root.querySelector("[data-tele-thrust]");
const teleVelocity = root.querySelector("[data-tele-velocity]");
const teleEngines = root.querySelector("[data-tele-engines]");
const teleChamber = root.querySelector("[data-tele-chamber]");
const teleLox = root.querySelector("[data-tele-lox]");
const teleRp1 = root.querySelector("[data-tele-rp1]");
const teleFins = root.querySelector("[data-tele-fins]");
const teleLegs = root.querySelector("[data-tele-legs]");

// Dynamic SVG elements
const stowedLegs = [...front.querySelectorAll(".f9-leg-stowed")];
const deployedLegs = [...front.querySelectorAll(".f9-leg-deployed")];
const stowedFins = [...front.querySelectorAll(".f9-fin-stowed")];
const deployedFins = [...front.querySelectorAll(".f9-fin-deployed")];
const fallbackPlume = root.querySelector(".f9-fallback-plume");

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

// Operational & Flight State
let burning = !still.matches;
let apart = false;
let cutaway = true;      // Cutaway enabled by default to showcase internal downcomer & COPVs!
let legsDeployed = false; // Legs stowed during ascent by default
let finsActive = false;   // Grid fins deployed during entry/landing
let selected = null;
let throttle = 1.0;       // 0.40 to 1.00
let targetThrottle = 1.0;
let currentPreset = "liftoff";
let clock = 0;
let lastTime = 0;
let frame = 0;
let visible = false;
let finCantAngle = 0;

// Dynamic Physical Telemetry State (smoothly interpolated)
const state = {
  burnActual: !still.matches ? 1.0 : 0.0,
  thrustKn: 7607,
  velocityKmh: 1980,
  mach: 1.62,
  activeEngines: 9,
  chamberBar: 97.0,
  loxTonnes: 287.4,
  rp1Tonnes: 123.5,
  rcsPulse: 0,
  padDeflect: 1.0,
  stageSepFrac: 0,
};

// -------------------------------------------------------------
// WEBGL SUPERSONIC PLUME & COLD-GAS SHADER
// -------------------------------------------------------------
const FRAGMENT_SOURCE = `
precision highp float;

uniform float uBurn;
uniform float uThrottle;
uniform float uEngines;
uniform float uRcs;
uniform float uPadDeflect;
uniform float uTheme;
uniform float uEngOffset;

void main() {
  vec2 vb = viewOf(gl_FragCoord.xy);
  vec4 color = vec4(0.0);

  if (uBurn <= 0.001 && uRcs <= 0.001) {
    gl_FragColor = vec4(0.0);
    return;
  }

  // 1. Supersonic Merlin 1D Exhaust Plume Column
  if (uEngines >= 0.5) {
    vec3 cExit3 = vec3(0.0, 0.0, -65.5 + uEngOffset);
    vec3 cPad3 = vec3(0.0, 0.0, -125.0 + uEngOffset);
    vec2 pExit = project(cExit3);
    vec2 pPad = project(cPad3);
    vec2 dir = normalize(pPad - pExit);
    float fullLen = length(pPad - pExit) * (0.85 + 0.35 * uThrottle);
    vec2 vTo = vb - pExit;
    float proj = dot(vTo, dir);

    if (proj > -2.0 * uK && proj < fullLen * 1.5) {
      float t = clamp(proj / fullLen, 0.0, 1.5);
      vec2 perp = vTo - dir * proj;
      float dPerp = length(perp);

      // Multi-engine expansion cone: 9 engines span R = 15 units, single engine R = 5.5 units
      float baseR = uEngines > 1.5 ? 14.5 : 5.5;
      float spreadR = uEngines > 1.5 ? 22.0 : 12.0;
      float coneR = (baseR + spreadR * t) * uK;

      // High-speed supersonic turbulence along jet axis
      float turb = fbm2(vec2(dPerp * 0.045, proj * 0.065 - uTime * 28.0));
      coneR += (turb - 0.5) * 6.5 * uK;

      float coreR = coneR * (uEngines > 1.5 ? 0.42 : 0.35);
      float mantleR = coneR;

      // Standing periodic Mach shock diamonds
      float shockPeriod = (uEngines > 1.5 ? 18.0 : 12.0) * uK * (0.75 + 0.25 * uThrottle);
      float shockPhase = mod(max(0.0, proj) + 3.0 * uK, shockPeriod) / shockPeriod;
      float shockDiamond = smoothstep(0.32, 0.5, shockPhase) * (1.0 - smoothstep(0.5, 0.68, shockPhase)) * smoothstep(coreR * 0.85, 0.0, dPerp) * (1.0 - t * 0.7);

      float coreMask = smoothstep(coreR, 0.0, dPerp);
      float mantleMask = smoothstep(mantleR, 0.0, dPerp);
      float outerGlow = smoothstep(mantleR * 1.6, mantleR * 0.8, dPerp) * (1.0 - t * 0.6);

      float burnPower = uBurn * (0.7 + 0.3 * uThrottle);

      if (uTheme < 0.5) {
        // Dark theme: radiant glowing plasma with incandescent shock diamonds
        vec3 cCore = vec3(1.0, 0.98, 0.92);
        vec3 cGold = vec3(1.0, 0.76, 0.20);
        vec3 cOrange = vec3(1.0, 0.45, 0.06);
        vec3 cCrimson = vec3(0.92, 0.18, 0.01);

        vec3 plumeCol = mix(cCrimson, cOrange, mantleMask);
        plumeCol = mix(plumeCol, cGold, coreMask);
        plumeCol += cCore * (shockDiamond * 1.4 + coreMask * 0.55);

        float alpha = (mantleMask * 0.85 + coreMask * 0.15 + outerGlow * 0.35) * burnPower;
        color += vec4(plumeCol * alpha, alpha);
      } else {
        // Light theme: rich blackbody fire ink
        vec3 inkCore = vec3(1.0, 0.88, 0.30);
        vec3 inkMid = vec3(0.98, 0.45, 0.05);
        vec3 inkEdge = vec3(0.85, 0.18, 0.02);

        vec3 plumeCol = mix(inkEdge, inkMid, mantleMask);
        plumeCol = mix(plumeCol, inkCore, coreMask);
        plumeCol += vec3(1.0, 0.96, 0.8) * shockDiamond * 0.75;

        float alpha = (mantleMask * 0.9 + coreMask * 0.1 + outerGlow * 0.25) * burnPower;
        color += vec4(plumeCol * alpha, alpha);
      }
    }
  }

  // 2. Ground Launch Pad Deflector Trench Splash & Fiery Smoke Billows
  if (uBurn > 0.02 && uPadDeflect > 0.02) {
    vec3 floorPos = onFloor(vb, -72.0 + uEngOffset);
    if (abs(floorPos.x) < 90.0 && abs(floorPos.y) < 90.0) {
      // Trench deflects blast along X axis (left/right)
      float trenchDist = length(vec2(floorPos.x * 0.55, floorPos.y * 1.15));
      float floorTurb = fbm2(floorPos.xy * 0.065 - vec2(uTime * 15.0, 0.0));
      float splashMask = smoothstep(58.0, 4.0, trenchDist) * (0.65 + 0.35 * floorTurb) * uBurn * uPadDeflect;

      if (splashMask > 0.01) {
        if (uTheme < 0.5) {
          vec3 cSplash = mix(vec3(0.9, 0.22, 0.02), vec3(1.0, 0.7, 0.15), splashMask);
          color += vec4(cSplash * splashMask * 0.55, splashMask * 0.45);
        } else {
          vec3 inkSplash = mix(vec3(0.88, 0.25, 0.02), vec3(0.98, 0.5, 0.05), splashMask);
          color += vec4(inkSplash * splashMask * 0.5, splashMask * 0.42);
        }
      }
    }
  }

  // 3. Cold Gas Nitrogen RCS Attitude Thruster Puffs
  if (uRcs > 0.02) {
    vec2 pRcs1 = project(vec3(-18.5, 0.0, 168.0));
    vec2 pRcs2 = project(vec3(+18.5, 0.0, 168.0));

    // Gas expansion jets venting sideways
    vec2 v1 = vb - pRcs1;
    vec2 v2 = vb - pRcs2;
    float d1 = length(v1);
    float d2 = length(v2);

    float rcsPulse = 0.8 + 0.2 * sin(uTime * 24.0);
    float rcs1 = smoothstep(22.0 * uK, 0.0, d1) * smoothstep(0.0, -10.0 * uK, v1.x) * uRcs * rcsPulse;
    float rcs2 = smoothstep(22.0 * uK, 0.0, d2) * smoothstep(0.0, 10.0 * uK, v2.x) * uRcs * rcsPulse;
    float rcsMask = rcs1 + rcs2;

    if (rcsMask > 0.01) {
      vec3 cGas = uTheme < 0.5 ? vec3(0.65, 0.88, 1.0) : vec3(0.15, 0.45, 0.75);
      color += vec4(cGas * rcsMask * 0.6, rcsMask * 0.55);
    }
  }

  gl_FragColor = color;
}
`;

let gl = null;
let glExt = null;
let glDraw = null;

try {
  gl = glLayer({
    canvas,
    fragment: FRAGMENT_SOURCE,
    view: [D.W, D.H],
    camera: D.camera,
    uniforms: ["uBurn", "uThrottle", "uEngines", "uRcs", "uPadDeflect", "uTheme", "uEngOffset"],
    onError: (err) => {
      console.warn("WebGL Plume fallback to SVG:", err);
      if (fallbackPlume) fallbackPlume.style.display = "block";
    },
  });
} catch (e) {
  console.warn("WebGL init failed:", e);
  if (fallbackPlume) fallbackPlume.style.display = "block";
}

// -------------------------------------------------------------
// USER INTERFACE & FLIGHT PRESET LOGIC
// -------------------------------------------------------------
function setPreset(name) {
  currentPreset = name;
  presetBtns.forEach((btn) => {
    if (btn.dataset.preset === name) {
      btn.setAttribute("data-active", "");
    } else {
      btn.removeAttribute("data-active");
    }
  });

  if (name === "pad") {
    // Pad Standby (T-10s)
    burning = false;
    legsDeployed = false;
    finsActive = false;
    targetThrottle = 0.4;
    state.thrustKn = 0;
    state.velocityKmh = 0;
    state.mach = 0.0;
    state.activeEngines = 0;
    state.chamberBar = 1.0;
    state.loxTonnes = 287.4;
    state.rp1Tonnes = 123.5;
    state.rcsPulse = 0;
    state.padDeflect = 0;
    state.stageSepFrac = 0;
  } else if (name === "liftoff") {
    // Liftoff & Max Q
    burning = true;
    legsDeployed = false;
    finsActive = false;
    targetThrottle = 1.0;
    state.thrustKn = 7607;
    state.velocityKmh = 1980;
    state.mach = 1.62;
    state.activeEngines = 9;
    state.chamberBar = 97.0;
    state.loxTonnes = 245.0;
    state.rp1Tonnes = 105.0;
    state.rcsPulse = 0;
    state.padDeflect = 1.0;
    state.stageSepFrac = 0;
  } else if (name === "staging") {
    // Stage Separation (MVac igniting)
    burning = true;
    legsDeployed = false;
    finsActive = false;
    targetThrottle = 1.0;
    state.thrustKn = 981;
    state.velocityKmh = 7850;
    state.mach = 6.4;
    state.activeEngines = 1; // MVac on Stage 2
    state.chamberBar = 97.0;
    state.loxTonnes = 180.0;
    state.rp1Tonnes = 77.0;
    state.rcsPulse = 0.4;
    state.padDeflect = 0;
    state.stageSepFrac = 1.0;
  } else if (name === "reentry") {
    // Atmospheric Re-entry & Grid Fin Steering
    burning = false;
    legsDeployed = false;
    finsActive = true;
    targetThrottle = 0.7;
    state.thrustKn = 0;
    state.velocityKmh = 3800;
    state.mach = 3.1;
    state.activeEngines = 0;
    state.chamberBar = 1.0;
    state.loxTonnes = 42.0;
    state.rp1Tonnes = 18.0;
    state.rcsPulse = 0.85;
    state.padDeflect = 0;
    state.stageSepFrac = 0;
  } else if (name === "landing") {
    // Landing Burn & Touchdown
    burning = true;
    legsDeployed = true;
    finsActive = true;
    targetThrottle = 0.75;
    state.thrustKn = 620;
    state.velocityKmh = 120;
    state.mach = 0.1;
    state.activeEngines = 1; // Center Merlin throttled
    state.chamberBar = 72.0;
    state.loxTonnes = 12.5;
    state.rp1Tonnes = 5.4;
    state.rcsPulse = 0.3;
    state.padDeflect = 0.85;
    state.stageSepFrac = 0;
  }

  updateLegsDisplay();
  updateFinsDisplay();
  updateButtonStates();
  updateSlider();
}

function updateLegsDisplay() {
  stowedLegs.forEach((el) => {
    el.style.display = legsDeployed ? "none" : "";
  });
  deployedLegs.forEach((el) => {
    el.style.display = legsDeployed ? "" : "none";
  });
}

function updateFinsDisplay() {
  stowedFins.forEach((el) => {
    el.style.display = finsActive ? "none" : "";
  });
  deployedFins.forEach((el) => {
    el.style.display = finsActive ? "" : "none";
  });
}

function updateButtonStates() {
  if (burnBtn) {
    if (burning) {
      burnBtn.setAttribute("data-active", "");
      burnBtn.querySelector("[data-burn-label]").textContent = "Engine Firing";
    } else {
      burnBtn.removeAttribute("data-active");
      burnBtn.querySelector("[data-burn-label]").textContent = "Engine Ignition";
    }
  }

  if (apartBtn) {
    if (apart) {
      apartBtn.setAttribute("data-active", "alt");
      apartBtn.querySelector("[data-apart-label]").textContent = "Assembled View";
    } else {
      apartBtn.removeAttribute("data-active");
      apartBtn.querySelector("[data-apart-label]").textContent = "Explode View";
    }
  }

  if (cutawayBtn) {
    if (cutaway) {
      cutawayBtn.setAttribute("data-active", "");
      cutawayBtn.querySelector("[data-cutaway-label]").textContent = "Cutaway: Active";
      stage.setAttribute("data-cutaway", "true");
    } else {
      cutawayBtn.removeAttribute("data-active");
      cutawayBtn.querySelector("[data-cutaway-label]").textContent = "Tank Cutaway";
      stage.setAttribute("data-cutaway", "false");
    }
  }

  if (legsBtn) {
    if (legsDeployed) {
      legsBtn.setAttribute("data-active", "alt");
      legsBtn.querySelector("[data-legs-label]").textContent = "Legs: Deployed";
    } else {
      legsBtn.removeAttribute("data-active");
      legsBtn.querySelector("[data-legs-label]").textContent = "Landing Legs";
    }
  }

  if (finsBtn) {
    if (finsActive) {
      finsBtn.setAttribute("data-active", "");
      finsBtn.querySelector("[data-fins-label]").textContent = "Grid Fins: Active";
    } else {
      finsBtn.removeAttribute("data-fins-label");
      finsBtn.querySelector("[data-fins-label]").textContent = "Grid Fin Steering";
    }
  }
}

function updateSlider() {
  if (slider) {
    slider.value = Math.round(throttle * 100);
  }
  if (throttleVal) {
    throttleVal.textContent = `${Math.round(throttle * 100)}%`;
  }
}

// Event Listeners for UI
burnBtn.addEventListener("click", () => {
  burning = !burning;
  if (burning) {
    if (state.activeEngines === 0) state.activeEngines = 9;
    if (state.thrustKn === 0) state.thrustKn = 7607;
    if (state.chamberBar <= 1.0) state.chamberBar = 97.0;
  }
  updateButtonStates();
  updateTelemetryUI();
});

apartBtn.addEventListener("click", () => {
  apart = !apart;
  for (const id of IDS) {
    piece[id].target = apart ? 1 : 0;
  }
  updateButtonStates();
});

cutawayBtn.addEventListener("click", () => {
  cutaway = !cutaway;
  updateButtonStates();
});

legsBtn.addEventListener("click", () => {
  legsDeployed = !legsDeployed;
  updateLegsDisplay();
  updateButtonStates();
});

finsBtn.addEventListener("click", () => {
  finsActive = !finsActive;
  updateFinsDisplay();
  updateButtonStates();
});

slider.addEventListener("input", (e) => {
  targetThrottle = Number(e.target.value) / 100;
  throttle = targetThrottle;
  throttleVal.textContent = `${Math.round(throttle * 100)}%`;
});

presetBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    setPreset(btn.dataset.preset);
  });
});

partBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const id = btn.dataset.part;
    if (selected === id) {
      selected = null;
      stage.removeAttribute("data-focus");
      partBtns.forEach((b) => b.removeAttribute("data-active"));
      nodes.forEach((n) => n.el.removeAttribute("data-on"));
      readout.textContent = "9 Merlin 1D · 7,607 kN Thrust · 100% Throttle · Max Q";
    } else {
      selected = id;
      stage.setAttribute("data-focus", "");
      partBtns.forEach((b) => {
        if (b.dataset.part === id) b.setAttribute("data-active", "");
        else b.removeAttribute("data-active");
      });
      nodes.forEach((n) => {
        if (n.piece === id || n.ride === id) n.el.setAttribute("data-on", "");
        else n.el.removeAttribute("data-on");
      });
      readout.textContent = `${D.pieces[id].name} — ${D.pieces[id].say}`;
    }
  });
});

// Interactive Part Hover/Click in Front SVG
nodes.forEach((n) => {
  n.el.addEventListener("mouseenter", () => {
    if (!selected) {
      readout.textContent = `${D.pieces[n.piece].name} — ${D.pieces[n.piece].say}`;
    }
  });
  n.el.addEventListener("mouseleave", () => {
    if (!selected) {
      updateTelemetryUI();
    }
  });
  n.el.addEventListener("click", (e) => {
    e.stopPropagation();
    const btn = partBtns.find((b) => b.dataset.part === n.piece);
    if (btn) btn.click();
  });
});

// Keyboard Navigation
window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  if (e.key === " ") {
    e.preventDefault();
    burnBtn.click();
  } else if (e.key === "e" || e.key === "E") {
    apartBtn.click();
  } else if (e.key === "c" || e.key === "C") {
    cutawayBtn.click();
  } else if (e.key === "l" || e.key === "L") {
    legsBtn.click();
  } else if (e.key === "g" || e.key === "G") {
    finsBtn.click();
  } else if (e.key >= "1" && e.key <= "5") {
    const idx = Number(e.key) - 1;
    if (presetBtns[idx]) presetBtns[idx].click();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    targetThrottle = Math.min(1.0, throttle + 0.05);
    throttle = targetThrottle;
    updateSlider();
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    targetThrottle = Math.max(0.4, throttle - 0.05);
    throttle = targetThrottle;
    updateSlider();
  } else if (e.key === "Escape") {
    if (selected) {
      selected = null;
      stage.removeAttribute("data-focus");
      partBtns.forEach((b) => b.removeAttribute("data-active"));
      nodes.forEach((n) => n.el.removeAttribute("data-on"));
    }
    if (apart) apartBtn.click();
  }
});

// -------------------------------------------------------------
// PHYSICS SIMULATION & RENDER LOOP
// -------------------------------------------------------------
function updateTelemetryUI() {
  if (teleThrust) {
    const curThrust = burning ? Math.round(state.thrustKn * (0.6 + 0.4 * throttle)) : 0;
    teleThrust.textContent = `${curThrust.toLocaleString()} kN (${((curThrust * 224.8) / 1000).toFixed(2)}M lbf)`;
  }
  if (teleVelocity) {
    teleVelocity.textContent = `Mach ${state.mach.toFixed(2)} (${Math.round(state.velocityKmh).toLocaleString()} km/h)`;
  }
  if (teleEngines) {
    if (!burning) {
      teleEngines.textContent = "0 / 9 Firing (Standby)";
    } else if (state.activeEngines === 9) {
      teleEngines.textContent = "9 / 9 Merlin 1D (Octaweb)";
    } else {
      teleEngines.textContent = "1 Center Merlin 1D (TVC Active)";
    }
  }
  if (teleChamber) {
    const pChamb = burning ? (state.chamberBar * (0.6 + 0.4 * throttle)).toFixed(1) : "1.0";
    teleChamber.textContent = `${pChamb} bar (${(pChamb * 14.5038).toFixed(0)} psi)`;
  }
  if (teleLox) {
    teleLox.textContent = `${state.loxTonnes.toFixed(1)} tonnes (-207 °C)`;
  }
  if (teleRp1) {
    teleRp1.textContent = `${state.rp1Tonnes.toFixed(1)} tonnes (-7 °C)`;
  }
  if (teleFins) {
    if (!finsActive) {
      teleFins.textContent = "Stowed (0.0° Cant)";
    } else {
      teleFins.textContent = `Active (${(finCantAngle > 0 ? "+" : "") + finCantAngle.toFixed(1)}° Cant)`;
    }
  }
  if (teleLegs) {
    teleLegs.textContent = legsDeployed ? "Locked (43° Extension)" : "Stowed (Flush to Hull)";
  }
  if (!selected && readout) {
    const curThrust = burning ? Math.round(state.thrustKn * (0.6 + 0.4 * throttle)) : 0;
    readout.textContent = `${burning ? (state.activeEngines === 9 ? "9 Merlin 1D" : "Center Merlin 1D") : "Engines Off"} · ${curThrust.toLocaleString()} kN Thrust · ${Math.round(throttle * 100)}% Throttle · Mach ${state.mach.toFixed(2)}`;
  }
}

function frameLoop(now) {
  if (!lastTime) lastTime = now;
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  clock += dt;
  frame++;

  // 1. Spring-based exploded view translation
  const kStiffness = SPRING.stiffness;
  const kDamping = SPRING.damping;
  for (const id of IDS) {
    const p = piece[id];
    const force = (p.target - p.x) * kStiffness;
    p.v += (force - p.v * kDamping) * dt;
    p.x += p.v * dt;
  }

  // Update SVG DOM translation offsets for exploded assemblies
  for (const node of nodes) {
    const p = piece[node.ride];
    const x = p ? p.x : 0;
    const dx = node.m[0] * x * D.P.k;
    const dy = (node.m[1] * D.P.sinE - node.m[2] * D.P.cosE) * x * D.P.k;

    if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
      node.el.setAttribute("transform", `translate(${dx.toFixed(2)} ${dy.toFixed(2)})`);
    } else if (node.el.hasAttribute("transform")) {
      node.el.removeAttribute("transform");
    }
  }

  // 2. Grid Fin dynamic aerodynamic canting oscillation
  if (finsActive) {
    finCantAngle = Math.sin(clock * 3.5) * 14.5;
    deployedFins.forEach((fin, idx) => {
      const cant = (idx % 2 === 0 ? 1 : -1) * finCantAngle;
      fin.setAttribute("transform", `rotate(${cant.toFixed(1)} 0 0)`);
    });
  }

  // 3. WebGL Plume Rendering
  if (gl && gl.draw) {
    const isThemeLight = document.documentElement.getAttribute("data-theme") === "light";
    const targetBurn = burning ? 1.0 : 0.0;
    state.burnActual += (targetBurn - state.burnActual) * Math.min(1.0, dt * 14.0);
    const engOffset = piece["engines"] ? piece["engines"].x * (-32.0) : 0.0;
    const numEng = burning ? state.activeEngines : 0.0;

    gl.draw(
      {
        uBurn: state.burnActual,
        uThrottle: throttle,
        uEngines: numEng,
        uRcs: state.rcsPulse,
        uPadDeflect: state.padDeflect,
        uTheme: isThemeLight ? 1.0 : 0.0,
        uEngOffset: engOffset,
      },
      clock
    );
  }

  // Fallback SVG Plume Display
  if (fallbackPlume) {
    fallbackPlume.style.display = burning && !gl ? "block" : "none";
  }

  // Smooth Telemetry Update
  if (frame % 3 === 0) {
    updateTelemetryUI();
  }

  requestAnimationFrame(frameLoop);
}

// Initial setup
updateLegsDisplay();
updateFinsDisplay();
updateButtonStates();
updateSlider();
updateTelemetryUI();

requestAnimationFrame(frameLoop);
