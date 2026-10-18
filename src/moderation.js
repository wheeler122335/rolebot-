const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const PREFIX = "*";

class ModerationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function parseDuration(value) {
  const match = /^(\d+)(s|m|h|d)$/i.exec(value || "");
  if (!match) return null;
  const amount = Number(match[1]);
  const unitMs = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2].toLowerCase()];
  return amount * unitMs;
}

async function performModerationAction(guild, member, action, options = {}) {
  const permissionByAction = {
    ban: "BanMembers",
    kick: "KickMembers",
    mute: "ModerateMembers",
    unmute: "ModerateMembers",
  };
  const permission = permissionByAction[action];
  if (!permission) throw new ModerationError("Choose ban, kick, mute, or unmute.");

  const botMember = guild.members.me || await guild.members.fetchMe();
  if (!botMember.permissions.has(permission)) {
    throw new ModerationError(`The bot needs the ${permission} permission.`, 403);
  }
  if (member.id === guild.ownerId) throw new ModerationError("The server owner cannot be moderated.", 403);
  if (member.id === botMember.id) throw new ModerationError("The bot cannot moderate itself.", 400);

  const auditReason = `${options.actorLabel || "Zyntra Bot"}${options.reason ? `: ${options.reason}` : ""}`.slice(0, 512);
  if (action === "ban") {
    if (!member.bannable) throw new ModerationError("The bot cannot ban this member. Check the bot's role position and permissions.", 403);
    await member.ban({ reason: auditReason });
    return `Banned ${member.user.tag}.`;
  }
  if (action === "kick") {
    if (!member.kickable) throw new ModerationError("The bot cannot kick this member. Check the bot's role position and permissions.", 403);
    await member.kick(auditReason);
    return `Kicked ${member.user.tag}.`;
  }
  if (action === "mute") {
    const durationMs = Number(options.durationMs);
    if (!Number.isFinite(durationMs) || durationMs < 1000 || durationMs > MAX_TIMEOUT_MS) {
      throw new ModerationError("Mute duration must be from 1 second to 28 days.");
    }
    if (!member.moderatable) throw new ModerationError("The bot cannot mute this member. Check the bot's role position and permissions.", 403);
    await member.timeout(durationMs, auditReason);
    return `Timed out ${member.user.tag}.`;
  }

  if (!member.moderatable) throw new ModerationError("The bot cannot unmute this member. Check the bot's role position and permissions.", 403);
  if (!member.isCommunicationDisabled()) throw new ModerationError("That member is not currently timed out.");
  await member.timeout(null, auditReason);
  return `Removed the timeout from ${member.user.tag}.`;
}

async function handlePrefixCommand(message) {
  if (!message.inGuild() || message.author.bot || !message.content.startsWith(PREFIX)) return;
  const commandText = message.content.slice(PREFIX.length).trim();
  if (!commandText) return;

  const [commandRaw, ...commandArgs] = commandText.split(/\s+/);
  const command = commandRaw.toLowerCase();
  if (command === "help") {
    return message.reply({
      content: [
        "Zyntra moderation commands:",
        "`*ban <user ID or @member> [reason]` (stays until manually unbanned)",
        "`*kick <user ID or @member> [reason]`",
        "`*mute <user ID or @member> [duration] [reason]` (default 10m; duration examples: 30s, 10m, 2h, 1d)",
        "`*unmute <user ID or @member> [reason]`",
        "You need the matching Discord moderation permission. Only members below your highest role and the bot's highest role can be moderated.",
      ].join("\n"),
      allowedMentions: { parse: [] },
    });
  }

  if (!["ban", "kick", "mute", "unmute"].includes(command)) return;
  const permission = { ban: "BanMembers", kick: "KickMembers", mute: "ModerateMembers", unmute: "ModerateMembers" }[command];
  if (!message.member.permissions.has(permission)) {
    return message.reply({ content: `You need the ${permission} permission to use *${command}.`, allowedMentions: { parse: [] } });
  }

  const targetMention = message.mentions.members.first();
  const targetId = !targetMention && /^\d{17,20}$/.test(commandArgs[0] || "") ? commandArgs[0] : null;
  const target = targetMention || (targetId ? await message.guild.members.fetch(targetId).catch(() => null) : null);
  if (!target) {
    return message.reply({ content: `Give a member ID or mention. Example: *${command} 123456789012345678${command === "mute" ? " 10m" : ""}`, allowedMentions: { parse: [] } });
  }
  if (target.id === message.author.id) {
    return message.reply({ content: "You cannot use this command on yourself.", allowedMentions: { parse: [] } });
  }
  if (message.author.id !== message.guild.ownerId && message.member.roles.highest.comparePositionTo(target.roles.highest) <= 0) {
    return message.reply({ content: "You can only moderate members below your highest role.", allowedMentions: { parse: [] } });
  }

  const remainingArgs = targetMention ? commandArgs : commandArgs.slice(1);
  const mentionPattern = new RegExp(`<@!?${target.id}>`);
  const mentionPosition = remainingArgs.join(" ").match(mentionPattern);
  const afterTarget = targetMention && mentionPosition
    ? remainingArgs.join(" ").slice(mentionPosition.index + mentionPosition[0].length).trim()
    : remainingArgs.join(" ").trim();
  let reason = afterTarget;
  let durationMs;
  if (command === "mute") {
    const first = afterTarget.split(/\s+/, 1)[0];
    const parsed = parseDuration(first);
    if (parsed !== null) {
      durationMs = parsed;
      reason = afterTarget.slice(first.length).trim();
    } else {
      durationMs = DEFAULT_TIMEOUT_MS;
    }
    if (durationMs > MAX_TIMEOUT_MS || durationMs < 1000) {
      return message.reply({ content: "Mute duration must be from 1 second to 28 days (for example, 10m or 2h).", allowedMentions: { parse: [] } });
    }
  }

  try {
    const result = await performModerationAction(message.guild, target, command, {
      reason,
      durationMs,
      actorLabel: `Command by ${message.author.tag}`,
    });
    return message.reply({ content: result, allowedMentions: { parse: [] } });
  } catch (err) {
    return message.reply({ content: err.message || "That moderation action failed.", allowedMentions: { parse: [] } });
  }
}

module.exports = { handlePrefixCommand, performModerationAction, parseDuration, ModerationError };
