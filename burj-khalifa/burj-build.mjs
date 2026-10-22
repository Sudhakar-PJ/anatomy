import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../.agents/skills/anatomy/kit/iso-kit.mjs";
import * as G from "../.agents/skills/anatomy/kit/lathe.mjs";
import { tubePieces, tubeSvg } from "../.agents/skills/anatomy/kit/tube.mjs";
import * as A from "../.agents/skills/anatomy/kit/audit.mjs";
import { kitScript } from "../.agents/skills/anatomy/scripts/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const THEME = process.argv.includes("--light") ? "light" : "dark";

const W = 960;
const H = 1040;
const AZIMUTH = 40;
const ELEVATION = 25;

// Coordinate System (World Units, approx 1 unit ≈ 1.8 meters):
// Origin [0, 0, 0]: Ground concourse datum at tower center.
// X, Y: Horizontal ground plane.
// Z: Vertical axis:
//   -28: Deep calcisiltite bedrock (50m depth)
//   -2.1: Bottom of 3.7m raft foundation
//   0.0: Ground concourse level
//   36: Level 18 (Outrigger 1)
//   84: Level 42 (Outrigger 2)
//   148: Level 75 (Outrigger 3)
//   212: Level 108 (Outrigger 4)
//   272: Level 138 (Outrigger 5)
//   316: Level 156 (Concrete summit, 585m height, Outrigger 6)
//   350: Level 163 (Structural steel crown)
//   460: Pinnacle Spire tip (828.0m summit elevation)

// 1. BASEPLATE & BOUNDS
const BASE = { x: -55, y: -55, w: 110, d: 110, r: 8 };

const BOUNDS = [
  ...k.boxCorners(BASE, -32, -26),
  [-46, -46, -26],
  [+46, +46, -26],
  [-38, -38, 0],
  [+38, +38, 0],
  [-12, -12, 460],
  [+12, +12, 460],
];

const P = k.fitProjection(BOUNDS, W, H, {
  pad: 32,
  azimuth: AZIMUTH,
  elevation: ELEVATION,
});

const V = G.viewOf(P);
const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const Ln = (d, style) => k.lineSvg(d, style);
const Dots = (points, style) => k.dotsSvg(points, style);

// 2. EXPLODED ASSEMBLY DEFINITIONS
const PIECES = {
  bedrock: {
    name: "Geotechnical Bedrock & Stratum",
    say: "50m cutaway geological stratum · Calcisiltite bedrock · Gypsiferous sandstone · upper beach sand · saline groundwater table",
    move: [0, 0, -15],
  },
  piles: {
    name: "192 Bored Friction Piles",
    say: "192 bored cast-in-place friction piles (1.5m dia, 50m depth) · 3,000t capacity each · C60 self-consolidating concrete · titanium ICCP cathodic protection mesh",
    move: [0, 0, -9],
  },
  raft: {
    name: "3.7m Raft Foundation Mat",
    say: "3.7m thick monolithic reinforced concrete raft · 12,500 m³ of C80 self-consolidating concrete (110,000 tonnes) · 4 pour zones",
    move: [0, 0, -4],
  },
  podium: {
    name: "Entrance Concourse & Podia",
    say: "4-story surrounding pavilion and concourse structure · perimeter vehicular ramps · expansion joints and structural seismic keys",
    move: [0, 0, 0],
  },
  core_low: {
    name: "Buttressed Core Tiers (L1–42)",
    say: "central hexagonal torsion core (1,300mm shear walls) · 3 buttressing wings at 120° · Outriggers 1 & 2 locking core to outer columns",
    move: [0, 0, 0],
  },
  core_mid: {
    name: "Spiral Setback Tiers (L43–108)",
    say: "26 helical wind-confusing setbacks spiraling counter-clockwise · Outriggers 3 & 4 · ice-cooled nocturnal high-pressure concrete pours",
    move: [0, 0, 6],
  },
  core_high: {
    name: "Upper Concrete Superstructure (L109–156)",
    say: "tapered upper wing transitions · Outriggers 5 & 6 · Putzmeister world record single-stage concrete pump terminal (606m)",
    move: [0, 0, 11],
  },
  cladding: {
    name: "Unitized Curtain Wall Façade",
    say: "24,348 double-glazed reflective Low-E panels · micro-thin titanium solar coating · embossed 316-grade stainless steel vertical spandrels",
    move: [8, 8, 8],
  },
  steel_tier: {
    name: "Structural Steel Pinnacle (L157–163)",
    say: "over 4,000 tonnes of structural steel framing · heavy diagrid bracings · internal 143m telescopic spire core pipe housing",
    move: [0, 0, 17],
  },
  spire: {
    name: "143m Telescopic Pinnacle Spire (828m)",
    say: "350-tonne steel spire assembled in 25 modular sections inside core · hydraulically strand-jacked 143m out through top · summit beacon & lightning finial",
    move: [0, 0, 24],
  },
  jump_form: {
    name: "Doka SKE 100 Hydraulic Jump Forms",
    say: "automatic self-climbing hydraulic formwork shroud · 3-day floor casting cycle · trailing safety screens & concrete distributor placing boom",
    move: [0, 0, 20],
  },
  cranes_pumps: {
    name: "3 Favco Cranes & Concrete Pump Line",
    say: "3 Favelle Favco high-speed luffing tower cranes on climbing collars · Putzmeister 300+ bar super-high-pressure concrete riser pipes",
    move: [12, 12, 14],
  },
};

const STAGGER = [
  "spire",
  "steel_tier",
  "jump_form",
  "cranes_pumps",
  "core_high",
  "cladding",
  "core_mid",
  "core_low",
  "podium",
  "raft",
  "piles",
  "bedrock",
];

const ORDER_DISPLAY = [
  "bedrock",
  "piles",
  "raft",
  "podium",
  "core_low",
  "core_mid",
  "core_high",
  "cladding",
  "jump_form",
  "cranes_pumps",
  "steel_tier",
  "spire",
];

const SPRING = { stagger: 0.04, stiffness: 64, damping: 14.5, substeps: 4 };
const R = A.recorder(P, { order: STAGGER, spring: SPRING });
const { items, nameFor } = R;

function put(piece, ref, svg, { bias = 0, move, ride, shapes = [], name, role, kind, zmin, zmax } = {}) {
  R.put({
    piece,
    ride: ride ?? piece,
    at: ref,
    bias,
    svg,
    move: move ?? PIECES[piece].move,
    shapes,
    name: name ?? nameFor(`${piece}.item`),
    role,
    kind,
    zmin,
    zmax,
  });
}

// 3. GEOMETRY BUILDERS
function getWingPoints(angleDeg, length, width) {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const perpX = -sin;
  const perpY = cos;
  const halfW = width / 2;

  const p1 = [-perpX * halfW, -perpY * halfW];
  const p2 = [perpX * halfW, perpY * halfW];

  const tipX = cos * (length - halfW);
  const tipY = sin * (length - halfW);

  const tipPts = [];
  const startAng = angleDeg - 90;
  const steps = 6;
  for (let i = 0; i <= steps; i++) {
    const a = ((startAng + (180 * i) / steps) * Math.PI) / 180;
    tipPts.push([tipX + halfW * Math.cos(a), tipY + halfW * Math.sin(a)]);
  }

  return { rootLeft: p1, rootRight: p2, tipPts };
}

function generateTowerPlan(l1, l2, l3, width = 9.0) {
  // Wing 1 at -90° (South)
  // Wing 2 at +30° (Northeast)
  // Wing 3 at +150° (Northwest)
  const w1 = getWingPoints(-90, l1, width);
  const w2 = getWingPoints(30, l2, width);
  const w3 = getWingPoints(150, l3, width);

  return [
    ...w1.tipPts,
    w1.rootLeft,
    w2.rootRight,
    ...w2.tipPts,
    w2.rootLeft,
    w3.rootRight,
    ...w3.tipPts,
    w3.rootLeft,
    w1.rootRight,
  ];
}

// Generate regular hexagon for central torsion core
function regularHexagon(radius) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = ((i * 60 + 30) * Math.PI) / 180;
    pts.push([radius * Math.cos(a), radius * Math.sin(a)]);
  }
  return pts;
}

// -------------------------------------------------------------
// ASSEMBLY 1: BEDROCK & GEOTECHNICAL BASEPLATE
// -------------------------------------------------------------
// Baseplate slab
const baseSlab = k.slabOf(BASE, -28, 2.0, P, 8, 0.8);
const baseGroove = k.planOutline(k.insetPlan(BASE, 4), -26, P);
const baseScrews = k.corners(BASE, 6).flatMap(([x, y]) => [
  Ln(k.ring(x, y, 2.0, -26, P, 16), { tone: "lo" }),
  Dots([at([x, y, -26])], { size: 0.55, tone: "mid" }),
]);

// 4 Corner Leveling Feet
const feet = [];
for (const [x, y] of k.corners(BASE, 8)) {
  feet.push(
    S(k.cylinder(x, y, 4.5, -32, 2.0, P, 20), { tone: "lo" }),
    S(k.cylinder(x, y, 3.2, -30, 2.0, P, 20), { tone: "mid" })
  );
}

// Ruler strip on front edge
const rulerPlan = { x: -44, y: BASE.y + BASE.d - 7, w: 88, d: 5, r: 1 };
const rulerSlab = k.slabOf(rulerPlan, -26, 0.6, P, 2);
const rulerTicks = k.topTicks(-40, 40, 3, 5, rulerPlan.y + 0.8, -25.4, [1.5, 3.0], P);

// Title label plate
const labelPlan = { x: -24, y: BASE.y + BASE.d - 16, w: 48, d: 7, r: 1.2 };
const labelSlab = k.slabOf(labelPlan, -26, 0.6, P, 2);
const labelBorder = k.planOutline(k.insetPlan(labelPlan, 1.2), -25.4, P);
const labelLines = [
  k.lineOnTop([-18, labelPlan.y + 2.4], [18, labelPlan.y + 2.4], -25.4, P),
  k.lineOnTop([-18, labelPlan.y + 4.6], [12, labelPlan.y + 4.6], -25.4, P),
];

// Cutaway Strata Box: Z = -26 to -2.1
const STRATA = { x: -44, y: -44, w: 88, d: 88, r: 4 };
// 3 Geological strata layers:
// Layer 1: Calcisiltite Bedrock (Z = -26 to -18)
const strata1 = k.slabOf(STRATA, -26, 8.0, P, 4, 0.4);
// Layer 2: Gypsiferous Sandstone (Z = -18 to -10)
const strata2 = k.slabOf(STRATA, -18, 8.0, P, 4, 0.4);
// Layer 3: Upper Marine Sand & Beach Deposit (Z = -10 to -2.1)
const strata3 = k.slabOf(STRATA, -10, 7.9, P, 4, 0.4);

// Strata seam lines wrapping visible faces
const strataSeam1 = k.sideSeam(STRATA, -18, P, 4);
const strataSeam2 = k.sideSeam(STRATA, -10, P, 4);

put("bedrock", [0, 0, -28], [
  ...feet,
  S(baseSlab, { tone: "mid" }),
  Ln(baseGroove, { tone: "lo" }),
  ...baseScrews,
  S(rulerSlab, { tone: "lo" }),
  Ln(rulerTicks.minor, { tone: "lo" }),
  Ln(rulerTicks.major, { tone: "mid" }),
  S(labelSlab, { tone: "lo" }),
  Ln(labelBorder, { tone: "faint" }),
  Ln(labelLines.join(""), { tone: "lo", free: true }),
  S(strata1, { tone: "lo" }),
  Ln(strataSeam1, { tone: "faint" }),
  S(strata2, { tone: "mid" }),
  Ln(strataSeam2, { tone: "faint" }),
  S(strata3, { tone: "faint" }),
].join(""), {
  name: "Bedrock & Geological Stratum",
  kind: "foundation",
  zmin: -28,
  zmax: -2.1,
});

// -------------------------------------------------------------
// ASSEMBLY 2: 192 BORED FRICTION PILES
// -------------------------------------------------------------
// Piles distributed under the 3 wings (56 each) + central core (24)
const pileSolids = [];
const pileDots = [];
const pileLines = [];

function addPile(px, py) {
  const pCyl = k.cylinder(px, py, 0.6, -26, 23.9, P, 12);
  pileSolids.push(S(pCyl, { tone: "mid" }));
  // ICCP titanium ring band
  pileLines.push(Ln(k.sideArc(px, py, 0.6, -16, P, 12), { tone: "lo" }));
  pileDots.push(at([px, py, -2.1]));
}

// Core pile cluster (24 piles)
for (let ring = 1; ring <= 2; ring++) {
  const count = ring * 8;
  const rad = ring * 2.8;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    addPile(rad * Math.cos(a), rad * Math.sin(a));
  }
}

// 3 Wing pile clusters (56 piles each)
const wingAngles = [-90, 30, 150];
for (const ang of wingAngles) {
  const rad = (ang * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const perpX = -sin;
  const perpY = cos;

  for (let dist = 8; dist <= 34; dist += 2.8) {
    for (const offset of [-2.4, 0, 2.4]) {
      const px = cos * dist + perpX * offset;
      const py = sin * dist + perpY * offset;
      addPile(px, py);
    }
  }
}

put("piles", [0, 0, -14], [
  ...pileSolids,
  ...pileLines,
  Dots(pileDots, { size: 0.6, tone: "lit" }),
].join(""), {
  name: "192 Bored Friction Piles",
  kind: "piles",
  zmin: -26,
  zmax: -2.1,
});

// -------------------------------------------------------------
// ASSEMBLY 3: 3.7m MONOLITHIC RAFT FOUNDATION MAT
// -------------------------------------------------------------
// 3.7m thick monolithic raft foundation (Z = -2.1 to 0.0)
const raftRing = generateTowerPlan(40, 40, 40, 12.0);
const raftSlab = k.extrude(raftRing, -2.1, 2.1, P, { convex: false, bevel: 0.4 });

// 4 Pour Zone Seams across raft surface
const pourSeams = [
  k.lineOnTop([0, 0], [0, -38], 0, P),
  k.lineOnTop([0, 0], [33, 19], 0, P),
  k.lineOnTop([0, 0], [-33, 19], 0, P),
];

// Raft tie-down anchor lugs
const raftLugs = [];
for (const ang of [-90, 30, 150]) {
  const rad = (ang * Math.PI) / 180;
  const tipX = Math.cos(rad) * 38;
  const tipY = Math.sin(rad) * 38;
  raftLugs.push(
    S(k.cylinder(tipX, tipY, 1.4, 0, 1.0, P, 16), { tone: "hi" }),
    Dots([at([tipX, tipY, 1.0])], { size: 0.45, tone: "lit" })
  );
}

put("raft", [0, 0, -1.0], [
  S(raftSlab, { tone: "hi" }),
  Ln(pourSeams.join(""), { tone: "mid", free: true }),
  ...raftLugs,
].join(""), {
  name: "3.7m Raft Foundation Mat",
  kind: "foundation",
  zmin: -2.1,
  zmax: 0,
});

// -------------------------------------------------------------
// ASSEMBLY 4: ENTRANCE CONCOURSE & PODIA
// -------------------------------------------------------------
// Surrounding 4-story podium structure connecting to ground
const PODIA = [
  { x: -36, y: -24, w: 20, d: 18, r: 3 },
  { x: 16, y: -24, w: 20, d: 18, r: 3 },
  { x: -10, y: 16, w: 20, d: 18, r: 3 },
];

const podiumSolids = [];
for (const p of PODIA) {
  const podSlab = k.slabOf(p, 0, 7.0, P, 4, 0.5);
  const podDoor = k.slabOf({ x: p.x + 4, y: p.y + p.d - 1, w: 12, d: 2, r: 0.5 }, 0, 4.0, P, 2);
  podiumSolids.push(
    S(podSlab, { tone: "mid" }),
    S(podDoor, { tone: "lo" }),
    Ln(k.planOutline(k.insetPlan(p, 2), 7.0, P), { tone: "lo" })
  );
}

put("podium", [0, 0, 3.5], podiumSolids.join(""), {
  name: "Entrance Concourse & Podia",
  kind: "podium",
  zmin: 0,
  zmax: 7.0,
});

// -------------------------------------------------------------
// TOWER TIERS DEFINITION (26 Helical Wind Setbacks & Outriggers)
// -------------------------------------------------------------
const TIER_DATA = [
  // LOWER TIERS (Levels 1 - 42, 0m - 150m, piece: core_low)
  { z0: 0, z1: 18, l1: 36, l2: 36, l3: 36, piece: "core_low", name: "Levels 1–9 Base Tier" },
  { z0: 18, z1: 36, l1: 36, l2: 36, l3: 36, piece: "core_low", name: "Levels 10–17 Lower Podia" },
  { z0: 36, z1: 40, l1: 36, l2: 36, l3: 36, piece: "core_low", outrigger: 1, name: "Outrigger 1 (Level 17–18)" },
  { z0: 40, z1: 62, l1: 33, l2: 36, l3: 36, piece: "core_low", name: "Levels 19–29 Setback 1" },
  { z0: 62, z1: 84, l1: 33, l2: 33, l3: 36, piece: "core_low", name: "Levels 30–39 Setback 2" },
  { z0: 84, z1: 88, l1: 33, l2: 33, l3: 36, piece: "core_low", outrigger: 2, name: "Outrigger 2 (Level 40–42)" },

  // MID TIERS (Levels 43 - 108, 150m - 390m, piece: core_mid)
  { z0: 88, z1: 110, l1: 33, l2: 33, l3: 33, piece: "core_mid", name: "Levels 43–55 Setback 3" },
  { z0: 110, z1: 130, l1: 29, l2: 33, l3: 33, piece: "core_mid", name: "Levels 56–65 Setback 4" },
  { z0: 130, z1: 148, l1: 29, l2: 29, l3: 33, piece: "core_mid", name: "Levels 66–72 Setback 5" },
  { z0: 148, z1: 152, l1: 29, l2: 29, l3: 33, piece: "core_mid", outrigger: 3, name: "Outrigger 3 (Level 73–75)" },
  { z0: 152, z1: 172, l1: 29, l2: 29, l3: 29, piece: "core_mid", name: "Levels 76–85 Setback 6" },
  { z0: 172, z1: 192, l1: 25, l2: 29, l3: 29, piece: "core_mid", name: "Levels 86–95 Setback 7" },
  { z0: 192, z1: 212, l1: 7, l2: 25, l3: 29, piece: "core_mid", name: "Levels 96–105 Setback 8 (Wing 1 Ends)" },
  { z0: 212, z1: 216, l1: 7, l2: 25, l3: 29, piece: "core_mid", outrigger: 4, name: "Outrigger 4 (Level 106–108)" },

  // UPPER TIERS (Levels 109 - 156, 390m - 585m, piece: core_high)
  { z0: 216, z1: 236, l1: 7, l2: 25, l3: 25, piece: "core_high", name: "Levels 109–118 Setback 9" },
  { z0: 236, z1: 256, l1: 7, l2: 21, l3: 25, piece: "core_high", name: "Levels 119–128 Setback 10" },
  { z0: 256, z1: 272, l1: 7, l2: 7, l3: 21, piece: "core_high", name: "Levels 129–135 Setback 11 (Wing 2 Ends)" },
  { z0: 272, z1: 276, l1: 7, l2: 7, l3: 21, piece: "core_high", outrigger: 5, name: "Outrigger 5 (Level 136–138)" },
  { z0: 276, z1: 296, l1: 7, l2: 7, l3: 16, piece: "core_high", name: "Levels 139–148 Setback 12" },
  { z0: 296, z1: 312, l1: 7, l2: 7, l3: 7, piece: "core_high", name: "Levels 149–155 Setback 13 (Wing 3 Ends)" },
  { z0: 312, z1: 316, l1: 7, l2: 7, l3: 7, piece: "core_high", outrigger: 6, name: "Outrigger 6 & Summit 606m" },
];

function buildTier(tier) {
  const { z0, z1, l1, l2, l3, outrigger } = tier;
  const h = z1 - z0;
  const ring = generateTowerPlan(l1, l2, l3, 8.8);
  const extr = k.extrude(ring, z0, h, P, { convex: false, bevel: 0.3 });

  // Internal Hexagonal Core
  const hexRing = regularHexagon(6.2);
  const hexExtr = k.extrude(hexRing, z0, h, P, { convex: true, bevel: 0.2 });

  // Outrigger diagonal shear struts and louver vents if MEP level
  const outriggerLines = [];
  if (outrigger) {
    for (const ang of [-90, 30, 150]) {
      const rad = (ang * Math.PI) / 180;
      const x1 = Math.cos(rad) * 6;
      const y1 = Math.sin(rad) * 6;
      const x2 = Math.cos(rad) * Math.min(l1, l2, l3);
      const y2 = Math.sin(rad) * Math.min(l1, l2, l3);
      outriggerLines.push(
        k.lineOnTop([x1, y1], [x2, y2], z0 + h / 2, P),
        k.lineOnTop([x1, y1], [x2, y2], z0 + h, P)
      );
    }
  }

  // Curtain Wall Façade vertical mullions
  const mullions = [];
  for (const ang of [-90, 30, 150]) {
    const rad = (ang * Math.PI) / 180;
    const len = ang === -90 ? l1 : ang === 30 ? l2 : l3;
    if (len > 8) {
      const tipX = Math.cos(rad) * (len - 4);
      const tipY = Math.sin(rad) * (len - 4);
      mullions.push(k.segment([tipX, tipY, z0], [tipX, tipY, z1], P));
    }
  }

  return {
    extr,
    hexExtr,
    outriggerLines: outriggerLines.join(""),
    mullions: mullions.join(""),
  };
}

for (const tier of TIER_DATA) {
  const geom = buildTier(tier);
  const isOut = Boolean(tier.outrigger);

  // Core & Floor Slabs (Structural skeleton)
  const coreSvg = [
    S(geom.extr, { tone: isOut ? "hi" : "mid" }),
    S(geom.hexExtr, { tone: "hi" }),
    isOut ? Ln(geom.outriggerLines, { tone: "lit", free: true }) : "",
  ].join("");

  put(tier.piece, [0, 0, (tier.z0 + tier.z1) / 2], coreSvg, {
    name: tier.name,
    kind: isOut ? "outrigger" : "core",
    zmin: tier.z0,
    zmax: tier.z1,
  });

  // Glass Façade (Envelope skin)
  const glassSvg = [
    S(geom.extr, { tone: "mid" }),
    Ln(geom.mullions, { tone: "lit", free: true }),
  ].join("");

  put("cladding", [0, 0, (tier.z0 + tier.z1) / 2], glassSvg, {
    name: `${tier.name} Cladding`,
    kind: "glass",
    zmin: tier.z0,
    zmax: tier.z1,
  });
}

// -------------------------------------------------------------
// ASSEMBLY 5: STRUCTURAL STEEL PINNACLE (LEVELS 157–163)
// -------------------------------------------------------------
// Steel diagrid columns and circular steel core pipe: Z = 316 to 350
const steelCore = k.cylinder(0, 0, 4.2, 316, 34.0, P, 24);
const steelTrusses = [];

// Diagrid perimeter trusses around the steel core
for (let i = 0; i < 8; i++) {
  const a1 = (i / 8) * Math.PI * 2;
  const a2 = ((i + 1) / 8) * Math.PI * 2;
  const rCol = 5.2;
  const p1 = [rCol * Math.cos(a1), rCol * Math.sin(a1)];
  const p2 = [rCol * Math.cos(a2), rCol * Math.sin(a2)];

  steelTrusses.push(
    k.segment([p1[0], p1[1], 316], [p1[0], p1[1], 350], P),
    k.segment([p1[0], p1[1], 316], [p2[0], p2[1], 333], P),
    k.segment([p2[0], p2[1], 333], [p1[0], p1[1], 350], P),
    k.segment([p1[0], p1[1], 333], [p2[0], p2[1], 333], P)
  );
}

// Level 156 heavy steel transition ring & Strand Jack lifting platform
const strandJackDeck = k.cylinder(0, 0, 6.0, 316, 1.8, P, 24, 0.3);
const strandJackCables = [];
for (let c = 0; c < 4; c++) {
  const ca = (c / 4) * Math.PI * 2;
  const cx = 2.2 * Math.cos(ca);
  const cy = 2.2 * Math.sin(ca);
  strandJackCables.push(k.rise([cx, cy], 318, 350, P));
}

put("steel_tier", [0, 0, 333], [
  S(strandJackDeck, { tone: "hi" }),
  S(steelCore, { tone: "mid" }),
  Ln(steelTrusses.join(""), { tone: "lit" }),
  Ln(strandJackCables.join(""), { tone: "hi", free: true }),
].join(""), {
  name: "Structural Steel Pinnacle (L157–163)",
  kind: "steel",
  zmin: 316,
  zmax: 350,
});

// -------------------------------------------------------------
// ASSEMBLY 6: 143m TELESCOPIC PINNACLE SPIRE (828m SUMMIT)
// -------------------------------------------------------------
// Tapered circular modular spire in 5 telescoping stages:
// Z = 350 to 460 (110 units height ≈ 198m)
const SPIRE_SECTIONS = [
  { r: 3.4, z0: 350, z1: 380 },
  { r: 2.6, z0: 380, z1: 410 },
  { r: 1.8, z0: 410, z1: 435 },
  { r: 1.2, z0: 435, z1: 454 },
  { r: 0.5, z0: 454, z1: 460 }, // summit pinnacle rod
];

const spireSolids = [];
const spireLines = [];

for (let s = 0; s < SPIRE_SECTIONS.length; s++) {
  const sec = SPIRE_SECTIONS[s];
  const cyl = k.cylinder(0, 0, sec.r, sec.z0, sec.z1 - sec.z0, P, 20);
  spireSolids.push(S(cyl, { tone: s % 2 === 0 ? "hi" : "mid" }));

  // Flange ring at each section joint
  if (s > 0) {
    const flange = k.cylinder(0, 0, sec.r + 0.35, sec.z0 - 0.4, 0.8, P, 20);
    spireSolids.push(S(flange, { tone: "hi" }));
  }

  // Seam rings
  spireLines.push(
    Ln(k.sideArc(0, 0, sec.r, sec.z0 + (sec.z1 - sec.z0) / 2, P, 16), { tone: "lo" })
  );
}

// Summit Beacon & Lightning Arrester Needle
const beaconSphere = k.cylinder(0, 0, 0.8, 458, 1.4, P, 16);
const lightningNeedle = k.segment([0, 0, 460], [0, 0, 464], P);

put("spire", [0, 0, 400], [
  ...spireSolids,
  ...spireLines,
  S(beaconSphere, { tone: "lit" }),
  Ln(lightningNeedle, { tone: "lit", free: true }),
  Dots([at([0, 0, 464])], { size: 0.6, tone: "lit" }),
].join(""), {
  name: "143m Telescopic Pinnacle Spire (828m)",
  kind: "spire",
  role: "spire-core",
  zmin: 350,
  zmax: 464,
});

// -------------------------------------------------------------
// ASSEMBLY 7: DOKA SKE 100 HYDRAULIC JUMP FORMWORK
// -------------------------------------------------------------
// Self-climbing formwork shroud enclosing the casting deck
const dokaShroud = k.cylinder(0, 0, 11.0, 0, 6.0, P, 24, 0.4);
const dokaScreens = [];
for (let sc = 0; sc < 6; sc++) {
  const sa = (sc / 6) * Math.PI * 2;
  const sx = 10.5 * Math.cos(sa);
  const sy = 10.5 * Math.sin(sa);
  dokaScreens.push(k.segment([sx, sy, -2.5], [sx, sy, 6.0], P));
}

// Placing Boom articulated arm on top of formwork
const boomPivot = at([0, 0, 6.0]);
const boomMid = at([8, 0, 9.0]);
const boomTip = at([14, -4, 5.0]);
const placingBoom = [
  k.pathOf([boomPivot, boomMid, boomTip]),
  k.pathOf([at([0, 0, 7.5]), boomMid]),
].join("");

put("jump_form", [0, 0, 10], [
  S(dokaShroud, { tone: "mid" }),
  Ln(dokaScreens.join(""), { tone: "lo", free: true }),
  Ln(placingBoom, { tone: "lit", free: true }),
  Dots([boomPivot, boomMid, boomTip], { size: 0.6, tone: "lit" }),
].join(""), {
  name: "Doka SKE 100 Hydraulic Jump Forms",
  kind: "machinery",
  role: "doka",
  zmin: 0,
  zmax: 320,
});

// -------------------------------------------------------------
// ASSEMBLY 8: 3 FAVCO CRANES & PUTZMEISTER CONCRETE PUMPS
// -------------------------------------------------------------
// Putzmeister Twin High-Pressure Concrete Pipeline
const pumpRoute1 = [
  [1.2, 1.2, 0],
  [1.2, 1.2, 100],
  [1.2, 1.2, 200],
  [1.2, 1.2, 316],
];
const pumpPieces1 = tubePieces(pumpRoute1, 0.45, P);

// 3 Favelle Favco Climbing Cranes
const craneSolids = [];
const craneLines = [];

for (let ci = 0; ci < 3; ci++) {
  const cAng = [-90, 30, 150][ci];
  const cRad = (cAng * Math.PI) / 180;
  const cDist = 18;
  const cx = Math.cos(cRad) * cDist;
  const cy = Math.sin(cRad) * cDist;

  // Mast section
  const mast = k.slabOf({ x: cx - 1.2, y: cy - 1.2, w: 2.4, d: 2.4, r: 0.3 }, 0, 14.0, P, 2);
  craneSolids.push(S(mast, { tone: "hi" }));

  // Luffing Jib
  const jibRad = cRad + 0.6;
  const jx = cx + Math.cos(jibRad) * 16;
  const jy = cy + Math.sin(jibRad) * 16;
  craneLines.push(
    Ln(k.segment([cx, cy, 14], [jx, jy, 24], P), { tone: "lit", free: true }),
    Ln(k.segment([cx, cy, 18], [jx, jy, 24], P), { tone: "hi", free: true }),
    Ln(k.rise([jx, jy], 12, 24, P), { tone: "faint", free: true }) // hoist line
  );
}

put("cranes_pumps", [0, 0, 150], [
  tubeSvg(pumpPieces1),
  ...craneSolids,
  ...craneLines,
].join(""), {
  name: "3 Favco Cranes & Concrete Pump Line",
  kind: "crane",
  role: "crane",
  zmin: 0,
  zmax: 330,
});

// Settle painters order and record
A.settle(R, P);
items.sort((a, b) => a.key - b.key);

// -------------------------------------------------------------
// WIND VORTEX STREAMLINE OVERLAY
// -------------------------------------------------------------
// Horizontal wind streamlines at 4 elevations showing vortex disruption
const windStreamlines = [];
const windHeights = [40, 120, 220, 310];

for (const zh of windHeights) {
  // Streamlines coming from windward side (azimuth angle)
  for (let dy = -26; dy <= 26; dy += 13) {
    const pts = [];
    for (let x = -48; x <= 48; x += 6) {
      // Wind deflects around tower
      const dist = Math.hypot(x, dy);
      const push = Math.exp(-dist / 14) * 8;
      const py = dy + (dy >= 0 ? push : -push);
      pts.push(at([x, py, zh]));
    }
    windStreamlines.push(k.pathOf(pts));
  }
}

const windLayer = `<svg class="bk-wind-layer" viewBox="0 0 ${W} ${H}" aria-hidden="true">
  ${windStreamlines.map((d) => `<path class="bk-wind-path" d="${d}"/>`).join("")}
</svg>`;

// Assemble stage SVG
const groups = items.map((item, index) => {
  const [mx, my, mz] = item.move;
  return `<g class="it" data-piece="${item.piece}"${item.ride !== item.piece ? ` data-ride="${item.ride}"` : ""}${item.kind ? ` data-kind="${item.kind}"` : ""}${item.role ? ` data-role="${item.role}"` : ""} data-zmin="${item.zmin ?? 0}" data-zmax="${item.zmax ?? 0}" data-k="${item.key.toFixed(2)}" data-m="${mx.toFixed(1)},${my.toFixed(1)},${mz.toFixed(1)}" data-i="${index}">${item.svg}</g>`;
});

const frontSvg = `<svg class="bk-front" viewBox="0 0 ${W} ${H}">
  <g class="bk-assembly">${groups.join("")}</g>
</svg>`;

// Soft halo under the base
const halo = `<path class="iso-halo" d="${k.haloOf(BASE, -32, 16, P)}"/>`;
const backSvg = `<svg class="bk-back" viewBox="0 0 ${W} ${H}">${halo}</svg>`;

// -------------------------------------------------------------
// UI CONTROLS, TELEMETRY, CARDS & HTML ASSEMBLY
// -------------------------------------------------------------
const cam = k.cameraOf(P);
const DATA = {
  pieces: PIECES,
  stagger: STAGGER,
  spring: SPRING,
  V: [V.x, V.y, V.z],
  k: cam.k,
  sinA: cam.sinA,
  cosA: cam.cosA,
  sinE: cam.sinE,
  cosE: cam.cosE,
};

const corners = `<div class="iso-plate-corners" aria-hidden="true">
  <span class="iso-plate-corner" data-corner="fig">Fig 1</span>
  <span class="iso-plate-corner" data-corner="title">Burj Khalifa · Structural Anatomy &amp; Construction Chronology</span>
  <span class="iso-plate-corner" data-corner="readout" data-readout>Phase 8: Spire Jacking &amp; Topping Out · Elev: 828.0m (2,717ft) · 163 Floors</span>
</div>`;

const controls = `<div class="bk-controls">
  <div class="bk-btn-row">
    <div class="bk-btn-group">
      <button type="button" class="bk-btn" data-play><span class="bk-lamp" aria-hidden="true"></span><span data-play-label>Play Construction</span></button>
      <button type="button" class="bk-btn" data-speed="0.5">0.5×</button>
      <button type="button" class="bk-btn" data-speed="1.0" data-active>1×</button>
      <button type="button" class="bk-btn" data-speed="2.0">2×</button>
    </div>
    <div class="bk-btn-group">
      <button type="button" class="bk-btn" data-apart><span class="bk-lamp" aria-hidden="true"></span><span>Explode [A]</span></button>
      <button type="button" class="bk-btn" data-xray><span class="bk-lamp" aria-hidden="true"></span><span>Core X-Ray [C]</span></button>
      <button type="button" class="bk-btn" data-wind><span class="bk-lamp" aria-hidden="true"></span><span>Vortex Wind [W]</span></button>
      <button type="button" class="bk-btn" data-cranes><span class="bk-lamp" aria-hidden="true"></span><span>Machinery [M]</span></button>
    </div>
  </div>

  <div class="bk-tele-strip">
    <div class="bk-tele-item">
      <span class="bk-tele-lbl">Elevation</span>
      <span class="bk-tele-val" data-tele-elevation>828.0 <small>m</small> / 2717 <small>ft</small></span>
    </div>
    <div class="bk-tele-item">
      <span class="bk-tele-lbl">Timeline</span>
      <span class="bk-tele-val" data-tele-year>2010</span>
    </div>
    <div class="bk-tele-item">
      <span class="bk-tele-lbl">Level / Stage</span>
      <span class="bk-tele-val" data-tele-floor>Level 163 + Summit</span>
    </div>
    <div class="bk-tele-item">
      <span class="bk-tele-lbl">Concrete Poured</span>
      <span class="bk-tele-val" data-tele-concrete>330k <small>m³</small></span>
    </div>
    <div class="bk-tele-item">
      <span class="bk-tele-lbl">Pump Pressure</span>
      <span class="bk-tele-val" data-tele-pump>320 <small>bar</small></span>
    </div>
    <div class="bk-tele-item">
      <span class="bk-tele-lbl">Façade Glass</span>
      <span class="bk-tele-val" data-tele-panels>24,348</span>
    </div>
    <div class="bk-tele-item">
      <span class="bk-tele-lbl">Vortex Reduction</span>
      <span class="bk-tele-val" data-tele-wind>-42% <small>vortex</small></span>
    </div>
  </div>

  <div class="bk-scrub-box">
    <div class="bk-scrub-header">
      <span>Construction Timeline: Bottom to Top</span>
      <span class="bk-scrub-active-phase" data-scrub-phase>Phase 8: Spire Jacking (828.0m)</span>
    </div>
    <input type="range" class="bk-slider" min="0" max="1000" value="1000" step="1" data-scrub-slider aria-label="Scrub construction progress from foundation to pinnacle spire">
  </div>

  <div class="bk-phase-strip">
    <button type="button" class="bk-phase-pill" data-phase="0">
      <span class="bk-phase-num">Phase 0 · 2004</span>
      <span class="bk-phase-name">192 Friction Piles</span>
      <span class="bk-phase-sub">-50m Bedrock Piling</span>
    </button>
    <button type="button" class="bk-phase-pill" data-phase="1">
      <span class="bk-phase-num">Phase 1 · 2005</span>
      <span class="bk-phase-name">3.7m Raft Mat</span>
      <span class="bk-phase-sub">12,500 m³ C80 Pours</span>
    </button>
    <button type="button" class="bk-phase-pill" data-phase="2">
      <span class="bk-phase-num">Phase 2 · 2006</span>
      <span class="bk-phase-name">Buttressed Core</span>
      <span class="bk-phase-sub">L1–42 · Outriggers 1-2</span>
    </button>
    <button type="button" class="bk-phase-pill" data-phase="3">
      <span class="bk-phase-num">Phase 3 · 2007</span>
      <span class="bk-phase-name">Spiral Setbacks</span>
      <span class="bk-phase-sub">L43–75 · Outrigger 3</span>
    </button>
    <button type="button" class="bk-phase-pill" data-phase="4">
      <span class="bk-phase-num">Phase 4 · 2007</span>
      <span class="bk-phase-name">Cladding Follows</span>
      <span class="bk-phase-sub">L76–108 · Low-E Glass</span>
    </button>
    <button type="button" class="bk-phase-pill" data-phase="5">
      <span class="bk-phase-num">Phase 5 · 2008</span>
      <span class="bk-phase-name">High-Altitude</span>
      <span class="bk-phase-sub">L109–138 · 285 bar pump</span>
    </button>
    <button type="button" class="bk-phase-pill" data-phase="6">
      <span class="bk-phase-num">Phase 6 · 2008</span>
      <span class="bk-phase-name">Concrete Summit</span>
      <span class="bk-phase-sub">L139–156 · 606m record</span>
    </button>
    <button type="button" class="bk-phase-pill" data-phase="7">
      <span class="bk-phase-num">Phase 7 · 2009</span>
      <span class="bk-phase-name">Steel & Strand Jack</span>
      <span class="bk-phase-sub">L157–163 · 4,000t steel</span>
    </button>
    <button type="button" class="bk-phase-pill" data-phase="8" data-active>
      <span class="bk-phase-num">Phase 8 · 2010</span>
      <span class="bk-phase-name">Spire Jacking</span>
      <span class="bk-phase-sub">828.0m Topped Out</span>
    </button>
  </div>

  <span class="bk-hint">Keyboard: [Space] Play/Pause · [A] Apart · [C] Core X-Ray · [W] Wind · [M] Machinery · [←/→] Step Phases · [0-8] Jump Phase</span>
  <span class="bk-live" aria-live="polite" data-live></span>
</div>`;

const partsBtns = ORDER_DISPLAY.map(
  (id, index) =>
    `<button type="button" class="bk-part-btn" data-part="${id}"><span class="bk-part-num">${String(index + 1).padStart(2, "0")}</span>${PIECES[id].name}</button>`
).join("");

const stage = `<div class="bk-stage" tabindex="0" role="slider" aria-label="Burj Khalifa Structural Anatomy and Construction Chronology: drag to scrub build from foundation to summit, space toggles animation, a toggles exploded view, c toggles core x-ray, w toggles aerodynamic wind flow" aria-valuemin="0" aria-valuemax="828" aria-valuenow="828" aria-valuetext="828.0 meters (2,717 ft) topped out">
  ${backSvg}
  ${frontSvg}
  ${windLayer}
</div>`;

const caption =
  "Burj Khalifa (828.0 m / 2,716.5 ft, 163 floors) structural anatomy and bottom-to-top construction chronology. Designed by Skidmore, Owings & Merrill (Chief Structural Engineer William F. Baker and Architect Adrian Smith), the tower solved extreme gravity and desert wind vortex loads through the revolutionary 'Buttressed Core' system. At foundation level, 192 bored cast-in-place friction piles (1.5 m diameter) penetrate 50 meters into deep calcisiltite bedrock, tied together by a 3.7 m thick monolithic reinforced concrete raft (12,500 m³ of C80 concrete, 110,000 tonnes). Above, a central hexagonal concrete torsion core is braced by three buttressing wings radiating at 120° intervals. To prevent destructive cross-wind harmonic resonance (Karman vortex shedding), 26 setback tiers spiral counter-clockwise up the tower, continuously altering the building's aerodynamic cross-section so wind vortices cannot synchronize. High-performance concrete was pumped in a single unbroken vertical stage up to a world-record 606 meters using super-high-pressure Putzmeister pumps during nocturnal shifts with ice added to control hydration heat. Self-climbing Doka SKE 100 jump forms achieved a 3-day floor cycle, followed 25 floors below by 24,348 unitized reflective Low-E glass panels. Spaced every 30 stories, 6 double-height Mechanical Equipment Floors (MEP) house full-story outrigger shear walls that lock the central core to perimeter columns. Above Level 156 (585 m), the superstructure transitions to 4,000 tonnes of structural steel; inside this casing, the 350-tonne, 143-meter steel pinnacle spire was fabricated in 25 modular segments and hydraulically jacked out through the summit using heavy Strand Jacks to complete the world's tallest man-made structure.";

const body = `<figure class="iso-figure bk">
  <div class="iso-plate">${corners}${stage}${controls}</div>
  <figcaption class="iso-legend">
    <div class="bk-parts-grid">${partsBtns}</div>
    <span class="iso-caption">${caption}</span>
  </figcaption>
</figure>`;

const CSS = readFileSync(join(HERE, "burj.css"), "utf8");
const LIVE = readFileSync(join(HERE, "burj-live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));

const page = k.pageHtml({
  title: "Burj Khalifa — Anatomy",
  theme: THEME,
  body: `<style>${CSS}</style>${body}`,
  script: kitScript() + LIVE,
  width: 980,
});

const outName = THEME === "light" ? "burj-khalifa-light.html" : "burj-khalifa.html";
writeFileSync(join(HERE, outName), page);
console.log("wrote", outName, `${(page.length / 1024).toFixed(0)} KB`, `${items.length} items`);
