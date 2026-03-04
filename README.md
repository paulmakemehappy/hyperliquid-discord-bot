# Hyperliquid Discord Price Tracker

Discord bot in Node.js + TypeScript that tracks Hyperliquid token price moves and posts alerts to a chosen channel.

## Features

- Slash command: `/track coin threshold channel emoji`
- Posts the current price immediately when tracking starts
- Slash command: `/untrack coin [channel]`
- Slash command: `/tracks` to list active tracking configs
- Slash command: `/settimeout seconds` to change polling interval without redeploy
- Slash command: `/ping_hl symbol price [mention]` for one-time target alerts
- Threshold is a USD step grid (for example `0.5` means levels like `20.0`, `20.5`, `21.0`)
- Uses mixed Hyperliquid pricing: `candleSnapshot` for `xyz:*`, `allMids` for everything else
- Persists tracks locally in SQLite at `data/tracks.db`
- Polling interval auto-adjusts upward when many symbols are tracked

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
- `CANDLE_INTERVAL` (optional, default `1m`)

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

`/ping_hl symbol:HYPE price:30.5 mention:@role`

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
