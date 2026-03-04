import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { TrackConfig } from "../types";

export class DbService {
  private readonly db: Database.Database;

  constructor(dbFilePath: string) {
    fs.mkdirSync(path.dirname(dbFilePath), { recursive: true });
    this.db = new Database(dbFilePath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tracks (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        coin TEXT NOT NULL,
        threshold_percent REAL NOT NULL,
        channel_id TEXT NOT NULL,
        emoji TEXT NOT NULL,
        baseline_price REAL NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
  }

  loadTracks(): TrackConfig[] {
    const rows = this.db
      .prepare(
        `SELECT id, guild_id, coin, threshold_percent, channel_id, emoji, baseline_price FROM tracks`,
      )
      .all() as Array<{
      id: string;
      guild_id: string;
      coin: string;
      threshold_percent: number;
      channel_id: string;
      emoji: string;
      baseline_price: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      guildId: row.guild_id,
      coin: row.coin,
      thresholdUsd: row.threshold_percent,
      channelId: row.channel_id,
      emoji: row.emoji,
      baselinePrice: row.baseline_price,
    }));
  }

  saveTracks(tracks: TrackConfig[]): void {
    const clearStmt = this.db.prepare(`DELETE FROM tracks`);
    const insertStmt = this.db.prepare(`
      INSERT INTO tracks (id, guild_id, coin, threshold_percent, channel_id, emoji, baseline_price)
      VALUES (@id, @guild_id, @coin, @threshold_percent, @channel_id, @emoji, @baseline_price)
    `);

    const tx = this.db.transaction((allTracks: TrackConfig[]) => {
      clearStmt.run();
      for (const track of allTracks) {
        insertStmt.run({
          id: track.id,
          guild_id: track.guildId,
          coin: track.coin,
          threshold_percent: track.thresholdUsd,
          channel_id: track.channelId,
          emoji: track.emoji,
          baseline_price: track.baselinePrice,
        });
      }
    });

    tx(tracks);
  }

  loadPollIntervalMs(defaultValue: number): number {
    const row = this.db
      .prepare(`SELECT value FROM settings WHERE key = 'poll_interval_ms'`)
      .get() as { value: string } | undefined;

    if (!row) {
      return defaultValue;
    }

    const parsed = Number(row.value);
    if (!Number.isFinite(parsed) || parsed < 2000) {
      return defaultValue;
    }

    return parsed;
  }

  savePollIntervalMs(value: number): void {
    this.db
      .prepare(`INSERT INTO settings (key, value) VALUES ('poll_interval_ms', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
      .run(String(value));
  }
}
