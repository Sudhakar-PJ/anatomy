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

const W = 960;
const H = 900;
const AZIMUTH = 40;
const ELEVATION = 27;

// Coordinate System (World Units, approx mm):
// X: Longitudinal engine axis (rear flywheel at -88, front pulley at +88)
// Y: Lateral cross-axis (Left bank towards -Y, Right bank towards +Y)
// Z: Vertical axis (0 at crankshaft centerline, +Z up to intake velocity stacks at +80, -Z down to dry sump at -50)

// 1. DYNO TEST STAND & BEDPLATE
const BASE = { x: -160, y: -115, w: 320, d: 230, r: 14 };
const BASE_H = 16;
const FOOT_H = 6;
const BASE_TOP_Z = -54;

// 2. 60-DEGREE V12 GEOMETRY
// 6 Cylinder stations along X axis (pairs sharing crankpins):
const X_STATIONS = [62.5, 37.5, 12.5, -12.5, -37.5, -62.5];
const ROD_OFFSET = 1.4; // Axial offset between opposing connecting rods on shared crankpin

// Bank unit vectors (60° V angle -> 30° from vertical Z):
const SIN30 = 0.5;
const COS30 = Math.cos(Math.PI / 6); // 0.866025
const DIR_L = [0, -SIN30, COS30];
const DIR_R = [0, SIN30, COS30];

// Cylinder deck distance:
const DECK_DIST = 52.0;

// Cylinder Centers (X, Y, Z at cylinder deck):
// Bank 1 (Left, Cyl 1 to 6): X = X_station - ROD_OFFSET
// Bank 2 (Right, Cyl 7 to 12): X = X_station + ROD_OFFSET
const CYL_CENTERS = {
  1: [X_STATIONS[0] - ROD_OFFSET, -DECK_DIST * SIN30, DECK_DIST * COS30],
  2: [X_STATIONS[1] - ROD_OFFSET, -DECK_DIST * SIN30, DECK_DIST * COS30],
  3: [X_STATIONS[2] - ROD_OFFSET, -DECK_DIST * SIN30, DECK_DIST * COS30],
  4: [X_STATIONS[3] - ROD_OFFSET, -DECK_DIST * SIN30, DECK_DIST * COS30],
  5: [X_STATIONS[4] - ROD_OFFSET, -DECK_DIST * SIN30, DECK_DIST * COS30],
  6: [X_STATIONS[5] - ROD_OFFSET, -DECK_DIST * SIN30, DECK_DIST * COS30],
  7: [X_STATIONS[0] + ROD_OFFSET, DECK_DIST * SIN30, DECK_DIST * COS30],
  8: [X_STATIONS[1] + ROD_OFFSET, DECK_DIST * SIN30, DECK_DIST * COS30],
  9: [X_STATIONS[2] + ROD_OFFSET, DECK_DIST * SIN30, DECK_DIST * COS30],
  10: [X_STATIONS[3] + ROD_OFFSET, DECK_DIST * SIN30, DECK_DIST * COS30],
  11: [X_STATIONS[4] + ROD_OFFSET, DECK_DIST * SIN30, DECK_DIST * COS30],
  12: [X_STATIONS[5] + ROD_OFFSET, DECK_DIST * SIN30, DECK_DIST * COS30],
};

// 12-Cylinder Firing Order: 1 - 7 - 5 - 11 - 3 - 9 - 6 - 12 - 2 - 8 - 4 - 10
const CYL_FIRE = {
  1: 0,
  7: 60,
  5: 120,
  11: 180,
  3: 240,
  9: 300,
  6: 360,
  12: 420,
  2: 480,
  8: 540,
  4: 600,
  10: 660,
};

// 3. EXPLODED ASSEMBLY PIECES
const PIECES = {
  stand: { name: "Dyno test stand", say: "dyno test stand · rigid cradle and hydraulic load brake", move: [0, 0, 0] },
  oilpan: { name: "Dry-sump oil pan", say: "dry-sump billet oil pan · external multi-stage scavenge pump", move: [0, 0, -56] },
  crank: { name: "Crankshaft & flywheel", say: "6-throw nitrided crankshaft · 120° throws · lightened flywheel", move: [0, 0, -26] },
  block: { name: "60° V12 engine block", say: "60° aluminum block · precision cutaway · 12 wet cylinder sleeves", move: [0, 0, 0] },
  pistons_l: { name: "Left pistons & rods", say: "bank 1 forged slipper pistons · H-beam connecting rods", move: [0, -52, 52] },
  pistons_r: { name: "Right pistons & rods", say: "bank 2 forged slipper pistons · H-beam connecting rods", move: [0, 52, 52] },
  heads_l: { name: "Left cylinder head", say: "cross-flow DOHC head · 24 poppet valves & spark plugs", move: [0, -60, 60] },
  heads_r: { name: "Right cylinder head", say: "cross-flow DOHC head · 24 poppet valves & spark plugs", move: [0, 60, 60] },
  cams_l: { name: "Left camshafts", say: "dual overhead camshafts & vernier timing sprockets", move: [0, -80, 80] },
  cams_r: { name: "Right camshafts", say: "dual overhead camshafts & vernier timing sprockets", move: [0, 80, 80] },
  covers_l: { name: "Left valve cover", say: "finned billet valve cover · knurled oil filler cap", move: [0, -98, 98] },
  covers_r: { name: "Right valve cover", say: "finned billet valve cover · PCV oil separator", move: [0, 98, 98] },
  intake: { name: "Induction & fuel injection", say: "twin carbon plenums · 12 velocity stacks · direct fuel rails", move: [0, 0, 92] },
  headers_l: { name: "Left 6-into-1 headers", say: "equal-length tuned stainless headers · 6-into-1 merge collector", move: [0, -92, -10] },
  headers_r: { name: "Right 6-into-1 headers", say: "equal-length tuned stainless headers · 6-into-1 merge collector", move: [0, 92, -10] },
  timing: { name: "Front serpentine drive", say: "harmonic balancer, water pump, alternator & serpentine belt", move: [95, 0, 0] },
};

const STAGGER = [
  "intake",
  "covers_l",
  "covers_r",
  "headers_l",
  "headers_r",
  "heads_l",
  "heads_r",
  "cams_l",
  "cams_r",
  "timing",
  "pistons_l",
  "pistons_r",
  "oilpan",
  "crank",
  "block",
  "stand",
];

const ORDER_DISPLAY = [
  "intake",
  "covers_l",
  "covers_r",
  "heads_l",
  "heads_r",
  "pistons_l",
  "pistons_r",
  "crank",
  "block",
  "headers_l",
  "headers_r",
  "timing",
  "oilpan",
];

const SPRING = { stagger: 0.035, stiffness: 68, damping: 14.8, substeps: 4 };

// Camera projection fitting
const BOUNDS = [
  ...k.boxCorners(BASE, BASE_TOP_Z - BASE_H - FOOT_H, BASE_TOP_Z),
  [-130, 0, 110],
  [120, 0, 110],
  [0, -110, 120],
  [0, 110, 120],
  [100, 0, 80],
];

const P = k.fitProjection(BOUNDS, W, H, {
  pad: 30,
  azimuth: AZIMUTH,
  elevation: ELEVATION,
});

const V = G.viewOf(P);
const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const byDepth = (points) =>
  [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));

const R = A.recorder(P, { order: STAGGER, spring: SPRING });
const { items, nameFor } = R;
const record = R.solid;
const rideOf = (piece, move) => (move ? Object.keys(PIECES).find((id) => PIECES[id].move === move) ?? piece : piece);

function put(piece, ref, svg, { bias = 0, move, ride, shapes = [], name, cyl, role } = {}) {
  R.put({
    piece,
    ride: ride ?? rideOf(piece, move),
    at: ref,
    bias,
    svg,
    move: move ?? PIECES[piece].move,
    shapes,
    name: name ?? nameFor(`${piece}.item`),
    cyl,
    role,
  });
}

// ==========================================
// 1. DYNO TEST STAND & BEDPLATE (`stand`)
// ==========================================
function buildStand() {
  const z0 = BASE_TOP_Z - BASE_H;
  // Ground shadow halo
  put("stand", [0, 0, z0], `<path class="iso-halo" d="${k.haloOf(BASE, z0 - FOOT_H, BASE_H, P)}"/>`);

  // 4 Leveling vibration-damping feet
  for (const [x, y] of byDepth(k.corners(BASE, 26))) {
    put(
      "stand",
      [x, y, z0],
      S(k.cylinder(x, y, 9.5, z0 - FOOT_H, 2.8, P, 28), { tone: "lo" }) +
        S(k.cylinder(x, y, 7.2, z0 - FOOT_H + 2.8, FOOT_H - 2.8, P, 28), { tone: "mid" }) +
        L(k.sideArc(x, y, 7.2, z0 - FOOT_H + 4.2, P, 16), { tone: "lo" })
    );
  }

  // Heavy precision dyno surface bedplate
  put("stand", [0, 0, BASE_TOP_Z], S(k.slabOf(BASE, z0, BASE_H, P, 8, 2.0), { tone: "mid" }));
  put("stand", [0, 0, BASE_TOP_Z], L(k.planOutline(k.insetPlan(BASE, 7), BASE_TOP_Z, P), { tone: "lo" }));

  // Corner socket cap screws
  const bolts = k.corners(BASE, 14);
  put(
    "stand",
    [0, 0, BASE_TOP_Z],
    L(bolts.map(([x, y]) => k.ring(x, y, 2.8, BASE_TOP_Z, P, 16)).join(""), { tone: "lo" }) +
      D(bolts.map(([x, y]) => at([x, y, BASE_TOP_Z])), { size: 0.5, tone: "hi" })
  );

  // Front millimeter datum scale strip
  const strip = { x: -140, y: BASE.y + BASE.d - 16, w: 280, d: 8.0, r: 1.2 };
  put("stand", [strip.x + strip.w / 2, strip.y + strip.d / 2, BASE_TOP_Z], S(k.slabOf(strip, BASE_TOP_Z, 0.8, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y, BASE_TOP_Z + 0.8, [1.6, 3.4], P);
  const datumLine = k.lineOnTop([strip.x + 4, strip.y], [strip.x + strip.w - 4, strip.y], BASE_TOP_Z + 0.8, P);
  const majorDatum = k.lineOnTop([strip.x + 4, strip.y + 3.4], [strip.x + strip.w - 4, strip.y + 3.4], BASE_TOP_Z + 0.8, P);
  put(
    "stand",
    [strip.x + strip.w / 2, strip.y + strip.d / 2, BASE_TOP_Z],
    L(datumLine, { tone: "lo" }) +
      L(majorDatum, { tone: "lo" }) +
      L(ticks.minor, { tone: "lo" }) +
      L(ticks.major, { tone: "mid" }) +
      D(
        [
          at([strip.x + 4, strip.y, BASE_TOP_Z + 0.8]),
          at([strip.x + strip.w - 4, strip.y, BASE_TOP_Z + 0.8]),
          at([strip.x + 4, strip.y + 3.4, BASE_TOP_Z + 0.8]),
          at([strip.x + strip.w - 4, strip.y + 3.4, BASE_TOP_Z + 0.8]),
        ],
        { size: 0.45, tone: "mid" }
      )
  );

  // Dyno Specification Plaque
  const plaque = { x: -148, y: -94, w: 46, d: 26, r: 1.5 };
  put(
    "stand",
    [plaque.x + plaque.w / 2, plaque.y + plaque.d / 2, BASE_TOP_Z],
    S(k.slabOf(plaque, BASE_TOP_Z, 0.8, P, 3), { tone: "lo", crease: "none" }) +
      L(k.planOutline(k.insetPlan(plaque, 1.8), BASE_TOP_Z + 0.8, P), { tone: "faint" }) +
      L(k.lineOnTop([-144, -88], [-110, -88], BASE_TOP_Z + 0.8, P), { tone: "lo", free: true }) +
      L(k.lineOnTop([-144, -82], [-118, -82], BASE_TOP_Z + 0.8, P), { tone: "lo", free: true }) +
      L(k.lineOnTop([-144, -76], [-124, -76], BASE_TOP_Z + 0.8, P), { tone: "lo", free: true }) +
      D(
        [
          at([-146, -92, BASE_TOP_Z + 0.8]),
          at([-104, -92, BASE_TOP_Z + 0.8]),
          at([-146, -70, BASE_TOP_Z + 0.8]),
          at([-104, -70, BASE_TOP_Z + 0.8]),
        ],
        { size: 0.35, tone: "mid" }
      )
  );

  // Rear Dynamometer Hydraulic Brake Housing (absorbs engine torque output)
  const F_dyno = G.frameAlong([-118, 0, 0], [1, 0, 0]);
  put("stand", [-118, 0, 0], S(G.disc(-26, 0, 38, F_dyno, P), { tone: "mid" }) + L(G.circleOf(F_dyno, -22, 38, P, 40), { tone: "lo" }));

  // Four Rigid Engine Mounting Stanchions
  for (const sx of [-45, 55]) {
    for (const sy of [-40, 40]) {
      const postBox = { x: sx - 6, y: sy - 5, w: 12, d: 10, r: 2 };
      put("stand", [sx, sy, BASE_TOP_Z], S(k.slabOf(postBox, BASE_TOP_Z, -24 - BASE_TOP_Z, P, 3, 0.6), { tone: "mid" }));
      put("stand", [sx, sy, -24], S(k.cylinder(sx, sy, 4.5, -24, 6, P, 18), { tone: "hi" }));
    }
  }
}

// ==========================================
// 2. DRY-SUMP OIL PAN (`oilpan`)
// ==========================================
function buildOilPan() {
  const panTopZ = -30;
  const panBox = { x: -80, y: -28, w: 156, d: 56, r: 4 };

  // Perimeter pan mounting flange
  put("oilpan", [0, 0, panTopZ], S(k.slabOf(panBox, panTopZ - 3, 3, P, 4, 0.5), { tone: "hi" }));
  put("oilpan", [0, 0, panTopZ], L(k.planOutline(k.insetPlan(panBox, 1.8), panTopZ, P), { tone: "lo" }));

  // Shallow dry-sump reservoir tray (ultra-low clearance)
  const sumpBox = { x: -78, y: -24, w: 152, d: 48, r: 3 };
  put("oilpan", [0, 0, -48], S(k.slabOf(sumpBox, -48, 15, P, 4, 1.0), { tone: "mid" }));

  // Longitudinal cooling fins along bottom
  for (const fy of [-18, -10, -2, 6, 14]) {
    put(
      "oilpan",
      [0, fy, -48],
      S(k.slabOf({ x: -74, y: fy - 1.0, w: 144, d: 2.0, r: 0.5 }, -50, 2.0, P, 2), { tone: "hi", crease: "none" })
    );
  }

  // External Multi-Stage Dry Sump Scavenge Pump (mounted on lower left)
  const F_scav = G.frameAlong([25, -34, -40], [1, 0, 0]);
  put("oilpan", [25, -34, -40], S(G.disc(-20, 20, 8.5, F_scav, P), { tone: "hi" }));
  put("oilpan", [25, -34, -40], L(G.circleOf(F_scav, -10, 8.5, P, 20), { tone: "faint" }));
  put("oilpan", [25, -34, -40], L(G.circleOf(F_scav, 10, 8.5, P, 20), { tone: "faint" }));

  // Braided steel scavenge oil return lines
  const routeScav = [
    [-40, -26, -42],
    [-20, -34, -42],
    [5, -34, -40],
  ];
  tubePieces(routeScav, 2.4, P, { maxLength: 20 }).forEach((part) => {
    put("oilpan", part.mid, tubeSvg(part, { tone: "mid" }));
  });

  // Magnetic drain plug
  put("oilpan", [-60, -25, -45], S(k.cylinder(-60, -25, 3.2, -48, 4, P, 16), { tone: "hi" }) + D([at([-60, -25, -44])], { size: 0.45, tone: "lit" }));
}

// ==========================================
// 3. 6-THROW CRANKSHAFT & FLYWHEEL (`crank`)
// ==========================================
function buildCrankshaft() {
  const F_axis = G.frameAlong([0, 0, 0], [1, 0, 0]);

  // Rear Lightweight 160-Tooth Flywheel
  put("crank", [-86, 0, 0], S(G.disc(-90, -82, 30, F_axis, P), { tone: "hi" }));
  put("crank", [-86, 0, 0], L(G.circleOf(F_axis, -88, 30, P, 48), { tone: "lo" }));
  put("crank", [-86, 0, 0], L(G.circleOf(F_axis, -84, 26, P, 40), { tone: "faint" }));
  const fwDots = Array.from({ length: 6 }, (_, i) => 
    `<circle class="iso-dot v12-dot-spin" data-pulley="flywheel" data-r="23.0" data-phase="${((i * Math.PI) / 3).toFixed(3)}" r="1.4" fill="var(--anatomy-dot)"/>`
  ).join("");
  put("crank", [-86, 0, 0], `<g class="v12-flywheel-spin">${fwDots}</g>`);

  // 7 Main bearing journals along crankshaft (diameter 13 mm)
  const mainX = [-76, -50, -25, 0, 25, 50, 75];
  for (const mx of mainX) {
    put("crank", [mx, 0, 0], S(G.disc(mx - 3.5, mx + 3.5, 6.5, F_axis, P), { tone: "mid" }));
    // 4-bolt cross-bolted main bearing cap underneath
    const capBox = { x: mx - 3.2, y: -10, w: 6.4, d: 20, r: 2 };
    put("crank", [mx, 0, -8], S(k.slabOf(capBox, -12, 8, P, 3, 0.5), { tone: "hi" }));
    put("crank", [mx, 0, -12], D([at([mx, -6, -12]), at([mx, 6, -12])], { size: 0.42, tone: "lit" }));
  }

  // 6 Crank Throws (Pairs 120° apart for naturally balanced V12):
  // Throws 1 & 6 (at X = -62.5 and X = 62.5): 0 deg throw along +Z
  // Throws 2 & 5 (at X = -37.5 and X = 37.5): 120 deg throw (Y = 8.0, Z = -4.6)
  // Throws 3 & 4 (at X = -12.5 and X = 12.5): 240 deg throw (Y = -8.0, Z = -4.6)
  const THROWS = [
    { x: -62.5, y: 0, z: 9.2 },
    { x: -37.5, y: 8.0, z: -4.6 },
    { x: -12.5, y: -8.0, z: -4.6 },
    { x: 12.5, y: -8.0, z: -4.6 },
    { x: 37.5, y: 8.0, z: -4.6 },
    { x: 62.5, y: 0, z: 9.2 },
  ];

  for (const t of THROWS) {
    const F_t = G.frameAlong([t.x, t.y, t.z], [1, 0, 0]);
    put("crank", [t.x, t.y, t.z], S(G.disc(t.x - 3.8, t.x + 3.8, 5.2, F_t, P), { tone: "lit", lit: true }));
  }

  // Heavy counterweights flanking each throw
  for (const cx of [-70, -56, -44, -31, -19, -6, 6, 19, 31, 44, 56, 70]) {
    put("crank", [cx, 0, 0], S(G.disc(cx - 2.5, cx + 2.5, 17.0, F_axis, P), { tone: "mid" }));
    put("crank", [cx, 0, 0], L(G.arcOf(F_axis, cx + 2.5, 17.0, P), { tone: "lo" }));
  }
}

// ==========================================
// 4. 60° V12 ENGINE BLOCK (`block`)
// ==========================================
function buildEngineBlock() {
  // Lower crankcase skirt casting (Z = -30 to 0)
  const skirt = { x: -80, y: -30, w: 156, d: 60, r: 5 };
  put("block", [0, 0, -15], S(k.slabOf(skirt, -30, 30, P, 5, 1.2), { tone: "mid" }));
  put("block", [0, 0, -30], L(k.sideSeam(skirt, -15, P, 5), { tone: "lo" }));

  // 60° V Cylinder Banks:
  // Right bank cylinder block (tilted +30°, solid mass on rear bank)
  const bankR = { x: -78, y: 14, w: 152, d: 24, r: 3 };
  put("block", [0, 26, 26], S(k.slabOf(bankR, 10, 38, P, 4, 1.0), { tone: "mid" }));

  // Left bank cylinder block (tilted -30°, precision cutaway exposing Bank 1 pistons & liners)
  // 1. Lower crankcase deck slab (Z = 10 to 16)
  const bankL_bot = { x: -78, y: -38, w: 152, d: 24, r: 3 };
  put("block", [0, -26, 13], S(k.slabOf(bankL_bot, 10, 6, P, 3, 0.8), { tone: "hi" }));

  // 2. Upper deck slab mating with cylinder head (Z = 40 to 46)
  const bankL_top = { x: -78, y: -38, w: 152, d: 24, r: 3 };
  put("block", [0, -26, 43], S(k.slabOf(bankL_top, 40, 6, P, 3, 0.8), { tone: "hi" }));

  // 3. Inner valley backing wall facing induction valley (Z = 16 to 40)
  const bankL_back = { x: -78, y: -22, w: 152, d: 8, r: 2 };
  put("block", [0, -18, 28], S(k.slabOf(bankL_back, 16, 24, P, 2, 0.6), { tone: "mid" }));

  // 4. Inter-cylinder structural webs & bulkheads between cutaway ports (Z = 16 to 40)
  const webPillars = [-78, -50, -25, 0, 25, 50, 74];
  for (const wx of webPillars) {
    const webBox = { x: wx, y: -38, w: 5, d: 24, r: 1.5 };
    put("block", [wx + 2.5, -26, 28], S(k.slabOf(webBox, 16, 24, P, 2, 0.5), { tone: "hi" }));
  }

  // 12 Machined wet cylinder liner bores with cross-hatch micro rings
  for (let c = 1; c <= 12; c++) {
    const [bx, by, bz] = CYL_CENTERS[c];
    const isLeft = c <= 6;
    const F_bore = G.frameAlong([bx, by, bz], isLeft ? DIR_L : DIR_R);
    if (isLeft) {
      // Cutaway cylinder sleeve interior visible on Bank 1
      put("block", [bx, by, bz], S(G.disc(-24, 0, 10.8, F_bore, P), { tone: "lo" }));
      put("block", [bx, by, bz], L(G.circleOf(F_bore, 0, 10.8, P, 24), { tone: "hi" }));
      put("block", [bx, by, bz], L(G.circleOf(F_bore, -10, 10.8, P, 24), { tone: "mid" }));
    } else {
      put("block", [bx, by, bz], S(G.disc(-6, 0, 10.8, F_bore, P), { tone: "lo" }));
      put("block", [bx, by, bz], L(G.circleOf(F_bore, 0, 10.8, P, 24), { tone: "hi" }));
    }
  }

  // High-performance remote oil filter canister on lower left
  const F_filter = G.frameAlong([-48, -34, -14], [0, -1, 0]);
  put("block", [-48, -42, -14], S(G.disc(0, 18, 7.5, F_filter, P), { tone: "hi" }));
  put("block", [-48, -42, -14], L(G.circleOf(F_filter, 18, 7.5, P, 24), { tone: "faint" }));
}

// ==========================================
// 5. PISTONS & CONNECTING RODS (`pistons_l`, `pistons_r`)
// ==========================================
function buildPistons() {
  for (let c = 1; c <= 12; c++) {
    const isLeft = c <= 6;
    const piece = isLeft ? "pistons_l" : "pistons_r";
    const dir = isLeft ? DIR_L : DIR_R;
    const [bx, by, bz] = CYL_CENTERS[c];

    // Forged aluminum slipper piston body (diameter 20.4 mm, height 11 mm)
    const F_piston = G.frameAlong([bx, by, bz], dir);
    put(piece, [bx, by, bz], S(G.disc(-11, 0, 10.2, F_piston, P), { tone: "lit", lit: true }), { cyl: c });
    // Compression ring lands on piston skirt
    put(piece, [bx, by, bz], L(G.circleOf(F_piston, -2.5, 10.2, P, 24), { tone: "hi" }), { cyl: c });
    put(piece, [bx, by, bz], L(G.circleOf(F_piston, -5.0, 10.2, P, 24), { tone: "hi" }), { cyl: c });
    // Wrist pin hole
    put(piece, [bx, by, bz], D(G.dotsOf(F_piston, -7.5, 10.2, 2, P, { all: true }), { size: 0.5, tone: "mid" }), { cyl: c });

    // Solid H-Beam Connecting Rod (length 32 mm)
    put(piece, [bx, by, bz], S(G.disc(-34, -9, 2.6, F_piston, P), { tone: "mid" }), { cyl: c });
    const rodEnd = [bx, by - dir[1] * 34, bz - dir[2] * 34];
    put(piece, rodEnd, S(k.cylinder(rodEnd[0], rodEnd[1], 4.6, rodEnd[2] - 2, 4, P, 16), { tone: "mid" }), { cyl: c });
  }
}

// ==========================================
// 6. CYLINDER HEADS (`heads_l`, `heads_r`)
// ==========================================
function buildCylinderHeads() {
  // Left Cylinder Head (Bank 1)
  const headL = { x: -80, y: -40, w: 156, d: 24, r: 3 };
  put("heads_l", [0, -28, 52], S(k.slabOf(headL, 44, 22, P, 4, 0.8), { tone: "hi" }));
  put("heads_l", [0, -28, 66], L(k.planOutline(k.insetPlan(headL, 2), 66, P), { tone: "faint" }));

  // Right Cylinder Head (Bank 2)
  const headR = { x: -80, y: 16, w: 156, d: 24, r: 3 };
  put("heads_r", [0, 28, 52], S(k.slabOf(headR, 44, 22, P, 4, 0.8), { tone: "mid" }));
  put("heads_r", [0, 28, 66], L(k.planOutline(k.insetPlan(headR, 2), 66, P), { tone: "faint" }));

  // 48 Valves: 2 Intake & 2 Exhaust per cylinder + Spark Plugs
  for (let c = 1; c <= 12; c++) {
    const isLeft = c <= 6;
    const piece = isLeft ? "heads_l" : "heads_r";
    const dir = isLeft ? DIR_L : DIR_R;
    const [bx, by, bz] = CYL_CENTERS[c];

    // Dual intake valve springs (facing induction valley)
    const vIn = [bx - 3.5, by + dir[1] * 16, bz + dir[2] * 16];
    put(piece, vIn, S(k.cylinder(vIn[0], vIn[1], 3.0, vIn[2], 5, P, 16), { tone: "hi" }));
    put(piece, vIn, L(k.ring(vIn[0], vIn[1], 3.0, vIn[2] + 5, P, 16), { tone: "lit" }));

    // Dual exhaust valve springs (facing outer exhaust headers)
    const vEx = [bx + 3.5, by + dir[1] * 16, bz + dir[2] * 16];
    put(piece, vEx, S(k.cylinder(vEx[0], vEx[1], 3.0, vEx[2], 5, P, 16), { tone: "mid" }));
    put(piece, vEx, L(k.ring(vEx[0], vEx[1], 3.0, vEx[2] + 5, P, 16), { tone: "lo" }));

    // Central spark plug with white ceramic insulator
    const sp = [bx, by + dir[1] * 20, bz + dir[2] * 20];
    put(piece, sp, S(k.cylinder(sp[0], sp[1], 2.2, sp[2], 8, P, 14), { tone: "lit", lit: true }));
    put(piece, sp, D([at([sp[0], sp[1], sp[2] + 8])], { size: 0.4, tone: "lit" }));
  }
}

// ==========================================
// 7. DUAL OVERHEAD CAMSHAFTS (`cams_l`, `cams_r`)
// ==========================================
function buildCamshafts() {
  // Left Bank Camshafts (intake and exhaust)
  for (const cy of [-34, -22]) {
    const cz = 70;
    const F_cam = G.frameAlong([0, cy, cz], [1, 0, 0]);
    put("cams_l", [0, cy, cz], S(G.disc(-78, 74, 4.0, F_cam, P), { tone: "mid" }));
    // Front vernier adjustable cam sprocket
    put("cams_l", [75, cy, cz], S(G.disc(74, 78, 11.5, F_cam, P), { tone: "hi" }));
    put("cams_l", [75, cy, cz], L(G.circleOf(F_cam, 78, 11.5, P, 32), { tone: "lo" }));
  }

  // Right Bank Camshafts
  for (const cy of [22, 34]) {
    const cz = 70;
    const F_cam = G.frameAlong([0, cy, cz], [1, 0, 0]);
    put("cams_r", [0, cy, cz], S(G.disc(-78, 74, 4.0, F_cam, P), { tone: "mid" }));
    put("cams_r", [75, cy, cz], S(G.disc(74, 78, 11.5, F_cam, P), { tone: "hi" }));
    put("cams_r", [75, cy, cz], L(G.circleOf(F_cam, 78, 11.5, P, 32), { tone: "lo" }));
  }
}

// ==========================================
// 8. FINNED BILLET VALVE COVERS (`covers_l`, `covers_r`)
// ==========================================
function buildValveCovers() {
  // Left finned valve cover
  const covL = { x: -78, y: -38, w: 152, d: 20, r: 3 };
  put("covers_l", [0, -28, 74], S(k.slabOf(covL, 70, 14, P, 4, 1.2), { tone: "hi" }));
  put("covers_l", [0, -28, 84], L(k.planOutline(k.insetPlan(covL, 2), 84, P), { tone: "faint" }));
  // Longitudinal cooling fins
  for (const fy of [-34, -30, -26, -22]) {
    put(
      "covers_l",
      [0, fy, 84],
      S(k.slabOf({ x: -74, y: fy - 0.8, w: 144, d: 1.6, r: 0.5 }, 84, 2.0, P, 2), { tone: "hi", crease: "none" })
    );
  }
  // Knurled oil filler cap at front
  put("covers_l", [62, -28, 86], S(k.cylinder(62, -28, 5.5, 84, 5, P, 20), { tone: "hi" }));
  put("covers_l", [62, -28, 89], L(k.knurl(62, -28, 5.5, 84, 89, 18, P), { tone: "lo" }));

  // Right finned valve cover
  const covR = { x: -78, y: 18, w: 152, d: 20, r: 3 };
  put("covers_r", [0, 28, 74], S(k.slabOf(covR, 70, 14, P, 4, 1.2), { tone: "mid" }));
  put("covers_r", [0, 28, 84], L(k.planOutline(k.insetPlan(covR, 2), 84, P), { tone: "faint" }));
  for (const fy of [22, 26, 30, 34]) {
    put(
      "covers_r",
      [0, fy, 84],
      S(k.slabOf({ x: -74, y: fy - 0.8, w: 144, d: 1.6, r: 0.5 }, 84, 2.0, P, 2), { tone: "mid", crease: "none" })
    );
  }
  // PCV breather separator canister
  put("covers_r", [62, 28, 86], S(k.cylinder(62, 28, 5.0, 84, 7, P, 20), { tone: "mid" }));
}

// ==========================================
// 9. INDUCTION & FUEL INJECTION (`intake`)
// ==========================================
function buildIntakeSystem() {
  // 12 Curved Velocity Stacks (Trumpets) in the induction valley
  for (let c = 1; c <= 12; c++) {
    const [bx] = CYL_CENTERS[c];
    const isLeft = c <= 6;
    const py = isLeft ? -8.0 : 8.0;
    const hy = isLeft ? -18.0 : 18.0;
    const route = [
      [bx, py, 78],
      [bx, (py + hy) / 2, 74],
      [bx, hy, 58],
    ];
    tubePieces(route, 3.2, P, { maxLength: 16 }).forEach((part) => {
      put("intake", part.mid, tubeSvg(part, { tone: "hi" }));
    });
    // Flared bellmouth horn at top of velocity stack
    const F_horn = G.frameAlong([bx, py, 78], [0, 0, 1]);
    put("intake", [bx, py, 78], S(G.disc(0, 3, 4.8, F_horn, P), { tone: "lit", lit: true }));
    put("intake", [bx, py, 81], L(G.circleOf(F_horn, 3, 4.8, P, 20), { tone: "lo" }));
  }

  // Dual extruded aluminum high-pressure fuel rails
  for (const fry of [-14, 14]) {
    const railBox = { x: -72, y: fry - 2.5, w: 144, d: 5.0, r: 1.2 };
    put("intake", [0, fry, 62], S(k.slabOf(railBox, 60, 4.5, P, 3, 0.4), { tone: "hi" }));
    // 6 Fuel injectors along each rail
    for (const sx of X_STATIONS) {
      put("intake", [sx, fry, 58], S(k.cylinder(sx, fry, 2.2, 56, 5, P, 14), { tone: "mid" }));
      put("intake", [sx, fry, 60], D([at([sx, fry, 60])], { size: 0.35, tone: "lit" }));
    }
  }

  // Twin Front Billet Throttle Bodies
  for (const tby of [-9, 9]) {
    const F_tb = G.frameAlong([72, tby, 72], [1, 0, 0]);
    put("intake", [72, tby, 72], S(G.disc(68, 76, 9.5, F_tb, P), { tone: "hi" }));
    put("intake", [76, tby, 72], L(G.circleOf(F_tb, 76, 9.5, P, 28), { tone: "lit" }));
  }
}

// ==========================================
// 10. EQUAL-LENGTH 6-INTO-1 EXHAUST HEADERS (`headers_l`, `headers_r`)
// ==========================================
function buildExhaustHeaders() {
  // Left 6-into-1 Headers (Bank 1)
  const leftCollector = [-65, -64, -14];
  for (let c = 1; c <= 6; c++) {
    const [bx] = CYL_CENTERS[c];
    const port = [bx, -38, 42];
    const route = [
      port,
      [bx - 2, -48, 30],
      [bx - 6, -56, 8],
      leftCollector,
    ];
    tubePieces(route, 3.2, P, { maxLength: 22 }).forEach((part) => {
      put("headers_l", part.mid, tubeSvg(part, { tone: "hi" }), { cyl: c });
    });
  }
  // Left 6-into-1 merge collector cone
  const F_collL = G.frameAlong(leftCollector, [-1, -0.4, -0.3]);
  put("headers_l", leftCollector, S(G.disc(0, 18, 8.5, F_collL, P), { tone: "hi" }));
  put("headers_l", leftCollector, L(G.circleOf(F_collL, 18, 8.5, P, 24), { tone: "mid" }));

  // Right 6-into-1 Headers (Bank 2)
  const rightCollector = [-65, 64, -14];
  for (let c = 7; c <= 12; c++) {
    const [bx] = CYL_CENTERS[c];
    const port = [bx, 38, 42];
    const route = [
      port,
      [bx - 2, 48, 30],
      [bx - 6, 56, 8],
      rightCollector,
    ];
    tubePieces(route, 3.2, P, { maxLength: 22 }).forEach((part) => {
      put("headers_r", part.mid, tubeSvg(part, { tone: "mid" }), { cyl: c });
    });
  }
  // Right 6-into-1 merge collector cone
  const F_collR = G.frameAlong(rightCollector, [-1, 0.4, -0.3]);
  put("headers_r", rightCollector, S(G.disc(0, 18, 8.5, F_collR, P), { tone: "mid" }));
  put("headers_r", rightCollector, L(G.circleOf(F_collR, 18, 8.5, P, 24), { tone: "lo" }));
}

// ==========================================
// 11. FRONT SERPENTINE DRIVE (`timing`)
// ==========================================
function buildTimingDrive() {
  const F_front = G.frameAlong([0, 0, 0], [1, 0, 0]);

  // Front Timing Cover Housing (Z = -24 to +45, X = 74 to 82)
  const coverBox = { x: 74, y: -28, w: 8, d: 56, r: 4 };
  put("timing", [78, 0, 10], S(k.slabOf(coverBox, -24, 68, P, 4, 0.8), { tone: "mid" }));

  // Water Pump Housing Neck (flares forward X = 80 to 86)
  const F_wp = G.frameAlong([0, 0, 32], [1, 0, 0]);
  put("timing", [82, 0, 32], S(G.disc(80, 86, 13.0, F_wp, P), { tone: "mid" }));

  // Crankshaft Harmonic Balancer Pulley (X = 84 to 92, Z = 0)
  put("timing", [88, 0, 0], S(G.disc(84, 92, 13.5, F_front, P)), { role: "pulley-crank" });
  put("timing", [88, 0, 0], L(G.circleOf(F_front, 92, 13.5, P, 32), { tone: "lit" }));

  // Water Pump Pulley (X = 85 to 91, Z = 32)
  put("timing", [88, 0, 32], S(G.disc(85, 91, 10.5, F_wp, P)), { role: "pulley-wp" });
  put("timing", [88, 0, 32], L(G.circleOf(F_wp, 91, 10.5, P, 28), { tone: "mid" }));

  // Racing Alternator Pulley (Y = 30, Z = 42)
  const F_alt = G.frameAlong([0, 30, 42], [1, 0, 0]);
  put("timing", [82, 30, 42], S(G.disc(76, 85, 11.0, F_alt, P), { tone: "mid" }));
  put("timing", [88, 30, 42], S(G.disc(85, 91, 7.8, F_alt, P)), { role: "pulley-alt" });
  put("timing", [88, 30, 42], L(G.circleOf(F_alt, 91, 7.8, P, 24), { tone: "lo" }));

  // Dry-Sump Scavenge / Power Steering Pulley (Y = -30, Z = 38)
  const F_dry = G.frameAlong([0, -30, 38], [1, 0, 0]);
  put("timing", [88, -30, 38], S(G.disc(85, 91, 8.8, F_dry, P)), { role: "pulley-drysump" });
  put("timing", [88, -30, 38], L(G.circleOf(F_dry, 91, 8.8, P, 24), { tone: "mid" }));

  // Belt Tensioner Pulley (Y = -22, Z = 14)
  const F_tens = G.frameAlong([0, -22, 14], [1, 0, 0]);
  put("timing", [88, -22, 14], S(G.disc(85, 90, 6.8, F_tens, P)), { role: "pulley-tens" });

  // Rotating index dots for all 5 front pulleys
  const spinSvg = [
    // Crank harmonic balancer: 4 balance holes + 1 outer timing notch
    ...Array.from({ length: 4 }, (_, i) => `<circle class="iso-dot v12-dot-spin" data-pulley="crank" data-r="8.5" data-phase="${((i * Math.PI) / 2).toFixed(3)}" r="1.3" fill="var(--anatomy-dot)"/>`),
    `<circle class="iso-dot v12-dot-spin" data-pulley="crank" data-r="12.8" data-phase="0" r="1.5" fill="var(--anatomy-lit)"/>`,
    // Water pump pulley: 4 balance holes
    ...Array.from({ length: 4 }, (_, i) => `<circle class="iso-dot v12-dot-spin" data-pulley="wp" data-r="6.8" data-phase="${((i * Math.PI) / 2).toFixed(3)}" r="1.2" fill="var(--anatomy-dot)"/>`),
    // Alternator pulley: 3 cooling impeller dots
    ...Array.from({ length: 3 }, (_, i) => `<circle class="iso-dot v12-dot-spin" data-pulley="alt" data-r="4.8" data-phase="${((i * 2 * Math.PI) / 3).toFixed(3)}" r="1.1" fill="var(--anatomy-dot)"/>`),
    // Dry-sump pulley: 3 dots
    ...Array.from({ length: 3 }, (_, i) => `<circle class="iso-dot v12-dot-spin" data-pulley="drysump" data-r="5.5" data-phase="${((i * 2 * Math.PI) / 3).toFixed(3)}" r="1.1" fill="var(--anatomy-dot)"/>`),
    // Tensioner pulley: 2 dots
    ...Array.from({ length: 2 }, (_, i) => `<circle class="iso-dot v12-dot-spin" data-pulley="tens" data-r="4.0" data-phase="${(i * Math.PI).toFixed(3)}" r="1.0" fill="var(--anatomy-dot)"/>`),
  ].join("");
  put("timing", [88, 0, 10], `<g class="v12-pulleys-spin">${spinSvg}</g>`);

  // Serpentine Multi-Rib Drive Belt (closed loop at X = 88)
  const beltPts = [
    [88, 0, -13.5],
    [88, 14, -2],
    [88, 30, 34],
    [88, 30, 50],
    [88, 12, 43],
    [88, 0, 43],
    [88, -20, 47],
    [88, -30, 47],
    [88, -30, 29],
    [88, -22, 7],
    [88, -14, -7],
    [88, 0, -13.5],
  ];
  put("timing", [88, 0, 10], `<path class="iso-line v12-belt" data-tone="lit" d="${k.pathOf(beltPts.map((p) => at(p)), true)}" style="stroke-width:1.8; stroke-dasharray: 6 5; stroke-linecap: round;"/>`);
}

// Build all engine systems
buildStand();
buildOilPan();
buildCrankshaft();
buildEngineBlock();
buildPistons();
buildCylinderHeads();
buildCamshafts();
buildValveCovers();
buildIntakeSystem();
buildExhaustHeaders();
buildTimingDrive();

A.settle(R, P);
items.sort((a, b) => a.key - b.key);

const groups = items.map((item, index) => {
  const [mx, my, mz] = item.move;
  return `<g class="it" data-piece="${item.piece}"${item.ride !== item.piece ? ` data-ride="${item.ride}"` : ""}${item.cyl ? ` data-cyl="${item.cyl}"` : ""}${item.role ? ` data-role="${item.role}"` : ""} data-k="${item.key.toFixed(2)}" data-m="${mx.toFixed(1)},${my.toFixed(1)},${mz.toFixed(1)}" data-i="${index}">${item.svg}</g>`;
});

const back = `<g class="v12-back-grid">${k.lineSvg(k.planOutline(k.insetPlan(BASE, 2), BASE_TOP_Z, P), { tone: "faint" })}</g>`;
const backSvg = k.figureSvg({ width: W, height: H, label: "V12 Engine on Dyno Stand", body: back, className: "v12-back" });
const frontSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg v12-front" viewBox="0 0 ${W} ${H}" aria-hidden="true"><g class="v12-engine">${groups.join("")}</g></svg>`;

const unit = (vector) => {
  const o = at([0, 0, 0]);
  const p = at(vector);
  return [p[0] - o[0], p[1] - o[1]];
};

const uY = unit([0, 1, 0]);
const uZ = unit([0, 0, 1]);

// 2D projected bore directions for reciprocating piston travel
const boreL = unit(DIR_L);
const boreR = unit(DIR_R);

// Flat position arrays for WebGL gas/combustion shader:
const cylPosFlat = [];
const cylPhases = [];
const injPosFlat = [];
const intakePosFlat = [];
const exhPosFlat = [];

for (let c = 1; c <= 12; c++) {
  const [bx, by, bz] = CYL_CENTERS[c];
  cylPosFlat.push(bx, by, bz);
  cylPhases.push(CYL_FIRE[c]);

  const isLeft = c <= 6;
  // Injector position (at intake port entrance)
  injPosFlat.push(bx, isLeft ? -16.0 : 16.0, 56.0);
  // Velocity stack intake trumpet mouth
  intakePosFlat.push(bx, isLeft ? -8.0 : 8.0, 78.0);
  // Exhaust primary runner midpoint
  exhPosFlat.push(bx - 4.0, isLeft ? -52.0 : 52.0, 16.0);
}

// Pulley screen centers for rotating dot animations
const pulleyCenters = {
  crank: at([88, 0, 0]),
  wp: at([88, 0, 32]),
  alt: at([88, 30, 42]),
  drysump: at([88, -30, 38]),
  tens: at([88, -22, 14]),
  flywheel: at([-86, 0, 0]),
};

const DATA = {
  W,
  H,
  V,
  EX: unit([1, 0, 0]),
  EY: uY,
  EZ: uZ,
  camera: glCamera(P),
  pieces: Object.fromEntries(Object.entries(PIECES).map(([id, p]) => [id, { name: p.name, say: p.say }])),
  stagger: STAGGER,
  order: ORDER_DISPLAY,
  spring: SPRING,
  cylPosFlat,
  cylPhases,
  injPosFlat,
  intakePosFlat,
  exhPosFlat,
  boreL,
  boreR,
  pulleyCenters,
  CYL_FIRE,
};

// Controls and Legend Elements
const corners = `<div class="iso-plate-corners" aria-hidden="true"><span class="iso-plate-corner" data-corner="fig">Fig 1</span><span class="iso-plate-corner" data-corner="title">V12 Engine · 60° DOHC Dyno</span><span class="iso-plate-corner" data-corner="readout" data-readout>3,600 RPM · 718 N·m · 271 kW (368 HP)</span></div>`;

const controls = `<div class="v12-controls">
  <div class="v12-btn-group">
    <button type="button" class="v12-btn" data-run><span class="v12-lamp" aria-hidden="true"></span><span data-run-label>Dyno Run</span></button>
    <button type="button" class="v12-btn" data-apart><span class="v12-lamp" aria-hidden="true"></span><span data-apart-label>Explode</span></button>
    <button type="button" class="v12-btn" data-xray><span class="v12-lamp" aria-hidden="true"></span><span data-xray-label>Pistons X-Ray</span></button>
  </div>
  <div class="v12-flow-selector" aria-label="Gas and combustion flow visualizer">
    <button type="button" class="v12-flow-btn" data-active data-mode="all">All Flows</button>
    <button type="button" class="v12-flow-btn" data-mode="fire">Combustion</button>
    <button type="button" class="v12-flow-btn" data-mode="air">Air Intake</button>
    <button type="button" class="v12-flow-btn" data-mode="fuel">Fuel Spray</button>
    <button type="button" class="v12-flow-btn" data-mode="exhaust">Exhaust</button>
  </div>
  <span class="v12-hint">Drag stage or slider to scrub crank · [Space] Run · [X] X-Ray · [E] Explode · [F] Gas Flow</span>
  <span class="v12-live" aria-live="polite" data-live></span>
</div>`;

const cylPills = Array.from({ length: 12 }, (_, i) => {
  const c = i + 1;
  const isLeft = c <= 6;
  return `<div class="v12-cyl-pill" data-cyl="${c}" title="Cylinder ${c} (${isLeft ? 'Bank 1 Left' : 'Bank 2 Right'}) - Click to scrub to TDC"><span class="v12-cyl-id">C${c}</span><span class="v12-cyl-stroke">PWR</span></div>`;
}).join("");

const partsBtns = ORDER_DISPLAY.map(
  (id, index) =>
    `<button type="button" class="v12-part-btn" data-part="${id}"><span class="v12-part-num">${String(index + 1).padStart(2, "0")}</span>${PIECES[id].name}</button>`
).join("");

const stage = `<div class="v12-stage" tabindex="0" role="slider" aria-label="60° V12 engine on dynamometer test stand: drag to scrub crank rotation, space toggles run mode, e toggles exploded view, x toggles x-ray view" aria-valuemin="0" aria-valuemax="720" aria-valuenow="0" aria-valuetext="Running at 3600 RPM">
  ${backSvg}
  ${frontSvg}
  <canvas class="v12-gas-canvas" aria-hidden="true"></canvas>
</div>`;

const scrubBar = `<div class="v12-scrub-bar">
  <span>CRANK ANGLE 0°</span>
  <input type="range" class="v12-scrub-slider" min="0" max="720" value="0" step="1" aria-label="Scrub crankshaft rotation angle (0 to 720 degrees)">
  <span>720° (2 REVS)</span>
</div>`;

const caption =
  "A 60° naturally balanced V12 four-stroke internal combustion engine on an instrumented dynamometer. With 6 crank throws indexed at 120° intervals and a 60° cylinder bank angle, the primary and secondary reciprocating forces and moments are in complete natural equilibrium without balance shafts. In the 1-7-5-11-3-9-6-12-2-8-4-10 firing order, exactly one cylinder initiates combustion every 60° of crankshaft rotation across the 720° four-stroke Otto cycle (Intake → Compression → Power → Exhaust). Because each 180° power stroke spans three 60° ignition intervals, exactly three cylinders produce driving torque simultaneously at every moment, yielding turbine-smooth power delivery and the signature high-frequency V12 exhaust crescendo.";

const body = `<figure class="iso-figure v12">
  <div class="iso-plate">${corners}${stage}${controls}</div>
  <figcaption class="iso-legend">
    <div class="v12-cyl-container">
      <div class="v12-bank-label">
        <span>Bank 1 (Left): Cylinders 1 – 6</span>
        <span>Bank 2 (Right): Cylinders 7 – 12</span>
      </div>
      <div class="v12-cyl-strip">${cylPills}</div>
    </div>
    ${scrubBar}
    <div class="v12-parts">${partsBtns}</div>
    <span class="iso-caption">${caption}</span>
  </figcaption>
</figure>`;

const CSS = readFileSync(join(HERE, "v12.css"), "utf8");
const LIVE = readFileSync(join(HERE, "v12-live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));

const page = k.pageHtml({
  title: "V12 Engine — Anatomy",
  theme: THEME,
  body: `<style>${CSS}</style>${body}`,
  script: kitScript() + glScript() + LIVE,
  width: 980,
});

const outName = THEME === "light" ? "v12-light.html" : "v12.html";
writeFileSync(join(HERE, outName), page);
console.log("wrote", outName, `${(page.length / 1024).toFixed(0)} KB`, `${items.length} items`);
