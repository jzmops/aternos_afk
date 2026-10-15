#!/usr/bin/env node
/**
 * AFK/BOT — build the ready-to-run Windows package.
 *
 * The result is dist/AFK-Bot-windows-x64.zip: this project, plus a copy of
 * Node.js in runtime\ and the already-installed node_modules\, so whoever
 * downloads it extracts the folder and double-clicks start.bat without
 * installing anything and without a first-run download.
 *
 * It is run two ways, and both produce the same archive:
 *   * by .github/workflows/build-portable.yml on a Windows runner, which is how
 *     the download on the Releases page is made
 *   * by hand on any machine that already has node_modules\ and runtime\ in
 *     place:   node scripts/build-portable.js
 *
 * Options:
 *   --no-zip        assemble and verify dist/AFK-Bot only, write no archive
 *   --level=N       deflate level for the archive, 0-9 (default 6)
 *
 * Anything missing, empty or unexpectedly present makes this exit non-zero with
 * an explanation, because a package that starts with a confusing error on
 * someone else's PC is worse than a failed build here.
 */

const { spawnSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const { zipDirectory, collect } = require("./lib/make-zip");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const STAGE = path.join(DIST, "AFK-Bot");
const RUNTIME = path.join(ROOT, "runtime");
const MODULES = path.join(ROOT, "node_modules");
const ZIP = path.join(DIST, "AFK-Bot-windows-x64.zip");
const INFO = path.join(DIST, "build-info.json");

const args = process.argv.slice(2);
const WANT_ZIP = !args.includes("--no-zip");
const levelArg = args.find((arg) => arg.startsWith("--level="));
const LEVEL = levelArg ? Number(levelArg.split("=")[1]) : 6;

const NODE_VERSION =
  process.env.NODE_VERSION || process.env.AFK_NODE_VERSION || "";
const COMMIT = process.env.GITHUB_SHA || "";

// Everything the bot needs at run time, named one by one. Listing the files
// instead of copying the whole folder is what keeps .git, the workflow and this
// build script itself out of the download.
const FILES = [
  "index.js",
  "keep_alive.js",
  "config.json",
  "package.json",
  "package-lock.json",
  "README.md",
  "RUN_LOCALLY.md",
  "LICENSE.txt",
  "scripts/launch.js",
  "start.bat",
  "start.sh",
  "start-no-install.bat",
  "start-no-install.sh",
  "install-autostart.bat",
  "remove-autostart.bat",
];

// Folders copied whole — the dashboard's files.
const TREES = ["public"];

// Folders that must never appear in the download.
const FORBIDDEN = [".git", ".github", ".env", "runtime-download.tmp"];

function fail(message, hints) {
  console.error("");
  console.error("  [!] " + message);
  (hints || []).forEach((hint) => console.error("      " + hint));
  console.error("");
  process.exit(1);
}

function mb(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function dirSize(dir) {
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else total += fs.statSync(full).size;
    }
  }
  return total;
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

/* -------------------------------------------------------------- preflight */

function checkSources() {
  if (!fs.existsSync(path.join(MODULES, "mineflayer", "package.json"))) {
    fail("node_modules\\mineflayer is missing, so there is nothing to package.", [
      "Run npm ci first — the package ships the dependencies already installed.",
      "Without them the download would have to fetch them on first start.",
    ]);
  }

  const node = path.join(RUNTIME, "node.exe");
  if (!fs.existsSync(node)) {
    fail("runtime\\node.exe is missing, so the package would still need Node.js installed.", [
      "Download https://nodejs.org/dist/" + (NODE_VERSION || "<version>") + "/node-" +
        (NODE_VERSION || "<version>") + "-win-x64.zip and unpack it into runtime\\",
      "The workflow .github/workflows/build-portable.yml does exactly that.",
    ]);
  }

  const head = Buffer.alloc(2);
  const fd = fs.openSync(node, "r");
  fs.readSync(fd, head, 0, 2, 0);
  fs.closeSync(fd);
  if (head.toString("latin1") !== "MZ") {
    fail("runtime\\node.exe is not a Windows program (it does not start with MZ).", [
      "The Linux or macOS Node.js build was unpacked into runtime\\ by mistake.",
      "Only the -win-x64 zip belongs there.",
    ]);
  }

  for (const file of FILES) {
    if (!fs.existsSync(path.join(ROOT, file))) fail("a file the package needs is missing: " + file);
  }
  for (const tree of TREES) {
    if (!fs.existsSync(path.join(ROOT, tree))) fail("a folder the package needs is missing: " + tree);
  }

  try {
    JSON.parse(fs.readFileSync(path.join(ROOT, "config.json"), "utf8"));
  } catch (err) {
    fail("config.json is not valid JSON, so the bot would not start.", [
      "Fix it before building: " + err.message,
    ]);
  }
}

/* --------------------------------------------------------------- assembly */

function copyInto(relativePath) {
  const from = path.join(ROOT, relativePath);
  const to = path.join(STAGE, relativePath);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function readyToRead() {
  const lines = [
    "Aternos AFK bot - ready to run",
    "==============================",
    "",
    "Nothing to install. Node.js and the bot's parts are already inside this",
    "folder, so starting it up does not download anything.",
    "",
    "  1. Extract the ZIP first. Right-click it, choose \"Extract All...\",",
    "     then open the folder that appears. Double-clicking inside the ZIP",
    "     preview window does not work for a program like this.",
    "  2. Double-click  start.bat",
    "  3. A black window appears and your browser opens the dashboard.",
    "     Leave the black window open for as long as you want the bot online.",
    "     Closing it stops the bot.",
    "",
    "Starting by itself every time you log in",
    "----------------------------------------",
    "Double-click install-autostart.bat once. To undo that, double-click",
    "remove-autostart.bat. No PM2 and no Administrator rights are involved.",
    "",
    "Which server does it join?",
    "--------------------------",
    "config.json - or the settings panel in the dashboard.",
    "",
    "If something goes wrong",
    "-----------------------",
    "RUN_LOCALLY.md in this folder explains the common problems, and the black",
    "window's text names the exact one. Keep these files together: the bot needs",
    "them next to each other.",
    "",
  ];

  if (NODE_VERSION) lines.push("Bundled Node.js: " + NODE_VERSION);
  if (COMMIT) lines.push("Built from commit: " + COMMIT.slice(0, 12));
  if (NODE_VERSION || COMMIT) lines.push("");

  // Notepad on Windows wants CRLF, and this file is meant to be read there.
  return lines.join("\r\n");
}

function assemble() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(STAGE, { recursive: true });

  for (const file of FILES) copyInto(file);
  for (const tree of TREES) {
    fs.cpSync(path.join(ROOT, tree), path.join(STAGE, tree), { recursive: true });
  }

  fs.writeFileSync(path.join(STAGE, "READ-ME-FIRST.txt"), readyToRead(), "utf8");

  console.log("  copying the bot's parts (node_modules)...");
  fs.cpSync(MODULES, path.join(STAGE, "node_modules"), { recursive: true, dereference: true });

  console.log("  copying the bundled Node.js (runtime)...");
  fs.cpSync(RUNTIME, path.join(STAGE, "runtime"), { recursive: true, dereference: true });
}

/* ------------------------------------------------------------ verification */

function verifyStage() {
  const missing = FILES.concat(["READ-ME-FIRST.txt", "node_modules/mineflayer/package.json", "runtime/node.exe"])
    .filter((file) => !fs.existsSync(path.join(STAGE, file)));

  if (missing.length) fail("the package is incomplete: " + missing.join(", "));

  for (const name of FORBIDDEN) {
    if (fs.existsSync(path.join(STAGE, name))) {
      fail("something that must not ship is in the package: " + name, [
        "It would leak repository history or local settings into a public download.",
      ]);
    }
  }

  const launcher = fs.readFileSync(path.join(STAGE, "scripts", "launch.js"), "utf8");
  if (!launcher.includes("startBotProcess")) {
    fail("scripts/launch.js in the package does not look like the launcher.", [
      "The build copied the wrong file.",
    ]);
  }
}

/**
 * Read the archive back and check its own table of contents against the folder
 * that was packed. A ZIP is only as good as the reader it lands in, and this is
 * the last chance to notice a wrong folder name, a missing file or a truncated
 * write before someone downloads it.
 */
function verifyArchive(expectedEntries) {
  const stat = fs.statSync(ZIP);
  const fd = fs.openSync(ZIP, "r");
  const tail = Buffer.alloc(22);
  fs.readSync(fd, tail, 0, 22, stat.size - 22);

  if (tail.readUInt32LE(0) !== 0x06054b50) {
    fs.closeSync(fd);
    fail("the archive that was just written has no end-of-directory record.", [
      "It is truncated; do not publish it.",
    ]);
  }

  const entries = tail.readUInt16LE(10);
  const centralSize = tail.readUInt32LE(12);
  const centralOffset = tail.readUInt32LE(16);

  if (entries !== expectedEntries) {
    fs.closeSync(fd);
    fail("the archive lists " + entries + " entries but " + expectedEntries + " were written.");
  }
  if (centralOffset + centralSize + 22 !== stat.size) {
    fs.closeSync(fd);
    fail("the archive's directory does not line up with its size - it is damaged.");
  }

  const central = Buffer.alloc(centralSize);
  fs.readSync(fd, central, 0, centralSize, centralOffset);
  fs.closeSync(fd);

  const names = [];
  let at = 0;
  while (at < centralSize) {
    if (central.readUInt32LE(at) !== 0x02014b50) {
      fail("the archive's table of contents is damaged at entry " + names.length + ".");
    }
    const nameLength = central.readUInt16LE(at + 28);
    const extraLength = central.readUInt16LE(at + 30);
    const commentLength = central.readUInt16LE(at + 32);
    names.push(central.toString("utf8", at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extraLength + commentLength;
  }

  const packed = collect(STAGE, path.basename(STAGE), []).map((entry) => entry.name).sort();
  const written = names.slice().sort();

  if (packed.length !== written.length) {
    fail("the archive holds " + written.length + " paths but the folder holds " + packed.length + ".");
  }

  const missing = packed.filter((name, index) => name !== written[index]);
  if (missing.length) {
    fail("the archive's contents do not match the folder, starting at: " + missing[0], [
      "Everything inside the archive must sit under " + path.basename(STAGE) + "\\ — nothing loose.",
    ]);
  }

  return entries;
}

/* --------------------------------------------------------------------- main */

function main() {
  console.log("");
  console.log("  Building the ready-to-run Windows package");
  console.log("  =========================================");
  console.log("");

  checkSources();

  const modulesSize = dirSize(MODULES);
  const runtimeSize = dirSize(RUNTIME);
  console.log("  node_modules: " + mb(modulesSize) + "   runtime: " + mb(runtimeSize));
  console.log("");

  assemble();

  console.log("  checking the assembled folder...");
  verifyStage();

  const stageSize = dirSize(STAGE);
  const result = { stage: STAGE, stageBytes: stageSize, zip: null, sha256: null, entries: null };


  if (WANT_ZIP) {
    console.log("  compressing into " + path.relative(ROOT, ZIP) + " (this takes a minute)...");
    const started = Date.now();
    const zipped = zipDirectory(STAGE, ZIP, { level: LEVEL });
    const entries = verifyArchive(zipped.entries);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);

    result.zip = ZIP;
    result.sha256 = sha256(ZIP);
    result.entries = entries;

    console.log("");
    console.log("  " + path.relative(ROOT, ZIP));
    console.log("    entries:  " + entries + " files and folders");
    console.log("    size:     " + mb(fs.statSync(ZIP).size) + " (from " + mb(stageSize) + ", " + seconds + "s)");
    console.log("    sha256:   " + result.sha256);
  }

  fs.writeFileSync(
    INFO,
    JSON.stringify(
      {
        package: path.basename(ZIP),
        name: "AFK-Bot",
        bundleNode: NODE_VERSION || null,
        commit: COMMIT || null,
        builtAt: new Date().toISOString(),
        stageBytes: stageSize,
        archiveBytes: result.zip ? fs.statSync(ZIP).size : null,
        entries: result.entries,
        sha256: result.sha256,
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  console.log("");
  console.log("  Done. " + path.relative(ROOT, STAGE) + " is ready" + (WANT_ZIP ? ", and so is the archive." : "."));
  console.log("");
}

main();
