-- Stablecoins have no BINANCE:<T>USDT chart; keep them out of the Markets watchlist.
update holdings set tv_symbol = null where class = 'Crypto' and upper(ticker) in ('USDT', 'USDC');
