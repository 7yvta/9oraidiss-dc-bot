const COINS = { btc: "bitcoin", eth: "ethereum", sol: "solana", xmr: "monero" };

async function fetchCryptoPrice(symbol) {
  const coin = String(symbol || "").toLowerCase();
  const id = COINS[coin];
  if (!id) {
    throw new Error("Unsupported coin");
  }
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_market_cap=true&include_24hr_change=true`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const data = await res.json();
  return data[id];
}

function formatUsd(value) {
  return Number(value || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  });
}

module.exports = { fetchCryptoPrice, formatUsd };
