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
const ELEVATION = 28;

// ==========================================
// 1. STARK LABORATORIES TEST STAND BASE
// ==========================================
const BASE = { x: -130, y: -100, w: 260, d: 200, r: 12 };
const BASE_H = 16;
const FOOT_H = 6;
const BASE_TOP_Z = -48;

// Reactor Center in World Coordinates
const RX = 0;
const RY = 0;
const RZ = 18;
const MAJOR_R = 42.0; // Major radius of plasma torus
const MINOR_R = 7.5;  // Minor tube radius of torus

// Exploded Assembly Pieces
const PIECES = {
  stand: { name: "Laboratory containment stand", say: "laboratory test stand · rigid cradle and vibration dampers", move: [0, 0, 0] },
  housing: { name: "Permalloy magnetic shield & casing", say: "titanium outer casing · high-permeability magnetic shielding", move: [0, 0, -32] },
  cooling: { name: "Liquid helium cryogenic manifold", say: "liquid helium micro-channels · superconductor thermal bus", move: [0, 0, -18] },
  torus: { name: "Toroidal quartz vacuum vessel", say: "ultra-high vacuum toroidal chamber · aneutronic plasma vessel", move: [0, 0, 0] },
  coils: { name: "10 Toroidal superconducting coils", say: "HTS superconducting solenoid coils · 14-Tesla magnetic confinement", move: [0, 0, 20] },
  mhd: { name: "Direct MHD induction pickups", say: "direct magnetohydrodynamic pick-up coils · 3 GJ/s electricity generation", move: [0, 0, 36] },
  core: { name: "Palladium isotope core cartridge", say: "palladium-rhodium isotope matrix · laser pre-ionization diodes", move: [0, 0, 50] },
  spider: { name: "Copper contact spider & spokes", say: "10-segment gold/copper radial busbars · central cathode distribution", move: [0, 0, 64] },
  mesh: { name: "Faraday shield & phosphor grid", say: "titanium RF shield grid · phosphor plasma light diffuser", move: [0, 0, 76] },
  bezel: { name: "Titanium retaining bezel ring", say: "aerospace titanium bezel ring · knurled perimeter lock lugs", move: [0, 0, 88] },
  lens: { name: "Quartz crystal protective window", say: "anti-reflective coated optical quartz crystal lens", move: [0, 0, 100] },
};

const STAGGER = [
  "lens",
  "bezel",
  "mesh",
  "spider",
  "core",
  "mhd",
  "coils",
  "torus",
  "cooling",
  "housing",
  "stand",
];

const ORDER_DISPLAY = [
  "lens",
  "bezel",
  "mesh",
  "spider",
  "core",
  "coils",
  "torus",
  "mhd",
  "cooling",
  "housing",
  "stand",
];

const SPRING = { stagger: 0.035, stiffness: 68, damping: 14.8, substeps: 4 };

// Camera projection fitting
const BOUNDS = [
  ...k.boxCorners(BASE, BASE_TOP_Z - BASE_H - FOOT_H, BASE_TOP_Z),
  [-110, 0, 110],
  [110, 0, 110],
  [0, -100, 115],
  [0, 100, 115],
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
// 1. LABORATORY TEST STAND & BASE (`stand`)
// ==========================================
function buildStand() {
  const z0 = BASE_TOP_Z - BASE_H;
  put("stand", [0, 0, z0], `<path class="iso-halo" d="${k.haloOf(BASE, z0 - FOOT_H, BASE_H, P)}"/>`);

  // 4 Precision Leveling Vibration-Damping Feet
  for (const [x, y] of byDepth(k.corners(BASE, 22))) {
    put(
      "stand",
      [x, y, z0],
      S(k.cylinder(x, y, 9.2, z0 - FOOT_H, 2.8, P, 28), { tone: "lo" }) +
        S(k.cylinder(x, y, 7.0, z0 - FOOT_H + 2.8, FOOT_H - 2.8, P, 28), { tone: "mid" }) +
        L(k.sideArc(x, y, 7.0, z0 - FOOT_H + 4.2, P, 16), { tone: "lo" })
    );
  }

  // Precision Granite / Cast Bedplate
  put("stand", [0, 0, BASE_TOP_Z], S(k.slabOf(BASE, z0, BASE_H, P, 8, 2.0), { tone: "mid" }));
  put("stand", [0, 0, BASE_TOP_Z], L(k.planOutline(k.insetPlan(BASE, 7), BASE_TOP_Z, P), { tone: "lo" }));

  // Corner Socket Cap Bolts
  const bolts = k.corners(BASE, 14);
  put(
    "stand",
    [0, 0, BASE_TOP_Z],
    L(bolts.map(([x, y]) => k.ring(x, y, 2.8, BASE_TOP_Z, P, 16)).join(""), { tone: "lo" }) +
      D(bolts.map(([x, y]) => at([x, y, BASE_TOP_Z])), { size: 0.5, tone: "hi" })
  );

  // Front Millimeter Datum Scale Strip
  const strip = { x: -110, y: BASE.y + BASE.d - 16, w: 220, d: 8.0, r: 1.2 };
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

  // Stark Industries Specification Plaque
  const plaque = { x: -118, y: -82, w: 52, d: 26, r: 1.5 };
  put(
    "stand",
    [plaque.x + plaque.w / 2, plaque.y + plaque.d / 2, BASE_TOP_Z],
    S(k.slabOf(plaque, BASE_TOP_Z, 0.8, P, 3), { tone: "lo", crease: "none" }) +
      L(k.planOutline(k.insetPlan(plaque, 1.8), BASE_TOP_Z + 0.8, P), { tone: "faint" }) +
      L(k.lineOnTop([-114, -76], [-74, -76], BASE_TOP_Z + 0.8, P), { tone: "lo", free: true }) +
      L(k.lineOnTop([-114, -70], [-82, -70], BASE_TOP_Z + 0.8, P), { tone: "lo", free: true }) +
      L(k.lineOnTop([-114, -64], [-90, -64], BASE_TOP_Z + 0.8, P), { tone: "lo", free: true }) +
      D(
        [
          at([-116, -80, BASE_TOP_Z + 0.8]),
          at([-68, -80, BASE_TOP_Z + 0.8]),
          at([-116, -58, BASE_TOP_Z + 0.8]),
          at([-68, -58, BASE_TOP_Z + 0.8]),
        ],
        { size: 0.35, tone: "mid" }
      )
  );

  // 4 Rigid Titanium Containment Cradle Struts holding Reactor Ring at Z = 12
  for (const [cx, cy] of [[-48, -48], [48, -48], [48, 48], [-48, 48]]) {
    const postBox = { x: cx - 5, y: cy - 5, w: 10, d: 10, r: 2 };
    put("stand", [cx, cy, BASE_TOP_Z], S(k.slabOf(postBox, BASE_TOP_Z, 10 - BASE_TOP_Z, P, 2, 0.5), { tone: "mid" }));
    put("stand", [cx, cy, 10], S(k.cylinder(cx, cy, 4.2, 10, 4, P, 18), { tone: "hi" }));
  }
}

// ==========================================
// 2. PERMALLOY MAGNETIC SHIELD & HOUSING (`housing`)
// ==========================================
function buildHousing() {
  const F_z = G.frameAlong([RX, RY, RZ], [0, 0, 1]);

  // Outer Titanium Containment Cylinder (Radius = 55 mm, Z = 6 to 24)
  put("housing", [RX, RY, 12], S(G.disc(6, 24, 55.0, F_z, P), { tone: "mid" }));
  put("housing", [RX, RY, 24], L(G.circleOf(F_z, 24, 55.0, P, 48), { tone: "lo" }));
  put("housing", [RX, RY, 6], L(G.circleOf(F_z, 6, 55.0, P, 48), { tone: "faint" }));

  // Permalloy Magnetic Shielding Backplate (Z = 6 to 9, Radius = 54 mm)
  put("housing", [RX, RY, 7], S(G.disc(6, 9, 54.0, F_z, P), { tone: "lo" }));

  // Gold-Plated Anode Terminal Busbars and Heavy Silicone HV Cables on underside
  for (const ang of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
    const bx = 38 * Math.cos(ang);
    const by = 38 * Math.sin(ang);
    put("housing", [bx, by, 6], S(k.cylinder(bx, by, 3.5, 2, 4, P, 16), { tone: "hi" }));
    put("housing", [bx, by, 2], D([at([bx, by, 2])], { size: 0.45, tone: "lit" }));
  }
}

// ==========================================
// 3. CRYOGENIC LIQUID HELIUM MANIFOLD (`cooling`)
// ==========================================
function buildCooling() {
  const F_z = G.frameAlong([RX, RY, RZ], [0, 0, 1]);

  // Toroidal Cryogenic Micro-Channel Ring (Outer R = 51 mm, Inner R = 47 mm, Z = 9 to 13)
  put("cooling", [RX, RY, 11], S(G.disc(9, 13, 51.0, F_z, P), { tone: "hi" }));
  put("cooling", [RX, RY, 13], L(G.circleOf(F_z, 13, 51.0, P, 40), { tone: "lit" }));

  // Braided Stainless Steel Cryogenic Feed Lines (AN-4 Fittings)
  const cryoRoute1 = [
    [-52, 0, 11],
    [-64, 0, 8],
    [-70, 0, -20],
  ];
  tubePieces(cryoRoute1, 2.4, P, { maxLength: 20 }).forEach((part) => {
    put("cooling", part.mid, tubeSvg(part, { tone: "mid" }));
  });

  const cryoRoute2 = [
    [52, 0, 11],
    [64, 0, 8],
    [70, 0, -20],
  ];
  tubePieces(cryoRoute2, 2.4, P, { maxLength: 20 }).forEach((part) => {
    put("cooling", part.mid, tubeSvg(part, { tone: "mid" }));
  });
}

// ==========================================
// 4. TOROIDAL QUARTZ VACUUM VESSEL (`torus`)
// ==========================================
function buildTorus() {
  const F_z = G.frameAlong([RX, RY, RZ], [0, 0, 1]);

  // Toroidal Vacuum Vessel (Inner wall R = 34.5 mm, Outer wall R = 49.5 mm, Z = 11 to 25)
  put("torus", [RX, RY, RZ], S(G.disc(11, 25, 49.5, F_z, P), { tone: "lo" }));
  put("torus", [RX, RY, 25], L(G.circleOf(F_z, 25, 49.5, P, 48), { tone: "hi" }));
  put("torus", [RX, RY, 25], L(G.circleOf(F_z, 25, 34.5, P, 40), { tone: "lit" }));
  put("torus", [RX, RY, 11], L(G.circleOf(F_z, 11, 34.5, P, 40), { tone: "mid" }));
}

// ==========================================
// 5. 10 TOROIDAL SUPERCONDUCTING COILS (`coils`)
// ==========================================
function buildCoils() {
  // 10 Superconducting Coils distributed at 36-degree intervals
  for (let i = 0; i < 10; i++) {
    const ang = i * (Math.PI / 5); // 36 degrees = pi/5
    const cx = MAJOR_R * Math.cos(ang);
    const cy = MAJOR_R * Math.sin(ang);
    const axis = [-Math.sin(ang), Math.cos(ang), 0]; // Tangent to torus
    const F_coil = G.frameAlong([cx, cy, RZ], axis);

    // Copper Solenoid Coil Body (wrapping the torus tube)
    put(
      "coils",
      [cx, cy, RZ],
      S(G.disc(-4.0, 4.0, 9.8, F_coil, P), { tone: "lit", lit: true }) +
        L(G.circleOf(F_coil, -3.8, 9.8, P, 20), { tone: "lo" }) +
        L(G.circleOf(F_coil, 0, 9.8, P, 20), { tone: "hi" }) +
        L(G.circleOf(F_coil, 3.8, 9.8, P, 20), { tone: "lo" })
    );

    // Gold Terminal Lugs on Outer Edge
    const lugPt = [cx + 9.8 * Math.cos(ang), cy + 9.8 * Math.sin(ang), RZ];
    put("coils", lugPt, S(k.cylinder(lugPt[0], lugPt[1], 1.8, RZ - 2, 4, P, 12), { tone: "hi" }));
    put("coils", lugPt, D([at([lugPt[0], lugPt[1], RZ + 2])], { size: 0.4, tone: "lit" }));
  }
}

// ==========================================
// 6. DIRECT MHD INDUCTION PICKUPS (`mhd`)
// ==========================================
function buildMhdPickups() {
  const F_z = G.frameAlong([RX, RY, RZ], [0, 0, 1]);

  // Segmented RF Induction Pick-Up Plates situated between each pair of coils
  for (let i = 0; i < 10; i++) {
    const ang = (i + 0.5) * (Math.PI / 5); // Halfway between coils
    const mx = MAJOR_R * Math.cos(ang);
    const my = MAJOR_R * Math.sin(ang);
    const plateBox = { x: mx - 3, y: my - 3, w: 6, d: 6, r: 1.2 };
    put("mhd", [mx, my, RZ + 8], S(k.slabOf(plateBox, RZ + 6, 2.5, P, 2, 0.4), { tone: "hi" }));
    put("mhd", [mx, my, RZ + 8.5], D([at([mx, my, RZ + 8.5])], { size: 0.35, tone: "lit" }));
  }

  // Inner Faraday Energy Collector Ring (R = 32 mm, Z = 20 to 23)
  put("mhd", [RX, RY, 22], S(G.disc(20, 23, 32.0, F_z, P), { tone: "mid" }));
  put("mhd", [RX, RY, 23], L(G.circleOf(F_z, 23, 32.0, P, 36), { tone: "lo" }));
}

// ==========================================
// 7. PALLADIUM ISOTOPE CORE CARTRIDGE (`core`)
// ==========================================
function buildCore() {
  const F_z = G.frameAlong([RX, RY, RZ], [0, 0, 1]);

  // Central Palladium-Rhodium Isotope Matrix (Radius = 14 mm, Z = 14 to 24)
  put("core", [RX, RY, 19], S(G.disc(14, 24, 14.0, F_z, P), { tone: "hi" }));
  put("core", [RX, RY, 24], L(G.circleOf(F_z, 24, 14.0, P, 32), { tone: "lit" }));

  // Concentric Inner Cathode Ring (Radius = 8.5 mm, Z = 20 to 26)
  put("core", [RX, RY, 23], S(G.disc(20, 26, 8.5, F_z, P), { tone: "lit", lit: true }));
  put("core", [RX, RY, 26], L(G.circleOf(F_z, 26, 8.5, P, 24), { tone: "hi" }));

  // Tungsten Central High-Voltage Arc Discharge Pin (Radius = 2.5 mm, Z = 22 to 28)
  put("core", [RX, RY, 25], S(G.disc(22, 28, 2.5, F_z, P), { tone: "lit", lit: true }));
  put("core", [RX, RY, 28], D([at([RX, RY, 28])], { size: 0.55, tone: "lit" }));

  // Hexagonal Laser Diode Pre-Ionization Injection Apertures
  for (let i = 0; i < 6; i++) {
    const ang = i * (Math.PI / 3);
    const lx = 11.5 * Math.cos(ang);
    const ly = 11.5 * Math.sin(ang);
    put("core", [lx, ly, 24], D([at([lx, ly, 24.2])], { size: 0.45, tone: "lit" }));
  }
}

// ==========================================
// 8. COPPER CONTACT SPIDER & SPOKES (`spider`)
// ==========================================
function buildSpider() {
  const F_z = G.frameAlong([RX, RY, RZ], [0, 0, 1]);

  // Inner Copper Distribution Hub Ring (Radius = 16 mm, Z = 25 to 27)
  put("spider", [RX, RY, 26], S(G.disc(25, 27, 16.0, F_z, P), { tone: "hi" }));

  // 10 Radiating Gold/Copper Busbar Spokes connecting Core to Coils
  for (let i = 0; i < 10; i++) {
    const ang = i * (Math.PI / 5);
    const p0 = [16 * Math.cos(ang), 16 * Math.sin(ang), 26];
    const p1 = [33 * Math.cos(ang), 33 * Math.sin(ang), 26];
    tubePieces([p0, p1], 1.4, P, { maxLength: 20 }).forEach((part) => {
      put("spider", part.mid, tubeSvg(part, { tone: "hi" }));
    });
  }
}

// ==========================================
// 9. FARADAY MESH & PHOSPHOR GRID (`mesh`)
// ==========================================
function buildFaradayMesh() {
  const F_z = G.frameAlong([RX, RY, RZ], [0, 0, 1]);

  // Titanium Wire Mesh Grid Outer Ring (Radius = 35 mm, Z = 27 to 29)
  put("mesh", [RX, RY, 28], S(G.disc(27, 29, 35.0, F_z, P), { tone: "mid" }));
  put("mesh", [RX, RY, 29], L(G.circleOf(F_z, 29, 35.0, P, 36), { tone: "lo" }));

  // Concentric Phosphor Diffuser Rings
  put("mesh", [RX, RY, 29], L(G.circleOf(F_z, 29, 28.0, P, 32), { tone: "faint" }));
  put("mesh", [RX, RY, 29], L(G.circleOf(F_z, 29, 21.0, P, 28), { tone: "faint" }));
}

// ==========================================
// 10. TITANIUM RETAINING BEZEL RING (`bezel`)
// ==========================================
function buildBezel() {
  const F_z = G.frameAlong([RX, RY, RZ], [0, 0, 1]);

  // Outer Aerospace Titanium Bezel Ring (Outer R = 56 mm, Inner R = 47 mm, Z = 24 to 30)
  put("bezel", [RX, RY, 27], S(G.disc(24, 30, 56.0, F_z, P), { tone: "hi" }));
  put("bezel", [RX, RY, 30], L(G.circleOf(F_z, 30, 56.0, P, 48), { tone: "lit" }));
  put("bezel", [RX, RY, 30], L(G.circleOf(F_z, 30, 47.0, P, 40), { tone: "lo" }));

  // 10 Perimeter Locking Lugs & Socket Screws
  for (let i = 0; i < 10; i++) {
    const ang = i * (Math.PI / 5);
    const sx = 52 * Math.cos(ang);
    const sy = 52 * Math.sin(ang);
    put("bezel", [sx, sy, 30], D([at([sx, sy, 30.2])], { size: 0.45, tone: "lit" }));
  }
}

// ==========================================
// 11. QUARTZ CRYSTAL PROTECTIVE WINDOW (`lens`)
// ==========================================
function buildLens() {
  const F_z = G.frameAlong([RX, RY, RZ], [0, 0, 1]);

  // Anti-Reflective Optical Crystal Lens (Radius = 46.5 mm, Z = 30 to 33)
  put("lens", [RX, RY, 31.5], S(G.disc(30, 33, 46.5, F_z, P), { tone: "lit", lit: true }));
  put("lens", [RX, RY, 33], L(G.circleOf(F_z, 33, 46.5, P, 44), { tone: "lo" }));
  put("lens", [RX, RY, 33], L(G.circleOf(F_z, 33, 30.0, P, 32), { tone: "faint" }));
}

// Build all Arc Reactor systems
buildStand();
buildHousing();
buildCooling();
buildTorus();
buildCoils();
buildMhdPickups();
buildCore();
buildSpider();
buildFaradayMesh();
buildBezel();
buildLens();

A.settle(R, P);
items.sort((a, b) => a.key - b.key);

const groups = items.map((item, index) => {
  const [mx, my, mz] = item.move;
  return `<g class="it" data-piece="${item.piece}"${item.ride !== item.piece ? ` data-ride="${item.ride}"` : ""}${item.role ? ` data-role="${item.role}"` : ""} data-k="${item.key.toFixed(2)}" data-m="${mx.toFixed(1)},${my.toFixed(1)},${mz.toFixed(1)}" data-i="${index}">${item.svg}</g>`;
});

const back = `<g class="arc-back-grid">${k.lineSvg(k.planOutline(k.insetPlan(BASE, 2), BASE_TOP_Z, P), { tone: "faint" })}</g>`;
const backSvg = k.figureSvg({ width: W, height: H, label: "Arc Reactor Laboratory Containment Stand", body: back, className: "arc-back" });
const frontSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg arc-front" viewBox="0 0 ${W} ${H}" aria-hidden="true"><g class="arc-engine">${groups.join("")}</g></svg>`;

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
  reactorCenter: [RX, RY, RZ],
  majorR: MAJOR_R,
  minorR: MINOR_R,
};

// Controls and Legend Elements
const corners = `<div class="iso-plate-corners" aria-hidden="true"><span class="iso-plate-corner" data-corner="fig">Fig 1</span><span class="iso-plate-corner" data-corner="title">Stark Arc Reactor · Aneutronic Toroid</span><span class="iso-plate-corner" data-corner="readout" data-readout>3.00 GJ/s · 128.5M K CORE · 14.8 T CONFINEMENT</span></div>`;

const controls = `<div class="arc-controls">
  <div class="arc-btn-group">
    <button type="button" class="arc-btn" data-run><span class="arc-lamp" aria-hidden="true"></span><span data-run-label>Standby</span></button>
    <button type="button" class="arc-btn" data-apart><span class="arc-lamp" aria-hidden="true"></span><span data-apart-label>Explode</span></button>
    <button type="button" class="arc-btn" data-xray><span class="arc-lamp" aria-hidden="true"></span><span data-xray-label>Flux X-Ray</span></button>
  </div>
  <span class="arc-hint">[Space] Ignite/Standby · [X] Flux X-Ray · [E] Explode · [↑/↓] Throttle</span>
  <span class="arc-live" aria-live="polite" data-live></span>
</div>`;

// 10-Coil Diagnostics Array Strip
const coilPills = Array.from({ length: 10 }, (_, i) => `<span class="arc-coil-pill" data-coil="${i + 1}">COIL ${i + 1}</span>`).join("");
const coilsArray = `<div class="arc-coils-wrap">
  <div class="arc-coils-label">
    <span>Toroidal Superconducting Coil Array (14 Tesla Confinement)</span>
    <span>HTS REBCO 77K</span>
  </div>
  <div class="arc-coils-strip">${coilPills}</div>
</div>`;

// Telemetry Console
const telemConsole = `<div class="arc-console">
  <div class="arc-telemetry">
    <div class="arc-telem-item"><span class="arc-telem-label">Output Power</span><span class="arc-telem-val" data-telem-power>3.00 GJ/s (3,000 MW)</span></div>
    <div class="arc-telem-item"><span class="arc-telem-label">Core Temperature</span><span class="arc-telem-val" data-telem-temp>128.5 × 10⁶ K</span></div>
    <div class="arc-telem-item"><span class="arc-telem-label">Magnetic Field</span><span class="arc-telem-val" data-telem-field>14.8 Tesla</span></div>
    <div class="arc-telem-item"><span class="arc-telem-label">Plasma Density</span><span class="arc-telem-val" data-telem-density>2.06 × 10²⁰ m⁻³</span></div>
    <div class="arc-telem-item"><span class="arc-telem-label">MHD Direct Conversion</span><span class="arc-telem-val" data-telem-eff>89.4% Direct MHD</span></div>
  </div>
</div>`;

const powerBar = `<div class="arc-power-bar">
  <span>REACTOR THROTTLE: 0.5 GJ/s</span>
  <input type="range" class="arc-power-slider" min="0.5" max="5.0" value="3.0" step="0.1" aria-label="Throttle Arc Reactor power output (0.5 to 5.0 GJ/s)">
  <span>5.0 GJ/s (OVERCHARGE)</span>
</div>`;

const partsBtns = ORDER_DISPLAY.map(
  (id, index) =>
    `<button type="button" class="arc-part-btn" data-part="${id}"><span class="arc-part-num">${String(index + 1).padStart(2, "0")}</span>${PIECES[id].name}</button>`
).join("");

const stage = `<div class="arc-stage" tabindex="0" role="slider" aria-label="Stark Arc Reactor on laboratory test stand: space toggles ignition, e toggles exploded view, x toggles flux x-ray view, arrows throttle power" aria-valuemin="0.5" aria-valuemax="5.0" aria-valuenow="3.0" aria-valuetext="Running at 3.00 GJ/s">
  ${backSvg}
  ${frontSvg}
  <canvas class="arc-plasma-canvas" aria-hidden="true"></canvas>
</div>`;

const caption =
  "The Stark Industries Miniature Arc Reactor is an aneutronic compact magnetic confinement fusion device. Ten toroidal high-temperature superconducting (HTS) solenoid coils generate a 14-Tesla magnetic field, pinching an ultra-dense, relativistic deuterium/helium-3 plasma ring inside a quartz-titanium toroidal vacuum chamber. A central palladium-rhodium matrix provides laser pre-ionization and high-voltage arc breakdown, initiating aneutronic fusion that releases high-energy charged alpha particles without neutron irradiation. Interleaved magnetohydrodynamic (MHD) induction pick-up coils absorb kinetic energy directly from the circulating plasma flux, generating up to 3 gigajoules per second of direct electrical energy without steam cycles or mechanical turbines.";

const body = `<figure class="iso-figure arc">
  <div class="iso-plate">${corners}${stage}${controls}</div>
  <figcaption class="iso-legend">
    ${coilsArray}
    ${telemConsole}
    ${powerBar}
    <div class="arc-parts">${partsBtns}</div>
    <span class="iso-caption">${caption}</span>
  </figcaption>
</figure>`;

const CSS = readFileSync(join(HERE, "arc.css"), "utf8");
const LIVE = readFileSync(join(HERE, "arc-live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));

const page = k.pageHtml({
  title: "Arc Reactor — Anatomy",
  theme: THEME,
  body: `<style>${CSS}</style>${body}`,
  script: kitScript() + glScript() + LIVE,
  width: 980,
});

const outName = THEME === "light" ? "arc-reactor-light.html" : "arc-reactor.html";
writeFileSync(join(HERE, outName), page);
console.log("wrote", outName, `${(page.length / 1024).toFixed(0)} KB`, `${items.length} items`);
