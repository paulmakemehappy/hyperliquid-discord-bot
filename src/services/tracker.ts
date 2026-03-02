import type { AlertEvent, TrackConfig } from "../types";

export function getTrackId(guildId: string, coin: string, channelId: string): string {
  return `${guildId}:${coin}:${channelId}`;
}

export class TrackerService {
  private readonly tracks = new Map<string, TrackConfig>();

  constructor(initialTracks: TrackConfig[] = []) {
    for (const track of initialTracks) {
      this.tracks.set(track.id, track);
    }
  }

  upsertTrack(track: TrackConfig): void {
    this.tracks.set(track.id, track);
  }

  getTrackCount(): number {
    return this.tracks.size;
  }

  removeTrack(id: string): boolean {
    return this.tracks.delete(id);
  }

  removeTracks(guildId: string, coin: string, channelId?: string): number {
    const targetCoin = coin.toUpperCase();
    let removed = 0;

    for (const [id, track] of this.tracks.entries()) {
      if (track.guildId !== guildId || track.coin !== targetCoin) {
        continue;
      }

      if (channelId && track.channelId !== channelId) {
        continue;
      }

      this.tracks.delete(id);
      removed += 1;
    }

    return removed;
  }

  listTracksByGuild(guildId: string): TrackConfig[] {
    return [...this.tracks.values()]
      .filter((track) => track.guildId === guildId)
      .sort((a, b) => a.coin.localeCompare(b.coin) || a.channelId.localeCompare(b.channelId));
  }

  listAllTracks(): TrackConfig[] {
    return [...this.tracks.values()];
  }

  evaluate(mids: Record<string, number>): AlertEvent[] {
    const events: AlertEvent[] = [];

    for (const track of this.tracks.values()) {
      const currentPrice = mids[track.coin];
      if (!currentPrice) {
        continue;
      }

      const movePercent = Math.abs(((currentPrice - track.baselinePrice) / track.baselinePrice) * 100);
      if (movePercent < track.thresholdPercent) {
        continue;
      }

      const previousBaseline = track.baselinePrice;
      track.baselinePrice = currentPrice;

      events.push({
        track,
        currentPrice,
        previousBaseline,
        movePercent,
      });
    }

    return events;
  }
}
