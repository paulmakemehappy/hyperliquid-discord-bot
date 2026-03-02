import { REST, Routes } from "discord.js";
import { config } from "../src/config";
import { trackCommand } from "../src/commands/track";
import { untrackCommand } from "../src/commands/untrack";
import { tracksCommand } from "../src/commands/tracks";

async function main(): Promise<void> {
  if (!config.discordGuildId) {
    throw new Error("DISCORD_GUILD_ID is required for command registration");
  }

  const rest = new REST({ version: "10" }).setToken(config.discordToken);

  await rest.put(Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId), {
    body: [trackCommand.toJSON(), untrackCommand.toJSON(), tracksCommand.toJSON()],
  });

  console.log("Registered /track, /untrack, and /tracks commands.");
}

void main();
