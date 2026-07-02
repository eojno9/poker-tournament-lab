import { spawn } from "node:child_process";
import process from "node:process";

const PREVIEW_URL = "http://127.0.0.1:5173";
const READY_TIMEOUT_MS = 60_000;
const READY_POLL_MS = 400;

function npmInvocation(args) {
  if (process.platform === "win32") {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", ["npm.cmd", ...args].join(" ")]
    };
  }
  return {
    command: "npm",
    args
  };
}

function npxInvocation(args) {
  if (process.platform === "win32") {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", ["npx.cmd", ...args].join(" ")]
    };
  }
  return {
    command: "npx",
    args
  };
}

function run(command, args, options = {}) {
  return spawn(command, args, {
    stdio: "inherit",
    shell: false,
    env: process.env,
    ...options
  });
}

function waitForExit(child) {
  return new Promise((resolve) => {
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

async function waitForHttpReady(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status >= 200 && response.status < 500) {
        return;
      }
    } catch {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function killProcessTree(child) {
  if (!child.pid) {
    return;
  }
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        stdio: "ignore",
        shell: false
      });
      killer.once("exit", () => resolve(undefined));
      killer.once("error", () => resolve(undefined));
    });
    return;
  }
  child.kill("SIGTERM");
}

async function main() {
  const preview = (() => {
    const invocation = npmInvocation(["--workspace", "@poker-tournament-lab/web", "run", "preview"]);
    return run(invocation.command, invocation.args, { cwd: process.cwd() });
  })();

  try {
    await waitForHttpReady(PREVIEW_URL, READY_TIMEOUT_MS);
  } catch (error) {
    await killProcessTree(preview);
    throw error;
  }

  const playwrightInvocation = npxInvocation(["playwright", "test"]);
  const playwright = run(playwrightInvocation.command, playwrightInvocation.args, { cwd: process.cwd() });
  const result = await waitForExit(playwright);

  await killProcessTree(preview);

  if (typeof result.code === "number") {
    process.exit(result.code);
  }
  process.exit(1);
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
