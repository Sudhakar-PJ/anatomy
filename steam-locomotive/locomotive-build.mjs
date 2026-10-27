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

// Canvas dimensions and Camera
const W = 960;
const H = 900;
const AZIMUTH = 40;
const ELEVATION = 27;

// Coordinate System (World Units, approx mm / cm scale):
// X: Longitudinal track axis (+X forward toward smokebox and cowcatcher, -X rearward toward cab and tender)
// Y: Transverse lateral axis (-Y left side, +Y right side with Walschaerts valve gear facing camera)
// Z: Vertical axis (0 is top of rail head, +Z up to boiler center at 36, dome at 76; -Z down to ties and ballast at -22)

// 1. BOUNDING BOX FOR CAMERA FITTING
const BOUNDS = [
  [-165, -55, -28],
  [165, 55, -28],
  [-165, 55, 96],
  [165, -55, 96],
  [100, 0, 94],   // Chimney top
  [10, 0, 80],    // Steam dome top
  [-110, 36, 76], // Cab roof
  [-38, 0, 74],   // Safety valves
  [-32, 45, 12],  // Rear driver outside
  [10, 45, 12],   // Main driver outside
  [52, 45, 12],   // Front driver outside
  [105, 45, 12],  // Cylinder casting outside
];

const P = k.fitProjection(BOUNDS, W, H, {
  pad: 26,
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
  track: {
    name: "Ballasted Track & Bed",
    say: "heavy ballasted roadbed · timber cross-ties · 136 lb/yd continuous welded rail · dynamometer roller drums",
    move: [0, 0, 0],
  },
  chassis: {
    name: "Cast Steel Bed & Suspension",
    say: "one-piece cast steel locomotive frame · axle hornblocks · laminated leaf springs & equalizing beams",
    move: [0, 0, -22],
  },
  wheels: {
    name: "Coupled Driving Wheels & Trucks",
    say: "three 79-inch spoked driving wheel pairs · crescent counterweights · 4-wheel pilot bogie & radial trailing truck",
    move: [0, 48, 0],
  },
  cylinders_motion: {
    name: "Cylinders & Walschaerts Gear",
    say: "cast cylinder blocks · spool valves · alligator crossheads · main & side rods · full Walschaerts expansion gear",
    move: [18, 62, 0],
  },
  boiler: {
    name: "Boiler Barrel & Firetubes",
    say: "telescopic rolled steel boiler barrel · 28 firetubes & 6 superheater flues · tubeplates · internal water space",
    move: [0, 0, 38],
  },
  firebox: {
    name: "Firebox, Grate & Water Jacket",
    say: "Belpaire firebox shell · rocking grate bars · ashpan dampers · refractory brick arch · water leg & staybolts",
    move: [-46, 0, 14],
  },
  smokebox: {
    name: "Smokebox & Blast Pipe Exhaust",
    say: "front smokebox drum · hinged dish door · flanged chimney · cast blast pipe nozzle & draft petticoat pipe",
    move: [52, 0, 18],
  },
  dome_superheater: {
    name: "Steam Dome & Superheater",
    say: "steam dome & regulator throttle · internal dry pipe · superheater header & U-loop elements · high-pressure delivery pipes",
    move: [8, 0, 62],
  },
  cab_backhead: {
    name: "Cab & Driver Backhead Controls",
    say: "insulated driver cab · boiler backhead · duplex pressure gauges · water sight glasses · screw reverser & regulator lever",
    move: [-68, 0, 0],
  },
  plumbing_aux: {
    name: "Auxiliary Injectors & Safety Valves",
    say: "twin Ross pop safety valves · 5-chime whistle · live-steam Giffard injector · copper delivery piping & clack valves",
    move: [0, -48, 22],
  },
};

const STAGGER = [
  "dome_superheater",
  "plumbing_aux",
  "cab_backhead",
  "smokebox",
  "firebox",
  "boiler",
  "cylinders_motion",
  "wheels",
  "chassis",
  "track",
];

const ORDER_DISPLAY = [
  "track",
  "chassis",
  "wheels",
  "cylinders_motion",
  "boiler",
  "firebox",
  "smokebox",
  "dome_superheater",
  "cab_backhead",
  "plumbing_aux",
];

const SPRING = { stagger: 0.035, stiffness: 66, damping: 14.5, substeps: 4 };
const R = A.recorder(P, { order: STAGGER, spring: SPRING });
const { items, nameFor } = R;
const record = R.solid;

const rideOf = (piece, move) => (move ? Object.keys(PIECES).find((id) => PIECES[id].move === move) ?? piece : piece);

function put(piece, ref, svg, { bias = 0, move, ride, shapes = [], name, route, chunk, cutaway = false } = {}) {
  const extraClass = cutaway ? ' class="cutaway-only"' : '';
  const wrappedSvg = cutaway ? `<g class="cutaway-only">${svg}</g>` : svg;
  R.put({
    piece,
    ride: ride ?? rideOf(piece, move),
    at: ref,
    bias,
    svg: wrappedSvg,
    move: move ?? PIECES[piece].move,
    shapes,
    name: name ?? nameFor(`${piece}.item`),
    route,
    chunk,
  });
}

function tubeItems(piece, route, r, { name, tone = "hi", bias = 0, move, maxLength, spacing, closed = false, breaks = [], gaps = [], caps = true, cutaway = false } = {}) {
  const id = nameFor(name ?? `${piece}.tube`);
  tubePieces(route, r, P, { maxLength, spacing, closed, breaks, gaps, caps }).forEach((part, index) =>
    put(piece, part.mid, tubeSvg(part, { tone }), { bias, move, name: `${id}:${index}`, route: id, chunk: index, shapes: [A.tube(part.points, part.radii)], cutaway }),
  );
  return id;
}

// Coordinate Frames
const TRACK_FRAME = G.frameOf([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
const BOILER_AXIS = G.frameOf([0, 0, 36], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
const FLOOR = G.frameOf([0, 0, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]);

// Common shapes helpers
function boxAt(piece, plan, z, h, style = {}, { extra = "", bias = 0, move, bevel = 0.5, steps = 3, name, owner, cutaway = false } = {}) {
  const centre = [plan.x + plan.w / 2, plan.y + plan.d / 2, z + h / 2];
  const id = nameFor(name ?? `${piece}.box`);
  put(piece, centre, S(k.slabOf(plan, z, h, P, steps, bevel), { tone: "hi", ...style }) + extra, {
    bias,
    move,
    name: id,
    shapes: [record(A.box([plan.x, plan.y, z], [plan.x + plan.w, plan.y + plan.d, z + h], { name: id, owner }))],
    cutaway,
  });
}

function cylinderAlong(piece, F, s0, s1, r, style = {}, { bias = 0, move, name, bevel = 0.4, steps = 32, cutaway = false } = {}) {
  const paths = G.disc(s0, s1, r, F, P, { bevel, steps });
  const mid = (s0 + s1) / 2;
  const centre = G.add3(F.o, G.mul3(F.a, mid));
  const id = nameFor(name ?? `${piece}.cyl`);
  put(piece, centre, S(paths, { tone: "hi", ...style }), {
    bias,
    move,
    name: id,
    shapes: [record(A.disc(F, s0, s1, r, { name: id }))],
    cutaway,
  });
}

// ---------------------------------------------------------------------------
// 1. TRACK & BALLAST FOUNDATION
// ---------------------------------------------------------------------------
function buildTrack() {
  const piece = "track";

  // Ballast bed foundation slab
  const ballastPlan = { x: -160, y: -50, w: 320, d: 100, r: 8 };
  boxAt(piece, ballastPlan, -28, 8, { tone: "lo" }, {
    bias: -120,
    bevel: 2.0,
    name: "track.ballast",
    extra: Dots(
      Array.from({ length: 42 }, (_, i) => at([-140 + i * 7 + (i % 3) * 2, -42 + ((i * 11) % 84), -20])),
      { size: 0.45, tone: "mid" }
    ),
  });

  // Timber Cross-Ties (Sleepers)
  for (let x = -145; x <= 145; x += 18) {
    const tiePlan = { x: x - 4.5, y: -38, w: 9, d: 76, r: 1.2 };
    boxAt(piece, tiePlan, -20, 5, { tone: "lo" }, {
      bias: -90,
      bevel: 0.6,
      name: `track.tie_${x}`,
      extra: Ln(
        k.segment([x - 3.5, -36, -15], [x + 3.5, -36, -15], P) +
        k.segment([x - 3.5, 36, -15], [x + 3.5, 36, -15], P),
        { tone: "faint" }
      ),
    });

    // Cast steel tie plates under rails
    for (const y of [-22, 22]) {
      const platePlan = { x: x - 3.8, y: y - 4, w: 7.6, d: 8, r: 0.5 };
      boxAt(piece, platePlan, -15, 1.2, { tone: "mid" }, {
        bias: -75,
        bevel: 0.2,
        name: `track.plate_${x}_${y}`,
        extra: Dots([at([x - 2.5, y - 2.5, -13.8]), at([x + 2.5, y + 2.5, -13.8])], { size: 0.35, tone: "hi" }),
      });
    }
  }

  // Steel Running Rails (Left at Y=-22, Right at Y=+22)
  for (const y of [-22, 22]) {
    // Rail Base Flange
    boxAt(piece, { x: -155, y: y - 3.2, w: 310, d: 6.4, r: 0.4 }, -13.8, 1.6, { tone: "mid" }, {
      bias: -60,
      bevel: 0.2,
      name: `track.rail_base_${y}`,
    });
    // Rail Web
    boxAt(piece, { x: -155, y: y - 1.0, w: 310, d: 2.0, r: 0.2 }, -12.2, 8.2, { tone: "mid" }, {
      bias: -55,
      bevel: 0.2,
      name: `track.rail_web_${y}`,
    });
    // Rail Head (top is at Z = -2.0)
    boxAt(piece, { x: -155, y: y - 2.4, w: 310, d: 4.8, r: 0.6 }, -4.0, 4.0, { tone: "hi" }, {
      bias: -50,
      bevel: 0.4,
      name: `track.rail_head_${y}`,
      extra: Ln(k.segment([-155, y, 0], [155, y, 0], P), { tone: "lit" }),
    });
  }

  // Dynamometer Rollers under driving wheels (X = -32, 10, 52)
  for (const x of [-32, 10, 52]) {
    for (const y of [-22, 22]) {
      const RF = G.frameOf([x, y, -11], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
      cylinderAlong(piece, RF, -3.2, 3.2, 6.8, { tone: "mid" }, {
        bias: -45,
        name: `track.dyno_drum_${x}_${y}`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 2. CHASSIS FRAME & SUSPENSION RIGGING
// ---------------------------------------------------------------------------
function buildChassis() {
  const piece = "chassis";

  // Main cast steel frame rails (left at Y = -16, right at Y = +16)
  for (const y of [-16, 16]) {
    // Main longitudinal bar
    boxAt(piece, { x: -128, y: y - 2.5, w: 256, d: 5, r: 1.2 }, 6, 18, { tone: "mid" }, {
      bias: -25,
      bevel: 0.8,
      name: `chassis.main_rail_${y}`,
      extra: Ln(
        k.segment([-126, y + 2.5, 15], [126, y + 2.5, 15], P) +
        k.segment([-126, y + 2.5, 23], [126, y + 2.5, 23], P),
        { tone: "faint" }
      ),
    });

    // Hornblock pedestal guides for the driving axles (X = -32, 10, 52)
    for (const x of [-32, 10, 52]) {
      boxAt(piece, { x: x - 8, y: y - 3, w: 16, d: 6, r: 0.8 }, 2, 16, { tone: "mid" }, {
        bias: -20,
        bevel: 0.4,
        name: `chassis.hornblock_${x}_${y}`,
      });

      // Laminated Leaf Springs over axleboxes
      const springPlan = { x: x - 12, y: y - 2.2, w: 24, d: 4.4, r: 1.0 };
      boxAt(piece, springPlan, 24, 4.5, { tone: "hi" }, {
        bias: -10,
        bevel: 0.5,
        name: `chassis.spring_${x}_${y}`,
        extra: Ln(
          k.segment([x - 11, y + 2.2, 25.5], [x + 11, y + 2.2, 25.5], P) +
          k.segment([x - 9, y + 2.2, 27], [x + 9, y + 2.2, 27], P),
          { tone: "faint" }
        ),
      });

      // Spring buckle / clamp band
      boxAt(piece, { x: x - 2.5, y: y - 2.8, w: 5, d: 5.6, r: 0.4 }, 23, 6.5, { tone: "mid" }, {
        bias: -5,
        name: `chassis.spring_band_${x}_${y}`,
        extra: Dots([at([x, y + 2.8, 26.2])], { size: 0.4, tone: "lit" }),
      });
    }

    // Equalizer compensation beams linking spring hangers
    for (const x of [-11, 31]) {
      boxAt(piece, { x: x - 7, y: y - 1.8, w: 14, d: 3.6, r: 0.8 }, 21, 3.5, { tone: "mid" }, {
        bias: -12,
        name: `chassis.equalizer_${x}_${y}`,
      });
    }
  }

  // Transverse cross-stretchers (bracing frame bars)
  for (const x of [-120, -75, -10, 35, 75, 120]) {
    boxAt(piece, { x: x - 4, y: -16, w: 8, d: 32, r: 0.8 }, 8, 14, { tone: "lo" }, {
      bias: -30,
      name: `chassis.cross_stretcher_${x}`,
    });
  }

  // Front buffer beam & pilot bracket
  boxAt(piece, { x: 126, y: -36, w: 8, d: 72, r: 1.6 }, 0, 16, { tone: "hi" }, {
    bias: 35,
    bevel: 0.8,
    name: "chassis.front_buffer_beam",
    extra: Dots([at([134, -28, 8]), at([134, 28, 8]), at([134, 0, 8])], { size: 0.55, tone: "lit" }),
  });

  // Cowcatcher wedge pilot bars
  for (let i = -6; i <= 6; i++) {
    const yOff = i * 4.8;
    const xTip = 145 - Math.abs(i) * 2.4;
    tubeItems(piece, [[134, yOff, 1], [xTip, yOff * 0.7, -10]], 1.1, {
      tone: "mid",
      bias: 40,
      name: `chassis.pilot_bar_${i}`,
    });
  }
}

// ---------------------------------------------------------------------------
// 3. COUPLED DRIVING WHEELS & BOGIE TRUCKS
// ---------------------------------------------------------------------------
function buildWheels() {
  const piece = "wheels";
  const driverRadius = 32;
  const axleZ = 32 - 22; // Rail top is at -22; radius 32 places axle at Z = 10

  // 3 Pairs of Coupled Driving Wheels (X = -32, 10, 52)
  for (const x of [-32, 10, 52]) {
    // Axle connecting left and right wheels
    const AF = G.frameOf([x, 0, axleZ], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
    cylinderAlong(piece, AF, -22, 22, 5.5, { tone: "mid" }, {
      bias: -15,
      name: `wheels.axle_${x}`,
    });

    for (const y of [-23.5, 23.5]) {
      const WF = G.frameOf([x, y, axleZ], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
      const sign = y > 0 ? 1 : -1;

      // Wheel Tire & Flange
      const tireProfile = [
        [sign * -2.5, driverRadius - 3.5],
        [sign * 2.5, driverRadius - 3.5],
        [sign * 2.5, driverRadius],
        [sign * 0.5, driverRadius],
        [sign * 0.0, driverRadius + 2.5], // Wheel flange
        [sign * -2.5, driverRadius + 2.5],
      ];
      put(piece, [x, y, axleZ], S(G.lathe(tireProfile, WF, P, { steps: 48 }), { tone: "hi" }), {
        bias: y > 0 ? 30 : -40,
        name: `wheels.tire_${x}_${y}`,
        shapes: [record(A.disc(WF, sign * -2.5, sign * 2.5, driverRadius + 2.5, { name: `wheels.tire_${x}_${y}` }))],
      });

      // Wheel Hub
      cylinderAlong(piece, WF, sign * -3.5, sign * 3.5, 8.5, { tone: "mid" }, {
        bias: y > 0 ? 32 : -38,
        name: `wheels.hub_${x}_${y}`,
      });

      // Crescent Counterweight (occupies 120° sector opposite crankpin)
      const cwProfile = [
        [sign * -1.8, 12],
        [sign * 1.8, 12],
        [sign * 1.8, driverRadius - 4],
        [sign * -1.8, driverRadius - 4],
      ];
      put(piece, [x, y, axleZ], S(G.lathe(cwProfile, WF, P, { steps: 24 }), { tone: "mid" }), {
        bias: y > 0 ? 34 : -36,
        name: `wheels.counterweight_${x}_${y}`,
      });

      // 16 Wheel Spokes (rendered as radial ribs)
      for (let s = 0; s < 16; s++) {
        const angle = (s / 16) * Math.PI * 2;
        const p0 = [x + Math.cos(angle) * 8.5, y + sign * 1.5, axleZ + Math.sin(angle) * 8.5];
        const p1 = [x + Math.cos(angle) * (driverRadius - 4), y + sign * 1.5, axleZ + Math.sin(angle) * (driverRadius - 4)];
        put(piece, p0, Ln(k.segment(p0, p1, P), { tone: "hi" }), {
          bias: y > 0 ? 33 : -37,
          name: `wheels.spoke_${x}_${y}_${s}`,
        });
      }

      // Crankpin for main/coupling rod attachment (at radius 13)
      const crankAngle = 0; // standard 0-deg baseline
      const cpX = x + Math.cos(crankAngle) * 13;
      const cpZ = axleZ + Math.sin(crankAngle) * 13;
      const CPF = G.frameOf([cpX, y, cpZ], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
      cylinderAlong(piece, CPF, sign * 2.5, sign * (2.5 + (y > 0 ? 12 : 5)), 2.4, { tone: "lit" }, {
        bias: y > 0 ? 45 : -30,
        name: `wheels.crankpin_${x}_${y}`,
      });
    }
  }

  // 4-Wheel Leading Pilot Bogie Truck (Centers at X = 96, 120; wheel radius 16; axle at Z = -6)
  const bogieZ = 16 - 22; // -6
  for (const bx of [96, 120]) {
    for (const by of [-23.5, 23.5]) {
      const BF = G.frameOf([bx, by, bogieZ], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
      cylinderAlong(piece, BF, -2, 2, 16, { tone: "mid" }, {
        bias: by > 0 ? 25 : -42,
        name: `wheels.bogie_wheel_${bx}_${by}`,
      });
      cylinderAlong(piece, BF, -2.5, 2.5, 4.2, { tone: "hi" }, {
        bias: by > 0 ? 27 : -40,
        name: `wheels.bogie_hub_${bx}_${by}`,
      });
    }
  }
  // Bogie Frame
  boxAt(piece, { x: 88, y: -20, w: 40, d: 40, r: 1.6 }, bogieZ - 1, 6, { tone: "lo" }, {
    bias: 5,
    name: "wheels.bogie_frame",
  });

  // 2-Wheel Trailing Radial Truck under firebox (X = -82, radius 18, axle at Z = -4)
  const trailZ = 18 - 22; // -4
  for (const ty of [-23.5, 23.5]) {
    const TF = G.frameOf([-82, ty, trailZ], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
    cylinderAlong(piece, TF, -2.5, 2.5, 18, { tone: "mid" }, {
      bias: ty > 0 ? 22 : -44,
      name: `wheels.trailing_wheel_${ty}`,
    });
  }
}

// ---------------------------------------------------------------------------
// 4. CYLINDERS & WALSCHAERTS VALVE GEAR
// ---------------------------------------------------------------------------
function buildCylindersAndMotion() {
  const piece = "cylinders_motion";
  const axleZ = 10;

  // Twin Cast Cylinder Blocks (Left at Y=-36, Right at Y=+36)
  for (const y of [-36, 36]) {
    const sign = y > 0 ? 1 : -1;

    // Main Cylinder Barrel (X = 76 to 108, center Z = 10, radius 10)
    const CF = G.frameOf([92, y, axleZ], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
    cylinderAlong(piece, CF, -16, 16, 10, { tone: "hi" }, {
      bias: y > 0 ? 50 : -20,
      name: `cylinders.barrel_${y}`,
    });

    // Front Cylinder Head (bolted dish cap)
    cylinderAlong(piece, CF, 16, 18.5, 11, { tone: "hi" }, {
      bias: y > 0 ? 52 : -18,
      name: `cylinders.head_front_${y}`,
      extra: Dots(G.dotsOf(CF, 18.5, 8.8, 8, P, { all: true }), { size: 0.45, tone: "lit" }),
    });

    // Rear Cylinder Head with Piston Rod Gland
    cylinderAlong(piece, CF, -18.5, -16, 11, { tone: "mid" }, {
      bias: y > 0 ? 48 : -22,
      name: `cylinders.head_rear_${y}`,
    });

    // Steam Chest (Piston Valve Chamber above cylinder, center Z = 24, radius 6.5)
    const VF = G.frameOf([92, y, 24], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
    cylinderAlong(piece, VF, -16, 16, 6.5, { tone: "hi" }, {
      bias: y > 0 ? 54 : -16,
      name: `cylinders.valve_chest_${y}`,
    });
    cylinderAlong(piece, VF, 16, 18, 7.2, { tone: "mid" }, {
      bias: y > 0 ? 55 : -15,
      name: `cylinders.valve_head_${y}`,
    });

    // Polished Crosshead Guide Bars (upper and lower, X = 36 to 76)
    boxAt(piece, { x: 36, y: y - 1.5, w: 40, d: 3, r: 0.4 }, axleZ + 5, 2.2, { tone: "lit" }, {
      bias: y > 0 ? 56 : -14,
      name: `motion.guide_upper_${y}`,
    });
    boxAt(piece, { x: 36, y: y - 1.5, w: 40, d: 3, r: 0.4 }, axleZ - 7.2, 2.2, { tone: "lit" }, {
      bias: y > 0 ? 56 : -14,
      name: `motion.guide_lower_${y}`,
    });

    // Guide Yoke Bracket supporting rear of guide bars (X = 36)
    boxAt(piece, { x: 34, y: y - 2.5, w: 4, d: 5, r: 0.8 }, 2, 28, { tone: "mid" }, {
      bias: y > 0 ? 52 : -18,
      name: `motion.guide_yoke_${y}`,
    });

    // Alligator Crosshead (slides between guides)
    const xhPlan = { x: 54, y: y - 2.2, w: 14, d: 4.4, r: 0.8 };
    boxAt(piece, xhPlan, axleZ - 5, 10, { tone: "hi" }, {
      bias: y > 0 ? 58 : -12,
      name: `motion.crosshead_${y}`,
      extra: Dots([at([61, y + sign * 2.4, axleZ])], { size: 0.6, tone: "lit" }),
    });

    // Piston Rod sliding into cylinder
    tubeItems(piece, [[61, y, axleZ], [88, y, axleZ]], 1.6, {
      tone: "lit",
      bias: y > 0 ? 57 : -13,
      name: `motion.piston_rod_${y}`,
    });

    // Main Connecting Rod (Crosshead to Main Driver at X = 10)
    tubeItems(piece, [[61, y + sign * 3.5, axleZ], [10, y + sign * 3.5, axleZ]], 2.4, {
      tone: "lit",
      bias: y > 0 ? 60 : -10,
      name: `motion.main_rod_${y}`,
    });

    // Side Coupling Rods (Rear X=-32 to Main X=10 to Front X=52)
    tubeItems(piece, [[-32, y + sign * 2.0, axleZ], [10, y + sign * 2.0, axleZ], [52, y + sign * 2.0, axleZ]], 2.2, {
      tone: "hi",
      bias: y > 0 ? 46 : -24,
      name: `motion.side_rod_${y}`,
    });

    // Walschaerts Valve Gear (prominently modeled on visible right side, and left)
    // 1. Eccentric Crank pinned to main crankpin at X = 10
    const eccPin = [10 - 2, y + sign * 6.5, axleZ + 6];
    tubeItems(piece, [[10, y + sign * 4.5, axleZ], eccPin], 1.5, {
      tone: "hi",
      bias: y > 0 ? 62 : -8,
      name: `motion.eccentric_crank_${y}`,
    });

    // 2. Eccentric Rod from crank to expansion link tail
    const linkTail = [28, y + sign * 5.5, 14];
    tubeItems(piece, [eccPin, linkTail], 1.2, {
      tone: "mid",
      bias: y > 0 ? 63 : -7,
      name: `motion.eccentric_rod_${y}`,
    });

    // 3. Curved Expansion Link (Quadrant) swinging on trunnions at (28, 22)
    boxAt(piece, { x: 26, y: y + sign * 4.5, w: 4, d: 2, r: 0.6 }, 14, 18, { tone: "hi" }, {
      bias: y > 0 ? 64 : -6,
      name: `motion.expansion_link_${y}`,
      extra: Ln(k.segment([28, y + sign * 5.6, 16], [28, y + sign * 5.6, 30], P), { tone: "faint" }),
    });

    // 4. Radius Rod from expansion link to combination lever
    const combTop = [64, y + sign * 4.8, 25];
    tubeItems(piece, [[28, y + sign * 5.2, 20], combTop], 1.3, {
      tone: "hi",
      bias: y > 0 ? 65 : -5,
      name: `motion.radius_rod_${y}`,
    });

    // 5. Combination Lever (vertical mixing lever)
    const combBottom = [61, y + sign * 4.8, 5];
    tubeItems(piece, [combTop, combBottom], 1.4, {
      tone: "hi",
      bias: y > 0 ? 66 : -4,
      name: `motion.combination_lever_${y}`,
    });

    // 6. Union link from crosshead to combination lever bottom
    tubeItems(piece, [[61, y + sign * 2.8, axleZ - 4], combBottom], 1.1, {
      tone: "mid",
      bias: y > 0 ? 64 : -6,
      name: `motion.union_link_${y}`,
    });

    // 7. Valve Stem entering steam chest
    tubeItems(piece, [[combTop[0], y, 24], [78, y, 24]], 1.4, {
      tone: "lit",
      bias: y > 0 ? 67 : -3,
      name: `motion.valve_stem_${y}`,
    });
  }
}

// ---------------------------------------------------------------------------
// 5. BOILER BARREL & FIRE-TUBES CUTAWAY
// ---------------------------------------------------------------------------
function buildBoiler() {
  const piece = "boiler";
  const boilerR = 26;
  const boilerZ = 36;
  const xRear = -36;
  const xFront = 76;
  const BF = G.frameOf([0, 0, boilerZ], [1, 0, 0], [0, 1, 0], [0, 0, 1]);

  // Boiler Outer Barrel Shell (Telescopic rolled courses)
  const barrelProfile = [
    [xRear, 0],
    [xRear, boilerR],
    [20, boilerR],
    [20.5, boilerR + 0.6], // course step
    [xFront, boilerR + 0.6],
    [xFront, 0],
  ];
  put(piece, [20, 0, boilerZ], S(G.lathe(barrelProfile, BF, P, { steps: 48 }), { tone: "mid" }), {
    bias: 0,
    name: "boiler.barrel_shell",
    shapes: [record(A.solid(BF, barrelProfile, { name: "boiler.barrel_shell" }))],
  });

  // Polished Brass Boiler Cladding Bands
  for (const bx of [-25, -6, 14, 34, 54]) {
    cylinderAlong(piece, BF, bx - 0.8, bx + 0.8, boilerR + 1.2, { tone: "lit" }, {
      bias: 6,
      name: `boiler.band_${bx}`,
      extra: Dots([at([bx, boilerR + 1.2, boilerZ])], { size: 0.35, tone: "mid" }),
    });
  }

  // INTERNAL CUTAWAY ELEMENTS (visible when cutaway toggle is active)
  // 1. Front Tubeplate at X = 75
  cylinderAlong(piece, BF, 74, 76, boilerR - 1.2, { tone: "mid" }, {
    bias: 2,
    name: "boiler.front_tubeplate",
    cutaway: true,
  });

  // 2. Rear Firebox Tubeplate at X = -35
  cylinderAlong(piece, BF, -36, -34, boilerR - 1.2, { tone: "mid" }, {
    bias: -8,
    name: "boiler.rear_tubeplate",
    cutaway: true,
  });

  // 3. Matrix of Longitudinal Fire-Tubes (28 tubes)
  for (let rRing = 6; rRing <= 20; rRing += 5) {
    const count = rRing === 6 ? 6 : rRing === 11 ? 10 : 12;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const ty = Math.cos(angle) * rRing;
      const tz = boilerZ + Math.sin(angle) * rRing;
      // Skip top region reserved for steam space
      if (tz > boilerZ + 15) continue;

      tubeItems(piece, [[-34, ty, tz], [74, ty, tz]], 1.3, {
        tone: "hi",
        bias: 4,
        name: `boiler.firetube_${rRing}_${i}`,
        cutaway: true,
      });
    }
  }

  // 4. Matrix of 6 Large Superheater Flues
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const fy = Math.cos(angle) * 12;
    const fz = boilerZ + 3 + Math.sin(angle) * 8;
    tubeItems(piece, [[-34, fy, fz], [74, fy, fz]], 3.2, {
      tone: "lit",
      bias: 5,
      name: `boiler.flue_${i}`,
      cutaway: true,
    });
  }

  // 5. Translucent Water Level representation in cutaway
  boxAt(piece, { x: -34, y: -boilerR + 3, w: 108, d: (boilerR - 3) * 2, r: 1.0 }, boilerZ - 18, 28, { tone: "cold" }, {
    bias: 1,
    name: "boiler.water_volume",
    cutaway: true,
  });
}

// ---------------------------------------------------------------------------
// 6. FIREBOX, GRATE & WATER JACKET
// ---------------------------------------------------------------------------
function buildFirebox() {
  const piece = "firebox";
  const xRear = -88;
  const xFront = -36;
  const wFirebox = 50;

  // Outer Firebox Shell (Belpaire square-top shoulders)
  const outerPlan = { x: xRear, y: -wFirebox / 2, w: xFront - xRear, d: wFirebox, r: 8 };
  boxAt(piece, outerPlan, 2, 58, { tone: "mid" }, {
    bias: -10,
    bevel: 2.2,
    name: "firebox.outer_shell",
    extra: Ln(
      k.segment([xRear, -wFirebox / 2 + 8, 52], [xFront, -wFirebox / 2 + 8, 52], P) +
      k.segment([xRear, wFirebox / 2 - 8, 52], [xFront, wFirebox / 2 - 8, 52], P),
      { tone: "faint" }
    ),
  });

  // Foundation Ring (Mud Ring at bottom of water leg)
  boxAt(piece, { x: xRear + 1, y: -wFirebox / 2 + 1, w: xFront - xRear - 2, d: wFirebox - 2, r: 6 }, 2, 4.5, { tone: "lo" }, {
    bias: -12,
    name: "firebox.foundation_ring",
  });

  // Deep Hopper Ashpan with Air Dampers
  boxAt(piece, { x: xRear + 4, y: -20, w: 44, d: 40, r: 2.0 }, -8, 10, { tone: "lo" }, {
    bias: -14,
    bevel: 1.0,
    name: "firebox.ashpan",
  });
  // Ashpan Damper flap doors
  boxAt(piece, { x: xFront - 5, y: -16, w: 3, d: 32, r: 0.6 }, -6, 7, { tone: "mid" }, {
    bias: -13,
    name: "firebox.damper_flap",
  });

  // Shaking Grate Firebars (inside bottom, Z = 6)
  for (let gx = xRear + 8; gx <= xFront - 8; gx += 5.5) {
    boxAt(piece, { x: gx - 1.8, y: -18, w: 3.6, d: 36, r: 0.4 }, 6, 2.5, { tone: "mid" }, {
      bias: -7,
      name: `firebox.grate_bar_${gx}`,
      cutaway: true,
    });
  }

  // Refractory Brick Arch (slopes backward and upward from throat sheet)
  boxAt(piece, { x: xFront - 18, y: -17, w: 16, d: 34, r: 1.2 }, 16, 4.5, { tone: "hi" }, {
    bias: -6,
    bevel: 0.8,
    name: "firebox.brick_arch",
    cutaway: true,
  });

  // Staybolts matrix on firebox side sheets
  const stayPoints = [];
  for (let sx = xRear + 6; sx <= xFront - 6; sx += 8) {
    for (let sz = 10; sz <= 50; sz += 8) {
      stayPoints.push(at([sx, wFirebox / 2, sz]));
    }
  }
  put(piece, [xRear + 25, wFirebox / 2, 30], Dots(stayPoints, { size: 0.4, tone: "lit" }), {
    bias: 12,
    name: "firebox.staybolt_matrix",
  });
}

// ---------------------------------------------------------------------------
// 7. SMOKEBOX & BLAST PIPE EXHAUST
// ---------------------------------------------------------------------------
function buildSmokebox() {
  const piece = "smokebox";
  const boilerR = 26;
  const boilerZ = 36;
  const xFront = 76;
  const xSmokeboxEnd = 126;
  const SF = G.frameOf([0, 0, boilerZ], [1, 0, 0], [0, 1, 0], [0, 0, 1]);

  // Smokebox Cylindrical Drum
  cylinderAlong(piece, SF, xFront, xSmokeboxEnd, boilerR + 0.5, { tone: "mid" }, {
    bias: 15,
    name: "smokebox.drum",
  });

  // Smokebox Front Door Ring & Hinged Dished Door
  cylinderAlong(piece, SF, xSmokeboxEnd, xSmokeboxEnd + 2.5, boilerR + 1.2, { tone: "hi" }, {
    bias: 38,
    name: "smokebox.door_ring",
    extra: Dots(G.dotsOf(SF, xSmokeboxEnd + 2.5, boilerR - 1.5, 12, P, { all: true }), { size: 0.45, tone: "lit" }),
  });
  // Dished Door Dome
  put(piece, [xSmokeboxEnd + 3, 0, boilerZ], S(G.lathe([
    [xSmokeboxEnd + 2.5, 0],
    [xSmokeboxEnd + 2.5, boilerR - 2],
    [xSmokeboxEnd + 6.5, boilerR - 6],
    [xSmokeboxEnd + 7.5, 0],
  ], SF, P, { steps: 36 }), { tone: "mid" }), {
    bias: 42,
    name: "smokebox.door_dome",
  });
  // Central Locking Dart & Handwheel
  cylinderAlong(piece, SF, xSmokeboxEnd + 7.5, xSmokeboxEnd + 11.5, 2.8, { tone: "lit" }, {
    bias: 45,
    name: "smokebox.dart_handle",
    extra: Ln(k.knurl(xSmokeboxEnd + 9.5, 0, 2.8, 0, 0, 16, P), { tone: "lo" }),
  });

  // Chimney (Smokestack) atop Smokebox at X = 100
  const CF = G.frameOf([100, 0, boilerZ + boilerR], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
  const chimneyProfile = [
    [0, 6.8],
    [3, 6.2],
    [22, 5.8],
    [26, 6.8],
    [28, 8.2], // flanged copper cap
    [28, 0],
  ];
  put(piece, [100, 0, boilerZ + boilerR + 14], S(G.lathe(chimneyProfile, CF, P, { steps: 36 }), { tone: "hi" }), {
    bias: 50,
    name: "smokebox.chimney",
  });
  // Polished Copper Cap Ring
  cylinderAlong(piece, CF, 25.5, 28, 8.4, { tone: "lit" }, {
    bias: 52,
    name: "smokebox.chimney_cap",
  });

  // Blast Pipe Nozzle & Petticoat Pipe (inside smokebox, cutaway / operational)
  const BF = G.frameOf([100, 0, 14], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
  cylinderAlong(piece, BF, 0, 18, 4.2, { tone: "hi" }, {
    bias: 22,
    name: "smokebox.blast_pipe",
    cutaway: true,
  });
  // Converging Blast Nozzle Tip
  cylinderAlong(piece, BF, 18, 24, 2.6, { tone: "lit" }, {
    bias: 24,
    name: "smokebox.blast_nozzle",
    cutaway: true,
  });
  // Petticoat Draft Apron Pipe
  cylinderAlong(piece, BF, 28, 42, 6.0, { tone: "mid" }, {
    bias: 26,
    name: "smokebox.petticoat_pipe",
    cutaway: true,
  });

  // Smoke Deflector Plates ("Elephant Ears" on sides at Y = ±38)
  for (const y of [-38, 38]) {
    boxAt(piece, { x: 82, y: y - 0.8, w: 42, d: 1.6, r: 2.0 }, 14, 46, { tone: "hi" }, {
      bias: y > 0 ? 55 : -25,
      bevel: 0.6,
      name: `smokebox.deflector_${y}`,
    });
  }
}

// ---------------------------------------------------------------------------
// 8. STEAM DOME & SUPERHEATER
// ---------------------------------------------------------------------------
function buildDomeAndSuperheater() {
  const piece = "dome_superheater";
  const boilerR = 26;
  const boilerZ = 36;

  // Steam Dome atop boiler barrel at X = 12
  const DF = G.frameOf([12, 0, boilerZ + boilerR], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
  const domeProfile = [
    [0, 10.8],
    [2, 9.8],
    [12, 9.4],
    [18, 8.8],
    [21, 6.0],
    [22, 0],
  ];
  put(piece, [12, 0, boilerZ + boilerR + 10], S(G.lathe(domeProfile, DF, P, { steps: 36 }), { tone: "hi" }), {
    bias: 48,
    name: "dome.casing",
  });
  // Flanged base ring with rivets
  cylinderAlong(piece, DF, 0, 2.5, 12.2, { tone: "mid" }, {
    bias: 49,
    name: "dome.base_flange",
    extra: Dots(G.dotsOf(DF, 2.5, 11.2, 12, P, { all: true }), { size: 0.4, tone: "lit" }),
  });

  // Internal Regulator Throttle Valve (inside dome)
  cylinderAlong(piece, DF, 4, 16, 4.2, { tone: "lit" }, {
    bias: 44,
    name: "dome.regulator_valve",
    cutaway: true,
  });

  // Internal Dry Pipe (runs from dome forward to superheater header)
  tubeItems(piece, [[12, 0, boilerZ + 20], [74, 0, boilerZ + 16]], 3.4, {
    tone: "hi",
    bias: 30,
    name: "dome.internal_dry_pipe",
    cutaway: true,
  });

  // External Regulator Reach Rod (along boiler top to cab)
  tubeItems(piece, [[-88, 14, boilerZ + boilerR + 4], [12, 11, boilerZ + boilerR + 4]], 1.2, {
    tone: "lit",
    bias: 46,
    name: "dome.reach_rod",
  });

  // Superheater Header in upper smokebox at X = 78
  boxAt(piece, { x: 77, y: -18, w: 6, d: 36, r: 1.5 }, boilerZ + 4, 16, { tone: "hi" }, {
    bias: 32,
    bevel: 0.8,
    name: "dome.superheater_header",
    cutaway: true,
  });

  // Superheater Element Loops (U-bends inside flues)
  for (let i = -1; i <= 1; i++) {
    const yOff = i * 10;
    tubeItems(piece, [
      [78, yOff, boilerZ + 12],
      [-28, yOff, boilerZ + 12],
      [-28, yOff + 4, boilerZ + 8],
      [78, yOff + 4, boilerZ + 8],
    ], 1.2, {
      tone: "lit",
      bias: 28,
      name: `dome.superheater_loop_${i}`,
      cutaway: true,
    });
  }

  // Main High-Pressure Steam Delivery Pipes (Header down to Valve Chests)
  for (const y of [-36, 36]) {
    const sign = y > 0 ? 1 : -1;
    tubeItems(piece, [
      [80, sign * 14, boilerZ + 6],
      [84, sign * 26, boilerZ - 2],
      [88, sign * 34, 26],
      [90, sign * 36, 24],
    ], 2.8, {
      tone: "hi",
      bias: y > 0 ? 56 : -10,
      name: `dome.main_steam_pipe_${y}`,
    });
  }
}

// ---------------------------------------------------------------------------
// 9. CAB & BACKHEAD CONTROLS
// ---------------------------------------------------------------------------
function buildCab() {
  const piece = "cab_backhead";
  const xRear = -128;
  const xFront = -88;
  const cabW = 66;

  // Cab Shell Structure
  const cabPlan = { x: xRear, y: -cabW / 2, w: xFront - xRear, d: cabW, r: 4 };
  boxAt(piece, cabPlan, 10, 64, { tone: "mid" }, {
    bias: -35,
    bevel: 1.8,
    name: "cab.shell",
    extra: Ln(
      // Arched side windows
      k.planOutline({ x: -118, y: cabW / 2 - 0.5, w: 18, d: 1, r: 3 }, 44, P) +
      k.planOutline({ x: -118, y: -cabW / 2 - 0.5, w: 18, d: 1, r: 3 }, 44, P),
      { tone: "lit" }
    ),
  });

  // Cab Roof with curved ventilator hatch
  boxAt(piece, { x: xRear - 2, y: -cabW / 2 - 2, w: xFront - xRear + 4, d: cabW + 4, r: 6 }, 72, 3.5, { tone: "hi" }, {
    bias: -30,
    bevel: 1.0,
    name: "cab.roof",
  });
  boxAt(piece, { x: -114, y: -12, w: 16, d: 24, r: 1.0 }, 75.5, 2.5, { tone: "mid" }, {
    bias: -28,
    name: "cab.ventilator_hatch",
  });

  // Boiler Backhead Plate inside cab (rear of firebox at X = -88)
  boxAt(piece, { x: -89, y: -22, w: 3, d: 44, r: 2.0 }, 12, 48, { tone: "mid" }, {
    bias: -18,
    bevel: 0.6,
    name: "cab.backhead_plate",
  });

  // Duplex Bourdon Steam Pressure Gauge (Boiler & Steam Chest)
  const GF = G.frameOf([-86, 8, 48], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
  cylinderAlong(piece, GF, 0, 3.2, 4.5, { tone: "lit" }, {
    bias: -15,
    name: "cab.gauge_pressure",
    extra: Dots([at([-82.8, 8, 48])], { size: 0.5, tone: "mid" }) + Ln(k.segment([-82.8, 8, 48], [-82.8, 10, 50.5], P), { tone: "lo" }),
  });

  // Water Level Sight Glass Columns (Dual glasses with brass guards)
  for (const gy of [-10, 18]) {
    const VF = G.frameOf([-86, gy, 38], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
    cylinderAlong(piece, VF, -8, 8, 1.4, { tone: "lit" }, {
      bias: -14,
      name: `cab.water_glass_${gy}`,
      extra: Ln(k.segment([-85, gy, 30], [-85, gy, 46], P), { tone: "cold" }),
    });
    // Upper and lower try-cocks
    boxAt(piece, { x: -85, y: gy - 1.2, w: 3, d: 2.4, r: 0.4 }, 28, 2.5, { tone: "hi" }, { bias: -13, name: `cab.trycock_lo_${gy}` });
    boxAt(piece, { x: -85, y: gy - 1.2, w: 3, d: 2.4, r: 0.4 }, 45.5, 2.5, { tone: "hi" }, { bias: -13, name: `cab.trycock_hi_${gy}` });
  }

  // Regulator Quadrant Throttle Lever
  tubeItems(piece, [[-86, 14, 52], [-96, 16, 56]], 1.2, {
    tone: "lit",
    bias: -12,
    name: "cab.regulator_handle",
  });

  // Screw Reverser Handwheel
  const RF = G.frameOf([-98, 22, 32], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
  cylinderAlong(piece, RF, 0, 2.5, 4.2, { tone: "hi" }, {
    bias: -11,
    name: "cab.reverser_wheel",
    extra: Dots([at([-95.5, 22, 32])], { size: 0.4, tone: "lit" }),
  });
}

// ---------------------------------------------------------------------------
// 10. AUXILIARY INJECTORS, SAFETY VALVES & TENDER COUPLING
// ---------------------------------------------------------------------------
function buildAuxiliaries() {
  const piece = "plumbing_aux";
  const boilerR = 26;
  const boilerZ = 36;

  // Twin Ross Pop Safety Valves atop firebox crown at X = -38
  for (const sy of [-4, 4]) {
    const SF = G.frameOf([-38, sy, boilerZ + boilerR], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
    cylinderAlong(piece, SF, 0, 8.5, 2.6, { tone: "lit" }, {
      bias: 40,
      name: `aux.safety_valve_${sy}`,
    });
    // Valve discharge nozzle
    cylinderAlong(piece, SF, 8.5, 12, 1.8, { tone: "hi" }, {
      bias: 42,
      name: `aux.safety_nozzle_${sy}`,
    });
  }

  // Brass Chime Steam Whistle (X = -46, Z = 66)
  const WF = G.frameOf([-46, 6, boilerZ + boilerR + 2], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
  cylinderAlong(piece, WF, 0, 12, 2.2, { tone: "lit" }, {
    bias: 44,
    name: "aux.steam_whistle",
  });

  // Live-Steam Injector (Giffard venturi injector mounted under cab footplate)
  boxAt(piece, { x: -105, y: 26, w: 16, d: 6, r: 1.0 }, 2, 7, { tone: "hi" }, {
    bias: 20,
    name: "aux.live_injector",
  });

  // Copper Feedwater Delivery Piping from injector to boiler check valves
  tubeItems(piece, [
    [-97, 28, 6],
    [-75, 28, 12],
    [-10, 28, 28],
    [38, 28, 36],
  ], 1.6, {
    tone: "lit",
    bias: 25,
    name: "aux.feedwater_pipe_right",
  });

  // Boiler Check Valve (Clack Valve) on boiler side at X = 40
  const CF = G.frameOf([40, 27, 36], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
  cylinderAlong(piece, CF, 0, 4.5, 3.2, { tone: "hi" }, {
    bias: 26,
    name: "aux.clack_valve_right",
    extra: Dots(G.dotsOf(CF, 4.5, 2.4, 6, P, { all: true }), { size: 0.35, tone: "lit" }),
  });

  // Electric Turbo-Generator for headlight (atop boiler at X = -14)
  const TF = G.frameOf([-14, -8, boilerZ + boilerR + 1], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
  cylinderAlong(piece, TF, -5, 5, 3.6, { tone: "hi" }, {
    bias: 46,
    name: "aux.turbo_generator",
  });

  // Front Electric Headlight on Smokebox Door Bracket
  boxAt(piece, { x: 133, y: -4.5, w: 7, d: 9, r: 1.0 }, boilerZ - 4, 11, { tone: "hi" }, {
    bias: 52,
    bevel: 0.6,
    name: "aux.headlight_housing",
    extra: Dots([at([140, 0, boilerZ + 1.5])], { size: 1.8, tone: "lit" }),
  });

  // Front Tender Coupling Face at rear of cab (X = -135)
  boxAt(piece, { x: -136, y: -24, w: 4, d: 48, r: 1.2 }, 6, 22, { tone: "lo" }, {
    bias: -45,
    name: "aux.tender_bulkhead",
  });
  // Drawbar & Safety Chains
  cylinderAlong(piece, G.frameOf([-142, 0, 12], [1, 0, 0], [0, 1, 0], [0, 0, 1]), -8, 6, 2.5, { tone: "hi" }, {
    bias: -48,
    name: "aux.drawbar",
  });
}

// ---------------------------------------------------------------------------
// ASSEMBLE ALL SYSTEMS
// ---------------------------------------------------------------------------
buildTrack();
buildChassis();
buildWheels();
buildCylindersAndMotion();
buildBoiler();
buildFirebox();
buildSmokebox();
buildDomeAndSuperheater();
buildCab();
buildAuxiliaries();

// Depth sorting based on projected coordinates and painter bias
items.sort((a, b) => a.key - b.key);

const groups = items.map((item, index) => {
  const [mx, my, mz] = item.move;
  return `<g class="it" data-piece="${item.piece}"${item.ride !== item.piece ? ` data-ride="${item.ride}"` : ""} data-k="${item.key.toFixed(2)}" data-m="${mx.toFixed(1)},${my.toFixed(1)},${mz.toFixed(1)}" data-i="${index}" data-name="${item.name}">${item.svg}</g>`;
});

// Front and Back SVGs
const LABEL_TEXT =
  "Steam Locomotive 4-6-2 Pacific class technical anatomy and cutaway: heavy rolled boiler barrel with firetubes and flues, Belpaire firebox with rocking grate and water jacket, front smokebox with blast pipe induced draft, steam dome with regulator valve, superheater header, cast steel frame bed with equalized spring rigging, coupled 79-inch spoked driving wheels, outside cylinders and full Walschaerts valve gear linkage, cab backhead controls, and live steam injector.";

const backSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg loco-back" viewBox="0 0 ${W} ${H}" role="img" aria-label="${LABEL_TEXT}"></svg>`;
const frontSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg loco-front" viewBox="0 0 ${W} ${H}" aria-hidden="true"><g class="loco-assembly">${groups.join("")}</g></svg>`;

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
  chimneyExit: at([100, 0, 90]),
  fireboxDoor: at([-88, 0, 24]),
  pieces: Object.fromEntries(Object.entries(PIECES).map(([id, p]) => [id, { name: p.name, say: p.say }])),
  stagger: STAGGER,
  order: ORDER_DISPLAY,
  spring: SPRING,

  // Key screen centers for wheels and linkages
  centers: {
    driverRearR: at([-32, 23.5, 10]),
    driverRearL: at([-32, -23.5, 10]),
    driverMainR: at([10, 23.5, 10]),
    driverMainL: at([10, -23.5, 10]),
    driverFrontR: at([52, 23.5, 10]),
    driverFrontL: at([52, -23.5, 10]),
    bogie1R: at([96, 23.5, -6]),
    bogie1L: at([96, -23.5, -6]),
    bogie2R: at([120, 23.5, -6]),
    bogie2L: at([120, -23.5, -6]),
    trailR: at([-82, 23.5, -4]),
    trailL: at([-82, -23.5, -4]),
    expLinkR: at([28, 23.5 + 4.5, 22]),
    expLinkL: at([28, -23.5 - 4.5, 22]),
    dynoRearR: at([-32, 22, -11]),
    dynoRearL: at([-32, -22, -11]),
    dynoMainR: at([10, 22, -11]),
    dynoMainL: at([10, -22, -11]),
    dynoFrontR: at([52, 22, -11]),
    dynoFrontL: at([52, -22, -11]),
  },
};

// Corner metadata badges
const corners = `<div class="iso-plate-corners" aria-hidden="true">
  <span class="iso-plate-corner" data-corner="fig">Fig 1</span>
  <span class="iso-plate-corner" data-corner="title">Steam Locomotive · 4-6-2 Pacific &amp; Cutaway</span>
  <span class="iso-plate-corner" data-corner="readout" data-readout>225 PSI · 365 °C Superheat · 65.4 MPH · 24,500 lbf</span>
</div>`;

// Interactive Control Panel
const controls = `<div class="loco-controls">
  <div class="loco-btn-row">
    <button type="button" class="loco-btn" data-run><span class="loco-lamp" aria-hidden="true"></span><span data-run-label>Running Gear</span></button>
    <button type="button" class="loco-btn" data-apart><span class="loco-lamp" aria-hidden="true"></span><span data-apart-label>Explode View</span></button>
    <button type="button" class="loco-btn" data-cutaway><span class="loco-lamp" aria-hidden="true"></span><span data-cutaway-label>Boiler Cutaway</span></button>
    <button type="button" class="loco-btn" data-fire><span class="loco-lamp" aria-hidden="true"></span><span data-fire-label>Fire Coal</span></button>
  </div>

  <div class="loco-sliders-wrap">
    <div class="loco-slider-group">
      <span class="loco-slider-label">Regulator:</span>
      <input type="range" min="0" max="100" value="75" class="loco-slider" data-regulator-slider aria-label="Steam regulator throttle">
      <span class="loco-slider-val" data-regulator-val>75%</span>
    </div>
    <div class="loco-slider-group">
      <span class="loco-slider-label">Reverser:</span>
      <input type="range" min="-75" max="75" value="25" class="loco-slider" data-reverser-slider aria-label="Walschaerts gear cutoff reverser">
      <span class="loco-slider-val" data-reverser-val>+25% Fwd</span>
    </div>
  </div>

  <div class="loco-preset-strip">
    <button type="button" class="loco-preset-btn" data-preset="idle">Station Idle</button>
    <button type="button" class="loco-preset-btn" data-preset="start">Heavy Start</button>
    <button type="button" class="loco-preset-btn" data-preset="accel">Accelerating</button>
    <button type="button" class="loco-preset-btn" data-preset="cruise" data-active="true">Express Cruise</button>
    <button type="button" class="loco-preset-btn" data-preset="drift">Drifting / Coast</button>
  </div>

  <span class="loco-hint">[Space] Run · [E] Explode · [C] Cutaway · [F] Fire Coal · [R] Reverse · [1-5] Presets</span>
  <span class="loco-live" aria-live="polite" data-live></span>
</div>`;

// Live Telemetry Dashboard
const telemetry = `<div class="loco-telemetry">
  <div class="loco-tele-item"><span class="loco-tele-label">Boiler Pressure</span><span class="loco-tele-val" data-hot data-tele-boiler>225 PSI (15.5 bar)</span></div>
  <div class="loco-tele-item"><span class="loco-tele-label">Steam Chest</span><span class="loco-tele-val" data-tele-chest>170 PSI</span></div>
  <div class="loco-tele-item"><span class="loco-tele-label">Superheat Temp</span><span class="loco-tele-val" data-hot data-tele-temp>365 °C (689 °F)</span></div>
  <div class="loco-tele-item"><span class="loco-tele-label">Ground Speed</span><span class="loco-tele-val" data-cold data-tele-speed>65.4 MPH (278 RPM)</span></div>
  <div class="loco-tele-item"><span class="loco-tele-label">Tractive Force</span><span class="loco-tele-val" data-tele-force>24,500 lbf (109 kN)</span></div>
  <div class="loco-tele-item"><span class="loco-tele-label">Exhaust Blast</span><span class="loco-tele-val" data-tele-draft>18.5 chuffs/s · 4.8 in H₂O</span></div>
</div>`;

const partsBtns = ORDER_DISPLAY.map(
  (id, index) =>
    `<button type="button" class="loco-part-btn" data-part="${id}"><span class="loco-part-num">${String(index + 1).padStart(2, "0")}</span>${PIECES[id].name}</button>`
).join("");

const stage = `<div class="loco-stage" data-cutaway="true" tabindex="0" role="slider" aria-label="Interactive Steam Locomotive Exploded View & Kinematic Cutaway: drag throttle and reverser sliders, space toggles running gear, e toggles explode, c toggles boiler cutaway" aria-valuemin="0" aria-valuemax="100" aria-valuenow="75" aria-valuetext="Cruising at 65.4 MPH, 225 PSI Boiler Pressure">
  ${backSvg}
  <canvas class="loco-canvas-layer loco-firebox-gl loco-gl-screen" aria-hidden="true"></canvas>
  <canvas class="loco-canvas-layer loco-plume-gl loco-gl-screen" aria-hidden="true"></canvas>
  ${frontSvg}
  <canvas class="loco-canvas-layer loco-veil-gl loco-gl-screen" aria-hidden="true"></canvas>
</div>`;

const caption =
  "A steam locomotive operates on an open Rankine thermodynamic cycle transformed into reciprocating mechanical traction. Bituminous coal combusts at up to 1,400°C across the shaking grate, with a refractory brick arch deflecting incandescent gases through 28 firetubes and 6 superheater flues within the water-jacketed boiler barrel. Saturated steam collects in the elevated steam dome, passes through the regulator throttle valve and internal dry pipe into the superheater header, where U-tube elements heat steam to 365°C to eliminate condensation. The double-acting pistons and Walschaerts valve gear regulate steam admission cutoff (15% to 75%), transmitting piston force via alligator crossheads and main connecting rods to 79-inch coupled driving wheels. Spent exhaust steam jets through the smokebox blast pipe directly beneath the chimney, creating a powerful venturi induced draft (2–6 inches water gauge) that self-regulates combustion airflow in exact proportion to engine workload.";

const body = `<figure class="iso-figure loco-figure">
  <div class="iso-plate">${corners}${stage}${controls}${telemetry}</div>
  <figcaption class="iso-legend">
    <div class="loco-parts">${partsBtns}</div>
    <span class="iso-caption">${caption}</span>
  </figcaption>
</figure>`;

const CSS = readFileSync(join(HERE, "locomotive.css"), "utf8");
const LIVE = readFileSync(join(HERE, "locomotive-live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));

const page = k.pageHtml({
  title: "Steam Locomotive — Anatomy",
  theme: THEME,
  body: `<style>${CSS}</style>${body}`,
  script: kitScript() + glScript() + LIVE,
  width: 1040,
});

const outName = THEME === "light" ? "locomotive-light.html" : "locomotive.html";
writeFileSync(join(HERE, outName), page);
console.log("wrote", outName, `${(page.length / 1024).toFixed(0)} KB`, `${items.length} items`);
