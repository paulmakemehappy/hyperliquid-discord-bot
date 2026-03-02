export type TrackConfig = {
  id: string;
  guildId: string;
  coin: string;
  thresholdPercent: number;
  channelId: string;
  emoji: string;
  baselinePrice: number;
};

export type AlertEvent = {
  track: TrackConfig;
  currentPrice: number;
  previousBaseline: number;
  movePercent: number;
};
