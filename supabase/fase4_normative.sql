-- PanificioOS · Fase 4 · Aggiornamenti normativi e rafforzamento delle funzioni
-- GIÀ APPLICATO al progetto "PanificioOs" il 27/11/2026. Serve solo per creare un nuovo progetto da zero
-- (eseguirlo dopo schema.sql, fase2_registri.sql e fase3_configurazione.sql).

-- 1) Rafforzamento delle funzioni
alter function public.touch_app_state() set search_path = public;
alter function public.haccp_records_immutable() set search_path = public;
revoke execute on function public.has_role(uuid, text[]) from public, anon;
revoke execute on function public.is_member(uuid) from public, anon;
grant execute on function public.has_role(uuid, text[]) to authenticated;
grant execute on function public.is_member(uuid) to authenticated;
revoke execute on function public.protect_last_admin() from public, anon, authenticated;

-- 2) Aggiornamenti normativi: li inserisci TU (dal Table Editor di Supabase), tutti i clienti li leggono.
create table if not exists public.regulatory_updates (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 5 and 200),
  summary      text check (summary is null or char_length(summary) <= 500),
  source_name  text not null check (char_length(source_name) between 2 and 120),
  source_url   text not null check (source_url ~ '^https://'),
  category     text not null check (category in ('haccp', 'allergeni', 'etichettatura', 'igiene', 'rintracciabilita', 'altro')),
  kind         text not null default 'novita' check (kind in ('novita', 'riferimento')),
  published_at date,
  created_at   timestamptz not null default now()
);
create index if not exists regulatory_updates_recent_idx on public.regulatory_updates (published_at desc nulls last, created_at desc);

alter table public.regulatory_updates enable row level security;
revoke all on public.regulatory_updates from anon, authenticated;
grant select on public.regulatory_updates to authenticated;

drop policy if exists regulatory_updates_read on public.regulatory_updates;
create policy regulatory_updates_read on public.regulatory_updates
  for select to authenticated using (true);

-- Tre riferimenti ufficiali iniziali (kind = 'riferimento'). Le novità vere hanno kind = 'novita'.
insert into public.regulatory_updates (title, summary, source_name, source_url, category, kind)
select * from (values
  ('Regolamento (UE) 2021/382: cultura della sicurezza alimentare e gestione degli allergeni',
   'Testo ufficiale del regolamento che modifica l''allegato II del Reg. CE 852/2004.',
   'EUR-Lex', 'https://eur-lex.europa.eu/eli/reg/2021/382/oj?locale=it', 'haccp', 'riferimento'),
  ('Etichettatura degli alimenti: pagina del Ministero della Salute',
   'Riferimento ufficiale su etichettatura e informazioni ai consumatori.',
   'Ministero della Salute', 'https://www.salute.gov.it/new/it/tema/nutrizione/etichettatura/', 'etichettatura', 'riferimento'),
  ('Linee guida sull''etichettatura alimentare del 18 settembre 2024',
   'Pagina del Ministero delle Imprese e del Made in Italy sull''etichettatura alimentare.',
   'MIMIT', 'https://www.mimit.gov.it/it/impresa/competitivita-e-nuove-imprese/industria-alimentare/etichettatura-alimentare', 'etichettatura', 'riferimento')
) as seed(title, summary, source_name, source_url, category, kind)
where not exists (select 1 from public.regulatory_updates);
