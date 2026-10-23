-- Birth year so the advisor can tailor advice to age and time horizon.
alter table profiles add column birth_year int check (birth_year between 1900 and 2100);
