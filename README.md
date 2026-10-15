# AFK/BOT

An AFK bot for Minecraft Java servers (made for **Aternos**) with a dark
terminal-style web dashboard. The bot wanders around — walking, sprinting,
jumping, sneaking and looking around — fights nearby hostile mobs and
reconnects on its own if the server restarts.

## Features

- **Adjustable walking & running** — set how long each walk burst lasts, how
  long each sprint burst lasts, how often it runs instead of walking, and how
  long it pauses in between
- **Mob combat** — hunts hostile mobs inside the attack range, paths to them,
  attacks on cooldown, jump-crits when enabled and auto-equips the best weapon
- **Avoids deep water** — turns away from oceans, lakes and rivers (and swims
  back to shore if it ever ends up in one); shallow puddles are ignored
- **Live wander radius** — the bot stays near where it spawned
- **Wall & stuck detection** — scans ahead, hops over 1-block obstacles and
  turns toward open space when it gets blocked
- **Auto reconnect** — rejoins after a kick, a timeout or an Aternos restart
- **Live dashboard** — server address/port, behaviour controls, live stats and
  a streaming console where you can send chat or `/commands` as the bot
- **AuthMe support** — optionally sends `/register` + `/login` on join

## Setup

**One file, no commands:** install [Node.js](https://nodejs.org) LTS — ticking
**"Add to PATH"** on Windows — then

- **Windows:** double-click **`start.bat`**
- **Linux / macOS / Raspberry Pi:** run **`./start.sh`**

That downloads the dependencies on the first run, starts the dashboard, opens it
in your browser and connects the bot for you. Nothing else to type.

**Or by hand:**

```bash
npm install
npm start
```

Then open <http://localhost:3000> (or set `PORT` to use a different port, for
example `PORT=3002 npm start`). The launchers hand the bot straight to the
server; if you would rather it wait for the **Start bot** button, run them with
`AFK_NO_AUTOSTART=1` set.

**Windows, start at login:** double-click **`install-autostart.bat`** once. It
adds the bot to your Startup folder — no PM2 and no Administrator prompt — and
`remove-autostart.bat` undoes it.

1. Type your server address and port in the **Server** panel
2. Adjust **Behaviour** (movement, combat, reconnect)
3. Everything saves as you edit — the chip in the Behaviour panel shows
   `Saved` / `Unsaved changes`; **Save config** saves immediately
4. Hit **Start bot**

Edits are also kept in the browser while a save is in flight, so reloading the
page can never lose what you just typed. If the bot is connected the panel
locks itself — stop the bot to change settings.

Stop the bot before editing settings — the panel locks itself while the bot is
connected, so a running session is never changed underneath you.

## config.json

The dashboard writes this file, but you can edit it by hand too:

```json
{
  "ip": "yourserver.aternos.me",
  "port": 25679,
  "name": "your_bot_name",
  "version": "auto",
  "auth": "offline",
  "authmePassword": "",

  "movement": {
    "enabled": true,
    "walkTime": 4,
    "runTime": 6,
    "runShare": 60,
    "pause": 6,
    "wanderRadius": 24,
    "avoidWalls": true,
    "jumpOverObstacles": true,
    "avoidWater": true
  },

  "combat": {
    "enabled": true,
    "hostileOnly": true,
    "range": 16,
    "crits": true,
    "autoEquip": true
  },

  "reconnect": {
    "enabled": true,
    "delay": 5,
    "maxAttempts": 0
  },

  "webServer": {
    "enabled": true,
    "port": 3000
  }
}
```

### How much it walks and runs

| Setting | Description |
|---|---|
| `walkTime` | Seconds spent walking per burst (`0` disables walking) |
| `runTime` | Seconds spent sprinting per burst (`0` disables running) |
| `runShare` | Chance (0–100 %) that the next burst is a run instead of a walk |
| `pause` | Seconds of standing around between bursts |
| `wanderRadius` | How far the bot may drift from its spawn point (`0` = unlimited) |
| `avoidWalls` | Turn toward open space instead of pushing into walls |
| `jumpOverObstacles` | Hop over 1-block obstacles |
| `avoidWater` | Turn away from large bodies of water (oceans, lakes, rivers) |

So a bot with `walkTime: 4`, `runTime: 6`, `runShare: 60` and `pause: 6` walks
4 s or runs 6 s (60 % of the bursts are runs), then idles for about 6 s.

### Combat and connection

| Setting | Description |
|---|---|
| `hostileOnly` | Only attack hostile mobs, ignore animals |
| `range` | How far away a mob is noticed (blocks) |
| `crits` | Jump before hitting for critical hits |
| `autoEquip` | Equip the best sword/axe in the inventory |
| `reconnect.enabled` | Reconnect automatically after a disconnect |
| `reconnect.delay` | Seconds to wait between reconnect attempts |
| `reconnect.maxAttempts` | Give up after N attempts (`0` = retry forever) |
| `version` | `auto` pings the server, or pin one, e.g. `1.21.4` |

## Dashboard API

The dashboard talks to the bot over a small JSON API (all on the same port):

| Route | Description |
|---|---|
| `GET /api/state` | Live bot state (health, food, position, players, target, kills/crits, uptime, reconnects) |
| `GET /api/config` / `POST /api/config` | Read / update settings (persisted to `config.json`) |
| `POST /api/start` / `POST /api/stop` | Start or stop the bot |
| `POST /api/command` | `{"message": "hi"}` — send chat or a `/command` as the bot |
| `GET /api/events` | Server-sent events: console log lines + state push |

## Hosting it 24/7

The bot needs a normal Node.js process, so anything that runs Node works. Set
the platform's port through the `PORT` environment variable — the dashboard web
server doubles as the keep-alive endpoint, so it stays reachable as long as that
web service is up.

**Watch out on free tiers:** Render, Koyeb and Railway all suspend an idle
service, and this bot's traffic is an *outbound* Minecraft connection that they
do not count — so a "free" web service falls asleep and takes the bot with it.
Free options that are genuinely always-on:

- **Your own PC, an old computer or a Raspberry Pi** — the simplest $0 option.
  Step-by-step guide: **[RUN_LOCALLY.md](RUN_LOCALLY.md)**.
- **Oracle Cloud Always Free** — a real always-on VM for $0. Step-by-step guide:
  **[DEPLOY.md](DEPLOY.md)**.
- **A paid VPS** ($5/mo) under PM2 or systemd, if you want zero caveats.

Aternos servers still have to be started by their owner; the bot reconnects on
its own once the server is online.

## Project layout

| File | What it does |
|---|---|
| `index.js` | Bot engine: movement, combat, reconnect, stats, console log buffer |
| `keep_alive.js` | Express web server: dashboard + JSON/SSE API |
| `public/index.html` | The dashboard (single file, no build step) |
| `config.json` | Saved settings |
| `start.bat` / `start.sh` | One-click start for Windows / Linux, macOS and Raspberry Pi |
| `install-autostart.bat` / `remove-autostart.bat` | Windows: make the bot start at login, and undo it (no PM2, no admin rights) |
| `scripts/launch.js` | What those two run: checks Node.js, installs dependencies, opens the dashboard, connects the bot |
