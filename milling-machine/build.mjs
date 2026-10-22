import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../.agents/skills/anatomy/kit/iso-kit.mjs";
import { kitScript } from "../.agents/skills/anatomy/scripts/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";

const WIDTH = 660;
const HEIGHT = 460;

// Coordinate System (World Units, approx mm):
// X: Table longitudinal travel (-left, +right)
// Y: Saddle cross travel (-front toward viewer, +back toward column)
// Z: Spindle head vertical travel (+up, -down into workpiece)

// BASE & BED
const BED = { x: -130, y: -65, w: 260, d: 135, r: 8 };
const BED_H = 14;
const FOOT_H = 5;

// COLUMN (Stationary structure at rear)
const COL_BASE = { x: -64, y: 30, w: 128, d: 42, r: 5 };
const COL_TOWER = { x: -56, y: 35, w: 112, d: 36, r: 4 };
const COL_TOP = 185;

// SADDLE (Y-axis cross slide)
const SADDLE = { x: -58, y: -34, w: 116, d: 68, r: 4 };
const SADDLE_H = 14;
const SADDLE_Z = 4;

// TABLE (X-axis longitudinal work table)
const TABLE = { x: -96, y: -26, w: 192, d: 52, r: 3 };
const TABLE_H = 11;
const TABLE_Z = SADDLE_Z + SADDLE_H + 4; // Z = 22, top at Z = 33

// VISE (Workholding on table center T-slot)
const VISE_BASE = { x: -34, y: -20, w: 68, d: 40, r: 2 };
const VISE_H = 8; // Z = 33 to 41
const JAW_REAR = { x: -30, y: 5, w: 60, d: 12, r: 1.5 }; // Z = 41 to 54
const JAW_FRONT = { x: -30, y: -17, w: 60, d: 12, r: 1.5 }; // Z = 41 to 54

// WORKPIECE (Aluminum 6061 billet clamped in vise jaws)
const BILLET = { x: -25, y: -3, w: 50, d: 8, r: 0.8 };
const BILLET_Z = 42;
const BILLET_H = 16; // Top at Z = 58

// SPINDLE HEAD (Z-axis carriage)
const HEAD = { x: -30, y: 14, w: 60, d: 22, r: 3 };
const HEAD_H = 50;
const HEAD_BASE_Z = 115; // default resting Z position
const SPINDLE_CENTER = [0, 5];

// DRO PENDANT (Control arm and display console)
const PENDANT_BOX = { x: 74, y: -34, w: 42, d: 24, r: 3 };
const PENDANT_Z = 85;
const PENDANT_H = 34;

// Bounding points for camera fitting
const BOUNDS = [
  ...k.boxCorners(BED, -BED_H - FOOT_H, 0),
  ...k.boxCorners(COL_TOWER, 0, COL_TOP + 35),
  ...k.boxCorners(TABLE, TABLE_Z, TABLE_Z + TABLE_H + 30),
  ...k.boxCorners(PENDANT_BOX, PENDANT_Z, PENDANT_Z + PENDANT_H + 10),
  [0, 5, HEAD_BASE_Z + HEAD_H + 35],
  [-118, -60, 0],
  [118, -60, 0],
];

const P = k.fitProjection(BOUNDS, WIDTH, HEIGHT, {
  pad: 26,
  azimuth: 42,
  elevation: 30,
});

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const byDepth = (points) =>
  [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));

// 1. MACHINE BASE & LEVELING FEET
function baseBed() {
  const out = [];
  // Halo underneath bed
  out.push(`<path class="iso-halo" d="${k.haloOf(BED, -BED_H - FOOT_H, BED_H, P)}"/>`);

  // Leveling feet at 4 corners
  for (const [x, y] of byDepth(k.corners(BED, 18))) {
    out.push(S(k.cylinder(x, y, 7, -BED_H - FOOT_H, 2.2, P, 24), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.2, -BED_H - FOOT_H + 2.2, FOOT_H - 2.2, P, 24), { tone: "mid" }));
    out.push(L(k.sideArc(x, y, 5.2, -BED_H - FOOT_H + 3.6, P, 16), { tone: "lo" }));
  }

  // Cast iron machine bed casting
  out.push(S(k.slabOf(BED, -BED_H, BED_H, P, 8, 1.4), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(BED, 5), 0, P), { tone: "lo" }));

  // Foundation anchor bolts at corners
  const bolts = k.corners(BED, 10);
  out.push(L(bolts.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(bolts.map(([x, y]) => at([x, y, 0])), { size: 0.5, tone: "hi" }));

  // Chip basin / drain trough in bed
  const basin = { x: -82, y: -44, w: 164, d: 74, r: 4 };
  out.push(S(k.slabOf(basin, 0, 1.2, P, 4), { tone: "lo", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(basin, 2), 1.2, P), { tone: "faint" }));

  // Machine serial / spec plate at front-left
  const badge = { x: -118, y: -58, w: 30, d: 12, r: 1 };
  out.push(S(k.slabOf(badge, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(badge, 1.2), 0.6, P), { tone: "faint" }));
  out.push(
    L(k.lineOnTop([-115, -55], [-94, -55], 0.6, P), { tone: "lo", free: true }),
    L(k.lineOnTop([-115, -52], [-100, -52], 0.6, P), { tone: "lo", free: true }),
    L(k.lineOnTop([-115, -49], [-104, -49], 0.6, P), { tone: "lo", free: true }),
  );
  out.push(
    D(
      [
        at([-116, -56.5, 0.6]),
        at([-90, -56.5, 0.6]),
        at([-116, -47.5, 0.6]),
        at([-90, -47.5, 0.6]),
      ],
      { size: 0.35, tone: "mid" },
    ),
  );

  // Y-axis linear guide rails on bed
  for (const x of [-40, 36]) {
    const rail = { x, y: -45, w: 6, d: 72, r: 0.8 };
    out.push(S(k.slabOf(rail, 1.2, 3.6, P, 3, 0.4), { tone: "hi" }));
    // Ground guide groove along face
    out.push(L(k.lineOnTop([x + 3, -45], [x + 3, 27], 4.8, P), { tone: "lo" }));
    // Rail mounting bolt countersinks
    const railDots = [-35, -15, 5].map((ry) => at([x + 3, ry, 4.8]));
    out.push(D(railDots, { size: 0.4, tone: "mid" }));
  }

  // Y-axis drive ball screw along center of bed
  out.push(S(k.cylinder(0, -10, 2.4, 1.2, 3.2, P, 16), { tone: "mid" }));
  out.push(L(k.segment([0, -45, 3], [0, 27, 3], P), { tone: "mid" }));

  // Y-axis front servo mount bracket & motor
  const yServoBracket = { x: -16, y: -62, w: 32, d: 14, r: 2 };
  out.push(S(k.slabOf(yServoBracket, 1.2, 14, P, 4, 0.8), { tone: "mid" }));
  out.push(S(k.cylinder(0, -55, 7, 15.2, 12, P, 28, 0.6), { tone: "mid" }));
  for (let yz = 18; yz <= 25; yz += 3.5) out.push(L(k.sideArc(0, -55, 7, yz, P, 20), { tone: "lo" }));
  out.push(S(k.cylinder(0, -55, 4.8, 27.2, 5, P, 20), { tone: "hi" }));
  out.push(D([at([0, -55, 32.2])], { size: 0.45, tone: "hi" }));

  return out.join("");
}

// 2. VERTICAL COLUMN STRUCTURE & Z-AXIS RAILS
function columnStructure() {
  const out = [];

  // Stepped column base
  out.push(S(k.slabOf(COL_BASE, 0, 14, P, 5, 1.2), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(COL_BASE, 3), 14, P), { tone: "faint" }));

  // Main column vertical upright
  out.push(S(k.slabOf(COL_TOWER, 14, COL_TOP - 14, P, 6, 1.4), { tone: "mid" }));

  // Column seam line wrapping around visible corners
  const colSeam = k.sideSeam(COL_TOWER, 85, P, 6);
  out.push(L(colSeam, { tone: "faint" }));

  // Side inspection cover plate on column left/right
  const panel = { x: 56.2, y: 40, w: 0.4, d: 24, r: 1 };
  out.push(S(k.slabOf(panel, 40, 60, P, 2), { tone: "lo", crease: "none" }));
  out.push(
    D(
      [
        at([56.4, 43, 44]),
        at([56.4, 61, 44]),
        at([56.4, 43, 96]),
        at([56.4, 61, 96]),
      ],
      { size: 0.4, tone: "mid" },
    ),
  );

  // Dual vertical Z-axis linear guide rails on column front face (Y = 35)
  for (const x of [-26, 20]) {
    const rail = { x, y: 31, w: 6, d: 4, r: 0.8 };
    out.push(S(k.slabOf(rail, 20, COL_TOP - 26, P, 3, 0.4), { tone: "hi" }));
    // Ground guide groove along face
    out.push(L(k.rise([x + 3, 31], 20, COL_TOP - 6, P), { tone: "lo" }));
    // Mounting bolt countersink dots along rail
    const boltZs = [30, 55, 80, 105, 130, 155];
    out.push(D(boltZs.map((z) => at([x + 3, 31, z])), { size: 0.38, tone: "mid" }));
  }

  // Z-axis precision ball screw running down between rails
  out.push(S(k.cylinder(0, 33, 2.5, 20, COL_TOP - 26, P, 20), { tone: "hi", crease: "none" }));
  // Thread pitch grooves ending exactly on cylinder silhouette
  for (let z = 32; z <= COL_TOP - 32; z += 12) {
    out.push(L(k.sideArc(0, 33, 2.5, z, P, 16), { tone: "mid" }));
  }

  // Top servo bracket & motor on column top (Z = 185)
  const zMotorBracket = { x: -16, y: 40, w: 32, d: 24, r: 2 };
  out.push(S(k.slabOf(zMotorBracket, COL_TOP, 6, P, 4, 0.6), { tone: "mid" }));
  // Z-axis AC servo motor
  out.push(S(k.cylinder(0, 52, 9, COL_TOP + 6, 24, P, 32, 0.8), { tone: "mid" }));
  for (let mz = COL_TOP + 11; mz <= COL_TOP + 25; mz += 4.5) out.push(L(k.sideArc(0, 52, 9, mz, P, 24), { tone: "lo" }));
  // Servo encoder cap
  out.push(S(k.cylinder(0, 52, 6.4, COL_TOP + 30, 8, P, 24, 0.5), { tone: "hi" }));
  out.push(D([at([0, 52, COL_TOP + 38])], { size: 0.5, tone: "lit" }));

  // Articulated DRO pendant swing arm extending from column
  out.push(S(k.cylinder(56, 44, 4.5, 118, 8, P, 20), { tone: "mid" }));
  // Horizontal arm section
  out.push(S(k.slabOf({ x: 56, y: 42, w: 22, d: 5, r: 1 }, 120, 4, P, 2), { tone: "mid" }));
  // Elbow joint
  out.push(S(k.cylinder(78, 44, 4, 116, 10, P, 20), { tone: "mid" }));
  // Forward arm section extending toward pendant console
  out.push(S(k.slabOf({ x: 76, y: -16, w: 5, d: 60, r: 1 }, 118, 4, P, 2), { tone: "mid" }));
  // Vertical drop into pendant
  out.push(S(k.cylinder(78, -14, 3.5, 100, 20, P, 16), { tone: "mid" }));

  return out.join("");
}

// 3. Z-AXIS SPINDLE HEAD CARRIAGE & ROTATING SPINDLE TOOL
function spindleHead() {
  const out = [];

  // Spindle carriage main body casting (sliding on column rails)
  out.push(S(k.slabOf(HEAD, HEAD_BASE_Z, HEAD_H, P, 5, 1.2), { tone: "mid" }));

  // Linear slider guide trucks (bearing runner blocks) on rails at rear
  for (const x of [-28, 18]) {
    for (const z of [HEAD_BASE_Z + 6, HEAD_BASE_Z + 32]) {
      const truck = { x, y: 28, w: 10, d: 6, r: 1 };
      out.push(S(k.slabOf(truck, z, 14, P, 3, 0.4), { tone: "hi" }));
      out.push(D([at([x + 5, 28, z + 7])], { size: 0.4, tone: "mid" })); // grease zerk
    }
  }

  // Recirculating ball nut housing in center engaging Z-screw
  const ballNut = { x: -8, y: 28, w: 16, d: 8, r: 1 };
  out.push(S(k.slabOf(ballNut, HEAD_BASE_Z + 16, 18, P, 3, 0.5), { tone: "hi" }));

  // Spindle AC motor on top of head carriage
  const motorMount = { x: -14, y: 16, w: 28, d: 18, r: 2 };
  out.push(S(k.slabOf(motorMount, HEAD_BASE_Z + HEAD_H, 4, P, 3, 0.5), { tone: "mid" }));
  out.push(S(k.cylinder(0, 25, 10, HEAD_BASE_Z + HEAD_H + 4, 25, P, 32, 0.8), { tone: "mid" }));
  for (let smz = HEAD_BASE_Z + HEAD_H + 9; smz <= HEAD_BASE_Z + HEAD_H + 24; smz += 5) out.push(L(k.sideArc(0, 25, 10, smz, P, 24), { tone: "lo" }));
  // Pneumatic tool unclamp cylinder on top of motor
  out.push(S(k.cylinder(0, 25, 6, HEAD_BASE_Z + HEAD_H + 29, 8, P, 24, 0.6), { tone: "hi" }));

  // Heavy forward quill housing block
  const quillBlock = { x: -20, y: -5, w: 40, d: 20, r: 3 };
  out.push(S(k.slabOf(quillBlock, HEAD_BASE_Z, 34, P, 4, 1.0), { tone: "mid" }));

  // Spindle cartridge sleeve extending down
  const [sx, sy] = SPINDLE_CENTER;
  out.push(S(k.cylinder(sx, sy, 13, HEAD_BASE_Z - 21, 21, P, 36, 0.6), { tone: "mid" }));
  for (let qz = HEAD_BASE_Z - 18; qz <= HEAD_BASE_Z - 6; qz += 4) out.push(L(k.sideArc(sx, sy, 13, qz, P, 28), { tone: "lo" }));

  // Spindle nose flange with labyrinth air purge ring
  out.push(S(k.cylinder(sx, sy, 15, HEAD_BASE_Z - 27, 6, P, 36, 0.8), { tone: "hi" }));
  out.push(L(k.ring(sx, sy, 15, HEAD_BASE_Z - 27, P, 36), { tone: "lo" }));

  // Rotating spindle rotor core & drive dogs
  out.push(S(k.cylinder(sx, sy, 11, HEAD_BASE_Z - 30, 3, P, 28), { tone: "hi" }));

  // BT30 Tool Holder:
  // ATC gripper flange with V-groove
  out.push(S(k.cylinder(sx, sy, 11.5, HEAD_BASE_Z - 37, 7, P, 32, 0.5), { tone: "hi" }));
  out.push(L(k.sideArc(sx, sy, 11.5, HEAD_BASE_Z - 34, P, 24), { tone: "faint" })); // V-groove line
  // Taper shank transition
  out.push(S(k.cylinder(sx, sy, 8.5, HEAD_BASE_Z - 43, 6, P, 28, 0.5), { tone: "hi" }));
  // ER-32 Collet chuck clamping nut
  out.push(S(k.cylinder(sx, sy, 9.2, HEAD_BASE_Z - 49, 6, P, 28, 0.6), { tone: "hi" }));
  out.push(L(k.sideArc(sx, sy, 9.2, HEAD_BASE_Z - 46, P, 20), { tone: "mid" }));

  // Solid Carbide 4-Flute End Mill Tool:
  // Cylindrical shank gripped by collet
  out.push(S(k.cylinder(sx, sy, 3.2, HEAD_BASE_Z - 55, 6, P, 20), { tone: "hi" }));
  // 4-Flute cutting flute section - LIT ACCENT!
  // At HEAD_BASE_Z = 115, tool flutes are from Z = 55.5 to 60.5
  out.push(S(k.cylinder(sx, sy, 3.2, HEAD_BASE_Z - 60.5, 5.5, P, 24), { tone: "lit", lit: true }));
  // Flute spiral relief marks ending on cylinder outline
  out.push(L(k.sideArc(sx, sy, 3.2, HEAD_BASE_Z - 57, P, 16), { tone: "lit" }));
  out.push(L(k.sideArc(sx, sy, 3.2, HEAD_BASE_Z - 59, P, 16), { tone: "lit" }));

  // Coolant manifold block & articulated Loc-Line nozzles on spindle head
  const manifold = { x: 18, y: -2, w: 8, d: 8, r: 1.5 };
  out.push(S(k.slabOf(manifold, HEAD_BASE_Z + 4, 9, P, 3, 0.5), { tone: "mid" }));
  // Valve lever
  out.push(S(k.slabOf({ x: 20, y: 5, w: 4, d: 3, r: 0.8 }, HEAD_BASE_Z + 8, 3, P, 2), { tone: "hi" }));

  // Articulated Loc-Line segmented hoses curving to cutter contact
  // Nozzle 1 (left side)
  const n1Pts = [
    [18, 0, HEAD_BASE_Z + 4],
    [14, 2, HEAD_BASE_Z - 12],
    [9, 4, HEAD_BASE_Z - 30],
    [5, 5, HEAD_BASE_Z - 48],
  ];
  for (const pt of n1Pts) {
    out.push(S(k.cylinder(pt[0], pt[1], 1.8, pt[2], 2.8, P, 14), { tone: "mid" }));
  }
  // Jet nozzle tip 1
  out.push(S(k.cylinder(4.2, 5.2, 1.2, HEAD_BASE_Z - 51, 3, P, 12), { tone: "hi" }));

  // Nozzle 2 (right side)
  const n2Pts = [
    [21, -3, HEAD_BASE_Z + 4],
    [17, -2, HEAD_BASE_Z - 14],
    [10, 0, HEAD_BASE_Z - 32],
    [5, 2, HEAD_BASE_Z - 50],
  ];
  for (const pt of n2Pts) {
    out.push(S(k.cylinder(pt[0], pt[1], 1.8, pt[2], 2.8, P, 14), { tone: "mid" }));
  }
  // Jet nozzle tip 2
  out.push(S(k.cylinder(4.2, 2.2, 1.2, HEAD_BASE_Z - 53, 3, P, 12), { tone: "hi" }));

  // Directional coolant fluid jets landing on tool flutes
  out.push(
    L(k.segment([4.2, 5.2, HEAD_BASE_Z - 51], [sx + 1.6, sy + 1.2, HEAD_BASE_Z - 58], P), {
      tone: "blue",
      dashed: true,
    }),
  );
  out.push(
    L(k.segment([4.2, 2.2, HEAD_BASE_Z - 53], [sx + 1.6, sy - 0.8, HEAD_BASE_Z - 58], P), {
      tone: "blue",
      dashed: true,
    }),
  );

  return out.join("");
}

// 4. Y-AXIS SADDLE (CROSS-SLIDE)
function saddleCrossSlide() {
  const out = [];

  // Saddle main casting
  out.push(S(k.slabOf(SADDLE, SADDLE_Z, SADDLE_H, P, 6, 1.2), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(SADDLE, 3), SADDLE_Z + SADDLE_H, P), { tone: "faint" }));

  // Front brass way wiper plate & screws
  const wiper = { x: -50, y: SADDLE.y, w: 100, d: 2, r: 0.8 };
  out.push(S(k.slabOf(wiper, SADDLE_Z + 1, 4, P, 2), { tone: "hi", crease: "none" }));
  out.push(
    D(
      [-40, -20, 0, 20, 40].map((wx) => at([wx, SADDLE.y + 0.8, SADDLE_Z + 3])),
      { size: 0.35, tone: "mid" },
    ),
  );

  // Top X-axis linear guide rails mounted on saddle
  for (const y of [-20, 14]) {
    const rail = { x: -52, y, w: 104, d: 5, r: 0.8 };
    out.push(S(k.slabOf(rail, SADDLE_Z + SADDLE_H, 4, P, 3, 0.4), { tone: "hi" }));
    out.push(L(k.lineOnTop([-52, y + 2.5], [52, y + 2.5], SADDLE_Z + SADDLE_H + 4, P), { tone: "lo" }));
    // Rail mounting bolt countersinks
    const dots = [-36, -18, 0, 18, 36].map((rx) => at([rx, y + 2.5, SADDLE_Z + SADDLE_H + 4]));
    out.push(D(dots, { size: 0.38, tone: "mid" }));
  }

  // X-axis ball screw in center of saddle
  out.push(S(k.cylinder(0, -3, 2.2, SADDLE_Z + SADDLE_H, 3.2, P, 16), { tone: "mid" }));
  out.push(L(k.segment([-52, -3, SADDLE_Z + SADDLE_H + 2], [52, -3, SADDLE_Z + SADDLE_H + 2], P), { tone: "mid" }));

  return out.join("");
}

// 5. X-AXIS WORK TABLE
function workTable() {
  const out = [];

  // Main ground steel work table slab
  out.push(S(k.slabOf(TABLE, TABLE_Z, TABLE_H, P, 6, 1.2), { tone: "hi", bevel: 0.8 }));

  // Three precision machined T-slots along table top (Z = TABLE_Z + TABLE_H = 33)
  const tableTop = TABLE_Z + TABLE_H;
  for (const ty of [-14, 0, 14]) {
    // Closed T-slot channel outline (closed path = 0 floating line ends!)
    out.push(
      L(k.planOutline({ x: TABLE.x + 4, y: ty - 1.8, w: TABLE.w - 8, d: 3.6, r: 0.8 }, tableTop, P), {
        tone: "lo",
      }),
      // Inner undercut line running full length of channel
      L(k.lineOnTop([TABLE.x + 5, ty], [TABLE.x + TABLE.w - 5, ty], tableTop, P), { tone: "faint" }),
    );
  }

  // Graduated metric ruler strip on front edge of table
  const ruler = { x: -85, y: TABLE.y + 0.8, w: 170, d: 5, r: 0.5 };
  out.push(S(k.slabOf(ruler, tableTop, 0.4, P, 2), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(ruler.x + 2, ruler.x + ruler.w - 2, 4, 5, ruler.y + 0.6, tableTop + 0.4, [1.4, 2.8], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));

  // Left end bearing support block
  const leftEnd = { x: TABLE.x - 4, y: TABLE.y + 2, w: 4, d: TABLE.d - 4, r: 1.2 };
  out.push(S(k.slabOf(leftEnd, TABLE_Z, TABLE_H, P, 3, 0.5), { tone: "mid" }));
  out.push(D([at([leftEnd.x + 2, leftEnd.y + 10, tableTop]), at([leftEnd.x + 2, leftEnd.y + leftEnd.d - 10, tableTop])], { size: 0.4 }));

  // Right end cap with X-axis servo motor
  const rightEnd = { x: TABLE.x + TABLE.w, y: TABLE.y + 2, w: 4, d: TABLE.d - 4, r: 1.2 };
  out.push(S(k.slabOf(rightEnd, TABLE_Z, TABLE_H, P, 3, 0.5), { tone: "mid" }));
  // X-axis servo housing
  const xServo = { x: rightEnd.x + 4, y: -10, w: 18, d: 20, r: 2 };
  out.push(S(k.slabOf(xServo, TABLE_Z + 1, 9, P, 3, 0.6), { tone: "mid" }));
  out.push(S(k.cylinder(xServo.x + 9, 0, 5, TABLE_Z + 10, 4, P, 20), { tone: "hi" }));
  out.push(D([at([xServo.x + 9, 0, TABLE_Z + 14])], { size: 0.45, tone: "lit" }));

  return out.join("");
}

// 6. PRECISION MILLING VISE (WORKHOLDING)
function precisionVise() {
  const out = [];
  const tableTop = TABLE_Z + TABLE_H; // Z = 33

  // Vise base plate keyed to center T-slot
  out.push(S(k.slabOf(VISE_BASE, tableTop, VISE_H, P, 4, 0.8), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(VISE_BASE, 2), tableTop + VISE_H, P), { tone: "faint" }));

  // T-slot forged toe clamps at left and right of vise base
  for (const cx of [VISE_BASE.x - 5, VISE_BASE.x + VISE_BASE.w]) {
    const clamp = { x: cx, y: -4, w: 5, d: 8, r: 0.8 };
    out.push(S(k.slabOf(clamp, tableTop, 5, P, 2, 0.4), { tone: "hi" }));
    // Hex clamping nut on top of clamp
    out.push(S(k.cylinder(cx + 2.5, 0, 1.8, tableTop + 5, 2.5, P, 6), { tone: "hi" }));
  }

  // Vise stationary rear jaw body
  out.push(S(k.slabOf(JAW_REAR, tableTop + VISE_H, 13, P, 4, 0.6), { tone: "mid" }));
  // Hardened ground jaw plate (rear)
  const rearPlate = { x: -28, y: JAW_REAR.y, w: 56, d: 2.2, r: 0.5 };
  out.push(S(k.slabOf(rearPlate, tableTop + VISE_H + 1, 11, P, 2), { tone: "hi", crease: "none" }));
  out.push(
    D(
      [
        at([-18, rearPlate.y + 1, tableTop + VISE_H + 6]),
        at([18, rearPlate.y + 1, tableTop + VISE_H + 6]),
      ],
      { size: 0.4, tone: "mid" },
    ),
  );

  // Vise sliding movable front jaw body
  out.push(S(k.slabOf(JAW_FRONT, tableTop + VISE_H, 13, P, 4, 0.6), { tone: "mid" }));
  // Hardened ground jaw plate (front)
  const frontPlate = { x: -28, y: JAW_FRONT.y + JAW_FRONT.d - 2.2, w: 56, d: 2.2, r: 0.5 };
  out.push(S(k.slabOf(frontPlate, tableTop + VISE_H + 1, 11, P, 2), { tone: "hi", crease: "none" }));
  out.push(
    D(
      [
        at([-18, frontPlate.y + 1, tableTop + VISE_H + 6]),
        at([18, frontPlate.y + 1, tableTop + VISE_H + 6]),
      ],
      { size: 0.4, tone: "mid" },
    ),
  );

  // Vise lead screw channel & hex drive socket at front of movable jaw
  out.push(S(k.slabOf({ x: -4, y: JAW_FRONT.y - 4, w: 8, d: 4, r: 1 }, tableTop + VISE_H + 2, 8, P, 2), { tone: "mid" }));
  out.push(S(k.cylinder(0, JAW_FRONT.y - 4, 2.8, tableTop + VISE_H + 4, 4, P, 6), { tone: "lo" })); // Hex drive socket

  return out.join("");
}

// 7. WORKPIECE BILLET & MILLED POCKET
function workpieceBillet() {
  const out = [];

  // Raw aluminum 6061 billet clamped in jaws (Z = 42 to 58)
  out.push(S(k.slabOf(BILLET, BILLET_Z, BILLET_H, P, 4, 0.6), { tone: "hi", crease: "faint" }));

  // Raw stock top surface grain lines running full edge-to-edge
  out.push(
    L(k.lineOnTop([BILLET.x, BILLET.y + 2.5], [BILLET.x + BILLET.w, BILLET.y + 2.5], BILLET_Z + BILLET_H, P), {
      tone: "faint",
    }),
    L(k.lineOnTop([BILLET.x, BILLET.y + 5.5], [BILLET.x + BILLET.w, BILLET.y + 5.5], BILLET_Z + BILLET_H, P), {
      tone: "faint",
    }),
  );

  // Stepped Milled Slot / Shoulder Cutaway:
  // Shows material removed by the end mill! Depth of cut ap = 2.5 mm (from Z = 58 down to 55.5)
  // Pocket floor extends from X = -24 to X = 3
  const pocket = { x: -24, y: BILLET.y + 1, w: 27, d: 6, r: 0.8 };
  out.push(S(k.slabOf(pocket, BILLET_Z + BILLET_H - 2.5, 2.5, P, 2), { tone: "hi", crease: "lo" }));

  // Toolpath scallop marks on milled floor (circular feed ridges left by rotating flutes)
  for (let px = pocket.x + 3; px <= pocket.x + pocket.w - 3; px += 4) {
    out.push(L(k.sideArc(px, pocket.y + 3, 3, BILLET_Z + BILLET_H - 2.5, P, 14), { tone: "mid" }));
  }

  // Freshly milled vertical shoulder wall
  out.push(
    L(
      k.lineOnTop([pocket.x + pocket.w, pocket.y], [pocket.x + pocket.w, pocket.y + pocket.d], BILLET_Z + BILLET_H, P),
      { tone: "lit" },
    ),
  );

  return out.join("");
}

// 8. DYNAMIC CHIPS (SWARF) & CONTACT CUTTING INTERFACE
function cuttingAction() {
  const out = [];
  const zCut = HEAD_BASE_Z - 60.5; // cutter tip contact at Z = 54.5
  const contact = [SPINDLE_CENTER[0], SPINDLE_CENTER[1], zCut];

  // Swarf chip positions
  const chipPts = [
    [contact[0], contact[1], contact[2]],
    [contact[0] + 3, contact[1] + 3, contact[2] + 1],
    [contact[0] + 6, contact[1] + 5, contact[2] + 2],
    [contact[0] + 8, contact[1] + 4, contact[2] + 3],
  ];

  // Dots for curled chips
  out.push(D(chipPts.map(at), { size: 0.55, tone: "lit" }));

  // Chip arcs linking the dots together (each line ends on a dot = 0 floating line ends!)
  out.push(
    L(k.segment(chipPts[0], chipPts[1], P), { tone: "lit" }),
    L(k.segment(chipPts[1], chipPts[2], P), { tone: "lit" }),
    L(k.segment(chipPts[2], chipPts[3], P), { tone: "lit" }),
  );

  return out.join("");
}

// 9. CNC CONTROL PENDANT / DIGITAL READOUT (DRO)
function controlPendant() {
  const out = [];

  // Console pendant housing box
  out.push(S(k.slabOf(PENDANT_BOX, PENDANT_Z, PENDANT_H, P, 4, 1.0), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(PENDANT_BOX, 2), PENDANT_Z + PENDANT_H, P), { tone: "faint" }));

  // DRO LCD Screen window on top face of pendant
  const screen = { x: 77, y: -31, w: 36, d: 18, r: 1.2 };
  out.push(S(k.slabOf(screen, PENDANT_Z + PENDANT_H, 0.8, P, 3), { tone: "lo", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(screen, 0.8), PENDANT_Z + PENDANT_H + 0.8, P), { tone: "faint" }));

  // Live coordinate text on DRO face
  out.push(
    k.faceTextSvg(k.topMatrix([80, -26], PENDANT_Z + PENDANT_H + 0.8, P, "x"), "X +14.20", {
      size: 2.2,
      tone: "lit",
    }),
    k.faceTextSvg(k.topMatrix([80, -22], PENDANT_Z + PENDANT_H + 0.8, P, "x"), "Y  00.00", {
      size: 2.2,
      tone: "hi",
    }),
    k.faceTextSvg(k.topMatrix([80, -18], PENDANT_Z + PENDANT_H + 0.8, P, "x"), "Z -02.50", {
      size: 2.2,
      tone: "hi",
    }),
    k.faceTextSvg(k.topMatrix([80, -14], PENDANT_Z + PENDANT_H + 0.8, P, "x"), "8000 RPM", {
      size: 2.0,
      tone: "mid",
    }),
  );

  // E-STOP Mushroom Button (Emergency stop) - RED ACCENT!
  out.push(S(k.cylinder(82, -8, 3.2, PENDANT_Z + PENDANT_H, 2.5, P, 16), { tone: "hi" }));
  out.push(S(k.cylinder(82, -8, 4.6, PENDANT_Z + PENDANT_H + 2.5, 3.5, P, 20), { tone: "red" }));
  out.push(L(k.ring(82, -8, 4.6, PENDANT_Z + PENDANT_H + 6, P, 20), { tone: "red" }));

  // MPG (Manual Pulse Generator) Jog Handwheel
  out.push(S(k.cylinder(104, -20, 6, PENDANT_Z + PENDANT_H, 3.6, P, 28), { tone: "mid" }));
  out.push(L(k.sideArc(104, -20, 6, PENDANT_Z + PENDANT_H + 1.8, P, 20), { tone: "lo" }));
  // Index mark line connecting center dot to outer ring
  out.push(L(k.lineOnTop([104, -20], [110, -20], PENDANT_Z + PENDANT_H + 3.6, P), { tone: "lit" }));
  out.push(D([at([104, -20, PENDANT_Z + PENDANT_H + 3.6])], { size: 0.45, tone: "lit" }));

  // Tactile pushbuttons on pendant (Cycle Start, Feed Hold)
  out.push(S(k.cylinder(94, -8, 2.2, PENDANT_Z + PENDANT_H, 2.2, P, 14), { tone: "green" })); // Cycle Start
  out.push(S(k.cylinder(102, -8, 2.2, PENDANT_Z + PENDANT_H, 2.2, P, 14), { tone: "mid" })); // Feed Hold

  return out.join("");
}

// ASSEMBLE FULL SVG FIGURE
const startX = -12; // initial table position
const startY = 0;   // initial saddle position
const startZ = 0;   // initial head position offset

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "A 3-axis CNC vertical milling machine. A heavy cast bed on leveling feet supports a cross saddle (Y-axis) and longitudinal work table (X-axis) with precision T-slots. Clamped in a milling vise, an aluminum workpiece feeds past a high-speed spindle head (Z-axis) carrying a solid carbide 4-flute end mill. As the spinning tool plunges and the table traverses, sheared metal chips fly into the basin, dual coolant nozzles lubricate the cut, and a digital readout pendant displays live axis positions and feed parameters.",
  body: [
    // 1. Bed casting and feet
    baseBed(),

    // 2. Vertical column and Z-axis rails
    columnStructure(),

    // 3. Y-axis cross saddle (moves along Y)
    `<g data-part="saddle" transform="${k.translateAlong(P, [0, startY, 0])}">`,
    saddleCrossSlide(),

    // 4. X-axis work table (moves with saddle along Y, and slides along X)
    `<g data-part="table" transform="${k.translateAlong(P, [startX, 0, 0])}">`,
    workTable(),

    // 5. Milling vise on table
    precisionVise(),

    // 6. Workpiece clamped in vise
    workpieceBillet(),

    `</g>`, // end table
    `</g>`, // end saddle

    // 7. Spindle head carriage (Z-axis, moves vertically)
    `<g data-part="spindle" transform="${k.translateAlong(P, [0, 0, startZ])}">`,
    spindleHead(),
    `</g>`,

    // 8. Cutting interaction zone & flying chips (lit accent)
    `<g data-part="cutting" transform="${k.translateAlong(P, [0, 0, startZ])}">`,
    cuttingAction(),
    `</g>`,

    // 9. CNC Control Pendant / DRO Console
    controlPendant(),
  ],
});

// LIVE SCRIPT FOR BROWSER INTERACTION
const live = `
const P = ${JSON.stringify(P)};
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const saddle = svg.querySelector('[data-part="saddle"]');
const table = svg.querySelector('[data-part="table"]');
const spindle = svg.querySelector('[data-part="spindle"]');
const cutting = svg.querySelector('[data-part="cutting"]');
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");

// Physical limits (in mm / world coordinates)
const LIMITS = {
  x: [-28, 28],
  y: [-12, 12],
  z: [-6, 18], // -6 is engaged depth (2.5 mm cut), +18 is clearance
};

// Machine state
let state = {
  x: ${startX},
  y: ${startY},
  z: ${startZ},
  targetX: ${startX},
  targetY: ${startY},
  targetZ: ${startZ},
  rpm: 8000,
  feed: 600, // mm/min
  cutting: true,
  mode: "CLIMB",
};

let frame = 0, last = 0, clock = 0, touring = true, visible = false, idleTimer = 0;

const clamp = (val, min, max) => Math.min(max, Math.max(min, val));

// CNC G-Code cutting cycle simulation tour
function tourAt(t) {
  const cycleTime = 10.0;
  const phase = t % cycleTime;
  
  if (phase < 1.5) {
    // Phase 1: Rapid traverse to start position above workpiece
    return { x: -22, y: 0, z: 14, mode: "RAPID G00", feed: 3000, cutting: false };
  } else if (phase < 3.0) {
    // Phase 2: Plunge Z down into cut depth (G01)
    const p = (phase - 1.5) / 1.5;
    return { x: -22, y: 0, z: 14 - p * 16.5, mode: "PLUNGE G01", feed: 150, cutting: true };
  } else if (phase < 7.5) {
    // Phase 3: Linear milling pass feeding X through workpiece (G01)
    const p = (phase - 3.0) / 4.5;
    return { x: -22 + p * 44, y: 0, z: -2.5, mode: "CLIMB G01", feed: 600, cutting: true };
  } else if (phase < 9.0) {
    // Phase 4: Retract Z to clearance plane (G00)
    const p = (phase - 7.5) / 1.5;
    return { x: 22, y: 0, z: -2.5 + p * 16.5, mode: "RETRACT G00", feed: 3000, cutting: false };
  } else {
    // Phase 5: Return rapid
    return { x: -22, y: 0, z: 14, mode: "RAPID G00", feed: 3000, cutting: false };
  }
}

function updateScene() {
  table.setAttribute("transform", translateAlong(P, [state.x, 0, 0]));
  saddle.setAttribute("transform", translateAlong(P, [0, state.y, 0]));
  spindle.setAttribute("transform", translateAlong(P, [0, 0, state.z]));
  cutting.setAttribute("transform", translateAlong(P, [0, 0, state.z]));

  // Show / hide chips based on cut engagement
  const isEngaged = state.z <= 0 && Math.abs(state.x) <= 24 && Math.abs(state.y) <= 4;
  cutting.style.display = isEngaged ? "inline" : "none";

  const cutLoad = isEngaged ? (55 + Math.sin(clock * 12) * 8).toFixed(0) : "12";
  
  const text = "X: " + (state.x >= 0 ? "+" : "") + state.x.toFixed(1) + " · Y: " +
    (state.y >= 0 ? "+" : "") + state.y.toFixed(1) + " · Z: " +
    (state.z >= 0 ? "+" : "") + state.z.toFixed(1) + " mm · " +
    state.rpm + " RPM · " +
    (isEngaged ? "CUT " + cutLoad + "% LOAD" : "CLEAR");

  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuenow", String(Math.round(state.x)));
  stage.setAttribute("aria-valuetext", text);
}

function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;

  if (touring) {
    clock += dt;
    const tour = tourAt(clock);
    state.targetX = tour.x;
    state.targetY = tour.y;
    state.targetZ = tour.z;
    state.feed = tour.feed;
    state.mode = tour.mode;
  }

  // Smooth easing to target coordinates
  const speed = calm ? 1.0 : 1 - Math.exp(-dt / 0.18);
  state.x += (state.targetX - state.x) * speed;
  state.y += (state.targetY - state.y) * speed;
  state.z += (state.targetZ - state.z) * speed;

  if (Math.abs(state.targetX - state.x) < 0.01) state.x = state.targetX;
  if (Math.abs(state.targetY - state.y) < 0.01) state.y = state.targetY;
  if (Math.abs(state.targetZ - state.z) < 0.01) state.z = state.targetZ;

  updateScene();

  const settled = !touring &&
    state.x === state.targetX &&
    state.y === state.targetY &&
    state.z === state.targetZ;

  frame = visible && !settled ? requestAnimationFrame(tick) : 0;
}

const run = () => {
  if (!frame && visible) {
    last = 0;
    frame = requestAnimationFrame(tick);
  }
};

const steer = (nx, ny, nz) => {
  touring = false;
  if (nx !== undefined) state.targetX = clamp(nx, LIMITS.x[0], LIMITS.x[1]);
  if (ny !== undefined) state.targetY = clamp(ny, LIMITS.y[0], LIMITS.y[1]);
  if (nz !== undefined) state.targetZ = clamp(nz, LIMITS.z[0], LIMITS.z[1]);
  state.feed = 600;

  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    touring = !still.matches;
    clock = 0;
    run();
  }, 4200);

  run();
};

new IntersectionObserver((entries) => {
  visible = entries[entries.length - 1].isIntersecting;
  if (visible) run();
}, { rootMargin: "120px 0px" }).observe(stage);

if (still.matches) touring = false;

// Pointer interactive scrubbing:
// Horizontal movement controls X table traverse
// Vertical movement controls Z cutter height
stage.addEventListener("pointermove", (event) => {
  const box = svg.getBoundingClientRect();
  const shareX = clamp((event.clientX - box.left) / box.width, 0, 1);
  const shareY = clamp((event.clientY - box.top) / box.height, 0, 1);

  const nx = LIMITS.x[0] + shareX * (LIMITS.x[1] - LIMITS.x[0]);
  const nz = LIMITS.z[1] - shareY * (LIMITS.z[1] - LIMITS.z[0]);
  steer(nx, state.targetY, nz);
});

stage.addEventListener("pointerleave", () => {
  steer(state.targetX, state.targetY, state.targetZ);
});

// Arrow key CNC jogging
stage.addEventListener("keydown", (event) => {
  let handled = true;
  const step = 2.0;

  if (event.key === "ArrowLeft") steer(state.targetX - step);
  else if (event.key === "ArrowRight") steer(state.targetX + step);
  else if (event.key === "ArrowUp") {
    if (event.shiftKey) steer(undefined, state.targetY + step);
    else steer(undefined, undefined, state.targetZ + step);
  } else if (event.key === "ArrowDown") {
    if (event.shiftKey) steer(undefined, state.targetY - step);
    else steer(undefined, undefined, state.targetZ - step);
  } else if (event.key === "Home") steer(0, 0, 14);
  else if (event.key === "End") steer(0, 0, -2.5);
  else if (event.key === " ") {
    touring = !touring;
    if (touring) clock = 0;
  } else handled = false;

  if (handled) event.preventDefault();
});

updateScene();
`;

const body = k.plateHtml({
  fig: "Fig 1",
  title: "CNC Milling Machine",
  hint: "Drag to jog · Space to cycle",
  readout: `X: ${startX >= 0 ? "+" : ""}${startX.toFixed(1)} · Y: 0.0 · Z: 0.0 mm · 8,000 RPM · CLEAR`,
  keys: [
    { mark: "lit", label: "Carbide 4-flute end mill & shear interface (cutting zone)" },
    { mark: "raised", label: "Aluminum 6061 billet with progressive milled shoulder" },
    { mark: "mid", label: "Orthogonal 3-axis drive stages (X table, Y saddle, Z head)" },
  ],
  caption:
    "A 3-axis vertical CNC milling machine. Multi-toothed solid carbide flutes spin at 8,000 RPM while the table traverses in Cartesian coordinates (X, Y, Z) driven by preloaded recirculating ball screws and digital servo motors. Clamped securely in a precision milling vise, the workpiece undergoes climb milling, shearing chips at maximum thickness on flute entry and thinning to zero at exit, leaving a fine surface finish while dual articulated coolant nozzles flush swarf and dissipate shear heat.",
  body: `<div class="iso-stage" tabindex="0" role="slider" aria-label="CNC Milling Machine: arrow keys jog X, Y, and Z axes, space toggles automatic cutting cycle" aria-valuemin="-28" aria-valuemax="28" aria-valuenow="${startX}">${svg}</div>`,
});

const htmlContent = k.pageHtml({
  title: "CNC Milling Machine — Anatomy",
  theme,
  body,
  script: kitScript() + live,
});

const outName = theme === "light" ? "index-light.html" : "index.html";
writeFileSync(join(HERE, outName), htmlContent);
console.log("wrote", outName);
