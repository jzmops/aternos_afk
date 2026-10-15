/**
 * AFK/BOT — web dashboard + HTTP API.
 *
 * Serves public/ and exposes a small JSON API used by the dashboard. It also
 * keeps the process busy so hosting platforms (Render, Railway, Replit,
 * Fly.io, a VPS…) don't idle the bot out.
 */

const express = require("express");
const path = require("path");
const bot = require("./index.js");

const config = bot.getConfig();
const PORT = Number(process.env.PORT) || (config.webServer && config.webServer.port) || 3000;

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));

// Live data must never be cached by browsers, service workers or proxies —
// a cached config used to make saved settings look like they were lost.
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

app.use(
  express.static(path.join(__dirname, "public"), {
    etag: false,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html") || filePath.endsWith(".js") || filePath.endsWith(".json")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      }
    },
  })
);

/* ------------------------------------------------------------------- status */

app.get("/api/state", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(bot.getState());
});

// legacy endpoint
app.get("/status", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    status: "online",
    uptime: process.uptime(),
    memory: Math.round(process.memoryUsage().rss / 1024 / 1024) + "MB",
    bot: bot.getState(),
  });
});

/* ------------------------------------------------------------------- config */

app.get("/api/config", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(bot.getConfig());
});

app.post("/api/config", (req, res) => {
  try {
    res.json({ ok: true, config: bot.updateConfig(req.body) });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message });
  }
});

/* ------------------------------------------------------------- bot controls */

app.post("/api/start", (req, res) => {
  const result = bot.startBotProcess();
  res.status(result.ok ? 200 : 400).json(result);
});

app.post("/api/stop", (req, res) => {
  res.json(bot.stopBotProcess());
});

app.post("/api/command", (req, res) => {
  const result = bot.sendMessage(req.body && req.body.message);
  res.status(result.ok ? 200 : 400).json(result);
});

/* ------------------------------------------------------- live console (SSE) */

app.get("/api/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 2000\n\n");

  const send = (payload) => {
    try {
      res.write("data: " + JSON.stringify(payload) + "\n\n");
    } catch (err) {}
  };

  send({ type: "logs", logs: bot.getLogs() });
  send({ type: "state", state: bot.getState(), config: bot.getConfig() });

  const unsubscribe = bot.onLog((entry) => send({ type: "log", log: entry }));
  const stateTimer = setInterval(() => send({ type: "state", state: bot.getState() }), 1000);
  const keepAlive = setInterval(() => {
    try {
      res.write(": keep-alive\n\n");
    } catch (err) {}
  }, 20000);

  req.on("close", () => {
    clearInterval(stateTimer);
    clearInterval(keepAlive);
    unsubscribe();
  });
});

/* --------------------------------------------------------------------- boot */

app.get("*", (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

if (config.webServer && config.webServer.enabled === false) {
  console.log("[WEB] Dashboard disabled in config.json (webServer.enabled = false)");
} else {
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log("[WEB] AFK/BOT dashboard on http://localhost:" + PORT);
  });

  // Never let a socket problem take the process down silently. Without this a
  // port already in use (a stale copy of the bot still running) leaves the
  // dashboard unreachable with no explanation.
  server.on("error", (err) => {
    if (err && err.code === "EADDRINUSE") {
      console.error(
        "[WEB] Port " + PORT + " is already in use — another copy of the bot is probably running." +
          " Stop it (or set PORT to a free port) and start again."
      );
    } else {
      console.error("[WEB] Web server error: " + (err && err.message ? err.message : String(err)));
    }
  });
}
