# Running the bot 24/7 on your own PC (or an old computer)

The simplest and most reliable free option: the bot is a normal Node.js process
(~150–250 MB RAM), so any machine that stays powered on can host it. No cloud
account, no card, no sleep timers, no egress limits.

Works on: a Windows PC/laptop, an old desktop or laptop, a Linux box, a
Raspberry Pi, even an Android phone (see [Part 8](#part-8--android-phone-termux-least-reliable)).

---

## New to this? Read this page first

You are doing **three** things, in this order:

1. **Get the bot's files onto the computer** that will run it → [Part 1](#part-1--get-the-code--read-this-first)
2. **Install one free program** it needs (Node.js) → [Part 0](#part-0--what-you-need-to-install)
3. **Start it, then stop the PC sleeping** → [Part 2](#part-2--first-run-test-it) and [Part 5](#part-5--stop-the-pc-from-sleeping-windows)

That is the whole task. Parts 3, 4, 6, 7 and 8 are optional extras
(auto-restart, auto-start at boot, watching it from your phone, Linux, Android).
You do **not** need them to get the bot online today.

### Every unfamiliar word, in plain English

| Word you'll see | What it actually means |
| --- | --- |
| **bot** | A fake Minecraft player. A program that logs into your Aternos server and wanders around, so the server doesn't shut down for being empty. |
| **Node.js** | The free program that *runs* the bot. Think of it like Java for a `.jar` file — without it, the bot's files are just text that does nothing. Install it once. |
| **npm** | Comes free with Node.js. It's the downloader that fetches the two helper libraries the bot needs. You never install those by hand. |
| **dependency / package** | A helper library the bot uses (`express` for the web page, `mineflayer` for talking to Minecraft). `npm ci` installs them. |
| **terminal / command line / PowerShell / Command Prompt** | A window where you *type* instructions instead of clicking buttons. You will type about 5 lines in total. Nothing in this guide can delete anything important. |
| **`git clone …`** | Downloads the whole project folder from GitHub in one command, so you don't have to click around the website. |
| **`localhost`** | "This computer". `localhost:3000` means *this computer, port 3000* — the bot's own web page. Open it in your browser like any normal website. |
| **dashboard** | That web page. It shows the bot's health and holds the settings plus the **Start bot** / **Stop bot** buttons. |
| **PM2** | An optional babysitter: if the bot ever crashes, PM2 starts it again. Not needed for your first run. |
| **sleep / hibernate** | Windows shutting itself down after being idle. A sleeping PC is not connected, so the bot goes offline. [Part 5](#part-5--stop-the-pc-from-sleeping-windows) fixes it. |

### Just want it running today? (Windows)

1. Install **Node.js LTS** from https://nodejs.org — during setup, **tick the box that says "Add to PATH"**. This step matters; skipping it is the #1 beginner problem.
2. Install **Git** from https://git-scm.com/downloads (or skip it and use the ZIP in [Part 1](#part-1--get-the-code--read-this-first)).
3. Press `Win`, type **PowerShell**, open it, and paste these five lines one at a time:

```powershell
cd $HOME\Desktop
git clone https://github.com/jzmops/aternos_afk.git
cd aternos_afk
npm ci
npm start
```

4. Open **http://localhost:3000** in your browser and continue from step 2 of [Part 2](#part-2--first-run-test-it).

> **No Git? No problem.** If installing Git or using `git clone` is a hassle, skip
> to [Part 1](#part-1--get-the-code--read-this-first) — Option B downloads the same
> files as a ZIP, needs no extra software, and works equally well.

### What each of those five lines did

| Line | Plain English |
| --- | --- |
| `cd $HOME\Desktop` | Move into your Desktop folder, so the project ends up somewhere you can actually find it. |
| `git clone …` | Download the bot's files from GitHub into a new folder called `aternos_afk`. |
| `cd aternos_afk` | Step *inside* that new folder. |
| `npm ci` | Download the two libraries the bot needs. Takes about a minute; a lot of text scrolls by — that's normal. |
| `npm start` | Start the bot. When you see `[WEB] AFK/BOT dashboard on http://localhost:3000`, it's alive. **Leave this window open.** |

To stop the bot: click the terminal window and press **Ctrl+C**.
To start it again later: open PowerShell, run `cd $HOME\Desktop\aternos_afk`, then `npm start`.

> **If any of this feels like too much — you don't have to do it yourself.**
> I can prepare a ready-to-run folder (or a ZIP) so the only step left on your PC
> is installing Node.js and double-clicking a file.

---

## Part 0 — What you need to install

| Software | Required? | Why | Where |
| --- | --- | --- | --- |
| **Node.js LTS (22.x)** | **Yes** | Everything here runs on Node. Tick **"Add to PATH"** during install. | https://nodejs.org/ |
| **Git** | Recommended | One-command download and updates (`git pull`). Optional — you can download a ZIP instead. | https://git-scm.com/downloads |
| **PM2** | Recommended | Restarts the bot automatically if it ever hard-crashes. Installed with one npm command (Part 3). | `npm install -g pm2` |

That's it. `express` and `mineflayer` are installed automatically by npm — you
never install those by hand. No Docker, no Python, no database.

**System requirements:** Windows 10/11 (64-bit), macOS, or any 64-bit Linux.

> **Old computer running Windows 7/8, or a 32-bit machine?** Node.js no longer
> supports it. Install a 64-bit Linux instead (Ubuntu Server or Debian) — see
> [Part 7](#part-7--linux-ubuntu-server--raspberry-pi). A very old PC runs Linux
> better than Windows anyway, and the bot needs very little.

**Check the install worked** — open a new terminal (PowerShell / Command Prompt)
and run:

```
node -v
npm -v
```

Both should print a version. If `node` is "not recognized", you skipped "Add to
PATH" — reinstall Node and tick that box, then open a *new* terminal.

---

## Part 1 — Get the code — read this first

Pick **one** of the two options below. They give you exactly the same files;
Option A is easier to update later, Option B needs no extra software.

**Option A — Git (recommended, easy to update later)**

```bash
git clone https://github.com/jzmops/aternos_afk.git
cd aternos_afk
npm ci
```

**Option B — no Git installed:** on the GitHub page click **Code → Download
ZIP**, extract it, then open a terminal **in that folder** (in File Explorer:
hold Shift, right-click the folder → *Open PowerShell window here*) and run:

```
npm ci
```

`npm ci` installs the exact dependency versions recorded in
`package-lock.json`. If it complains that the lockfile is missing, run
`npm install` instead.

---

## Part 2 — First run (test it)

In the project folder:

```
npm start
```

You should see:

```
[WEB] AFK/BOT dashboard on http://localhost:3000
```

Now:

1. Open **http://localhost:3000** in your browser.
2. **Server** panel: enter your Aternos address and port, username and auth mode.
   For this repo: `petergriffin420.aternos.me`, port `25679`.
3. **Behaviour** panel: walk/run bursts, wander radius, "Avoid deep water".
   Everything auto-saves into `config.json`.
4. **Start your Aternos server first** at https://aternos.org (an empty Aternos
   server is offline). The bot retries until it's up.
5. Press **Start bot** and watch the **Console** panel.

Stop it with `Ctrl+C` in the terminal.

> Windows may pop up a **Firewall** dialog the first time. If you only use the
> dashboard on this PC, you can pick *Cancel* — it's only needed for LAN access
> (Part 6). Allowing it on *Private networks* is fine too.

---

## Part 3 — Keep it running and auto-restart (PM2)

```
npm install -g pm2
pm2 start index.js --name afk-bot
pm2 save
```

Handy commands:

```
pm2 status              # running?
pm2 logs afk-bot        # live console output
pm2 restart afk-bot     # after changing code
pm2 stop afk-bot        # stop it
```

PM2 restarts the bot if the process ever crashes. (The bot also has its own
crash guard, so this is a second safety net.)

> `pm2 startup` **does not work on Windows** — use Part 4 for auto-start there.

---

## Part 4 — Start automatically when the PC boots

### Windows (Task Scheduler)

1. Create a file called `start-afk-bot.bat` in the project folder:

```bat
@echo off
cd /d "%~dp0"
call pm2 resurrect
```

2. Create a logon task that runs it — in an **Administrator** Command Prompt
   (adjust the path):

```cmd
schtasks /create /tn "AFK Bot" /sc ONLOGON /tr "C:\path\to\aternos_afk\start-afk-bot.bat" /f
```

Check / remove it:

```cmd
schtasks /query /tn "AFK Bot" /v /fo list
schtasks /delete /tn "AFK Bot" /f
```

**Easiest alternative:** press `Win+R`, type `shell:startup`, and drop a
shortcut to `start-afk-bot.bat` in the folder that opens.

Notes:

- This starts the bot **when you log in**, because PM2 runs in your user
  session. If you want it to run with nobody logged in, use a Windows service
  (e.g. NSSM) instead — but for a home PC, logon is fine.
- Windows updates can reboot the PC. With the task above, the bot comes back
  by itself after you log in again.
- Set your update *Active hours* so reboots don't happen while you're away, if
  you want maximum uptime.

### Linux

Use `pm2 startup` (it works there) or a systemd service — see
[Part 7](#part-7--linux-ubuntu-server--raspberry-pi).

---

## Part 5 — Stop the PC from sleeping (Windows)

An AFK bot in a sleeping PC is not connected. Run these in an **Administrator**
Command Prompt — they set the current power plan to never sleep, on both mains
power and battery:

```cmd
powercfg /change monitor-timeout-ac 0
powercfg /change monitor-timeout-dc 0
powercfg /change standby-timeout-ac 0
powercfg /change standby-timeout-dc 0
powercfg /change hibernate-timeout-ac 0
powercfg /change hibernate-timeout-dc 0
```

(You can also just go to *Settings → System → Power → Screen and sleep* and set
everything to **Never**, but the commands are faster and exact.)

**Laptop: make closing the lid harmless**

```cmd
powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
powercfg /setdcvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
powercfg /setactive SCHEME_CURRENT
```

Check what your machine supports:

```cmd
powercfg /a
```

If it lists **Standby (S0 Low Power Idle)**, the PC uses "Modern Standby", which
can keep some background activity going while the screen is off — but that is
not a guarantee your server keeps responding. Keeping it awake with the commands
above is the reliable path.

**macOS** (if that's your machine):

```bash
sudo pmset -a sleep 0 disablesleep 1
caffeinate -s   # alternative: run the bot under caffeinate
```

---

## Part 6 — Reach the dashboard from another device (optional)

Handy if the bot runs on a headless old PC and you want to watch it from your
laptop or phone. The dashboard already listens on all interfaces, so you only
need a firewall rule — in an **Administrator PowerShell**:

```powershell
New-NetFirewallRule -DisplayName "AFK Bot dashboard" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000 -Profile Private -RemoteAddress LocalSubnet
```

Find the PC's LAN address with `ipconfig` (look for *IPv4 Address*, e.g.
`192.168.1.50`), then open `http://192.168.1.50:3000` from any device on your
home network. Remove the rule later with:

```powershell
Remove-NetFirewallRule -DisplayName "AFK Bot dashboard"
```

> The dashboard has **no login**, so keep it on your home LAN. Don't forward the
> port on your router to the internet.

---

## Part 7 — Linux (Ubuntu Server / Raspberry Pi)

Install Node 22 and get the code:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git
git clone https://github.com/jzmops/aternos_afk.git
cd aternos_afk
npm ci
```

Create a service so it runs at boot and restarts on crash —
`sudo nano /etc/systemd/system/afk-bot.service`:

```ini
[Unit]
Description=AFK Minecraft bot
Wants=network-online.target
After=network-online.target

[Service]
Type=exec
User=ubuntu
WorkingDirectory=/home/ubuntu/aternos_afk
ExecStart=/usr/bin/node /home/ubuntu/aternos_afk/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Change `User=` and both paths to match your machine (on Raspberry Pi OS the user
is usually `pi`). Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now afk-bot.service
systemctl status afk-bot.service
journalctl -u afk-bot.service -f     # live logs
```

**Stop it sleeping / suspending:**

```bash
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
```

On a laptop, also ignore the lid switch — create
`/etc/systemd/logind.conf.d/60-lid.conf`:

```ini
[Login]
HandleLidSwitch=ignore
HandleLidSwitchExternalPower=ignore
HandleLidSwitchDocked=ignore
```

then reboot.

On a Raspberry Pi, screen blanking is *not* sleeping — the bot keeps running with
a blank screen. Disable it under *Preferences → Control Centre → Display →
Screen Blanking* if you want.

---

## Part 8 — Android phone (Termux, least reliable)

Doable if the "old computer" is really an old phone. Install **Termux** (and
**Termux:Boot** for auto-start) from F-Droid, then:

```bash
pkg update
pkg install nodejs-lts git
git clone https://github.com/jzmops/aternos_afk.git
cd aternos_afk
npm ci
termux-wake-lock        # keeps the CPU awake with the screen off
node index.js
```

Auto-start after a reboot: open Termux:Boot once, then create a script in
`~/.termux/boot/` that runs `termux-wake-lock` and then `node index.js`.

**Be realistic:** also exempt Termux from battery optimisation (Android
*Settings → Apps → Termux → Battery → Unrestricted*). Android can still reclaim
background processes, and Doze restricts networking. A phone is fine for casual
use, but a PC or Pi is far more dependable for 24/7.

---

## Part 9 — Everyday use

| Task | Command |
| --- | --- |
| Update to the latest code | `git pull && npm ci && pm2 restart afk-bot` |
| See live logs | `pm2 logs afk-bot` (Linux: `journalctl -u afk-bot -f`) |
| Dashboard | http://localhost:3000 (or `http://<LAN-IP>:3000`) |
| Aternos server offline | Start it at https://aternos.org — the bot reconnects by itself |

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `'node' is not recognized` | You didn't tick "Add to PATH" during install, or the terminal was open the whole time. Reinstall, then open a **new** terminal. |
| `Port 3000 is already in use` | Another copy of the bot is running (or another app uses 3000). Stop the other copy, or change the port in the dashboard's `config.json` (`webServer.port`). To override it just for one run: Windows CMD `set PORT=3001 && npm start`, PowerShell `$env:PORT=3001; npm start`, macOS/Linux `PORT=3001 npm start`. |
| Bot logs reconnect attempts forever | Your Aternos server is offline — start it at aternos.org. Retrying is expected. |
| Dashboard looks stale after an update | Hard refresh (Ctrl/Cmd+Shift+R) to clear the old service worker. |
| Dashboard unreachable from another device | The firewall rule (Part 6) must exist, the PC must be awake, and *Private* network profile must match your home network. |
| Machine slept overnight / bot disconnected | Redo the power settings in Part 5 and check `powercfg /a`. |
| Windows update rebooted the PC | Expected; the logon task (Part 4) restarts the bot. Check `pm2 status` after logging in. |

---

## Is my machine good enough?

Almost certainly. The bot uses ~150–250 MB RAM and a fraction of one CPU core.
A 10-year-old desktop, a laptop, or a Raspberry Pi 3/4/5 is plenty. The only
real requirements are: **it stays powered on**, **it doesn't sleep**, and it can
reach the internet.
