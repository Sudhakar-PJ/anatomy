import * as k from "../.agents/skills/anatomy/kit/iso-kit.mjs";

const W = 960;
const H = 1040;
const P = k.fitProjection([
  [-50, -50, -30],
  [+50, +50, 460],
], W, H, { pad: 40, azimuth: 40, elevation: 25 });

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

const ring = generateTowerPlan(36, 36, 36, 9.0);
const s = k.extrude(ring, 0, 15, P, { convex: false, bevel: 0.5 });
console.log("Extrude success! Top path length:", s.top.length);
console.log("Shades counts:", s.shades.map(x => x.length));
console.log("Outline length:", s.outline.length);
