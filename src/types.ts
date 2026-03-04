export type TrackConfig = {
  id: string;
  guildId: string;
  coin: string;
  thresholdUsd: number;
  channelId: string;
  emoji: string;
  baselinePrice: number;
  nextUpPrice?: number;
  nextDownPrice?: number;
};

export type AlertEvent = {
  track: TrackConfig;
  alertPrice: number;
  direction: "up" | "down";
};

export type PingAlert = {
  id: string;
  guildId: string;
  channelId: string;
  coin: string;
  targetPrice: number;
  startsBelowTarget: boolean;
  mentionText?: string;
};
