export const ASSET_CLASSES = ['Crypto', 'IDX stocks', 'US stocks', 'ETF', 'Deposito', 'Reksa dana', 'Gold'] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

export const CATEGORIES = ['Salary', 'Income', 'Food', 'Transport', 'Bills', 'Shopping', 'Transfer', 'Investment', 'Other'] as const;
export type Category = (typeof CATEGORIES)[number];

export type RiskProfile = 'Conservative' | 'Balanced' | 'Aggressive';
/** Assumed annual return, % */
export const RETURN_PCT: Record<RiskProfile, number> = { Conservative: 6, Balanced: 9, Aggressive: 12 };
/** Max share of net worth in crypto */
export const CRYPTO_CAP: Record<RiskProfile, number> = { Conservative: 0.1, Balanced: 0.2, Aggressive: 0.35 };

/** Ticker → CoinGecko id for live crypto prices */
export const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', BNB: 'binancecoin', XRP: 'ripple', DOGE: 'dogecoin', ADA: 'cardano',
  USDT: 'tether', USDC: 'usd-coin', AVAX: 'avalanche-2', DOT: 'polkadot', LINK: 'chainlink', TON: 'the-open-network', TRX: 'tron',
};

export const FALLBACK_USD_IDR = 16250;
