import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../.agents/skills/anatomy/kit/iso-kit.mjs";
import * as G from "../.agents/skills/anatomy/kit/lathe.mjs";
import { tubePieces, tubeSvg } from "../.agents/skills/anatomy/kit/tube.mjs";
import * as A from "../.agents/skills/anatomy/kit/audit.mjs";
import { glCamera } from "../.agents/skills/anatomy/kit/gl.mjs";
import { glScript, kitScript } from "../.agents/skills/anatomy/scripts/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const THEME = process.argv.includes("--light") ? "light" : "dark";

const W = 940;
const H = 900;
const AZIMUTH = 42;
const ELEVATION = 26;

// Coordinate System (World Units, approx 1:100 scale, 1 unit ≈ 10 cm):
// X, Y: Horizontal ground plane (pad baseplate)
// Z: Vertical rocket axis (+Z up toward fairing nose tip, -Z down toward pad & flame trench)

// 1. BASEPLATE & PAD BOUNDS
const BASE = { x: -125, y: -125, w: 250, d: 250, r: 14 };
const BASE_H = 16;
const FOOT_H = 6;
const PAD_TOP_Z = -72;

const BOUNDS = [
  ...k.boxCorners(BASE, PAD_TOP_Z - BASE_H - FOOT_H, PAD_TOP_Z),
  [-26, -26, PAD_TOP_Z],
  [+26, +26, PAD_TOP_Z],
  [-24, -24, +345], // Fairing nose tip
  [+24, +24, +345],
  [+66, +66, PAD_TOP_Z], // Deployed landing leg footpads
  [-66, -66, PAD_TOP_Z],
  [+66, -66, PAD_TOP_Z],
  [-66, +66, PAD_TOP_Z],
];

const P = k.fitProjection(BOUNDS, W, H, {
  pad: 28,
  azimuth: AZIMUTH,
  elevation: ELEVATION,
});

const V = G.viewOf(P);
const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const Ln = (d, style) => k.lineSvg(d, style);
const Dots = (points, style) => k.dotsSvg(points, style);

// 2. EXPLODED ASSEMBLY DEFINITIONS
const PIECES = {
  stand: {
    name: "Launch Pad & Hold-Down Mount",
    say: "heavy launch pad base · central flame deflector trench · 4 hold-down release arms · cryogenic umbilicals",
    move: [0, 0, 0],
  },
  engines: {
    name: "Octaweb & 9 Merlin 1D Engines",
    say: "forged lithium-aluminum Octaweb thrust structure · 9 Merlin 1D engines (7,607 kN thrust) · dual hydraulic TVC gimbals",
    move: [0, 0, -32],
  },
  legs: {
    name: "4 Deployable Landing Legs",
    say: "carbon-composite A-frame struts · pneumatic telescoping deploy cylinders · aluminum honeycomb crush-core shock absorbers",
    move: [26, 26, -8],
  },
  rp1_tank: {
    name: "Booster RP-1 Kerosene Tank",
    say: "cryo-chilled RP-1 fuel tank (-7°C) · central vacuum-jacketed LOX downcomer · submerged 400 bar Helium COPVs",
    move: [0, 0, 0],
  },
  lox_tank: {
    name: "Booster Liquid Oxygen Tank",
    say: "densified LOX tank (-207°C) · internal anti-vortex baffles · forward Helium COPVs · cold gas nitrogen RCS pods",
    move: [0, 0, 32],
  },
  interstage: {
    name: "Interstage & 4 Titanium Grid Fins",
    say: "carbon-composite interstage shell · pneumatic staging pusher · 4 forged titanium hypersonic grid fins with electric servo drive",
    move: [0, 0, 68],
  },
  stage2: {
    name: "Stage 2 & Merlin Vacuum (MVac)",
    say: "second stage RP-1/LOX tanks · single Merlin 1D Vacuum engine (981 kN) · flared radiation-cooled niobium nozzle (3.0 m exit)",
    move: [0, 0, 108],
  },
  fairing: {
    name: "Payload Fairing & Satellite",
    say: "5.2m carbon-composite split fairing · acoustic dampening blankets · payload attach fitting (PAF) & communications satellite",
    move: [40, 0, 148],
  },
};

const STAGGER = [
  "fairing",
  "stage2",
  "interstage",
  "lox_tank",
  "legs",
  "engines",
  "rp1_tank",
  "stand",
];

const ORDER_DISPLAY = [
  "stand",
  "engines",
  "legs",
  "rp1_tank",
  "lox_tank",
  "interstage",
  "stage2",
  "fairing",
];

const SPRING = { stagger: 0.035, stiffness: 66, damping: 14.5, substeps: 4 };
const R = A.recorder(P, { order: STAGGER, spring: SPRING });
const { items, nameFor } = R;
const record = R.solid;

const rideOf = (piece, move) => (move ? Object.keys(PIECES).find((id) => PIECES[id].move === move) ?? piece : piece);

function put(piece, ref, svg, { bias = 0, move, ride, shapes = [], name, route, chunk, outer, cutout } = {}) {
  const extraAttrs = `${outer ? ' data-outer="true"' : ""}${cutout ? ' data-cutout="true"' : ""}`;
  R.put({
    piece,
    ride: ride ?? rideOf(piece, move),
    at: ref,
    bias,
    svg: extraAttrs ? svg.replace(/^<(\w+)/, `<$1${extraAttrs}`) : svg,
    move: move ?? PIECES[piece].move,
    shapes,
    name: name ?? nameFor(`${piece}.item`),
    route,
    chunk,
  });
}

function tubeItems(piece, route, r, { name, tone = "hi", bias = 0, move, maxLength, spacing, closed = false, breaks = [], gaps = [], caps = true } = {}) {
  const id = nameFor(name ?? `${piece}.tube`);
  tubePieces(route, r, P, { maxLength, spacing, closed, breaks, gaps, caps }).forEach((part, index) =>
    put(piece, part.mid, tubeSvg(part, { tone }), { bias, move, name: `${id}:${index}`, route: id, chunk: index, shapes: [A.tube(part.points, part.radii)] }),
  );
  return id;
}

// Coordinate Frame along vertical Z axis
const FRAME_Z = G.frameOf([0, 0, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]);

// -------------------------------------------------------------
// ASSEMBLY 1: LAUNCH PAD & GROUND HOLD-DOWN MOUNT
// -------------------------------------------------------------
function buildStand() {
  const piece = "stand";

  // 1. Soft Shadow Halo under Baseplate
  const haloD = k.haloOf(BASE, PAD_TOP_Z - BASE_H - FOOT_H, 16, P);
  put(piece, [0, 0, PAD_TOP_Z - 20], `<path class="iso-halo" d="${haloD}"/>`, { bias: -600, name: "stand.halo" });

  // 2. 4 Vibration Isolation Support Feet
  const footCorners = k.corners(BASE, 22);
  for (const [fx, fy] of footCorners) {
    const flange = k.cylinder(fx, fy, 9.5, PAD_TOP_Z - BASE_H - FOOT_H, 2.5, P, 24);
    const foot = k.cylinder(fx, fy, 7.0, PAD_TOP_Z - BASE_H - FOOT_H + 2.5, FOOT_H - 0.4, P, 24);
    put(piece, [fx, fy, PAD_TOP_Z - 20], S(flange, { tone: "lo" }) + S(foot, { tone: "mid" }), { bias: -550, name: `stand.foot.${fx}.${fy}` });
  }

  // 3. Heavy Tooling Baseplate Slab
  const baseSlab = k.slabOf(BASE, PAD_TOP_Z - BASE_H, BASE_H, P, 10, 1.4);
  const gutter = k.planOutline(k.insetPlan(BASE, 6.0), PAD_TOP_Z, P);
  const cornerBolts = k.corners(BASE, 11).map(([bx, by]) => at([bx, by, PAD_TOP_Z]));

  // Central Flame Trench Deflector Opening
  const trenchPlan = { x: -28, y: -28, w: 56, d: 56, r: 8 };
  const trenchOutline = k.planOutline(trenchPlan, PAD_TOP_Z, P);
  const trenchWalls = k.slabOf(trenchPlan, PAD_TOP_Z - 14, 14, P, 8, 0.8);
  // Flame deflector wedge inside trench
  const deflector1 = k.slabOf({ x: -22, y: -22, w: 44, d: 21, r: 2 }, PAD_TOP_Z - 13, 5, P, 4, 0.4);
  const deflector2 = k.slabOf({ x: -22, y: +1, w: 44, d: 21, r: 2 }, PAD_TOP_Z - 13, 5, P, 4, 0.4);

  // Technical Plaque (Engraved brass plate)
  const plaquePlan = { x: -48, y: BASE.y + BASE.d - 16, w: 96, d: 10, r: 1.2 };
  const plaqueSlab = k.slabOf(plaquePlan, PAD_TOP_Z, 0.6, P, 4);
  const plaqueGroove = k.planOutline(k.insetPlan(plaquePlan, 1.4), PAD_TOP_Z + 0.6, P);
  const plaqueRivets = k.corners(plaquePlan, 2.5).map(([px, py]) => at([px, py, PAD_TOP_Z + 0.6]));

  // Metric Ruler Strip along front edge
  const rulerPlan = { x: -105, y: BASE.y + BASE.d - 16, w: 210, d: 10, r: 1.2 };
  const rulerSlab = k.slabOf(rulerPlan, PAD_TOP_Z, 0.5, P, 4);
  const ticks = k.topTicks(rulerPlan.x + 4, rulerPlan.x + rulerPlan.w - 4, 4, 5, rulerPlan.y + 1, PAD_TOP_Z + 0.5, [1.8, 3.4], P);

  put(
    piece,
    [0, 0, PAD_TOP_Z],
    S(baseSlab, { tone: "lo" }) +
      Ln(gutter, { tone: "faint" }) +
      Dots(cornerBolts, { size: 0.48, tone: "mid" }) +
      S(trenchWalls, { tone: "lo" }) +
      S(deflector1, { tone: "mid" }) +
      S(deflector2, { tone: "mid" }) +
      Ln(trenchOutline, { tone: "faint" }) +
      S(rulerSlab, { tone: "lo" }) +
      Ln(ticks.minor, { tone: "lo" }) +
      Ln(ticks.major, { tone: "mid" }) +
      S(plaqueSlab, { tone: "mid" }) +
      Ln(plaqueGroove, { tone: "faint" }) +
      Dots(plaqueRivets, { size: 0.4, tone: "hi" }),
    { bias: -500, name: "stand.baseplate" }
  );

  // 4. 4 Hold-Down Release Arms at 45°, 135°, 225°, 315°
  const ARM_ANGLES = [45, 135, 225, 315];
  const R_ARM = 24.5;
  for (let i = 0; i < ARM_ANGLES.length; i++) {
    const rad = (ARM_ANGLES[i] * Math.PI) / 180;
    const ax = R_ARM * Math.cos(rad);
    const ay = R_ARM * Math.sin(rad);

    // Pedestal Block
    const pedPlan = { x: ax - 6, y: ay - 6, w: 12, d: 12, r: 2.2 };
    const ped = k.slabOf(pedPlan, PAD_TOP_Z, 8, P, 4, 0.6);
    // Pneumatic release cylinder & clamp jaw
    const cyl = k.cylinder(ax, ay, 3.2, PAD_TOP_Z + 8, 14, P, 18);
    const jaw = k.slabOf({ x: ax - 3, y: ay - 3, w: 6, d: 6, r: 1 }, PAD_TOP_Z + 22, 5, P, 3, 0.4);
    const pin = at([ax, ay, PAD_TOP_Z + 20]);

    put(
      piece,
      [ax, ay, PAD_TOP_Z + 12],
      S(ped, { tone: "mid" }) + S(cyl, { tone: "lo" }) + S(jaw, { tone: "hi" }) + Dots([pin], { size: 0.42, tone: "lit" }),
      { bias: -380, name: `stand.holddown.${i}` }
    );
  }

  // 5. Cryogenic Propellant Umbilical Tower Interface Block & Lines
  const mastPlan = { x: -84, y: -20, w: 22, d: 40, r: 3.5 };
  const mast = k.slabOf(mastPlan, PAD_TOP_Z, 48, P, 6, 1.0);
  const mastCap = k.slabOf(k.insetPlan(mastPlan, 1.5), PAD_TOP_Z + 48, 4, P, 4, 0.5);

  put(piece, [-73, 0, PAD_TOP_Z + 24], S(mast, { tone: "lo" }) + S(mastCap, { tone: "mid" }), { bias: -420, name: "stand.mast" });

  // LOX Feed Pipe (Insulated, runs from mast to aft disconnect)
  const loxRoute = [
    [-62, -8, PAD_TOP_Z + 42],
    [-46, -8, PAD_TOP_Z + 38],
    [-28, -6, PAD_TOP_Z + 34],
    [-18, -4, PAD_TOP_Z + 34],
  ];
  tubeItems(piece, loxRoute, 3.2, { name: "stand.lox_pipe", tone: "hi", bias: -360 });

  // RP-1 Fuel Pipe
  const rp1Route = [
    [-62, 8, PAD_TOP_Z + 32],
    [-46, 8, PAD_TOP_Z + 28],
    [-26, 6, PAD_TOP_Z + 24],
    [-18, 4, PAD_TOP_Z + 24],
  ];
  tubeItems(piece, rp1Route, 2.6, { name: "stand.rp1_pipe", tone: "mid", bias: -360 });
}

// -------------------------------------------------------------
// ASSEMBLY 2: OCTAWEB & 9 MERLIN 1D PROPULSION
// -------------------------------------------------------------
function buildEngines() {
  const piece = "engines";

  // 1. Octaweb Primary Thrust Structure
  // High-strength lithium-aluminum dome shell from Z = -36 to -44, R = 18.0
  const octaProfile = [
    [-36, 18.0],
    [-38, 18.2],
    [-42, 17.8],
    [-44, 16.5],
    [-44, 1.0],
  ];
  const octaPaths = G.solidOf(octaProfile, FRAME_Z, P, { smooth: true, steps: 48 });
  const octaSeam = G.arcOf(FRAME_Z, -40, 18.0, P);
  const octaBolts = G.dotsOf(FRAME_Z, -38, 17.5, 32, P);

  // Inconel Base Heat Shield Thermal Puck (Z = -44)
  const puckCyl = k.cylinder(0, 0, 16.4, -45, 1.4, P, 40);

  put(
    piece,
    [0, 0, -40],
    S(octaPaths, { tone: "mid", inner: Ln(octaSeam, { tone: "faint" }) }) + Dots(octaBolts, { size: 0.38, tone: "lo" }) + S(puckCyl, { tone: "lo" }),
    { bias: -250, name: "engines.octaweb" }
  );

  // Helper for Merlin 1D Engine Geometry
  function merlinEnginePaths(cx, cy, isCenter = false) {
    const frame = G.frameOf([cx, cy, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
    const rScale = isCenter ? 1.05 : 0.95;

    // Combustion Chamber: Z = -44 down to throat at Z = -51.5
    // Expansion Nozzle Bell: Z = -51.5 down to exit plane at Z = -65.5
    const profile = [
      [-44.0, 3.4 * rScale],
      [-46.0, 3.6 * rScale],
      [-49.0, 2.8 * rScale],
      [-51.5, 1.9 * rScale], // Throat
      [-53.5, 2.3 * rScale, 1],
      [-57.0, 3.2 * rScale, 1],
      [-61.5, 4.2 * rScale, 1],
      [-65.5, 5.0 * rScale], // Exit rim
      [-65.5, 0.4 * rScale],
    ];

    const enginePaths = G.solidOf(profile, frame, P, { smooth: true, steps: 32 });
    const throatSeam = G.arcOf(frame, -51.5, 1.9 * rScale, P);
    const band1 = G.arcOf(frame, -57.0, 3.2 * rScale, P);
    const band2 = G.arcOf(frame, -61.5, 4.2 * rScale, P);
    const lipRing = G.arcOf(frame, -65.5, 5.0 * rScale, P);

    // Turbopump Housing & Exhaust Cowling on engine shoulder
    const tpCyl = k.cylinder(cx + 2.4 * (isCenter ? 1 : Math.sign(cx || 1)), cy + 2.0 * (isCenter ? 1 : Math.sign(cy || 1)), 1.3, -48, 3.5, P, 16);

    return (
      S(enginePaths, { tone: isCenter ? "lit" : "hi", inner: Ln(throatSeam, { tone: "faint" }) }) +
      Ln(band1, { tone: "faint" }) +
      Ln(band2, { tone: "faint" }) +
      Ln(lipRing, { tone: "mid" }) +
      S(tpCyl, { tone: "mid" })
    );
  }

  // 2. 8 Perimeter Merlin 1D Engines arranged in Octagon (R = 11.0)
  const PERIM_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];
  const R_OCT = 11.0;
  const outerEngines = PERIM_ANGLES.map((ang) => {
    const rad = (ang * Math.PI) / 180;
    const cx = R_OCT * Math.cos(rad);
    const cy = R_OCT * Math.sin(rad);
    return {
      cx,
      cy,
      depth: k.depthOf([cx, cy, -55], P),
      ang,
    };
  });

  // Sort back to front
  outerEngines.sort((a, b) => a.depth - b.depth);

  for (let i = 0; i < outerEngines.length; i++) {
    const e = outerEngines[i];
    const engSvg = merlinEnginePaths(e.cx, e.cy, false);
    put(piece, [e.cx, e.cy, -55], engSvg, { bias: -220 + i * 2, name: `engines.perim.${e.ang}` });
  }

  // 3. Center Merlin 1D Engine (at [0, 0], deep gimbal capability)
  const centerSvg = merlinEnginePaths(0, 0, true);
  // Dual hydraulic TVC gimbal actuators
  const tvc1 = k.cylinder(2.6, 2.6, 0.7, -47, 6.0, P, 12);
  const tvc2 = k.cylinder(-2.6, 2.6, 0.7, -47, 6.0, P, 12);

  put(piece, [0, 0, -55], centerSvg + S(tvc1, { tone: "mid" }) + S(tvc2, { tone: "mid" }), { bias: -200, name: "engines.center" });
}

// -------------------------------------------------------------
// ASSEMBLY 3: 4 DEPLOYABLE CARBON-FIBER LANDING LEGS
// -------------------------------------------------------------
function buildLandingLegs() {
  const piece = "legs";
  const LEG_ANGLES = [45, 135, 225, 315];

  for (let i = 0; i < LEG_ANGLES.length; i++) {
    const ang = LEG_ANGLES[i];
    const rad = (ang * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);

    // Skirt Hinge Mount at booster base
    const hx = 18.0 * cosA;
    const hy = 18.0 * sinA;
    const hinge = k.slabOf({ x: hx - 3.0, y: hy - 3.0, w: 6, d: 6, r: 1.4 }, -38, 5, P, 3, 0.4);

    // 1. STOWED LEG (Carbon-composite aerodynamic triangular fairing panel)
    const baseW = 3.6;
    const pBase1 = at([hx - baseW * sinA, hy + baseW * cosA, -36]);
    const pBase2 = at([hx + baseW * sinA, hy - baseW * cosA, -36]);
    const pTip1 = at([18.2 * cosA + 1.2 * sinA, 18.2 * sinA - 1.2 * cosA, +16]);
    const pTip2 = at([18.2 * cosA - 1.2 * sinA, 18.2 * sinA + 1.2 * cosA, +16]);
    const pFoot = at([hx, hy, -36]);
    const pApex = at([18.2 * cosA, 18.2 * sinA, +16]);

    const stowedPanelD = k.pathOf([pBase1, pBase2, pTip1, pApex, pTip2], true);
    const stowedRidgeD = k.pathOf([pFoot, pApex]);
    const stowedLatch = k.slabOf({ x: 18.2 * cosA - 1.5, y: 18.2 * sinA - 1.5, w: 3, d: 3, r: 0.6 }, +16, 3, P, 3, 0.3);

    const stowedSvg =
      S(hinge, { tone: "lo" }) +
      `<path d="${stowedPanelD}" fill="var(--anatomy-face)" stroke="var(--anatomy-hi)" stroke-width="0.8"/>` +
      Ln(stowedRidgeD, { tone: "lit" }) +
      S(stowedLatch, { tone: "mid" });

    // 2. DEPLOYED LEG (Swung out 43°, landing firmly on pad deck at R = 64, Z = PAD_TOP_Z)
    const depFootX = 64.0 * cosA;
    const depFootY = 64.0 * sinA;
    const depKneeX = 39.0 * cosA;
    const depKneeY = 39.0 * sinA;

    // Dual A-Frame Struts
    const strut1Pt1 = [hx - 3.2 * sinA, hy + 3.2 * cosA, -36];
    const strut1Pt2 = [depFootX - 1.0 * sinA, depFootY + 1.0 * cosA, PAD_TOP_Z];
    const strut2Pt1 = [hx + 3.2 * sinA, hy - 3.2 * cosA, -36];
    const strut2Pt2 = [depFootX + 1.0 * sinA, depFootY - 1.0 * cosA, PAD_TOP_Z];

    // Telescoping Deploy Cylinder (Barrel from booster Z = +16 to knee)
    const cylStart = [18.2 * cosA, 18.2 * sinA, +16];
    const cylEnd = [depKneeX, depKneeY, -38];
    const pistonPt = [
      (cylStart[0] + cylEnd[0]) / 2,
      (cylStart[1] + cylEnd[1]) / 2,
      (cylStart[2] + cylEnd[2]) / 2,
    ];

    // Titanium Footpad & Aluminum Honeycomb Crush Core Cartridge
    const footPad = k.cylinder(depFootX, depFootY, 6.4, PAD_TOP_Z, 1.8, P, 24);
    const crushCartridge = k.cylinder(depFootX, depFootY, 3.4, PAD_TOP_Z + 1.8, 3.6, P, 18);

    const depSvg =
      S(hinge, { tone: "lo" }) +
      Ln(k.pathOf([at(strut1Pt1), at(strut1Pt2)]), { tone: "hi" }) +
      Ln(k.pathOf([at(strut2Pt1), at(strut2Pt2)]), { tone: "hi" }) +
      Ln(k.pathOf([at(cylStart), at(pistonPt)]), { tone: "mid" }) +
      Ln(k.pathOf([at(pistonPt), at(cylEnd)]), { tone: "lit" }) +
      S(footPad, { tone: "lo" }) +
      S(crushCartridge, { tone: "hi" });

    // Put stowed leg
    put(
      piece,
      [hx, hy, -10],
      `<g class="f9-leg f9-leg-stowed" data-leg="${i}">${stowedSvg}</g>`,
      { bias: -180 + i * 2, name: `legs.stowed.${ang}` }
    );

    // Put deployed leg
    put(
      piece,
      [depFootX, depFootY, -50],
      `<g class="f9-leg f9-leg-deployed" data-leg="${i}" style="display:none">${depSvg}</g>`,
      { bias: -170 + i * 2, name: `legs.deployed.${ang}` }
    );
  }
}

// -------------------------------------------------------------
// ASSEMBLY 4: BOOSTER RP-1 KEROSENE TANK & CUTAWAY
// -------------------------------------------------------------
function buildRp1Tank() {
  const piece = "rp1_tank";

  // RP-1 Tank Fuselage Shell from Z = -36 to +58 (R = 18.0, height 94)
  const rp1Profile = [
    [-36, 18.0],
    [+58, 18.0],
    [+58, 17.2],
    [-36, 17.2],
  ];

  // Outer solid skin with circumferential weld seams
  const outerSkin = G.solidOf(rp1Profile, FRAME_Z, P, { smooth: true, steps: 48 });
  const seam1 = G.arcOf(FRAME_Z, -20, 18.0, P);
  const seam2 = G.arcOf(FRAME_Z, 0, 18.0, P);
  const seam3 = G.arcOf(FRAME_Z, +25, 18.0, P);
  const seam4 = G.arcOf(FRAME_Z, +50, 18.0, P);

  // Exterior Aerodynamic Avionics Raceway Conduit running along the near side
  const racewayProfile = [
    [-36, 1.4],
    [+58, 1.4],
    [+58, 0],
    [-36, 0],
  ];
  const FRAME_RACE = G.frameOf([0, -18.2, 0], [0, 0, 1], [0, 1, 0], [-1, 0, 0]);
  const raceway = G.solidOf(racewayProfile, FRAME_RACE, P, { smooth: false, steps: 12 });

  // Cutaway Interior Model:
  // Concave internal chamber wall behind downcomer & COPVs
  const cavityWallProfile = [
    [-34, 17.0],
    [+56, 17.0],
    [+56, 16.2],
    [-34, 16.2],
  ];
  const cavityWall = G.solidOf(cavityWallProfile, FRAME_Z, P, { smooth: true, steps: 32 });
  const internalRib1 = G.arcOf(FRAME_Z, -10, 17.0, P);
  const internalRib2 = G.arcOf(FRAME_Z, +15, 17.0, P);
  const internalRib3 = G.arcOf(FRAME_Z, +40, 17.0, P);

  // 1. RP-1 Liquid Kerosene Cavity (-7°C, fluid level to Z = +45)
  const fluidProfile = [
    [-34, 16.6],
    [+45, 16.6],
    [+45, 2.8],
    [-34, 2.8],
  ];
  const fluidPaths = G.solidOf(fluidProfile, FRAME_Z, P, { smooth: true, steps: 32 });
  const meniscus = G.arcOf(FRAME_Z, +45, 16.6, P);

  // 2. Central Vacuum-Jacketed LOX Downcomer (r = 2.4, runs straight through the RP-1 tank!)
  const downcomerProfile = [
    [-36, 2.5],
    [+58, 2.5],
    [+58, 2.0],
    [-36, 2.0],
  ];
  const downcomerPaths = G.solidOf(downcomerProfile, FRAME_Z, P, { smooth: true, steps: 24 });
  const dcBellows1 = G.arcOf(FRAME_Z, -15, 2.5, P);
  const dcBellows2 = G.arcOf(FRAME_Z, +15, 2.5, P);

  // 3. Submerged Gaseous Helium COPVs (spheres of radius 3.8 at Z = -8 and Z = +26)
  const copv1 = G.sphereOf([0, 8.5, -8], 3.8, P);
  const copv2 = G.sphereOf([0, 8.5, +26], 3.8, P);

  // Common Bulkhead Dome at Z = +58 (Inverted dome separating RP-1 from LOX)
  const bulkheadDome = G.arcOf(FRAME_Z, +58, 17.0, P);

  // Put Outer Shell (data-outer="true")
  put(
    piece,
    [0, 0, +10],
    S(outerSkin, { tone: "mid", inner: Ln(seam1 + seam2 + seam3 + seam4, { tone: "faint" }) }) + S(raceway, { tone: "hi" }),
    { bias: -120, name: "rp1.outer", outer: true }
  );

  // Put Cutaway Interior (data-cutout="true")
  put(
    piece,
    [0, 0, +10],
    S(cavityWall, { tone: "lo", inner: Ln(internalRib1 + internalRib2 + internalRib3 + bulkheadDome, { tone: "faint" }) }) +
      S(fluidPaths, { tone: "lo", inner: Ln(meniscus, { tone: "mid" }) }) +
      S(downcomerPaths, { tone: "lit", inner: Ln(dcBellows1 + dcBellows2, { tone: "faint" }) }) +
      S(copv1, { tone: "hi" }) +
      S(copv2, { tone: "hi" }),
    { bias: -115, name: "rp1.cutout", cutout: true }
  );
}

// -------------------------------------------------------------
// ASSEMBLY 5: BOOSTER LIQUID OXYGEN TANK & RCS
// -------------------------------------------------------------
function buildLoxTank() {
  const piece = "lox_tank";

  // LOX Tank Fuselage Shell from Z = +58 to +172 (R = 18.0, height 114)
  const loxProfile = [
    [+58, 18.0],
    [+172, 18.0],
    [+172, 17.2],
    [+58, 17.2],
  ];

  const outerSkin = G.solidOf(loxProfile, FRAME_Z, P, { smooth: true, steps: 48 });
  const seam1 = G.arcOf(FRAME_Z, +85, 18.0, P);
  const seam2 = G.arcOf(FRAME_Z, +115, 18.0, P);
  const seam3 = G.arcOf(FRAME_Z, +145, 18.0, P);
  const seam4 = G.arcOf(FRAME_Z, +168, 18.0, P);

  // Exterior raceway tunnel continuation
  const racewayProfile = [
    [+58, 1.4],
    [+172, 1.4],
    [+172, 0],
    [+58, 0],
  ];
  const FRAME_RACE = G.frameOf([0, -18.2, 0], [0, 0, 1], [0, 1, 0], [-1, 0, 0]);
  const raceway = G.solidOf(racewayProfile, FRAME_RACE, P, { smooth: false, steps: 12 });

  // Nitrogen Cold Gas Attitude Thruster Quads (RCS) at Z = +168 (Port & Starboard)
  const rcs1 = k.slabOf({ x: -19.4, y: -4, w: 2.8, d: 8, r: 1 }, +166, 4, P, 3, 0.4);
  const rcs2 = k.slabOf({ x: +16.6, y: -4, w: 2.8, d: 8, r: 1 }, +166, 4, P, 3, 0.4);

  // Cutaway Interior Model:
  const loxCavityProfile = [
    [+60, 17.0],
    [+170, 17.0],
    [+170, 16.2],
    [+60, 16.2],
  ];
  const loxCavityWall = G.solidOf(loxCavityProfile, FRAME_Z, P, { smooth: true, steps: 32 });
  const loxRib1 = G.arcOf(FRAME_Z, +85, 17.0, P);
  const loxRib2 = G.arcOf(FRAME_Z, +115, 17.0, P);
  const loxRib3 = G.arcOf(FRAME_Z, +145, 17.0, P);
  const fwdDome = G.arcOf(FRAME_Z, +170, 17.0, P);

  // Liquid Oxygen Cavity (-207°C densified cryo, level to Z = +158)
  const loxFluidProfile = [
    [+60, 16.6],
    [+158, 16.6],
    [+158, 0.5],
    [+60, 0.5],
  ];
  const fluidPaths = G.solidOf(loxFluidProfile, FRAME_Z, P, { smooth: true, steps: 32 });
  const meniscus = G.arcOf(FRAME_Z, +158, 16.6, P);

  // Downcomer Inlet Sump & Screen at the bottom of the LOX tank (Z = +60)
  const sumpCone = [
    [+58, 2.5],
    [+62, 5.5],
    [+65, 5.5],
  ];
  const sumpPaths = G.solidOf(sumpCone, FRAME_Z, P, { smooth: true, steps: 24 });

  // Submerged Forward Helium COPVs (spheres of radius 3.8 at Z = +98 and Z = +138)
  const copv3 = G.sphereOf([0, 8.0, +98], 3.8, P);
  const copv4 = G.sphereOf([0, 8.0, +138], 3.8, P);

  // Put Outer Shell
  put(
    piece,
    [0, 0, +115],
    S(outerSkin, { tone: "mid", inner: Ln(seam1 + seam2 + seam3 + seam4, { tone: "faint" }) }) +
      S(raceway, { tone: "hi" }) +
      S(rcs1, { tone: "lit" }) +
      S(rcs2, { tone: "lit" }),
    { bias: -80, name: "lox.outer", outer: true }
  );

  // Put Cutaway Interior
  put(
    piece,
    [0, 0, +115],
    S(loxCavityWall, { tone: "lo", inner: Ln(loxRib1 + loxRib2 + loxRib3 + fwdDome, { tone: "faint" }) }) +
      S(fluidPaths, { tone: "lo", inner: Ln(meniscus, { tone: "mid" }) }) +
      S(sumpPaths, { tone: "hi" }) +
      S(copv3, { tone: "hi" }) +
      S(copv4, { tone: "hi" }),
    { bias: -75, name: "lox.cutout", cutout: true }
  );
}

// -------------------------------------------------------------
// ASSEMBLY 6: INTERSTAGE & 4 HYPERSONIC TITANIUM GRID FINS
// -------------------------------------------------------------
function buildInterstage() {
  const piece = "interstage";

  // Carbon-Fiber Composite Interstage Shell from Z = +172 to +208 (R = 18.0, height 36)
  const interProfile = [
    [+172, 18.0],
    [+208, 18.0],
    [+208, 17.2],
    [+172, 17.2],
  ];
  const interPaths = G.solidOf(interProfile, FRAME_Z, P, { smooth: true, steps: 48 });
  const midSeam = G.arcOf(FRAME_Z, +190, 18.0, P);
  const topCollar = G.arcOf(FRAME_Z, +208, 18.0, P);

  // Central Pneumatic Staging Pusher Piston inside interstage
  const pusherCyl = k.cylinder(0, 0, 3.2, +174, 28, P, 24);
  const pusherRod = k.cylinder(0, 0, 1.8, +202, 5, P, 20);

  // Stage separation guide rails & collet latches around rim
  const colletBolts = G.dotsOf(FRAME_Z, +206, 17.6, 16, P);

  put(
    piece,
    [0, 0, +190],
    S(interPaths, { tone: "lo", inner: Ln(midSeam + topCollar, { tone: "faint" }) }) +
      S(pusherCyl, { tone: "mid" }) +
      S(pusherRod, { tone: "lit" }) +
      Dots(colletBolts, { size: 0.36, tone: "hi" }),
    { bias: -40, name: "interstage.shell" }
  );

  // 4 Hypersonic Forged Titanium Grid Fins (at 0°, 90°, 180°, 270°, Z = +198)
  const FIN_ANGLES = [0, 90, 180, 270];
  for (let i = 0; i < FIN_ANGLES.length; i++) {
    const ang = FIN_ANGLES[i];
    const rad = (ang * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);

    const bx = 18.2 * cosA;
    const by = 18.2 * sinA;

    // Electric Actuator Drive Housing (high-torque motor + planetary gear)
    const actPlan = { x: bx - 2.8, y: by - 2.8, w: 5.6, d: 5.6, r: 1.4 };
    const act = k.slabOf(actPlan, +195, 7, P, 3, 0.4);
    const pivotPin = at([bx, by, +198.5]);

    // Deployed Titanium Grid Fin (Perpendicular to rocket airframe)
    // Vertical blade from Z = +192 to Z = +204, extending from R = 18.2 to 34.2 (length 16)
    const tipX = (18.2 + 16.0) * cosA;
    const tipY = (18.2 + 16.0) * sinA;

    const pBtmNear = at([bx, by, +192]);
    const pBtmTip = at([tipX, tipY, +192]);
    const pTopTip = at([tipX, tipY, +204]);
    const pTopNear = at([bx, by, +204]);

    const finBorderD = k.pathOf([pBtmNear, pBtmTip, pTopTip, pTopNear], true);

    // Waffle Grid Internal Cells (4 vertical bars, 3 horizontal bars)
    const waffleLines = [];
    // Vertical grid divider ribs along length
    for (let v = 1; v <= 3; v++) {
      const frac = v / 4;
      const vx = bx + (tipX - bx) * frac;
      const vy = by + (tipY - by) * frac;
      waffleLines.push(Ln(k.pathOf([at([vx, vy, +192]), at([vx, vy, +204])]), { tone: "mid" }));
    }
    // Horizontal shelves across height
    for (let h = 1; h <= 2; h++) {
      const hz = +192 + (12 * h) / 3;
      waffleLines.push(Ln(k.pathOf([at([bx, by, hz]), at([tipX, tipY, hz])]), { tone: "mid" }));
    }

    // Stowed Grid Fin (folded flat along interstage cylinder from Z = +184 to +204)
    const stowedFinPlan = {
      x: bx - 4 * Math.abs(sinA) - 1.4,
      y: by - 4 * Math.abs(cosA) - 1.4,
      w: 8 * Math.abs(sinA) + 2.8,
      d: 8 * Math.abs(cosA) + 2.8,
      r: 1.0,
    };
    const stowedBlade = k.slabOf(stowedFinPlan, +184, 18, P, 3, 0.4);

    const deployedSvg =
      S(act, { tone: "mid" }) +
      Dots([pivotPin], { size: 0.44, tone: "lit" }) +
      `<path d="${finBorderD}" fill="var(--anatomy-face)" stroke="var(--anatomy-hi)" stroke-width="0.9"/>` +
      waffleLines.join("");

    const stowedSvg =
      S(act, { tone: "mid" }) +
      Dots([pivotPin], { size: 0.44, tone: "lit" }) +
      S(stowedBlade, { tone: "hi" });

    // Put deployed fin
    put(
      piece,
      [bx, by, +198],
      `<g class="f9-grid-fin f9-fin-deployed" data-fin="${i}">${deployedSvg}</g>`,
      { bias: -25 + i * 2, name: `interstage.fin_dep.${ang}` }
    );

    // Put stowed fin
    put(
      piece,
      [bx, by, +198],
      `<g class="f9-grid-fin f9-fin-stowed" data-fin="${i}" style="display:none">${stowedSvg}</g>`,
      { bias: -20 + i * 2, name: `interstage.fin_stow.${ang}` }
    );
  }
}

// -------------------------------------------------------------
// ASSEMBLY 7: STAGE 2 & MERLIN VACUUM (MVAC)
// -------------------------------------------------------------
function buildStage2() {
  const piece = "stage2";

  // 1. Merlin 1D Vacuum (MVac) Engine
  // Massive Flared Niobium Alloy Radiation-Cooled Nozzle Extension
  // Throat at Z = +202 (radius 2.6), bell flares out to radius 14.8 at Z = +174 exit!
  const mvacProfile = [
    [+206, 3.8], // Turbopump & injector head
    [+202, 2.6], // Throat
    [+196, 4.8, 1],
    [+188, 8.5, 1],
    [+180, 12.2, 1],
    [+174, 14.8], // Exit plane lip
    [+174, 1.2],
  ];
  const mvacPaths = G.solidOf(mvacProfile, FRAME_Z, P, { smooth: true, steps: 44 });
  const throatSeam = G.arcOf(FRAME_Z, +202, 2.6, P);
  const stiffener1 = G.arcOf(FRAME_Z, +192, 6.6, P);
  const stiffener2 = G.arcOf(FRAME_Z, +184, 10.4, P);
  const lipRing = G.arcOf(FRAME_Z, +174, 14.8, P);

  // MVac dual gimbal actuators
  const mvacTvc1 = k.cylinder(2.2, 2.2, 0.7, +203, 5, P, 12);
  const mvacTvc2 = k.cylinder(-2.2, 2.2, 0.7, +203, 5, P, 12);

  put(
    piece,
    [0, 0, +190],
    S(mvacPaths, { tone: "lit", inner: Ln(throatSeam + stiffener1 + stiffener2 + lipRing, { tone: "mid" }) }) +
      S(mvacTvc1, { tone: "mid" }) +
      S(mvacTvc2, { tone: "mid" }),
    { bias: 0, name: "stage2.mvac" }
  );

  // 2. Stage 2 Cylindrical Propellant Tanks (Z = +208 to +268, R = 18.0, height 60)
  const s2TankProfile = [
    [+208, 18.0],
    [+268, 18.0],
    [+268, 17.2],
    [+208, 17.2],
  ];
  const s2TankPaths = G.solidOf(s2TankProfile, FRAME_Z, P, { smooth: true, steps: 48 });
  const s2Seam1 = G.arcOf(FRAME_Z, +226, 18.0, P);
  const s2Seam2 = G.arcOf(FRAME_Z, +248, 18.0, P);

  // Stage 2 Avionics Flight Computer Bay
  const s2Avionics = k.slabOf({ x: -8, y: -18.8, w: 16, d: 3.2, r: 1 }, +252, 10, P, 3, 0.4);

  // Stage 2 Nitrogen Cold Gas RCS Thrusters
  const s2Rcs1 = k.slabOf({ x: -19.2, y: -2, w: 2.5, d: 4, r: 0.8 }, +262, 3, P, 3, 0.3);
  const s2Rcs2 = k.slabOf({ x: +16.7, y: -2, w: 2.5, d: 4, r: 0.8 }, +262, 3, P, 3, 0.3);

  // 3. Payload Attach Fitting (PAF) Conical Adapter (Z = +268 to +276, tapering from R = 18.0 to 14.0)
  const pafProfile = [
    [+268, 18.0],
    [+276, 14.0],
    [+276, 13.2],
    [+268, 17.2],
  ];
  const pafPaths = G.solidOf(pafProfile, FRAME_Z, P, { smooth: true, steps: 40 });
  const pafClamp = G.arcOf(FRAME_Z, +276, 14.0, P);

  put(
    piece,
    [0, 0, +242],
    S(s2TankPaths, { tone: "mid", inner: Ln(s2Seam1 + s2Seam2, { tone: "faint" }) }) +
      S(s2Avionics, { tone: "hi" }) +
      S(s2Rcs1, { tone: "lit" }) +
      S(s2Rcs2, { tone: "lit" }) +
      S(pafPaths, { tone: "lo", inner: Ln(pafClamp, { tone: "hi" }) }),
    { bias: 30, name: "stage2.tanks" }
  );
}

// -------------------------------------------------------------
// ASSEMBLY 8: PAYLOAD FAIRING & SATELLITE
// -------------------------------------------------------------
function buildFairing() {
  const piece = "fairing";

  // 1. Internal Satellite Payload (mounted on top of PAF, Z = +276 to +315)
  // Spacecraft bus with gold MLI blankets
  const satBus = k.slabOf({ x: -7, y: -7, w: 14, d: 14, r: 1.5 }, +278, 22, P, 4, 0.6);
  // Dual folded solar array panels on flanks
  const solarLeft = k.slabOf({ x: -9.5, y: -6, w: 2, d: 12, r: 0.6 }, +280, 18, P, 3, 0.2);
  const solarRight = k.slabOf({ x: +7.5, y: -6, w: 2, d: 12, r: 0.6 }, +280, 18, P, 3, 0.2);
  // High-gain parabolic communications antenna dish
  const dish = G.sphereOf([0, 0, +306], 4.2, P);
  const dishFeed = k.cylinder(0, 0, 0.8, +306, 5, P, 12);

  put(
    piece,
    [0, 0, +295],
    S(satBus, { tone: "hi" }) + S(solarLeft, { tone: "lo" }) + S(solarRight, { tone: "lo" }) + S(dish, { tone: "lit" }) + S(dishFeed, { tone: "mid" }),
    { bias: 60, name: "fairing.satellite" }
  );

  // 2. 5.2m Aerodynamic Payload Fairing Shell
  // Tapers from R = 14 at Z = +276 out to 5.2m diameter (R = 23.0) at Z = +286,
  // runs cylindrical to Z = +305, then forms an elegant ogive nose cone converging to blunt tip at Z = +345!
  const fairingProfile = [
    [+276, 14.0],
    [+286, 23.0, 1], // Flare
    [+305, 23.0],   // Cylinder section
    [+318, 21.5, 1], // Ogive sweep
    [+330, 17.5, 1],
    [+340, 10.0, 1],
    [+345, 2.5],    // Blunt nose cap
    [+345, 0.5],
  ];

  const fairingPaths = G.solidOf(fairingProfile, FRAME_Z, P, { smooth: true, steps: 48 });
  const fairingSeam1 = G.arcOf(FRAME_Z, +286, 23.0, P);
  const fairingSeam2 = G.arcOf(FRAME_Z, +305, 23.0, P);
  const fairingSplitLine = Ln(
    k.pathOf([
      at([0, -14.0, +276]),
      at([0, -23.0, +286]),
      at([0, -23.0, +305]),
      at([0, -2.4, +345]),
    ]),
    { tone: "mid" }
  );

  // Stainless-steel blunt nose tip
  const noseTip = k.cylinder(0, 0, 2.4, +345, 2.0, P, 20);

  put(
    piece,
    [0, 0, +315],
    S(fairingPaths, { tone: "mid", inner: Ln(fairingSeam1 + fairingSeam2, { tone: "faint" }) + fairingSplitLine }) + S(noseTip, { tone: "hi" }),
    { bias: 90, name: "fairing.shell" }
  );
}

// Build all assemblies in geometric sequence
buildStand();
buildEngines();
buildLandingLegs();
buildRp1Tank();
buildLoxTank();
buildInterstage();
buildStage2();
buildFairing();

// -------------------------------------------------------------
// POST-PROCESSING: DEPTH SORTING & SVG ASSEMBLY
// -------------------------------------------------------------
items.sort((a, b) => a.key - b.key);

const groups = items.map((item, index) => {
  const [mx, my, mz] = item.move;
  return `<g class="it" data-piece="${item.piece}"${item.ride !== item.piece ? ` data-ride="${item.ride}"` : ""} data-k="${item.key.toFixed(2)}" data-m="${mx.toFixed(1)},${my.toFixed(1)},${mz.toFixed(1)}" data-i="${index}">${item.svg}</g>`;
});

const LABEL_TEXT =
  "SpaceX Falcon 9 full launch vehicle on launch pad: Stage 1 booster with 9 Merlin 1D engines in Octaweb configuration, 4 deployable carbon-fiber landing legs, cryo-chilled RP-1 and densified LOX tanks with internal cutaway revealing central LOX downcomer and helium COPVs, carbon-composite interstage with pneumatic staging pusher and 4 hypersonic titanium grid fins, Second Stage with single Merlin Vacuum (MVac) engine, and 5.2m payload fairing with communication satellite.";

// SVG Fallback for Exhaust Plume (visible if WebGL is disabled or off)
const fallbackPlumeD = k.pathOf([
  at([-14, 0, -65]),
  at([-22, 0, PAD_TOP_Z]),
  at([+22, 0, PAD_TOP_Z]),
  at([+14, 0, -65]),
], true);
const fallbackShockD1 = k.pathOf([at([-8, 0, -82]), at([0, 0, -74]), at([8, 0, -82]), at([0, 0, -90])], true);
const fallbackShockD2 = k.pathOf([at([-12, 0, -104]), at([0, 0, -94]), at([12, 0, -104]), at([0, 0, -114])], true);

const backFlameFallback = `<g class="f9-fallback-plume" aria-hidden="true" style="display:none">
  <path d="${fallbackPlumeD}" fill="var(--f9-plume-mid)" opacity="0.85"/>
  <path d="${fallbackShockD1}" fill="var(--f9-plume-core)"/>
  <path d="${fallbackShockD2}" fill="var(--f9-plume-core)"/>
</g>`;

const backSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg f9-back" viewBox="0 0 ${W} ${H}" role="img" aria-label="${LABEL_TEXT}">${backFlameFallback}</svg>`;
const frontSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg f9-front" viewBox="0 0 ${W} ${H}" aria-hidden="true"><g class="f9-assembly">${groups.join("")}</g></svg>`;

const unit = (vector) => {
  const o = at([0, 0, 0]);
  const p = at(vector);
  return [p[0] - o[0], p[1] - o[1]];
};

const DATA = {
  W,
  H,
  scale: 1,
  P: {
    sinA: Math.sin((AZIMUTH * Math.PI) / 180),
    cosA: Math.cos((AZIMUTH * Math.PI) / 180),
    sinE: Math.sin((ELEVATION * Math.PI) / 180),
    cosE: Math.cos((ELEVATION * Math.PI) / 180),
    k: P.scale * Math.sqrt(1.6),
  },
  V: [V[0], V[1], V[2]],
  camera: glCamera(P),
  pieces: PIECES,
  stagger: STAGGER,
  spring: SPRING,
  anchors: {
    exit: at([0, 0, -65]),
    pad: at([0, 0, PAD_TOP_Z]),
    interstage: at([0, 0, +198]),
    rcsPort: at([-18, 0, +168]),
    rcsStar: at([+18, 0, +168]),
    nose: at([0, 0, +345]),
  },
};

// -------------------------------------------------------------
// HTML TEMPLATE & MARKUP
// -------------------------------------------------------------
const corners = `<div class="iso-plate-corners" aria-hidden="true">
  <span class="iso-plate-corner" data-corner="fig">Fig 1</span>
  <span class="iso-plate-corner" data-corner="title">Falcon 9 · Full Stack &amp; Reusable Flight Architecture</span>
  <span class="iso-plate-corner" data-corner="readout" data-readout>9 Merlin 1D · 7,607 kN Thrust · 100% Throttle · Max Q</span>
</div>`;

const controls = `<div class="f9-controls">
  <button type="button" class="f9-btn" data-burn><span class="f9-lamp" aria-hidden="true"></span><span data-burn-label>Engine Ignition</span></button>
  <button type="button" class="f9-btn" data-apart><span class="f9-lamp" aria-hidden="true"></span><span data-apart-label>Explode View</span></button>
  <button type="button" class="f9-btn" data-cutaway><span class="f9-lamp" aria-hidden="true"></span><span data-cutaway-label>Tank Cutaway</span></button>
  <button type="button" class="f9-btn" data-legs><span class="f9-lamp" aria-hidden="true"></span><span data-legs-label>Landing Legs</span></button>
  <button type="button" class="f9-btn" data-fins><span class="f9-lamp" aria-hidden="true"></span><span data-fins-label>Grid Fin Steering</span></button>

  <div class="f9-throttle-wrap">
    <span class="f9-throttle-label">Throttle:</span>
    <input type="range" min="40" max="100" value="100" class="f9-slider" data-throttle-slider aria-label="Rocket Engine Throttle Level">
    <span class="f9-throttle-val" data-throttle-val>100%</span>
  </div>

  <div class="f9-preset-strip">
    <button type="button" class="f9-preset-btn" data-preset="pad">1. Pad Standby (T-10s)</button>
    <button type="button" class="f9-preset-btn" data-preset="liftoff" data-active>2. Liftoff &amp; Max Q</button>
    <button type="button" class="f9-preset-btn" data-preset="staging">3. Stage Separation</button>
    <button type="button" class="f9-preset-btn" data-preset="reentry">4. Atmospheric Entry</button>
    <button type="button" class="f9-preset-btn" data-preset="landing">5. Landing Burn &amp; Touchdown</button>
  </div>

  <span class="f9-hint">[Space] Burn · [E] Explode · [C] Cutaway · [L] Legs · [G] Grid Fins · [1-5] Presets · Drag Throttle · Click Systems</span>
  <span class="f9-live" aria-live="polite" data-live></span>
</div>`;

const telemetry = `<div class="f9-telemetry">
  <div class="f9-tele-item"><span class="f9-tele-label">Total Thrust</span><span class="f9-tele-val" data-thrust data-tele-thrust>7,607 kN (1.71M lbf)</span></div>
  <div class="f9-tele-item"><span class="f9-tele-label">Flight Velocity</span><span class="f9-tele-val" data-speed data-tele-velocity>Mach 1.62 (1,980 km/h)</span></div>
  <div class="f9-tele-item"><span class="f9-tele-label">Active Engines</span><span class="f9-tele-val" data-tele-engines>9 / 9 Merlin 1D (Octaweb)</span></div>
  <div class="f9-tele-item"><span class="f9-tele-label">Chamber Pressure</span><span class="f9-tele-val" data-tele-chamber>97.0 bar (1,407 psi)</span></div>
  <div class="f9-tele-item"><span class="f9-tele-label">Cryo LOX Propellant</span><span class="f9-tele-val" data-lox data-tele-lox>287.4 tonnes (-207 °C)</span></div>
  <div class="f9-tele-item"><span class="f9-tele-label">RP-1 Kerosene Fuel</span><span class="f9-tele-val" data-rp1 data-tele-rp1>123.5 tonnes (-7 °C)</span></div>
  <div class="f9-tele-item"><span class="f9-tele-label">Grid Fin Steering</span><span class="f9-tele-val" data-tele-fins>Stowed (0.0° Cant)</span></div>
  <div class="f9-tele-item"><span class="f9-tele-label">Landing Leg State</span><span class="f9-tele-val" data-tele-legs>Stowed (Flush to Hull)</span></div>
</div>`;

const partsBtns = ORDER_DISPLAY.map(
  (id, index) =>
    `<button type="button" class="f9-part-btn" data-part="${id}"><span class="f9-part-num">${String(index + 1).padStart(2, "0")}</span>${PIECES[id].name}</button>`
).join("");

const stage = `<div class="f9-stage" tabindex="0" role="slider" aria-label="Interactive Falcon 9 Rocket &amp; Flight Recovery: drag throttle slider, space toggles burn, e toggles exploded view, c toggles tank cutaway, l toggles landing legs, g toggles grid fin steering" aria-valuemin="40" aria-valuemax="100" aria-valuenow="100" aria-valuetext="Liftoff at 100% Throttle, 7,607 kN Thrust">
  ${backSvg}
  ${frontSvg}
  <canvas class="f9-plume-canvas" aria-hidden="true"></canvas>
</div>`;

const caption =
  "SpaceX's Falcon 9 is the world's first operational orbital-class reusable rocket, standing 70 m tall with a 3.66 m diameter aluminum-lithium airframe. At lift-off, Stage 1 generates 7,607 kN (1.71 million lbf) of thrust from nine Merlin 1D sea-level engines arranged in an Octaweb pattern—eight outer engines surrounding a single center engine that gimbals ±15° for thrust vector control (TVC). Rather than utilizing ambient propellants, Falcon 9 densifies sub-cooled Liquid Oxygen (-207°C) and chilled RP-1 kerosene (-7°C), increasing propellant mass by 8–10% within identical tank volumes; a central vacuum-jacketed LOX downcomer passes straight through the RP-1 tank to supply the turbopumps. Following stage separation via a central pneumatic pusher, the first-stage booster flips engines-first for re-entry. Four hypersonic titanium grid fins at the interstage un-stow and cant actively under high-torque electric servo drives, generating aerodynamic control lift through supersonic shockwaves without melting. In the terminal landing sequence, the center Merlin reignites for a pinpoint suicide burn while four pneumatic carbon-fiber A-frame landing legs deploy outward with aluminum honeycomb crush-core shock absorbers, bringing the 25-tonne booster to a soft touchdown on a drone ship or landing pad.";

const body = `<figure class="iso-figure f9">
  <div class="iso-plate">${corners}${stage}${controls}${telemetry}</div>
  <figcaption class="iso-legend">
    <div class="f9-parts">${partsBtns}</div>
    <span class="iso-caption">${caption}</span>
  </figcaption>
</figure>`;

const CSS = readFileSync(join(HERE, "falcon.css"), "utf8");
const LIVE = readFileSync(join(HERE, "falcon-live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));

const page = k.pageHtml({
  title: "Falcon 9 Rocket — Anatomy",
  theme: THEME,
  body: `<style>${CSS}</style>${body}`,
  script: kitScript() + glScript() + LIVE,
  width: 980,
});

const outName = THEME === "light" ? "falcon-light.html" : "falcon.html";
writeFileSync(join(HERE, outName), page);
console.log("wrote", outName, `${(page.length / 1024).toFixed(0)} KB`, `${items.length} items`);
