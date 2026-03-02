import dotenv from "dotenv";

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function readPollInterval(): number {
  const raw = process.env.POLL_INTERVAL_MS;
  if (!raw) {
    return 15000;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 5000) {
    throw new Error("POLL_INTERVAL_MS must be a number >= 5000");
  }
  return parsed;
}

export const config = {
  discordToken: requireEnv("DISCORD_TOKEN"),
  discordClientId: requireEnv("DISCORD_CLIENT_ID"),
  discordGuildId: process.env.DISCORD_GUILD_ID,
  pollIntervalMs: readPollInterval(),
};
