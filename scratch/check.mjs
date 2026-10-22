import fs from "node:fs";

const html = fs.readFileSync("v8.html", "utf8");
const cylMatches = [...html.matchAll(/data-piece="([^"]+)"[^>]*data-cyl="([^"]+)"/g)];
console.log("Total data-cyl items:", cylMatches.length);
const byPiece = {};
for (const m of cylMatches) {
  byPiece[m[1]] = (byPiece[m[1]] || 0) + 1;
}
console.log("By piece:", byPiece);

const allPieces = [...html.matchAll(/class="it"\s+data-piece="([^"]+)"/g)].map(m => m[1]);
const counts = {};
for (const p of allPieces) counts[p] = (counts[p] || 0) + 1;
console.log("All pieces in engine:", counts);
