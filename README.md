# Hyperliquid Discord Price Tracker

Discord bot in Node.js + TypeScript that tracks Hyperliquid token price moves and posts alerts to a chosen channel.

## Features

- Slash command: `/track coin threshold channel emoji`
- Posts the current price immediately when tracking starts
- Slash command: `/untrack coin [channel]`
- Slash command: `/tracks` to list active tracking configs
- Slash command: `/settimeout seconds` to change polling interval without redeploy
- Threshold is USD-based (for example `0.5` means a `$0.50` move)
- Uses Hyperliquid `POST /info` with `type: allMids`
- Persists tracks locally in SQLite at `data/tracks.db`

## Setup

1. Install dependencies:

```bash
npm install
```

2. Fill `.env`:

- `DISCORD_TOKEN`
- `DISCORD_CLIENT_ID`
- `DISCORD_GUILD_ID` (optional; not used for global command registration)
- `POLL_INTERVAL_MS` (optional, default `5000`)
- `DB_FILE_PATH` (optional, default `data/tracks.db`)

3. Register global slash commands:

```bash
npm run register
```

This registers commands globally (for all servers where the bot is installed).

4. Start bot in dev mode:

```bash
npm run dev
```

## Example command

`/track coin:HYPE threshold:0.5 channel:#alerts emoji:🚀`

`/untrack coin:HYPE channel:#alerts`

`/tracks`

`/settimeout seconds:5`

Alert message format:

`<coin_emoji> <COIN> Price: <direction_emoji> $<price>`

## Deploy on Render

1. Push this repository to GitHub.
2. In Render, create a new Blueprint service and select this repository.
3. Render will use `render.yaml` to create a Background Worker.
4. Set secret env vars in Render:
   - `DISCORD_TOKEN`
   - `DISCORD_CLIENT_ID`
   - `DISCORD_GUILD_ID`
5. Register commands once (from local machine or Render shell):

```bash
npm run register
```

Notes:
- Free tiers can restart/sleep depending on platform policy.
- If you need durable SQLite storage, point `DB_FILE_PATH` to a persistent disk mount.
