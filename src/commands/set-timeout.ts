import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";

const MIN_SECONDS = 2;
const MAX_SECONDS = 60;

export const setTimeoutCommand = new SlashCommandBuilder()
  .setName("settimeout")
  .setDescription("Set polling interval in seconds for price checks")
  .addIntegerOption((option) =>
    option
      .setName("seconds")
      .setDescription(`Polling interval in seconds (${MIN_SECONDS}-${MAX_SECONDS})`)
      .setRequired(true)
      .setMinValue(MIN_SECONDS)
      .setMaxValue(MAX_SECONDS),
  );

export async function handleSetTimeoutCommand(
  interaction: ChatInputCommandInteraction,
  getPollIntervalMs: () => number,
  setPollIntervalMs: (newPollIntervalMs: number) => void,
): Promise<void> {
  if (!interaction.inGuild()) {
    await interaction.reply({ content: "This command can only be used inside a server.", ephemeral: true });
    return;
  }

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      content: "You need Manage Server permission to change the polling interval.",
      ephemeral: true,
    });
    return;
  }

  const seconds = interaction.options.getInteger("seconds", true);
  const newPollIntervalMs = seconds * 1000;
  const previousMs = getPollIntervalMs();

  setPollIntervalMs(newPollIntervalMs);

  await interaction.reply({
    content: `Polling interval updated from ${Math.round(previousMs / 1000)}s to ${seconds}s.`,
    ephemeral: true,
  });
}
