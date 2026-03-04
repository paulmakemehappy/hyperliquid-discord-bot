import {
  ChannelType,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type SendableChannels,
} from "discord.js";
import { getAllMids, resolveSymbolWithPrice } from "../services/hyperliquid";
import { config } from "../config";
import { getTrackId, TrackerService } from "../services/tracker";

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

export const trackCommand = new SlashCommandBuilder()
  .setName("track")
  .setDescription("Track a token and post on USD price step levels")
  .addStringOption((option) =>
    option.setName("coin").setDescription("Coin symbol, e.g. HYPE").setRequired(true),
  )
  .addNumberOption((option) =>
    option
      .setName("threshold")
      .setDescription("USD step size, e.g. 0.5 for x.0, x.5, x.0 levels")
      .setRequired(true)
      .setMinValue(0.01),
  )
  .addChannelOption((option) =>
    option
      .setName("channel")
      .setDescription("Channel where alerts will be posted")
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("emoji")
      .setDescription("Emoji to include in alert messages")
      .setRequired(true),
  );

export async function handleTrackCommand(
  interaction: ChatInputCommandInteraction,
  trackerService: TrackerService,
  persistTracks: () => void,
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: "This command can only be used inside a server.",
      ephemeral: true,
    });
    return;
  }

  const requestedCoin = interaction.options.getString("coin", true).trim();
  const threshold = interaction.options.getNumber("threshold", true);
  const targetChannel = interaction.options.getChannel("channel", true);
  const emoji = interaction.options.getString("emoji", true).trim();

  if (!isSendableChannel(targetChannel)) {
    await interaction.reply({
      content: "Selected channel is not text-based.",
      ephemeral: true,
    });
    return;
  }

  try {
    const mids = requestedCoin.toLowerCase().startsWith("xyz:") ? undefined : await getAllMids();
    const resolved = await resolveSymbolWithPrice(requestedCoin, config.candleInterval, mids);

    if (!resolved) {
      await interaction.reply({
        content: `Coin ${requestedCoin} was not found.`,
        ephemeral: true,
      });
      return;
    }

    const resolvedCoin = resolved.symbol;
    const initialPrice = resolved.price;

    const id = getTrackId(guildId, resolvedCoin, targetChannel.id);
    trackerService.upsertTrack({
      id,
      guildId,
      coin: resolvedCoin,
      thresholdUsd: threshold,
      channelId: targetChannel.id,
      emoji,
      baselinePrice: initialPrice,
    });

    try {
      await targetChannel.send(
        `${emoji} Started tracking ${resolvedCoin}. Current price: ${formatPriceForStep(initialPrice, threshold)}`,
      );
    } catch {
      trackerService.removeTrack(id);
      await interaction.reply({
        content: `Failed to post the initial price in <#${targetChannel.id}>. Check bot permissions and try again.`,
        ephemeral: true,
      });
      return;
    }

    persistTracks();

    await interaction.reply({
      content: `Tracking ${resolvedCoin} with $${threshold} step levels in <#${targetChannel.id}> with ${emoji}.`,
      ephemeral: true,
    });
  } catch {
    await interaction.reply({
      content: "Failed to fetch prices from Hyperliquid. Please try again.",
      ephemeral: true,
    });
    return;
  }
}
