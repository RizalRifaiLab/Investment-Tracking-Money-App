-- Live prices: stocks/ETFs/IDX move from Finnhub to Yahoo; a cron job refreshes the prices table every 5 minutes.
alter table holdings drop constraint holdings_provider_check;
update holdings set provider = 'yahoo' where provider = 'finnhub';
alter table holdings add constraint holdings_provider_check check (provider in ('coingecko', 'yahoo'));

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Calls the web app's refresh route. The bearer secret lives in Vault as 'cron_secret' (same value as CRON_SECRET on Vercel).
select cron.schedule('refresh-prices', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://nilai-pied.vercel.app/api/prices/refresh',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    timeout_milliseconds := 30000
  );
$$);
