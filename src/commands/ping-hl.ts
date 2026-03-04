import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { getAllMids } from "../services/hyperliquid";
import { PingAlertService } from "../services/ping-alerts";

function formatPrice(price: number): string {
  return price.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

export const pingHlCommand = new SlashCommandBuilder()
  .setName("ping_hl")
  .setDescription("Alert once when a Hyperliquid token reaches a target price")
  .addStringOption((option) =>
    option.setName("symbol").setDescription("Coin symbol, e.g. HYPE").setRequired(true),
  )
  .addNumberOption((option) =>
    option
      .setName("price")
      .setDescription("Target price in USD")
      .setRequired(true)
      .setMinValue(0.00000001),
  )
  .addMentionableOption((option) =>
    option.setName("mention").setDescription("Optional user or role to mention").setRequired(false),
  );

export async function handlePingHlCommand(
  interaction: ChatInputCommandInteraction,
  pingAlertService: PingAlertService,
): Promise<void> {
  if (!interaction.inGuild() || !interaction.channelId) {
    await interaction.reply({ content: "This command can only be used inside a server channel.", ephemeral: true });
    return;
  }

  const coin = interaction.options.getString("symbol", true).toUpperCase().trim();
  const targetPrice = interaction.options.getNumber("price", true);
  const mentionOption = interaction.options.get("mention", false);
  const mentionText = mentionOption?.role
    ? `<@&${mentionOption.role.id}>`
    : mentionOption?.user
      ? `<@${mentionOption.user.id}>`
      : undefined;

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

  const currentPrice = mids[coin];
  if (!currentPrice) {
    await interaction.reply({
      content: `Coin ${coin} was not found in Hyperliquid allMids.`,
      ephemeral: true,
    });
    return;
  }

  const alertId = `${interaction.guildId}:${interaction.channelId}:${coin}:${targetPrice}:${Date.now()}`;
  pingAlertService.add({
    id: alertId,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    coin,
    targetPrice,
    startsBelowTarget: currentPrice <= targetPrice,
    mentionText,
  });

  await interaction.reply({
    content: `I will ping when ${coin} reaches $${formatPrice(targetPrice)}. Current: $${formatPrice(currentPrice)}.`,
    ephemeral: true,
  });
}
