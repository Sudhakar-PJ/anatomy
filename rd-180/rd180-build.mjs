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
const DEG = Math.PI / 180;

const W = 960;
const H = 920;
const AZIMUTH = 40;
const ELEVATION = 27;

const Z_EXIT = 138;
const BEAM_Z = 475;
const BEAM_H = 26;
const DECK = { x: -160, y: -120, w: 320, d: 240, r: 14 };
const DECK_H = 16;
const FOOT_H = 6;
const COLUMN = 22;
const COLUMN_AT = [
  [-138, 92],
  [138, -92],
];

const CHAMBER_A_X = -58;
const CHAMBER_B_X = 58;
const EXIT_R = 42.5;

// Coordinate bounds for camera fit
const BOUNDS = [
  ...k.boxCorners(DECK, -DECK_H - FOOT_H, 0),
  [-175, -135, -DECK_H - FOOT_H],
  [175, 135, -DECK_H - FOOT_H],
  [-175, -135, BEAM_Z + BEAM_H + 15],
  [175, 135, BEAM_Z + BEAM_H + 15],
];

const P = k.fitProjection(BOUNDS, W, H, {
  pad: 48,
  azimuth: AZIMUTH,
  elevation: ELEVATION,
});

const V = G.viewOf(P);
const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const Ln = (d, style) => k.lineSvg(d, style);
const Dots = (points, style) => k.dotsSvg(points, style);
const FADE = [0.04, 0.42];

const box = (plan, z, h, proj, opts = {}) => k.extrude(k.roundedPlan(plan, plan.r > 0 ? 6 : 0), z, h, proj, opts);

const DECKF = G.frameOf([0, 0, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]);

// Exploded Assemblies
const PIECES = {
  stand: {
    name: "Vertical Test Stand & Load Cell",
    say: "heavy test stand · dual flame deflectors & deluge rings · 390 tf load cell",
    move: [0, 0, 0],
  },
  gimbal_frame: {
    name: "Thrust Frame & 4 Gimbal Actuators",
    say: "upper thrust structure · 4 hydraulic TVC servo-actuators (±8° gimbal)",
    move: [0, 0, 36],
  },
  preburner: {
    name: "Oxygen-Rich Preburner (ORPB)",
    say: "single preburner · 100% of LOX + starter RP-1 · TEA-TEB hypergolic cartridge",
    move: [0, -28, 54],
  },
  turbopump: {
    name: "180,000 HP Main Turbopump",
    say: "single-shaft turbopump (135 MW) · central turbine with LOX and RP-1 impellers",
    move: [0, 0, 18],
  },
  hotgas_duct: {
    name: "Bifurcated Hot-Gas Ducts",
    say: "Y-bifurcation duct · delivers 100% oxygen-rich turbine exhaust to both chambers",
    move: [0, 30, 0],
  },
  chamber_a: {
    name: "Left Combustion Chamber & Nozzle",
    say: "Chamber A · 257 bar · coaxial swirl injector · milled copper-alloy cooling jacket",
    move: [-50, 0, -42],
  },
  chamber_b: {
    name: "Right Combustion Chamber & Nozzle",
    say: "Chamber B · 257 bar · coaxial swirl injector · milled copper-alloy cooling jacket",
    move: [50, 0, -42],
  },
  fuel_plumbing: {
    name: "RP-1 High-Pressure Plumbing",
    say: "RP-1 downcomers to lower nozzle manifolds · regenerative cooling return lines",
    move: [0, -36, -24],
  },
  controller: {
    name: "Digital ECU & Hydraulic Power Unit",
    say: "dual-redundant digital engine controller · hydraulic power unit & sensor harness",
    move: [0, 40, -18],
  },
};

const STAGGER = [
  "chamber_a",
  "chamber_b",
  "fuel_plumbing",
  "controller",
  "hotgas_duct",
  "turbopump",
  "preburner",
  "gimbal_frame",
  "stand",
];

const ORDER_DISPLAY = [
  "stand",
  "gimbal_frame",
  "preburner",
  "turbopump",
  "hotgas_duct",
  "chamber_a",
  "chamber_b",
  "fuel_plumbing",
  "controller",
];

const SPRING = { stagger: 0.035, stiffness: 66, damping: 14.2, substeps: 4 };
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

function tubeItems(piece, route, r, { name, tone = "hi", bias = 0, move, maxLength, spacing, closed = false, owner } = {}) {
  const id = nameFor(name ?? `${piece}.tube`);
  R.route(id, route, r, { owner: owner ?? id, closed, piece, move: move ?? PIECES[piece].move, ride: rideOf(piece, move) });
  tubePieces(route, r, P, { maxLength, spacing, closed }).forEach((part, index) =>
    put(piece, part.mid, tubeSvg(part, { tone }), { bias, move, name: `${id}:${index}`, route: id, chunk: index, shapes: [A.tube(part.points, part.radii)] }),
  );
  return id;
}

function turned(piece, F, profile, style = {}, { extra = "", inner = "", bias = 0, move, bevel = 0, name, owner } = {}) {
  const paths = G.solidOf(profile, F, P, { bevel });
  const mid = (profile[0][0] + profile[profile.length - 1][0]) / 2;
  const id = nameFor(name ?? `${piece}.turned${Math.round(profile[0][0])}`);
  const shape = record(A.solid(F, profile, { name: id, owner }));
  put(piece, G.add3(F.o, G.mul3(F.a, mid)), S(paths, { tone: "hi", ...style, inner: inner ? Ln(inner, { tone: "faint" }) : "" }) + extra, { bias, move, name: id, shapes: [shape] });
  return shape;
}

// ----------------------------------------------------
// 1. STAND & BASE DECK (Static Background)
// ----------------------------------------------------
const backParts = [];

// Baseplate
backParts.push(S(box(DECK, -DECK_H, DECK_H, P, { bevel: 1.2 }), { tone: "mid" }));
backParts.push(Ln(k.topTicks(DECK, 0, 4.5, 9, P), { tone: "lo" }));
const cornerDots = [
  at([DECK.x + 8, DECK.y + 8, 0]),
  at([DECK.x + DECK.w - 8, DECK.y + 8, 0]),
  at([DECK.x + 8, DECK.y + DECK.d - 8, 0]),
  at([DECK.x + DECK.w - 8, DECK.y + DECK.d - 8, 0]),
];
backParts.push(Dots(cornerDots, { size: 0.55, tone: "lo" }));

// Feet
for (const [fx, fy] of [
  [DECK.x + 16, DECK.y + 16],
  [DECK.x + DECK.w - 16, DECK.y + 16],
  [DECK.x + 16, DECK.y + DECK.d - 16],
  [DECK.x + DECK.w - 16, DECK.y + DECK.d - 16],
]) {
  backParts.push(S(k.cylinder(fx, fy, 10, -DECK_H - FOOT_H, FOOT_H, P, 24), { tone: "lo" }));
}

// Dual Flame Deflector Wells & Deluge Water Spray Rings
for (const cx of [CHAMBER_A_X, CHAMBER_B_X]) {
  // Flame deflector cone
  backParts.push(S(G.solidOf([[0, 44], [8, 38], [18, 26], [28, 12], [32, 0]], G.frameOf([cx, 0, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]), P), { tone: "lo" }));
  // Deluge ring
  backParts.push(S(G.disc(3, 7, 48, G.frameOf([cx, 0, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]), P), { tone: "mid" }));
  backParts.push(Dots(G.dotsOf(G.frameOf([cx, 0, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]), 7, 47, 24, P, { fade: FADE }), { size: 0.42, tone: "mid" }));
}

// Vertical Columns
for (const [colX, colY] of COLUMN_AT) {
  const colBox = { x: colX - COLUMN / 2, y: colY - COLUMN / 2, w: COLUMN, d: COLUMN, r: 2 };
  backParts.push(S(box(colBox, 0, BEAM_Z + BEAM_H, P, { bevel: 0.8 }), { tone: "mid" }));
  // Service brackets
  for (let z = 60; z < BEAM_Z; z += 55) {
    backParts.push(S(box({ x: colBox.x - 2, y: colBox.y - 2, w: COLUMN + 4, d: COLUMN + 4, r: 1 }, z, 8, P), { tone: "lo" }));
  }
}

// Overhead Crosshead Beam & Load Cell
const beamAlong = [1, 0, 0];
const beamAcross = [0, 1, 0];
const beamBox = { x: -165, y: -20, w: 330, d: 40, r: 4 };
put("stand", [0, 0, BEAM_Z + BEAM_H / 2], S(box(beamBox, BEAM_Z, BEAM_H, P, { bevel: 1.0 }), { tone: "mid" }), { bias: 200, name: "stand.beam" });

// Load Cell Canister
put("stand", [0, 0, BEAM_Z - 12], S(k.cylinder(0, 0, 16, BEAM_Z - 18, 18, P, 36), { tone: "hi" }) + Ln(k.knurl(0, 0, 16, BEAM_Z - 14, BEAM_Z - 6, 36, P), { tone: "lo" }), { bias: 190, name: "stand.loadcell" });

// ----------------------------------------------------
// 2. THRUST FRAME & GIMBAL ACTUATORS (`gimbal_frame`)
// ----------------------------------------------------
// Upper thrust puck
put("gimbal_frame", [0, 0, BEAM_Z - 24], S(k.cylinder(0, 0, 32, BEAM_Z - 30, 8, P, 40, 0.8), { tone: "hi" }) + Dots(G.dotsOf(DECKF, BEAM_Z - 22, 28, 16, P, { fade: FADE }), { size: 0.45 }), { bias: 180, name: "gimbal.puck" });

// Thrust cone struts
for (const [xSign] of [[-1], [1]]) {
  const strutRoute = [
    [0, 0, BEAM_Z - 30],
    [xSign * 42, 0, 390],
    [xSign * 58, 0, 312],
  ];
  tubeItems("gimbal_frame", G.fillet(strutRoute, 14, 12, { P, tube: 3.5 }), 3.5, { tone: "mid", name: `gimbal.strut_${xSign > 0 ? "r" : "l"}` });
}

// 4 Hydraulic TVC Gimbal Actuators (2 per chamber)
const ACTUATOR_SPECS = [
  { chamber: CHAMBER_A_X, name: "act_a1", top: [CHAMBER_A_X - 18, 16, 360], bot: [CHAMBER_A_X - 18, -14, 255] },
  { chamber: CHAMBER_A_X, name: "act_a2", top: [CHAMBER_A_X + 18, 16, 360], bot: [CHAMBER_A_X + 18, -14, 255] },
  { chamber: CHAMBER_B_X, name: "act_b1", top: [CHAMBER_B_X - 18, 16, 360], bot: [CHAMBER_B_X - 18, -14, 255] },
  { chamber: CHAMBER_B_X, name: "act_b2", top: [CHAMBER_B_X + 18, 16, 360], bot: [CHAMBER_B_X + 18, -14, 255] },
];

for (const act of ACTUATOR_SPECS) {
  const midZ = (act.top[2] + act.bot[2]) / 2;
  // Actuator cylinder
  put("gimbal_frame", act.top, S(k.cylinder(act.top[0], act.top[1], 3.2, midZ, act.top[2] - midZ, P, 18), { tone: "mid" }), { name: `${act.name}.cyl` });
  // Sliding chrome piston rod
  put("gimbal_frame", act.bot, S(k.cylinder(act.bot[0], act.bot[1], 1.8, act.bot[2], midZ - act.bot[2], P, 16), { tone: "hi" }), { name: `${act.name}.rod` });
}

// ----------------------------------------------------
// 3. MAIN TURBOPUMP ASSEMBLY (`turbopump`)
// ----------------------------------------------------
const TP_Z = 345;
const TPF = G.frameOf([0, 0, TP_Z], [1, 0, 0], [0, 1, 0], [0, 0, 1]); // Along X-axis

// Central 180,000 HP Turbine Housing
turned("turbopump", TPF, [
  [-14, 28],
  [14, 28],
  [14, 22],
  [-14, 22],
], { tone: "hi" }, { name: "turbopump.turbine_case" });

// RP-1 Fuel Pump Impeller Volute (Left Side)
turned("turbopump", G.frameOf([-24, 0, TP_Z], [1, 0, 0], [0, 1, 0], [0, 0, 1]), [
  [-12, 22],
  [10, 22],
  [10, 15],
  [-12, 15],
], { tone: "mid" }, { name: "turbopump.fuel_pump" });

// LOX Oxidizer Pump Impeller Volute (Right Side)
turned("turbopump", G.frameOf([24, 0, TP_Z], [1, 0, 0], [0, 1, 0], [0, 0, 1]), [
  [-10, 24],
  [12, 24],
  [12, 16],
  [-10, 16],
], { tone: "hi" }, { name: "turbopump.lox_pump" });

// Shaft bearing end covers
put("turbopump", [-36, 0, TP_Z], S(G.disc(-2, 2, 14, G.frameAlong([-36, 0, TP_Z], [-1, 0, 0]), P), { tone: "mid" }), { name: "turbopump.end_l" });
put("turbopump", [36, 0, TP_Z], S(G.disc(-2, 2, 15, G.frameAlong([36, 0, TP_Z], [1, 0, 0]), P), { tone: "mid" }), { name: "turbopump.end_r" });

// ----------------------------------------------------
// 4. OXYGEN-RICH PREBURNER (`preburner`)
// ----------------------------------------------------
const PB_Z = 385;
const PBF = G.frameOf([0, -6, PB_Z], [0, 0, 1], [1, 0, 0], [0, 1, 0]);

turned("preburner", PBF, [
  [-18, 17],
  [16, 17],
  [24, 14],
  [32, 18],
], { tone: "hi" }, { name: "preburner.body" });

// Top LOX Inlet Flange
put("preburner", [0, -6, PB_Z + 32], S(k.cylinder(0, -6, 20, PB_Z + 30, 4, P, 32), { tone: "mid" }) + Dots(G.dotsOf(PBF, PB_Z + 32, 17.5, 12, P, { fade: FADE }), { size: 0.4 }), { name: "preburner.flange" });

// TEA-TEB Hypergolic Start Canister on Side
put("preburner", [18, -12, PB_Z + 10], S(k.cylinder(18, -12, 4.2, PB_Z - 4, 18, P, 18), { tone: "hi" }), { name: "preburner.teateb" });

// ----------------------------------------------------
// 5. BIFURCATED HOT-GAS DUCTS (`hotgas_duct`)
// ----------------------------------------------------
// Massive Y-duct delivering oxygen-rich turbine exhaust into both chamber heads
const hotGasA = [
  [0, 0, TP_Z - 10],
  [-24, 6, 322],
  [CHAMBER_A_X, 0, 296],
];
tubeItems("hotgas_duct", G.fillet(hotGasA, 16, 14, { P, tube: 8.5 }), 8.5, { tone: "hi", name: "hotgas.duct_a" });

const hotGasB = [
  [0, 0, TP_Z - 10],
  [24, 6, 322],
  [CHAMBER_B_X, 0, 296],
];
tubeItems("hotgas_duct", G.fillet(hotGasB, 16, 14, { P, tube: 8.5 }), 8.5, { tone: "hi", name: "hotgas.duct_b" });

// Expansion bellows collars on hot-gas ducts
put("hotgas_duct", [-32, 4, 318], S(k.cylinder(-32, 4, 10.5, 314, 8, P, 24), { tone: "mid" }), { name: "hotgas.bellows_a" });
put("hotgas_duct", [32, 4, 318], S(k.cylinder(32, 4, 10.5, 314, 8, P, 24), { tone: "mid" }), { name: "hotgas.bellows_b" });

// ----------------------------------------------------
// 6. COMBUSTION CHAMBER A & NOZZLE (`chamber_a`)
// ----------------------------------------------------
const CF_A = G.frameOf([CHAMBER_A_X, 0, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]);

// Injector Dome
turned("chamber_a", CF_A, [
  [278, 28],
  [294, 28],
  [298, 24],
], { tone: "hi" }, { name: "chamber_a.dome" });

// Combustion Chamber Cylinder & Acoustic Waist
turned("chamber_a", CF_A, [
  [226, 26],
  [278, 26],
], { tone: "hi" }, { name: "chamber_a.waist" });

// Convergent-Divergent Bell Nozzle Profile
turned("chamber_a", CF_A, [
  [Z_EXIT, EXIT_R],
  [160, 36],
  [190, 26],
  [220, 16.5], // Throat
  [226, 26],
], { tone: "hi" }, { name: "chamber_a.nozzle" });

// Circumferential Stiffener Bands on Bell
for (const sz of [150, 172, 195]) {
  put("chamber_a", [CHAMBER_A_X, 0, sz], S(G.disc(sz - 1.2, sz + 1.2, EXIT_R - (sz - Z_EXIT) * 0.32 + 1.5, CF_A, P), { tone: "mid" }), { name: `chamber_a.band_${sz}` });
}

// Lower Nozzle Regenerative Manifold Ring
put("chamber_a", [CHAMBER_A_X, 0, 146], S(G.disc(143, 149, EXIT_R + 3.2, CF_A, P), { tone: "hi" }) + Dots(G.dotsOf(CF_A, 146, EXIT_R + 2.2, 20, P, { fade: FADE }), { size: 0.38 }), { name: "chamber_a.manifold" });

// ----------------------------------------------------
// 7. COMBUSTION CHAMBER B & NOZZLE (`chamber_b`)
// ----------------------------------------------------
const CF_B = G.frameOf([CHAMBER_B_X, 0, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]);

// Injector Dome
turned("chamber_b", CF_B, [
  [278, 28],
  [294, 28],
  [298, 24],
], { tone: "hi" }, { name: "chamber_b.dome" });

// Combustion Chamber Cylinder & Acoustic Waist
turned("chamber_b", CF_B, [
  [226, 26],
  [278, 26],
], { tone: "hi" }, { name: "chamber_b.waist" });

// Convergent-Divergent Bell Nozzle Profile
turned("chamber_b", CF_B, [
  [Z_EXIT, EXIT_R],
  [160, 36],
  [190, 26],
  [220, 16.5], // Throat
  [226, 26],
], { tone: "hi" }, { name: "chamber_b.nozzle" });

// Circumferential Stiffener Bands on Bell
for (const sz of [150, 172, 195]) {
  put("chamber_b", [CHAMBER_B_X, 0, sz], S(G.disc(sz - 1.2, sz + 1.2, EXIT_R - (sz - Z_EXIT) * 0.32 + 1.5, CF_B, P), { tone: "mid" }), { name: `chamber_b.band_${sz}` });
}

// Lower Nozzle Regenerative Manifold Ring
put("chamber_b", [CHAMBER_B_X, 0, 146], S(G.disc(143, 149, EXIT_R + 3.2, CF_B, P), { tone: "hi" }) + Dots(G.dotsOf(CF_B, 146, EXIT_R + 2.2, 20, P, { fade: FADE }), { size: 0.38 }), { name: "chamber_b.manifold" });

// ----------------------------------------------------
// 8. FUEL PLUMBING & FEED MANIFOLDS (`fuel_plumbing`)
// ----------------------------------------------------
// Main RP-1 Downcomers from pump discharge to lower nozzle manifolds
const rp1RouteA = [
  [-24, 0, TP_Z - 6],
  [-36, -14, 260],
  [CHAMBER_A_X + 16, -18, 180],
  [CHAMBER_A_X + 26, -14, 146],
];
tubeItems("fuel_plumbing", G.fillet(rp1RouteA, 14, 12, { P, tube: 4.2 }), 4.2, { tone: "mid", name: "fuel.downcomer_a" });

const rp1RouteB = [
  [-18, 0, TP_Z - 6],
  [12, -14, 260],
  [CHAMBER_B_X - 16, -18, 180],
  [CHAMBER_B_X - 26, -14, 146],
];
tubeItems("fuel_plumbing", G.fillet(rp1RouteB, 14, 12, { P, tube: 4.2 }), 4.2, { tone: "mid", name: "fuel.downcomer_b" });

// Regenerative Cooling Return Lines up to injector domes
const returnA = [
  [CHAMBER_A_X - 28, 4, 148],
  [CHAMBER_A_X - 30, 8, 230],
  [CHAMBER_A_X - 24, 6, 286],
];
tubeItems("fuel_plumbing", G.fillet(returnA, 10, 10, { P, tube: 3.2 }), 3.2, { tone: "hi", name: "fuel.return_a" });

const returnB = [
  [CHAMBER_B_X + 28, 4, 148],
  [CHAMBER_B_X + 30, 8, 230],
  [CHAMBER_B_X + 24, 6, 286],
];
tubeItems("fuel_plumbing", G.fillet(returnB, 10, 10, { P, tube: 3.2 }), 3.2, { tone: "hi", name: "fuel.return_b" });

// ----------------------------------------------------
// 9. CONTROLLER, HPU & SENSOR HARNESS (`controller`)
// ----------------------------------------------------
// Digital Engine Controller (ECU) Enclosure
put("controller", [0, 42, 280], S(box({ x: -22, y: 34, w: 44, d: 18, r: 2 }, 265, 30, P), { tone: "hi" }), { name: "controller.ecu" });

// Hydraulic Power Unit (HPU) Pump & Accumulator Sphere
put("controller", [-28, 38, 280], S(k.cylinder(-28, 38, 7.5, 268, 24, P, 24), { tone: "mid" }), { name: "controller.hpu" });
put("controller", [28, 38, 280], S(G.disc(-7, 7, 8.5, G.frameAlong([28, 38, 280], [0, 1, 0]), P), { tone: "mid" }), { name: "controller.accum" });

// Armored harness conduits
tubeItems("controller", [
  [0, 34, 280],
  [-16, 22, 290],
  [CHAMBER_A_X, 12, 285],
], 1.4, { tone: "lo", name: "controller.harness_a" });

tubeItems("controller", [
  [0, 34, 280],
  [16, 22, 290],
  [CHAMBER_B_X, 12, 285],
], 1.4, { tone: "lo", name: "controller.harness_b" });

// ----------------------------------------------------
// SETTLE & ASSEMBLE
// ----------------------------------------------------
if (process.argv.includes("--settle")) {
  A.settle(R, P);
}
items.sort((a, b) => a.key - b.key);

const groups = items.map((item, index) => {
  const [mx, my, mz] = item.move;
  return `<g class="it" data-piece="${item.piece}"${item.ride !== item.piece ? ` data-ride="${item.ride}"` : ""} data-k="${item.key.toFixed(2)}" data-m="${mx.toFixed(1)},${my.toFixed(1)},${mz.toFixed(1)}" data-i="${index}">${item.svg}</g>`;
});

const LABEL_TEXT =
  "NPO Energomash RD-180 rocket engine on a vertical test stand: heavy deck on feet with dual flame deflector wells and deluge rings, two box columns, and an overhead crosshead with a 390 tf load cell. Two combustion chambers with regeneratively cooled bell nozzles hang below a shared 180,000 HP single-shaft turbopump and a single oxygen-rich preburner (ORPB). A massive bifurcated Y-duct splits the superheated oxygen-rich turbine exhaust into both injector domes, controlled by four hydraulic gimbal actuators.";

const backSvg = k.figureSvg({ width: W, height: H, label: LABEL_TEXT, body: backParts.join(""), className: "rd-back" });
const frontSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg rd-front" viewBox="0 0 ${W} ${H}" aria-hidden="true"><g class="rd-engine">${groups.join("")}</g></svg>`;

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
  exitA: at([CHAMBER_A_X, 0, Z_EXIT]),
  exitB: at([CHAMBER_B_X, 0, Z_EXIT]),
  screenExitA: at([CHAMBER_A_X, 0, Z_EXIT]),
  screenExitB: at([CHAMBER_B_X, 0, Z_EXIT]),
  zExit: Z_EXIT,
  chamberAX: CHAMBER_A_X,
  chamberBX: CHAMBER_B_X,
  exitR: EXIT_R,
  plumeLength: Z_EXIT - 20,
  chamberBar: 257,
  vacuumTf: 423,
  backTf: 33, // Sea level backpressure loss
  columns: COLUMN_AT,
  columnHalf: COLUMN / 2 + 0.4,
  columnTop: BEAM_Z + BEAM_H,
  deckX: DECK.x,
  deckY: DECK.y,
  deckW: DECK.w,
  deckD: DECK.d,
  pieces: Object.fromEntries(Object.entries(PIECES).map(([id, piece]) => [id, { name: piece.name, say: piece.say }])),
  stagger: STAGGER,
  spring: SPRING,
  order: ORDER_DISPLAY,
};

const PARTS = DATA.order.map((id, index) => `<button type="button" class="rd-part" data-part="${id}"><span class="rd-num">${String(index + 1).padStart(2, "0")}</span>${PIECES[id].name}</button>`).join("");
const corners = `<div class="iso-plate-corners" aria-hidden="true"><span class="iso-plate-corner" data-corner="fig">Fig 1</span><span class="iso-plate-corner" data-corner="title">RD-180 · Dual-Chamber Staged Combustion</span><span class="iso-plate-corner" data-corner="readout" data-readout>5,480 kg · cold</span></div>`;
const controls = `<div class="rd-controls"><button type="button" class="rd-fire" data-fire><span class="rd-lamp" aria-hidden="true"></span><span data-fire-label>Ignite</span></button><span class="rd-hint">Hover the engine to take it apart · Press [I] to ignite</span><span class="rd-live" aria-live="polite" data-live></span></div>`;

// Dual Nozzle Rim Glow
const lipA = G.circleOf(CF_A, Z_EXIT, EXIT_R, P, 40);
const lipB = G.circleOf(CF_B, Z_EXIT, EXIT_R, P, 40);
const glowSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg rd-glow" viewBox="0 0 ${W} ${H}" aria-hidden="true"><g class="rd-glow-g"><path class="rd-rim rd-rim-soft" d="${lipA} ${lipB}"/><path class="rd-rim" d="${lipA} ${lipB}"/></g></svg>`;

const stage = `<div class="rd-stage" tabindex="0" role="slider" aria-label="RD-180 dual-chamber staged combustion rocket engine on vertical test stand. Hover to explode assemblies; press I to fire." aria-valuemin="0" aria-valuemax="${DATA.order.length}" aria-valuenow="0" aria-valuetext="5,480 kg · cold">${backSvg}<canvas class="rd-plume" aria-hidden="true"></canvas>${frontSvg}${glowSvg}<canvas class="rd-veil" aria-hidden="true"></canvas><div class="rd-flash" aria-hidden="true"></div></div>`;

const caption =
  "The NPO Energomash RD-180 is an oxygen-rich staged-combustion rocket engine that powered the Atlas V launcher: liquid oxygen and RP-1 kerosene at 257 bar chamber pressure, generating 390 tf (3.83 MN) of sea-level thrust at 5,480 kg dry mass. A single 180,000 HP (135 MW) turbopump and a single oxygen-rich preburner drive both combustion chambers through a massive insulated bifurcated Y-duct. Four independent hydraulic TVC actuators provide ±8° of pitch, yaw, and roll gimbaling.";

const body = `<figure class="iso-figure rd"><div class="iso-plate">${corners}${stage}${controls}</div><figcaption class="iso-legend"><div class="rd-parts">${PARTS}</div><span class="iso-caption">${caption}</span></figcaption></figure>`;

const CSS = readFileSync(join(HERE, "rd180.css"), "utf8");
const LIVE = readFileSync(join(HERE, "rd180-live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));
const page = k.pageHtml({ title: "RD-180 Rocket Engine", theme: THEME, body: `<style>${CSS}</style>${body}`, script: glScript() + LIVE, width: 980 });

const name = THEME === "light" ? "rd180-light.html" : "rd180.html";
writeFileSync(join(HERE, name), page);
console.log("wrote", name, `${(page.length / 1024).toFixed(0)} KB`, `${items.length} items`);
