import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

// Let's launch Chrome and inspect the SVG piston transforms over 2 seconds!
const chromeBin = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const port = 9333;
const url = pathToFileURL(resolve("v8.html")).href;

const proc = spawn(chromeBin, [
  `--remote-debugging-port=${port}`,
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  url,
]);

await new Promise(r => setTimeout(r, 1200));

try {
  const targetsRes = await fetch(`http://127.0.0.1:${port}/json/list`);
  const targets = await targetsRes.json();
  const pageTarget = targets.find(t => t.type === "page") || targets[0];
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });

  let id = 1;
  const send = (method, params = {}) => new Promise((res) => {
    const msgId = id++;
    const handler = (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.id === msgId) {
        ws.removeEventListener("message", handler);
        res(msg.result);
      }
    };
    ws.addEventListener("message", handler);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });

  await send("Runtime.enable");

  // Sample piston transforms at t=0, t=100ms, t=200ms, t=300ms
  for (let step = 0; step < 5; step++) {
    const res = await send("Runtime.evaluate", {
      expression: `(() => {
        const p1 = document.querySelector('.it[data-piece="pistons_l"][data-cyl="1"]');
        const p2 = document.querySelector('.it[data-piece="pistons_r"][data-cyl="2"]');
        return {
          crank: typeof crank !== 'undefined' ? crank : null,
          running: typeof running !== 'undefined' ? running : null,
          p1Transform: p1 ? p1.getAttribute('transform') : 'null',
          p2Transform: p2 ? p2.getAttribute('transform') : 'null',
          readout: document.querySelector('[data-readout]')?.textContent
        };
      })()`,
      returnByValue: true
    });
    console.log(`Step ${step}:`, res.result.value);
    await new Promise(r => setTimeout(r, 100));
  }

  ws.close();
} catch (e) {
  console.error("Test error:", e);
} finally {
  proc.kill();
}
