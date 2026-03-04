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
    const targetCoin = coin.trim();
    let removed = 0;

    for (const [id, track] of this.tracks.entries()) {
      if (track.guildId !== guildId || track.coin.toUpperCase() !== targetCoin.toUpperCase()) {
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

  private getStepDecimals(step: number): number {
    const text = step.toString().toLowerCase();
    if (text.includes("e-")) {
      const [, exponentText] = text.split("e-");
      return Number(exponentText);
    }

    const decimalPart = text.split(".")[1];
    return decimalPart ? decimalPart.length : 0;
  }

  private quantize(value: number, decimals: number): number {
    return Number(value.toFixed(decimals));
  }

  private ensureStepLevels(track: TrackConfig, referencePrice: number): void {
    if (track.nextUpPrice !== undefined && track.nextDownPrice !== undefined) {
      return;
    }

    const step = track.thresholdUsd;
    const decimals = this.getStepDecimals(step);
    const normalizedReference = this.quantize(referencePrice, decimals + 4);
    const upMultiplier = Math.ceil(normalizedReference / step);
    const downMultiplier = Math.floor(normalizedReference / step);
    track.nextUpPrice = this.quantize(upMultiplier * step, decimals);
    track.nextDownPrice = this.quantize(downMultiplier * step, decimals);
  }

  evaluate(prices: Record<string, number>): AlertEvent[] {
    const events: AlertEvent[] = [];

    for (const track of this.tracks.values()) {
      const currentPrice = prices[track.coin];
      if (!currentPrice) {
        continue;
      }

      this.ensureStepLevels(track, track.baselinePrice || currentPrice);
      const step = track.thresholdUsd;
      const decimals = this.getStepDecimals(step);
      const quantizedCurrent = this.quantize(currentPrice, decimals + 4);
      const epsilon = step / 1_000_000;

      while (track.nextUpPrice !== undefined && quantizedCurrent >= track.nextUpPrice - epsilon) {
        const level = track.nextUpPrice;
        const nextUp = this.quantize(level + step, decimals);
        const nextDown = this.quantize(level - step, decimals);
        events.push({ track, alertPrice: this.quantize(level, decimals), direction: "up" });
        track.nextUpPrice = nextUp;
        track.nextDownPrice = nextDown;
      }

      while (track.nextDownPrice !== undefined && quantizedCurrent <= track.nextDownPrice + epsilon) {
        const level = track.nextDownPrice;
        const nextDown = this.quantize(level - step, decimals);
        const nextUp = this.quantize(level + step, decimals);
        events.push({ track, alertPrice: this.quantize(level, decimals), direction: "down" });
        track.nextDownPrice = nextDown;
        track.nextUpPrice = nextUp;
      }

      track.baselinePrice = quantizedCurrent;
    }

    return events;
  }
}
