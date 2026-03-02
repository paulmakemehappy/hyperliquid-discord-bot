import {
  ChannelType,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type SendableChannels,
} from "discord.js";
import { getAllMids } from "../services/hyperliquid";
import { getTrackId, TrackerService } from "../services/tracker";

function isSendableChannel(channel: unknown): channel is SendableChannels {
  return !!channel && typeof (channel as SendableChannels).send === "function";
}

function formatPrice(price: number): string {
  return price.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

export const trackCommand = new SlashCommandBuilder()
  .setName("track")
  .setDescription("Track a token and post when its price moves by a threshold percentage")
  .addStringOption((option) =>
    option.setName("coin").setDescription("Coin symbol, e.g. HYPE").setRequired(true),
  )
  .addNumberOption((option) =>
    option
      .setName("threshold")
      .setDescription("Percentage move needed before posting, e.g. 0.5")
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

  const coin = interaction.options.getString("coin", true).toUpperCase().trim();
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

  let mids: Record<string, number>;
  try {
    mids = await getAllMids();
  } catch {
    await interaction.reply({
      content: "Failed to fetch prices from Hyperliquid. Please try again.",
      ephemeral: true,
    });
    return;
  }

  const initialPrice = mids[coin];
  if (!initialPrice) {
    await interaction.reply({
      content: `Coin ${coin} was not found in Hyperliquid allMids.`,
      ephemeral: true,
    });
    return;
  }

  const id = getTrackId(guildId, coin, targetChannel.id);
  trackerService.upsertTrack({
    id,
    guildId,
    coin,
    thresholdPercent: threshold,
    channelId: targetChannel.id,
    emoji,
    baselinePrice: initialPrice,
  });

  try {
    await targetChannel.send(`${emoji} Started tracking ${coin}. Current price: ${formatPrice(initialPrice)}`);
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
    content: `Tracking ${coin} at ${threshold}% in <#${targetChannel.id}> with ${emoji}`,
    ephemeral: true,
  });
}
