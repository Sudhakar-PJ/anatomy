import { spawn } from "node:child_process";
import { chromePort } from "../.agents/skills/anatomy/scripts/chrome-port.mjs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const binary = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profile = mkdtempSync(join(tmpdir(), "iso-test-"));
const chrome = spawn(binary, [
  "--headless=new",
  "--do-not-de-elevate",
  "--remote-debugging-port=0",
  `--user-data-dir=${profile}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--hide-scrollbars",
  "--allow-file-access-from-files",
  "--enable-unsafe-swiftshader",
  "--ignore-gpu-blocklist",
  "about:blank",
]);

const port = await chromePort(chrome, profile);

const pageUrl = pathToFileURL(resolve("falcon.html")).href;
const res = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(pageUrl)}`, { method: "PUT" });
const target = await res.json();

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });

let id = 1;
function send(method, params = {}) {
  return new Promise((done) => {
    const curId = id++;
    const handler = (evt) => {
      const data = JSON.parse(evt.data);
      if (data.id === curId) {
        ws.removeEventListener("message", handler);
        done(data.result);
      }
    };
    ws.addEventListener("message", handler);
    ws.send(JSON.stringify({ id: curId, method, params }));
  });
}

await send("Runtime.enable");
await send("Page.enable");
await send("Console.enable");

const logs = [];
ws.addEventListener("message", (evt) => {
  const d = JSON.parse(evt.data);
  if (d.method === "Console.messageAdded") {
    logs.push(d.params.message.text);
  } else if (d.method === "Runtime.consoleAPICalled") {
    logs.push("CONSOLE: " + d.params.args.map(a => a.value).join(" "));
  } else if (d.method === "Runtime.exceptionThrown") {
    logs.push("EXCEPTION: " + JSON.stringify(d.params.exceptionDetails));
  }
});

await new Promise((r) => setTimeout(r, 1000));

const evalRes = await send("Runtime.evaluate", {
  expression: `(() => {
    const c = document.querySelector(".f9-plume-canvas");
    const fallback = document.querySelector(".f9-fallback-plume");
    const burnBtn = document.querySelector("[data-burn]");
    const burnActive = burnBtn ? burnBtn.hasAttribute("data-active") : false;
    const fallbackDisplay = fallback ? fallback.style.display : "none";
    
    // Check WebGL compile by recreating shader
    const gl = c.getContext("webgl");
    return {
      canvasSize: [c.width, c.height],
      clientSize: [c.clientWidth, c.clientHeight],
      burnActive,
      burnLabel: burnBtn ? burnBtn.textContent : null,
      fallbackDisplay,
      hasGL: !!gl,
    };
  })()`,
  returnByValue: true
});

console.log("Evaluation result:", JSON.stringify(evalRes, null, 2));
console.log("Console logs:", logs);

try {
  chrome.kill("SIGKILL");
  await new Promise(r => setTimeout(r, 500));
  rmSync(profile, { recursive: true, force: true });
} catch (e) {}
process.exit(0);
