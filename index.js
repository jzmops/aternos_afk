const mineflayer = require("mineflayer");
const fs = require("fs");

const config = JSON.parse(fs.readFileSync("config.json", "utf8"));

let bot = null;
let moveInterval = null;
let combatInterval = null;
let reconnectAttempts = 0;
let isMovingForward = false;
let lastWallTurn = 0;
let botRunning = false;
let reconnectTimer = null;
let loginTime = null;
let spawnEventReceived = false;

function getBotState() {
  let state = "offline";
  if (botRunning && bot && bot.entity) {
    if (bot.health <= 0) state = "dead";
    else state = "online";
  } else if (botRunning) {
    state = "connecting";
  }
  return {
    botState: state,
    running: botRunning,
    health: bot && bot.entity ? bot.health : null,
    food: bot && bot.entity ? bot.food : null,
    serverTime: loginTime ? (Date.now() - loginTime) / 1000 : 0,
    position: bot && bot.entity ? {
      x: Math.floor(bot.entity.position.x),
      y: Math.floor(bot.entity.position.y),
      z: Math.floor(bot.entity.position.z),
    } : null,
    movement: config.movement.enabled,
    combat: config.combat.enabled,
  };
}

function startBotProcess() {
  if (botRunning) { log("[BOT] Bot is already running."); return; }
  botRunning = true;
  reconnectAttempts = 0;
  createBot();
}

function stopBotProcess() {
  botRunning = false;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  stopIntervals();
  if (bot) {
    try { bot.quit("Stopped via dashboard"); } catch (e) {}
    bot = null;
  }
  loginTime = null;
  spawnEventReceived = false;
  log("[BOT] Bot stopped via dashboard.");
}

function log(msg) {
  const ts = new Date().toLocaleTimeString();
  console.log(`[${ts}] ${msg}`);
}

function createBot() {
  log(`[BOT] Connecting to ${config.ip}:${config.port} as ${config.name}...`);
  spawnEventReceived = false;

  const botOptions = {
    host: config.ip,
    port: config.port,
    username: config.name,
    auth: config.auth || "offline",
  };

  if (config.version && config.version !== "auto") {
    botOptions.version = config.version;
  }

  bot = mineflayer.createBot(botOptions);

  bot.on("error", (err) => {
    if (err.code === "ECONNREFUSED" || err.code === "ECONNRESET" || err.code === "ETIMEDOUT") {
      log("[BOT] Connection failed: The server is offline, the IP/port is incorrect, or your host is blocking the connection.");
      log("[BOT] Server: " + config.ip + ":" + config.port);
    } else {
      log("[BOT] Error: " + err);
    }
  });

  bot.on("login", () => {
    loginTime = Date.now();
    log(`[BOT] Logged in as ${bot.username}`);
    reconnectAttempts = 0;
  });

  bot.once("spawn", () => {
    spawnEventReceived = true;
    log("[BOT] Spawned in world. Starting bot logic...");
    startBot();
  });

  bot.on("end", () => handleDisconnect("end"));
  bot.on("kicked", (reason) => {
    log("[BOT] Kicked from server: " + reason);
    handleDisconnect("kicked: " + reason);
  });

  bot.on("health", () => {
    if (bot.health <= 0) {
      log("[BOT] Bot died. Respawning...");
      bot.respawn();
    }
  });

  bot.on("chat", (username, message) => {
    if (username === bot.username) return;
    handleCommand(username, message);
  });
}

function startBot() {
  stopIntervals();

  if (config.movement.enabled) {
    const intervalMs = config.movement.interval * 1000;
    moveInterval = setInterval(performMovement, intervalMs);
    performMovement();
    log("[BOT] Movement started — interval: " + config.movement.interval + "s, duration: " + config.movement.moveDuration + "s");
  }

  if (config.combat.enabled) {
    const combatMs = config.combat.attackInterval * 1000;
    combatInterval = setInterval(combatTick, combatMs);
    log("[BOT] Combat enabled — range: " + config.combat.range + " blocks");
  }

  log("[BOT] Ready! Type commands in game chat (e.g. '!settings').");
}

function stopIntervals() {
  if (moveInterval) {
    clearInterval(moveInterval);
    moveInterval = null;
  }
  if (combatInterval) {
    clearInterval(combatInterval);
    combatInterval = null;
  }
  stopMovement();
}

function stopMovement() {
  if (!bot || !bot.entity) return;
  ["forward", "back", "left", "right", "jump", "sprint"].forEach((a) =>
    bot.setControlState(a, false)
  );
  isMovingForward = false;
}

function performMovement() {
  if (!bot || !bot.entity) return;
  if (bot.health <= 0) return;

  stopMovement();

  const yaw = Math.random() * Math.PI * 2;
  bot.look(yaw, 0, true);

  if (config.movement.sprint) {
    bot.setControlState("sprint", true);
  }

  bot.setControlState("forward", true);
  isMovingForward = true;

  const duration = config.movement.moveDuration * 1000;
  setTimeout(() => {
    if (bot && bot.entity) {
      bot.setControlState("forward", false);
      bot.setControlState("sprint", false);
      isMovingForward = false;
    }
  }, duration);
}

function detectWall() {
  if (!config.movement.avoidWalls || !bot || !bot.entity) return false;

  const dir = bot.entity.yaw;
  const dx = Math.sin(-dir) * config.movement.wallDetectionDistance;
  const dz = Math.cos(-dir) * config.movement.wallDetectionDistance;
  const px = Math.floor(bot.entity.position.x + dx);
  const py = Math.floor(bot.entity.position.y);
  const pz = Math.floor(bot.entity.position.z + dz);

  const block = bot.blockAt(bot.entity.position.offset(dx, 0, dz));
  if (!block) return false;

  const isSolid = block.shapes && block.shapes.length > 0;

  if (isSolid) {
    const blockAbove = bot.blockAt(bot.entity.position.offset(dx, 1, dz));
    const blockBelow = bot.blockAt(bot.entity.position.offset(dx, -1, dz));
    const aboveSolid = blockAbove && blockAbove.shapes && blockAbove.shapes.length > 0;

    if (aboveSolid) {
      return true;
    }

    if (config.movement.jumpOverObstacles && blockBelow && !blockBelow.shapes) {
      bot.setControlState("jump", true);
      setTimeout(() => bot.setControlState("jump", false), 500);
      return false;
    }

    return true;
  }

  return false;
}

function turnAwayFromWall() {
  if (!bot || !bot.entity) return;

  const now = Date.now();
  if (now - lastWallTurn < 2000) return;
  lastWallTurn = now;

  log("[BOT] Wall detected — turning around.");

  bot.setControlState("forward", false);
  bot.setControlState("sprint", false);

  let bestYaw = bot.entity.yaw;
  let bestClearance = 0;

  for (let i = 0; i < 8; i++) {
    const testYaw = (i / 8) * Math.PI * 2;
    const dx = Math.sin(-testYaw) * config.movement.wallDetectionDistance;
    const dz = Math.cos(-testYaw) * config.movement.wallDetectionDistance;
    const testBlock = bot.blockAt(bot.entity.position.offset(dx, 0, dz));

    if (!testBlock || !testBlock.shapes || testBlock.shapes.length === 0) {
      const clearance = Math.random();
      if (clearance > bestClearance) {
        bestClearance = clearance;
        bestYaw = testYaw;
      }
    }
  }

  bot.look(bestYaw, 0, true);

  if (config.movement.sprint) {
    bot.setControlState("sprint", true);
  }
  bot.setControlState("forward", true);
  isMovingForward = true;
}

const HOSTILE_MOBS = new Set([
  "zombie", "skeleton", "creeper", "spider", "enderman", "witch",
  "blaze", "ghast", "slime", "magma_cube", "silverfish", "cave_spider",
  "zombie_villager", "wither_skeleton", "stray", "husk", "drowned",
  "phantom", "pillager", "vindicator", "ravager", "evoker", "vex",
  "hoglin", "piglin", "piglin_brute", "zoglin", "warden", "warden",
  "shulker", "endermite", "guardian", "elder_guardian",
]);

function findTarget() {
  if (!bot || !bot.entity) return null;

  const range = config.combat.range;
  let nearest = null;
  let nearestDist = Infinity;

  for (const entity of Object.values(bot.entities)) {
    if (!entity || entity.type !== "mob") continue;
    if (entity.kind === "slime" || entity.kind === "magma_cube") {
      // slimes are valid targets
    }

    const mobName = entity.name || entity.kind || "";
    if (config.combat.hostileOnly && !HOSTILE_MOBS.has(mobName)) continue;

    if (entity.position && bot.entity.position) {
      const dist = entity.position.distanceTo(bot.entity.position);
      if (dist <= range && dist < nearestDist) {
        nearestDist = dist;
        nearest = entity;
      }
    }
  }

  return nearest;
}

function combatTick() {
  if (!bot || !bot.entity) return;
  if (bot.health <= 0) return;
  if (!config.combat.enabled) return;

  const target = findTarget();
  if (!target) return;

  log("[BOT] Attacking " + (target.name || target.kind) + " at distance " + target.position.distanceTo(bot.entity.position).toFixed(1));

  stopMovement();

  if (target.position) {
    const dx = target.position.x - bot.entity.position.x;
    const dz = target.position.z - bot.entity.position.z;
    const yaw = Math.atan2(-dx, -dz);
    bot.look(yaw, 0, true);
  }

  bot.attack(target);

  setTimeout(() => {
    if (bot && bot.entity && config.movement.enabled && !findTarget()) {
      performMovement();
    }
  }, 500);
}

function handleCommand(username, message) {
  const parts = message.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();

  switch (cmd) {
    case "!status":
      bot.chat(`HP: ${bot.health.toFixed(0)} | Food: ${bot.food} | Movement: ${config.movement.enabled ? "ON" : "OFF"} | Combat: ${config.combat.enabled ? "ON" : "OFF"}`);
      break;

    case "!move":
    case "!movement":
      if (parts[1] === "on") {
        config.movement.enabled = true;
        startBot();
        bot.chat("Movement enabled.");
      } else if (parts[1] === "off") {
        config.movement.enabled = false;
        stopMovement();
        if (moveInterval) { clearInterval(moveInterval); moveInterval = null; }
        bot.chat("Movement disabled.");
      } else {
        bot.chat("Usage: !move on/off");
      }
      break;

    case "!interval":
      if (parts[1] && !isNaN(parts[1])) {
        config.movement.interval = parseFloat(parts[1]);
        if (config.movement.enabled) startBot();
        bot.chat(`Movement interval set to ${config.movement.interval}s`);
      } else {
        bot.chat("Usage: !interval <seconds>");
      }
      break;

    case "!duration":
      if (parts[1] && !isNaN(parts[1])) {
        config.movement.moveDuration = parseFloat(parts[1]);
        bot.chat(`Move duration set to ${config.movement.moveDuration}s`);
      } else {
        bot.chat("Usage: !duration <seconds>");
      }
      break;

    case "!sprint":
      if (parts[1] === "on" || parts[1] === "off") {
        config.movement.sprint = parts[1] === "on";
        bot.chat(`Sprint ${config.movement.sprint ? "enabled" : "disabled"}.`);
      } else {
        bot.chat("Usage: !sprint on/off");
      }
      break;

    case "!combat":
      if (parts[1] === "on") {
        config.combat.enabled = true;
        if (!combatInterval) {
          combatInterval = setInterval(combatTick, config.combat.attackInterval * 1000);
        }
        bot.chat("Combat enabled.");
      } else if (parts[1] === "off") {
        config.combat.enabled = false;
        if (combatInterval) { clearInterval(combatInterval); combatInterval = null; }
        bot.chat("Combat disabled.");
      } else {
        bot.chat("Usage: !combat on/off");
      }
      break;

    case "!range":
      if (parts[1] && !isNaN(parts[1])) {
        config.combat.range = parseFloat(parts[1]);
        bot.chat(`Combat range set to ${config.combat.range} blocks`);
      } else {
        bot.chat("Usage: !range <blocks>");
      }
      break;

    case "!settings":
      bot.chat(`Settings: Move ${config.movement.enabled ? "ON" : "OFF"} (${config.movement.interval}s/${config.movement.moveDuration}s) Sprint ${config.movement.sprint ? "ON" : "OFF"} | Combat ${config.combat.enabled ? "ON" : "OFF"} (${config.combat.range}r) | Walls ${config.movement.avoidWalls ? "ON" : "OFF"}`);
      break;

    case "!help":
      bot.chat("Commands: !status !move on/off !interval <s> !duration <s> !sprint on/off !combat on/off !range <b> !settings !help");
      break;

    default:
      return;
  }
}

function handleDisconnect(reason) {
  log("[BOT] Disconnected (" + reason + ")");
  stopIntervals();
  bot = null;
  loginTime = null;
  spawnEventReceived = false;

  if (!botRunning) return;

  if (!config.reconnect.enabled) {
    log("[BOT] Reconnect is disabled. Bot will not reconnect.");
    botRunning = false;
    return;
  }

  reconnectAttempts++;
  if (config.reconnect.maxAttempts > 0 && reconnectAttempts > config.reconnect.maxAttempts) {
    log("[BOT] Max reconnect attempts reached. Giving up.");
    botRunning = false;
    return;
  }

  const delay = config.reconnect.delay * 1000;
  log(`[BOT] Reconnecting in ${config.reconnect.delay}s... (attempt ${reconnectAttempts})`);
  reconnectTimer = setTimeout(createBot, delay);
}

const wallCheckInterval = setInterval(() => {
  if (!bot || !bot.entity || bot.health <= 0) return;
  if (!config.movement.enabled || !config.movement.avoidWalls) return;
  if (!isMovingForward) return;
  if (findTarget()) return;

  if (detectWall()) {
    turnAwayFromWall();
  }
}, 500);

module.exports = { getBotState, startBotProcess, stopBotProcess };

try {
  require("./keep_alive");
} catch (e) {
  log("[BOT] Keep alive module not found, continuing without it.");
}

botRunning = true;
createBot();
