import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../.agents/skills/anatomy/kit/iso-kit.mjs";
import * as G from "../.agents/skills/anatomy/kit/lathe.mjs";
import { kitScript } from "../.agents/skills/anatomy/scripts/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";

const WIDTH = 680;
const HEIGHT = 480;

// Coordinate System (World Units, approx mm):
// X: Left-to-right axis (-left toward anchor/movable tackle, +right toward effort line)
// Y: Front-to-back axis (-front toward viewer, +back toward columns)
// Z: Vertical axis (+up, datum base plate surface at Z = 0)

// 1. BASE & BEDPLATE
const BASE = { x: -120, y: -58, w: 240, d: 116, r: 8 };
const BASE_H = 14;
const FOOT_H = 5;

// 2. COLUMNS & OVERHEAD GANTRY
const COL_L = [-66, 12];
const COL_R = [66, 12];
const COL_R_RADIUS = 4.2;
const COL_TOP_Z = 194;
const GANTRY_Z = 168;
const GANTRY_H = 14;

// 3. PULLEY RIGGING GEOMETRY
// Anchor Becket:
const ANCHOR_POS = [-24, 0, 162];

// Fixed Sheave:
const FIXED_CENTER = [6, 0, 150];
const FIXED_R = 12; // groove radius: left tangent at X = -6, top tangent at Z = 162

// Guide Sheave:
const GUIDE_CENTER = [38, 0, 156];
const GUIDE_R = 6;  // groove radius: top tangent at Z = 162, right tangent at X = +44

// Movable Sheave (resting datum):
const MOV_BASE_Z = 54;
const MOV_CENTER_X = -15;
const MOV_R = 9; // groove radius: left tangent at X = -24 (matches anchor), right tangent at X = -6 (matches fixed sheave)

// Test Load & Hanger:
const HOOK_OFFSET_Z = -14;
const HANGER_BOTTOM_Z = -44;

// Effort Line:
const EFFORT_X = 44;
const REST_HANDLE_Z = 110;

// Stroke & Travel limits:
const MAX_LIFT = 36; // mm
const EFFORT_TRAVEL = MAX_LIFT * 2; // 72 mm in 2:1 mode

// Mode Selector Switch on Base:
const KNOB_POS = [58, -32];

// Camera bounds for projection fitting
const BOUNDS = [
  ...k.boxCorners(BASE, -BASE_H - FOOT_H, 0),
  [COL_L[0], COL_L[1], COL_TOP_Z + 5],
  [COL_R[0], COL_R[1], COL_TOP_Z + 5],
  [0, 12, GANTRY_Z + GANTRY_H + 4],
  [-15, 0, 12],
  [EFFORT_X, 0, 30],
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

// ==========================================
// 1. BASE PLATE, LEVELING FEET, RULER & SPEC
// ==========================================
function basePlate() {
  const out = [];

  // Ground shadow halo
  out.push(`<path class="iso-halo" d="${k.haloOf(BASE, -BASE_H - FOOT_H, BASE_H, P)}"/>`);

  // 4 Leveling feet at corners
  for (const [x, y] of byDepth(k.corners(BASE, 20))) {
    out.push(S(k.cylinder(x, y, 7.2, -BASE_H - FOOT_H, 2.2, P, 24), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.2, -BASE_H - FOOT_H + 2.2, FOOT_H - 2.2, P, 24), { tone: "mid" }));
    out.push(L(k.sideArc(x, y, 5.2, -BASE_H - FOOT_H + 3.6, P, 16), { tone: "lo" }));
  }

  // Heavy precision cast-iron surface plate with 1.6 bevel
  out.push(S(k.slabOf(BASE, -BASE_H, BASE_H, P, 8, 1.6), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(BASE, 5), 0, P), { tone: "lo" }));

  // Corner socket cap screws with counterbore rings
  const screws = k.corners(BASE, 10);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5, tone: "hi" }));

  // Front millimeter linear datum scale strip
  const strip = { x: -105, y: BASE.y + BASE.d - 14, w: 210, d: 6.5, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 3, strip.x + strip.w - 3, 4, 5, strip.y + 0.8, 0.6, [1.6, 3.2], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(
    D(
      [
        at([strip.x + 2, strip.y + 3.2, 0.6]),
        at([strip.x + strip.w - 2, strip.y + 3.2, 0.6]),
      ],
      { size: 0.45, tone: "mid" }
    )
  );

  // Engraved machine specification plaque
  const plaque = { x: -105, y: -45, w: 34, d: 20, r: 1.5 };
  out.push(S(k.slabOf(plaque, 0, 0.8, P, 3), { tone: "lo", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(plaque, 1.4), 0.8, P), { tone: "faint" }));
  out.push(
    L(k.lineOnTop([-102, -41], [-76, -41], 0.8, P), { tone: "lo", free: true }),
    L(k.lineOnTop([-102, -37.5], [-84, -37.5], 0.8, P), { tone: "lo", free: true }),
    L(k.lineOnTop([-102, -34], [-88, -34], 0.8, P), { tone: "lo", free: true })
  );
  out.push(
    D(
      [
        at([-103.5, -43.5, 0.8]),
        at([-72.5, -43.5, 0.8]),
        at([-103.5, -26.5, 0.8]),
        at([-72.5, -26.5, 0.8]),
      ],
      { size: 0.35, tone: "mid" }
    )
  );

  // Rotary Mode Selector Switch (toggles between 2:1 tackle and 1:1 direct)
  const [kx, ky] = KNOB_POS;
  out.push(S(k.cylinder(kx, ky, 6.5, 0, 2.5, P, 24), { tone: "mid" }));
  out.push(S(k.cylinder(kx, ky, 4.8, 2.5, 4.5, P, 20), { tone: "hi" }));
  out.push(L(k.knurl(kx, ky, 4.8, 2.5, 7.0, 18, P), { tone: "lo" }));
  out.push(L(k.ring(kx, ky, 7.2, 0, P, 24), { tone: "lo" }));
  // Mode index pointer line on knob top
  out.push(
    `<path data-part="mode-knob-pointer" class="iso-line" data-tone="lit" data-free="start" d="${k.lineOnTop(
      [kx - 1.5, ky],
      [kx + 4.5, ky],
      7.0,
      P
    )}" style="stroke-width:1.1"/>`
  );
  // Mode scale index marks on base
  out.push(L(k.lineOnTop([kx + 6.8, ky], [kx + 9.5, ky], 0, P), { tone: "hi", free: true }));
  out.push(L(k.lineOnTop([kx, ky + 6.8], [kx, ky + 9.5], 0, P), { tone: "mid", free: true }));

  return out.join("");
}

// ==========================================
// 2. SUPPORT COLUMNS, CLAMP FLANGES & GANTRY
// ==========================================
function columnsAndGantry() {
  const out = [];

  // Twin vertical columns (ground steel finish)
  for (const [cx, cy] of [COL_L, COL_R]) {
    // Column base clamping flange
    out.push(S(k.cylinder(cx, cy, 8.2, 0, 3.2, P, 28, 0.4), { tone: "lo" }));
    out.push(S(k.cylinder(cx, cy, 6.2, 3.2, 3.2, P, 28), { tone: "mid" }));
    out.push(
      D(
        [0, 120, 240].map((deg) => {
          const rad = (deg * Math.PI) / 180;
          return at([cx + 6.2 * Math.cos(rad), cy + 6.2 * Math.sin(rad), 3.2]);
        }),
        { size: 0.4, tone: "hi" }
      )
    );

    // Main column upright shaft
    out.push(S(k.cylinder(cx, cy, COL_R_RADIUS, 6.4, COL_TOP_Z - 6.4, P, 28), { tone: "mid", crease: "none" }));
    for (const z of [45, 90, 135]) {
      out.push(L(k.sideArc(cx, cy, COL_R_RADIUS, z, P, 16), { tone: "faint" }));
    }

    // Top dome cap nut
    out.push(S(k.cylinder(cx, cy, 5.0, COL_TOP_Z, 3.5, P, 24, 0.4), { tone: "hi" }));
    out.push(S(k.cylinder(cx, cy, 3.0, COL_TOP_Z + 3.5, 1.5, P, 16), { tone: "mid" }));
  }

  // Rigid Overhead Gantry Crossbeam (Z = GANTRY_Z to GANTRY_Z + GANTRY_H)
  const gantryBox = { x: -74, y: 3, w: 148, d: 18, r: 3 };
  out.push(S(k.slabOf(gantryBox, GANTRY_Z, GANTRY_H, P, 4, 1.2), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(gantryBox, 2.5), GANTRY_Z + GANTRY_H, P), { tone: "faint" }));

  // Column split clamping blocks on gantry
  for (const [cx, cy] of [COL_L, COL_R]) {
    const clampBox = { x: cx - 7.5, y: 1.5, w: 15, d: 21, r: 2.5 };
    out.push(S(k.slabOf(clampBox, GANTRY_Z - 2, GANTRY_H + 4, P, 4, 0.6), { tone: "mid" }));
    // Knurled thumbscrew on clamp front face
    const thumbX = cx;
    const thumbY = 1.5;
    out.push(
      S(
        k.slabOf({ x: thumbX - 1.6, y: thumbY - 3, w: 3.2, d: 3, r: 0.8 }, GANTRY_Z + 5, 4, P, 2),
        { tone: "mid", crease: "none" }
      )
    );
    out.push(S(k.cylinder(thumbX, thumbY - 5, 2.8, GANTRY_Z + 4, 6, P, 20), { tone: "hi" }));
    out.push(L(k.knurl(thumbX, thumbY - 5, 2.8, GANTRY_Z + 4, GANTRY_Z + 10, 18, P), { tone: "lo" }));
  }

  // Cantilevered suspension boom projecting forward over the pulleys (Y = -9 to 3)
  const boom = { x: -32, y: -9, w: 78, d: 12, r: 2.5 };
  out.push(S(k.slabOf(boom, GANTRY_Z + 2, GANTRY_H - 4, P, 3, 0.8), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(boom, 2), GANTRY_Z + GANTRY_H - 2, P), { tone: "faint" }));

  // Anchor becket eyelet at X = -24 (dead-end cable clamp)
  out.push(S(k.cylinder(ANCHOR_POS[0], ANCHOR_POS[1], 3.2, GANTRY_Z, 4, P, 18), { tone: "hi" }));
  out.push(S(k.cylinder(ANCHOR_POS[0], ANCHOR_POS[1], 1.8, ANCHOR_POS[2], GANTRY_Z - ANCHOR_POS[2], P, 16), { tone: "mid" }));
  out.push(L(k.ring(ANCHOR_POS[0], ANCHOR_POS[1], 2.8, ANCHOR_POS[2], P, 16), { tone: "hi" }));
  out.push(D([at(ANCHOR_POS)], { size: 0.5, tone: "lit" }));

  return out.join("");
}

// ==========================================
// 3. VERTICAL VERNIER MEASUREMENT SCALES
// ==========================================
function measurementScales() {
  const out = [];

  // Left Column: Load Elevation Scale (Z = 45 to 105, travel 60 mm)
  const scaleL = { x: COL_L[0] + 5, y: COL_L[1] - 4, w: 6.5, d: 3.5, r: 0.8 };
  out.push(S(k.slabOf(scaleL, 45, 60, P, 2, 0.4), { tone: "lo", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(scaleL, 0.8), 105, P), { tone: "faint" }));

  // Ticks on left scale face (facing viewer)
  for (let z = 48; z <= 102; z += 3) {
    const isMajor = (z - 48) % 15 === 0;
    const len = isMajor ? 4.5 : 2.4;
    const p0 = [scaleL.x + 1, scaleL.y, z];
    const p1 = [scaleL.x + 1 + len, scaleL.y, z];
    out.push(L(k.segment(p0, p1, P), { tone: isMajor ? "hi" : "mid" }));
    out.push(D([at(p1)], { size: 0.35, tone: isMajor ? "hi" : "lo" }));
  }

  // Right Column: Effort Travel Scale (Z = 30 to 126, travel 96 mm)
  const scaleR = { x: COL_R[0] - 11.5, y: COL_R[1] - 4, w: 6.5, d: 3.5, r: 0.8 };
  out.push(S(k.slabOf(scaleR, 30, 96, P, 2, 0.4), { tone: "lo", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(scaleR, 0.8), 126, P), { tone: "faint" }));

  // Ticks on right scale face
  for (let z = 33; z <= 123; z += 3) {
    const isMajor = (z - 33) % 15 === 0;
    const len = isMajor ? 4.5 : 2.4;
    const p0 = [scaleR.x + scaleR.w - 1, scaleR.y, z];
    const p1 = [scaleR.x + scaleR.w - 1 - len, scaleR.y, z];
    out.push(L(k.segment(p0, p1, P), { tone: isMajor ? "hi" : "mid" }));
    out.push(D([at(p1)], { size: 0.35, tone: isMajor ? "hi" : "lo" }));
  }

  return out.join("");
}

// ==========================================
// 4. OVERHEAD FIXED PULLEY & GUIDE PULLEY
// ==========================================
function overheadPulleys() {
  const out = [];

  // Fixed Sheave Bracket (clevis cheeks at Y = -4.5 and Y = +3.0)
  const cheekF = { x: FIXED_CENTER[0] - 3.5, y: -4.5, w: 7, d: 1.5, r: 1 };
  const cheekR = { x: FIXED_CENTER[0] - 3.5, y: 3.0, w: 7, d: 1.5, r: 1 };
  out.push(S(k.slabOf(cheekR, FIXED_CENTER[2] - 2, GANTRY_Z + 2 - (FIXED_CENTER[2] - 2), P, 2), { tone: "mid" }));

  // Turned Fixed Sheave (grooved bronze pulley along Y-axis)
  const F_fixed = G.frameAlong(FIXED_CENTER, [0, 1, 0]);
  const sheaveProfile = [
    [-3.2, 4.5],
    [-2.6, 4.5],
    [-2.6, 14.2],
    [-1.8, 14.2],
    [-1.0, FIXED_R],
    [1.0, FIXED_R],
    [1.8, 14.2],
    [2.6, 14.2],
    [2.6, 4.5],
    [3.2, 4.5],
  ];
  out.push(S(G.solidOf(sheaveProfile, F_fixed, P), { tone: "hi" }));
  out.push(L(G.circleOf(F_fixed, 2.6, 14.2, P, 32), { tone: "faint" }));
  out.push(L(G.circleOf(F_fixed, 1.8, FIXED_R, P, 32), { tone: "lo" }));
  // 3 Lightening holes in bronze sheave web
  out.push(D(G.dotsOf(F_fixed, 0, 8.2, 3, P, { all: true }), { size: 0.55, tone: "lo" }));

  // Axle pin through center of fixed sheave
  out.push(S(G.disc(-5.5, 5.5, 2.2, F_fixed, P), { tone: "mid" }));
  out.push(D([at([FIXED_CENTER[0], -5.5, FIXED_CENTER[2]]), at([FIXED_CENTER[0], 5.5, FIXED_CENTER[2]])], { size: 0.45, tone: "hi" }));

  // Front cheek of fixed bracket (in front of sheave)
  out.push(S(k.slabOf(cheekF, FIXED_CENTER[2] - 2, GANTRY_Z + 2 - (FIXED_CENTER[2] - 2), P, 2), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(cheekF, 0.4), FIXED_CENTER[2] + 8, P), { tone: "faint" }));

  // Guide / Idler Sheave at X = GUIDE_CENTER[0] (guides rope down to effort line)
  const F_guide = G.frameAlong(GUIDE_CENTER, [0, 1, 0]);
  const guideProfile = [
    [-2.2, 3.2],
    [-1.8, 3.2],
    [-1.8, 8.2],
    [-1.0, 8.2],
    [-0.6, GUIDE_R],
    [0.6, GUIDE_R],
    [1.0, 8.2],
    [1.8, 8.2],
    [1.8, 3.2],
    [2.2, 3.2],
  ];
  out.push(S(G.solidOf(guideProfile, F_guide, P), { tone: "mid" }));
  out.push(S(G.disc(-4.0, 4.0, 1.8, F_guide, P), { tone: "mid" }));
  out.push(D([at([GUIDE_CENTER[0], -4.0, GUIDE_CENTER[2]]), at([GUIDE_CENTER[0], 4.0, GUIDE_CENTER[2]])], { size: 0.4, tone: "hi" }));

  // Guide sheave suspension bracket
  const guideBracket = { x: GUIDE_CENTER[0] - 2.5, y: -3.0, w: 5, d: 6, r: 1 };
  out.push(S(k.slabOf(guideBracket, GUIDE_CENTER[2] + 4, GANTRY_Z - GUIDE_CENTER[2] - 2, P, 2), { tone: "mid" }));

  return out.join("");
}

// ==========================================
// 5. MOVABLE PULLEY ASSEMBLY (TRAVELING BLOCK)
// ==========================================
// Built at rest position (deltaZ = 0), moved with translateAlong(P, [0, 0, dz])
function movableTackle() {
  const out = [];
  const cx = MOV_CENTER_X;
  const cy = 0;
  const cz = MOV_BASE_Z;

  // Rear cheek plate
  const cheekR = { x: cx - 8, y: 3.2, w: 16, d: 1.6, r: 4.5 };
  out.push(S(k.slabOf(cheekR, cz - 11, 22, P, 4, 0.5), { tone: "mid" }));

  // Movable Turned Sheave (grooved bronze, outer R = 11.2, groove R = 9.0)
  const F_mov = G.frameAlong([cx, cy, cz], [0, 1, 0]);
  const movProfile = [
    [-2.8, 3.8],
    [-2.2, 3.8],
    [-2.2, 11.2],
    [-1.6, 11.2],
    [-0.8, MOV_R],
    [0.8, MOV_R],
    [1.6, 11.2],
    [2.2, 11.2],
    [2.2, 3.8],
    [2.8, 3.8],
  ];
  // Lit accent for the movable sheave - the core mechanism!
  out.push(S(G.solidOf(movProfile, F_mov, P), { tone: "lit", lit: true }));
  out.push(L(G.circleOf(F_mov, 2.2, 11.2, P, 32), { tone: "hi" }));
  out.push(L(G.circleOf(F_mov, 1.6, MOV_R, P, 32), { tone: "mid" }));
  // 3 Lightening holes
  out.push(D(G.dotsOf(F_mov, 0, 6.5, 3, P, { all: true }), { size: 0.5, tone: "mid" }));

  // Axle pin through center of movable sheave
  out.push(S(G.disc(-5.2, 5.2, 2.2, F_mov, P), { tone: "hi" }));
  out.push(D([at([cx, -5.2, cz]), at([cx, 5.2, cz])], { size: 0.45, tone: "lit" }));

  // Front cheek plate (stadium profile with central inspection aperture)
  const cheekF = { x: cx - 8, y: -4.8, w: 16, d: 1.6, r: 4.5 };
  out.push(S(k.slabOf(cheekF, cz - 11, 22, P, 4, 0.5), { tone: "hi" }));
  out.push(L(k.planOutline(k.insetPlan(cheekF, 1.2), cz + 10, P), { tone: "faint" }));
  out.push(L(k.ring(cx, -4.8, 4.0, cz, P, 20), { tone: "lo" }));

  // Spacer through-bolts at top and bottom of cheeks
  for (const bz of [cz - 8, cz + 8]) {
    out.push(D([at([cx - 5.5, -4.8, bz]), at([cx + 5.5, -4.8, bz])], { size: 0.42, tone: "lo" }));
  }

  // Swivel Clevis Yoke & Forged Cargo Hook
  const yokeZ = cz + HOOK_OFFSET_Z;
  out.push(S(k.cylinder(cx, cy, 3.6, yokeZ, 3.2, P, 20), { tone: "hi" }));
  out.push(L(k.ring(cx, cy, 3.6, yokeZ + 1.6, P, 16), { tone: "lo" }));

  // Drop-forged steel hook (curved profile)
  const hookBowl = { x: cx - 4, y: cy - 2.5, w: 8, d: 5, r: 2 };
  out.push(S(k.slabOf(hookBowl, yokeZ - 7, 7, P, 3, 0.5), { tone: "hi" }));
  out.push(S(k.cylinder(cx + 3, cy, 1.8, yokeZ - 5, 4.5, P, 14), { tone: "mid" })); // hook bill/tip
  out.push(D([at([cx + 3, cy, yokeZ - 0.5])], { size: 0.35, tone: "lit" }));

  // Brass elevation indicator needle (points left toward the vernier scale)
  const needleY = cy;
  const needleZ = yokeZ + 1.6;
  const targetScalePoint = [COL_L[0] + 6, COL_L[1] - 4, needleZ];
  out.push(L(k.segment([cx - 4, needleY, needleZ], targetScalePoint, P), { tone: "lit" }));
  out.push(D([at(targetScalePoint)], { size: 0.45, tone: "lit" }));

  // ==========================================
  // Suspended 100 N Calibrated Test Load
  // ==========================================
  const loadTopZ = yokeZ - 8;
  // Hanger vertical stem & loop
  out.push(S(k.cylinder(cx, cy, 1.6, cz + HANGER_BOTTOM_Z, loadTopZ - (cz + HANGER_BOTTOM_Z), P, 16), { tone: "mid", crease: "none" }));
  out.push(L(k.ring(cx, cy, 2.5, loadTopZ, P, 16), { tone: "hi" }));

  // Bottom hanger tray plate
  const trayZ = cz + HANGER_BOTTOM_Z;
  out.push(S(k.cylinder(cx, cy, 13.0, trayZ, 3.0, P, 32, 0.5), { tone: "lo" }));
  out.push(L(k.sideArc(cx, cy, 13.0, trayZ + 1.5, P, 20), { tone: "faint" }));

  // 4 Slotted Disc Weights (25 N each = 100 N total)
  for (let i = 0; i < 4; i++) {
    const wz = trayZ + 3.0 + i * 4.2;
    out.push(S(k.cylinder(cx, cy, 11.8, wz, 3.8, P, 32, 0.4), { tone: i % 2 === 0 ? "hi" : "mid" }));
    // Radial slot cutout mark on weights
    out.push(L(k.segment([cx, cy, wz + 3.8], [cx + 11.8, cy, wz + 3.8], P), { tone: "faint" }));
    out.push(L(k.sideArc(cx, cy, 11.8, wz + 1.9, P, 20), { tone: "lo" }));
  }

  // Top knurled clamping thumb nut on weight stack
  const nutZ = trayZ + 3.0 + 4 * 4.2;
  out.push(S(k.cylinder(cx, cy, 4.2, nutZ, 3.0, P, 20), { tone: "hi" }));
  out.push(L(k.knurl(cx, cy, 4.2, nutZ, nutZ + 3.0, 18, P), { tone: "lo" }));

  // Curved cable loop under the movable sheave (moves with the block)
  // Cable enters at [-24, 0, cz], wraps underneath around radius 9, exits at [-6, 0, cz]
  const ropePoints = [];
  const steps = 18;
  for (let s = 0; s <= steps; s++) {
    const ang = Math.PI + (s / steps) * Math.PI; // from PI to 2*PI (bottom half)
    ropePoints.push(at([cx + MOV_R * Math.cos(ang), cy, cz + MOV_R * Math.sin(ang)]));
  }
  out.push(`<path class="iso-line" data-tone="lit" d="${k.pathOf(ropePoints)}" style="stroke-width:1.3"/>`);

  return out.join("");
}

// ==========================================
// 6. INLINE TUBULAR FORCE DYNAMOMETER
// ==========================================
// Mounted inline with the effort line at X = EFFORT_X
// Moves with deltaEffort = -2 * deltaZ
function dynamometerAssembly() {
  const out = [];
  const cx = EFFORT_X;
  const cy = 0;
  const topZ = REST_HANDLE_Z + 28;
  const barrelLen = 32;
  const barrelR = 4.2;

  // Upper suspension loop & gland nut
  out.push(S(k.cylinder(cx, cy, 2.5, topZ, 3.0, P, 16), { tone: "hi" }));
  out.push(L(k.ring(cx, cy, 2.5, topZ + 1.5, P, 16), { tone: "lo" }));

  // Main tubular barrel (Z = topZ - barrelLen to topZ)
  const barrelZ = topZ - barrelLen;
  out.push(S(k.cylinder(cx, cy, barrelR, barrelZ, barrelLen, P, 24, 0.4), { tone: "mid" }));
  out.push(L(k.sideArc(cx, cy, barrelR, topZ - 4, P, 16), { tone: "lo" }));
  out.push(L(k.sideArc(cx, cy, barrelR, barrelZ + 4, P, 16), { tone: "lo" }));

  // Front longitudinal inspection slot revealing internal spring & calibrated scale
  const slotW = 2.4;
  const slotH = 22;
  const slotZ = barrelZ + 5;
  const slotBox = { x: cx - slotW / 2, y: cy - barrelR - 0.2, w: slotW, d: 1.2, r: 0.6 };
  out.push(S(k.slabOf(slotBox, slotZ, slotH, P, 2), { tone: "lo", crease: "none" }));

  // Internal helical spring coils (inside the slot)
  const coilSteps = 6;
  const coilTop = slotZ + slotH - 2;
  const coilBot = slotZ + 8;
  for (let c = 0; c < coilSteps; c++) {
    const cz = coilTop - (c / (coilSteps - 1)) * (coilTop - coilBot);
    out.push(L(k.segment([cx - 1.0, cy - barrelR + 0.4, cz], [cx + 1.0, cy - barrelR + 0.4, cz], P), { tone: "mid" }));
  }

  // Force indicator index line (rests exactly at 50 N mark in 2:1 mode) - LIT ACCENT!
  const markZ = slotZ + 8;
  out.push(
    `<g data-part="dyn-mark"><path class="iso-line" data-tone="lit" d="${k.segment(
      [cx - 1.2, cy - barrelR, markZ],
      [cx + 1.2, cy - barrelR, markZ],
      P
    )}" style="stroke-width:1.4"/><circle class="iso-dots" data-tone="lit" cx="${at([cx, cy - barrelR, markZ])[0]}" cy="${
      at([cx, cy - barrelR, markZ])[1]
    }" r="0.45"/></g>`
  );

  // Force scale ticks (0 to 100 N)
  for (let f = 0; f <= 5; f++) {
    const tz = slotZ + 2 + f * 3.6;
    out.push(L(k.segment([cx + 1.2, cy - barrelR, tz], [cx + 2.4, cy - barrelR, tz], P), { tone: f === 2 ? "lit" : "lo" }));
  }

  // Lower pull rod sliding out through bottom brass gland
  const lowerRodLen = 14;
  out.push(S(k.cylinder(cx, cy, 1.4, barrelZ - lowerRodLen, lowerRodLen, P, 16), { tone: "hi", crease: "none" }));
  out.push(S(k.cylinder(cx, cy, 3.2, barrelZ - 2.5, 3.0, P, 16), { tone: "hi" }));

  // Ergonomic Knurled Pull Handle Bar (horizontal along Y-axis)
  const handleZ = barrelZ - lowerRodLen;
  const F_handle = G.frameAlong([cx, cy, handleZ], [0, 1, 0]);
  out.push(S(G.disc(-12, 12, 2.8, F_handle, P), { tone: "hi" }));
  out.push(L(G.ribsOf(F_handle, -10, 10, 2.8, 16, P, { seams: true }), { tone: "lo" }));
  // Brass end caps
  out.push(S(G.disc(-13.5, -12, 3.4, F_handle, P), { tone: "mid" }));
  out.push(S(G.disc(12, 13.5, 3.4, F_handle, P), { tone: "mid" }));

  // Travel index pointer projecting rightward toward the effort travel scale on COL_R
  const targetEffortPoint = [COL_R[0] - 11.5, cy, handleZ];
  out.push(L(k.segment([cx + 2.8, cy, handleZ], targetEffortPoint, P), { tone: "lit" }));
  out.push(D([at(targetEffortPoint)], { size: 0.45, tone: "lit" }));

  return out.join("");
}

// ==========================================
// 7. STATIONARY CABLE RUNS
// ==========================================
function stationaryCables() {
  const out = [];

  // Over Fixed Sheave: from [-6, 0, 150] (180 deg) to [6, 0, 162] (90 deg)
  const fixedCurve = [];
  const stepsF = 12;
  for (let s = 0; s <= stepsF; s++) {
    const ang = Math.PI - (s / stepsF) * (Math.PI / 2); // from 180 deg down to 90 deg
    fixedCurve.push(at([FIXED_CENTER[0] + FIXED_R * Math.cos(ang), 0, FIXED_CENTER[2] + FIXED_R * Math.sin(ang)]));
  }
  out.push(`<path class="iso-line" data-tone="lit" d="${k.pathOf(fixedCurve)}" style="stroke-width:1.3"/>`);

  // Perfectly horizontal crossover run from fixed sheave top [6, 0, 162] to guide sheave top [38, 0, 162]
  out.push(L(k.segment([6, 0, 162], [38, 0, 162], P), { tone: "lit" }));

  // Over Guide Sheave: from [38, 0, 162] (90 deg) to [44, 0, 156] (0 deg)
  const guideCurve = [];
  const stepsG = 12;
  for (let s = 0; s <= stepsG; s++) {
    const ang = Math.PI / 2 - (s / stepsG) * (Math.PI / 2); // from 90 deg to 0 deg
    guideCurve.push(at([GUIDE_CENTER[0] + GUIDE_R * Math.cos(ang), 0, GUIDE_CENTER[2] + GUIDE_R * Math.sin(ang)]));
  }
  out.push(`<path class="iso-line" data-tone="lit" d="${k.pathOf(guideCurve)}" style="stroke-width:1.3"/>`);

  return out.join("");
}

// ==========================================
// ASSEMBLE FIGURE SVG
// ==========================================
const startZ = 0; // rest elevation: 0 mm
const startEffortDrop = 0; // rest effort travel: 0 mm

const initialLeftStrand = k.segment(ANCHOR_POS, [-24, 0, MOV_BASE_Z], P);
const initialCenterStrand = k.segment([-6, 0, MOV_BASE_Z], [-6, 0, FIXED_CENTER[2]], P);
const initialEffortStrand = k.segment([EFFORT_X, 0, 156], [EFFORT_X, 0, REST_HANDLE_Z + 31], P);

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "An instrumented mechanical advantage pulley testing apparatus. A fixed overhead bronze sheave and a movable bronze sheave suspend a 100 N test load. In this 2:1 tackle, two vertical cable strands each carry 50 N of tension, halving the required pulling force to 50 N while doubling the required effort travel.",
  body: [
    basePlate(),
    columnsAndGantry(),
    measurementScales(),
    overheadPulleys(),
    stationaryCables(),

    // Dynamic cable strands (endpoints updated in draw())
    `<path data-part="strand-left" class="iso-line" data-tone="lit" d="${initialLeftStrand}" style="stroke-width:1.3"/>`,
    `<path data-part="strand-center" class="iso-line" data-tone="lit" d="${initialCenterStrand}" style="stroke-width:1.3"/>`,
    `<path data-part="strand-effort" class="iso-line" data-tone="lit" d="${initialEffortStrand}" style="stroke-width:1.3"/>`,

    // Dynamic assemblies (translated along Z axis)
    `<g data-part="movable-tackle" transform="${k.translateAlong(P, [0, 0, startZ])}">${movableTackle()}</g>`,
    `<g data-part="dynamometer" transform="${k.translateAlong(P, [0, 0, -startEffortDrop])}">${dynamometerAssembly()}</g>`,
  ],
});

// ==========================================
// CLIENT-SIDE INTERACTIVE RUNTIME
// ==========================================
const live = `
const P = ${JSON.stringify(P)};
const ANCHOR_POS = ${JSON.stringify(ANCHOR_POS)};
const MOV_BASE_Z = ${MOV_BASE_Z};
const FIXED_CENTER = ${JSON.stringify(FIXED_CENTER)};
const EFFORT_X = ${EFFORT_X};
const REST_HANDLE_Z = ${REST_HANDLE_Z};
const MAX_LIFT = ${MAX_LIFT};
const KNOB_POS = ${JSON.stringify(KNOB_POS)};

const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const movableTackle = svg.querySelector('[data-part="movable-tackle"]');
const dynamometer = svg.querySelector('[data-part="dynamometer"]');
const strandLeft = svg.querySelector('[data-part="strand-left"]');
const strandCenter = svg.querySelector('[data-part="strand-center"]');
const strandEffort = svg.querySelector('[data-part="strand-effort"]');
const knobPointer = svg.querySelector('[data-part="mode-knob-pointer"]');
const dynMark = svg.querySelector('[data-part="dyn-mark"]');
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");

const clamp = (val, min, max) => Math.min(max, Math.max(min, val));

// State
let lift = 0;          // mm of load elevation (0 to MAX_LIFT)
let targetLift = 0;
let liftRate = 0;
let mode = 2;          // 2 for 2:1 tackle, 1 for 1:1 direct fixed
let loadN = 100.0;     // Newtons
let frame = 0;
let lastTime = 0;
let clock = 0;
let touring = true;
let visible = false;
let idleTimer = 0;
let isDragging = false;
let dragStartY = 0;
let dragStartLift = 0;

function draw() {
  const currentLift = lift;
  const currentEffort = mode === 2 ? currentLift * 2 : currentLift;
  const currentEffortN = mode === 2 ? loadN / 2 : loadN;
  const workJ = (loadN * (currentLift / 1000)).toFixed(2);

  // Translate assemblies
  movableTackle.setAttribute("transform", translateAlong(P, [0, 0, currentLift]));
  dynamometer.setAttribute("transform", translateAlong(P, [0, 0, -currentEffort]));

  // Update dynamic cable strands
  const currentMovZ = MOV_BASE_Z + currentLift;
  const dynTopZ = REST_HANDLE_Z + 31 - currentEffort;

  strandLeft.setAttribute("d", pathOf([iso(ANCHOR_POS, P), iso([-24, 0, currentMovZ], P)]));
  strandCenter.setAttribute("d", pathOf([iso([-6, 0, currentMovZ], P), iso([-6, 0, FIXED_CENTER[2]], P)]));
  strandEffort.setAttribute("d", pathOf([iso([EFFORT_X, 0, 156], P), iso([EFFORT_X, 0, dynTopZ], P)]));

  // Update mode selector knob pointer
  const [kx, ky] = KNOB_POS;
  const knobAngle = mode === 2 ? 0 : Math.PI / 2;
  const p0 = [kx - 1.5 * Math.cos(knobAngle), ky - 1.5 * Math.sin(knobAngle)];
  const p1 = [kx + 4.5 * Math.cos(knobAngle), ky + 4.5 * Math.sin(knobAngle)];
  knobPointer.setAttribute("d", lineOnTop(p0, p1, 7.0, P));

  // Update dynamometer indicator position: 50 N in 2:1 mode, 100 N in 1:1 mode
  const dynShift = mode === 2 ? 0 : -3.6;
  dynMark.setAttribute("transform", translateAlong(P, [0, 0, dynShift]));

  // Live concise tabular readout (fits without wrapping across all viewports)
  const text = "MA " + mode + "× · Effort " + currentEffortN.toFixed(0) + " N · Load " + loadN.toFixed(0) + " N · Lift " + currentLift.toFixed(0) + " mm";
  if (readout.textContent !== text) readout.textContent = text;

  stage.setAttribute("aria-valuenow", String(Math.round(currentLift)));
  stage.setAttribute("aria-valuetext", text);
}

function tick(now) {
  const dt = lastTime ? Math.min((now - lastTime) / 1000, 1 / 30) : 1 / 60;
  lastTime = now;
  const calm = still.matches;

  if (touring && !calm) {
    clock += dt;
    // Calm continuous sinusoidal tour
    targetLift = (MAX_LIFT / 2) * (1 - Math.cos((clock * Math.PI) / 3.0));
  }

  // Realistic spring-mass damping physics for tensioned cable
  const stiff = 320;
  const drag = calm ? 2 * Math.sqrt(stiff) : 22;
  const diff = targetLift - lift;
  liftRate += (diff * stiff - liftRate * drag) * dt;
  lift += liftRate * dt;

  if (Math.abs(diff) < 0.01 && Math.abs(liftRate) < 0.01) {
    lift = targetLift;
    liftRate = 0;
  }

  draw();

  const settled = !touring && lift === targetLift && liftRate === 0;
  frame = visible && !settled ? requestAnimationFrame(tick) : 0;
}

const run = () => {
  if (!frame && visible) {
    lastTime = 0;
    frame = requestAnimationFrame(tick);
  }
};

const steer = (next) => {
  touring = false;
  targetLift = clamp(next, 0, MAX_LIFT);
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    touring = !still.matches;
    clock = 0;
    run();
  }, 4000);
  run();
};

new IntersectionObserver((entries) => {
  visible = entries[entries.length - 1].isIntersecting;
  if (visible) run();
}, { rootMargin: "120px 0px" }).observe(stage);

if (still.matches) touring = false;

// Pointer Dragging Interaction
stage.addEventListener("pointerdown", (event) => {
  const box = stage.getBoundingClientRect();
  const px = event.clientX - box.left;
  const py = event.clientY - box.top;
  
  // Check if clicked near the mode selector knob
  const knobScreen = iso([KNOB_POS[0], KNOB_POS[1], 5], P);
  const distToKnob = Math.hypot(px - knobScreen[0], py - knobScreen[1]);
  if (distToKnob < 24) {
    mode = mode === 2 ? 1 : 2;
    run();
    return;
  }

  isDragging = true;
  dragStartY = event.clientY;
  dragStartLift = targetLift;
  stage.setPointerCapture(event.pointerId);
  touring = false;
  clearTimeout(idleTimer);
});

stage.addEventListener("pointermove", (event) => {
  if (!isDragging) return;
  const dy = event.clientY - dragStartY;
  // Dragging downward pulls the cable, lifting the load!
  const dLift = (dy / 2.2);
  steer(dragStartLift + dLift);
});

stage.addEventListener("pointerup", (event) => {
  if (isDragging) {
    isDragging = false;
    try { stage.releasePointerCapture(event.pointerId); } catch (_) {}
    steer(targetLift);
  }
});

stage.addEventListener("pointercancel", () => { isDragging = false; });

// Keyboard Controls
stage.addEventListener("keydown", (event) => {
  if (event.key === "ArrowUp" || event.key === "ArrowRight") {
    event.preventDefault();
    steer(targetLift + 4);
  } else if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
    event.preventDefault();
    steer(targetLift - 4);
  } else if (event.key === "Home") {
    event.preventDefault();
    steer(0);
  } else if (event.key === "End") {
    event.preventDefault();
    steer(MAX_LIFT);
  } else if (event.key === " " || event.key === "Spacebar") {
    event.preventDefault();
    touring = !touring;
    if (touring) clock = 0;
    run();
  } else if (event.key === "m" || event.key === "M") {
    event.preventDefault();
    mode = mode === 2 ? 1 : 2;
    run();
  }
});

draw();
`;

// ==========================================
// CARD WRAPPER & METADATA
// ==========================================
const initialWork = (100.0 * (startZ / 1000)).toFixed(2);
const body = k.plateHtml({
  fig: "Fig 1",
  title: "Pulley & Mechanical Advantage",
  hint: "Drag to pull · [M] Mode",
  readout: "MA 2× · Effort 50 N · Load 100 N · Lift 0 mm",
  keys: [
    { mark: "lit", label: "Movable sheave (grooved bronze): halves the required effort force" },
    { mark: "raised", label: "Dual vertical rope strands: each carries 50 N tension to support 100 N load" },
    { mark: "mid", label: "Fixed overhead sheave, inline spring dynamometer & twin vernier travel scales" },
  ],
  caption:
    "An instrumented mechanical advantage pulley apparatus. In this 2:1 tackle (gun tackle), the suspended 100 N test load is shared equally across two parallel cable strands, each carrying exactly 50 N of tension. Pulling the effort line requires only 50 N of force, but must travel twice the displacement (e.g. 72 mm of cable pull lifts the load 36 mm). Work is conserved (W_in = W_out = 3.60 J), demonstrating how a pulley system trades force for distance.",
  body: `<div class="iso-stage" tabindex="0" role="slider" aria-label="Pulley and Mechanical Advantage: drag or arrow keys to pull cable, space toggles idle tour, m toggles 2:1 or 1:1 mode" aria-valuemin="0" aria-valuemax="${MAX_LIFT}" aria-valuenow="${startZ}">${svg}</div>`,
});

const htmlContent = k.pageHtml({
  title: "Pulley & Mechanical Advantage — Anatomy",
  theme,
  body,
  script: kitScript() + live,
});

const outName = theme === "light" ? "pulley-light.html" : "pulley.html";
writeFileSync(join(HERE, outName), htmlContent);
console.log("wrote", outName);

// Also mirror to index.html and index-light.html
const indexName = theme === "light" ? "index-light.html" : "index.html";
writeFileSync(join(HERE, indexName), htmlContent);
console.log("wrote", indexName);
