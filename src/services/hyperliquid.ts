const HYPERLIQUID_INFO_URL = "https://api.hyperliquid.xyz/info";

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
      mids[coin.toUpperCase()] = price;
    }
  }

  return mids;
}
