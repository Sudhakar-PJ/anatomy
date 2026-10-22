import * as k from "../.agents/skills/anatomy/kit/iso-kit.mjs";

function getWingPoints(angleDeg, length, width) {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const perpX = -sin;
  const perpY = cos;
  const halfW = width / 2;

  // Root points on either side of wing axis
  const p1 = [-perpX * halfW, -perpY * halfW];
  const p2 = [perpX * halfW, perpY * halfW];

  // Tip center
  const tipX = cos * (length - halfW);
  const tipY = sin * (length - halfW);

  // Tip points (arc around tip)
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
  // Wing 1 at -90 deg (South)
  // Wing 2 at +30 deg (Northeast)
  // Wing 3 at +150 deg (Northwest)
  const w1 = getWingPoints(-90, l1, width);
  const w2 = getWingPoints(30, l2, width);
  const w3 = getWingPoints(150, l3, width);

  // Connect in counter-clockwise order:
  // Start from w1 tipPts -> w1 rootLeft (towards w2) -> w2 rootRight -> w2 tipPts -> w2 rootLeft (towards w3) -> w3 rootRight -> w3 tipPts -> w3 rootLeft (towards w1) -> w1 rootRight
  const poly = [
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

  return poly;
}

const plan = generateTowerPlan(36, 36, 36, 9.0);
console.log("Plan polygon vertices:", plan.length);
console.log("First 3 pts:", plan.slice(0, 3));
