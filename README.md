# Minecraft AFK Bot

A smart AFK bot for Minecraft Java Edition servers (built for Aternos). The bot wanders around, attacks hostile mobs, detects walls and turns away, and auto-reconnects when disconnected.

## Features

- **Adjustable movement** — control how often and how long the bot moves
- **Sprint toggle** — choose whether the bot sprints or walks
- **Wall detection** — scans ahead and turns the other way when blocked
- **Jump over obstacles** — hops over 1-block obstacles instead of turning
- **Hostile mob combat** — attacks zombies, skeletons, creepers, and more
- **Auto-reconnect** — reconnects after disconnection with configurable delay
- **In-game chat commands** — adjust settings live without restarting

## Setup

1. Edit `config.json` with your server details
2. Run `npm install`
3. Run `npm start`

## Config

```json
{
  "ip": "yourserver.aternos.me",
  "port": 12345,
  "name": "BotName",
  "version": "1.21.4",
  "auth": "offline",

  "movement": {
    "enabled": true,
    "interval": 8,
    "moveDuration": 3,
    "sprint": true,
    "jumpOverObstacles": true,
    "avoidWalls": true,
    "wallDetectionDistance": 1.5,
    "turnArc": 120
  },

  "combat": {
    "enabled": true,
    "hostileOnly": true,
    "range": 4.5,
    "attackInterval": 1.0
  },

  "reconnect": {
    "enabled": true,
    "delay": 10,
    "maxAttempts": 0
  }
}
```

### Movement settings

| Setting | Description |
|---|---|
| `interval` | Seconds between each move cycle |
| `moveDuration` | How long each move lasts in seconds |
| `sprint` | Whether the bot sprints |
| `avoidWalls` | Enables wall detection and turning |
| `wallDetectionDistance` | How far ahead to check for walls (blocks) |
| `jumpOverObstacles` | Jump over 1-block tall obstacles |

### Combat settings

| Setting | Description |
|---|---|
| `hostileOnly` | Only attack hostile mobs (not animals) |
| `range` | Attack range in blocks |
| `attackInterval` | Seconds between attacks |

## In-Game Chat Commands

Type these in game chat to control the bot live:

| Command | Description |
|---|---|
| `!status` | Show bot health, food, and module status |
| `!move on/off` | Enable or disable movement |
| `!interval <seconds>` | Set movement interval |
| `!duration <seconds>` | Set how long each move lasts |
| `!sprint on/off` | Toggle sprinting |
| `!combat on/off` | Enable or disable combat |
| `!range <blocks>` | Set combat attack range |
| `!settings` | Show current settings summary |
| `!help` | List all commands |

## How Wall Detection Works

Every 500ms while moving, the bot scans the block ahead in its current direction. If it finds a solid wall it can't jump over, it checks all 8 compass directions for open space and turns toward the clearest path. This prevents the bot from getting stuck against walls, fences, or buildings.

## Keep-Alive Server

A small web server runs on port 2323 to keep the bot process alive on hosting platforms. Visit `http://localhost:2323/status` for uptime info.
