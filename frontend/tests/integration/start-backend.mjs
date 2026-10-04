import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import http from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The supervisor exists only for tests: restart the actual Python process while
// retaining its SQLite file, rather than replacing API calls with route mocks.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const backend = resolve(repo, "backend");
const localPython = resolve(backend, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
const python = process.env.PYTHON_BIN || (existsSync(localPython) ? localPython : "python");
if (!process.env.CAREEROS_DB_PATH) throw new Error("The integration database path must be set explicitly.");
mkdirSync(dirname(process.env.CAREEROS_DB_PATH), { recursive: true });
let child;
let stopping = false;

const pause = (milliseconds) => new Promise((resolvePause) => setTimeout(resolvePause, milliseconds));

async function start() {
  child = spawn(python, ["-m", "uvicorn", "fake_server:app", "--app-dir", "tests", "--host", "127.0.0.1", "--port", "8124", "--log-level", "warning"], {
    cwd: backend, stdio: "inherit", windowsHide: true,
    env: { ...process.env, GEMINI_API_KEY: "", PYTHONUNBUFFERED: "1" },
  });
  child.on("error", (error) => { console.error(error); process.exitCode = 1; });
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Synthetic backend exited with ${child.exitCode}`);
    try {
      const response = await fetch("http://127.0.0.1:8124/", { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch { /* Wait for uvicorn startup. */ }
    await pause(100);
  }
  throw new Error("Synthetic backend did not become ready.");
}

async function stopChild() {
  if (!child || child.exitCode !== null) return;
  const processToStop = child;
  const exited = new Promise((resolveExit) => processToStop.once("exit", resolveExit));
  processToStop.kill("SIGTERM");
  await Promise.race([exited, pause(5000)]);
  if (processToStop.exitCode === null) {
    processToStop.kill("SIGKILL");
    await exited;
  }
}

await start();
const control = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ pid: child.pid }));
    return;
  }
  if (request.method !== "POST" || request.url !== "/restart") {
    response.writeHead(404).end();
    return;
  }
  try {
    const previousPid = child.pid;
    await stopChild();
    await start();
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ previousPid, pid: child.pid }));
  } catch (error) {
    response.writeHead(500, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ detail: error.message }));
  }
});
control.listen(8125, "127.0.0.1");

async function shutdown() {
  if (stopping) return;
  stopping = true;
  control.close();
  await stopChild();
  process.exit();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
