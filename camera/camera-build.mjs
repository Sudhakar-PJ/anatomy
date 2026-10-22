import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../.agents/skills/anatomy/kit/iso-kit.mjs";
import { kitScript } from "../.agents/skills/anatomy/scripts/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";

const WIDTH = 680;
const HEIGHT = 460;

// Coordinate System (World Units, approx mm):
// X: Optical axis (positive toward subject / front lens, negative toward camera rear LCD)
// Y: Horizontal cross-axis (negative toward camera grip/left, positive toward camera right)
// Z: Vertical axis (positive up, datum optical axis at Z = 38)

// OPTICAL BENCH
const BENCH = { x: -80, y: -48, w: 166, d: 96, r: 6 };
const BENCH_H = 12;
const FOOT_H = 5;

// OPTICAL AXIS CENTER
const OPTIC_Y = 0;
const OPTIC_Z = 38;

// CAMERA BODY
const BODY_X0 = -60;
const BODY_X1 = -10;
const BODY_W = BODY_X1 - BODY_X0; // 50 mm deep
const BODY_Y0 = -26;
const BODY_Y1 = 26;
const BODY_D = BODY_Y1 - BODY_Y0; // 52 mm wide
const BODY_BASE_Z = 6;
const BODY_TOP_Z = 58;

// LENS BARREL (Extends forward from mount at X = -10 to X = 62)
const MOUNT_X = -10;
const FRONT_LENS_X = 60;
const BARREL_R = 19;

// Bounding points for camera fitting
const BOUNDS = [
  ...k.boxCorners(BENCH, -BENCH_H - FOOT_H, 0),
  [BODY_X0, BODY_Y0, BODY_TOP_Z + 14], // EVF top
  [BODY_X0, BODY_Y1, BODY_TOP_Z + 8],
  [FRONT_LENS_X + 15, -BARREL_R, OPTIC_Z - BARREL_R],
  [FRONT_LENS_X + 15, BARREL_R, OPTIC_Z + BARREL_R],
  [-75, -45, 0],
  [80, -45, 0],
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

// 1. OPTICAL BENCH BASE & RAILS
function opticalBench() {
  const out = [];
  // Soft halo underneath bench
  out.push(`<path class="iso-halo" d="${k.haloOf(BENCH, -BENCH_H - FOOT_H, BENCH_H, P)}"/>`);

  // 4 Leveling feet with machined groove rings
  for (const [x, y] of byDepth(k.corners(BENCH, 16))) {
    out.push(S(k.cylinder(x, y, 6.5, -BENCH_H - FOOT_H, 2.2, P, 24), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 4.8, -BENCH_H - FOOT_H + 2.2, FOOT_H - 2.2, P, 24), { tone: "mid" }));
    out.push(L(k.sideArc(x, y, 4.8, -BENCH_H - FOOT_H + 3.6, P, 16), { tone: "lo" }));
  }

  // Heavy anodized aluminum optical bench plate
  out.push(S(k.slabOf(BENCH, -BENCH_H, BENCH_H, P, 6, 1.2), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(BENCH, 4), 0, P), { tone: "lo" }));

  // Corner mounting screws with counterbore rings
  const bolts = k.corners(BENCH, 8);
  out.push(L(bolts.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(bolts.map(([x, y]) => at([x, y, 0])), { size: 0.5, tone: "hi" }));

  // Metric optical datum scale rail along front edge of bench (Y = -42)
  const rail = { x: -68, y: -44, w: 140, d: 6, r: 0.8 };
  out.push(S(k.slabOf(rail, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(rail.x + 2, rail.x + rail.w - 2, 4, 5, rail.y + 0.8, 0.6, [1.4, 2.8], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));

  // Bench spec and calibration badge at front-left
  const badge = { x: -74, y: -34, w: 26, d: 11, r: 1 };
  out.push(S(k.slabOf(badge, 0, 0.5, P, 2), { tone: "lo", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(badge, 1.2), 0.5, P), { tone: "faint" }));
  out.push(
    L(k.lineOnTop([-71, -31], [-52, -31], 0.5, P), { tone: "lo", free: true }),
    L(k.lineOnTop([-71, -28.5], [-58, -28.5], 0.5, P), { tone: "lo", free: true }),
    L(k.lineOnTop([-71, -26], [-62, -26], 0.5, P), { tone: "lo", free: true }),
  );
  out.push(
    D(
      [
        at([-72.5, -32.5, 0.5]),
        at([-49.5, -32.5, 0.5]),
        at([-72.5, -24.5, 0.5]),
        at([-49.5, -24.5, 0.5]),
      ],
      { size: 0.35, tone: "mid" },
    ),
  );

  return out.join("");
}

// 2. CAMERA BODY CHASSIS (CUTAWAY ARCHITECTURE)
function cameraBody() {
  const out = [];

  // Baseplate of camera body
  const baseplate = { x: BODY_X0 - 1, y: BODY_Y0 - 1, w: BODY_W + 2, d: BODY_D + 2, r: 3.5 };
  out.push(S(k.slabOf(baseplate, 0, BODY_BASE_Z, P, 5, 0.8), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(baseplate, 2), BODY_BASE_Z, P), { tone: "faint" }));

  // Main magnesium alloy chassis (cutaway on top-front quadrant to reveal sensor)
  // Rear chassis block
  const rearBlock = { x: BODY_X0, y: BODY_Y0, w: 28, d: BODY_D, r: 3 };
  out.push(S(k.slabOf(rearBlock, BODY_BASE_Z, BODY_TOP_Z - BODY_BASE_Z, P, 5, 1.0), { tone: "mid" }));

  // Hand grip projection at front-left (Y = -26 to -10, X = -32 to -10)
  const grip = { x: -32, y: -26, w: 22, d: 16, r: 3 };
  out.push(S(k.slabOf(grip, BODY_BASE_Z, BODY_TOP_Z - 6 - BODY_BASE_Z, P, 4, 1.0), { tone: "mid" }));
  // Textured rubber grip wrap seam
  const gripSeam = k.sideSeam(grip, 28, P, 4);
  out.push(L(gripSeam, { tone: "faint" }));

  // Shutter release button on angled grip deck
  out.push(S(k.cylinder(-18, -18, 4.2, BODY_TOP_Z - 6, 3, P, 20, 0.4), { tone: "hi" }));
  out.push(S(k.cylinder(-18, -18, 3.0, BODY_TOP_Z - 3, 2, P, 18), { tone: "lit", lit: true })); // Shutter button

  // Front command control dial recessed into grip top
  out.push(S(k.cylinder(-26, -20, 4.5, BODY_TOP_Z - 6, 2.5, P, 20), { tone: "mid" }));
  out.push(L(k.sideArc(-26, -20, 4.5, BODY_TOP_Z - 4.5, P, 16), { tone: "lo" }));

  // Top electronic viewfinder (EVF) prism housing hump
  const evfHousing = { x: BODY_X0 + 12, y: -9, w: 20, d: 18, r: 2.5 };
  out.push(S(k.slabOf(evfHousing, BODY_TOP_Z, 12, P, 4, 0.8), { tone: "mid" }));
  // EVF soft rubber eyecup at rear
  const eyecup = { x: BODY_X0 - 4, y: -7, w: 4, d: 14, r: 1.5 };
  out.push(S(k.slabOf(eyecup, BODY_TOP_Z + 2, 8, P, 3, 0.4), { tone: "lo" }));
  out.push(L(k.planOutline(k.insetPlan(eyecup, 1), BODY_TOP_Z + 6, P), { tone: "faint" }));

  // Hot shoe mount on top of EVF prism
  const hotShoe = { x: BODY_X0 + 16, y: -5, w: 10, d: 10, r: 0.8 };
  out.push(S(k.slabOf(hotShoe, BODY_TOP_Z + 12, 2.5, P, 2, 0.3), { tone: "hi" }));
  out.push(D([at([BODY_X0 + 21, 0, BODY_TOP_Z + 14.5])], { size: 0.45, tone: "lit" })); // Center flash sync pin

  // Mode dial on top-right deck (P, A, S, M)
  out.push(S(k.cylinder(BODY_X0 + 16, 17, 6.5, BODY_TOP_Z, 5, P, 28, 0.5), { tone: "mid" }));
  out.push(L(k.sideArc(BODY_X0 + 16, 17, 6.5, BODY_TOP_Z + 2.5, P, 20), { tone: "lo" }));
  out.push(L(k.lineOnTop([BODY_X0 + 16, 17], [BODY_X0 + 22, 17], BODY_TOP_Z + 5, P), { tone: "lit" }));
  out.push(D([at([BODY_X0 + 16, 17, BODY_TOP_Z + 5])], { size: 0.45, tone: "lit" }));

  // Red tally recording lamp on body front
  out.push(S(k.cylinder(-14, -8, 1.8, BODY_TOP_Z - 10, 1.5, P, 12), { tone: "red" }));

  // Camera strap eyelet lug at side corner
  out.push(S(k.cylinder(BODY_X0 + 8, 26, 2.2, BODY_TOP_Z - 12, 5, P, 12), { tone: "hi" }));
  out.push(L(k.ring(BODY_X0 + 8, 26, 2.2, BODY_TOP_Z - 10, P, 12), { tone: "mid" }));

  return out.join("");
}

// 3. FULL-FRAME CMOS IMAGE SENSOR & 5-AXIS IBIS UNIT
function sensorIBIS() {
  const out = [];

  // Sensor sits at X = -24 (focal plane)
  // Outer stationary IBIS cage bracket
  const cage = { x: -28, y: -20, w: 5, d: 40, r: 2 };
  out.push(S(k.slabOf(cage, BODY_BASE_Z + 6, 38, P, 3, 0.5), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(cage, 1.5), BODY_BASE_Z + 25, P), { tone: "faint" }));

  // 4 Voice-coil magnetic actuators at corners of sensor
  const actuators = [
    [-26, -17, BODY_BASE_Z + 8],
    [-26, 17, BODY_BASE_Z + 8],
    [-26, -17, BODY_BASE_Z + 38],
    [-26, 17, BODY_BASE_Z + 38],
  ];
  for (const [ax, ay, az] of actuators) {
    const actBox = { x: ax - 1.5, y: ay - 2.5, w: 3, d: 5, r: 0.8 };
    out.push(S(k.slabOf(actBox, az - 2, 4, P, 2, 0.3), { tone: "hi" }));
    // S-bend suspension flexure spring leaf with terminal dots
    out.push(L(k.segment([ax, ay, az - 2], [ax, ay, az + 2], P), { tone: "lit" }));
    out.push(D([at([ax, ay, az - 2]), at([ax, ay, az + 2])], { size: 0.35, tone: "lit" }));
  }

  // Floating ceramic carrier plate (moves with IBIS stabilization)
  const carrier = { x: -26, y: -16, w: 2.2, d: 32, r: 1.5 };
  out.push(S(k.slabOf(carrier, OPTIC_Z - 15, 30, P, 3, 0.4), { tone: "mid" }));

  // Gold bonding pad frame around silicon die
  const dieFrame = { x: -24.8, y: -14, w: 1, d: 28, r: 0.8 };
  out.push(S(k.slabOf(dieFrame, OPTIC_Z - 12.5, 25, P, 2), { tone: "hi", crease: "none" }));
  // Gold bond wire dots along perimeter
  const wireDots = [];
  for (let z = OPTIC_Z - 11; z <= OPTIC_Z + 11; z += 3.5) {
    wireDots.push(at([-24.5, -13.5, z]), at([-24.5, 13.5, z]));
  }
  for (let y = -11; y <= 11; y += 4) {
    wireDots.push(at([-24.5, y, OPTIC_Z - 12]), at([-24.5, y, OPTIC_Z + 12]));
  }
  out.push(D(wireDots, { size: 0.32, tone: "lit" }));

  // Full-Frame 36x24mm Active Pixel CMOS Matrix - LIT ACCENT!
  // Active silicon die
  const activeDie = { x: -24.2, y: -12.5, w: 0.8, d: 25, r: 0.5 };
  out.push(S(k.slabOf(activeDie, OPTIC_Z - 10.5, 21, P, 2), { tone: "lit", lit: true }));

  // Bayer CFA (Color Filter Array) grid pattern on sensor surface
  for (let y = -9; y <= 9; y += 4.5) {
    out.push(L(k.segment([-23.8, y, OPTIC_Z - 10.5], [-23.8, y, OPTIC_Z + 10.5], P), { tone: "lit" }));
  }
  for (let z = OPTIC_Z - 7; z <= OPTIC_Z + 7; z += 3.5) {
    out.push(L(k.segment([-23.8, -12.5, z], [-23.8, 12.5, z], P), { tone: "lit" }));
  }

  // IR-Cut / Optical Low-Pass Filter (OLPF) glass cover plate in front
  const olpf = { x: -23.2, y: -13, w: 0.8, d: 26, r: 0.8 };
  out.push(S(k.slabOf(olpf, OPTIC_Z - 11, 22, P, 2), { tone: "hi", crease: "none" }));
  out.push(L(k.planOutline(olpf, OPTIC_Z + 11, P), { tone: "blue" }));

  // High-speed multi-pin flexible printed circuit (FPC) ribbon cable at sensor bottom
  const fpc = { x: -27, y: -10, w: 3, d: 20, r: 0.5 };
  out.push(S(k.slabOf(fpc, BODY_BASE_Z + 2, 4, P, 2), { tone: "lo", crease: "none" }));
  out.push(
    D(
      [-7, -3.5, 0, 3.5, 7].map((fy) => at([-25.5, fy, BODY_BASE_Z + 3.5])),
      { size: 0.32, tone: "mid" },
    ),
  );

  return out.join("");
}

// 4. FOCAL PLANE SHUTTER MECHANISM
function focalPlaneShutter() {
  const out = [];

  // Shutter chassis gate frame located at X = -20
  const shutterGate = { x: -20, y: -15, w: 2.5, d: 30, r: 1 };
  out.push(S(k.slabOf(shutterGate, OPTIC_Z - 13, 26, P, 2, 0.4), { tone: "mid" }));

  // Carbon fiber shutter curtain blades (top curtain)
  const topCurtain = { x: -19, y: -13, w: 0.6, d: 26, r: 0.4 };
  out.push(S(k.slabOf(topCurtain, OPTIC_Z + 2, 10, P, 2), { tone: "lo", crease: "none" }));

  // Carbon fiber shutter curtain blades (bottom curtain)
  const btmCurtain = { x: -19, y: -13, w: 0.6, d: 26, r: 0.4 };
  out.push(S(k.slabOf(btmCurtain, OPTIC_Z - 12, 9, P, 2), { tone: "lo", crease: "none" }));

  // Exposure slit between curtains (where light reaches sensor!)
  out.push(L(k.segment([-18.6, -13, OPTIC_Z - 2.5], [-18.6, 13, OPTIC_Z - 2.5], P), { tone: "lit" }));
  out.push(L(k.segment([-18.6, -13, OPTIC_Z + 1.5], [-18.6, 13, OPTIC_Z + 1.5], P), { tone: "lit" }));

  // Shutter actuator linkage pin
  out.push(S(k.cylinder(-19, -14, 1.2, OPTIC_Z + 6, 3, P, 12), { tone: "hi" }));

  return out.join("");
}

// 5. CHROME BAYONET LENS MOUNT & ELECTRONIC CONTACT PINS
function bayonetMount() {
  const out = [];

  // Heavy stainless steel / chrome bayonet mount flange ring at X = -10
  // Flange collar
  const mountCollar = { x: MOUNT_X - 2, y: -BARREL_R - 1, w: 4, d: (BARREL_R + 1) * 2, r: 2 };
  out.push(S(k.slabOf(mountCollar, OPTIC_Z - BARREL_R - 1, (BARREL_R + 1) * 2, P, 4, 0.6), { tone: "mid" }));

  // Chrome mount face ring
  out.push(
    S(
      k.slabOf(
        { x: MOUNT_X, y: -BARREL_R + 1, w: 2.5, d: (BARREL_R - 1) * 2, r: BARREL_R - 1 },
        OPTIC_Z - BARREL_R + 1,
        (BARREL_R - 1) * 2,
        P,
        8,
        0.5,
      ),
      { tone: "hi" },
    ),
  );

  // 8 Gold electronic lens communication leaf contact pins along lower arc
  const pinDots = [];
  for (let step = -4; step <= 4; step++) {
    if (step === 0) continue;
    const angle = (step / 5) * 0.7; // lower arc
    const py = Math.sin(angle) * (BARREL_R - 4.5);
    const pz = OPTIC_Z - Math.cos(angle) * (BARREL_R - 4.5);
    pinDots.push(at([MOUNT_X + 2.5, py, pz]));
  }
  out.push(D(pinDots, { size: 0.42, tone: "lit" }));

  // Red alignment index dot on mount top
  out.push(D([at([MOUNT_X + 2.5, 0, OPTIC_Z + BARREL_R - 1])], { size: 0.65, tone: "red" }));

  return out.join("");
}

// 6. CUTAWAY LENS BARREL & COMPOUND OPTICAL TRAIN
function lensBarrelAndOptics() {
  const out = [];

  // Cutaway Outer Metal Barrel (revealing inner optical elements)
  // Rear barrel section (mount to aperture): X = -8 to +16
  const rearBarrel = { x: -8, y: -BARREL_R, w: 24, d: BARREL_R * 2, r: 3 };
  out.push(S(k.slabOf(rearBarrel, OPTIC_Z - BARREL_R, BARREL_R * 2, P, 6, 0.8), { tone: "mid" }));
  // Grip knurl ring on rear barrel
  out.push(L(k.sideSeam(rearBarrel, OPTIC_Z - 8, P, 6), { tone: "lo" }));

  // Distance Scale Window on barrel top (X = 4 to 12)
  const distWindow = { x: 4, y: -6, w: 8, d: 12, r: 1.2 };
  out.push(S(k.slabOf(distWindow, OPTIC_Z + BARREL_R, 0.8, P, 2), { tone: "lo", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(distWindow, 0.8), OPTIC_Z + BARREL_R + 0.8, P), { tone: "faint" }));
  out.push(
    L(k.lineOnTop([6, -4], [6, 4], OPTIC_Z + BARREL_R + 0.8, P), { tone: "lit", free: true }), // Center index mark
    D([at([8, -3, OPTIC_Z + BARREL_R + 0.8]), at([8, 0, OPTIC_Z + BARREL_R + 0.8]), at([8, 3, OPTIC_Z + BARREL_R + 0.8])], {
      size: 0.35,
      tone: "hi",
    }),
  );

  // Aperture Diaphragm Ring Housing (X = 14 to 20)
  const irisHousing = { x: 14, y: -BARREL_R + 1, w: 6, d: (BARREL_R - 1) * 2, r: 2 };
  out.push(S(k.slabOf(irisHousing, OPTIC_Z - BARREL_R + 1, (BARREL_R - 1) * 2, P, 4, 0.5), { tone: "hi" }));
  // Aperture click stop markings on barrel
  for (let y = -10; y <= 10; y += 4) {
    out.push(D([at([17, y, OPTIC_Z + BARREL_R])], { size: 0.35, tone: "mid" }));
  }

  // Dual internal ground steel guide rails for focus carriage (X = 20 to 52)
  for (const ry of [-13, 13]) {
    const guideRail = { x: 20, y: ry - 1, w: 32, d: 2, r: 0.6 };
    out.push(S(k.slabOf(guideRail, OPTIC_Z - 1, 2, P, 2, 0.3), { tone: "hi" }));
    out.push(L(k.segment([20, ry, OPTIC_Z], [52, ry, OPTIC_Z], P), { tone: "lo" }));
  }

  // Voice-coil linear focus drive actuator magnets on bottom rail
  const vcmMagnet = { x: 24, y: -4, w: 24, d: 8, r: 1 };
  out.push(S(k.slabOf(vcmMagnet, OPTIC_Z - BARREL_R + 3, 4, P, 2, 0.4), { tone: "mid" }));
  out.push(L(k.segment([26, 0, OPTIC_Z - BARREL_R + 7], [46, 0, OPTIC_Z - BARREL_R + 7], P), { tone: "lit" }));
  out.push(D([at([26, 0, OPTIC_Z - BARREL_R + 7]), at([46, 0, OPTIC_Z - BARREL_R + 7])], { size: 0.35, tone: "lit" }));

  // Front barrel section & knurled rubber focus ring (X = 40 to 58)
  const frontBarrel = { x: 40, y: -BARREL_R, w: 18, d: BARREL_R * 2, r: 3 };
  out.push(S(k.slabOf(frontBarrel, OPTIC_Z - BARREL_R, BARREL_R * 2, P, 6, 0.8), { tone: "mid" }));
  out.push(L(k.sideSeam(frontBarrel, OPTIC_Z - 6, P, 6), { tone: "lo" }));
  out.push(L(k.sideSeam(frontBarrel, OPTIC_Z + 6, P, 6), { tone: "lo" }));

  // Front filter thread ring and bayonet hood flange (X = 58 to 64)
  const filterRing = { x: 58, y: -BARREL_R - 0.5, w: 6, d: (BARREL_R + 0.5) * 2, r: 2 };
  out.push(S(k.slabOf(filterRing, OPTIC_Z - BARREL_R - 0.5, (BARREL_R + 0.5) * 2, P, 6, 0.6), { tone: "hi" }));
  // Filter screw threads (closed concentric grooves)
  out.push(
    L(k.planOutline(filterRing, OPTIC_Z + BARREL_R, P), { tone: "lo" }),
    L(k.planOutline(k.insetPlan(filterRing, 1.5), OPTIC_Z + BARREL_R, P), { tone: "faint" }),
  );

  // Optical Glass Elements (Internal Train):
  // 1. Rear Field Flattener Glass (X = -4 to 0)
  const rearGlass = { x: -4, y: -11, w: 4, d: 22, r: 11 };
  out.push(S(k.slabOf(rearGlass, OPTIC_Z - 11, 22, P, 8, 0.8), { tone: "hi" }));
  out.push(L(k.planOutline(k.insetPlan(rearGlass, 1.5), OPTIC_Z + 11, P), { tone: "faint" }));

  // 2. Fixed Intermediate Aspherical Doublet (X = 44 to 50)
  const midGlass = { x: 44, y: -14, w: 6, d: 28, r: 14 };
  out.push(S(k.slabOf(midGlass, OPTIC_Z - 14, 28, P, 8, 1.2), { tone: "hi" }));
  out.push(L(k.planOutline(k.insetPlan(midGlass, 1.8), OPTIC_Z + 14, P), { tone: "faint" }));

  // 3. Large Front Collector Element (X = 56 to 62)
  const frontGlass = { x: 56, y: -16.5, w: 6, d: 33, r: 16.5 };
  out.push(S(k.slabOf(frontGlass, OPTIC_Z - 16.5, 33, P, 8, 1.5), { tone: "hi" }));
  // Anti-reflective coating green/magenta reflection ring
  out.push(L(k.planOutline(k.insetPlan(frontGlass, 1.5), OPTIC_Z + 16.5, P), { tone: "green" }));

  return out.join("");
}

// 7. MULTI-BLADE CIRCULAR APERTURE IRIS (DYNAMIC APERTURE DILATION)
function irisAperture() {
  const out = [];

  // Iris diaphragm outer mounting ring at X = 16
  const irisOuter = { x: 15.5, y: -14, w: 1.5, d: 28, r: 14 };
  out.push(S(k.slabOf(irisOuter, OPTIC_Z - 14, 28, P, 8), { tone: "lo", crease: "none" }));

  // Overlapping curved iris blades forming circular pupil aperture
  // 9 curved blades around the optical pupil
  const pupilR = 5.5; // default f/4 aperture radius
  const bladeCount = 9;
  for (let i = 0; i < bladeCount; i++) {
    const angle = (i / bladeCount) * Math.PI * 2;
    const by = Math.sin(angle) * pupilR;
    const bz = OPTIC_Z + Math.cos(angle) * pupilR;
    const ny = Math.sin(angle + 0.4) * (pupilR + 6);
    const nz = OPTIC_Z + Math.cos(angle + 0.4) * (pupilR + 6);
    // Blade overlap contour ending on dots
    out.push(L(k.segment([16, by, bz], [16, ny, nz], P), { tone: "mid" }));
    out.push(D([at([16, by, bz]), at([16, ny, nz])], { size: 0.32, tone: "lit" }));
  }

  // Clear aperture pupil circle (light opening - LIT ACCENT!)
  const pupilRing = { x: 15.8, y: -pupilR, w: 0.4, d: pupilR * 2, r: pupilR };
  out.push(L(k.planOutline(pupilRing, OPTIC_Z + pupilR, P), { tone: "lit" }));

  return out.join("");
}

// 8. MOVABLE INTERNAL FOCUS GROUP (SLIDING CARRIAGE & ELEMENT)
function focusCarriage() {
  const out = [];

  // Slider carriage block riding on guide rails (centered at default X = 32)
  const carriage = { x: 28, y: -14, w: 8, d: 28, r: 2 };
  out.push(S(k.slabOf(carriage, OPTIC_Z - 14, 28, P, 4, 0.6), { tone: "mid" }));

  // Brass bushings gripping the guide rails
  for (const by of [-13, 13]) {
    const bushing = { x: 27, y: by - 2, w: 10, d: 4, r: 1 };
    out.push(S(k.slabOf(bushing, OPTIC_Z - 2, 4, P, 2, 0.4), { tone: "hi" }));
  }

  // Internal movable focus glass element
  const focusGlass = { x: 29.5, y: -12, w: 5, d: 24, r: 12 };
  out.push(S(k.slabOf(focusGlass, OPTIC_Z - 12, 24, P, 8, 1.0), { tone: "hi" }));
  out.push(L(k.planOutline(k.insetPlan(focusGlass, 1.2), OPTIC_Z + 12, P), { tone: "faint" }));

  return out.join("");
}

// 9. LIGHT RAY BUNDLE & OPTICAL CONVERGENCE CONE
function opticalRayBundle() {
  const out = [];

  // Inverted optical ray bundle passing through lens elements to the CMOS sensor:
  // Rays enter front lens at X = 60, pass through pupil at X = 16, and converge to sharp focus at sensor X = -24
  const rays = [
    // Top ray bundle
    [
      [80, 0, OPTIC_Z + 16],
      [60, 0, OPTIC_Z + 15],
      [32, 0, OPTIC_Z + 8],
      [16, 0, OPTIC_Z + 5.5],
      [-24, 0, OPTIC_Z],
    ],
    // Bottom ray bundle
    [
      [80, 0, OPTIC_Z - 16],
      [60, 0, OPTIC_Z - 15],
      [32, 0, OPTIC_Z - 8],
      [16, 0, OPTIC_Z - 5.5],
      [-24, 0, OPTIC_Z],
    ],
    // Left ray bundle
    [
      [80, -16, OPTIC_Z],
      [60, -15, OPTIC_Z],
      [32, -8, OPTIC_Z],
      [16, -5.5, OPTIC_Z],
      [-24, 0, OPTIC_Z],
    ],
    // Right ray bundle
    [
      [80, 16, OPTIC_Z],
      [60, 15, OPTIC_Z],
      [32, 8, OPTIC_Z],
      [16, 5.5, OPTIC_Z],
      [-24, 0, OPTIC_Z],
    ],
  ];

  // Draw optical rays with directional dashes & lit accent
  for (const ray of rays) {
    for (let i = 0; i < ray.length - 1; i++) {
      out.push(L(k.segment(ray[i], ray[i + 1], P), { tone: "lit", dashed: true }));
      out.push(D([at(ray[i])], { size: 0.35, tone: "lit" }));
    }
  }

  // Optical axis centerline datum
  out.push(L(k.segment([60, 0, OPTIC_Z], [-24, 0, OPTIC_Z], P), { tone: "faint", dotted: true }));

  // Focal point indicator dot right on the active CMOS silicon plane
  out.push(D([at([-24, 0, OPTIC_Z])], { size: 0.75, tone: "lit" }));

  return out.join("");
}

// 10. REAR TILT LCD MONITOR & DIGITAL VIEWFINDER DISPLAY
function rearMonitor() {
  const out = [];

  // Rear monitor frame assembly at X = BODY_X0 - 3 (tilted slightly upward)
  const lcdFrame = { x: BODY_X0 - 4, y: -20, w: 3, d: 38, r: 2 };
  out.push(S(k.slabOf(lcdFrame, 12, 32, P, 3, 0.6), { tone: "mid" }));

  // LCD glass display window
  const lcdGlass = { x: BODY_X0 - 4.5, y: -18, w: 0.6, d: 34, r: 1 };
  out.push(S(k.slabOf(lcdGlass, 14, 28, P, 2), { tone: "lo", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(lcdGlass, 0.6), 42, P), { tone: "faint" }));

  // Live electronic viewfinder camera readout:
  // Shows live optical feed parameters, exposure histogram, and green PDAF focus point!
  out.push(
    k.faceTextSvg(k.sideMatrix([-4.6, -16], 39, P, "left"), "1/500  f/2.8", {
      size: 2.2,
      tone: "lit",
    }),
    k.faceTextSvg(k.sideMatrix([-4.6, -16], 35, P, "left"), "ISO 200  RAW", {
      size: 2.0,
      tone: "hi",
    }),
    k.faceTextSvg(k.sideMatrix([-4.6, -16], 31, P, "left"), "IBIS: ON  [+0.0]", {
      size: 1.8,
      tone: "mid",
    }),
  );

  // Autofocus Phase Detection (PDAF) green target reticle box on center of LCD
  const afBox = { x: BODY_X0 - 4.6, y: -3.5, w: 0.1, d: 7, r: 0.5 };
  out.push(L(k.planOutline(afBox, 29, P), { tone: "green" }));
  out.push(D([at([BODY_X0 - 4.6, 0, 26])], { size: 0.45, tone: "green" }));

  // Live exposure histogram curve on lower-right of LCD
  const hist = [
    [BODY_X0 - 4.6, 6, 16],
    [BODY_X0 - 4.6, 8, 19],
    [BODY_X0 - 4.6, 10, 22],
    [BODY_X0 - 4.6, 12, 18],
    [BODY_X0 - 4.6, 14, 16],
  ];
  for (let i = 0; i < hist.length - 1; i++) {
    out.push(L(k.segment(hist[i], hist[i + 1], P), { tone: "hi" }));
  }
  out.push(D(hist.map(at), { size: 0.32, tone: "hi" }));

  return out.join("");
}

// ASSEMBLE FULL SVG FIGURE
const startFocus = 0;   // focus group offset (mm)
const startAperture = 0; // iris scale factor

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "A cutaway modern mirrorless digital camera on an optical test bench. Light rays enter through a multi-element optical lens with an aspherical front element, pass a movable focus group on linear guide rails, and traverse a 9-blade circular iris aperture diaphragm. The light bundle converges through a dual-curtain focal plane shutter onto a 36x24mm full-frame BSI CMOS sensor suspended by a 5-axis voice-coil image stabilization (IBIS) system. The rear tilting LCD screen displays a live digitized readout with shutter speed, f-stop, ISO, histogram, and green phase-detection autofocus reticle.",
  body: [
    // 1. Optical bench datum plate & rails
    opticalBench(),

    // 2. Camera body magnesium chassis
    cameraBody(),

    // 3. Sensor cage & 5-axis IBIS voice-coil suspension
    sensorIBIS(),

    // 4. Dual-curtain focal plane shutter
    focalPlaneShutter(),

    // 5. Bayonet mount flange with electronic contact pins
    bayonetMount(),

    // 6. Cutaway outer lens barrel & optical glass train
    lensBarrelAndOptics(),

    // 7. Multi-blade circular aperture iris diaphragm
    `<g data-part="iris">`,
    irisAperture(),
    `</g>`,

    // 8. Movable internal focus lens group carriage
    `<g data-part="focus" transform="${k.translateAlong(P, [startFocus, 0, 0])}">`,
    focusCarriage(),
    `</g>`,

    // 9. Converging optical ray bundle
    `<g data-part="rays">`,
    opticalRayBundle(),
    `</g>`,

    // 10. Rear tilt LCD monitor with live camera parameters
    rearMonitor(),
  ],
});

// LIVE SCRIPT FOR BROWSER INTERACTION
const live = `
const P = ${JSON.stringify(P)};
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const focusGroup = svg.querySelector('[data-part="focus"]');
const irisGroup = svg.querySelector('[data-part="iris"]');
const raysGroup = svg.querySelector('[data-part="rays"]');
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");

// Camera state parameters
let state = {
  focusDist: 1.8, // meters (0.3m macro to infinity)
  focusX: 0,      // carriage offset in mm (-6 to +6)
  targetFocusX: 0,
  apertureIndex: 2, // 0: f/1.4, 1: f/2.0, 2: f/2.8, 3: f/4, 4: f/5.6, 5: f/8, 6: f/16
  shutterSpeed: "1/500s",
  iso: 200,
  ibisActive: true,
};

const F_STOPS = ["f/1.4", "f/2.0", "f/2.8", "f/4.0", "f/5.6", "f/8.0", "f/16"];
const PUPIL_RADII = [10.0, 7.5, 5.5, 4.0, 2.8, 2.0, 1.4];

let frame = 0, last = 0, clock = 0, touring = true, visible = false, idleTimer = 0;

const clamp = (val, min, max) => Math.min(max, Math.max(min, val));

// Tour: smoothly cycles through focus pulls and aperture stops
function tourAt(t) {
  const cycle = 8.0;
  const phase = t % cycle;
  
  if (phase < 2.5) {
    // Focus sweep from infinity to portrait distance
    const p = phase / 2.5;
    return { focusX: -5 + p * 10, fIndex: 2, shutter: "1/500s" };
  } else if (phase < 4.5) {
    // Aperture sweep to f/1.4 shallow depth of field
    const p = (phase - 2.5) / 2.0;
    const fIdx = Math.round(2 - p * 2);
    return { focusX: 5, fIndex: fIdx, shutter: "1/2000s" };
  } else if (phase < 6.5) {
    // Aperture stop down to f/11 deep focus
    const p = (phase - 4.5) / 2.0;
    const fIdx = Math.round(p * 5);
    return { focusX: 5 - p * 10, fIndex: fIdx, shutter: "1/125s" };
  } else {
    // Reset to f/2.8 standard
    return { focusX: -5, fIndex: 2, shutter: "1/500s" };
  }
}

function updateScene() {
  focusGroup.setAttribute("transform", translateAlong(P, [state.focusX, 0, 0]));

  const fStr = F_STOPS[state.apertureIndex];
  const dist = (1.5 + (state.focusX + 5) * 0.4).toFixed(1);
  const isSharp = Math.abs(state.focusX) < 1.2;

  const text = fStr + " · " + dist + "m " +
    (isSharp ? "(SHARP)" : "(BLUR)") + " · " +
    state.shutterSpeed + " · ISO " + state.iso + " · IBIS";

  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuenow", String(Math.round(state.focusX * 10)));
  stage.setAttribute("aria-valuetext", text);
}

function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;

  if (touring) {
    clock += dt;
    const tour = tourAt(clock);
    state.targetFocusX = tour.focusX;
    state.apertureIndex = tour.fIndex;
    state.shutterSpeed = tour.shutter;
  }

  // Smooth exponential easing
  const speed = calm ? 1.0 : 1 - Math.exp(-dt / 0.22);
  state.focusX += (state.targetFocusX - state.focusX) * speed;

  if (Math.abs(state.targetFocusX - state.focusX) < 0.01) state.focusX = state.targetFocusX;

  updateScene();

  const settled = !touring && state.focusX === state.targetFocusX;
  frame = visible && !settled ? requestAnimationFrame(tick) : 0;
}

const run = () => {
  if (!frame && visible) {
    last = 0;
    frame = requestAnimationFrame(tick);
  }
};

const steer = (nx, nAperture) => {
  touring = false;
  if (nx !== undefined) state.targetFocusX = clamp(nx, -6, 6);
  if (nAperture !== undefined) state.apertureIndex = clamp(nAperture, 0, F_STOPS.length - 1);

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

// Interactive pointer controls:
// Horizontal drag adjusts focus group position
// Vertical drag adjusts aperture f-stop
stage.addEventListener("pointermove", (event) => {
  const box = svg.getBoundingClientRect();
  const shareX = clamp((event.clientX - box.left) / box.width, 0, 1);
  const shareY = clamp((event.clientY - box.top) / box.height, 0, 1);

  const nx = -6 + shareX * 12;
  const nAp = Math.round(shareY * (F_STOPS.length - 1));
  steer(nx, nAp);
});

stage.addEventListener("pointerleave", () => {
  steer(state.targetFocusX, state.apertureIndex);
});

// Arrow key stepping
stage.addEventListener("keydown", (event) => {
  let handled = true;
  if (event.key === "ArrowLeft") steer(state.targetFocusX - 1.2);
  else if (event.key === "ArrowRight") steer(state.targetFocusX + 1.2);
  else if (event.key === "ArrowUp") steer(undefined, state.apertureIndex - 1);
  else if (event.key === "ArrowDown") steer(undefined, state.apertureIndex + 1);
  else if (event.key === "Home") steer(0, 2);
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
  title: "Modern Digital Camera",
  hint: "Drag to focus · Space to cycle",
  readout: "f/2.8 · 1.8m (SHARP) · 1/500s · ISO 200 · IBIS",
  keys: [
    { mark: "lit", label: "CMOS sensor Bayer matrix & converging optical rays" },
    { mark: "raised", label: "Internal sliding focus group & 9-blade iris diaphragm" },
    { mark: "mid", label: "Cutaway magnesium body chassis & 5-axis IBIS cage" },
  ],
  caption:
    "A modern full-frame mirrorless digital camera. Light rays enter an anti-reflective front element, traverse a voice-coil driven internal focus group on linear rails, and pass through an iris diaphragm that controls depth of field. A high-speed dual-curtain shutter exposes the 36×24 mm back-illuminated CMOS sensor suspended by a 5-axis voice-coil IBIS mechanism. Photons striking the RGB Bayer filter array generate digitized pixel charges, instantly feeding the rear tilt LCD with real-time exposure and phase-detection autofocus.",
  body: `<div class="iso-stage" tabindex="0" role="slider" aria-label="Modern Digital Camera: arrow keys adjust focus and aperture, space toggles autofocus tour" aria-valuemin="-60" aria-valuemax="60" aria-valuenow="0">${svg}</div>`,
});

const htmlContent = k.pageHtml({
  title: "Modern Digital Camera — Anatomy",
  theme,
  body,
  script: kitScript() + live,
});

const outName = theme === "light" ? "camera-light.html" : "camera.html";
writeFileSync(join(HERE, outName), htmlContent);
console.log("wrote", outName);
