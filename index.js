/**
 * AFK/BOT — Minecraft AFK bot engine (Aternos friendly).
 *
 * The bot wanders around (walking / sprinting / jumping / sneaking / looking
 * around), fights nearby mobs and reconnects on its own. Everything is driven
 * by config.json, which the web dashboard can read and update live.
 */

const fs = require("fs");
const path = require("path");
const mineflayer = require("mineflayer");

const CONFIG_PATH = path.join(__dirname, "config.json");

const DEFAULT_CONFIG = {
  ip: "",
  port: 25565,
  name: "afk_bot",
  version: "auto",
  auth: "offline",
  authmePassword: "",

  movement: {
    enabled: true,
    walkTime: 4, // seconds spent walking per burst
    runTime: 6, // seconds spent sprinting per burst
    runShare: 60, // % chance a burst is a run instead of a walk
    pause: 6, // seconds of standing around between bursts
    wanderRadius: 24, // blocks the bot may drift from where it spawned
    avoidWalls: true,
    jumpOverObstacles: true,
    avoidWater: true, // turn away from oceans, lakes and rivers
  },

  combat: {
    enabled: true,
    hostileOnly: true,
    range: 16, // how far away a mob is noticed (blocks)
    crits: true, // jump before hitting for critical hits
    autoEquip: true, // equip the best weapon in the inventory
  },

  reconnect: {
    enabled: true,
    delay: 5,
    maxAttempts: 0, // 0 = keep trying forever
  },

  webServer: {
    enabled: true,
    port: 3000,
  },
};

const HOSTILE_MOBS = new Set([
  "zombie", "husk", "drowned", "zombie_villager", "skeleton", "stray",
  "wither_skeleton", "bogged", "creeper", "spider", "cave_spider",
  "enderman", "endermite", "witch", "blaze", "ghast", "slime", "magma_cube",
  "silverfish", "phantom", "pillager", "vindicator", "evoker", "ravager",
  "vex", "hoglin", "zoglin", "piglin", "piglin_brute", "warden", "shulker",
  "guardian", "elder_guardian", "breeze", "creaking",
]);

// Rough 1.21 damage values, used to pick the best weapon in the inventory.
const WEAPON_DAMAGE = {
  netherite_axe: 10, diamond_axe: 9, iron_axe: 9, stone_axe: 7,
  golden_axe: 7, wooden_axe: 7,
  netherite_sword: 8, diamond_sword: 7, iron_sword: 6, stone_sword: 5,
  golden_sword: 4, wooden_sword: 4,
  trident: 9, mace: 6,
};

const ATTACK_REACH = 3.2; // blocks — vanilla survival reach
const TICK_MS = 100;
const WALL_SCAN_MAX = 3; // how far ahead the wall scanner looks
const WATER_SCAN_MAX = 4; // how far ahead the bot looks for deep water
// Blocks that count as "swimmable water" (plants/life in water included).
const WATER_BLOCKS = new Set([
  "water", "flowing_water", "bubble_column",
  "seagrass", "tall_seagrass", "kelp", "kelp_plant",
]);

/* ------------------------------------------------------------------ config */

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function merge(base, patch) {
  const out = clone(base);
  if (!patch || typeof patch !== "object") return out;
  for (const key of Object.keys(base)) {
    if (!(key in patch)) continue;
    if (base[key] && typeof base[key] === "object" && !Array.isArray(base[key])) {
      out[key] = merge(base[key], patch[key]);
    } else if (typeof base[key] === "number" && typeof patch[key] === "string" && patch[key].trim() !== "" && Number.isFinite(Number(patch[key]))) {
      out[key] = Number(patch[key]); // "3000" -> 3000
    } else if (typeof base[key] === "boolean" && typeof patch[key] === "string") {
      out[key] = patch[key] === "true"; // form checkboxes
    } else if (patch[key] !== null && typeof patch[key] !== typeof base[key]) {
      out[key] = base[key]; // ignore values of the wrong type
    } else {
      out[key] = patch[key];
    }
  }
  return out;
}

function readConfigFile() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch (err) {
    return {};
  }
}

let config = merge(DEFAULT_CONFIG, readConfigFile());

function saveConfigFile() {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
    return true;
  } catch (err) {
    log("ERROR", "Could not write config.json: " + err.message);
    return false;
  }
}

function sanitiseNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

/* ------------------------------------------------------------------- state */

let bot = null;
let running = false;
let reconnectAttempts = 0;
let reconnectTimer = null;
let spawnAt = 0;
let homePos = null;
let dead = false;
let stoppedByUser = false;

const stats = { kills: 0, crits: 0, reconnects: 0, deaths: 0 };

const brain = {
  mode: "idle", // idle | walk | run | sneak | combat
  modeUntil: 0,
  nextMoveAt: 0,
  nextLookAt: 0,
  yaw: 0,
  lastWallScanAt: 0,
  lastStuckCheckAt: 0,
  lastStuckPos: null,
  lastAttackAt: 0,
  jumpUntil: 0,
  chaseId: null,
  targetLabel: "none",
  weapon: null,
  lastWaterTurnAt: 0,
  waterWalkUntil: 0,
  lastWaterLogAt: 0,
  nextStrokeAt: 0,
};

const pendingKills = new Map();
const logs = [];
const LOG_LIMIT = 400;
const logListeners = new Set();

/* --------------------------------------------------------------- utilities */

function now() {
  return Date.now();
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function log(category, message) {
  const entry = { t: now(), cat: category, msg: message };
  logs.push(entry);
  if (logs.length > LOG_LIMIT) logs.shift();
  const stamp = new Date(entry.t).toLocaleTimeString("en-GB", { hour12: false });
  console.log("[" + stamp + "] " + category.padEnd(7) + " " + message);
  for (const listener of logListeners) {
    try {
      listener(entry);
    } catch (err) {
      /* a broken listener must never take the bot down */
    }
  }
}

function onLog(listener) {
  logListeners.add(listener);
  return () => logListeners.delete(listener);
}

function getLogs() {
  return logs.slice();
}

function isSolid(block) {
  return !!block && Array.isArray(block.shapes) && block.shapes.length > 0;
}

/** Block position `distance` blocks ahead of the bot's current heading. */
function aheadOffset(entity, yaw, distance, up) {
  return entity.position.offset(
    -Math.sin(yaw) * distance,
    up,
    -Math.cos(yaw) * distance
  );
}

/** Free space in front of `yaw`, up to `max` blocks. */
function clearance(entity, yaw, max) {
  for (let d = 0.5; d <= max; d += 0.5) {
    const feet = bot.blockAt(aheadOffset(entity, yaw, d, 0));
    const head = bot.blockAt(aheadOffset(entity, yaw, d, 1));
    if (isSolid(feet) || isSolid(head)) return d;
  }
  return max;
}

/** Shallow puddles with solid ground underneath do not count as water. */
function isWater(block) {
  return !!block && WATER_BLOCKS.has(block.name);
}

function deltaYaw(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Looks for a *large* body of water in front of `yaw`. A single water block
 * sitting on solid ground (a puddle) is ignored on purpose — the bot only
 * turns away from water it would actually have to swim through.
 */
function waterAhead(entity, yaw, max) {
  for (let d = 1; d <= max; d += 0.5) {
    const below = bot.blockAt(aheadOffset(entity, yaw, d, -1));
    if (!isWater(below)) continue;
    const feet = bot.blockAt(aheadOffset(entity, yaw, d, 0));
    const deeper = bot.blockAt(aheadOffset(entity, yaw, d, -2));
    if (isWater(feet) || isWater(deeper)) return d;
  }
  return 0;
}

function isInWater(entity) {
  return (
    isWater(bot.blockAt(entity.position)) ||
    isWater(bot.blockAt(entity.position.offset(0, -1, 0)))
  );
}

/** Blocks of water in front of `yaw` before dry land shows up. */
function dryDistance(entity, yaw, max) {
  for (let d = 1; d <= max; d += 1) {
    const below = bot.blockAt(aheadOffset(entity, yaw, d, -1));
    const feet = bot.blockAt(aheadOffset(entity, yaw, d, 0));
    if (!isWater(below) && !isWater(feet)) return d;
  }
  return Infinity;
}

/** Heading score: open space is good, water is bad. */
function pathScore(entity, yaw) {
  const space = clearance(entity, yaw, WALL_SCAN_MAX);
  if (space <= 0) return -1;
  const water = config.movement.avoidWater ? waterAhead(entity, yaw, WATER_SCAN_MAX) : 0;
  return space - (water ? 10 : 0) + Math.random() * 0.5;
}

/** Already swimming (spawned in water, pushed in…): head for the nearest shore. */
function escapeWater() {
  const entity = bot.entity;
  const t = now();
  let bestYaw = entity.yaw;
  let bestDistance = Infinity;
  for (let i = 0; i < 16; i++) {
    const candidate = (i / 16) * Math.PI * 2;
    const distance = dryDistance(entity, candidate, 8);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestYaw = candidate;
    }
  }
  if (Math.abs(deltaYaw(entity.yaw, bestYaw)) > 0.25) bot.look(bestYaw, 0, true);
  brain.yaw = bestYaw;
  brain.mode = "walk";
  brain.modeUntil = t + 1200; // keep pressing forward while swimming out
  setControls({ forward: true, sprint: false, sneak: false });
  if (t >= brain.nextStrokeAt) {
    brain.nextStrokeAt = t + 700;
    setControls({ jump: true }); // hold jump to swim upward
    brain.jumpUntil = t + 200;
  }
}

/**
 * Runs every tick while moving:
 *  - large body of water ahead  -> turn away from it
 *  - already in the water       -> swim back to the nearest dry land
 */
function handleWaterAvoidance() {
  if (!config.movement.avoidWater || !bot || !bot.entity) return;
  const entity = bot.entity;
  const t = now();

  if (isInWater(entity)) {
    if (t - brain.lastWaterLogAt > 6000) {
      brain.lastWaterLogAt = t;
      log("MOVE", "In water — heading back to dry land");
    }
    escapeWater();
    return;
  }

  if (brain.mode === "idle") return;

  if (waterAhead(entity, entity.yaw, WATER_SCAN_MAX)) {
    if (t - brain.lastWaterTurnAt > 1500) {
      brain.lastWaterTurnAt = t;
      turnToOpenPath("Water ahead — running the other way");
      // walk through the turn so momentum does not carry the bot in,
      // then resume the burst (running again) on dry land
      if (brain.mode === "run") brain.waterWalkUntil = t + 900;
    }
    setControls({ forward: true, sprint: false });
    return;
  }

  if (brain.waterWalkUntil && t >= brain.waterWalkUntil) {
    brain.waterWalkUntil = 0;
    if (brain.mode === "run") setControls({ sprint: true });
  }
}

function mobLabel(entity) {
  const raw = entity.name || entity.displayName || entity.kind || "mob";
  return String(raw).replace(/_/g, " ").toLowerCase();
}

/* ------------------------------------------------------------ bot lifecycle */

let instanceId = 0; // every connection gets a new id; stale events are ignored

function isCurrent(id) {
  return running && id === instanceId;
}

function startBotProcess() {
  if (running) {
    log("SYSTEM", "Bot is already running");
    return { ok: true, message: "Bot is already running" };
  }
  if (!config.ip) {
    log("ERROR", "No server address configured — fill it in and hit Save config");
    return { ok: false, message: "No server address configured" };
  }
  stoppedByUser = false;
  running = true;
  reconnectAttempts = 0;
  stats.reconnects = 0;
  createBot();
  return { ok: true, message: "Connecting to " + config.ip + ":" + config.port };
}

function stopBotProcess() {
  stoppedByUser = true;
  running = false;
  instanceId++; // ignore anything the old connection still emits
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  resetBrain();
  if (bot) {
    const old = bot;
    bot = null;
    try {
      old.quit("Stopped via dashboard");
    } catch (err) {}
    // NOTE: listeners stay attached on purpose — a late 'error' from
    // minecraft-protocol must always have a handler, or node exits.
  }
  spawnAt = 0;
  dead = false;
  brain.targetLabel = "none";
  pendingKills.clear();
  log("SYSTEM", "Bot stopped via dashboard");
  return { ok: true, message: "Bot stopped" };
}

function createBot() {
  if (!running) return;
  const id = ++instanceId;
  const current = () => isCurrent(id);

  log("SYSTEM", "Connecting to " + config.ip + ":" + config.port + " as " + config.name + "…");
  resetBrain();

  const options = {
    host: config.ip,
    port: Number(config.port) || 25565,
    username: config.name,
    auth: config.auth || "offline",
    hideErrors: true,
    logErrors: false,
    checkTimeoutInterval: 60000,
  };
  if (config.version && config.version !== "auto") options.version = config.version;

  let connection;
  try {
    connection = mineflayer.createBot(options);
  } catch (err) {
    log("ERROR", "Failed to create bot: " + err.message);
    handleDisconnect("create error", id);
    return;
  }
  bot = connection;

  const connectTimeout = setTimeout(() => {
    if (!current() || spawnAt) return;
    log("ERROR", "Connection timed out after 30s — is the server online?");
    try {
      connection.end();
    } catch (err) {}
  }, 30000);

  connection.on("error", (err) => {
    if (!current()) return;
    const code = err && err.code ? err.code + " " : "";
    log("ERROR", "Error: " + code + (err && err.message ? err.message : err));
    if (err && ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EHOSTUNREACH", "ENOTFOUND", "EAI_AGAIN"].includes(err.code)) {
      log("ERROR", "Cannot reach " + config.ip + ":" + config.port + " — on Aternos, start the server first");
    }
  });

  connection.on("login", () => {
    if (!current()) return;
    reconnectAttempts = 0;
    log("SYSTEM", "Logged in as " + connection.username);
  });

  connection.once("spawn", () => {
    clearTimeout(connectTimeout);
    if (!current()) return;
    dead = false;
    spawnAt = now();
    homePos = connection.entity.position.clone();
    if (brain.mode === "idle" || brain.mode === "combat") brain.nextMoveAt = now() + 1500;
    log("SYSTEM", "Spawned in the world — bot is active");
    if (config.authmePassword) {
      setTimeout(() => {
        if (!current()) return;
        connection.chat("/register " + config.authmePassword + " " + config.authmePassword);
        setTimeout(() => current() && connection.chat("/login " + config.authmePassword), 1200);
        log("CHAT", "Sent /register + /login to AuthMe");
      }, 1500);
    }
  });

  connection.on("end", () => {
    clearTimeout(connectTimeout);
    if (!current()) return;
    handleDisconnect("connection closed", id);
  });

  connection.on("kicked", (reason) => {
    clearTimeout(connectTimeout);
    if (!current()) return;
    log("SYSTEM", "Kicked from server: " + cleanReason(reason));
    handleDisconnect("kicked", id);
  });

  connection.on("health", () => {
    if (!current()) return;
    if (connection.health <= 0 && !dead) {
      dead = true;
      stats.deaths++;
      log("COMBAT", "Bot died — respawning");
      setTimeout(() => {
        if (current() && dead) {
          try {
            connection.respawn();
          } catch (err) {}
        }
      }, 1200);
    } else if (connection.health > 0) {
      dead = false;
    }
  });

  connection.on("messagestr", (message, position) => {
    if (!current()) return;
    const text = String(message).trim();
    if (!text || position === "game_info") return;
    log("CHAT", text);
  });
}

function cleanReason(reason) {
  try {
    const parsed = JSON.parse(reason);
    if (typeof parsed === "string") return parsed;
    return parsed.text || (parsed.extra && parsed.extra.map((p) => p.text).join("")) || reason;
  } catch (err) {
    return reason;
  }
}

function handleDisconnect(reason, id) {
  if (id !== undefined && id !== instanceId) return;
  log("SYSTEM", "Disconnected (" + reason + ")");
  instanceId++; // the dead connection must not report anything else
  resetBrain();
  spawnAt = 0;
  dead = false;
  bot = null;
  pendingKills.clear();

  if (!running || stoppedByUser) return;

  if (!config.reconnect.enabled) {
    log("SYSTEM", "Auto reconnect is off — bot will stay offline");
    running = false;
    return;
  }

  reconnectAttempts++;
  if (config.reconnect.maxAttempts > 0 && reconnectAttempts > config.reconnect.maxAttempts) {
    log("SYSTEM", "Gave up after " + config.reconnect.maxAttempts + " reconnect attempts");
    running = false;
    return;
  }

  log("SYSTEM", "Reconnecting in " + config.reconnect.delay + "s (attempt " + reconnectAttempts + ")");
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (!running) return;
    stats.reconnects++;
    createBot();
  }, Math.max(1, config.reconnect.delay) * 1000);
}

/* --------------------------------------------------------------- behaviour */

function resetBrain() {
  brain.mode = "idle";
  brain.modeUntil = 0;
  brain.nextMoveAt = 0;
  brain.nextLookAt = 0;
  brain.chaseId = null;
  brain.lastStuckPos = null;
  brain.targetLabel = "none";
  brain.lastWaterTurnAt = 0;
  brain.waterWalkUntil = 0;
  brain.nextStrokeAt = 0;
  if (bot) setControls({ forward: false, back: false, left: false, right: false, sprint: false, sneak: false });
}

function setControls(states) {
  if (!bot) return;
  for (const name of Object.keys(states)) {
    try {
      bot.setControlState(name, states[name]);
    } catch (err) {}
  }
}

function stopMoving() {
  setControls({ forward: false, back: false, left: false, right: false, sprint: false, sneak: false });
}

function releaseJump() {
  if (brain.jumpUntil && now() >= brain.jumpUntil) {
    setControls({ jump: false });
    brain.jumpUntil = 0;
  }
}

function hop() {
  if (!bot || !bot.entity) return;
  if (!bot.entity.onGround) return;
  setControls({ jump: true });
  brain.jumpUntil = now() + 250;
}

function clearObstacle() {
  const entity = bot.entity;
  const feet = bot.blockAt(aheadOffset(entity, entity.yaw, 1, 0));
  const head = bot.blockAt(aheadOffset(entity, entity.yaw, 1, 1));
  const above = bot.blockAt(aheadOffset(entity, entity.yaw, 0, 0));
  const canHop = !isSolid(head) && !isSolid(above) && isSolid(feet);
  if (config.movement.jumpOverObstacles && canHop) {
    hop();
    return true;
  }
  return false;
}

function turnToOpenPath(reason) {
  const entity = bot.entity;
  let bestYaw = entity.yaw;
  let bestScore = -1;
  for (let i = 0; i < 16; i++) {
    const candidate = (i / 16) * Math.PI * 2;
    const score = pathScore(entity, candidate);
    if (score > bestScore) {
      bestScore = score;
      bestYaw = candidate;
    }
  }
  brain.yaw = bestYaw;
  bot.look(bestYaw, 0, true);
  if (reason) log("MOVE", reason);
  return bestYaw;
}

function startBurst() {
  const m = config.movement;
  const wantsRun = m.runTime > 0 && Math.random() * 100 < m.runShare;
  const walking = !wantsRun && m.walkTime > 0;
  if (!walking && !wantsRun) {
    brain.mode = "idle";
    brain.nextMoveAt = now() + 3000;
    return;
  }

  brain.yaw = Math.random() * Math.PI * 2;
  bot.look(brain.yaw, 0, true);

  if (walking) {
    brain.mode = "walk";
    brain.modeUntil = now() + m.walkTime * 1000;
    setControls({ forward: true, sprint: false });
    if (Math.random() < 0.25) setControls({ sneak: true });
    log("MOVE", "Walking forward for " + m.walkTime + "s");
  } else {
    brain.mode = "run";
    brain.modeUntil = now() + m.runTime * 1000;
    setControls({ forward: true, sprint: true });
    log("MOVE", "Running forward for " + m.runTime + "s");
  }
  brain.lastStuckPos = bot.entity.position.clone();
  brain.lastStuckCheckAt = now();
}

function movementTick() {
  const entity = bot.entity;
  const m = config.movement;
  const t = now();

  if (config.movement.enabled === false) {
    stopMoving();
    brain.mode = "idle";
    return;
  }

  handleWaterAvoidance();

  if (m.wanderRadius > 0 && homePos) {
    const distanceFromHome = entity.position.distanceTo(homePos);
    if (distanceFromHome > m.wanderRadius) {
      const yawHome = Math.atan2(
        -(homePos.x - entity.position.x),
        -(homePos.z - entity.position.z)
      );
      const waterOnTheWayHome = m.avoidWater && waterAhead(entity, yawHome, WATER_SCAN_MAX) > 0;
      if (!waterOnTheWayHome) {
        brain.yaw = yawHome;
        bot.look(yawHome, 0, true);
        if (brain.mode === "idle") {
          brain.mode = Math.random() < 0.5 ? "walk" : "run";
          brain.modeUntil = t + rand(2000, 4000);
          setControls({ forward: true, sprint: brain.mode === "run" });
        }
        if (t - brain.lastWallScanAt > 4000) {
          brain.lastWallScanAt = t;
          log("MOVE", "Outside wander radius — heading back to spawn area");
        }
        return;
      }
      // water between here and home: keep wandering, the water logic reroutes us
      if (brain.mode === "idle" && t >= brain.nextMoveAt) startBurst();
      return;
    }
  }

  if (brain.mode === "idle") {
    stopMoving();
    if (t >= brain.nextMoveAt) startBurst();
    return;
  }

  if (t >= brain.modeUntil) {
    stopMoving();
    brain.mode = "idle";
    brain.nextMoveAt = t + rand(m.pause * 0.5, m.pause * 1.5) * 1000;
    return;
  }

  // wall + stuck detection while a burst is running
  if (t - brain.lastWallScanAt > 250) {
    brain.lastWallScanAt = t;
    if (m.avoidWalls && clearance(entity, entity.yaw, 1.2) < 1.2) {
      if (!clearObstacle()) turnToOpenPath(null);
    }
    if (t - brain.lastStuckCheckAt > 1200 && brain.lastStuckPos) {
      const moved = entity.position.distanceTo(brain.lastStuckPos);
      brain.lastStuckCheckAt = t;
      brain.lastStuckPos = entity.position.clone();
      if (moved < 0.2) {
        hop();
        turnToOpenPath("Stuck — turning around");
      }
    }
  }
  if (Math.random() < 0.02) hop();
}

function lookAround() {
  if (!bot || !bot.entity) return;
  if (brain.mode === "combat") return;
  const yaw = brain.mode === "idle" ? Math.random() * Math.PI * 2 : bot.entity.yaw + rand(-1.2, 1.2);
  bot.look(yaw, rand(-0.4, 0.4), true);
}

/* ------------------------------------------------------------------ combat */

function findTarget() {
  if (!bot || !bot.entity) return null;
  const range = config.combat.range;
  let best = null;
  let bestDistance = Infinity;
  for (const id of Object.keys(bot.entities)) {
    const entity = bot.entities[id];
    if (!entity || entity === bot.entity) continue;
    if (entity.type !== "mob" && entity.type !== "hostile") continue;
    const name = (entity.name || entity.kind || "").toLowerCase();
    if (config.combat.hostileOnly && !HOSTILE_MOBS.has(name)) continue;
    if (!entity.position) continue;
    const distance = entity.position.distanceTo(bot.entity.position);
    if (distance <= range && distance < bestDistance) {
      bestDistance = distance;
      best = entity;
    }
  }
  return best;
}

function bestWeapon() {
  if (!bot || !bot.inventory) return null;
  let best = null;
  let bestDamage = 0;
  for (const item of bot.inventory.items()) {
    const damage = WEAPON_DAMAGE[item.name] || 0;
    if (damage > bestDamage) {
      bestDamage = damage;
      best = item;
    }
  }
  return best;
}

async function equipBestWeapon() {
  if (!config.combat.autoEquip || !bot) return;
  const weapon = bestWeapon();
  if (!weapon || brain.weapon === weapon.name) return;
  try {
    await bot.equip(weapon, "hand");
    brain.weapon = weapon.name;
    log("COMBAT", "Equipped " + weapon.name.replace(/_/g, " "));
  } catch (err) {}
}

function attackTick(target) {
  const t = now();
  const entity = bot.entity;
  const dx = target.position.x - entity.position.x;
  const dz = target.position.z - entity.position.z;
  const distance = Math.hypot(dx, dz);
  const yaw = Math.atan2(-dx, -dz);
  const dy = target.position.y + 1 - (entity.position.y + 1.62);
  bot.look(yaw, Math.atan2(dy, Math.max(distance, 0.5)), true);

  if (distance > ATTACK_REACH) {
    setControls({ forward: true, sprint: true, sneak: false });
    if (clearance(entity, yaw, 1.2) < 1.2) {
      if (!clearObstacle()) turnToOpenPath("Path blocked — going around");
    }
    return;
  }

  setControls({ forward: false, sprint: false });
  if (t - brain.lastAttackAt < 700) return;

  if (config.combat.crits && entity.onGround) {
    setControls({ jump: true });
    brain.jumpUntil = t + 200;
    return; // hit on the way down instead
  }

  const crit = !entity.onGround;
  try {
    bot.attack(target);
  } catch (err) {}
  brain.lastAttackAt = t;
  if (crit) stats.crits++;
  pendingKills.set(target.id, { at: t, label: mobLabel(target) });
}

function collectKills() {
  const t = now();
  for (const [id, info] of pendingKills) {
    if (!bot || !bot.entities[id]) {
      stats.kills++;
      log("COMBAT", "Killed " + info.label + " (total " + stats.kills + ")");
      pendingKills.delete(id);
      continue;
    }
    if (t - info.at > 20000) pendingKills.delete(id);
  }
}

/* -------------------------------------------------------------- brain loop */

function tick() {
  if (!bot || !bot.entity) return;
  releaseJump();

  const entity = bot.entity;
  if (typeof bot.health === "number" && bot.health <= 0) {
    stopMoving();
    return;
  }

  collectKills();

  if (config.combat.enabled) {
    const target = findTarget();
    if (target) {
      if (brain.chaseId !== target.id) {
        brain.chaseId = target.id;
        const distance = target.position.distanceTo(entity.position).toFixed(1);
        log("COMBAT", "Targeting " + mobLabel(target) + " (" + distance + "m)");
        equipBestWeapon();
      }
      brain.mode = "combat";
      brain.targetLabel = mobLabel(target);
      if (brain.modeUntil) brain.modeUntil = now() + 1500;
      attackTick(target);
      return;
    }
    if (brain.mode === "combat") {
      brain.mode = "idle";
      brain.chaseId = null;
      brain.targetLabel = "none";
      brain.nextMoveAt = now() + 500;
      setControls({ sprint: false, forward: false });
    }
  }

  if (now() >= brain.nextLookAt) {
    brain.nextLookAt = now() + rand(2000, 6000);
    lookAround();
  }

  movementTick();
}

setInterval(() => {
  try {
    tick();
  } catch (err) {
    log("ERROR", "Behaviour tick failed: " + err.message);
  }
}, TICK_MS);

/* ----------------------------------------------------------------- exports */

function getState() {
  const entity = bot ? bot.entity : null;
  let position = null;
  if (entity) {
    position = {
      x: Math.floor(entity.position.x),
      y: Math.floor(entity.position.y),
      z: Math.floor(entity.position.z),
    };
  }
  let players = 0;
  if (bot && bot.players) {
    players = Object.keys(bot.players).filter(
      (name) => bot.username && name.toLowerCase() !== bot.username.toLowerCase()
    ).length;
  }
  let botState = "offline";
  if (running && bot && entity) botState = dead || (bot.health <= 0) ? "dead" : "online";
  else if (running) botState = "connecting";

  return {
    running,
    botState,
    username: (bot && bot.username) || config.name,
    version:
      (bot && bot.version) ||
      (config.version && config.version !== "auto" ? config.version : null),
    health: entity && typeof bot.health === "number" ? bot.health : null,
    food: entity && typeof bot.food === "number" ? bot.food : null,
    position,
    players,
    target: botState === "online" ? brain.targetLabel : "none",
    mode: brain.mode,
    kills: stats.kills,
    crits: stats.crits,
    deaths: stats.deaths,
    reconnects: stats.reconnects,
    onlineFor: spawnAt && botState === "online" ? Math.floor((now() - spawnAt) / 1000) : 0,
    reconnectAttempts,
  };
}

function getConfig() {
  const safe = clone(config);
  safe.authmePasswordSet = !!config.authmePassword;
  safe.authmePassword = "";
  return safe;
}

function updateConfig(patch) {
  const next = merge(config, patch || {});
  next.ip = String(next.ip || "").trim();
  next.port = Math.round(sanitiseNumber(next.port, 1, 65535, 25565));
  next.name = String(next.name || "").trim().slice(0, 16) || DEFAULT_CONFIG.name;
  next.version = String(next.version || "auto").trim() || "auto";

  next.movement.walkTime = sanitiseNumber(next.movement.walkTime, 0, 60, 4);
  next.movement.runTime = sanitiseNumber(next.movement.runTime, 0, 60, 6);
  next.movement.runShare = sanitiseNumber(next.movement.runShare, 0, 100, 60);
  next.movement.pause = sanitiseNumber(next.movement.pause, 0, 120, 6);
  next.movement.wanderRadius = sanitiseNumber(next.movement.wanderRadius, 0, 256, 24);

  next.combat.range = sanitiseNumber(next.combat.range, 2, 64, 16);
  next.reconnect.delay = sanitiseNumber(next.reconnect.delay, 1, 600, 5);
  next.reconnect.maxAttempts = sanitiseNumber(next.reconnect.maxAttempts, 0, 1000, 0);

  const passwordField = patch && typeof patch.authmePassword === "string" ? patch.authmePassword.trim() : "";
  const clearPassword = !!(patch && patch.authmePassword === "");
  if (passwordField) next.authmePassword = passwordField;
  else if (!clearPassword) next.authmePassword = config.authmePassword;
  else next.authmePassword = "";

  config = next;
  saveConfigFile();
  log("CONFIG", "Settings saved");
  return getConfig();
}

module.exports = {
  getState,
  getConfig,
  updateConfig,
  startBotProcess,
  stopBotProcess,
  onLog,
  getLogs,
  log,
  sendMessage(text) {
    const message = String(text || "").trim();
    if (!message) return { ok: false, message: "Nothing to send" };
    if (!bot || !bot.chat) return { ok: false, message: "Bot is not connected" };
    bot.chat(message);
    log("CHAT", "» " + message);
    return { ok: true, message: "Sent" };
  },
  // legacy names kept for older tooling
  getBotState: getState,
};

try {
  require("./keep_alive");
} catch (err) {
  log("ERROR", "Web dashboard failed to start: " + err.message);
}

log("SYSTEM", "AFK/BOT engine ready — press Start in the dashboard");

/* ---------------------------------------------------------- crash safety net */
// An AFK bot has to survive library level failures: a server that refuses the
// connection, a late ping error or a dropped socket must never take the
// dashboard down with them.
process.on("uncaughtException", (err) => {
  log("ERROR", "Unhandled exception: " + (err && err.message ? err.message : String(err)));
});
process.on("unhandledRejection", (reason) => {
  log("ERROR", "Unhandled rejection: " + (reason && reason.message ? reason.message : String(reason)));
});
