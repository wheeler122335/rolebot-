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

function requireAuth(req, res, next) {
  const token = req.cookies.rolebot_session;
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: "Not logged in." });
  }
  next();
}

async function getGuild(client, guildId) {
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  return guild;
}

function createServer(client) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(express.static(path.join(__dirname, "..", "public")));

  app.post("/api/login", (req, res) => {
    const password = String(req.body?.password || "");
    if (!process.env.DASHBOARD_PASSWORD || password !== process.env.DASHBOARD_PASSWORD) {
      return res.status(401).json({ error: "Wrong password." });
    }
    const token = crypto.randomBytes(32).toString("hex");
    sessions.add(token);
    res.cookie("rolebot_session", token, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ ok: true });
  });

  app.post("/api/logout", (req, res) => {
    const token = req.cookies.rolebot_session;
    if (token) sessions.delete(token);
    res.clearCookie("rolebot_session");
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
