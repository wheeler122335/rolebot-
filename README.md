# Zyntra Bot Dashboard

Zyntra Bot with a dashboard for managing member roles, moderating members, and sending messages to server channels.

## Setup

1. Create a Discord application at [https://discord.com/developers/applications](https://discord.com/developers/applications).
2. Open **Bot** and copy the token. Turn on **Server Members Intent**. To use `*` prefix commands, also turn on **Message Content Intent** and set `ENABLE_PREFIX_COMMANDS=true` in `.env` or Render.
3. Open **OAuth2 → URL Generator**. Scopes: `bot`. Permissions: **Manage Roles**, **View Channels**, **View Server Members**, and **Send Messages**.
4. Open the generated invite URL and add the bot to your server.
5. In **Server Settings → Roles**, drag the bot's role **above** the roles you want it to give.

Then in this folder:

```bash
copy .env.example .env
```

Put your bot token and a dashboard password in `.env`, then:

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000), log in, then use **Roles** to manage member roles, **Moderation** to ban, kick, mute (Discord timeout), or unmute a member, or **Send a message** to post in a channel. Ban and kick ask for confirmation. Message mentions are suppressed so sending `@everyone` or a user mention will not ping them.

When prefix commands are enabled, members with the matching Discord permission can use `*ban @member [reason]`, `*kick @member [reason]`, `*mute @member [duration] [reason]`, and `*unmute @member [reason]`. Mute defaults to 10 minutes; durations can be `30s`, `10m`, `2h`, or `1d`, up to 28 days. `*help` lists the commands. The bot's highest role must be above the target member's highest role.

## Hosting

The `render.yaml` Blueprint deploys the bot and dashboard together at a dedicated online address. Set `DISCORD_TOKEN` and `DASHBOARD_PASSWORD` as private environment variables in the hosting dashboard; never commit `.env` or paste the token into the website. The dashboard enables HTTPS-only session cookies and limits repeated password attempts. The included free plan can restart or sleep, so it does not promise uninterrupted uptime.
