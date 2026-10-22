import fs from "node:fs";

const h = fs.readFileSync("v8.html", "utf8");
const start = h.indexOf("const D = ") + 10;
const end = h.indexOf(";const root");
const json = h.slice(start, end);
const D = JSON.parse(json);
console.log("Keys in D:", Object.keys(D));
console.log("boreL:", D.boreL);
console.log("boreR:", D.boreR);
