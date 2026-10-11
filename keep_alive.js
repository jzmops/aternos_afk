const express = require("express");
const app = express();
const port = 2323;

app.get("/", (req, res) => {
  res.send("Bot is running!");
});

app.get("/status", (req, res) => {
  res.json({
    status: "online",
    uptime: process.uptime(),
    memory: Math.round(process.memoryUsage().rss / 1024 / 1024) + "MB",
  });
});

app.listen(port, () => console.log(`[BOT] Keep-alive server on port ${port}`));
