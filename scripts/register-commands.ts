import { REST, Routes } from "discord.js";
import { config } from "../src/config";
import { trackCommand } from "../src/commands/track";
import { untrackCommand } from "../src/commands/untrack";
import { tracksCommand } from "../src/commands/tracks";
import { setTimeoutCommand } from "../src/commands/set-timeout";
import { pingHlCommand } from "../src/commands/ping-hl";

async function main(): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(config.discordToken);

  await rest.put(Routes.applicationCommands(config.discordClientId), {
    body: [
      trackCommand.toJSON(),
      untrackCommand.toJSON(),
      tracksCommand.toJSON(),
      setTimeoutCommand.toJSON(),
      pingHlCommand.toJSON(),
    ],
  });

  console.log("Registered global /track, /untrack, /tracks, /settimeout, and /ping_hl commands.");
}

void main();
