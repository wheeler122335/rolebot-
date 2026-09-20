require("dotenv").config();
const { createBot } = require("./bot");
const { createServer } = require("./server");

async function main() {
  if (!process.env.DISCORD_TOKEN) {
    console.error("Missing DISCORD_TOKEN. Copy .env.example to .env and fill it in.");
    process.exit(1);
  }
  if (!process.env.DASHBOARD_PASSWORD) {
    console.error("Missing DASHBOARD_PASSWORD. Copy .env.example to .env and fill it in.");
    process.exit(1);
  }

  const client = createBot();
  const app = createServer(client);
  const port = Number(process.env.PORT) || 3000;

  app.listen(port, () => {
    console.log(`Dashboard: http://localhost:${port}`);
  });

  await client.login(process.env.DISCORD_TOKEN);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
