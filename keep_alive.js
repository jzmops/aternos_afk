const express = require("express");
const path = require("path");
const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public"), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".html")) {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    }
  }
}));

app.get("/status", (req, res) => {
  const main = require("./index.js");
  res.json({
    status: "online",
    uptime: process.uptime(),
    memory: Math.round(process.memoryUsage().rss / 1024 / 1024) + "MB",
    bot: main.getBotState ? main.getBotState() : null,
  });
});

app.post("/api/start", (req, res) => {
  const main = require("./index.js");
  if (main.startBotProcess) {
    main.startBotProcess();
    res.json({ ok: true, message: "Bot starting..." });
  } else {
    res.status(500).json({ ok: false, message: "Bot control unavailable" });
  }
});

app.post("/api/stop", (req, res) => {
  const main = require("./index.js");
  if (main.stopBotProcess) {
    main.stopBotProcess();
    res.json({ ok: true, message: "Bot stopping..." });
  } else {
    res.status(500).json({ ok: false, message: "Bot control unavailable" });
  }
});

app.get("*", (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => console.log(`[BOT] Web dashboard running on port ${port}`));
