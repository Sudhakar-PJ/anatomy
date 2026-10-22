import fs from "node:fs";

const html = fs.readFileSync("v8.html", "utf8");
const pieces = [...html.matchAll(/class="it"\s+data-piece="([^"]+)"/g)].map(m => m[1]);

// Let's print the sequence of pieces in DOM order:
console.log("Order of pieces in DOM (bottom to top):");
let last = "";
let count = 0;
for (const p of pieces) {
  if (p !== last) {
    if (last) console.log(`  ${last}: ${count}`);
    last = p;
    count = 1;
  } else {
    count++;
  }
}
if (last) console.log(`  ${last}: ${count}`);
