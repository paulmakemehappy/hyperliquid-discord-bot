const HYPERLIQUID_INFO_URL = "https://api.hyperliquid.xyz/info";
const CANDLE_INTERVALS = new Set([
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "8h",
  "12h",
  "1d",
  "3d",
  "1w",
  "1M",
]);

export type CandleInterval =
  | "1m"
  | "3m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "2h"
  | "4h"
  | "8h"
  | "12h"
  | "1d"
  | "3d"
  | "1w"
  | "1M";

type Candle = {
  c: string;
  s: string;
  t: number;
  T: number;
};

function isXyzSymbol(symbol: string): boolean {
  return symbol.trim().toLowerCase().startsWith("xyz:");
}

function assertValidInterval(interval: CandleInterval): void {
  if (!CANDLE_INTERVALS.has(interval)) {
    throw new Error(`Unsupported candle interval: ${interval}`);
  }
}

function intervalToMs(interval: CandleInterval): number {
  const map: Record<CandleInterval, number> = {
    "1m": 60_000,
    "3m": 180_000,
    "5m": 300_000,
    "15m": 900_000,
    "30m": 1_800_000,
    "1h": 3_600_000,
    "2h": 7_200_000,
    "4h": 14_400_000,
    "8h": 28_800_000,
    "12h": 43_200_000,
    "1d": 86_400_000,
    "3d": 259_200_000,
    "1w": 604_800_000,
    "1M": 2_592_000_000,
  };

  return map[interval];
}

export async function getCandleSnapshot(
  coin: string,
  interval: CandleInterval,
  startTime: number,
  endTime: number,
): Promise<Candle[]> {
  assertValidInterval(interval);

  const response = await fetch(HYPERLIQUID_INFO_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "candleSnapshot",
      req: {
        coin,
        interval,
        startTime,
        endTime,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Hyperliquid API request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as Candle[];
}

export async function getAllMids(): Promise<Record<string, number>> {
  const response = await fetch(HYPERLIQUID_INFO_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "allMids",
      dex: "",
    }),
  });

  if (!response.ok) {
    throw new Error(`Hyperliquid API request failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as Record<string, string>;
  const mids: Record<string, number> = {};

  for (const [coin, value] of Object.entries(data)) {
    const price = Number(value);
    if (Number.isFinite(price) && price > 0) {
      mids[coin] = price;
    }
  }

  return mids;
}

export async function getLatestCandleClose(
  coin: string,
  interval: CandleInterval,
): Promise<number | null> {
  const intervalMs = intervalToMs(interval);
  const endTime = Date.now();
  const startTime = endTime - Math.max(intervalMs * 3, 5 * 60_000);
  const candles = await getCandleSnapshot(coin, interval, startTime, endTime);
  if (candles.length === 0) {
    return null;
  }

  const latest = candles[candles.length - 1];
  const close = Number(latest.c);
  if (!Number.isFinite(close) || close <= 0) {
    return null;
  }

  return close;
}

export async function resolveMarketSymbolFromMids(
  inputSymbol: string,
  mids?: Record<string, number>,
): Promise<{ symbol: string; price: number } | null> {
  const source = mids ?? (await getAllMids());
  if (source[inputSymbol] !== undefined) {
    return { symbol: inputSymbol, price: source[inputSymbol] };
  }

  const targetUpper = inputSymbol.toUpperCase();
  for (const [symbol, price] of Object.entries(source)) {
    if (symbol.toUpperCase() === targetUpper) {
      return { symbol, price };
    }
  }

  return null;
}

export async function resolveXyzSymbolWithCandle(
  inputSymbol: string,
  interval: CandleInterval,
): Promise<{ symbol: string; price: number } | null> {
  const trimmed = inputSymbol.trim();
  const attempts = new Set<string>([trimmed]);

  if (trimmed.toLowerCase().startsWith("xyz:")) {
    const suffix = trimmed.slice(4);
    attempts.add(`xyz:${suffix.toUpperCase()}`);
  } else {
    attempts.add(`xyz:${trimmed.toUpperCase()}`);
  }

  for (const attempt of attempts) {
    const close = await getLatestCandleClose(attempt, interval);
    if (close) {
      return { symbol: attempt, price: close };
    }
  }

  return null;
}

export async function resolveSymbolWithPrice(
  inputSymbol: string,
  interval: CandleInterval,
  mids?: Record<string, number>,
): Promise<{ symbol: string; price: number } | null> {
  if (isXyzSymbol(inputSymbol)) {
    return resolveXyzSymbolWithCandle(inputSymbol, interval);
  }
  return resolveMarketSymbolFromMids(inputSymbol, mids);
}

export async function getLatestCandleCloses(
  coins: string[],
  interval: CandleInterval,
): Promise<Record<string, number>> {
  const uniqueCoins = [...new Set(coins.filter((coin) => coin.trim() !== ""))];
  const entries = await Promise.all(
    uniqueCoins.map(async (coin) => {
      try {
        const close = await getLatestCandleClose(coin, interval);
        if (!close) {
          return null;
        }
        return [coin, close] as const;
      } catch {
        return null;
      }
    }),
  );

  const prices: Record<string, number> = {};
  for (const entry of entries) {
    if (!entry) {
      continue;
    }
    prices[entry[0]] = entry[1];
  }

  return prices;
}

export async function getLatestMixedPrices(
  symbols: string[],
  interval: CandleInterval,
): Promise<Record<string, number>> {
  const uniqueSymbols = [...new Set(symbols.map((symbol) => symbol.trim()).filter((symbol) => symbol !== ""))];
  const xyzSymbols = uniqueSymbols.filter(isXyzSymbol);
  const regularSymbols = uniqueSymbols.filter((symbol) => !isXyzSymbol(symbol));

  const [mids, xyzPrices] = await Promise.all([
    regularSymbols.length > 0 ? getAllMids() : Promise.resolve({} as Record<string, number>),
    xyzSymbols.length > 0 ? getLatestCandleCloses(xyzSymbols, interval) : Promise.resolve({} as Record<string, number>),
  ]);

  const prices: Record<string, number> = { ...xyzPrices };
  for (const symbol of regularSymbols) {
    const value = mids[symbol];
    if (value) {
      prices[symbol] = value;
    }
  }

  return prices;
}
