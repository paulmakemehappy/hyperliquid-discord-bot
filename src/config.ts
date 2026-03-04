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
    return 5000;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 2000) {
    throw new Error("POLL_INTERVAL_MS must be a number >= 2000");
  }
  return parsed;
}

function readDbFilePath(): string {
  return process.env.DB_FILE_PATH || "data/tracks.db";
}

function readCandleInterval():
  | "1m"
  | "3m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "2h"
  | "4h"
  | "8h"
  | "12h"
  | "1d"
  | "3d"
  | "1w"
  | "1M" {
  const value = process.env.CANDLE_INTERVAL || "1m";
  const allowed = new Set([
    "1m",
    "3m",
    "5m",
    "15m",
    "30m",
    "1h",
    "2h",
    "4h",
    "8h",
    "12h",
    "1d",
    "3d",
    "1w",
    "1M",
  ]);

  if (!allowed.has(value)) {
    throw new Error("CANDLE_INTERVAL must be one of 1m,3m,5m,15m,30m,1h,2h,4h,8h,12h,1d,3d,1w,1M");
  }

  return value as
    | "1m"
    | "3m"
    | "5m"
    | "15m"
    | "30m"
    | "1h"
    | "2h"
    | "4h"
    | "8h"
    | "12h"
    | "1d"
    | "3d"
    | "1w"
    | "1M";

}

export const config = {
  discordToken: requireEnv("DISCORD_TOKEN"),
  discordClientId: requireEnv("DISCORD_CLIENT_ID"),
  discordGuildId: process.env.DISCORD_GUILD_ID,
  pollIntervalMs: readPollInterval(),
  dbFilePath: readDbFilePath(),
  candleInterval: readCandleInterval(),
};
