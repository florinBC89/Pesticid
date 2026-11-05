-- Pesticid — dezabonare de la emailuri (05.11.2026): rândul rămâne pe listă (locul rezervat se păstrează), dar nu mai primește emailuri.
-- Linkul din email are un token HMAC (Edge Function `dezabonare`), ca nimeni să nu poată dezabona pe altcineva doar știindu-i adresa.
alter table public.lista_asteptare add column if not exists dezabonat_at timestamptz;
create index if not exists lista_asteptare_email_norm_idx on public.lista_asteptare (email_norm);
