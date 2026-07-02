import { spawn } from "node:child_process";
import process from "node:process";

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

function npmArgs(args) {
  if (process.platform !== "win32") {
    return { command: npmCmd, args };
  }

  return {
    command: process.env.ComSpec || "cmd.exe",
    args: ["/d", "/s", "/c", [npmCmd, ...args].join(" ")]
  };
}

function runNpm(args, name) {
  const invocation = npmArgs(args);
  const child = spawn(invocation.command, invocation.args, {
    stdio: "inherit",
    shell: false,
    env: process.env
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      console.log(`[${name}] exited with signal ${signal}`);
      return;
    }
    if (code && code !== 0) {
      console.log(`[${name}] exited with code ${code}`);
      process.exitCode = code;
    }
  });

  return child;
}

console.log("Building shared core once before dev servers...");
const buildInvocation = npmArgs(["--workspace", "@poker-tournament-lab/core", "run", "build"]);
const build = spawn(buildInvocation.command, buildInvocation.args, {
  stdio: "inherit",
  shell: false,
  env: process.env
});

build.on("exit", (code) => {
  if (code !== 0) {
    process.exit(code ?? 1);
  }

  const children = [
    runNpm(["--workspace", "@poker-tournament-lab/server", "run", "dev"], "server"),
    runNpm(["--workspace", "@poker-tournament-lab/web", "run", "dev"], "web")
  ];

  const stop = () => {
    for (const child of children) {
      child.kill();
    }
    process.exit();
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
});
