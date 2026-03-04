export type TrackConfig = {
  id: string;
  guildId: string;
  coin: string;
  thresholdUsd: number;
  channelId: string;
  emoji: string;
  baselinePrice: number;
};

export type AlertEvent = {
  track: TrackConfig;
  currentPrice: number;
  previousBaseline: number;
  moveUsd: number;
};
