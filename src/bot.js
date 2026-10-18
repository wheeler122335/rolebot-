const { Client, GatewayIntentBits } = require("discord.js");

function createBot() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
    ],
  });

  client.once("ready", () => {
    const expectedId = process.env.DISCORD_APPLICATION_ID;
    if (expectedId && client.user.id !== expectedId) {
      console.error(`The configured token belongs to bot ${client.user.id}, not the expected application ${expectedId}.`);
      client.destroy();
      process.exit(1);
    }
    console.log(`Bot logged in as ${client.user.tag}`);
  });

  return client;
}

function serializeGuild(guild) {
  return {
    id: guild.id,
    name: guild.name,
    icon: guild.iconURL({ size: 64, extension: "png" }),
    memberCount: guild.memberCount,
  };
}

function serializeMember(member) {
  return {
    id: member.id,
    username: member.user.username,
    displayName: member.displayName,
    avatar: member.displayAvatarURL({ size: 64, extension: "png" }),
    bot: member.user.bot,
    roleIds: [...member.roles.cache.keys()].filter((id) => id !== member.guild.id),
  };
}

function serializeRole(role, botMember) {
  const botTop = botMember?.roles.highest;
  const assignable =
    Boolean(botMember) &&
    !role.managed &&
    role.id !== role.guild.id &&
    Boolean(botTop) &&
    botTop.comparePositionTo(role) > 0;

  return {
    id: role.id,
    name: role.name,
    color: role.hexColor === "#000000" ? "#99aab5" : role.hexColor,
    position: role.position,
    managed: role.managed,
    assignable,
  };
}

function getAssignableRole(guild, roleId) {
  const role = guild.roles.cache.get(roleId);
  const botMember = guild.members.me;
  if (!role || !botMember) return { error: "Role not found." };
  if (role.id === guild.id) return { error: "Cannot assign @everyone." };
  if (role.managed) return { error: "That role is managed by Discord or an integration." };
  if (botMember.roles.highest.comparePositionTo(role) <= 0) {
    return { error: "Move the bot's role above this role in Server Settings → Roles." };
  }
  if (!botMember.permissions.has("ManageRoles")) {
    return { error: "The bot needs the Manage Roles permission." };
  }
  return { role };
}

async function listMembers(guild, query) {
  const q = (query || "").trim();
  if (q) {
    const found = await guild.members.fetch({ query: q, limit: 50 });
    return [...found.values()].map(serializeMember);
  }

  await guild.members.fetch({ limit: 100 }).catch(() => {});
  return [...guild.members.cache.values()]
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .slice(0, 100)
    .map(serializeMember);
}

module.exports = {
  createBot,
  serializeGuild,
  serializeMember,
  serializeRole,
  getAssignableRole,
  listMembers,
};
