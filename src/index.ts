import {
  Client,
  Events,
  GatewayIntentBits,
  type SendableChannels,
} from "discord.js";
import { config } from "./config";
import { trackCommand, handleTrackCommand } from "./commands/track";
import { untrackCommand, handleUntrackCommand } from "./commands/untrack";
import { tracksCommand, handleTracksCommand } from "./commands/tracks";
import {
  setTimeoutCommand,
  handleSetTimeoutCommand,
} from "./commands/set-timeout";
import { pingHlCommand, handlePingHlCommand } from "./commands/ping-hl";
import { DOWN_EMOJI, UP_EMOJI } from "./constants";
import { DbService } from "./services/db";
import { getLatestMixedPrices } from "./services/hyperliquid";
import { PingAlertService } from "./services/ping-alerts";
import { TrackerService } from "./services/tracker";
import type { TrackConfig } from "./types";

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const dbService = new DbService(config.dbFilePath);
const trackerService = new TrackerService(dbService.loadTracks());
const pingAlertService = new PingAlertService();
let pollIntervalMs = dbService.loadPollIntervalMs(config.pollIntervalMs);

let isPolling = false;
let pollingTimer: NodeJS.Timeout | null = null;
let scheduledPollIntervalMs: number | null = null;
const latestPrices = new Map<string, number>();

const BASE_MIN_POLL_MS = 2_000;
const PER_XYZ_SYMBOL_MS = 800;
const PER_REGULAR_SYMBOL_MS = 100;

function persistTracks(): void {
  dbService.saveTracks(trackerService.listAllTracks());
}

function getPollIntervalMs(): number {
  return pollIntervalMs;
}

function calculateDynamicMinimumPollIntervalMs(symbols: string[]): number {
  const unique = [
    ...new Set(
      symbols.map((symbol) => symbol.trim()).filter((symbol) => symbol !== ""),
    ),
  ];
  const xyzCount = unique.filter((symbol) =>
    symbol.toLowerCase().startsWith("xyz:"),
  ).length;
  const regularCount = unique.length - xyzCount;
  return (
    BASE_MIN_POLL_MS +
    xyzCount * PER_XYZ_SYMBOL_MS +
    regularCount * PER_REGULAR_SYMBOL_MS
  );
}

function getEffectivePollIntervalMs(): number {
  const trackedCoins = trackerService
    .listAllTracks()
    .map((track) => track.coin);
  const pingCoins = pingAlertService.listAll().map((alert) => alert.coin);
  const dynamicMin = calculateDynamicMinimumPollIntervalMs([
    ...trackedCoins,
    ...pingCoins,
  ]);
  return Math.max(pollIntervalMs, dynamicMin);
}

function schedulePolling(force = false): void {
  const effectiveIntervalMs = getEffectivePollIntervalMs();

  if (
    !force &&
    pollingTimer &&
    scheduledPollIntervalMs === effectiveIntervalMs
  ) {
    return;
  }

  if (pollingTimer) {
    clearInterval(pollingTimer);
  }

  pollingTimer = setInterval(() => {
    void runMonitoringTick();
  }, effectiveIntervalMs);
  scheduledPollIntervalMs = effectiveIntervalMs;
}

function setPollIntervalMs(newPollIntervalMs: number): void {
  pollIntervalMs = newPollIntervalMs;
  dbService.savePollIntervalMs(newPollIntervalMs);
  schedulePolling(true);
}

function isSendableChannel(channel: unknown): channel is SendableChannels {
  return !!channel && typeof (channel as SendableChannels).send === "function";
}

function formatPrice(price: number): string {
  return price.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

function getStepDecimals(step: number): number {
  const text = step.toString().toLowerCase();
  if (text.includes("e-")) {
    const [, exponentText] = text.split("e-");
    return Number(exponentText);
  }

  const decimalPart = text.split(".")[1];
  return decimalPart ? decimalPart.length : 0;
}

function formatPriceForStep(price: number, step: number): string {
  const decimals = getStepDecimals(step);
  return price.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function getCachedPriceForSymbol(
  requestedSymbol: string,
): { symbol: string; price: number } | null {
  if (latestPrices.has(requestedSymbol)) {
    return {
      symbol: requestedSymbol,
      price: latestPrices.get(requestedSymbol)!,
    };
  }

  const targetUpper = requestedSymbol.toUpperCase();
  for (const [symbol, price] of latestPrices.entries()) {
    if (symbol.toUpperCase() === targetUpper) {
      return { symbol, price };
    }
  }

  for (const track of trackerService.listAllTracks()) {
    if (track.coin.toUpperCase() === targetUpper) {
      return { symbol: track.coin, price: track.baselinePrice };
    }
  }

  return null;
}

function updateLatestPrices(prices: Record<string, number>): void {
  latestPrices.clear();
  for (const [symbol, price] of Object.entries(prices)) {
    latestPrices.set(symbol, price);
  }
}

async function sendPriceSnapshot(
  track: TrackConfig,
  price: number,
): Promise<void> {
  const channel = await client.channels.fetch(track.channelId);
  if (!isSendableChannel(channel)) {
    return;
  }

  await channel.send(
    `## ${track.emoji} ${track.coin} Price: $${formatPriceForStep(price, track.thresholdUsd)}`,
  );
}

async function postInitialPricesOnStartup(): Promise<void> {
  const tracks = trackerService.listAllTracks();
  if (tracks.length === 0) {
    return;
  }

  try {
    const prices = await getLatestMixedPrices(
      tracks.map((track) => track.coin),
      config.candleInterval,
    );
    updateLatestPrices(prices);
    let changed = false;

    for (const track of tracks) {
      const price = prices[track.coin];
      if (!price) {
        continue;
      }

      try {
        await sendPriceSnapshot(track, price);
        track.baselinePrice = price;
        changed = true;
      } catch (error) {
        console.error(
          `Failed to post startup price for ${track.coin} in ${track.channelId}:`,
          error,
        );
      }
    }

    if (changed) {
      persistTracks();
    }
  } catch (error) {
    console.error("Failed to post initial prices on startup:", error);
  }
}

async function runMonitoringTick(): Promise<void> {
  if (isPolling) {
    return;
  }

  isPolling = true;
  try {
    const trackedCoins = trackerService
      .listAllTracks()
      .map((track) => track.coin);
    const pingCoins = pingAlertService.listAll().map((alert) => alert.coin);
    const prices = await getLatestMixedPrices(
      [...trackedCoins, ...pingCoins],
      config.candleInterval,
    );
    updateLatestPrices(prices);

    const events = trackerService.evaluate(prices);
    const pingEvents = pingAlertService.evaluate(prices);
    let changed = false;

    for (const event of events) {
      try {
        const channel = await client.channels.fetch(event.track.channelId);
        if (!isSendableChannel(channel)) {
          continue;
        }

        const directionEmoji = event.direction === "up" ? UP_EMOJI : DOWN_EMOJI;
        const message = `## ${event.track.emoji} ${event.track.coin} Price: ${directionEmoji} $${formatPriceForStep(event.alertPrice, event.track.thresholdUsd)}`;
        await channel.send(message);
        changed = true;
      } catch (error) {
        console.error(
          `Failed to post alert for ${event.track.coin} in ${event.track.channelId}:`,
          error,
        );
      }
    }

    for (const pingEvent of pingEvents) {
      try {
        const channel = await client.channels.fetch(pingEvent.channelId);
        if (!isSendableChannel(channel)) {
          continue;
        }

        const mentionPrefix = pingEvent.mentionText
          ? `${pingEvent.mentionText} `
          : "";
        await channel.send(
          `${mentionPrefix}${pingEvent.coin} reached $${formatPrice(pingEvent.targetPrice)}.`,
        );
      } catch (error) {
        console.error(
          `Failed to post ping_hl alert for ${pingEvent.coin} in ${pingEvent.channelId}:`,
          error,
        );
      }
    }

    if (changed) {
      persistTracks();
    }

    schedulePolling();
  } catch (error) {
    console.error("Monitoring tick failed:", error);
  } finally {
    isPolling = false;
  }
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  console.log(
    `Loaded commands: /${trackCommand.name}, /${untrackCommand.name}, /${tracksCommand.name}, /${setTimeoutCommand.name}, /${pingHlCommand.name}. Active tracks: ${trackerService.getTrackCount()}. Configured poll interval: ${Math.round(pollIntervalMs / 1000)}s`,
  );
  void postInitialPricesOnStartup();
  schedulePolling(true);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  try {
    if (interaction.commandName === trackCommand.name) {
      await handleTrackCommand(interaction, trackerService, persistTracks);
      schedulePolling();
      return;
    }
    if (interaction.commandName === untrackCommand.name) {
      await handleUntrackCommand(interaction, trackerService, persistTracks);
      schedulePolling();
      return;
    }
    if (interaction.commandName === tracksCommand.name) {
      await handleTracksCommand(interaction, trackerService);
      return;
    }
    if (interaction.commandName === setTimeoutCommand.name) {
      await handleSetTimeoutCommand(
        interaction,
        getPollIntervalMs,
        setPollIntervalMs,
      );
      return;
    }
    if (interaction.commandName === pingHlCommand.name) {
      await handlePingHlCommand(
        interaction,
        pingAlertService,
        getCachedPriceForSymbol,
      );
      schedulePolling();
      return;
    }
  } catch (error) {
    console.error("Command handling failed:", error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: "Something went wrong.",
        ephemeral: true,
      });
      return;
    }
    await interaction.reply({
      content: "Something went wrong.",
      ephemeral: true,
    });
  }
});

void client.login(config.discordToken);
