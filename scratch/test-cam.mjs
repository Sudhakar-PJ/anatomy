import * as k from "../.agents/skills/anatomy/kit/iso-kit.mjs";

const W = 960;
const H = 1040;
const P = k.fitProjection([
  [-50, -50, -30],
  [+50, +50, 460],
], W, H, { pad: 32, azimuth: 40, elevation: 25 });

const cam = k.cameraOf(P);
console.log("cam:", cam);

const o = k.iso([0, 0, 0], P);
const p = k.iso([0, 0, 100], P);
console.log("o:", o);
console.log("p:", p);
console.log("actual delta:", [p[0] - o[0], p[1] - o[1]]);
console.log("formula delta:", [0, -100 * cam.cosE * cam.k]);
