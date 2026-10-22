import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import fs from "node:fs";

const chromeBin = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const port = 9335;
const url = pathToFileURL(resolve("v8.html")).href;

const proc = spawn(chromeBin, [`--remote-debugging-port=${port}`, "--headless=new", "--disable-gpu", url]);
await new Promise(r => setTimeout(r, 1200));
const targetsRes = await fetch(`http://127.0.0.1:${port}/json/list`);
const targets = await targetsRes.json();
const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
await new Promise(res => { ws.onopen = res; });
let id = 1;
const send = (method, params = {}) => new Promise(res => {
  const msgId = id++;
  const handler = evt => {
    const msg = JSON.parse(evt.data);
    if (msg.id === msgId) { ws.removeEventListener("message", handler); res(msg.result); }
  };
  ws.addEventListener("message", handler);
  ws.send(JSON.stringify({ id: msgId, method, params }));
});
await send("Runtime.enable");
await send("Runtime.evaluate", { expression: "document.querySelector('[data-part=\"pistons_l\"]').click()" });
await new Promise(r => setTimeout(r, 800));
const shotRes = await send("Page.captureScreenshot", { format: "png" });
fs.writeFileSync("shots/test-pistons-focus.png", Buffer.from(shotRes.data, "base64"));
ws.close();
proc.kill();
console.log("Saved shots/test-pistons-focus.png");
