# Zyntra Bot Dashboard

Zyntra Bot with a dashboard for managing member roles and sending messages to server channels.

## Setup

1. Create a Discord application at [https://discord.com/developers/applications](https://discord.com/developers/applications).
2. Open **Bot** and copy the token. Turn on **Server Members Intent**.
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

Open [http://localhost:3000](http://localhost:3000), log in, then use **Roles** to manage member roles or **Send a message** to post in a channel. Message mentions are suppressed so sending `@everyone` or a user mention will not ping them.

## Hosting

The `render.yaml` Blueprint deploys the bot and dashboard together at a dedicated online address. Set `DISCORD_TOKEN` and `DASHBOARD_PASSWORD` as private environment variables in the hosting dashboard; never commit `.env` or paste the token into the website. The dashboard enables HTTPS-only session cookies and limits repeated password attempts. The included free plan can restart or sleep, so it does not promise uninterrupted uptime.
