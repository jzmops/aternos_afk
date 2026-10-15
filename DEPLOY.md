# Deploying the AFK bot on Oracle Cloud (Always Free)

A complete, copy-paste guide to running this bot 24/7 on Oracle Cloud's
permanently free tier — including the firewall, SSH and auto-restart steps that
most guides leave out.

> **Why Oracle?** It is the only widely available host that gives you a real
> always-on VM for $0 with no sleep timer. Render/Koyeb/Railway free tiers all
> suspend an idle process; a bot holding a Minecraft connection looks idle to
> them. See [Other free options](#other-free-options) below.

---

## Part 0 — What you need on your PC

**Almost nothing.** You do not need to install the bot, Node.js or Git on your
own computer — everything runs on the VM.

| Need | Windows 10/11 | macOS / Linux |
| --- | --- | --- |
| SSH client | **Built in.** Open *PowerShell* or *Windows Terminal* and run `ssh -V` — if it prints a version you're ready. | Built in (`ssh -V`). |
| Browser | Any (for the Oracle console). | Any. |
| Phone + debit/credit card | For Oracle identity verification (temporary hold, not charged). | Same. |

**Optional extras (not required):**

- **PuTTY + PuTTYgen** — only if you prefer a GUI over the command line for
  SSH. PuTTY cannot read Oracle's `.key` file directly, so you must convert it
  in PuTTYgen (*Load* the `.key` → *Save private key* as `.ppk`).
- **Git for Windows** — only if you want to edit the code on your own PC.
  The install on the VM uses `git` there, not here.
- **Termius / Windows Terminal** — nicer terminal, purely cosmetic.

If `ssh -V` errors, install the *OpenSSH Client* optional feature:
*Settings → System → Optional features → Add a feature → OpenSSH Client*.

---

## Part 1 — Create your Oracle Cloud account

1. Go to **https://www.oracle.com/cloud/free/** and click **Start for free**.
2. Fill in email, password and country.
3. **Choose your "Home Region" carefully.** It is permanent — Oracle does not
   let you change it later, and Always Free compute must live in your home
   region. Pick the region geographically closest to you.
4. Verify your email, then complete phone verification.
5. Add a **credit or debit card** for identity verification. A small temporary
   hold may appear and is refunded automatically — the card is *not* charged
   unless you deliberately upgrade to Pay-As-You-Go.
   *(Oracle says "most users" need a card; some signups complete without one.)*
6. Sign in at **https://cloud.oracle.com**. Check the region shown in the top
   bar matches the home region you picked.

**Free forever?** Yes — the 30-day $300 trial expiring does **not** delete
Always Free resources. But note two things:

- Leave the account untouched for **30+ days** and Oracle may treat it as
  abandoned.
- Idle Always Free instances **can be reclaimed** — see
  [Part 9](#part-9--avoiding-idle-reclamation).

---

## Part 2 — Create the VM

**Which shape?** The bot is tiny (Node + mineflayer ≈ 150–250 MB RAM), so either
works:

| Shape | Always Free allowance | Notes |
| --- | --- | --- |
| `VM.Standard.E2.1.Micro` (x86) | **2 instances**, 1 GB RAM, 1/8 OCPU each | **Easiest to actually get.** Recommended. |
| `VM.Standard.A1.Flex` (Arm/Ampere) | **2 OCPU + 12 GB RAM total** (reduced from 4/24 in June 2026) | More headroom, but frequently returns *"Out of host capacity"*. |

Steps:

1. Menu ☰ → **Compute → Instances → Create instance**.
2. **Name:** `afk-bot`.
3. **Image:** **Canonical Ubuntu 24.04 LTS** (use the regular image, *not*
   "Minimal Ubuntu"). Pick the `x86_64` build for the Micro shape, `aarch64`
   for Ampere A1.
4. **Shape:** *Change shape* → **Virtual machine** →
   `VM.Standard.E2.1.Micro` (marked *Always Free eligible*).
5. **Networking:** keep **Create new virtual cloud network** +
   **Create new public subnet**, and make sure
   **Assign a public IPv4 address = Yes**.
6. **Add SSH keys:** choose **Generate a key pair for me** and click
   **Save private key** / **Save public key**.
   ⚠️ **Download the private key now** — Oracle cannot show it to you again.
   Keep the `.key` file safe; anyone with it can log into your VM.
7. **Boot volume:** leave the default (47 GB minimum, inside the 200 GB free
   allowance).
8. Click **Create** and wait for the state to become **Running**.
9. Copy the **Public IP address** from the instance page.

> **"Out of host capacity" on Ampere A1?** Try the other availability domains
> (Edit → move to a different AD), retry later, or just use the Micro shape —
> it's plenty for this bot.

---

## Part 3 — Connect from your PC

Open **PowerShell** and put the key somewhere private:

```powershell
New-Item -ItemType Directory -Force "$HOME\.ssh" | Out-Null
Move-Item "$HOME\Downloads\ssh-key-*.key" "$HOME\.ssh\oci.key"
```

Then connect (replace `<PUBLIC_IP>`):

```powershell
ssh -i "$HOME\.ssh\oci.key" ubuntu@<PUBLIC_IP>
```

Type `yes` at the fingerprint prompt. You should land in a shell as `ubuntu`.

**If Windows says `UNPROTECTED PRIVATE KEY FILE!` / `bad permissions`** — Windows
ACLs are too open, so OpenSSH refuses the key. Fix it:

```powershell
icacls.exe "$HOME\.ssh\oci.key" /inheritance:r
icacls.exe "$HOME\.ssh\oci.key" /grant:r "$($env:USERNAME):(R)"
```

macOS/Linux equivalent: `chmod 600 ~/.ssh/oci.key`.

---

## Part 4 — Install Node.js and the bot

Run these **on the VM** (in the SSH session):

```bash
sudo apt update && sudo apt upgrade -y

# Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git
node -v && npm -v          # expect v22.x

# Get the bot
git clone https://github.com/jzmops/aternos_afk.git
cd aternos_afk
npm ci --omit=dev

# Smoke test — should print the dashboard URL, then Ctrl+C
node index.js
```

---

## Part 5 — Run it as a service (survives crashes and reboots)

```bash
sudo npm install -g pm2
cd ~/aternos_afk
pm2 start index.js --name afk-bot
pm2 save

# Enable start-on-boot: copy the command it prints and run it with sudo
pm2 startup systemd -u ubuntu --hp /home/ubuntu
```

Handy:

```bash
pm2 status          # is it running?
pm2 logs afk-bot    # live console
pm2 restart afk-bot # after a config change outside the dashboard
```

PM2 restarts the bot if it ever crashes, and the `startup` line brings it back
after the VM reboots.

---

## Part 6 — Open the dashboard (recommended: SSH tunnel)

The dashboard has **no login**, so anyone who reaches the port can start/stop
your bot and change its settings. The safe way in is an SSH tunnel — no public
port, no firewall changes:

```powershell
ssh -i "$HOME\.ssh\oci.key" -N -L 127.0.0.1:3000:127.0.0.1:3000 ubuntu@<PUBLIC_IP>
```

Leave that window open and browse to **http://localhost:3000**.

(Prefer a permanent URL instead? See [Part 8](#part-8--optional-expose-the-dashboard-publicly).)

---

## Part 7 — Configure and start the bot

1. In the dashboard, **Server** panel: address, port, username, version
   (`auto`), auth mode. For this repo's Aternos server that's
   `petergriffin420.aternos.me`, port `25679`.
2. **Behaviour** panel: walk/run bursts, wander radius, "Avoid deep water".
   Settings auto-save into `config.json` on the VM.
3. **Start the Aternos server first** at https://aternos.org (an empty Aternos
   server is offline; the bot will just retry). Then press **Start bot**.
4. Watch the **Console** panel — it should connect, spawn and start moving.

---

## Part 8 — Optional: expose the dashboard publicly

Only do this if you accept the risk, and **restrict the source to your own IP**.

**Layer 1 — Oracle network:** Networking → Virtual Cloud Networks → your VCN →
**Security Lists → Default Security List → Add Ingress Rules**

| Field | Value |
| --- | --- |
| Source Type | CIDR |
| Source CIDR | *your IP*`/32` (not `0.0.0.0/0`) |
| IP Protocol | TCP |
| Destination Port Range | `3000` |

**Layer 2 — the VM's own firewall.** Oracle's Ubuntu images ship with an
`iptables` INPUT chain that drops everything except SSH, so the cloud rule above
alone will *not* work:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3000 -j ACCEPT
sudo netfilter-persistent save
sudo netfilter-persistent reload

# verify the ACCEPT rule sits above the final REJECT/DROP
sudo iptables -L INPUT -n --line-numbers
```

Then browse to `http://<PUBLIC_IP>:3000`.

> If your image uses **ufw** instead: `sudo ufw allow 22/tcp && sudo ufw allow
> 3000/tcp && sudo ufw enable`. Use one firewall tool, not both.

---

## Part 9 — Avoiding idle reclamation

Oracle may reclaim an Always Free instance that looks idle. The published test
is **all** of these being true over a **7-day** window:

- CPU utilisation 95th percentile **below 20%**
- network utilisation **below 20%**
- memory utilisation **below 20%** *(Ampere A1 only)*

A mostly-standing-still AFK bot can fall under those thresholds. Mitigations:

- **Upgrade the account to Pay-As-You-Go.** Always Free shapes stay $0, and
  community reports say reclamation no longer applies — Oracle does **not**
  document this explicitly, so verify it on your own tenancy before relying on
  it.
- Keep the instance genuinely busy (the bot moving/fighting helps a little, but
  this is not a guarantee).
- Log in to the Oracle console occasionally so the account isn't treated as
  abandoned.

---

## Secrets: don't commit your Aternos password

`config.json` is **tracked in this repo**, and the dashboard writes your
settings — including `authmePassword` — into it.

- Setting the password through the dashboard on the VM is fine (it stays on the
  VM).
- **Do not `git commit` / `git push` a `config.json` that contains a real
  password** — this repo is public.
- If you need the password in version control, move it to an environment
  variable instead.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Out of host capacity` when creating A1 | Different availability domain, retry later, or use `VM.Standard.E2.1.Micro`. |
| `UNPROTECTED PRIVATE KEY FILE!` | Run the `icacls` commands in Part 3. |
| Can't reach the dashboard by IP | Both firewall layers must be open (Part 8), and the app must be running (`pm2 status`). The SSH tunnel (Part 6) avoids this entirely. |
| Bot logs reconnect attempts forever | The Aternos server is offline — start it at aternos.org. Retrying is expected. |
| Bot or dashboard died | `pm2 status`, `pm2 logs afk-bot`, `pm2 restart afk-bot`. |
| Dashboard shows an old config | Hard-refresh (Ctrl/Cmd+Shift+R) to drop a stale service worker. |
| Locked out of SSH | Use the Oracle console's *Cloud Shell* / serial console to fix the iptables rules. |

---

## Other free options

| Host | Free? | Always on? |
| --- | --- | --- |
| **Oracle Cloud** (this guide) | Yes, forever | Yes (with the idle-reclaim caveat) |
| Google Cloud e2-micro | Yes | Yes, but only 1 GB/month North America egress — a connected Minecraft bot likely exceeds it |
| Northflank free Sandbox | Yes (card required) | Advertised no sleeping, but explicitly not for production |
| Koyeb / Render / Railway free | Yes-ish | **No** — scales to zero / spins down on inactivity |
| Fly.io | No free tier for new accounts | — |
| Spare PC / Raspberry Pi at home | Yes | Yes — the simplest $0 option if you have spare hardware |
