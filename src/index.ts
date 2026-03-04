import { Client, Events, GatewayIntentBits, type SendableChannels } from "discord.js";
import { config } from "./config";
import { trackCommand, handleTrackCommand } from "./commands/track";
import { untrackCommand, handleUntrackCommand } from "./commands/untrack";
import { tracksCommand, handleTracksCommand } from "./commands/tracks";
import { setTimeoutCommand, handleSetTimeoutCommand } from "./commands/set-timeout";
import { DOWN_EMOJI, UP_EMOJI } from "./constants";
import { DbService } from "./services/db";
import { getAllMids } from "./services/hyperliquid";
import { TrackerService } from "./services/tracker";
import type { TrackConfig } from "./types";

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const dbService = new DbService(config.dbFilePath);
const trackerService = new TrackerService(dbService.loadTracks());
let pollIntervalMs = dbService.loadPollIntervalMs(config.pollIntervalMs);

let isPolling = false;
let pollingTimer: NodeJS.Timeout | null = null;

function persistTracks(): void {
  dbService.saveTracks(trackerService.listAllTracks());
}

function getPollIntervalMs(): number {
  return pollIntervalMs;
}

function schedulePolling(): void {
  if (pollingTimer) {
    clearInterval(pollingTimer);
  }

  pollingTimer = setInterval(() => {
    void runMonitoringTick();
  }, pollIntervalMs);
}

function setPollIntervalMs(newPollIntervalMs: number): void {
  pollIntervalMs = newPollIntervalMs;
  dbService.savePollIntervalMs(newPollIntervalMs);
  schedulePolling();
}

function isSendableChannel(channel: unknown): channel is SendableChannels {
  return !!channel && typeof (channel as SendableChannels).send === "function";
}

function formatPrice(price: number): string {
  return price.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

async function sendPriceSnapshot(track: TrackConfig, price: number): Promise<void> {
  const channel = await client.channels.fetch(track.channelId);
  if (!isSendableChannel(channel)) {
    return;
  }

  await channel.send(`${track.emoji} ${track.coin} Price: $${formatPrice(price)}`);
}

async function postInitialPricesOnStartup(): Promise<void> {
  const tracks = trackerService.listAllTracks();
  if (tracks.length === 0) {
    return;
  }

  try {
    const mids = await getAllMids();
    let changed = false;

    for (const track of tracks) {
      const price = mids[track.coin];
      if (!price) {
        continue;
      }

      try {
        await sendPriceSnapshot(track, price);
        track.baselinePrice = price;
        changed = true;
      } catch (error) {
        console.error(`Failed to post startup price for ${track.coin} in ${track.channelId}:`, error);
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
    const mids = await getAllMids();
    const events = trackerService.evaluate(mids);
    let changed = false;

    for (const event of events) {
      try {
        const channel = await client.channels.fetch(event.track.channelId);
        if (!isSendableChannel(channel)) {
          event.track.baselinePrice = event.previousBaseline;
          continue;
        }

        const directionEmoji = event.currentPrice >= event.previousBaseline ? UP_EMOJI : DOWN_EMOJI;
        const message = `${event.track.emoji} ${event.track.coin} Price: ${directionEmoji} $${formatPrice(event.currentPrice)}`;
        await channel.send(message);
        changed = true;
      } catch (error) {
        event.track.baselinePrice = event.previousBaseline;
        console.error(`Failed to post alert for ${event.track.coin} in ${event.track.channelId}:`, error);
      }
    }

    if (changed) {
      persistTracks();
    }
  } catch (error) {
    console.error("Monitoring tick failed:", error);
  } finally {
    isPolling = false;
  }
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  console.log(
    `Loaded commands: /${trackCommand.name}, /${untrackCommand.name}, /${tracksCommand.name}, /${setTimeoutCommand.name}. Active tracks: ${trackerService.getTrackCount()}. Poll interval: ${Math.round(pollIntervalMs / 1000)}s`,
  );
  void postInitialPricesOnStartup();
  schedulePolling();
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  try {
    if (interaction.commandName === trackCommand.name) {
      await handleTrackCommand(interaction, trackerService, persistTracks);
      return;
    }
    if (interaction.commandName === untrackCommand.name) {
      await handleUntrackCommand(interaction, trackerService, persistTracks);
      return;
    }
    if (interaction.commandName === tracksCommand.name) {
      await handleTracksCommand(interaction, trackerService);
      return;
    }
    if (interaction.commandName === setTimeoutCommand.name) {
      await handleSetTimeoutCommand(interaction, getPollIntervalMs, setPollIntervalMs);
      return;
    }
  } catch (error) {
    console.error("Command handling failed:", error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: "Something went wrong.", ephemeral: true });
      return;
    }
    await interaction.reply({ content: "Something went wrong.", ephemeral: true });
  }
});

void client.login(config.discordToken);
