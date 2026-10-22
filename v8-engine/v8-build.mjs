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

const W = 920;
const H = 880;
const AZIMUTH = 40;
const ELEVATION = 28;

// Coordinate System (World Units, approx mm):
// X: Longitudinal engine axis (rear flywheel at -68, front pulley at +66)
// Y: Lateral cross-axis (Left bank towards -Y, Right bank towards +Y)
// Z: Vertical axis (0 at crankshaft centerline, +Z up to intake at +75, -Z down to oilpan at -50)

// 1. DYNO TEST STAND & BEDPLATE
const BASE = { x: -140, y: -110, w: 280, d: 220, r: 12 };
const BASE_H = 16;
const FOOT_H = 6;
const BASE_TOP_Z = -54;

// 2. 90-DEGREE V8 GEOMETRY
// 4 Cylinder positions along X axis:
const X_CYLS = [-45, -15, 15, 45]; // Pairs: (1,2), (3,4), (5,6), (7,8)
const ROD_OFFSET = 3.2; // axial stagger on each crankpin

// Bank unit vectors:
// Left Bank (Bank 1: 1, 3, 5, 7): angled -45 deg
const SQ2 = Math.SQRT1_2; // 0.7071
const DIR_L = [0, -SQ2, SQ2];
const DIR_R = [0, SQ2, SQ2];

// Cylinder bore positions (X, Y, Z at cylinder deck s = 48):
const DECK_DIST = 48;
const CYL_CENTERS = {
  1: [-45 - ROD_OFFSET, -DECK_DIST * SQ2, DECK_DIST * SQ2],
  3: [-15 - ROD_OFFSET, -DECK_DIST * SQ2, DECK_DIST * SQ2],
  5: [15 - ROD_OFFSET, -DECK_DIST * SQ2, DECK_DIST * SQ2],
  7: [45 - ROD_OFFSET, -DECK_DIST * SQ2, DECK_DIST * SQ2],
  2: [-45 + ROD_OFFSET, DECK_DIST * SQ2, DECK_DIST * SQ2],
  4: [-15 + ROD_OFFSET, DECK_DIST * SQ2, DECK_DIST * SQ2],
  6: [15 + ROD_OFFSET, DECK_DIST * SQ2, DECK_DIST * SQ2],
  8: [45 + ROD_OFFSET, DECK_DIST * SQ2, DECK_DIST * SQ2],
};

// 3. EXPLODED ASSEMBLY PIECES
const PIECES = {
  stand: { name: "Dyno test stand", say: "dyno test stand · rigid cradle and load brake", move: [0, 0, 0] },
  oilpan: { name: "Oil pan & sump", say: "finned aluminum deep sump oil pan", move: [0, 0, -52] },
  crank: { name: "Crankshaft & flywheel", say: "cross-plane forged crankshaft · 4 counterweighted throws", move: [0, 0, -24] },
  block: { name: "90° V8 engine block", say: "cast 90° cross-bolted engine block · 8 cylinder liners", move: [0, 0, 0] },
  pistons_l: { name: "Left pistons & rods", say: "bank 1 forged pistons & H-beam connecting rods", move: [0, -50, 50] },
  pistons_r: { name: "Right pistons & rods", say: "bank 2 forged pistons & H-beam connecting rods", move: [0, 50, 50] },
  heads_l: { name: "Left cylinder head", say: "cross-flow DOHC cylinder head · 8 poppet valves & springs", move: [0, -55, 55] },
  heads_r: { name: "Right cylinder head", say: "cross-flow DOHC cylinder head · 8 poppet valves & springs", move: [0, 55, 55] },
  cams_l: { name: "Left camshafts", say: "dual overhead camshafts & vernier drive sprockets", move: [0, -75, 75] },
  cams_r: { name: "Right camshafts", say: "dual overhead camshafts & vernier drive sprockets", move: [0, 75, 75] },
  covers_l: { name: "Left valve cover", say: "billet finned valve cover with oil filler cap", move: [0, -92, 92] },
  covers_r: { name: "Right valve cover", say: "billet finned valve cover with PCV breather", move: [0, 92, 92] },
  intake: { name: "Cross-ram intake manifold", say: "cross-ram induction · 8 tuned runners & fuel rails", move: [0, 0, 82] },
  headers_l: { name: "Left 4-into-1 headers", say: "tuned stainless tubular exhaust headers · 4-into-1 merge", move: [0, -82, -10] },
  headers_r: { name: "Right 4-into-1 headers", say: "tuned stainless tubular exhaust headers · 4-into-1 merge", move: [0, 82, -10] },
  timing: { name: "Front serpentine drive", say: "harmonic balancer, water pump, alternator & serpentine belt", move: [78, 0, 0] },
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
  [-110, 0, 110],
  [110, 0, 110],
  [0, -110, 120],
  [0, 110, 120],
  [85, 0, 80],
];

const P = k.fitProjection(BOUNDS, W, H, {
  pad: 32,
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

  // 4 Leveling feet
  for (const [x, y] of byDepth(k.corners(BASE, 24))) {
    put(
      "stand",
      [x, y, z0],
      S(k.cylinder(x, y, 9.0, z0 - FOOT_H, 2.8, P, 28), { tone: "lo" }) +
        S(k.cylinder(x, y, 6.8, z0 - FOOT_H + 2.8, FOOT_H - 2.8, P, 28), { tone: "mid" }) +
        L(k.sideArc(x, y, 6.8, z0 - FOOT_H + 4.2, P, 16), { tone: "lo" })
    );
  }

  // Heavy precision cast dyno surface plate
  put("stand", [0, 0, BASE_TOP_Z], S(k.slabOf(BASE, z0, BASE_H, P, 8, 1.8), { tone: "mid" }));
  put("stand", [0, 0, BASE_TOP_Z], L(k.planOutline(k.insetPlan(BASE, 6), BASE_TOP_Z, P), { tone: "lo" }));

  // Corner socket cap screws
  const bolts = k.corners(BASE, 12);
  put(
    "stand",
    [0, 0, BASE_TOP_Z],
    L(bolts.map(([x, y]) => k.ring(x, y, 2.6, BASE_TOP_Z, P, 16)).join(""), { tone: "lo" }) +
      D(bolts.map(([x, y]) => at([x, y, BASE_TOP_Z])), { size: 0.5, tone: "hi" })
  );

  // Front millimeter datum scale strip
  const strip = { x: -120, y: BASE.y + BASE.d - 16, w: 240, d: 7.5, r: 1 };
  put("stand", [strip.x + strip.w / 2, strip.y + strip.d / 2, BASE_TOP_Z], S(k.slabOf(strip, BASE_TOP_Z, 0.8, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y, BASE_TOP_Z + 0.8, [1.6, 3.2], P);
  // Longitudinal datum line capping the ticks with terminal dots
  const datumLine = k.lineOnTop([strip.x + 4, strip.y], [strip.x + strip.w - 4, strip.y], BASE_TOP_Z + 0.8, P);
  const majorDatum = k.lineOnTop([strip.x + 4, strip.y + 3.2], [strip.x + strip.w - 4, strip.y + 3.2], BASE_TOP_Z + 0.8, P);
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
          at([strip.x + 4, strip.y + 3.2, BASE_TOP_Z + 0.8]),
          at([strip.x + strip.w - 4, strip.y + 3.2, BASE_TOP_Z + 0.8]),
        ],
        { size: 0.45, tone: "mid" }
      )
  );

  // Dyno Specification Plaque
  const plaque = { x: -125, y: -90, w: 42, d: 24, r: 1.5 };
  put(
    "stand",
    [plaque.x + plaque.w / 2, plaque.y + plaque.d / 2, BASE_TOP_Z],
    S(k.slabOf(plaque, BASE_TOP_Z, 0.8, P, 3), { tone: "lo", crease: "none" }) +
      L(k.planOutline(k.insetPlan(plaque, 1.6), BASE_TOP_Z + 0.8, P), { tone: "faint" }) +
      L(k.lineOnTop([-121, -85], [-90, -85], BASE_TOP_Z + 0.8, P), { tone: "lo", free: true }) +
      L(k.lineOnTop([-121, -80], [-98, -80], BASE_TOP_Z + 0.8, P), { tone: "lo", free: true }) +
      L(k.lineOnTop([-121, -75], [-104, -75], BASE_TOP_Z + 0.8, P), { tone: "lo", free: true }) +
      D(
        [
          at([-123, -88, BASE_TOP_Z + 0.8]),
          at([-85, -88, BASE_TOP_Z + 0.8]),
          at([-123, -68, BASE_TOP_Z + 0.8]),
          at([-85, -68, BASE_TOP_Z + 0.8]),
        ],
        { size: 0.35, tone: "mid" }
      )
  );

  // Rear Bellhousing Dyno Brake Housing (absorbs engine torque output)
  const F_dyno = G.frameAlong([-88, 0, 0], [1, 0, 0]);
  put("stand", [-88, 0, 0], S(G.disc(-24, 0, 36, F_dyno, P), { tone: "mid" }) + L(G.circleOf(F_dyno, -20, 36, P, 36), { tone: "lo" }));

  // Twin Front Mounting Stanchions (support block at X = +48, Y = +/-38)
  for (const sy of [-38, 38]) {
    const postBox = { x: 42, y: sy - 5, w: 12, d: 10, r: 2 };
    put("stand", [48, sy, BASE_TOP_Z], S(k.slabOf(postBox, BASE_TOP_Z, -22 - BASE_TOP_Z, P, 3, 0.6), { tone: "mid" }));
    put("stand", [48, sy, -22], S(k.cylinder(48, sy, 4.5, -22, 6, P, 18), { tone: "hi" }));
  }
}

// ==========================================
// 2. OIL PAN & SUMP (`oilpan`)
// ==========================================
function buildOilPan() {
  const panTopZ = -30;
  const panBox = { x: -62, y: -26, w: 118, d: 52, r: 4 };

  // Perimeter pan mounting flange
  put("oilpan", [0, 0, panTopZ], S(k.slabOf(panBox, panTopZ - 3, 3, P, 4, 0.5), { tone: "hi" }));
  put("oilpan", [0, 0, panTopZ], L(k.planOutline(k.insetPlan(panBox, 1.8), panTopZ, P), { tone: "lo" }));

  // Deep sump reservoir well (rear section)
  const sumpBox = { x: -60, y: -22, w: 56, d: 44, r: 3 };
  put("oilpan", [-32, 0, -48], S(k.slabOf(sumpBox, -50, 18, P, 4, 1.0), { tone: "mid" }));
  // Longitudinal heat dissipation fins on sump bottom
  for (const fy of [-16, -8, 0, 8, 16]) {
    put(
      "oilpan",
      [-32, fy, -50],
      S(k.slabOf({ x: -56, y: fy - 1.0, w: 48, d: 2.0, r: 0.5 }, -52, 2.0, P, 2), { tone: "hi", crease: "none" })
    );
  }

  // Front shallow tray section
  const frontTray = { x: -4, y: -22, w: 58, d: 44, r: 3 };
  put("oilpan", [25, 0, -40], S(k.slabOf(frontTray, -40, 8, P, 4, 0.8), { tone: "mid" }));

  // Magnetic drain plug
  put("oilpan", [-20, -23, -46], S(k.cylinder(-20, -23, 3.2, -48, 4, P, 16), { tone: "hi" }) + D([at([-20, -23, -44])], { size: 0.45, tone: "lit" }));
}

// ==========================================
// 3. CRANKSHAFT & FLYWHEEL (`crank`)
// ==========================================
function buildCrankshaft() {
  const F_axis = G.frameAlong([0, 0, 0], [1, 0, 0]);

  // Rear 168-Tooth Flywheel with starter ring gear
  put("crank", [-66, 0, 0], S(G.disc(-70, -62, 28, F_axis, P), { tone: "hi" }));
  put("crank", [-66, 0, 0], L(G.circleOf(F_axis, -68, 28, P, 48), { tone: "lo" }));
  put("crank", [-66, 0, 0], L(G.circleOf(F_axis, -64, 25, P, 40), { tone: "faint" }));
  const fwDots = Array.from({ length: 6 }, (_, i) => 
    `<circle class="iso-dot v8-dot-spin" data-pulley="flywheel" data-r="22.0" data-phase="${((i * Math.PI) / 3).toFixed(3)}" r="1.4" fill="var(--anatomy-dot)"/>`
  ).join("");
  put("crank", [-66, 0, 0], `<g class="v8-flywheel-spin">${fwDots}</g>`);

  // 5 Main bearing journals along crankshaft (diameter 13 mm)
  const mainX = [-56, -28, 0, 28, 54];
  for (const mx of mainX) {
    put("crank", [mx, 0, 0], S(G.disc(mx - 3.5, mx + 3.5, 6.5, F_axis, P), { tone: "mid" }));
    // Heavy main bearing cap underneath (cross-bolted)
    const capBox = { x: mx - 3.2, y: -10, w: 6.4, d: 20, r: 2 };
    put("crank", [mx, 0, -8], S(k.slabOf(capBox, -12, 8, P, 3, 0.5), { tone: "hi" }));
    put("crank", [mx, 0, -12], D([at([mx, -6, -12]), at([mx, 6, -12])], { size: 0.42, tone: "lit" }));
  }

  // 4 Cross-Plane Crankpins (indexed 0°, 90°, 270°, 180°)
  // Pin 1: X = -42, throw radius 10 mm along +Z
  const p1 = [-42, 0, 10];
  const F_p1 = G.frameAlong(p1, [1, 0, 0]);
  put("crank", p1, S(G.disc(-45, -39, 5.2, F_p1, P), { tone: "lit", lit: true }));

  // Pin 2: X = -14, throw along +Y
  const p2 = [-14, 10, 0];
  const F_p2 = G.frameAlong(p2, [1, 0, 0]);
  put("crank", p2, S(G.disc(-17, -11, 5.2, F_p2, P), { tone: "lit", lit: true }));

  // Pin 3: X = 14, throw along -Y
  const p3 = [14, -10, 0];
  const F_p3 = G.frameAlong(p3, [1, 0, 0]);
  put("crank", p3, S(G.disc(11, 17, 5.2, F_p3, P), { tone: "lit", lit: true }));

  // Pin 4: X = 42, throw along -Z
  const p4 = [42, 0, -10];
  const F_p4 = G.frameAlong(p4, [1, 0, 0]);
  put("crank", p4, S(G.disc(39, 45, 5.2, F_p4, P), { tone: "lit", lit: true }));

  // Counterweights (massive counterbalancing webs flanking each crank throw)
  for (const cx of [-49, -35, -21, -7, 7, 21, 35, 49]) {
    put("crank", [cx, 0, 0], S(G.disc(cx - 2.5, cx + 2.5, 16.5, F_axis, P), { tone: "mid" }));
    put("crank", [cx, 0, 0], L(G.arcOf(F_axis, cx + 2.5, 16.5, P), { tone: "lo" }));
  }
}

// ==========================================
// 4. ENGINE BLOCK (`block`)
// ==========================================
function buildEngineBlock() {
  // Crankcase lower block casting (Z = -30 to 0)
  const skirt = { x: -62, y: -30, w: 120, d: 60, r: 5 };
  put("block", [0, 0, -15], S(k.slabOf(skirt, -30, 30, P, 5, 1.2), { tone: "mid" }));
  put("block", [0, 0, -30], L(k.sideSeam(skirt, -15, P, 5), { tone: "lo" }));

  // 90° V Cylinder Banks:
  // Right bank cylinder block (tilted +45°, solid mass on rear bank)
  const bankR = { x: -60, y: 18, w: 116, d: 24, r: 3 };
  put("block", [0, 30, 24], S(k.slabOf(bankR, 10, 36, P, 4, 1.0), { tone: "mid" }));

  // Left bank cylinder block (tilted -45°, precision cutaway exposing Bank 1 pistons & liners)
  // 1. Lower crankcase deck slab (Z = 10 to 16)
  const bankL_bot = { x: -60, y: -42, w: 116, d: 24, r: 3 };
  put("block", [0, -30, 13], S(k.slabOf(bankL_bot, 10, 6, P, 3, 0.8), { tone: "hi" }));

  // 2. Upper deck slab mating with cylinder head (Z = 40 to 46)
  const bankL_top = { x: -60, y: -42, w: 116, d: 24, r: 3 };
  put("block", [0, -30, 43], S(k.slabOf(bankL_top, 40, 6, P, 3, 0.8), { tone: "hi" }));

  // 3. Inner valley backing wall facing the induction valley (Z = 16 to 40)
  const bankL_back = { x: -60, y: -26, w: 116, d: 8, r: 2 };
  put("block", [0, -22, 28], S(k.slabOf(bankL_back, 16, 24, P, 2, 0.6), { tone: "mid" }));

  // 4. Inter-cylinder structural webs & bulkheads between cutaway ports (Z = 16 to 40)
  const webPillars = [
    { x: -60, w: 6 }, // Rear end bulkhead
    { x: -35, w: 6 }, // Web between Cyl 1 & 3
    { x: -5, w: 6 },  // Web between Cyl 3 & 5
    { x: 25, w: 6 },  // Web between Cyl 5 & 7
    { x: 50, w: 6 },  // Front end bulkhead
  ];
  for (const pillar of webPillars) {
    const webBox = { x: pillar.x, y: -42, w: pillar.w, d: 24, r: 1.5 };
    put("block", [pillar.x + pillar.w / 2, -30, 28], S(k.slabOf(webBox, 16, 24, P, 2, 0.5), { tone: "hi" }));
  }

  // Machined cylinder liner bores with cross-hatch rings
  for (let c = 1; c <= 8; c++) {
    const [bx, by, bz] = CYL_CENTERS[c];
    const isLeft = c % 2 !== 0;
    const F_bore = G.frameAlong([bx, by, bz], isLeft ? DIR_L : DIR_R);
    if (isLeft) {
      // Cutaway cylinder sleeve interior visible on Bank 1
      put("block", [bx, by, bz], S(G.disc(-22, 0, 11.2, F_bore, P), { tone: "lo" }));
      put("block", [bx, by, bz], L(G.circleOf(F_bore, 0, 11.2, P, 24), { tone: "hi" }));
      put("block", [bx, by, bz], L(G.circleOf(F_bore, -10, 11.2, P, 24), { tone: "mid" }));
    } else {
      put("block", [bx, by, bz], S(G.disc(-6, 0, 11.2, F_bore, P), { tone: "lo" }));
      put("block", [bx, by, bz], L(G.circleOf(F_bore, 0, 11.2, P, 24), { tone: "hi" }));
    }
  }

  // Spin-on oil filter canister mounted on lower left block boss
  const F_filter = G.frameAlong([-32, -34, -14], [0, -1, 0]);
  put("block", [-32, -42, -14], S(G.disc(0, 18, 7.5, F_filter, P), { tone: "hi" }));
  put("block", [-32, -42, -14], L(G.circleOf(F_filter, 18, 7.5, P, 24), { tone: "faint" }));
}

// ==========================================
// 5. PISTONS & CONNECTING RODS (`pistons_l`, `pistons_r`)
// ==========================================
function buildPistons() {
  for (let c = 1; c <= 8; c++) {
    const isLeft = c % 2 !== 0;
    const piece = isLeft ? "pistons_l" : "pistons_r";
    const dir = isLeft ? DIR_L : DIR_R;
    const [bx, by, bz] = CYL_CENTERS[c];

    // Piston crown sits near the top of the bore
    const F_piston = G.frameAlong([bx, by, bz], dir);
    // Forged aluminum piston body (diameter 21 mm, height 12 mm)
    put(piece, [bx, by, bz], S(G.disc(-12, 0, 10.6, F_piston, P), { tone: "lit", lit: true }), { cyl: c });
    // Compression ring lands on piston skirt
    put(piece, [bx, by, bz], L(G.circleOf(F_piston, -2.5, 10.6, P, 24), { tone: "hi" }), { cyl: c });
    put(piece, [bx, by, bz], L(G.circleOf(F_piston, -5.0, 10.6, P, 24), { tone: "hi" }), { cyl: c });
    // Wrist pin hole
    put(piece, [bx, by, bz], D(G.dotsOf(F_piston, -8.0, 10.6, 2, P, { all: true }), { size: 0.5, tone: "mid" }), { cyl: c });

    // Solid H-Beam Connecting Rod (diameter 5 mm, length 30 mm)
    put(piece, [bx, by, bz], S(G.disc(-34, -10, 2.6, F_piston, P), { tone: "mid" }), { cyl: c });
    const rodEnd = [bx, by - dir[1] * 34, bz - dir[2] * 34];
    put(piece, rodEnd, S(k.cylinder(rodEnd[0], rodEnd[1], 4.8, rodEnd[2] - 2, 4, P, 16), { tone: "mid" }), { cyl: c });
  }
}

// ==========================================
// 6. CYLINDER HEADS (`heads_l`, `heads_r`)
// ==========================================
function buildCylinderHeads() {
  // Left Cylinder Head (Bank 1)
  const headL = { x: -62, y: -44, w: 120, d: 24, r: 3 };
  put("heads_l", [0, -32, 50], S(k.slabOf(headL, 42, 22, P, 4, 0.8), { tone: "hi" }));
  put("heads_l", [0, -32, 64], L(k.planOutline(k.insetPlan(headL, 2), 64, P), { tone: "faint" }));

  // Right Cylinder Head (Bank 2)
  const headR = { x: -62, y: 20, w: 120, d: 24, r: 3 };
  put("heads_r", [0, 32, 50], S(k.slabOf(headR, 42, 22, P, 4, 0.8), { tone: "mid" }));
  put("heads_r", [0, 32, 64], L(k.planOutline(k.insetPlan(headR, 2), 64, P), { tone: "faint" }));

  // 16 Dual Valve Springs & Retainers (2 valves per cylinder: intake and exhaust)
  for (let c = 1; c <= 8; c++) {
    const isLeft = c % 2 !== 0;
    const piece = isLeft ? "heads_l" : "heads_r";
    const dir = isLeft ? DIR_L : DIR_R;
    const [bx, by, bz] = CYL_CENTERS[c];

    // Intake valve spring
    const vIn = [bx - 4, by + dir[1] * 18, bz + dir[2] * 18];
    put(piece, vIn, S(k.cylinder(vIn[0], vIn[1], 3.2, vIn[2], 5, P, 16), { tone: "hi" }));
    put(piece, vIn, L(k.ring(vIn[0], vIn[1], 3.2, vIn[2] + 5, P, 16), { tone: "lit" }));

    // Exhaust valve spring
    const vEx = [bx + 4, by + dir[1] * 18, bz + dir[2] * 18];
    put(piece, vEx, S(k.cylinder(vEx[0], vEx[1], 3.2, vEx[2], 5, P, 16), { tone: "mid" }));
    put(piece, vEx, L(k.ring(vEx[0], vEx[1], 3.2, vEx[2] + 5, P, 16), { tone: "lo" }));

    // Spark plug with white ceramic insulator and terminal stud
    const sp = [bx, by + dir[1] * 22, bz + dir[2] * 22];
    put(piece, sp, S(k.cylinder(sp[0], sp[1], 2.2, sp[2], 8, P, 14), { tone: "lit", lit: true }));
    put(piece, sp, D([at([sp[0], sp[1], sp[2] + 8])], { size: 0.4, tone: "lit" }));
  }
}

// ==========================================
// 7. DUAL OVERHEAD CAMSHAFTS (`cams_l`, `cams_r`)
// ==========================================
function buildCamshafts() {
  const F_axis = G.frameAlong([0, 0, 0], [1, 0, 0]);

  // Left Bank Camshafts (intake and exhaust cams)
  for (const cy of [-38, -26]) {
    const cz = 68;
    put("cams_l", [0, cy, cz], S(G.disc(-58, 54, 4.2, G.frameAlong([0, cy, cz], [1, 0, 0]), P), { tone: "mid" }));
    // Front vernier adjustable cam sprocket
    const F_sprocketL = G.frameAlong([0, cy, cz], [1, 0, 0]);
    put("cams_l", [55, cy, cz], S(G.disc(54, 58, 12.0, F_sprocketL, P), { tone: "hi" }));
    put("cams_l", [55, cy, cz], L(G.circleOf(F_sprocketL, 58, 12.0, P, 32), { tone: "lo" }));
  }

  // Right Bank Camshafts
  for (const cy of [26, 38]) {
    const cz = 68;
    put("cams_r", [0, cy, cz], S(G.disc(-58, 54, 4.2, G.frameAlong([0, cy, cz], [1, 0, 0]), P), { tone: "mid" }));
    const F_sprocketR = G.frameAlong([0, cy, cz], [1, 0, 0]);
    put("cams_r", [55, cy, cz], S(G.disc(54, 58, 12.0, F_sprocketR, P), { tone: "hi" }));
    put("cams_r", [55, cy, cz], L(G.circleOf(F_sprocketR, 58, 12.0, P, 32), { tone: "lo" }));
  }
}

// ==========================================
// 8. FINNED BILLET VALVE COVERS (`covers_l`, `covers_r`)
// ==========================================
function buildValveCoVERS() {
  // Left finned valve cover
  const covL = { x: -60, y: -42, w: 116, d: 20, r: 3 };
  put("covers_l", [0, -32, 72], S(k.slabOf(covL, 68, 14, P, 4, 1.2), { tone: "hi" }));
  put("covers_l", [0, -32, 82], L(k.planOutline(k.insetPlan(covL, 2), 82, P), { tone: "faint" }));
  // Longitudinal cooling fins
  for (const fy of [-38, -34, -30, -26]) {
    put(
      "covers_l",
      [0, fy, 82],
      S(k.slabOf({ x: -56, y: fy - 0.8, w: 108, d: 1.6, r: 0.5 }, 82, 2.0, P, 2), { tone: "hi", crease: "none" })
    );
  }
  // Knurled oil filler cap at front
  put("covers_l", [42, -32, 84], S(k.cylinder(42, -32, 5.5, 82, 5, P, 20), { tone: "hi" }));
  put("covers_l", [42, -32, 87], L(k.knurl(42, -32, 5.5, 82, 87, 18, P), { tone: "lo" }));

  // Right finned valve cover
  const covR = { x: -60, y: 22, w: 116, d: 20, r: 3 };
  put("covers_r", [0, 32, 72], S(k.slabOf(covR, 68, 14, P, 4, 1.2), { tone: "mid" }));
  put("covers_r", [0, 32, 82], L(k.planOutline(k.insetPlan(covR, 2), 82, P), { tone: "faint" }));
  // Longitudinal cooling fins
  for (const fy of [26, 30, 34, 38]) {
    put(
      "covers_r",
      [0, fy, 82],
      S(k.slabOf({ x: -56, y: fy - 0.8, w: 108, d: 1.6, r: 0.5 }, 82, 2.0, P, 2), { tone: "mid", crease: "none" })
    );
  }
  // PCV breather filter bell
  put("covers_r", [42, 32, 84], S(k.cylinder(42, 32, 5.0, 82, 7, P, 20), { tone: "mid" }));
}

// ==========================================
// 9. CROSS-RAM INDUCTION MANIFOLD (`intake`)
// ==========================================
function buildIntakeManifold() {
  // Central induction plenum (Z = 62 to 76)
  const plenum = { x: -48, y: -14, w: 96, d: 28, r: 4 };
  put("intake", [0, 0, 68], S(k.slabOf(plenum, 62, 14, P, 5, 1.4), { tone: "hi" }));
  put("intake", [0, 0, 76], L(k.planOutline(k.insetPlan(plenum, 2.5), 76, P), { tone: "faint" }));

  // 8 Curved intake velocity runners (arching from plenum down to cylinder head intake ports)
  for (let c = 1; c <= 8; c++) {
    const isLeft = c % 2 !== 0;
    const [bx] = CYL_CENTERS[c];
    const py = isLeft ? -10 : 10;
    const hy = isLeft ? -22 : 22;
    const route = [
      [bx, py, 68],
      [bx, (py + hy) / 2, 72],
      [bx, hy, 56],
    ];
    tubePieces(route, 3.2, P, { maxLength: 16 }).forEach((part) => {
      put("intake", part.mid, tubeSvg(part, { tone: "hi" }));
    });
  }

  // Dual billet extruded fuel rails (left and right)
  for (const fry of [-16, 16]) {
    const railBox = { x: -52, y: fry - 2.5, w: 104, d: 5.0, r: 1.2 };
    put("intake", [0, fry, 60], S(k.slabOf(railBox, 58, 4.5, P, 3, 0.4), { tone: "hi" }));
    // 4 Fuel injectors along each rail
    for (const ix of [-45, -15, 15, 45]) {
      put("intake", [ix, fry, 56], S(k.cylinder(ix, fry, 2.2, 54, 5, P, 14), { tone: "mid" }));
      put("intake", [ix, fry, 58], D([at([ix, fry, 58])], { size: 0.35, tone: "lit" }));
    }
  }

  // Front Twin-Bore Billet Throttle Body
  const F_tb = G.frameAlong([0, 0, 68], [1, 0, 0]);
  put("intake", [52, 0, 68], S(G.disc(48, 58, 11.5, F_tb, P), { tone: "hi" }));
  put("intake", [58, 0, 68], L(G.circleOf(F_tb, 58, 11.5, P, 32), { tone: "lit" }));
  // Throttle linkage and TPS sensor on side
  put("intake", [52, 14, 68], S(k.cylinder(52, 14, 3.5, 65, 6, P, 16), { tone: "mid" }));
}

// ==========================================
// 10. TUNED 4-INTO-1 EXHAUST HEADERS (`headers_l`, `headers_r`)
// ==========================================
function buildExhaustHeaders() {
  // Left 4-into-1 Headers (Bank 1)
  const leftCollector = [-46, -60, -12];
  for (const c of [1, 3, 5, 7]) {
    const [bx] = CYL_CENTERS[c];
    const port = [bx, -42, 38];
    const route = [
      port,
      [bx - 2, -48, 28],
      [bx - 6, -56, 6],
      leftCollector,
    ];
    tubePieces(route, 3.4, P, { maxLength: 20 }).forEach((part) => {
      put("headers_l", part.mid, tubeSvg(part, { tone: "hi" }), { cyl: c });
    });
  }
  // Left 4-into-1 merge collector cone
  const F_collL = G.frameAlong(leftCollector, [-1, -0.4, -0.3]);
  put("headers_l", leftCollector, S(G.disc(0, 16, 7.5, F_collL, P), { tone: "hi" }));
  put("headers_l", leftCollector, L(G.circleOf(F_collL, 16, 7.5, P, 24), { tone: "mid" }));

  // Right 4-into-1 Headers (Bank 2)
  const rightCollector = [-46, 60, -12];
  for (const c of [2, 4, 6, 8]) {
    const [bx] = CYL_CENTERS[c];
    const port = [bx, 42, 38];
    const route = [
      port,
      [bx - 2, 48, 28],
      [bx - 6, 56, 6],
      rightCollector,
    ];
    tubePieces(route, 3.4, P, { maxLength: 20 }).forEach((part) => {
      put("headers_r", part.mid, tubeSvg(part, { tone: "mid" }), { cyl: c });
    });
  }
  // Right 4-into-1 merge collector cone
  const F_collR = G.frameAlong(rightCollector, [-1, 0.4, -0.3]);
  put("headers_r", rightCollector, S(G.disc(0, 16, 7.5, F_collR, P), { tone: "mid" }));
  put("headers_r", rightCollector, L(G.circleOf(F_collR, 16, 7.5, P, 24), { tone: "lo" }));
}

// ==========================================
// 11. FRONT SERPENTINE DRIVE (`timing`)
// ==========================================
function buildTimingDrive() {
  const F_snout = G.frameAlong([0, 0, 0], [1, 0, 0]);

  // Front Timing Cover Housing (Z = -24 to +45, X = 54 to 62)
  const coverBox = { x: 54, y: -28, w: 8, d: 56, r: 4 };
  put("timing", [58, 0, 10], S(k.slabOf(coverBox, -24, 68, P, 4, 0.8), { tone: "mid" }));

  // Water Pump Housing Neck (flares forward from timing cover X = 58 to 63)
  const F_wp = G.frameAlong([0, 0, 30], [1, 0, 0]);
  put("timing", [60, 0, 30], S(G.disc(58, 63, 13.5, F_wp, P), { tone: "mid" }));

  // Crankshaft Harmonic Balancer Pulley (X = 62 to 70, Z = 0)
  put("timing", [66, 0, 0], S(G.disc(62, 70, 14.0, F_snout, P)), { role: "pulley-crank" });
  put("timing", [66, 0, 0], L(G.circleOf(F_snout, 70, 14.0, P, 32), { tone: "lit" }));

  // Water Pump Pulley (X = 63 to 69, Z = 30)
  put("timing", [66, 0, 30], S(G.disc(63, 69, 11.0, F_wp, P)), { role: "pulley-wp" });
  put("timing", [66, 0, 30], L(G.circleOf(F_wp, 69, 11.0, P, 28), { tone: "mid" }));

  // Alternator Rigid Cast Mounting Bracket (anchors alternator to block/head)
  const altBracket = { x: 50, y: 22, w: 10, d: 12, r: 2 };
  put("timing", [55, 28, 38], S(k.slabOf(altBracket, 32, 10, P, 3, 0.4), { tone: "mid" }));

  // Alternator with cooling vents (Y = 32, Z = 38, X = 54 to 68)
  const F_alt = G.frameAlong([0, 32, 38], [1, 0, 0]);
  put("timing", [60, 32, 38], S(G.disc(54, 63, 11.5, F_alt, P), { tone: "mid" }));
  put("timing", [66, 32, 38], S(G.disc(63, 69, 8.5, F_alt, P)), { role: "pulley-alt" });
  put("timing", [66, 32, 38], L(G.circleOf(F_alt, 69, 8.5, P, 24), { tone: "lo" }));

  // Belt Tensioner Pivot Arm & Base Bracket
  const tensBase = { x: 58, y: -26, w: 6, d: 10, r: 1.5 };
  put("timing", [61, -21, 16], S(k.slabOf(tensBase, 12, 8, P, 2, 0.4), { tone: "lo" }));

  // Belt Tensioner Pulley (Y = -22, Z = 16, X = 63 to 68)
  const F_tens = G.frameAlong([0, -22, 16], [1, 0, 0]);
  put("timing", [66, -22, 16], S(G.disc(63, 68, 7.5, F_tens, P)), { role: "pulley-tens" });

  // Rotating index dots for all 4 front pulleys
  const spinSvg = [
    // Crank harmonic balancer: 4 balance holes + 1 outer rim timing notch
    ...Array.from({ length: 4 }, (_, i) => `<circle class="iso-dot v8-dot-spin" data-pulley="crank" data-r="8.5" data-phase="${((i * Math.PI) / 2).toFixed(3)}" r="1.3" fill="var(--anatomy-dot)"/>`),
    `<circle class="iso-dot v8-dot-spin" data-pulley="crank" data-r="13.2" data-phase="0" r="1.5" fill="var(--anatomy-lit)"/>`,
    // Water pump pulley: 4 balance holes
    ...Array.from({ length: 4 }, (_, i) => `<circle class="iso-dot v8-dot-spin" data-pulley="wp" data-r="7.0" data-phase="${((i * Math.PI) / 2).toFixed(3)}" r="1.2" fill="var(--anatomy-dot)"/>`),
    // Alternator pulley: 3 cooling impeller dots
    ...Array.from({ length: 3 }, (_, i) => `<circle class="iso-dot v8-dot-spin" data-pulley="alt" data-r="5.0" data-phase="${((i * 2 * Math.PI) / 3).toFixed(3)}" r="1.1" fill="var(--anatomy-dot)"/>`),
    // Tensioner pulley: 2 dots
    ...Array.from({ length: 2 }, (_, i) => `<circle class="iso-dot v8-dot-spin" data-pulley="tens" data-r="4.2" data-phase="${(i * Math.PI).toFixed(3)}" r="1.0" fill="var(--anatomy-dot)"/>`),
  ].join("");
  put("timing", [66, 0, 10], `<g class="v8-pulleys-spin">${spinSvg}</g>`);

  // Serpentine Multi-Rib Drive Belt (closed polygon loop at X = 66)
  const beltPts = [
    [66, 0, -14],
    [66, 14, 0],
    [66, 32, 29],
    [66, 32, 47],
    [66, 12, 41],
    [66, 0, 41],
    [66, -16, 24],
    [66, -22, 8],
    [66, -14, -8],
    [66, 0, -14],
  ];
  put("timing", [66, 0, 10], `<path class="iso-line v8-belt" data-tone="lit" d="${k.pathOf(beltPts.map((p) => at(p)), true)}" style="stroke-width:1.8; stroke-dasharray: 6 5; stroke-linecap: round;"/>`);
}

// Build all assemblies
buildStand();
buildOilPan();
buildCrankshaft();
buildEngineBlock();
buildPistons();
buildCylinderHeads();
buildCamshafts();
buildValveCoVERS();
buildIntakeManifold();
buildExhaustHeaders();
buildTimingDrive();

// Settle depth order across all overlapping assemblies
A.settle(R, P);
items.sort((a, b) => a.key - b.key);

const groups = items.map((item, index) => {
  const [mx, my, mz] = item.move;
  const cylAttr = item.cyl ? ` data-cyl="${item.cyl}"` : "";
  const roleAttr = item.role ? ` data-role="${item.role}"` : "";
  return `<g class="it" data-piece="${item.piece}"${item.ride !== item.piece ? ` data-ride="${item.ride}"` : ""} data-k="${item.key.toFixed(2)}" data-m="${mx.toFixed(1)},${my.toFixed(1)},${mz.toFixed(1)}" data-i="${index}"${cylAttr}${roleAttr}>${item.svg}</g>`;
});

// Front and Back SVGs
const backSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg v8-back" viewBox="0 0 ${W} ${H}" role="img" aria-label="High-performance 90-degree V8 internal combustion engine on test dyno"></svg>`;
const frontSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg v8-front" viewBox="0 0 ${W} ${H}" aria-hidden="true"><g class="v8-engine">${groups.join("")}</g></svg>`;

// Flat arrays for WebGL uniforms & kinematics
const unit = (vector) => {
  const o = at([0, 0, 0]);
  const p = at(vector);
  return [p[0] - o[0], p[1] - o[1]];
};

const cylPosFlat = [];
const cylPhases = [];
const CYL_FIRE = { 1: 0, 8: 90, 4: 180, 3: 270, 6: 360, 5: 450, 7: 540, 2: 630 };
for (let c = 1; c <= 8; c++) {
  cylPosFlat.push(...CYL_CENTERS[c]);
  cylPhases.push(CYL_FIRE[c]);
}

const uY = unit([0, 1, 0]);
const uZ = unit([0, 0, 1]);
const boreL = [SQ2 * uY[0] - SQ2 * uZ[0], SQ2 * uY[1] - SQ2 * uZ[1]];
const boreR = [-SQ2 * uY[0] - SQ2 * uZ[0], -SQ2 * uY[1] - SQ2 * uZ[1]];

const pulleyCenters = {
  crank: at([70, 0, 0]),
  wp: at([69, 0, 30]),
  alt: at([69, 32, 38]),
  tens: at([68, -22, 16]),
  flywheel: at([-64, 0, 0]),
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
  boreL,
  boreR,
  pulleyCenters,
  CYL_FIRE,
};

// Controls and Legend Elements
const corners = `<div class="iso-plate-corners" aria-hidden="true"><span class="iso-plate-corner" data-corner="fig">Fig 1</span><span class="iso-plate-corner" data-corner="title">V8 Engine · 90° DOHC Dyno</span><span class="iso-plate-corner" data-corner="readout" data-readout>2,400 RPM · 480 N·m · 160 kW</span></div>`;
const controls = `<div class="v8-controls">
  <button type="button" class="v8-btn" data-run><span class="v8-lamp" aria-hidden="true"></span><span data-run-label>Dyno Run</span></button>
  <button type="button" class="v8-btn" data-apart><span class="v8-lamp" aria-hidden="true"></span><span data-apart-label>Explode</span></button>
  <button type="button" class="v8-btn" data-xray><span class="v8-lamp" aria-hidden="true"></span><span data-xray-label>Pistons X-Ray</span></button>
  <span class="v8-hint">Drag to scrub crank · [Space] Run/Pause · [X] Pistons View · [E] Explode</span>
  <span class="v8-live" aria-live="polite" data-live></span>
</div>`;

const cylPills = Array.from({ length: 8 }, (_, i) => `<span class="v8-cyl-pill" data-cyl="${i + 1}">C${i + 1}</span>`).join("");
const partsBtns = ORDER_DISPLAY.map(
  (id, index) =>
    `<button type="button" class="v8-part-btn" data-part="${id}"><span class="v8-part-num">${String(index + 1).padStart(2, "0")}</span>${PIECES[id].name}</button>`
).join("");

const stage = `<div class="v8-stage" tabindex="0" role="slider" aria-label="V8 engine on dyno stand: drag to scrub crank, space toggles run mode, e toggles exploded view, x toggles x-ray view" aria-valuemin="0" aria-valuemax="720" aria-valuenow="0" aria-valuetext="Running at 2400 RPM">
  ${backSvg}
  ${frontSvg}
  <canvas class="v8-fire-canvas" aria-hidden="true"></canvas>
</div>`;

const caption =
  "A 90° cross-plane V8 four-stroke internal combustion engine on an instrumented dynamometer. Four crankpins indexed at 90° intervals (0°, 90°, 270°, 180°) balance reciprocating inertia. In the 1-8-4-3-6-5-7-2 firing order, exactly one cylinder fires every 90° of crankshaft rotation across the 720° four-stroke Otto cycle (Intake → Compression → Power → Exhaust), producing seamless, continuous torque overlap.";

const body = `<figure class="iso-figure v8">
  <div class="iso-plate">${corners}${stage}${controls}</div>
  <figcaption class="iso-legend">
    <div class="v8-cyl-strip">${cylPills}</div>
    <div class="v8-parts">${partsBtns}</div>
    <span class="iso-caption">${caption}</span>
  </figcaption>
</figure>`;

const CSS = readFileSync(join(HERE, "v8.css"), "utf8");
const LIVE = readFileSync(join(HERE, "v8-live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));

const page = k.pageHtml({
  title: "V8 Engine — Anatomy",
  theme: THEME,
  body: `<style>${CSS}</style>${body}`,
  script: kitScript() + glScript() + LIVE,
  width: 980,
});

const outName = THEME === "light" ? "v8-light.html" : "v8.html";
writeFileSync(join(HERE, outName), page);
console.log("wrote", outName, `${(page.length / 1024).toFixed(0)} KB`, `${items.length} items`);
