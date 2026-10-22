import fs from "node:fs";
import path from "node:path";

const projects = [
  "arc-reactor/arc-build.mjs",
  "camera/camera-build.mjs",
  "falcon-9/falcon-build.mjs",
  "manual-gearbox/gearbox-build.mjs",
  "milling-machine/build.mjs",
  "pulley/pulley-build.mjs",
  "supercharger/supercharger-build.mjs",
  "turbocharger/turbo-build.mjs",
  "v12-engine/v12-build.mjs",
  "v8-engine/v8-build.mjs"
];

for (const rel of projects) {
  const p = path.resolve(rel);
  if (fs.existsSync(p)) {
    let content = fs.readFileSync(p, "utf8");
    const updated = content.replaceAll('"./.agents/', '"../.agents/');
    if (updated !== content) {
      fs.writeFileSync(p, updated, "utf8");
      console.log(`Updated imports in ${rel}`);
    } else {
      console.log(`No change needed in ${rel}`);
    }
  } else {
    console.warn(`File not found: ${rel}`);
  }
}
