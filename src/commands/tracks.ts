import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { TrackerService } from "../services/tracker";

function formatPrice(price: number): string {
  return price.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

export const tracksCommand = new SlashCommandBuilder()
  .setName("tracks")
  .setDescription("List all active tracking configurations for this server");

export async function handleTracksCommand(
  interaction: ChatInputCommandInteraction,
  trackerService: TrackerService,
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: "This command can only be used inside a server.", ephemeral: true });
    return;
  }

  const tracks = trackerService.listTracksByGuild(guildId);
  if (tracks.length === 0) {
    await interaction.reply({ content: "No active trackings yet.", ephemeral: true });
    return;
  }

  const lines = tracks.map(
    (track) =>
      `${track.emoji} ${track.coin} | threshold: ${track.thresholdPercent}% | channel: <#${track.channelId}> | baseline: ${formatPrice(track.baselinePrice)}`,
  );

  await interaction.reply({
    content: `Active trackings (${tracks.length}):\n${lines.join("\n")}`,
    ephemeral: true,
  });
}
