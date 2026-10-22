import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../.agents/skills/anatomy/kit/iso-kit.mjs";
import * as G from "../.agents/skills/anatomy/kit/lathe.mjs";
import { tubePieces, tubeSvg } from "../.agents/skills/anatomy/kit/tube.mjs";
import * as A from "../.agents/skills/anatomy/kit/audit.mjs";
import { glScript, kitScript } from "../.agents/skills/anatomy/scripts/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const THEME = process.argv.includes("--light") ? "light" : "dark";

const W = 940;
const H = 880;
const AZIMUTH = 42;
const ELEVATION = 28;

// Coordinate System (World Units, approx mm):
// X: Longitudinal shaft axis (+X forward toward drive pulley/snout, -X rearward toward inlet elbow/throttle)
// Y: Transverse lateral axis (-Y toward male rotor/cutaway/bypass, +Y toward female rotor/sight glass)
// Z: Vertical axis (+Z up toward case top cooling fins, -Z down toward intercooler, manifold, dyno baseplate)

// 1. BASEPLATE & DYNO BENCH
const BASE = { x: -140, y: -95, w: 280, d: 190, r: 12 };
const BASE_H = 14;
const FOOT_H = 5;
const BASE_TOP_Z = -70;

// 2. BOUNDING BOX FOR CAMERA FITTING
const BOUNDS = [
  ...k.boxCorners(BASE, BASE_TOP_Z - BASE_H - FOOT_H, BASE_TOP_Z),
  [+126, -14, 0],   // Front pulley tip
  [-128, 0, +10],   // Rear throttle body
  [-40, -48, -16],  // Bypass actuator
  [+38, +36, 0],    // Gearbox side
  [0, 0, +34],      // Top cooling fins
  [0, 0, -68],      // Manifold bottom
  [+92, +52, -40],  // Gauge cluster front-right
  [-92, +52, -40],  // Gauge cluster front-left
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

// 3. EXPLODED ASSEMBLY DEFINITIONS
const PIECES = {
  stand: {
    name: "Dyno test bench & gauge cluster",
    say: "precision dynamometer test bed · dual analog gauges & vibration isolation",
    move: [0, 0, 0],
  },
  pulley: {
    name: "8-rib serpentine drive pulley",
    say: "CNC 6061-T6 billet aluminum 8-rib pulley · 2.45:1 step-up drive ratio from crank",
    move: [85, 0, 0],
  },
  snout: {
    name: "Drive snout & shaft bearing assembly",
    say: "cast aluminum snout casing · dual angular contact bearings · spring isolator coupler",
    move: [55, 0, 0],
  },
  gears: {
    name: "Precision helical timing gears",
    say: "matched helical synchronizer gear pair · oil bath reservoir & sight glass · 0.003\" lobe clearance",
    move: [30, 0, 0],
  },
  male_rotor: {
    name: "Male helical rotor (3-lobe drive)",
    say: "forged high-helix convex 3-lobe rotor · PTFE abradable seal coating · up to 18,000 RPM",
    move: [14, -28, 0],
  },
  female_rotor: {
    name: "Female helical rotor (5-flute driven)",
    say: "counter-rotating concave 5-flute rotor · sweeps air axially forward into high-pressure discharge",
    move: [14, 28, 0],
  },
  housing: {
    name: "Stator casing & cutaway viewing window",
    say: "A356-T6 cast aluminum dual-bore cylinder case · exterior cooling ribs · internal cutaway reveal",
    move: [0, 0, 16],
  },
  bypass: {
    name: "Recirculation bypass valve & actuator",
    say: "butterfly bypass flapper & pneumatic vacuum canister · eliminates parasitic drag at cruise (<0.8 HP)",
    move: [0, -50, 6],
  },
  inlet: {
    name: "Intake elbow & throttle body",
    say: "aerodynamic 90° intake elbow · 92mm throttle body with brass butterfly plate & TPS",
    move: [-65, 0, 10],
  },
  intercooler: {
    name: "Air-to-water intercooler brick",
    say: "high-density bar-and-plate charge air cooler · AN-8 fittings · cools 135°C boost down to 42°C",
    move: [0, 0, -22],
  },
  manifold: {
    name: "Discharge manifold & intake runners",
    say: "cast aluminum lower intake plenum · 8 velocity runners directing boost into engine cylinder heads",
    move: [0, 0, -42],
  },
};

const STAGGER = [
  "pulley",
  "snout",
  "gears",
  "male_rotor",
  "female_rotor",
  "inlet",
  "bypass",
  "housing",
  "intercooler",
  "manifold",
  "stand",
];

const ORDER_DISPLAY = [
  "pulley",
  "snout",
  "gears",
  "male_rotor",
  "female_rotor",
  "housing",
  "bypass",
  "inlet",
  "intercooler",
  "manifold",
  "stand",
];

const SPRING = { stagger: 0.035, stiffness: 68, damping: 14.5, substeps: 4 };
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

// Coordinate Frames
const SHAFT_MALE = G.frameOf([0, -14, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
const SHAFT_FEMALE = G.frameOf([0, +14, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
const SHAFT_CENTER = G.frameOf([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]);

// Helper for turned bodies along a shaft frame
function turnedSolid(piece, frame, profile, style = {}, { bias = 0, move, name, inner = "", outer = false } = {}) {
  const paths = G.solidOf(profile, frame, P, { smooth: true, steps: 48 });
  const midX = (profile[0][0] + profile[profile.length - 1][0]) / 2;
  const id = nameFor(name ?? `${piece}.turned${Math.round(midX)}`);
  const shape = record(A.solid(frame, profile, { name: id }));
  put(piece, G.pointOf(frame, midX, 0, 0), S(paths, { tone: "hi", ...style, inner: inner ? Ln(inner, { tone: "faint" }) : "" }), {
    bias,
    move,
    name: id,
    shapes: [shape],
    outer,
  });
  return shape;
}

// -------------------------------------------------------------
// BUILD ASSEMBLY 1: DYNO TEST BENCH & GAUGE CLUSTER
// -------------------------------------------------------------
function buildStand() {
  const piece = "stand";

  // 1. Baseplate Soft Shadow Halo
  const haloD = k.haloOf(BASE, BASE_TOP_Z - BASE_H - FOOT_H, 14, P);
  put(piece, [0, 0, BASE_TOP_Z - 20], `<path class="iso-halo" d="${haloD}"/>`, { bias: -500, name: "stand.halo" });

  // 2. 4 Vibration Isolation Feet at Corners
  const footCorners = k.corners(BASE, 20);
  for (const [fx, fy] of footCorners) {
    const flange = k.cylinder(fx, fy, 8.5, BASE_TOP_Z - BASE_H - FOOT_H, 2.2, P, 24);
    const foot = k.cylinder(fx, fy, 6.2, BASE_TOP_Z - BASE_H - FOOT_H + 2.2, FOOT_H - 0.4, P, 24);
    put(piece, [fx, fy, BASE_TOP_Z - 18], S(flange, { tone: "lo" }) + S(foot, { tone: "mid" }), { bias: -450, name: `stand.foot.${fx}.${fy}` });
  }

  // 3. Heavy Tooling Baseplate Slab
  const baseSlab = k.slabOf(BASE, BASE_TOP_Z - BASE_H, BASE_H, P, 8, 1.4);
  const gutter = k.planOutline(k.insetPlan(BASE, 5.5), BASE_TOP_Z, P);
  const cornerBolts = k.corners(BASE, 10).map(([bx, by]) => at([bx, by, BASE_TOP_Z]));

  // Millimeter Ruler Strip along front
  const rulerPlan = { x: -115, y: BASE.y + BASE.d - 14, w: 230, d: 8, r: 1.2 };
  const rulerSlab = k.slabOf(rulerPlan, BASE_TOP_Z, 0.6, P, 3);
  const ticks = k.topTicks(rulerPlan.x + 4, rulerPlan.x + rulerPlan.w - 4, 4, 5, rulerPlan.y + 1, BASE_TOP_Z + 0.6, [1.8, 3.2], P);

  // Technical Plaque (Engraved brass plate)
  const plaquePlan = { x: -44, y: BASE.y + BASE.d - 14, w: 88, d: 8, r: 1 };
  const plaqueSlab = k.slabOf(plaquePlan, BASE_TOP_Z + 0.6, 0.5, P, 3);
  const plaqueGroove = k.planOutline(k.insetPlan(plaquePlan, 1.2), BASE_TOP_Z + 1.1, P);
  const plaqueRivets = k.corners(plaquePlan, 2.5).map(([px, py]) => at([px, py, BASE_TOP_Z + 1.1]));

  put(
    piece,
    [0, 0, BASE_TOP_Z],
    S(baseSlab, { tone: "lo" }) +
      Ln(gutter, { tone: "faint" }) +
      Dots(cornerBolts, { size: 0.45, tone: "mid" }) +
      S(rulerSlab, { tone: "lo" }) +
      Ln(ticks.minor, { tone: "lo" }) +
      Ln(ticks.major, { tone: "mid" }) +
      S(plaqueSlab, { tone: "mid" }) +
      Ln(plaqueGroove, { tone: "faint" }) +
      Dots(plaqueRivets, { size: 0.4, tone: "hi" }),
    { bias: -400, name: "stand.bedplate" }
  );

  // 4. Rigid Dyno Mounting Cradle Pedestals (Supporting supercharger manifold)
  // Pedestal 1: Front Pedestal (X = +18)
  const p1Plan = { x: 10, y: -26, w: 16, d: 52, r: 3 };
  const p1 = k.slabOf(p1Plan, BASE_TOP_Z, 26, P, 5, 1.0);
  const p1Clamp = k.cylinder(18, 0, 16, BASE_TOP_Z + 26, 6, P, 32);
  put(piece, [18, 0, BASE_TOP_Z + 13], S(p1, { tone: "mid" }) + S(p1Clamp, { tone: "lo" }), { bias: -200, name: "stand.pedestal1" });

  // Pedestal 2: Rear Pedestal (X = -26)
  const p2Plan = { x: -34, y: -26, w: 16, d: 52, r: 3 };
  const p2 = k.slabOf(p2Plan, BASE_TOP_Z, 26, P, 5, 1.0);
  const p2Clamp = k.cylinder(-26, 0, 16, BASE_TOP_Z + 26, 6, P, 32);
  put(piece, [-26, 0, BASE_TOP_Z + 13], S(p2, { tone: "mid" }) + S(p2Clamp, { tone: "lo" }), { bias: -200, name: "stand.pedestal2" });

  // 5. Dual Precision Analog Instruments on Bench (Front Left & Front Right)
  // 5a. Manifold Boost/Vacuum Gauge at Front-Left (X = -92, Y = +52)
  const gBx = -92, gBy = 52;
  const gbStem = k.cylinder(gBx, gBy, 3.8, BASE_TOP_Z, 26, P, 18);
  const gbPuck = k.cylinder(gBx, gBy, 14.0, BASE_TOP_Z + 26, 7.5, P, 48, 0.8);
  const gbKnurl = k.knurl(gBx, gBy, 14.0, BASE_TOP_Z + 31, BASE_TOP_Z + 33, 48, P);
  const gbTicks = k.radialTicks(gBx, gBy, 12.0, 48, 6, BASE_TOP_Z + 33.5, [1.5, 3.0], P);
  const gbRing = k.ring(gBx, gBy, 12.6, BASE_TOP_Z + 33.5, P, 48);
  const gbHub = at([gBx, gBy, BASE_TOP_Z + 33.5]);
  const gbNeedleTail = at([gBx - 2.5, gBy + 2.5, BASE_TOP_Z + 33.7]);
  const gbNeedleTip = at([gBx + 7.5, gBy - 6.5, BASE_TOP_Z + 33.7]);

  put(
    piece,
    [gBx, gBy, BASE_TOP_Z + 26],
    S(gbStem, { tone: "lo" }) +
      S(gbPuck, { tone: "hi" }) +
      Ln(gbKnurl, { tone: "lo" }) +
      Ln(gbRing, { tone: "mid" }) +
      Ln(gbTicks.minor, { tone: "lo" }) +
      Ln(gbTicks.major, { tone: "mid" }) +
      Dots([gbHub], { size: 0.85, tone: "lit" }) +
      `<line class="sc-needle-boost iso-line" data-tone="lit" x1="${gbNeedleTail[0]}" y1="${gbNeedleTail[1]}" x2="${gbNeedleTip[0]}" y2="${gbNeedleTip[1]}" style="stroke-width:1.6; stroke:var(--sc-cold-1); transform-origin:${gbHub[0]}px ${gbHub[1]}px;"/>`,
    { bias: 250, name: "stand.gauge_boost" }
  );

  // 5b. Charge Air Temperature (IAT) Gauge at Front-Right (X = +92, Y = +52)
  const gTx = 92, gTy = 52;
  const gtStem = k.cylinder(gTx, gTy, 3.8, BASE_TOP_Z, 26, P, 18);
  const gtPuck = k.cylinder(gTx, gTy, 14.0, BASE_TOP_Z + 26, 7.5, P, 48, 0.8);
  const gtKnurl = k.knurl(gTx, gTy, 14.0, BASE_TOP_Z + 31, BASE_TOP_Z + 33, 48, P);
  const gtTicks = k.radialTicks(gTx, gTy, 12.0, 48, 6, BASE_TOP_Z + 33.5, [1.5, 3.0], P);
  const gtRing = k.ring(gTx, gTy, 12.6, BASE_TOP_Z + 33.5, P, 48);
  const gtHub = at([gTx, gTy, BASE_TOP_Z + 33.5]);
  const gtNeedleTail = at([gTx - 2.5, gTy + 2.5, BASE_TOP_Z + 33.7]);
  const gtNeedleTip = at([gTx + 6.5, gTy - 7.5, BASE_TOP_Z + 33.7]);

  put(
    piece,
    [gTx, gTy, BASE_TOP_Z + 26],
    S(gtStem, { tone: "lo" }) +
      S(gtPuck, { tone: "hi" }) +
      Ln(gtKnurl, { tone: "lo" }) +
      Ln(gtRing, { tone: "mid" }) +
      Ln(gtTicks.minor, { tone: "lo" }) +
      Ln(gtTicks.major, { tone: "mid" }) +
      Dots([gtHub], { size: 0.85, tone: "lit" }) +
      `<line class="sc-needle-iat iso-line" data-tone="lit" x1="${gtNeedleTail[0]}" y1="${gtNeedleTail[1]}" x2="${gtNeedleTip[0]}" y2="${gtNeedleTip[1]}" style="stroke-width:1.6; stroke:var(--sc-hot-1); transform-origin:${gtHub[0]}px ${gtHub[1]}px;"/>`,
    { bias: 250, name: "stand.gauge_iat" }
  );

  // Copper transducer tubing running along baseplate
  tubeItems(piece, [
    [-92, 52, BASE_TOP_Z + 5],
    [-92, 28, BASE_TOP_Z + 5],
    [-40, 28, BASE_TOP_Z + 5],
    [-40, 0, BASE_TOP_Z + 24],
  ], 1.2, { name: "stand.boost_tube", tone: "mid", bias: -180 });

  tubeItems(piece, [
    [92, 52, BASE_TOP_Z + 5],
    [92, 28, BASE_TOP_Z + 5],
    [40, 28, BASE_TOP_Z + 5],
    [40, 0, BASE_TOP_Z + 24],
  ], 1.2, { name: "stand.temp_tube", tone: "lo", bias: -180 });
}

// -------------------------------------------------------------
// BUILD ASSEMBLY 2: 8-RIB SERPENTINE DRIVE PULLEY & BELT
// -------------------------------------------------------------
function buildPulley() {
  const piece = "pulley";
  const frame = SHAFT_MALE; // Aligned with male rotor drive shaft

  // 1. 8-Rib Serpentine Pulley Rim (X = +112 to +124, R = 24.5)
  const pulleyProfile = [
    [112, 16.0],
    [112, 24.5], // outer retaining lip
    [113.5, 23.2],
    [114.5, 24.5],
    [115.5, 23.2],
    [116.5, 24.5],
    [117.5, 23.2],
    [118.5, 24.5],
    [119.5, 23.2],
    [120.5, 24.5],
    [121.5, 23.2],
    [122.5, 24.5],
    [124, 24.5], // front lip
    [124, 18.0],
    [121, 18.0],
    [121, 8.0],
    [124, 8.0],
    [124, 0.0],
  ];
  turnedSolid(piece, frame, pulleyProfile, { tone: "hi" }, { bias: 200, name: `${piece}.disc` });

  // 2. Center Locking Hex Nut and Spindle Dimple (X = +124 to +128, R = 5.5)
  const nutProfile = [
    [124, 6.5],
    [128, 6.5],
    [128, 2.0],
    [126.5, 0.0],
  ];
  turnedSolid(piece, frame, nutProfile, { tone: "lit" }, { bias: 220, name: `${piece}.nut` });

  // 3. 6 Billet Weight-Reduction Spoke Windows (Recessed pockets)
  const centerHub = at(G.pointOf(frame, 121, 0, 0));
  const spokeDots = [];
  const spokeCutouts = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const p1 = at(G.pointOf(frame, 121, 11.5, angle));
    const p2 = at(G.pointOf(frame, 121, 16.5, angle));
    spokeDots.push(p1);
    spokeCutouts.push(`<line class="sc-pulley-spoke iso-line" data-tone="mid" x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}" style="stroke-width:2.4; transform-origin:${centerHub[0]}px ${centerHub[1]}px;"/>`);
  }
  put(piece, G.pointOf(frame, 121, 0, 0), Dots(spokeDots, { size: 0.55, tone: "mid" }) + spokeCutouts.join(""), {
    bias: 215,
    name: `${piece}.spokes`,
  });

  // 4. Cogged Serpentine Belt Segment wrapping lower half of pulley and extending down
  const beltWrap = [
    G.pointOf(frame, 118, 24.5, -Math.PI * 0.45),
    G.pointOf(frame, 118, 24.5, 0),
    G.pointOf(frame, 118, 24.5, Math.PI * 0.45),
    [118, -14 + 24.5, BASE_TOP_Z + 12],
  ];
  tubeItems(piece, beltWrap, 2.8, { name: `${piece}.belt`, tone: "lo", bias: 180 });
}

// -------------------------------------------------------------
// BUILD ASSEMBLY 3: DRIVE SNOUT & SHAFT BEARINGS
// -------------------------------------------------------------
function buildSnout() {
  const piece = "snout";
  const frame = SHAFT_MALE;

  // Snout Conical Casing (X = +55 to +112)
  const snoutProfile = [
    [55, 28.5],  // rear mounting flange
    [58, 28.5],
    [58, 24.0],  // main cone start
    [85, 21.0],
    [104, 18.0],
    [108, 18.0],
    [108, 17.0], // front bearing cap
    [112, 17.0],
    [112, 6.5],  // shaft seal bore
  ];
  turnedSolid(piece, frame, snoutProfile, { tone: "mid" }, { bias: 150, name: `${piece}.case` });

  // 6 Snout Flange Perimeter Bolts at X = +56.5
  const flangeBolts = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.2;
    flangeBolts.push(at(G.pointOf(frame, 56.5, 26.2, a)));
  }
  put(piece, G.pointOf(frame, 56.5, 0, 0), Dots(flangeBolts, { size: 0.5, tone: "lit" }), { bias: 155, name: `${piece}.flange_bolts` });

  // Internal Input Drive Shaft (Ground steel, X = +52 to +112)
  const shaftProfile = [
    [52, 6.0],
    [112, 6.0],
  ];
  turnedSolid(piece, frame, shaftProfile, { tone: "hi" }, { bias: 130, name: `${piece}.shaft` });

  // Internal Torsional Spring Coupler / Isolator (X = +52 to +55)
  const couplerProfile = [
    [52, 16.5],
    [55, 16.5],
    [55, 6.0],
  ];
  turnedSolid(piece, frame, couplerProfile, { tone: "hi" }, { bias: 135, name: `${piece}.coupler` });

  // 3 Coupler Damper Springs / Pins
  const pinDots = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    pinDots.push(at(G.pointOf(frame, 53.5, 11.5, a)));
  }
  put(piece, G.pointOf(frame, 53.5, 0, 0), Dots(pinDots, { size: 0.65, tone: "lit" }), { bias: 140, name: `${piece}.pins` });
}

// -------------------------------------------------------------
// BUILD ASSEMBLY 4: PRECISION HELICAL TIMING GEARS & GEARBOX
// -------------------------------------------------------------
function buildGears() {
  const piece = "gears";

  // Gearbox Front Wall / Casing Slab (X = +38 to +55)
  const gearCasePlan = { x: 38, y: -26, w: 17, d: 52, r: 4 };
  const gearSlab = k.slabOf(gearCasePlan, -18, 36, P, 5, 1.2);
  put(piece, [46, 0, 0], S(gearSlab, { tone: "mid" }), { bias: 100, name: `${piece}.case_slab` });

  // 1. Male Rotor Timing Gear (X = +42 to +52, R = 13.5 at Y = -14)
  const maleGearProfile = [
    [42, 13.5],
    [52, 13.5],
    [52, 6.0],
    [42, 6.0],
  ];
  turnedSolid(piece, SHAFT_MALE, maleGearProfile, { tone: "hi" }, { bias: 110, name: `${piece}.gear_male` });

  // 2. Female Rotor Timing Gear (X = +42 to +52, R = 13.5 at Y = +14)
  const femaleGearProfile = [
    [42, 13.5],
    [52, 13.5],
    [52, 6.0],
    [42, 6.0],
  ];
  turnedSolid(piece, SHAFT_FEMALE, femaleGearProfile, { tone: "hi" }, { bias: 110, name: `${piece}.gear_female` });

  // Gear Teeth Lines & Mesh Contact Point at Y = 0
  const centerMale = at(G.pointOf(SHAFT_MALE, 52, 0, 0));
  const centerFemale = at(G.pointOf(SHAFT_FEMALE, 52, 0, 0));
  const teethSvg = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const mP1 = at(G.pointOf(SHAFT_MALE, 52, 9.5, a));
    const mP2 = at(G.pointOf(SHAFT_MALE, 52, 13.5, a));
    teethSvg.push(`<line class="sc-gear-male-tooth iso-line" data-tone="mid" x1="${mP1[0]}" y1="${mP1[1]}" x2="${mP2[0]}" y2="${mP2[1]}" style="stroke-width:1.8; transform-origin:${centerMale[0]}px ${centerMale[1]}px;"/>`);

    const fP1 = at(G.pointOf(SHAFT_FEMALE, 52, 9.5, a + 0.25));
    const fP2 = at(G.pointOf(SHAFT_FEMALE, 52, 13.5, a + 0.25));
    teethSvg.push(`<line class="sc-gear-female-tooth iso-line" data-tone="mid" x1="${fP1[0]}" y1="${fP1[1]}" x2="${fP2[0]}" y2="${fP2[1]}" style="stroke-width:1.8; transform-origin:${centerFemale[0]}px ${centerFemale[1]}px;"/>`);
  }
  put(piece, [52, 0, 0], teethSvg.join(""), { bias: 115, name: `${piece}.gear_teeth` });

  // 3. Circular Brass Oil Level Sight Glass on Front Face (at Y = +18, Z = -8)
  const sgCenter = at([55.2, 18, -8]);
  const sgRing = k.ring(55.2, 18, 4.5, -8, P, 24);
  const sgMeniscusP1 = at([55.2, 14.5, -8]);
  const sgMeniscusP2 = at([55.2, 21.5, -8]);

  put(
    piece,
    [55.2, 18, -8],
    `<circle cx="${sgCenter[0]}" cy="${sgCenter[1]}" r="4.2" class="iso-solid" data-tone="mid" style="fill:#b8860b; stroke:none;"/>` +
      `<circle cx="${sgCenter[0]}" cy="${sgCenter[1]}" r="3.2" class="iso-solid" data-tone="hi" style="fill:#ffd700; fill-opacity:0.35; stroke:none;"/>` +
      `<line x1="${sgMeniscusP1[0]}" y1="${sgMeniscusP1[1]}" x2="${sgMeniscusP2[0]}" y2="${sgMeniscusP2[1]}" class="iso-line" data-tone="lit" style="stroke-width:1.2; stroke:#00ffcc;"/>`,
    { bias: 125, name: `${piece}.sight_glass` }
  );

  // Top Oil Fill Plug (Knurled cap) and Bottom Drain Plug
  const fillCap = k.cylinder(46, 0, 5.0, 18, 3.5, P, 18);
  const drainPlug = k.cylinder(46, 0, 4.0, -21.5, 3.5, P, 18);
  put(piece, [46, 0, 18], S(fillCap, { tone: "lit" }) + S(drainPlug, { tone: "mid" }), { bias: 120, name: `${piece}.plugs` });
}

// -------------------------------------------------------------
// BUILD ASSEMBLY 5: MALE HELICAL ROTOR (3-LOBE DRIVE)
// -------------------------------------------------------------
function buildMaleRotor() {
  const piece = "male_rotor";
  const frame = SHAFT_MALE;

  // Front & Rear Bearing Journals (X = -52 to -48 and X = +32 to +38, R = 5.5)
  const rearJournal = [
    [-52, 5.5],
    [-48, 5.5],
  ];
  turnedSolid(piece, frame, rearJournal, { tone: "mid" }, { bias: -20, name: `${piece}.rear_journal` });

  const frontJournal = [
    [32, 6.0],
    [38, 6.0],
  ];
  turnedSolid(piece, frame, frontJournal, { tone: "mid" }, { bias: 20, name: `${piece}.front_journal` });

  // Main Rotor Helical Body (X = -48 to +32, length 80, outer R = 21.0)
  const rotorCylinder = [
    [-48, 21.0],
    [32, 21.0],
  ];
  turnedSolid(piece, frame, rotorCylinder, { tone: "hi" }, { bias: 0, name: `${piece}.cylinder` });

  // 3 Helical Lobes with PTFE Coating Stripes (Swept along length)
  const rotorLines = [];
  const lobeDots = [];
  const frontHub = at(G.pointOf(frame, 32, 0, 0));

  for (let i = 0; i < 3; i++) {
    const startAngle = (i / 3) * Math.PI * 2;
    // 160° twist over 80mm length
    const endAngle = startAngle + (160 * Math.PI) / 180;
    
    // Discretized helical curve
    const curvePoints = [];
    for (let step = 0; step <= 16; step++) {
      const frac = step / 16;
      const x = -48 + frac * 80;
      const a = startAngle + frac * ((160 * Math.PI) / 180);
      curvePoints.push(at(G.pointOf(frame, x, 21.0, a)));
    }
    rotorLines.push(Ln(k.pathOf(curvePoints), { tone: "lit" }));

    // Front face lobe profile petal
    const p1 = at(G.pointOf(frame, 32.2, 7.0, startAngle));
    const p2 = at(G.pointOf(frame, 32.2, 20.8, startAngle));
    lobeDots.push(`<line class="sc-male-lobe iso-line" data-tone="lit" x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}" style="stroke-width:3.2; stroke:var(--sc-cold-1); transform-origin:${frontHub[0]}px ${frontHub[1]}px;"/>`);
  }

  put(piece, G.pointOf(frame, 0, 0, 0), rotorLines.join("") + lobeDots.join(""), {
    bias: 15,
    name: `${piece}.lobes`,
  });
}

// -------------------------------------------------------------
// BUILD ASSEMBLY 6: FEMALE HELICAL ROTOR (5-FLUTE DRIVEN)
// -------------------------------------------------------------
function buildFemaleRotor() {
  const piece = "female_rotor";
  const frame = SHAFT_FEMALE;

  // Front & Rear Journals
  const rearJournal = [
    [-52, 5.5],
    [-48, 5.5],
  ];
  turnedSolid(piece, frame, rearJournal, { tone: "mid" }, { bias: -20, name: `${piece}.rear_journal` });

  const frontJournal = [
    [32, 6.0],
    [38, 6.0],
  ];
  turnedSolid(piece, frame, frontJournal, { tone: "mid" }, { bias: 20, name: `${piece}.front_journal` });

  // Main Rotor Helical Body (X = -48 to +32, length 80, outer R = 21.0)
  const rotorCylinder = [
    [-48, 21.0],
    [32, 21.0],
  ];
  turnedSolid(piece, frame, rotorCylinder, { tone: "mid" }, { bias: -5, name: `${piece}.cylinder` });

  // 5 Helical Flutes with opposite twist direction
  const rotorLines = [];
  const fluteDots = [];
  const frontHub = at(G.pointOf(frame, 32, 0, 0));

  for (let i = 0; i < 5; i++) {
    const startAngle = (i / 5) * Math.PI * 2 + 0.15;
    // Counter twist angle
    const curvePoints = [];
    for (let step = 0; step <= 16; step++) {
      const frac = step / 16;
      const x = -48 + frac * 80;
      const a = startAngle - frac * ((160 * 0.6 * Math.PI) / 180);
      curvePoints.push(at(G.pointOf(frame, x, 21.0, a)));
    }
    rotorLines.push(Ln(k.pathOf(curvePoints), { tone: "lo" }));

    const p1 = at(G.pointOf(frame, 32.2, 7.0, startAngle));
    const p2 = at(G.pointOf(frame, 32.2, 20.8, startAngle));
    fluteDots.push(`<line class="sc-female-lobe iso-line" data-tone="mid" x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}" style="stroke-width:2.4; stroke:var(--sc-lamp-off); transform-origin:${frontHub[0]}px ${frontHub[1]}px;"/>`);
  }

  put(piece, G.pointOf(frame, 0, 0, 0), rotorLines.join("") + fluteDots.join(""), {
    bias: 10,
    name: `${piece}.flutes`,
  });
}

// -------------------------------------------------------------
// BUILD ASSEMBLY 7: STATOR CASING & CUTAWAY VIEWING WINDOW
// -------------------------------------------------------------
function buildHousing() {
  const piece = "housing";

  // Main Dual-Bore Stator Case (X = -55 to +38, W = 93, D = 56, H = 46)
  const casePlan = { x: -55, y: -28, w: 93, d: 56, r: 6 };
  const caseSlab = k.slabOf(casePlan, -22, 44, P, 6, 1.4);

  // 8 Longitudinal Cooling Fins along Top of Case (Z = +22 to +28)
  const finLines = [];
  for (let i = -3; i <= 4; i++) {
    const fy = i * 6.0;
    const finPlan = { x: -52, y: fy - 1.0, w: 87, d: 2.0, r: 0.5 };
    finLines.push(S(k.slabOf(finPlan, 22, 6.0, P, 2, 0.4), { tone: "hi" }));
  }

  // Front & Rear Mounting Flanges with Bolt Rings
  const frontFlange = k.slabOf({ x: 34, y: -29, w: 4, d: 58, r: 6 }, -22, 44, P, 4, 0.8);
  const rearFlange = k.slabOf({ x: -55, y: -29, w: 4, d: 58, r: 6 }, -22, 44, P, 4, 0.8);

  put(
    piece,
    [-8, 0, 0],
    S(caseSlab, { tone: "mid" }) + finLines.join("") + S(frontFlange, { tone: "lo" }) + S(rearFlange, { tone: "lo" }),
    { bias: -50, name: `${piece}.stator_case`, outer: true }
  );

  // Cutaway Aperture Reveal Frame (Chamfered aperture exposing rotors)
  const cutawayPlan = { x: -38, y: -28.2, w: 58, d: 1.2, r: 2 };
  const cutawayFrame = k.slabOf(cutawayPlan, -14, 28, P, 4, 0.6);
  const cutawayBevel = k.planOutline(cutawayPlan, 14, P);
  put(piece, [-9, -28.2, 0], S(cutawayFrame, { tone: "lo" }) + Ln(cutawayBevel, { tone: "lit" }), {
    bias: 80,
    name: `${piece}.cutaway_frame`,
    cutout: true,
  });
}

// -------------------------------------------------------------
// BUILD ASSEMBLY 8: RECIRCULATION BYPASS VALVE & ACTUATOR
// -------------------------------------------------------------
function buildBypass() {
  const piece = "bypass";

  // 1. Recirculation Bypass Duct (Connecting lower discharge cavity to upper inlet)
  const bypassRoute = [
    [-34, -32, -44],
    [-24, -44, -30],
    [-12, -44, -10],
    [-24, -40, +12],
    [-52, -26, +14],
  ];
  tubeItems(piece, bypassRoute, 5.5, { name: `${piece}.runner`, tone: "mid", bias: 30 });

  // 2. Dual-Port Vacuum / Boost Actuator Canister (at X = -12, Y = -46, Z = -16)
  const actCenter = [-12, -46, -16];
  const actCanister = k.cylinder(actCenter[0], actCenter[1], 8.5, actCenter[2] - 8, 16, P, 24, 0.6);
  const actSeam = k.ring(actCenter[0], actCenter[1], 8.8, actCenter[2], P, 24);

  // 3. Actuator Mounting Bracket
  const bktPlan = { x: -16, y: -48, w: 8, d: 16, r: 1.5 };
  const bktSlab = k.slabOf(bktPlan, actCenter[2] - 12, 4, P, 3);

  // 4. Actuator Pushrod & Clevis Pin linked to Bypass Bellcrank Lever
  const rodStart = at([-12, -46, -8]);
  const rodEnd = at([-12, -46, +2]);
  const flapperP1 = at([-16, -42, +2]);
  const flapperP2 = at([-8, -42, +2]);

  put(
    piece,
    actCenter,
    S(actCanister, { tone: "lo" }) +
      Ln(actSeam, { tone: "mid" }) +
      S(bktSlab, { tone: "mid" }) +
      `<line class="sc-bypass-rod iso-line" data-tone="lit" x1="${rodStart[0]}" y1="${rodStart[1]}" x2="${rodEnd[0]}" y2="${rodEnd[1]}" style="stroke-width:2.0; stroke:var(--sc-lamp-armed);"/>` +
      `<line class="sc-bypass-flapper iso-line" data-tone="lit" x1="${flapperP1[0]}" y1="${flapperP1[1]}" x2="${flapperP2[0]}" y2="${flapperP2[1]}" style="stroke-width:2.6; stroke:var(--sc-lamp-armed); transform-origin:${flapperP1[0]}px ${flapperP1[1]}px;"/>`,
    { bias: 60, name: `${piece}.actuator` }
  );

  // Vacuum sensing tube from lower manifold to actuator port
  tubeItems(piece, [
    [-12, -46, -24],
    [-12, -32, -48],
    [-20, -22, -48],
  ], 1.2, { name: `${piece}.vac_line`, tone: "lo", bias: 40 });
}

// -------------------------------------------------------------
// BUILD ASSEMBLY 9: INTAKE ELBOW & THROTTLE BODY
// -------------------------------------------------------------
function buildInlet() {
  const piece = "inlet";

  // 1. Aerodynamic 90° Swept Rear Intake Elbow (X = -55 to -102)
  const elbowRoute = [
    [-55, 0, 6],
    [-74, 0, 8],
    [-92, 0, 10],
    [-102, 0, 10],
  ];
  tubeItems(piece, elbowRoute, 16.5, { name: `${piece}.elbow`, tone: "mid", bias: -70 });

  // 2. CNC Machined Aluminum Throttle Body (X = -102 to -126)
  const tbProfile = [
    [-102, 17.5],
    [-106, 17.5],
    [-106, 15.5],
    [-122, 15.5],
    [-122, 16.8], // clamp lip
    [-126, 16.8],
    [-126, 14.0], // bore
  ];
  turnedSolid(piece, SHAFT_CENTER, tbProfile, { tone: "hi" }, { bias: -80, name: `${piece}.tb_housing` });

  // 3. Brass Butterfly Throttle Plate & Quadrant Lever (at X = -114)
  const tbCenter = at([-114, 0, 10]);
  const thP1 = at([-114, -12, 10]);
  const thP2 = at([-114, +12, 10]);
  const leverP1 = at([-114, -16, 10]);
  const leverP2 = at([-114, -16, 18]);

  put(
    piece,
    [-114, 0, 10],
    `<line class="sc-throttle-plate iso-line" data-tone="lit" x1="${thP1[0]}" y1="${thP1[1]}" x2="${thP2[0]}" y2="${thP2[1]}" style="stroke-width:2.4; stroke:#ffd700; transform-origin:${tbCenter[0]}px ${tbCenter[1]}px;"/>` +
      `<line class="sc-throttle-lever iso-line" data-tone="mid" x1="${leverP1[0]}" y1="${leverP1[1]}" x2="${leverP2[0]}" y2="${leverP2[1]}" style="stroke-width:2.0; transform-origin:${leverP1[0]}px ${leverP1[1]}px;"/>` +
      `<circle cx="${leverP1[0]}" cy="${leverP1[1]}" r="2.5" class="iso-solid" data-tone="mid"/>`,
    { bias: -75, name: `${piece}.throttle_plate` }
  );

  // Throttle Position Sensor (TPS) housing with electrical plug
  const tpsPlan = { x: -118, y: 16, w: 8, d: 10, r: 1.5 };
  const tpsSlab = k.slabOf(tpsPlan, 6, 8, P, 3);
  put(piece, [-114, 21, 10], S(tpsSlab, { tone: "lo" }), { bias: -78, name: `${piece}.tps` });
}

// -------------------------------------------------------------
// BUILD ASSEMBLY 10: AIR-TO-WATER INTERCOOLER BRICK
// -------------------------------------------------------------
function buildIntercooler() {
  const piece = "intercooler";

  // 1. High-Density Bar-and-Plate Heat Exchanger Core (X = -32 to +24, Y = -24 to +24, Z = -22 to -44)
  const corePlan = { x: -32, y: -24, w: 56, d: 48, r: 3 };
  const coreSlab = k.slabOf(corePlan, -44, 22, P, 5, 0.8);

  // Micro-fin layer textures along side of core
  const finRows = [];
  for (let i = 0; i < 7; i++) {
    const z = -42 + i * 2.8;
    const outline = k.planOutline(corePlan, z, P);
    finRows.push(Ln(outline, { tone: "faint" }));
  }

  // 2. Side Coolant End Tanks (Left and Right collection tanks)
  const tankLeft = k.slabOf({ x: -30, y: -27.5, w: 52, d: 3.5, r: 1.5 }, -42, 18, P, 3);
  const tankRight = k.slabOf({ x: -30, y: 24.0, w: 52, d: 3.5, r: 1.5 }, -42, 18, P, 3);

  // 3. AN-8 Anodized Coolant In/Out Spigots (Cyan/Blue fittings)
  const fitIn = k.cylinder(16, -28.5, 4.2, -35, 7.5, P, 18);
  const fitOut = k.cylinder(-16, -28.5, 4.2, -35, 7.5, P, 18);

  put(
    piece,
    [-4, 0, -33],
    S(coreSlab, { tone: "hi" }) +
      finRows.join("") +
      S(tankLeft, { tone: "mid" }) +
      S(tankRight, { tone: "mid" }) +
      S(fitIn, { tone: "lit" }) +
      S(fitOut, { tone: "lit" }),
    { bias: -140, name: `${piece}.brick` }
  );

  // Braided Stainless Coolant Lines leading to dyno chiller
  tubeItems(piece, [
    [16, -28.5, -31],
    [28, -48, -31],
    [28, -48, BASE_TOP_Z + 10],
  ], 2.8, { name: `${piece}.coolant_in`, tone: "lo", bias: -130 });

  tubeItems(piece, [
    [-16, -28.5, -31],
    [-28, -48, -31],
    [-28, -48, BASE_TOP_Z + 10],
  ], 2.8, { name: `${piece}.coolant_out`, tone: "lo", bias: -130 });
}

// -------------------------------------------------------------
// BUILD ASSEMBLY 11: LOWER DISCHARGE MANIFOLD & RUNNERS
// -------------------------------------------------------------
function buildManifold() {
  const piece = "manifold";

  // 1. Lower Intake Plenum Slab (X = -38 to +30, Y = -30 to +30, Z = -44 to -56)
  const plenumPlan = { x: -38, y: -30, w: 68, d: 60, r: 4 };
  const plenumSlab = k.slabOf(plenumPlan, -56, 12, P, 5, 1.2);
  const flangeOutline = k.planOutline(k.insetPlan(plenumPlan, 2.5), -44, P);

  // 10 Manifold Perimeter Mounting Flange Bosses
  const flangeBolts = k.corners(plenumPlan, 4.5).map(([bx, by]) => at([bx, by, -44]));

  // 2. 8 Velocity Intake Runners (4 Left Bank, 4 Right Bank angled downward to Z = -68)
  const runnerSvg = [];
  for (let i = 0; i < 4; i++) {
    const rx = -26 + i * 16;
    // Left bank runner
    const r1 = k.cylinder(rx, -24, 5.5, -68, 12, P, 18);
    // Right bank runner
    const r2 = k.cylinder(rx, +24, 5.5, -68, 12, P, 18);
    runnerSvg.push(S(r1, { tone: "mid" }) + S(r2, { tone: "lo" }));
  }

  // 3. Electronic Pressure Transducer & Thermocouple Sensors
  const pressSensor = k.cylinder(-32, 18, 3.2, -52, 9, P, 16);
  const tempSensor = k.cylinder(-32, -18, 2.8, -52, 9, P, 16);

  put(
    piece,
    [-4, 0, -56],
    S(plenumSlab, { tone: "mid" }) +
      Ln(flangeOutline, { tone: "faint" }) +
      Dots(flangeBolts, { size: 0.45, tone: "lit" }) +
      runnerSvg.join("") +
      S(pressSensor, { tone: "lit" }) +
      S(tempSensor, { tone: "lo" }),
    { bias: -160, name: `${piece}.plenum` }
  );
}

// -------------------------------------------------------------
// EXECUTE GEOMETRY BUILD
// -------------------------------------------------------------
buildStand();
buildPulley();
buildSnout();
buildGears();
buildMaleRotor();
buildFemaleRotor();
buildHousing();
buildBypass();
buildInlet();
buildIntercooler();
buildManifold();

// Measure depth and sort items
items.sort((a, b) => a.key - b.key);

const groups = items.map((item, index) => {
  const [mx, my, mz] = item.move;
  return `<g class="it" data-piece="${item.piece}"${item.ride !== item.piece ? ` data-ride="${item.ride}"` : ""} data-k="${item.key.toFixed(2)}" data-m="${mx.toFixed(1)},${my.toFixed(1)},${mz.toFixed(1)}" data-i="${index}"${item.outer ? ' data-outer="true"' : ""}>${item.svg}</g>`;
});

const frontSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg sc-front" viewBox="0 0 ${W} ${H}" aria-hidden="true"><g class="sc-assembly">${groups.join("")}</g></svg>`;

const LABEL_TEXT =
  "High-performance twin-screw supercharger on an instrumented dynamometer test bench: cast aluminum stator case with cooling fins and cutaway viewing window, 3-lobe male and 5-flute female counter-rotating helical rotors, 8-rib billet drive pulley with serpentine cogged belt, conical drive snout with dual angular-contact bearings and torsional spring isolator coupler, matched helical timing gears in synthetic oil bath with sight glass, rear 90° intake elbow with 92mm throttle body, pneumatic bypass valve actuator with return spring and recirculation duct, integrated air-to-water bar-and-plate intercooler brick with AN-8 fittings, cast lower discharge manifold with 8 velocity intake runners, and dual precision analog dial gauges for manifold boost pressure and charge air temperature.";

const backSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg sc-back" viewBox="0 0 ${W} ${H}" role="img" aria-label="${LABEL_TEXT}"></svg>`;

// Airflow particle projection anchors
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
  pieces: PIECES,
  stagger: STAGGER,
  spring: SPRING,
  anchors: {
    inlet: at([-124, 0, 10]),
    elbow: at([-85, 0, 8]),
    rotorIn: at([-48, -14, 0]),
    rotorMid: at([0, 0, 0]),
    discharge: at([-4, 0, -22]),
    intercooler: at([-4, 0, -38]),
    manifold: at([-4, 0, -62]),
    bypassRun: at([-20, -42, -10]),
  },
};

// -------------------------------------------------------------
// HTML TEMPLATE & MARKUP
// -------------------------------------------------------------
const corners = `<div class="iso-plate-corners" aria-hidden="true">
  <span class="iso-plate-corner" data-corner="fig">Fig 1</span>
  <span class="iso-plate-corner" data-corner="title">Supercharger · Positive Displacement Dyno &amp; Cutaway</span>
  <span class="iso-plate-corner" data-corner="readout" data-readout>10,580 Rotor RPM · +8.5 PSI · 38 °C IAT</span>
</div>`;

const controls = `<div class="sc-controls">
  <button type="button" class="sc-btn" data-run><span class="sc-lamp" aria-hidden="true"></span><span data-run-label>Dyno Drive</span></button>
  <button type="button" class="sc-btn" data-apart><span class="sc-lamp" aria-hidden="true"></span><span data-apart-label>Explode View</span></button>
  <button type="button" class="sc-btn" data-cutaway><span class="sc-lamp" aria-hidden="true"></span><span data-cutaway-label>Internal Cutaway</span></button>

  <div class="sc-throttle-wrap">
    <span class="sc-throttle-label">Throttle:</span>
    <input type="range" min="0" max="100" value="55" class="sc-slider" data-throttle-slider aria-label="Engine throttle and supercharger drive level">
    <span class="sc-throttle-val" data-throttle-val>55%</span>
  </div>

  <div class="sc-preset-strip">
    <button type="button" class="sc-preset-btn" data-preset="0.0">Idle</button>
    <button type="button" class="sc-preset-btn" data-preset="0.22">Cruise</button>
    <button type="button" class="sc-preset-btn" data-preset="0.48" data-active>Boost</button>
    <button type="button" class="sc-preset-btn" data-preset="0.82">Peak Boost</button>
    <button type="button" class="sc-preset-btn" data-preset="1.0">Overdrive WOT</button>
  </div>

  <span class="sc-hint">[Space] Run · [E] Explode · [C] Cutaway · [1-5] Presets · Drag Slider · Click Parts</span>
  <span class="sc-live" aria-live="polite" data-live></span>
</div>`;

const telemetry = `<div class="sc-telemetry">
  <div class="sc-tele-item"><span class="sc-tele-label">Rotor Speed</span><span class="sc-tele-val" data-tele-rotor-rpm>10,584 RPM</span></div>
  <div class="sc-tele-item"><span class="sc-tele-label">Crankshaft Speed</span><span class="sc-tele-val" data-tele-crank-rpm>4,320 RPM</span></div>
  <div class="sc-tele-item"><span class="sc-tele-label">Manifold Boost</span><span class="sc-tele-val" data-boost data-tele-boost>+8.5 PSI (0.59 bar)</span></div>
  <div class="sc-tele-item"><span class="sc-tele-label">Pre-IC Temp (Compression)</span><span class="sc-tele-val" data-hot data-tele-pre-temp>88 °C (190 °F)</span></div>
  <div class="sc-tele-item"><span class="sc-tele-label">Post-IC Charge Air (IAT2)</span><span class="sc-tele-val" data-cold data-tele-post-temp>38 °C (100 °F)</span></div>
  <div class="sc-tele-item"><span class="sc-tele-label">Parasitic Drive Loss</span><span class="sc-tele-val" data-loss data-tele-power-loss>21.5 HP (16.0 kW)</span></div>
  <div class="sc-tele-item"><span class="sc-tele-label">Bypass Recirculation</span><span class="sc-tele-val" data-tele-bypass>Closed (0% · 100% Boost)</span></div>
  <div class="sc-tele-item"><span class="sc-tele-label">Mass Airflow</span><span class="sc-tele-val" data-tele-flow>39.8 lb/min (301 g/s)</span></div>
</div>`;

const partsBtns = ORDER_DISPLAY.map(
  (id, index) =>
    `<button type="button" class="sc-part-btn" data-part="${id}"><span class="sc-part-num">${String(index + 1).padStart(2, "0")}</span>${PIECES[id].name}</button>`
).join("");

const stage = `<div class="sc-stage" tabindex="0" role="slider" aria-label="Interactive Supercharger Flow Dyno: drag throttle slider, space toggles run, e toggles exploded view, c toggles internal cutaway" aria-valuemin="0" aria-valuemax="100" aria-valuenow="55" aria-valuetext="Running at 10,580 Rotor RPM, +8.5 PSI Boost">
  ${backSvg}
  ${frontSvg}
  <canvas class="sc-flow-canvas" aria-hidden="true"></canvas>
</div>`;

const caption =
  "A supercharger is a positive-displacement compressor mechanically driven directly by the engine's crankshaft via a serpentine belt and step-up pulley (typically 2.45:1 ratio). Inside the cast aluminum casing, precision-timed helical rotors—a 3-lobe male drive rotor and a 5-flute female driven rotor—counter-rotate with microscopic 0.003\" clearance maintained by oil-bathed helical timing gears. Ambient air entering through the rear throttle body is swept axially along the helical cavities, progressively compressed, and forced downward through the discharge port. Because compression raises charge air temperature up to 135°C (275°F), an integrated bar-and-plate liquid intercooler core directly beneath the rotors cools the charge down to 42°C (108°F) before entering the cylinder intake runners. Crucially, an internal bypass valve held open by manifold vacuum during cruising recirculates air to eliminate parasitic drive drag (<0.8 HP); stomping the throttle snaps the bypass shut, delivering instantaneous, lag-free boost pressure (+18.5 PSI).";

const body = `<figure class="iso-figure sc">
  <div class="iso-plate">${corners}${stage}${controls}${telemetry}</div>
  <figcaption class="iso-legend">
    <div class="sc-parts">${partsBtns}</div>
    <span class="iso-caption">${caption}</span>
  </figcaption>
</figure>`;

const CSS = readFileSync(join(HERE, "supercharger.css"), "utf8");
const LIVE = readFileSync(join(HERE, "supercharger-live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));

const page = k.pageHtml({
  title: "Supercharger — Anatomy",
  theme: THEME,
  body: `<style>${CSS}</style>${body}`,
  script: kitScript() + glScript() + LIVE,
  width: 980,
});

const outName = THEME === "light" ? "supercharger-light.html" : "supercharger.html";
writeFileSync(join(HERE, outName), page);
console.log("wrote", outName, `${(page.length / 1024).toFixed(0)} KB`, `${items.length} items`);
