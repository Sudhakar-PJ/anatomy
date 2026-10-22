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
const H = 880;
const AZIMUTH = 42;
const ELEVATION = 28;

// Coordinate System (World Units, approx mm):
// X: Longitudinal shaft axis (+X forward toward compressor inlet, -X rearward toward turbine exhaust)
// Y: Transverse lateral axis (-Y towards wastegate actuator, +Y towards compressor discharge)
// Z: Vertical axis (+Z up towards oil feed/outlet pipe, -Z down towards dyno baseplate)

// 1. BASEPLATE & DYNO BENCH
const BASE = { x: -140, y: -95, w: 280, d: 190, r: 12 };
const BASE_H = 14;
const FOOT_H = 5;
const BASE_TOP_Z = -44;

// 2. BOUNDING BOX FOR CAMERA FITTING
const BOUNDS = [
  ...k.boxCorners(BASE, -BASE_H - FOOT_H - 44, -44),
  [-75, 0, 0],
  [+68, 0, 0],
  [+24, +34, +54],
  [+18, -48, +32],
  [-2, 0, +36],
  [+88, -42, +15],
  [-88, -42, +15],
  [0, 60, 0],
  [0, -60, 0],
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
    name: "Dyno test stand",
    say: "dynamometer test bench · precision cradle & dual instruments",
    move: [0, 0, 0],
  },
  compressor_housing: {
    name: "Compressor housing (A/R 0.60)",
    say: "A356-T6 cast aluminum volute · converts dynamic velocity to static boost pressure",
    move: [68, 0, 0],
  },
  compressor_wheel: {
    name: "Billet compressor wheel",
    say: "forged milled billet 2618 aluminum · 10 swept blades · up to 210,000 RPM",
    move: [46, 0, 0],
  },
  backplate: {
    name: "Compressor backplate & seal",
    say: "machined aluminum seal plate · fluorocarbon O-ring & carbon-face oil barrier",
    move: [25, 0, 0],
  },
  chra: {
    name: "Bearing housing (CHRA)",
    say: "cast iron center housing · dual ceramic ball bearings · oil & water cooling",
    move: [0, 0, 0],
  },
  heat_shield: {
    name: "Turbine heat shield",
    say: "formed 304 stainless refractory shroud · protects CHRA from 950°C radiant exhaust heat",
    move: [-22, 0, 0],
  },
  turbine_wheel: {
    name: "Inconel turbine wheel & shaft",
    say: "friction-welded Inconel-713C radial wheel · driven by expanding exhaust gas",
    move: [-44, 0, 0],
  },
  turbine_housing: {
    name: "Turbine housing (A/R 0.82)",
    say: "high-nickel Ni-Resist cast iron housing · T3 twin-scroll inlet · V-band outlet",
    move: [-68, 0, 0],
  },
  wastegate: {
    name: "Wastegate actuator & linkage",
    say: "pneumatic diaphragm canister & swingarm flapper valve · regulates peak boost",
    move: [0, -48, 16],
  },
  plumbing: {
    name: "Oil & water plumbing harness",
    say: "-4AN braided oil feed, gravity drain pipe & cross-flow water cooling lines",
    move: [0, 0, 26],
  },
};

const STAGGER = [
  "compressor_housing",
  "compressor_wheel",
  "backplate",
  "turbine_housing",
  "turbine_wheel",
  "heat_shield",
  "wastegate",
  "plumbing",
  "chra",
  "stand",
];

const ORDER_DISPLAY = [
  "compressor_housing",
  "compressor_wheel",
  "backplate",
  "chra",
  "heat_shield",
  "turbine_wheel",
  "turbine_housing",
  "wastegate",
  "plumbing",
  "stand",
];

const SPRING = { stagger: 0.035, stiffness: 68, damping: 14.5, substeps: 4 };
const R = A.recorder(P, { order: STAGGER, spring: SPRING });
const { items, nameFor } = R;
const record = R.solid;

const rideOf = (piece, move) => (move ? Object.keys(PIECES).find((id) => PIECES[id].move === move) ?? piece : piece);

function put(piece, ref, svg, { bias = 0, move, ride, shapes = [], name, route, chunk } = {}) {
  R.put({
    piece,
    ride: ride ?? rideOf(piece, move),
    at: ref,
    bias,
    svg,
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
const SHAFT = G.frameOf([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
const FLOOR = G.frameOf([0, 0, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]);

// Helper for turned bodies along shaft
function shaftSolid(piece, profile, style = {}, { bias = 0, move, name, inner = "" } = {}) {
  const paths = G.solidOf(profile, SHAFT, P, { smooth: true, steps: 48 });
  const midX = (profile[0][0] + profile[profile.length - 1][0]) / 2;
  const id = nameFor(name ?? `${piece}.shaft${Math.round(midX)}`);
  const shape = record(A.solid(SHAFT, profile, { name: id }));
  put(piece, [midX, 0, 0], S(paths, { tone: "hi", ...style, inner: inner ? Ln(inner, { tone: "faint" }) : "" }), {
    bias,
    move,
    name: id,
    shapes: [shape],
  });
  return shape;
}

// -------------------------------------------------------------
// BUILD ASSEMBLY 1: DYNO TEST STAND & INSTRUMENT BENCH
// -------------------------------------------------------------
function buildStand() {
  // 1. Bedplate Slab and Soft Halo
  const haloD = k.haloOf(BASE, -BASE_H - FOOT_H - 44, 14, P);
  put("stand", [0, 0, -64], `<path class="iso-halo" d="${haloD}"/>`, { bias: -500, name: "stand.halo" });

  // 4 Vibration Isolation Feet at Corners
  const footCorners = k.corners(BASE, 20);
  for (const [fx, fy] of footCorners) {
    const flange = k.cylinder(fx, fy, 8.5, -44 - BASE_H - FOOT_H, 2.2, P, 24);
    const foot = k.cylinder(fx, fy, 6.2, -44 - BASE_H - FOOT_H + 2.2, FOOT_H - 0.4, P, 24);
    put("stand", [fx, fy, -60], S(flange, { tone: "lo" }) + S(foot, { tone: "mid" }), { bias: -450, name: `stand.foot.${fx}.${fy}` });
  }

  // Baseplate heavy casting
  const baseSlab = k.slabOf(BASE, -44 - BASE_H, BASE_H, P, 8, 1.4);
  const groove = k.planOutline(k.insetPlan(BASE, 5.5), -44, P);
  const cornerBolts = k.corners(BASE, 10).map(([bx, by]) => at([bx, by, -44]));

  // Millimeter Ruler Strip along front
  const rulerPlan = { x: -115, y: BASE.y + BASE.d - 14, w: 230, d: 8, r: 1.2 };
  const rulerSlab = k.slabOf(rulerPlan, -44, 0.6, P, 3);
  const ticks = k.topTicks(rulerPlan.x + 4, rulerPlan.x + rulerPlan.w - 4, 4, 5, rulerPlan.y + 1, -43.4, [1.8, 3.2], P);

  // Brass Technical Plaque
  const plaquePlan = { x: -44, y: BASE.y + BASE.d - 14, w: 88, d: 8, r: 1 };
  const plaqueSlab = k.slabOf(plaquePlan, -43.4, 0.5, P, 3);
  const plaqueGroove = k.planOutline(k.insetPlan(plaquePlan, 1.2), -42.9, P);
  const plaqueRivets = k.corners(plaquePlan, 2.5).map(([px, py]) => at([px, py, -42.9]));

  put(
    "stand",
    [0, 0, -44],
    S(baseSlab, { tone: "lo" }) +
      Ln(groove, { tone: "faint" }) +
      Dots(cornerBolts, { size: 0.45, tone: "mid" }) +
      S(rulerSlab, { tone: "lo" }) +
      Ln(ticks.minor, { tone: "lo" }) +
      Ln(ticks.major, { tone: "mid" }) +
      S(plaqueSlab, { tone: "mid" }) +
      Ln(plaqueGroove, { tone: "faint" }) +
      Dots(plaqueRivets, { size: 0.4, tone: "hi" }),
    { bias: -400, name: "stand.bedplate" }
  );

  // Rigid Cast Cradle Stanchions Clamping Turbo
  // Stanchion 1: Turbine Side (X = -28)
  const st1Plan = { x: -36, y: -26, w: 16, d: 52, r: 4 };
  const st1 = k.slabOf(st1Plan, -44, 22, P, 6, 1.0);
  const st1Pinch = k.cylinder(-28, 0, 18, -22, 6, P, 36);
  put("stand", [-28, 0, -30], S(st1, { tone: "mid" }) + S(st1Pinch, { tone: "lo" }), { bias: -200, name: "stand.stanchion1" });

  // Stanchion 2: CHRA/Compressor Side (X = +8)
  const st2Plan = { x: 0, y: -26, w: 16, d: 52, r: 4 };
  const st2 = k.slabOf(st2Plan, -44, 22, P, 6, 1.0);
  const st2Pinch = k.cylinder(8, 0, 17, -22, 6, P, 36);
  put("stand", [8, 0, -30], S(st2, { tone: "mid" }) + S(st2Pinch, { tone: "lo" }), { bias: -200, name: "stand.stanchion2" });

  // -----------------------------------------------------------
  // DUAL PRECISION ANALOG INSTRUMENTS ON BENCH (FRONT LEFT & FRONT RIGHT)
  // -----------------------------------------------------------
  // 1. Boost Pressure Gauge at Front Left (X = -92, Y = +52)
  const gBx = -92, gBy = 52;
  const gbStem = k.cylinder(gBx, gBy, 3.8, -44, 26, P, 18);
  const gbPuck = k.cylinder(gBx, gBy, 14.0, -18, 7.5, P, 48, 0.8);
  const gbKnurl = k.knurl(gBx, gBy, 14.0, -13, -11, 48, P);
  const gbTicks = k.radialTicks(gBx, gBy, 12.0, 48, 6, -10.5, [1.5, 3.0], P);
  const gbRing = k.ring(gBx, gBy, 12.6, -10.5, P, 48);
  const gbHub = at([gBx, gBy, -10.5]);
  const gbNeedleTail = at([gBx - 2.5, gBy + 2.5, -10.3]);
  const gbNeedleTip = at([gBx + 7.5, gBy - 6.5, -10.3]);

  put(
    "stand",
    [gBx, gBy, -18],
    S(gbStem, { tone: "lo" }) +
      S(gbPuck, { tone: "hi" }) +
      Ln(gbKnurl, { tone: "lo" }) +
      Ln(gbRing, { tone: "mid" }) +
      Ln(gbTicks.minor, { tone: "lo" }) +
      Ln(gbTicks.major, { tone: "mid" }) +
      Dots([gbHub], { size: 0.85, tone: "lit" }) +
      `<line class="turbo-needle-boost iso-line" data-tone="lit" x1="${gbNeedleTail[0]}" y1="${gbNeedleTail[1]}" x2="${gbNeedleTip[0]}" y2="${gbNeedleTip[1]}" style="stroke-width:1.6; stroke:var(--turbo-cold-1);"/>`,
    { bias: 250, name: "stand.gauge_boost" }
  );

  // 2. Tachometer & EGT Gauge at Front Right (X = +92, Y = +52)
  const gTx = 92, gTy = 52;
  const gtStem = k.cylinder(gTx, gTy, 3.8, -44, 26, P, 18);
  const gtPuck = k.cylinder(gTx, gTy, 14.0, -18, 7.5, P, 48, 0.8);
  const gtKnurl = k.knurl(gTx, gTy, 14.0, -13, -11, 48, P);
  const gtTicks = k.radialTicks(gTx, gTy, 12.0, 48, 6, -10.5, [1.5, 3.0], P);
  const gtRing = k.ring(gTx, gTy, 12.6, -10.5, P, 48);
  const gtHub = at([gTx, gTy, -10.5]);
  const gtNeedleTail = at([gTx - 2.5, gTy + 2.5, -10.3]);
  const gtNeedleTip = at([gTx + 6.5, gTy - 7.5, -10.3]);

  put(
    "stand",
    [gTx, gTy, -18],
    S(gtStem, { tone: "lo" }) +
      S(gtPuck, { tone: "hi" }) +
      Ln(gtKnurl, { tone: "lo" }) +
      Ln(gtRing, { tone: "mid" }) +
      Ln(gtTicks.minor, { tone: "lo" }) +
      Ln(gtTicks.major, { tone: "mid" }) +
      Dots([gtHub], { size: 0.85, tone: "lit" }) +
      `<line class="turbo-needle-rpm iso-line" data-tone="lit" x1="${gtNeedleTail[0]}" y1="${gtNeedleTail[1]}" x2="${gtNeedleTip[0]}" y2="${gtNeedleTip[1]}" style="stroke-width:1.6; stroke:var(--turbo-hot-1);"/>`,
    { bias: 250, name: "stand.gauge_rpm" }
  );
}

// -------------------------------------------------------------
// BUILD ASSEMBLY 2: TURBINE HOUSING (A/R 0.82)
// -------------------------------------------------------------
function buildTurbineHousing() {
  const piece = "turbine_housing";

  // Volute Scroll Casting: expands spirally along X from -48 to -8
  const voluteProfile = [
    [-48, 22.0],
    [-44, 24.5],
    [-40, 29.0],
    [-34, 34.0],
    [-26, 38.5],
    [-18, 41.0],
    [-12, 36.0],
    [-8, 28.5],
  ];
  shaftSolid(piece, voluteProfile, { tone: "mid" }, { bias: -120, name: `${piece}.volute` });

  // V-Band Exhaust Discharge Outlet Neck (s = -60 to -48)
  const vbandNeck = [
    [-60, 22.0],
    [-58, 24.5], // V-band 15-deg retention lip
    [-54, 22.2],
    [-48, 22.2],
  ];
  shaftSolid(piece, vbandNeck, { tone: "lo" }, { bias: -150, name: `${piece}.vband_neck` });

  // Stainless V-Band Quick-Release Clamp Ring (s = -56 to -52)
  const clampRing = [
    [-56, 25.0],
    [-52, 25.0],
  ];
  shaftSolid(piece, clampRing, { tone: "hi" }, { bias: -140, name: `${piece}.vband_clamp` });

  // T3 Divided Twin-Scroll Exhaust Gas Inlet Flange (at bottom/side)
  const t3Plan = { x: -44, y: -36, w: 26, d: 18, r: 2 };
  const t3Flange = k.slabOf(t3Plan, -34, 6.5, P, 4, 0.8);
  const t3Studs = k.corners(t3Plan, 3.2).map(([sx, sy]) => at([sx, sy, -27.5]));
  const t3Neck = k.cylinder(-31, -27, 8.5, -28, 12, P, 24);

  put(
    piece,
    [-31, -27, -28],
    S(t3Flange, { tone: "mid" }) +
      S(t3Neck, { tone: "lo" }) +
      Dots(t3Studs, { size: 0.5, tone: "lit" }),
    { bias: -110, name: `${piece}.t3_flange` }
  );

  // Internal Wastegate Port Orifice (Ø16mm hole inside housing discharge)
  const wgPortD = G.circleOf(G.frameAlong([-38, -12, -4], [1, 0, 0]), 0, 5.0, P, 24);
  put(piece, [-38, -12, -4], Ln(wgPortD, { tone: "mid" }), { bias: -105, name: `${piece}.wg_port` });

  // 6 High-Temperature Ni-Resist Clamp Plates & Bolts (s = -8.0)
  const turbClampDots = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    turbClampDots.push(at(G.pointOf(SHAFT, -8.0, 30.5, a)));
  }
  put(piece, [-8.0, 0, 0], Dots(turbClampDots, { size: 0.5, tone: "lit" }), { bias: -115, name: `${piece}.clamp_bolts` });
}

// -------------------------------------------------------------
// BUILD ASSEMBLY 3: INCONEL TURBINE WHEEL & CENTER SHAFT
// -------------------------------------------------------------
function buildTurbineWheel() {
  const piece = "turbine_wheel";

  // Inconel-713C Turbine Hub (s = -24 to -8)
  const turbHubProfile = [
    [-24, 23.5],
    [-22, 23.0],
    [-18, 18.5],
    [-14, 13.0],
    [-10, 8.5],
    [-8, 5.8],
  ];
  shaftSolid(piece, turbHubProfile, { tone: "hi" }, { bias: -80, name: `${piece}.hub` });

  // 9 Curved Inconel Turbine Blades (Sculpted 3D Aerofoils)
  const bladeSvg = [];
  for (let i = 0; i < 9; i++) {
    const angle = (i / 9) * Math.PI * 2;
    const r1 = 23.5;
    const r2 = 9.0;
    const pRoot = G.pointOf(SHAFT, -23, r1, angle);
    const pTip = G.pointOf(SHAFT, -10, r2, angle + 0.48);
    const pMidOut = G.pointOf(SHAFT, -16, (r1 + r2) / 2 + 1.5, angle + 0.26);
    const pMidIn = G.pointOf(SHAFT, -16, (r1 + r2) / 2 - 1.0, angle + 0.20);
    const pRootIn = G.pointOf(SHAFT, -23, r1 - 1.8, angle);
    const turbPoly = k.pathOf([at(pRoot), at(pMidOut), at(pTip), at(pMidIn), at(pRootIn)], true);
    bladeSvg.push(
      `<path class="turbo-blade-turb iso-fill" d="${turbPoly}" style="fill:var(--anatomy-face);"/>` +
      `<path class="turbo-blade-turb iso-line" data-tone="lit" d="${turbPoly}" style="stroke-width:1.4; stroke:var(--turbo-hot-1);"/>`
    );
  }
  put(piece, [-16, 0, 0], bladeSvg.join(""), { bias: -75, name: `${piece}.blades` });

  // Precision Ground Center Shaft (extends from -8 through CHRA to +28)
  const shaftProfile = [
    [-8, 4.8],
    [+26, 4.8],
    [+28, 3.8],
  ];
  shaftSolid(piece, shaftProfile, { tone: "hi" }, { bias: -50, name: `${piece}.shaft` });
}

// -------------------------------------------------------------
// BUILD ASSEMBLY 4: TURBINE HEAT SHIELD
// -------------------------------------------------------------
function buildHeatShield() {
  const piece = "heat_shield";

  // Formed 304 Stainless Refractory Isolation Disc (s = -8.5 to -7)
  const shieldProfile = [
    [-8.5, 27.5],
    [-8.0, 27.5],
    [-7.5, 20.0],
    [-7.0, 6.0],
  ];
  shaftSolid(piece, shieldProfile, { tone: "mid" }, { bias: -60, name: `${piece}.shroud` });
}

// -------------------------------------------------------------
// BUILD ASSEMBLY 5: CHRA / BEARING CARTRIDGE HOUSING
// -------------------------------------------------------------
function buildCHRA() {
  const piece = "chra";

  // Cast Iron Bearing Cartridge (s = -7 to +7)
  const chraBody = [
    [-7, 18.5],
    [-5, 20.5],
    [-3, 20.5],
    [+3, 20.5],
    [+5, 20.5],
    [+7, 18.5],
  ];
  shaftSolid(piece, chraBody, { tone: "mid" }, { bias: 0, name: `${piece}.body` });

  // 3 Perimeter Structural Cooling Fins / Ribs
  for (const sx of [-4, 0, 4]) {
    const fin = [
      [sx - 0.7, 23.0],
      [sx + 0.7, 23.0],
    ];
    shaftSolid(piece, fin, { tone: "hi" }, { bias: 5, name: `${piece}.fin${sx}` });
  }

  // Dual Ceramic Ball Bearing Cartridges (Revealed in Cutaway & Exploded Views)
  // 1. Turbine-side Ceramic Ball Bearing (s = -3.5)
  const bbTurbOuter = [
    [-4.8, 12.5],
    [-2.2, 12.5],
  ];
  shaftSolid(piece, bbTurbOuter, { tone: "mid" }, { bias: 8, name: `${piece}.bb_turb_race` });
  const bbTurbBalls = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    bbTurbBalls.push(at(G.pointOf(SHAFT, -3.5, 8.8, a)));
  }
  put(piece, [-3.5, 0, 0], Dots(bbTurbBalls, { size: 0.65, tone: "lit" }), { bias: 10, name: `${piece}.bb_turb_balls` });

  // 2. Compressor-side Ceramic Ball Bearing (s = +3.5)
  const bbCompOuter = [
    [+2.2, 12.5],
    [+4.8, 12.5],
  ];
  shaftSolid(piece, bbCompOuter, { tone: "mid" }, { bias: 8, name: `${piece}.bb_comp_race` });
  const bbCompBalls = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.25;
    bbCompBalls.push(at(G.pointOf(SHAFT, +3.5, 8.8, a)));
  }
  put(piece, [+3.5, 0, 0], Dots(bbCompBalls, { size: 0.65, tone: "lit" }), { bias: 10, name: `${piece}.bb_comp_balls` });

  // Top Engine Oil Feed Port (-4AN Male Fitting with Hex Flats)
  const oilBoss = k.cylinder(0, 0, 5.0, 20.5, 5.0, P, 24);
  const oilHex = k.cylinder(0, 0, 4.0, 25.5, 4.5, P, 6);
  put(piece, [0, 0, 24], S(oilBoss, { tone: "mid" }) + S(oilHex, { tone: "lit" }), { bias: 20, name: `${piece}.oil_feed_port` });

  // Bottom Gravity Oil Drain Diamond Flange (Z = -20 to -24)
  const drainPlan = { x: -11, y: -7, w: 22, d: 14, r: 3 };
  const drainFlange = k.slabOf(drainPlan, -24, 3.5, P, 4, 0.6);
  const drainBolts = [at([-7, 0, -20.5]), at([+7, 0, -20.5])];
  put(piece, [0, 0, -22], S(drainFlange, { tone: "mid" }) + Dots(drainBolts, { size: 0.45, tone: "lit" }), { bias: 20, name: `${piece}.oil_drain_port` });

  // Side Water Cooling Ports (M14x1.5 Banjo Bolts)
  for (const side of [-1, 1]) {
    const wy = side * 19;
    const banjoCyl = k.cylinder(0, wy, 4.5, 0, 4.0, P, 20);
    const banjoBolt = k.cylinder(0, wy, 3.0, 4.0, 2.5, P, 6);
    put(piece, [0, wy, 2], S(banjoCyl, { tone: "mid" }) + S(banjoBolt, { tone: "lit" }), { bias: 15, name: `${piece}.water_banjo_${side}` });
  }
}

// -------------------------------------------------------------
// BUILD ASSEMBLY 6: COMPRESSOR BACKPLATE & SEAL
// -------------------------------------------------------------
function buildBackplate() {
  const piece = "backplate";

  // Precision Aluminum Backplate Disc (s = +7 to +10, radius 31.5)
  const plateProfile = [
    [+7, 31.5],
    [+9, 31.5],
    [+10, 26.5],
    [+10, 6.0],
  ];
  shaftSolid(piece, plateProfile, { tone: "hi" }, { bias: 30, name: `${piece}.plate` });

  // 6 Perimeter Retaining Bolts on Ø52mm Bolt Circle
  const boltDots = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    boltDots.push(at(G.pointOf(SHAFT, 9.2, 27.5, a)));
  }
  put(piece, [9.2, 0, 0], Dots(boltDots, { size: 0.42, tone: "mid" }), { bias: 35, name: `${piece}.bolts` });
}

// -------------------------------------------------------------
// BUILD ASSEMBLY 7: BILLET COMPRESSOR IMPELLER WHEEL
// -------------------------------------------------------------
function buildCompressorWheel() {
  const piece = "compressor_wheel";

  // Forged Milled Billet (FMW) 2618 Impeller Hub Profile (s = +10 to +27)
  const compHubProfile = [
    [+10, 26.0],
    [+12, 24.5],
    [+16, 19.5],
    [+20, 13.5],
    [+24, 8.5],
    [+27, 5.5],
  ];
  shaftSolid(piece, compHubProfile, { tone: "lit" }, { bias: 50, name: `${piece}.hub` });

  // 10 Aerodynamic Impeller Blades (5 Primary + 5 Splitters, 3D Aerofoils)
  const compBladeSvg = [];
  for (let i = 0; i < 10; i++) {
    const isSplitter = i % 2 === 1;
    const a0 = (i / 10) * Math.PI * 2;
    const rStart = 25.5;
    const sStart = isSplitter ? 14 : 10;
    const rEnd = isSplitter ? 10.5 : 5.8;
    const sEnd = isSplitter ? 22 : 27;

    const pRoot = G.pointOf(SHAFT, sStart, rStart, a0);
    const pMidOut = G.pointOf(SHAFT, (sStart + sEnd) / 2, (rStart + rEnd) / 2 + 1.2, a0 + 0.28);
    const pTip = G.pointOf(SHAFT, sEnd, rEnd, a0 + 0.52);
    const pMidIn = G.pointOf(SHAFT, (sStart + sEnd) / 2, (rStart + rEnd) / 2 - 0.9, a0 + 0.22);
    const pRootIn = G.pointOf(SHAFT, sStart, rStart - 1.5, a0);
    const bladePoly = k.pathOf([at(pRoot), at(pMidOut), at(pTip), at(pMidIn), at(pRootIn)], true);

    compBladeSvg.push(
      `<path class="turbo-blade-comp iso-fill" d="${bladePoly}" style="fill:var(--anatomy-face);"/>` +
      `<path class="turbo-blade-comp iso-line" data-tone="lit" d="${bladePoly}" style="stroke-width:${isSplitter ? 0.9 : 1.3}; stroke:var(--turbo-cold-1);"/>`
    );
  }
  put(piece, [18, 0, 0], compBladeSvg.join(""), { bias: 55, name: `${piece}.blades` });

  // Nose Cone & Reverse-Pitch Hex Locknut (s = +27 to +32)
  const noseProfile = [
    [+27, 5.2],
    [+29, 4.5],
    [+32, 4.5],
  ];
  shaftSolid(piece, noseProfile, { tone: "lit" }, { bias: 60, name: `${piece}.locknut` });
}

// -------------------------------------------------------------
// BUILD ASSEMBLY 8: COMPRESSOR HOUSING (A/R 0.60)
// -------------------------------------------------------------
function buildCompressorHousing() {
  const piece = "compressor_housing";

  // Cast Aluminum Volute Scroll (s = +9 to +36)
  const compVolute = [
    [+9, 28.0],
    [+13, 34.0],
    [+18, 38.5],
    [+25, 41.5],
    [+31, 35.0],
    [+36, 24.0],
  ];
  shaftSolid(piece, compVolute, { tone: "hi" }, { bias: 70, name: `${piece}.volute` });

  // 6 Perimeter Retention Clamp Plates & Bolts (s = 9.5)
  const compClampDots = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.2;
    compClampDots.push(at(G.pointOf(SHAFT, 9.5, 33.5, a)));
  }
  put(piece, [9.5, 0, 0], Dots(compClampDots, { size: 0.5, tone: "lit" }), { bias: 72, name: `${piece}.clamp_bolts` });

  // Front Inlet Bellmouth Inducer (s = +32 to +52, bore radius 17, lip 21)
  const bellmouthProfile = [
    [+32, 23.5],
    [+44, 21.0],
    [+50, 21.0],
    [+52, 23.0], // flared bell lip
  ];
  shaftSolid(piece, bellmouthProfile, { tone: "hi" }, { bias: 80, name: `${piece}.bellmouth` });

  // Anti-Surge Ported Shroud Bleed Groove Ring (s = +40 to +43)
  const antiSurgeRing = G.circleOf(SHAFT, 42, 18.2, P, 36);
  put(piece, [42, 0, 0], Ln(antiSurgeRing, { tone: "faint" }), { bias: 85, name: `${piece}.anti_surge` });

  // Tangential Boost Discharge Outlet Pipe (Snout)
  // Branches from volute at X = 18, Y = 22, Z = 20, rising upward to X = 22, Y = 28, Z = 50
  const outletRoute = [
    [18, 20, 18],
    [20, 24, 32],
    [22, 27, 48],
  ];
  tubeItems(piece, outletRoute, 10.5, {
    tone: "hi",
    bias: 90,
    name: `${piece}.outlet_pipe`,
  });

  // Silicone Coupler Hose on Boost Outlet (length 14)
  const couplerRoute = [
    [21, 26, 40],
    [22, 27, 49],
  ];
  tubeItems(piece, couplerRoute, 11.8, {
    tone: "mid",
    bias: 92,
    name: `${piece}.coupler`,
  });

  // Stainless Steel T-Bolt Clamp Band (Z = 45)
  const clampRoute = [
    [21.5, 26.5, 44],
    [21.7, 26.7, 46],
  ];
  tubeItems(piece, clampRoute, 12.6, {
    tone: "lit",
    bias: 95,
    name: `${piece}.tbolt_clamp`,
  });

  // Miniature Brass Boost Reference Fitting
  const refFitting = k.cylinder(24, 18, 1.8, 30, 4.5, P, 12);
  put(piece, [24, 18, 32], S(refFitting, { tone: "mid" }), { bias: 88, name: `${piece}.boost_nipple` });
}

// -------------------------------------------------------------
// BUILD ASSEMBLY 9: WASTEGATE ACTUATOR & LINKAGE
// -------------------------------------------------------------
function buildWastegate() {
  const piece = "wastegate";

  // 1. Gold-Zinc Canister Body (mounted at X = 14, Y = -38, Z = 16)
  const canBase = [14, -38, 16];
  const canCyl = k.cylinder(canBase[0], canBase[1], 11.0, canBase[2] - 10, 20, P, 36, 0.8);
  const canRim = k.cylinder(canBase[0], canBase[1], 12.0, canBase[2] + 4, 2.5, P, 36);
  const canNipple = k.cylinder(canBase[0], canBase[1], 1.8, canBase[2] + 10, 4.0, P, 12);

  // Rigid Laser-Cut Steel Mounting Bracket
  const bktPlan = { x: 8, y: -44, w: 14, d: 24, r: 2 };
  const bktSlab = k.slabOf(bktPlan, 6, 3.0, P, 4, 0.6);

  put(
    piece,
    canBase,
    S(canCyl, { tone: "hi" }) +
      S(canRim, { tone: "lit" }) +
      S(canNipple, { tone: "mid" }) +
      S(bktSlab, { tone: "lo" }),
    { bias: 70, name: `${piece}.canister` }
  );

  // 2. Threaded Stainless Actuator Rod with Clevis Fork
  // Extends from canister center (X = 14) rearward to turbine wastegate crank (X = -32)
  const rodRoute = [
    [14, -38, 16],
    [-24, -38, 16],
  ];
  tubeItems(piece, rodRoute, 2.4, {
    tone: "lit",
    bias: 75,
    name: `${piece}.rod`,
  });

  // Knurled Jam Nut & Clevis Fork at X = -26 to -32
  const clevisPlan = { x: -32, y: -41, w: 9, d: 6, r: 1.5 };
  const clevisSlab = k.slabOf(clevisPlan, 13.5, 5.0, P, 4, 0.5);
  const pivotPin = k.cylinder(-29, -38, 1.8, 12, 8.0, P, 12);

  // Wastegate Bellcrank Lever Arm & Internal Flapper Valve
  const crankArm = k.pathOf([at([-29, -38, 16]), at([-35, -28, 10]), at([-38, -14, -4])]);
  const flapperDisc = G.circleOf(G.frameAlong([-38, -14, -4], [1, 0, 0]), 0, 7.2, P, 24);

  put(
    piece,
    [-30, -35, 14],
    `<g class="turbo-wg-rod">` +
      S(clevisSlab, { tone: "mid" }) +
      S(pivotPin, { tone: "lit" }) +
      `</g>` +
      `<g class="turbo-wg-flapper">` +
      `<path class="iso-line" data-tone="lit" d="${crankArm}" style="stroke-width:2.2;"/>` +
      `<path class="iso-line" data-tone="lit" d="${flapperDisc}" style="fill:var(--anatomy-face); stroke-width:1.4;"/>` +
      `</g>`,
    { bias: 78, name: `${piece}.linkage` }
  );
}

// -------------------------------------------------------------
// BUILD ASSEMBLY 10: FLUID PLUMBING HARNESS
// -------------------------------------------------------------
function buildPlumbing() {
  const piece = "plumbing";

  // 1. High-Pressure Braided Stainless Steel -4AN Oil Feed Line
  const oilRoute = [
    [0, 0, 30],
    [-2, 12, 38],
    [-18, 24, 34],
    [-48, 28, 12],
    [-64, 28, -38],
  ];
  tubeItems(piece, oilRoute, 2.4, {
    tone: "lit",
    bias: 40,
    name: `${piece}.oil_feed_line`,
  });

  // 2. Mirror-Polished Gravity Oil Drain Downpipe (from CHRA bottom to sump)
  const drainRoute = [
    [0, 0, -24],
    [0, 0, -38],
    [6, -6, -44],
  ];
  tubeItems(piece, drainRoute, 3.8, {
    tone: "hi",
    bias: 35,
    name: `${piece}.oil_drain_pipe`,
  });

  // 3. Reinforced Silicone Boost Signal Reference Hose
  // Runs from compressor housing nipple [24, 18, 30] to wastegate canister [14, -38, 20]
  const boostLineRoute = [
    [24, 18, 31],
    [28, 4, 35],
    [26, -22, 32],
    [16, -36, 26],
  ];
  tubeItems(piece, boostLineRoute, 1.8, {
    tone: "mid",
    bias: 65,
    name: `${piece}.boost_signal_line`,
  });
}

// Build all assemblies in order
buildStand();
buildTurbineHousing();
buildTurbineWheel();
buildHeatShield();
buildCHRA();
buildBackplate();
buildCompressorWheel();
buildCompressorHousing();
buildWastegate();
buildPlumbing();

// Measure depth and sort items
items.sort((a, b) => a.key - b.key);

const groups = items.map((item, index) => {
  const [mx, my, mz] = item.move;
  return `<g class="it" data-piece="${item.piece}"${item.ride !== item.piece ? ` data-ride="${item.ride}"` : ""} data-k="${item.key.toFixed(2)}" data-m="${mx.toFixed(1)},${my.toFixed(1)},${mz.toFixed(1)}" data-i="${index}">${item.svg}</g>`;
});

// Front and Back SVGs
const LABEL_TEXT =
  "High-performance turbocharger on an instrumented dynamometer test bench: cast Ni-Resist turbine housing with T3 flange and internal wastegate, Inconel-713C turbine wheel, water and oil-cooled CHRA bearing cartridge with ceramic ball bearings, machined backplate, forged milled billet 10-blade compressor impeller, A356-T6 compressor volute with anti-surge ported shroud and tangential boost discharge, pneumatic wastegate actuator with adjustable rod linkage, braided stainless oil and silicone boost reference plumbing, and dual analog dial gauges for boost pressure and shaft tachometer.";

const backSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg turbo-back" viewBox="0 0 ${W} ${H}" role="img" aria-label="${LABEL_TEXT}"></svg>`;
const frontSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg turbo-front" viewBox="0 0 ${W} ${H}" aria-hidden="true"><g class="turbo-assembly">${groups.join("")}</g></svg>`;

const unit = (vector) => {
  const o = at([0, 0, 0]);
  const p = at(vector);
  return [p[0] - o[0], p[1] - o[1]];
};

const DATA = {
  W,
  H,
  V,
  EX: unit([1, 0, 0]),
  EY: unit([0, 1, 0]),
  EZ: unit([0, 0, 1]),
  camera: glCamera(P),
  pieces: Object.fromEntries(Object.entries(PIECES).map(([id, p]) => [id, { name: p.name, say: p.say }])),
  stagger: STAGGER,
  order: ORDER_DISPLAY,
  spring: SPRING,
  gaugeBoost: at([-92, 52, -10.5]),
  gaugeRpm: at([92, 52, -10.5]),
  wgPivot: at([-29, -38, 16]),

  // Precomputed screen points for particle trajectories
  flowCompIn: at([52, 0, 0]),
  flowCompVol: [at([36, 14, 12]), at([28, 22, 24]), at([22, 26, 36])],
  flowCompOut: at([22, 27, 48]),

  flowTurbIn: at([-31, -27, -28]),
  flowTurbVol: [
    at([-31, -27, -14]),
    at([-26, -22, 8]),
    at([-20, -16, 20]),
    at([-14, 0, 24]),
    at([-20, 16, 16]),
    at([-26, 12, -6]),
    at([-36, 0, -2]),
  ],
  flowTurbOut: at([-60, 0, 0]),
  flowWaste: at([-46, -12, -2]),
};

// Corner metadata badges
const corners = `<div class="iso-plate-corners" aria-hidden="true">
  <span class="iso-plate-corner" data-corner="fig">Fig 1</span>
  <span class="iso-plate-corner" data-corner="title">Turbocharger · Flow Dyno &amp; Cutaway</span>
  <span class="iso-plate-corner" data-corner="readout" data-readout>125,000 RPM · +12.0 PSI · 750 °C EGT</span>
</div>`;

// Interactive Control Panel
const controls = `<div class="turbo-controls">
  <button type="button" class="turbo-btn" data-run><span class="turbo-lamp" aria-hidden="true"></span><span data-run-label>Spooling Run</span></button>
  <button type="button" class="turbo-btn" data-apart><span class="turbo-lamp" aria-hidden="true"></span><span data-apart-label>Explode View</span></button>
  <button type="button" class="turbo-btn" data-cutaway><span class="turbo-lamp" aria-hidden="true"></span><span data-cutaway-label>Internal Cutaway</span></button>

  <div class="turbo-throttle-wrap">
    <span class="turbo-throttle-label">Throttle:</span>
    <input type="range" min="0" max="100" value="55" class="turbo-slider" data-throttle-slider aria-label="Engine throttle and turbo spool level">
    <span class="turbo-throttle-val" data-throttle-val>55%</span>
  </div>

  <div class="turbo-preset-strip">
    <button type="button" class="turbo-preset-btn" data-preset="0.0">Idle</button>
    <button type="button" class="turbo-preset-btn" data-preset="0.25">Cruise</button>
    <button type="button" class="turbo-preset-btn" data-preset="0.55" data-active>Spool</button>
    <button type="button" class="turbo-preset-btn" data-preset="0.80">Peak Boost</button>
    <button type="button" class="turbo-preset-btn" data-preset="1.0">Overboost</button>
  </div>

  <span class="turbo-hint">[Space] Run · [E] Explode · [C] Cutaway · [1-5] Presets · Drag Slider</span>
  <span class="turbo-live" aria-live="polite" data-live></span>
</div>`;

// Live Telemetry Dashboard
const telemetry = `<div class="turbo-telemetry">
  <div class="turbo-tele-item"><span class="turbo-tele-label">Shaft Speed</span><span class="turbo-tele-val" data-tele-rpm>125,000 RPM</span></div>
  <div class="turbo-tele-item"><span class="turbo-tele-label">Manifold Boost</span><span class="turbo-tele-val" data-cold data-tele-boost>+12.0 PSI (0.83 bar)</span></div>
  <div class="turbo-tele-item"><span class="turbo-tele-label">Turbine Inlet (EGT)</span><span class="turbo-tele-val" data-hot data-tele-egt>750 °C (1,382 °F)</span></div>
  <div class="turbo-tele-item"><span class="turbo-tele-label">Charge Air Exit</span><span class="turbo-tele-val" data-cold data-tele-charge>90 °C</span></div>
  <div class="turbo-tele-item"><span class="turbo-tele-label">Mass Airflow</span><span class="turbo-tele-val" data-tele-flow>24.5 lb/min</span></div>
  <div class="turbo-tele-item"><span class="turbo-tele-label">Wastegate Valve</span><span class="turbo-tele-val" data-tele-waste>Closed · 100% Flow to Turbine</span></div>
</div>`;

const partsBtns = ORDER_DISPLAY.map(
  (id, index) =>
    `<button type="button" class="turbo-part-btn" data-part="${id}"><span class="turbo-part-num">${String(index + 1).padStart(2, "0")}</span>${PIECES[id].name}</button>`
).join("");

const stage = `<div class="turbo-stage" tabindex="0" role="slider" aria-label="Interactive Turbocharger Flow Dyno: drag throttle slider, space toggles run, e toggles exploded view, c toggles internal cutaway" aria-valuemin="0" aria-valuemax="100" aria-valuenow="55" aria-valuetext="Spooling at 125,000 RPM, +12.0 PSI Boost">
  ${backSvg}
  ${frontSvg}
  <canvas class="turbo-flow-canvas" aria-hidden="true"></canvas>
</div>`;

const caption =
  "A turbocharger recycles waste thermal and kinetic exhaust energy to force compressed charge air into the engine cylinders. Expanding exhaust gases at up to 950°C enter the cast Ni-Resist turbine housing, spinning the Inconel-713C turbine wheel at over 200,000 RPM. A rigid center shaft passing through ceramic ball bearings inside the CHRA drives the forged billet aluminum compressor wheel, scooping ambient air and accelerating it radially outward through the expanding volute diffuser to generate positive manifold boost pressure (+22 PSI). When boost reaches the target threshold, the pneumatic wastegate actuator diaphragm extends its rod, swinging the internal flapper valve open to bypass excess exhaust around the turbine wheel and prevent engine overboost.";

const body = `<figure class="iso-figure turbo">
  <div class="iso-plate">${corners}${stage}${controls}${telemetry}</div>
  <figcaption class="iso-legend">
    <div class="turbo-parts">${partsBtns}</div>
    <span class="iso-caption">${caption}</span>
  </figcaption>
</figure>`;

const CSS = readFileSync(join(HERE, "turbo.css"), "utf8");
const LIVE = readFileSync(join(HERE, "turbo-live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));

const page = k.pageHtml({
  title: "Turbocharger — Anatomy",
  theme: THEME,
  body: `<style>${CSS}</style>${body}`,
  script: kitScript() + glScript() + LIVE,
  width: 980,
});

const outName = THEME === "light" ? "turbo-light.html" : "turbo.html";
writeFileSync(join(HERE, outName), page);
console.log("wrote", outName, `${(page.length / 1024).toFixed(0)} KB`, `${items.length} items`);
