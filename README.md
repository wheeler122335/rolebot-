# Rolebot

A Discord bot with a local dashboard: click a member, click a role, and it is assigned or removed immediately.

## Setup

1. Create a Discord application at [https://discord.com/developers/applications](https://discord.com/developers/applications).
2. Open **Bot** and copy the token. Turn on **Server Members Intent**.
3. Open **OAuth2 → URL Generator**. Scopes: `bot`. Permissions: **Manage Roles**, **View Channels**, **View Server Members**.
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

Open [http://localhost:3000](http://localhost:3000), log in, pick a person, and click roles.
