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
const H = 880;
const AZIMUTH = 40;
const ELEVATION = 27;

// ==========================================
// 1. DYNO TEST STAND & BEDPLATE
// ==========================================
const BASE = { x: -145, y: -105, w: 290, d: 210, r: 12 };
const BASE_H = 16;
const FOOT_H = 6;
const BASE_TOP_Z = -52;

// ==========================================
// 2. GEARBOX AXES & GEOMETRY
// ==========================================
// Mainshaft Centerline: along X axis, positioned at (Y = -5, Z = 8)
const MAIN_Y = -5.0;
const MAIN_Z = 8.0;

// Countershaft Centerline: parallel, positioned at (Y = 7.0, Z = -16.0)
// Center distance = sqrt((7 - (-5))^2 + (-16 - 8)^2) = sqrt(144 + 576) = 26.83 mm ~ 26.0 mm
const COUNT_Y = 7.0;
const COUNT_Z = -16.0;

// Reverse Idler Shaft Centerline: positioned at (Y = 16.0, Z = -2.0)
const IDLER_Y = 16.0;
const IDLER_Z = -2.0;

// Exploded Assembly Pieces
const PIECES = {
  stand: { name: "Dyno test stand", say: "dyno test stand · rigid cradle and load brake", move: [0, 0, 0] },
  case_lower: { name: "Lower transmission case", say: "cast aluminum oil sump reservoir & magnetic drain plug", move: [0, 0, -46] },
  case_upper: { name: "Upper transmission case", say: "ribbed transmission housing with inspection cutaway", move: [0, 0, 52] },
  bellhousing: { name: "Bellhousing & clutch fork", say: "clutch bellhousing · release fork and pivot ball", move: [-55, 0, 0] },
  clutch: { name: "Flywheel & clutch assembly", say: "flywheel, friction disc, diaphragm pressure plate & throw-out bearing", move: [-85, 0, 0] },
  input_shaft: { name: "Input shaft & drive gear", say: "splined clutch input shaft · 4th gear direct drive dogs", move: [-40, 0, 0] },
  countershaft: { name: "Cluster countershaft", say: "solid cluster countershaft · 6 integral drive gears", move: [0, 32, -30] },
  mainshaft: { name: "Main output shaft", say: "hardened splined mainshaft · needle bearing journals", move: [0, 0, 0] },
  gears_speed: { name: "Speed gears (1st–5th, Rev)", say: "freewheeling helical speed gears · brass synchro friction cones", move: [0, -32, 24] },
  synchros: { name: "Synchronizer assemblies", say: "splined hubs, brass baulk rings, dog teeth & sliding sleeves", move: [0, -44, 34] },
  rev_idler: { name: "Reverse idler gear", say: "spur reverse idler gear & fixed support spindle", move: [0, 36, 14] },
  shift_forks: { name: "Shift rails & forks", say: "3 selector rails · bronze shift forks & detent interlocks", move: [0, 0, 70] },
  shifter: { name: "H-gate shift tower", say: "short-throw shift tower · ball pivot & spherical knob", move: [0, 0, 92] },
  tail_housing: { name: "Tail extension housing", say: "rear extension housing · output seal & universal joint yoke", move: [60, 0, 0] },
};

const STAGGER = [
  "shifter",
  "shift_forks",
  "case_upper",
  "synchros",
  "gears_speed",
  "rev_idler",
  "countershaft",
  "input_shaft",
  "clutch",
  "bellhousing",
  "tail_housing",
  "case_lower",
  "mainshaft",
  "stand",
];

const ORDER_DISPLAY = [
  "clutch",
  "input_shaft",
  "mainshaft",
  "countershaft",
  "gears_speed",
  "synchros",
  "shift_forks",
  "shifter",
  "rev_idler",
  "case_upper",
  "case_lower",
  "bellhousing",
  "tail_housing",
];

const SPRING = { stagger: 0.035, stiffness: 68, damping: 14.8, substeps: 4 };

// Camera projection fitting
const BOUNDS = [
  ...k.boxCorners(BASE, BASE_TOP_Z - BASE_H - FOOT_H, BASE_TOP_Z),
  [-115, 0, 95],
  [115, 0, 95],
  [0, -95, 100],
  [0, 95, 100],
];

const P = k.fitProjection(BOUNDS, W, H, {
  pad: 28,
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

function put(piece, ref, svg, { bias = 0, move, ride, shapes = [], name, role } = {}) {
  R.put({
    piece,
    ride: ride ?? rideOf(piece, move),
    at: ref,
    bias,
    svg,
    move: move ?? PIECES[piece].move,
    shapes,
    name: name ?? nameFor(`${piece}.item`),
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
  for (const [x, y] of byDepth(k.corners(BASE, 24))) {
    put(
      "stand",
      [x, y, z0],
      S(k.cylinder(x, y, 9.2, z0 - FOOT_H, 2.8, P, 28), { tone: "lo" }) +
        S(k.cylinder(x, y, 7.0, z0 - FOOT_H + 2.8, FOOT_H - 2.8, P, 28), { tone: "mid" }) +
        L(k.sideArc(x, y, 7.0, z0 - FOOT_H + 4.2, P, 16), { tone: "lo" })
    );
  }

  // Precision cast dyno surface plate
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
  const strip = { x: -125, y: BASE.y + BASE.d - 16, w: 250, d: 8.0, r: 1.2 };
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

  // Transmission Specification Plaque
  const plaque = { x: -130, y: -86, w: 46, d: 24, r: 1.5 };
  put(
    "stand",
    [plaque.x + plaque.w / 2, plaque.y + plaque.d / 2, BASE_TOP_Z],
    S(k.slabOf(plaque, BASE_TOP_Z, 0.8, P, 3), { tone: "lo", crease: "none" }) +
      L(k.planOutline(k.insetPlan(plaque, 1.8), BASE_TOP_Z + 0.8, P), { tone: "faint" }) +
      L(k.lineOnTop([-126, -80], [-92, -80], BASE_TOP_Z + 0.8, P), { tone: "lo", free: true }) +
      L(k.lineOnTop([-126, -74], [-100, -74], BASE_TOP_Z + 0.8, P), { tone: "lo", free: true }) +
      L(k.lineOnTop([-126, -68], [-106, -68], BASE_TOP_Z + 0.8, P), { tone: "lo", free: true }) +
      D(
        [
          at([-128, -84, BASE_TOP_Z + 0.8]),
          at([-86, -84, BASE_TOP_Z + 0.8]),
          at([-128, -64, BASE_TOP_Z + 0.8]),
          at([-86, -64, BASE_TOP_Z + 0.8]),
        ],
        { size: 0.35, tone: "mid" }
      )
  );

  // Front Electric Drive Motor (simulating engine torque input)
  const F_motor = G.frameAlong([-110, MAIN_Y, MAIN_Z], [1, 0, 0]);
  put("stand", [-110, MAIN_Y, MAIN_Z], S(G.disc(-22, 0, 24, F_motor, P), { tone: "mid" }) + L(G.circleOf(F_motor, -18, 24, P, 32), { tone: "lo" }));

  // Rear Dynamometer Load Absorber Brake (simulating road/wheel load)
  const F_brake = G.frameAlong([110, MAIN_Y, MAIN_Z], [1, 0, 0]);
  put("stand", [110, MAIN_Y, MAIN_Z], S(G.disc(0, 24, 26, F_brake, P), { tone: "mid" }) + L(G.circleOf(F_brake, 18, 26, P, 36), { tone: "lo" }));

  // Rigid Transmission Cradle Mounting Pedestals
  for (const sx of [-25, 45]) {
    for (const sy of [-35, 35]) {
      const postBox = { x: sx - 6, y: sy - 5, w: 12, d: 10, r: 2 };
      put("stand", [sx, sy, BASE_TOP_Z], S(k.slabOf(postBox, BASE_TOP_Z, -22 - BASE_TOP_Z, P, 3, 0.6), { tone: "mid" }));
      put("stand", [sx, sy, -22], S(k.cylinder(sx, sy, 4.2, -22, 5, P, 18), { tone: "hi" }));
    }
  }
}

// ==========================================
// 2. BELLHOUSING & CLUTCH ASSEMBLY (`bellhousing`, `clutch`)
// ==========================================
function buildClutchAndBellhousing() {
  const F_main = G.frameAlong([0, MAIN_Y, MAIN_Z], [1, 0, 0]);

  // Bellhousing Outer Flange & Conical Body (X = -75 to -50)
  put("bellhousing", [-62, MAIN_Y, MAIN_Z], S(G.disc(-74, -70, 36, F_main, P), { tone: "hi" }));
  put("bellhousing", [-62, MAIN_Y, MAIN_Z], S(G.disc(-70, -50, 32, F_main, P), { tone: "mid" }));
  put("bellhousing", [-50, MAIN_Y, MAIN_Z], L(G.circleOf(F_main, -50, 32, P, 40), { tone: "lo" }));

  // Clutch Release Fork Pivot Arm
  const forkArm = [
    [-60, MAIN_Y - 36, MAIN_Z - 10],
    [-60, MAIN_Y - 14, MAIN_Z],
    [-60, MAIN_Y, MAIN_Z],
  ];
  tubePieces(forkArm, 3.0, P, { maxLength: 20 }).forEach((part) => {
    put("bellhousing", part.mid, tubeSvg(part, { tone: "hi" }));
  });

  // Engine Flywheel (X = -82, diameter 33 mm)
  put("clutch", [-82, MAIN_Y, MAIN_Z], S(G.disc(-84, -78, 33, F_main, P), { tone: "hi" }));
  put("clutch", [-82, MAIN_Y, MAIN_Z], L(G.circleOf(F_main, -80, 33, P, 48), { tone: "lo" }));

  // Clutch Friction Disc with Organic Lining & Torsional Damping Springs (X = -75)
  put("clutch", [-75, MAIN_Y, MAIN_Z], S(G.disc(-76, -72, 28, F_main, P), { tone: "mid" }));
  // 4 Torsion damper springs on disc hub
  for (const ang of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
    const spX = -74;
    const spY = MAIN_Y + 14 * Math.cos(ang);
    const spZ = MAIN_Z + 14 * Math.sin(ang);
    put("clutch", [spX, spY, spZ], S(k.cylinder(spX, spY, 2.8, spZ - 2.8, 5.6, P, 14), { tone: "hi" }));
  }

  // Diaphragm Spring Clutch Pressure Plate (X = -68)
  put("clutch", [-68, MAIN_Y, MAIN_Z], S(G.disc(-70, -64, 29, F_main, P), { tone: "hi" }));
  put("clutch", [-68, MAIN_Y, MAIN_Z], L(G.circleOf(F_main, -66, 29, P, 40), { tone: "lit" }));

  // Throw-Out Release Bearing (X = -58)
  put("clutch", [-58, MAIN_Y, MAIN_Z], S(G.disc(-60, -54, 14, F_main, P), { tone: "lit", lit: true }));
  put("clutch", [-58, MAIN_Y, MAIN_Z], L(G.circleOf(F_main, -56, 14, P, 24), { tone: "lo" }));
}

// ==========================================
// 3. INPUT SHAFT & DRIVE GEAR (`input_shaft`)
// ==========================================
function buildInputShaft() {
  const F_main = G.frameAlong([0, MAIN_Y, MAIN_Z], [1, 0, 0]);

  // Splined input shaft snout (X = -72 to -48, diameter 7.5 mm)
  put("input_shaft", [-60, MAIN_Y, MAIN_Z], S(G.disc(-72, -48, 7.5, F_main, P), { tone: "mid" }));
  put("input_shaft", [-60, MAIN_Y, MAIN_Z], L(G.circleOf(F_main, -60, 7.5, P, 16), { tone: "hi" }));

  // Front Heavy-Duty Ball Bearing (X = -48 to -42, diameter 19 mm)
  put("input_shaft", [-45, MAIN_Y, MAIN_Z], S(G.disc(-48, -42, 19, F_main, P), { tone: "hi" }));

  // Input Main Drive Pinion Gear (X = -42 to -32, Radius = 11.0 mm)
  put("input_shaft", [-37, MAIN_Y, MAIN_Z], S(G.disc(-42, -32, 11.0, F_main, P), { tone: "lit", lit: true }));
  put("input_shaft", [-37, MAIN_Y, MAIN_Z], L(G.circleOf(F_main, -37, 11.0, P, 28), { tone: "lo" }));

  // 4th Gear Direct Drive Dog Teeth Ring & Brass Baulk Friction Cone (X = -32 to -26)
  put("input_shaft", [-29, MAIN_Y, MAIN_Z], S(G.disc(-32, -26, 9.2, F_main, P), { tone: "hi" }));
  // Rotating tooth index dots for input shaft
  const dots = Array.from({ length: 4 }, (_, i) =>
    `<circle class="iso-dot gearbox-dot-spin" data-shaft="input" data-r="9.5" data-phase="${((i * Math.PI) / 2).toFixed(3)}" r="1.3" fill="var(--anatomy-lit)"/>`
  ).join("");
  put("input_shaft", [-37, MAIN_Y, MAIN_Z], `<g class="gearbox-input-spin">${dots}</g>`);
}

// ==========================================
// 4. COUNTERSHAFT & CLUSTER GEARS (`countershaft`)
// ==========================================
function buildCountershaft() {
  const F_counter = G.frameAlong([0, COUNT_Y, COUNT_Z], [1, 0, 0]);

  // Solid cluster countershaft body (X = -46 to 74, diameter 9 mm)
  put("countershaft", [14, COUNT_Y, COUNT_Z], S(G.disc(-46, 74, 9.0, F_counter, P), { tone: "mid" }));

  // Front and Rear Tapered Roller Bearings
  put("countershaft", [-46, COUNT_Y, COUNT_Z], S(G.disc(-48, -42, 14.5, F_counter, P), { tone: "hi" }));
  put("countershaft", [74, COUNT_Y, COUNT_Z], S(G.disc(72, 78, 14.5, F_counter, P), { tone: "hi" }));

  // 6 Integral Cluster Drive Gears on Countershaft:
  // 1. Countershaft Drive Gear (X = -42 to -32, Radius = 15.0 mm, meshes with input pinion 11.0)
  put("countershaft", [-37, COUNT_Y, COUNT_Z], S(G.disc(-42, -32, 15.0, F_counter, P), { tone: "hi" }));
  put("countershaft", [-37, COUNT_Y, COUNT_Z], L(G.circleOf(F_counter, -37, 15.0, P, 32), { tone: "lo" }));

  // 2. Countershaft 3rd Drive Gear (X = -12 to -2, Radius = 11.5 mm, meshes with 3rd gear 14.5)
  put("countershaft", [-7, COUNT_Y, COUNT_Z], S(G.disc(-12, -2, 11.5, F_counter, P), { tone: "mid" }));
  put("countershaft", [-7, COUNT_Y, COUNT_Z], L(G.circleOf(F_counter, -7, 11.5, P, 28), { tone: "lo" }));

  // 3. Countershaft 2nd Drive Gear (X = 2 to 12, Radius = 8.5 mm, meshes with 2nd gear 17.5)
  put("countershaft", [7, COUNT_Y, COUNT_Z], S(G.disc(2, 12, 8.5, F_counter, P), { tone: "hi" }));
  put("countershaft", [7, COUNT_Y, COUNT_Z], L(G.circleOf(F_counter, 7, 8.5, P, 24), { tone: "lo" }));

  // 4. Countershaft 1st Drive Pinion (X = 32 to 44, Radius = 6.0 mm, meshes with 1st gear 20.0)
  put("countershaft", [38, COUNT_Y, COUNT_Z], S(G.disc(32, 44, 6.0, F_counter, P), { tone: "lit", lit: true }));

  // 5. Countershaft Reverse Pinion (X = 46 to 54, Radius = 6.5 mm, meshes with reverse idler 7.0)
  put("countershaft", [50, COUNT_Y, COUNT_Z], S(G.disc(46, 54, 6.5, F_counter, P), { tone: "mid" }));

  // 6. Countershaft 5th Drive Gear (X = 62 to 72, Radius = 15.0 mm, meshes with 5th gear 11.0)
  put("countershaft", [67, COUNT_Y, COUNT_Z], S(G.disc(62, 72, 15.0, F_counter, P), { tone: "hi" }));
  put("countershaft", [67, COUNT_Y, COUNT_Z], L(G.circleOf(F_counter, 67, 15.0, P, 32), { tone: "lo" }));

  // Rotating tooth index dots for countershaft
  const cdots = Array.from({ length: 4 }, (_, i) =>
    `<circle class="iso-dot gearbox-dot-spin" data-shaft="counter" data-r="13.5" data-phase="${((i * Math.PI) / 2).toFixed(3)}" r="1.3" fill="var(--anatomy-dot)"/>`
  ).join("");
  put("countershaft", [-37, COUNT_Y, COUNT_Z], `<g class="gearbox-counter-spin">${cdots}</g>`);
}

// ==========================================
// 5. MAIN OUTPUT SHAFT (`mainshaft`)
// ==========================================
function buildMainshaft() {
  const F_main = G.frameAlong([0, MAIN_Y, MAIN_Z], [1, 0, 0]);

  // Central hardened main output shaft (X = -25 to 78, diameter 9.5 mm)
  put("mainshaft", [26, MAIN_Y, MAIN_Z], S(G.disc(-25, 78, 9.5, F_main, P), { tone: "mid" }));

  // Front needle bearing pilot tip riding in input shaft pocket (X = -28 to -25)
  put("mainshaft", [-26, MAIN_Y, MAIN_Z], S(G.disc(-28, -25, 6.0, F_main, P), { tone: "hi" }));

  // Rear Heavy-Duty Output Ball Bearing (X = 74 to 80, diameter 21 mm)
  put("mainshaft", [77, MAIN_Y, MAIN_Z], S(G.disc(74, 80, 21.0, F_main, P), { tone: "hi" }));

  // Output Companion Flange & Yoke for Driveshaft (X = 82 to 96)
  put("mainshaft", [89, MAIN_Y, MAIN_Z], S(G.disc(82, 88, 12.0, F_main, P), { tone: "mid" }));
  put("mainshaft", [89, MAIN_Y, MAIN_Z], S(G.disc(88, 96, 24.0, F_main, P), { tone: "hi" }));
  put("mainshaft", [96, MAIN_Y, MAIN_Z], L(G.circleOf(F_main, 96, 24.0, P, 36), { tone: "lo" }));
  // 4 Flange bolt holes
  put("mainshaft", [96, MAIN_Y, MAIN_Z], D(G.dotsOf(F_main, 96, 18.0, 4, P, { all: true }), { size: 0.5, tone: "lit" }));

  // Rotating tooth index dots for output shaft
  const outDots = Array.from({ length: 4 }, (_, i) =>
    `<circle class="iso-dot gearbox-dot-spin" data-shaft="output" data-r="18.0" data-phase="${((i * Math.PI) / 2).toFixed(3)}" r="1.4" fill="var(--anatomy-lit)"/>`
  ).join("");
  put("mainshaft", [96, MAIN_Y, MAIN_Z], `<g class="gearbox-output-spin">${outDots}</g>`);
}

// ==========================================
// 6. FREEWHEELING SPEED GEARS (`gears_speed`)
// ==========================================
function buildSpeedGears() {
  const F_main = G.frameAlong([0, MAIN_Y, MAIN_Z], [1, 0, 0]);

  // 1. 3rd Speed Gear (X = -12 to -2, Radius = 14.5 mm)
  put("gears_speed", [-7, MAIN_Y, MAIN_Z], S(G.disc(-12, -2, 14.5, F_main, P), { tone: "hi" }));
  put("gears_speed", [-7, MAIN_Y, MAIN_Z], L(G.circleOf(F_main, -7, 14.5, P, 32), { tone: "lo" }));
  // 3rd Gear Dog Teeth & Friction Cone (X = -18 to -12)
  put("gears_speed", [-15, MAIN_Y, MAIN_Z], S(G.disc(-18, -12, 9.2, F_main, P), { tone: "mid" }));
  const d3 = Array.from({ length: 3 }, (_, i) =>
    `<circle class="iso-dot gearbox-dot-spin" data-shaft="gear3" data-r="12.0" data-phase="${((i * 2 * Math.PI) / 3).toFixed(3)}" r="1.2" fill="var(--anatomy-dot)"/>`
  ).join("");
  put("gears_speed", [-7, MAIN_Y, MAIN_Z], `<g class="gearbox-g3-spin">${d3}</g>`);

  // 2. 2nd Speed Gear (X = 2 to 12, Radius = 17.5 mm)
  put("gears_speed", [7, MAIN_Y, MAIN_Z], S(G.disc(2, 12, 17.5, F_main, P), { tone: "hi" }));
  put("gears_speed", [7, MAIN_Y, MAIN_Z], L(G.circleOf(F_main, 7, 17.5, P, 36), { tone: "lo" }));
  // 2nd Gear Dog Teeth & Cone (X = 12 to 18)
  put("gears_speed", [15, MAIN_Y, MAIN_Z], S(G.disc(12, 18, 9.8, F_main, P), { tone: "mid" }));
  const d2 = Array.from({ length: 3 }, (_, i) =>
    `<circle class="iso-dot gearbox-dot-spin" data-shaft="gear2" data-r="14.5" data-phase="${((i * 2 * Math.PI) / 3).toFixed(3)}" r="1.2" fill="var(--anatomy-dot)"/>`
  ).join("");
  put("gears_speed", [7, MAIN_Y, MAIN_Z], `<g class="gearbox-g2-spin">${d2}</g>`);

  // 3. 1st Speed Gear (X = 32 to 44, Radius = 20.0 mm - Maximum reduction gear)
  put("gears_speed", [38, MAIN_Y, MAIN_Z], S(G.disc(32, 44, 20.0, F_main, P), { tone: "lit", lit: true }));
  put("gears_speed", [38, MAIN_Y, MAIN_Z], L(G.circleOf(F_main, 38, 20.0, P, 40), { tone: "lo" }));
  // 1st Gear Dog Teeth & Cone (X = 26 to 32)
  put("gears_speed", [29, MAIN_Y, MAIN_Z], S(G.disc(26, 32, 10.5, F_main, P), { tone: "hi" }));
  const d1 = Array.from({ length: 4 }, (_, i) =>
    `<circle class="iso-dot gearbox-dot-spin" data-shaft="gear1" data-r="17.0" data-phase="${((i * Math.PI) / 2).toFixed(3)}" r="1.3" fill="var(--anatomy-lit)"/>`
  ).join("");
  put("gears_speed", [38, MAIN_Y, MAIN_Z], `<g class="gearbox-g1-spin">${d1}</g>`);

  // 4. Reverse Speed Gear (X = 46 to 54, Radius = 18.5 mm)
  put("gears_speed", [50, MAIN_Y, MAIN_Z], S(G.disc(46, 54, 18.5, F_main, P), { tone: "mid" }));
  put("gears_speed", [50, MAIN_Y, MAIN_Z], L(G.circleOf(F_main, 50, 18.5, P, 36), { tone: "lo" }));
  // Reverse Dog Teeth (X = 54 to 58)
  put("gears_speed", [56, MAIN_Y, MAIN_Z], S(G.disc(54, 58, 10.0, F_main, P), { tone: "hi" }));
  const dR = Array.from({ length: 3 }, (_, i) =>
    `<circle class="iso-dot gearbox-dot-spin" data-shaft="gearR" data-r="15.0" data-phase="${((i * 2 * Math.PI) / 3).toFixed(3)}" r="1.2" fill="var(--anatomy-dot)"/>`
  ).join("");
  put("gears_speed", [50, MAIN_Y, MAIN_Z], `<g class="gearbox-gR-spin">${dR}</g>`);

  // 5. 5th Speed Gear (Overdrive, X = 62 to 72, Radius = 11.0 mm)
  put("gears_speed", [67, MAIN_Y, MAIN_Z], S(G.disc(62, 72, 11.0, F_main, P), { tone: "hi" }));
  put("gears_speed", [67, MAIN_Y, MAIN_Z], L(G.circleOf(F_main, 67, 11.0, P, 28), { tone: "lo" }));
  // 5th Gear Dog Teeth (X = 58 to 62)
  put("gears_speed", [60, MAIN_Y, MAIN_Z], S(G.disc(58, 62, 9.2, F_main, P), { tone: "mid" }));
  const d5 = Array.from({ length: 3 }, (_, i) =>
    `<circle class="iso-dot gearbox-dot-spin" data-shaft="gear5" data-r="9.0" data-phase="${((i * 2 * Math.PI) / 3).toFixed(3)}" r="1.2" fill="var(--anatomy-dot)"/>`
  ).join("");
  put("gears_speed", [67, MAIN_Y, MAIN_Z], `<g class="gearbox-g5-spin">${d5}</g>`);
}

// ==========================================
// 7. SYNCHRONIZER ASSEMBLIES (`synchros`)
// ==========================================
function buildSynchronizers() {
  const F_main = G.frameAlong([0, MAIN_Y, MAIN_Z], [1, 0, 0]);

  // 1. 3-4 Synchronizer Assembly (Centered at X = -22)
  // Splined Hub fixed to mainshaft
  put("synchros", [-22, MAIN_Y, MAIN_Z], S(G.disc(-24, -20, 10.5, F_main, P), { tone: "mid" }));
  // Dual Brass Baulk Rings (Cone friction synchronizers)
  put("synchros", [-25, MAIN_Y, MAIN_Z], S(G.disc(-26, -24, 9.6, F_main, P), { tone: "lit", lit: true }));
  put("synchros", [-19, MAIN_Y, MAIN_Z], S(G.disc(-20, -18, 9.6, F_main, P), { tone: "lit", lit: true }));
  // Sliding Shift Collar / Sleeve (moves axially with 3rd / 4th gear shift)
  put(
    "synchros",
    [-22, MAIN_Y, MAIN_Z],
    S(G.disc(-25, -19, 12.0, F_main, P), { tone: "hi" }) +
      L(G.circleOf(F_main, -22, 12.0, P, 28), { tone: "lo" }),
    { role: "sleeve-34" }
  );

  // 2. 1-2 Synchronizer Assembly (Centered at X = 22)
  // Splined Hub
  put("synchros", [22, MAIN_Y, MAIN_Z], S(G.disc(20, 24, 11.0, F_main, P), { tone: "mid" }));
  // Dual Brass Baulk Rings
  put("synchros", [19, MAIN_Y, MAIN_Z], S(G.disc(18, 20, 10.2, F_main, P), { tone: "lit", lit: true }));
  put("synchros", [25, MAIN_Y, MAIN_Z], S(G.disc(24, 26, 10.2, F_main, P), { tone: "lit", lit: true }));
  // Sliding Shift Collar / Sleeve (moves axially with 1st / 2nd gear shift)
  put(
    "synchros",
    [22, MAIN_Y, MAIN_Z],
    S(G.disc(19, 25, 13.0, F_main, P), { tone: "hi" }) +
      L(G.circleOf(F_main, 22, 13.0, P, 32), { tone: "lo" }),
    { role: "sleeve-12" }
  );

  // 3. 5th-Reverse Synchronizer Assembly (Centered at X = 58)
  // Splined Hub
  put("synchros", [58, MAIN_Y, MAIN_Z], S(G.disc(56, 60, 10.5, F_main, P), { tone: "mid" }));
  // Brass Baulk Rings
  put("synchros", [55, MAIN_Y, MAIN_Z], S(G.disc(54, 56, 9.8, F_main, P), { tone: "lit", lit: true }));
  put("synchros", [61, MAIN_Y, MAIN_Z], S(G.disc(60, 62, 9.8, F_main, P), { tone: "lit", lit: true }));
  // Sliding Shift Collar / Sleeve (moves axially with 5th / Rev gear shift)
  put(
    "synchros",
    [58, MAIN_Y, MAIN_Z],
    S(G.disc(55, 61, 12.0, F_main, P), { tone: "hi" }) +
      L(G.circleOf(F_main, 58, 12.0, P, 28), { tone: "lo" }),
    { role: "sleeve-5r" }
  );
}

// ==========================================
// 8. REVERSE IDLER GEAR & SPINDLE (`rev_idler`)
// ==========================================
function buildReverseIdler() {
  const F_idler = G.frameAlong([50, IDLER_Y, IDLER_Z], [1, 0, 0]);

  // Reverse Idler Shaft Spindle
  put("rev_idler", [50, IDLER_Y, IDLER_Z], S(G.disc(44, 56, 4.0, F_idler, P), { tone: "mid" }));

  // Straight-Cut Spur Reverse Idler Gear (Radius = 7.0 mm)
  put("rev_idler", [50, IDLER_Y, IDLER_Z], S(G.disc(46, 54, 7.0, F_idler, P), { tone: "lit", lit: true }));
  put("rev_idler", [50, IDLER_Y, IDLER_Z], L(G.circleOf(F_idler, 50, 7.0, P, 20), { tone: "lo" }));
}

// ==========================================
// 9. SHIFT RAILS & BRONZE FORKS (`shift_forks`)
// ==========================================
function buildShiftForks() {
  const RAIL_Z = 24.0;
  const F_rail = G.frameAlong([0, 0, RAIL_Z], [1, 0, 0]);

  // 3 Selector Rails running along the top of the transmission
  for (const ry of [-8, 0, 8]) {
    put("shift_forks", [16, ry, RAIL_Z], S(G.disc(-40, 72, 3.2, G.frameAlong([0, ry, RAIL_Z], [1, 0, 0]), P), { tone: "mid" }));
    // Detent notch balls & interlock pins
    put("shift_forks", [16, ry, RAIL_Z], D([at([16, ry, RAIL_Z + 3.2])], { size: 0.45, tone: "lit" }));
  }

  // Bronze Shift Fork 3-4 (embraces Sleeve 3-4 at X = -22)
  const fork34 = [
    [-22, 0, RAIL_Z],
    [-22, MAIN_Y, MAIN_Z + 14],
    [-22, MAIN_Y - 12, MAIN_Z],
  ];
  tubePieces(fork34, 2.6, P, { maxLength: 16 }).forEach((part) => {
    put("shift_forks", part.mid, tubeSvg(part, { tone: "hi" }), { role: "fork-34" });
  });

  // Bronze Shift Fork 1-2 (embraces Sleeve 1-2 at X = 22)
  const fork12 = [
    [22, -8, RAIL_Z],
    [22, MAIN_Y, MAIN_Z + 15],
    [22, MAIN_Y - 13, MAIN_Z],
  ];
  tubePieces(fork12, 2.6, P, { maxLength: 16 }).forEach((part) => {
    put("shift_forks", part.mid, tubeSvg(part, { tone: "hi" }), { role: "fork-12" });
  });

  // Bronze Shift Fork 5-R (embraces Sleeve 5-R at X = 58)
  const fork5r = [
    [58, 8, RAIL_Z],
    [58, MAIN_Y, MAIN_Z + 14],
    [58, MAIN_Y - 12, MAIN_Z],
  ];
  tubePieces(fork5r, 2.6, P, { maxLength: 16 }).forEach((part) => {
    put("shift_forks", part.mid, tubeSvg(part, { tone: "hi" }), { role: "fork-5r" });
  });
}

// ==========================================
// 10. H-GATE SHIFT TOWER & LEVER (`shifter`)
// ==========================================
function buildShifter() {
  const towerX = 18;
  const towerZ = 28;

  // Short-Throw Shifter Base Turret Box
  const turret = { x: towerX - 10, y: -10, w: 20, d: 20, r: 3 };
  put("shifter", [towerX, 0, towerZ], S(k.slabOf(turret, towerZ, 12, P, 3, 0.6), { tone: "mid" }));

  // Spherical Pivot Ball
  put("shifter", [towerX, 0, towerZ + 12], S(k.cylinder(towerX, 0, 7.0, towerZ + 12, 6, P, 20), { tone: "hi" }));

  // Polished Chrome Shift Stick Lever (rises from pivot ball Z = 46 to 76)
  const F_stick = G.frameAlong([towerX, 0, towerZ + 18], [0, 0, 1]);
  put("shifter", [towerX, 0, towerZ + 32], S(G.disc(0, 28, 2.8, F_stick, P), { tone: "lit", lit: true }));

  // Spherical Billet Shift Knob with 5-Speed H-Pattern Gate Inlay (Z = 76)
  put("shifter", [towerX, 0, towerZ + 48], S(k.cylinder(towerX, 0, 6.2, towerZ + 46, 7, P, 24), { tone: "hi" }));
  put("shifter", [towerX, 0, towerZ + 53], D([at([towerX, 0, towerZ + 53])], { size: 0.5, tone: "lit" }));
}

// ==========================================
// 11. TRANSMISSION CASING & EXTENSION (`case_lower`, `case_upper`, `tail_housing`)
// ==========================================
function buildCasing() {
  // Lower Case Oil Pan & Sump Reservoir (Z = -30 to -16, X = -48 to 72)
  const sumpBox = { x: -48, y: -26, w: 120, d: 52, r: 4 };
  put("case_lower", [12, 0, -23], S(k.slabOf(sumpBox, -32, 16, P, 4, 1.0), { tone: "mid" }));
  // Magnetic Drain Plug on sump bottom
  put("case_lower", [-20, -22, -30], S(k.cylinder(-20, -22, 3.2, -32, 4, P, 16), { tone: "hi" }) + D([at([-20, -22, -28])], { size: 0.45, tone: "lit" }));

  // Upper Transmission Housing with Precision Cutaway (Z = -16 to 24, X = -48 to 72)
  // Rear end bulkhead (X = 66 to 72)
  const bulkRear = { x: 66, y: -26, w: 6, d: 52, r: 3 };
  put("case_upper", [69, 0, 4], S(k.slabOf(bulkRear, -16, 40, P, 3, 0.6), { tone: "mid" }));

  // Front intermediate bulkhead (X = -48 to -42)
  const bulkFront = { x: -48, y: -26, w: 6, d: 52, r: 3 };
  put("case_upper", [-45, 0, 4], S(k.slabOf(bulkFront, -16, 40, P, 3, 0.6), { tone: "mid" }));

  // Top structural spine bar flanking inspection cutaway (Y = -26 to -18)
  const spineBar = { x: -42, y: -26, w: 108, d: 8, r: 2 };
  put("case_upper", [12, -22, 22], S(k.slabOf(spineBar, 20, 8, P, 2, 0.5), { tone: "hi" }));

  // Rear Tail Extension Housing (X = 72 to 96, tapering towards output seal)
  const F_tail = G.frameAlong([84, MAIN_Y, MAIN_Z], [1, 0, 0]);
  put("tail_housing", [84, MAIN_Y, MAIN_Z], S(G.disc(72, 88, 18.0, F_tail, P), { tone: "mid" }));
  put("tail_housing", [84, MAIN_Y, MAIN_Z], S(G.disc(88, 96, 14.0, F_tail, P), { tone: "hi" }));
  put("tail_housing", [96, MAIN_Y, MAIN_Z], L(G.circleOf(F_tail, 96, 14.0, P, 28), { tone: "lo" }));
}

// Build all transmission systems
buildStand();
buildClutchAndBellhousing();
buildInputShaft();
buildCountershaft();
buildMainshaft();
buildSpeedGears();
buildSynchronizers();
buildReverseIdler();
buildShiftForks();
buildShifter();
buildCasing();

A.settle(R, P);
items.sort((a, b) => a.key - b.key);

const groups = items.map((item, index) => {
  const [mx, my, mz] = item.move;
  return `<g class="it" data-piece="${item.piece}"${item.ride !== item.piece ? ` data-ride="${item.ride}"` : ""}${item.role ? ` data-role="${item.role}"` : ""} data-k="${item.key.toFixed(2)}" data-m="${mx.toFixed(1)},${my.toFixed(1)},${mz.toFixed(1)}" data-i="${index}">${item.svg}</g>`;
});

const back = `<g class="gearbox-back-grid">${k.lineSvg(k.planOutline(k.insetPlan(BASE, 2), BASE_TOP_Z, P), { tone: "faint" })}</g>`;
const backSvg = k.figureSvg({ width: W, height: H, label: "Manual Gearbox on Dyno Stand", body: back, className: "gearbox-back" });
const frontSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg gearbox-front" viewBox="0 0 ${W} ${H}" aria-hidden="true"><g class="gearbox-engine">${groups.join("")}</g></svg>`;

const unit = (vector) => {
  const o = at([0, 0, 0]);
  const p = at(vector);
  return [p[0] - o[0], p[1] - o[1]];
};

const uY = unit([0, 1, 0]);
const uZ = unit([0, 0, 1]);

// Screen centers for rotating gear dots
const shaftCenters = {
  input: at([-37, MAIN_Y, MAIN_Z]),
  counter: at([-37, COUNT_Y, COUNT_Z]),
  output: at([96, MAIN_Y, MAIN_Z]),
  gear1: at([38, MAIN_Y, MAIN_Z]),
  gear2: at([7, MAIN_Y, MAIN_Z]),
  gear3: at([-7, MAIN_Y, MAIN_Z]),
  gear5: at([67, MAIN_Y, MAIN_Z]),
  gearR: at([50, MAIN_Y, MAIN_Z]),
};

// Torque flow paths for WebGL shader
const torqueRoutes = {
  input: [
    [-72, MAIN_Y, MAIN_Z],
    [-37, MAIN_Y, MAIN_Z],
  ],
  counter: [
    [-37, COUNT_Y, COUNT_Z],
    [67, COUNT_Y, COUNT_Z],
  ],
  output: [
    [-22, MAIN_Y, MAIN_Z],
    [96, MAIN_Y, MAIN_Z],
  ],
};

const meshPoints = {
  1: [38, (MAIN_Y + COUNT_Y) / 2, (MAIN_Z + COUNT_Z) / 2],
  2: [7, (MAIN_Y + COUNT_Y) / 2, (MAIN_Z + COUNT_Z) / 2],
  3: [-7, (MAIN_Y + COUNT_Y) / 2, (MAIN_Z + COUNT_Z) / 2],
  4: [-22, MAIN_Y, MAIN_Z], // Direct drive clutch mesh point
  5: [67, (MAIN_Y + COUNT_Y) / 2, (MAIN_Z + COUNT_Z) / 2],
  R: [50, IDLER_Y, IDLER_Z],
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
  shaftCenters,
  torqueRoutes,
  meshPoints,
};

// Controls and Legend Elements
const corners = `<div class="iso-plate-corners" aria-hidden="true"><span class="iso-plate-corner" data-corner="fig">Fig 1</span><span class="iso-plate-corner" data-corner="title">5-Speed Manual Gearbox · Synchromesh Dyno</span><span class="iso-plate-corner" data-corner="readout" data-readout>1st GEAR · 3.36:1 · 2,400 RPM → 714 RPM · 1,226 N·m</span></div>`;

const controls = `<div class="gearbox-controls">
  <div class="gearbox-btn-group">
    <button type="button" class="gearbox-btn" data-run><span class="gearbox-lamp" aria-hidden="true"></span><span data-run-label>Run Motor</span></button>
    <button type="button" class="gearbox-btn" data-clutch><span data-clutch-label>Clutch: Engaged</span></button>
    <button type="button" class="gearbox-btn" data-apart><span class="gearbox-lamp" aria-hidden="true"></span><span data-apart-label>Explode</span></button>
    <button type="button" class="gearbox-btn" data-xray><span class="gearbox-lamp" aria-hidden="true"></span><span data-xray-label>Gears X-Ray</span></button>
  </div>
  <span class="gearbox-hint">Shift [1–5, R, N] · [C] Clutch · [Space] Motor · [X] X-Ray · [E] Explode</span>
  <span class="gearbox-live" aria-live="polite" data-live></span>
</div>`;

// Interactive H-Gate Shifter Console
const hGate = `<div class="gearbox-console">
  <div class="gearbox-hgate-wrap">
    <span class="gearbox-gate-label">H-Pattern Shift Console</span>
    <div class="gearbox-hgate">
      <button type="button" class="gearbox-shift-btn" data-gear="R"><span class="gearbox-shift-name">R</span><span class="gearbox-shift-ratio">-3.28</span></button>
      <button type="button" class="gearbox-shift-btn" data-active data-gear="1"><span class="gearbox-shift-name">1</span><span class="gearbox-shift-ratio">3.36</span></button>
      <button type="button" class="gearbox-shift-btn" data-gear="2"><span class="gearbox-shift-name">2</span><span class="gearbox-shift-ratio">2.07</span></button>
      <button type="button" class="gearbox-shift-btn" data-gear="3"><span class="gearbox-shift-name">3</span><span class="gearbox-shift-ratio">1.35</span></button>
      <button type="button" class="gearbox-shift-btn" data-gear="4"><span class="gearbox-shift-name">4</span><span class="gearbox-shift-ratio">1.00</span></button>
      <button type="button" class="gearbox-shift-btn" data-gear="5"><span class="gearbox-shift-name">5</span><span class="gearbox-shift-ratio">0.75</span></button>
      <button type="button" class="gearbox-shift-btn" data-gear="N"><span class="gearbox-shift-name">N</span><span class="gearbox-shift-ratio">FREE</span></button>
    </div>
  </div>
  <div class="gearbox-telemetry">
    <div class="gearbox-telem-item"><span class="gearbox-telem-label">Selected</span><span class="gearbox-telem-val" data-telem-gear>1st Gear</span></div>
    <div class="gearbox-telem-item"><span class="gearbox-telem-label">Gear Ratio</span><span class="gearbox-telem-val" data-telem-ratio>3.36:1</span></div>
    <div class="gearbox-telem-item"><span class="gearbox-telem-label">Input Speed</span><span class="gearbox-telem-val" data-telem-inrpm>2,400 RPM</span></div>
    <div class="gearbox-telem-item"><span class="gearbox-telem-label">Output Speed</span><span class="gearbox-telem-val" data-telem-outrpm>714 RPM</span></div>
    <div class="gearbox-telem-item"><span class="gearbox-telem-label">Delivered Torque</span><span class="gearbox-telem-val" data-telem-torque>1,226 N·m (92 kW)</span></div>
  </div>
</div>`;

const rpmBar = `<div class="gearbox-rpm-bar">
  <span>ENGINE THROTTLE: 800 RPM</span>
  <input type="range" class="gearbox-rpm-slider" min="800" max="6000" value="2400" step="50" aria-label="Throttle engine input RPM (800 to 6000 RPM)">
  <span>6,000 RPM</span>
</div>`;

const partsBtns = ORDER_DISPLAY.map(
  (id, index) =>
    `<button type="button" class="gearbox-part-btn" data-part="${id}"><span class="gearbox-part-num">${String(index + 1).padStart(2, "0")}</span>${PIECES[id].name}</button>`
).join("");

const stage = `<div class="gearbox-stage" tabindex="0" role="slider" aria-label="5-Speed manual transmission with constant-mesh synchromesh gears: shift gears 1-5, N, R, press C for clutch, E for explode view, X for X-ray view" aria-valuemin="0" aria-valuemax="5" aria-valuenow="1" aria-valuetext="1st Gear Selected">
  ${backSvg}
  ${frontSvg}
  <canvas class="gearbox-flow-canvas" aria-hidden="true"></canvas>
</div>`;

const caption =
  "A 5-speed constant-mesh synchromesh manual transmission on an instrumented test stand. Torque from the engine enters through the clutch disc into the input shaft, which permanently drives the parallel cluster countershaft (layshaft). Freewheeling speed gears ride on needle bearings on the central mainshaft in constant mesh with the countershaft gears. When shifting (1st–5th, R), the shift fork slides a synchronizer sleeve axially; the brass baulk ring's friction cone synchronizes the gear's rotational speed to the mainshaft before dog teeth lock into positive engagement. In 4th gear, the sleeve locks directly to the input shaft for 1:1 direct drive with zero countershaft torque loss; 5th gear provides 0.75:1 overdrive; Reverse utilizes an intermediate spur idler to invert shaft rotation.";

const body = `<figure class="iso-figure gearbox">
  <div class="iso-plate">${corners}${stage}${controls}</div>
  <figcaption class="iso-legend">
    ${hGate}
    ${rpmBar}
    <div class="gearbox-parts">${partsBtns}</div>
    <span class="iso-caption">${caption}</span>
  </figcaption>
</figure>`;

const CSS = readFileSync(join(HERE, "gearbox.css"), "utf8");
const LIVE = readFileSync(join(HERE, "gearbox-live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));

const page = k.pageHtml({
  title: "Manual Gearbox — Anatomy",
  theme: THEME,
  body: `<style>${CSS}</style>${body}`,
  script: kitScript() + glScript() + LIVE,
  width: 980,
});

const outName = THEME === "light" ? "gearbox-light.html" : "gearbox.html";
writeFileSync(join(HERE, outName), page);
console.log("wrote", outName, `${(page.length / 1024).toFixed(0)} KB`, `${items.length} items`);
