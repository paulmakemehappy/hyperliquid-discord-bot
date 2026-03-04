import { ChannelType, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { TrackerService } from "../services/tracker";

export const untrackCommand = new SlashCommandBuilder()
  .setName("untrack")
  .setDescription("Stop tracking a token")
  .addStringOption((option) =>
    option.setName("coin").setDescription("Coin symbol, e.g. HYPE").setRequired(true),
  )
  .addChannelOption((option) =>
    option
      .setName("channel")
      .setDescription("Optional channel filter; if omitted, removes all channels for this coin")
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(false),
  );

export async function handleUntrackCommand(
  interaction: ChatInputCommandInteraction,
  trackerService: TrackerService,
  persistTracks: () => void,
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: "This command can only be used inside a server.", ephemeral: true });
    return;
  }

  const coin = interaction.options.getString("coin", true).trim();
  const channel = interaction.options.getChannel("channel", false);
  const removed = trackerService.removeTracks(guildId, coin, channel?.id);

  if (removed === 0) {
    await interaction.reply({
      content: channel
        ? `No active tracking found for ${coin} in <#${channel.id}>.`
        : `No active tracking found for ${coin}.`,
      ephemeral: true,
    });
    return;
  }

  persistTracks();

  await interaction.reply({
    content: channel
      ? `Stopped tracking ${coin} in <#${channel.id}>.`
      : `Stopped ${removed} tracking configuration(s) for ${coin}.`,
    ephemeral: true,
  });
}
