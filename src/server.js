const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const {
  serializeGuild,
  serializeMember,
  serializeRole,
  getAssignableRole,
  listMembers,
} = require("./bot");

const sessions = new Set();
const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;

function requireAuth(req, res, next) {
  const token = req.cookies.rolebot_session;
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: "Not logged in." });
  }
  next();
}

function limitLoginAttempts(req, res, next) {
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const attempt = loginAttempts.get(key);
  if (!attempt || now - attempt.startedAt >= LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { startedAt: now, count: 1 });
    return next();
  }
  if (attempt.count >= MAX_LOGIN_ATTEMPTS) {
    const retryAfter = Math.ceil((LOGIN_WINDOW_MS - (now - attempt.startedAt)) / 1000);
    res.set("Retry-After", String(retryAfter));
    return res.status(429).json({ error: "Too many login attempts. Try again later." });
  }
  attempt.count += 1;
  next();
}

async function getGuild(client, guildId) {
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  return guild;
}

function createServer(client) {
  const app = express();
  if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);
  app.use(express.json());
  app.use(cookieParser());
  app.use(express.static(path.join(__dirname, "..", "public")));

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/status", (_req, res) => {
    const user = client.user;
    res.json({
      name: process.env.BOT_DISPLAY_NAME || user?.username || "Zyntra Bot",
      bot: user ? { id: user.id, tag: user.tag, avatar: user.displayAvatarURL({ size: 64 }) } : null,
    });
  });

  app.post("/api/login", limitLoginAttempts, (req, res) => {
    const password = String(req.body?.password || "");
    if (!process.env.DASHBOARD_PASSWORD || password !== process.env.DASHBOARD_PASSWORD) {
      return res.status(401).json({ error: "Wrong password." });
    }
    loginAttempts.delete(req.ip || req.socket.remoteAddress || "unknown");
    const token = crypto.randomBytes(32).toString("hex");
    sessions.add(token);
    res.cookie("rolebot_session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ ok: true });
  });

  app.post("/api/logout", (req, res) => {
    const token = req.cookies.rolebot_session;
    if (token) sessions.delete(token);
    res.clearCookie("rolebot_session", { sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    res.json({ ok: true });
  });

  app.get("/api/me", requireAuth, (_req, res) => {
    res.json({
      bot: client.user
        ? { id: client.user.id, tag: client.user.tag, avatar: client.user.displayAvatarURL({ size: 64 }) }
        : null,
    });
  });

  app.get("/api/guilds", requireAuth, (_req, res) => {
    const guilds = [...client.guilds.cache.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(serializeGuild);
    res.json({ guilds });
  });

  app.get("/api/guilds/:guildId/members", requireAuth, async (req, res) => {
    try {
      const guild = await getGuild(client, req.params.guildId);
      if (!guild) return res.status(404).json({ error: "Server not found." });
      const members = await listMembers(guild, req.query.q);
      res.json({ members });
    } catch (err) {
      res.status(500).json({ error: err.message || "Could not load members." });
    }
  });

  app.get("/api/guilds/:guildId/roles", requireAuth, async (req, res) => {
    try {
      const guild = await getGuild(client, req.params.guildId);
      if (!guild) return res.status(404).json({ error: "Server not found." });
      await guild.members.fetchMe();
      const botMember = guild.members.me;
      const roles = [...guild.roles.cache.values()]
        .filter((role) => role.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .map((role) => serializeRole(role, botMember));
      res.json({ roles });
    } catch (err) {
      res.status(500).json({ error: err.message || "Could not load roles." });
    }
  });

  app.get("/api/guilds/:guildId/channels", requireAuth, async (req, res) => {
    try {
      const guild = await getGuild(client, req.params.guildId);
      if (!guild) return res.status(404).json({ error: "Server not found." });
      const channels = [...guild.channels.cache.values()]
        .filter((channel) => channel.isTextBased() && channel.isSendable())
        .map((channel) => ({ id: channel.id, name: channel.name, type: channel.type }))
        .sort((a, b) => a.name.localeCompare(b.name));
      res.json({ channels });
    } catch (err) {
      res.status(500).json({ error: err.message || "Could not load channels." });
    }
  });

  app.post("/api/guilds/:guildId/channels/:channelId/messages", requireAuth, async (req, res) => {
    try {
      const guild = await getGuild(client, req.params.guildId);
      if (!guild) return res.status(404).json({ error: "Server not found." });
      const channel = await guild.channels.fetch(req.params.channelId);
      if (!channel || !channel.isTextBased() || !channel.isSendable()) {
        return res.status(400).json({ error: "Choose a sendable text channel." });
      }
      const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
      if (!message) return res.status(400).json({ error: "Message cannot be empty." });
      if (message.length > 2000) return res.status(400).json({ error: "Messages can be at most 2,000 characters." });
      const me = guild.members.me || await guild.members.fetchMe();
      if (!channel.permissionsFor(me)?.has("SendMessages")) {
        return res.status(403).json({ error: "The bot cannot send messages in that channel." });
      }
      await channel.send({ content: message, allowedMentions: { parse: [] } });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message || "Could not send message." });
    }
  });

  app.put("/api/guilds/:guildId/members/:memberId/roles/:roleId", requireAuth, async (req, res) => {
    try {
      const guild = await getGuild(client, req.params.guildId);
      if (!guild) return res.status(404).json({ error: "Server not found." });

      const assigned = Boolean(req.body?.assigned);
      const { role, error } = getAssignableRole(guild, req.params.roleId);
      if (error) return res.status(400).json({ error });

      const member = await guild.members.fetch(req.params.memberId);
      if (assigned) {
        await member.roles.add(role, "Assigned from Rolebot dashboard");
      } else {
        await member.roles.remove(role, "Removed from Rolebot dashboard");
      }

      const fresh = await guild.members.fetch({ user: member.id, force: true });
      res.json({ member: serializeMember(fresh) });
    } catch (err) {
      res.status(500).json({ error: err.message || "Could not update role." });
    }
  });

  app.get("*", (_req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "index.html"));
  });

  return app;
}

module.exports = { createServer };
