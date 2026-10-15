#!/usr/bin/env node
/**
 * AFK/BOT — one-command launcher.
 *
 * Reached by double-clicking start.bat (Windows) or running ./start.sh
 * (Linux/macOS/Raspberry Pi). It does everything that used to be several
 * terminal commands: check Node.js, install the dependencies on the first run,
 * start the dashboard, open the browser on it, and start the bot.
 *
 * The plain `npm start` route still works and does none of the above — this
 * file only adds convenience on top of it.
 *
 * Environment variables:
 *   PORT                 override the dashboard port
 *   AFK_NO_AUTOSTART=1   boot the dashboard but do not connect the bot
 */

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const net = require("net");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const MIN_NODE_MAJOR = 18;
const NO_AUTOSTART = /^(1|true|yes)$/i.test(String(process.env.AFK_NO_AUTOSTART || ""));
const PORT_WAIT_MS = 15000;
const CONFIG_PATH = path.join(ROOT, "config.json");

// index.js and keep_alive.js resolve their own files from __dirname, but npm and
// a double-clicked start.bat need the working directory to be the project root.
process.chdir(ROOT);

function out(text) {
  console.log(text === undefined ? "" : text);
}

function banner() {
  out("");
  out("  ==========================================");
  out("       Aternos AFK bot — one-click start");
  out("  ==========================================");
  out("");
}

function fail(title, hints) {
  out("");
  out("  [!] " + title);
  out("");
  (hints || []).forEach((hint) => out("      " + hint));
  out("");
  process.exit(1);
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch (err) {
    return {};
  }
}

function dashboardPort() {
  if (process.env.PORT) return Number(process.env.PORT);
  const config = readConfig();
  if (config.webServer && config.webServer.port) return Number(config.webServer.port);
  return 3000;
}

function dashboardEnabled() {
  const config = readConfig();
  return !config.webServer || config.webServer.enabled !== false;
}

/* ------------------------------------------------------- dependencies (npm) */

function dependenciesInstalled() {
  try {
    require.resolve("mineflayer", { paths: [ROOT] });
    require.resolve("express", { paths: [ROOT] });
    return true;
  } catch (err) {
    return false;
  }
}

function runNpm(command) {
  // npm is a shell script on Linux/macOS and npm.cmd on Windows, so it has to
  // go through a shell. Passing one fixed command string instead of an
  // argument array keeps Node from warning (DEP0190) that array arguments are
  // concatenated rather than escaped. Nothing here comes from user input.
  const result = spawnSync("npm " + command, {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
    windowsHide: true,
  });
  return result.status === 0;
}

function installDependencies() {
  out("  First run: downloading the bot's parts. This takes about a minute,");
  out("  and there needs to be an internet connection. A lot of text will");
  out("  scroll past — that is normal.");
  out("");

  if (runNpm("ci")) return true;

  out("");
  out("  'npm ci' did not work, trying the slower 'npm install' instead...");
  out("");
  if (runNpm("install")) return true;

  fail("Could not download the bot's parts.", [
    "Check that this PC is online, then run start again.",
    "Still stuck? Open a terminal in this folder and run:  npm ci",
  ]);
  return false;
}

/* ----------------------------------------------------------- web dashboard */

function waitForPort(port, timeoutMs) {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;

    const attempt = () => {
      const socket = net.connect({ port, host: "127.0.0.1" });

      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });

      socket.once("error", () => {
        socket.destroy();
        if (Date.now() > deadline) resolve(false);
        else setTimeout(attempt, 250);
      });
    };

    attempt();
  });
}

function openBrowser(url) {
  // Best effort only: a missing opener (xdg-open on a bare server) must never
  // stop the bot, so the child is detached and its errors are swallowed.
  try {
    let child;
    if (process.platform === "win32") {
      // `start` is a cmd builtin; the empty "" is the window-title argument.
      child = spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true });
    } else if (process.platform === "darwin") {
      child = spawn("open", [url], { detached: true, stdio: "ignore" });
    } else {
      child = spawn("xdg-open", [url], { detached: true, stdio: "ignore" });
    }
    child.on("error", () => {});
    child.unref();
    return true;
  } catch (err) {
    return false;
  }
}

/* -------------------------------------------------------------------- main */

async function main() {
  banner();
  out("  Node.js " + process.versions.node + " found.");

  const major = Number(String(process.versions.node).split(".")[0]);
  if (major < MIN_NODE_MAJOR) {
    fail("This bot needs Node.js " + MIN_NODE_MAJOR + " or newer, but this PC has " + process.versions.node + ".", [
      "Download the LTS version from https://nodejs.org, install it, then run start again.",
    ]);
  }

  if (!dependenciesInstalled()) installDependencies();

  // Requiring the engine is what `npm start` does: it starts the bot logic and
  // the dashboard web server.
  const bot = require(path.join(ROOT, "index.js"));

  const port = dashboardPort();
  if (dashboardEnabled()) {
    const url = "http://localhost:" + port;
    if (await waitForPort(port, PORT_WAIT_MS)) {
      out("");
      out("  Dashboard:  " + url);
      if (!openBrowser(url)) out("  Open that address in your browser to see it.");
    } else {
      out("");
      out("  The dashboard did not answer on port " + port + ".");
      out("  Another copy of the bot may already be running — read the messages above.");
    }
  } else {
    out("  Dashboard disabled in config.json (webServer.enabled = false).");
  }

  if (NO_AUTOSTART) {
    out("");
    out("  Not connecting yet (AFK_NO_AUTOSTART is set) — press Start bot in the dashboard.");
  } else {
    const result = bot.startBotProcess();
    out("");
    out("  Bot: " + ((result && result.message) || "starting"));
    if (result && result.ok === false) {
      out("  Open the dashboard, fill in your server address and press Save config.");
    }
  }

  out("");
  out("  Leave this window open for as long as you want the bot online.");
  out("  Press Ctrl+C (or just close the window) to stop it.");
  out("");
}

main().catch((err) => {
  fail("Something went wrong while starting the bot.", [err && err.message ? err.message : String(err)]);
});
