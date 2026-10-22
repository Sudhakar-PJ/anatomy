import * as k from "../.agents/skills/anatomy/kit/iso-kit.mjs";

const W = 960;
const H = 1040;
const AZIMUTH = 40;
const ELEVATION = 25;

const BOUNDS = [
  [-48, -48, -28],
  [+48, +48, -28],
  [-48, -48, 0],
  [+48, +48, 0],
  [-12, -12, 460],
  [+12, +12, 460],
  [-36, -36, 0],
  [+36, +36, 0],
];

const P = k.fitProjection(BOUNDS, W, H, {
  pad: 40,
  azimuth: AZIMUTH,
  elevation: ELEVATION,
});

console.log("Projection P:", {
  k: P.k,
  cx: P.cx,
  cy: P.cy,
  azimuth: P.azimuth,
  elevation: P.elevation,
});

const groundCenter = k.iso([0, 0, 0], P);
const topSpire = k.iso([0, 0, 460], P);
const pileBottom = k.iso([0, 0, -28], P);

console.log("groundCenter:", groundCenter);
console.log("topSpire:", topSpire);
console.log("pileBottom:", pileBottom);
console.log("Total projected height span:", pileBottom[1] - topSpire[1]);
