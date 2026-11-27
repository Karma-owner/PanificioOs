-- PanificioOS · Fase 3 · Configurazione del laboratorio, inviti e team
-- Da eseguire nel SQL Editor di Supabase DOPO schema.sql e fase2_registri.sql (una sola volta).

-- 1) Impostazioni del laboratorio (operatori, celle e soglie) -------------
alter table public.tenants add column if not exists settings jsonb not null default '{}'::jsonb;

-- 2) Inviti per i colleghi ------------------------------------------------
create table if not exists public.invites (
  code        text primary key,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  role        text not null check (role in ('admin', 'capoturno', 'operatore')),
  created_by  uuid not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '7 days'),
  used_by     uuid,
  used_at     timestamptz
);
create index if not exists invites_tenant_idx on public.invites (tenant_id);

alter table public.invites enable row level security;
revoke all on public.invites from anon, authenticated;
grant select, delete on public.invites to authenticated;

drop policy if exists invites_admin_select on public.invites;
create policy invites_admin_select on public.invites
  for select to authenticated using (public.has_role(tenant_id, array['admin']));

drop policy if exists invites_admin_delete on public.invites;
create policy invites_admin_delete on public.invites
  for delete to authenticated using (public.has_role(tenant_id, array['admin']));

-- Crea un invito (solo amministratore). Restituisce il codice da dare al collega.
create or replace function public.create_invite(p_role text)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_tenant uuid;
  v_code text;
begin
  if auth.uid() is null then raise exception 'Accesso richiesto'; end if;
  if p_role not in ('admin', 'capoturno', 'operatore') then raise exception 'Ruolo non valido'; end if;

  select m.tenant_id into v_tenant from public.members m
    where m.user_id = auth.uid() and m.role = 'admin' limit 1;
  if v_tenant is null then raise exception 'Solo l''amministratore può creare inviti'; end if;

  v_code := upper(encode(extensions.gen_random_bytes(5), 'hex'));
  insert into public.invites (code, tenant_id, role, created_by) values (v_code, v_tenant, p_role, auth.uid());
  return v_code;
end $$;

revoke all on function public.create_invite(text) from public, anon;
grant execute on function public.create_invite(text) to authenticated;

-- Usa un invito: l'utente entra nel panificio con il ruolo indicato.
create or replace function public.accept_invite(p_code text, p_display_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_invite public.invites%rowtype;
begin
  if auth.uid() is null then raise exception 'Accesso richiesto'; end if;
  if char_length(trim(coalesce(p_display_name, ''))) < 2 then raise exception 'Inserisci il tuo nome'; end if;
  if exists (select 1 from public.members where user_id = auth.uid()) then
    raise exception 'Questo account appartiene già a un panificio';
  end if;

  select * into v_invite from public.invites i
    where i.code = v_code and i.used_by is null and i.expires_at > now()
    for update;
  if not found then raise exception 'Codice non valido o scaduto'; end if;

  insert into public.members (tenant_id, user_id, role, display_name)
    values (v_invite.tenant_id, auth.uid(), v_invite.role, trim(p_display_name));
  update public.invites set used_by = auth.uid(), used_at = now() where code = v_invite.code;
  return v_invite.tenant_id;
end $$;

revoke all on function public.accept_invite(text, text) from public, anon;
grant execute on function public.accept_invite(text, text) to authenticated;

-- 3) Deve restare sempre almeno un amministratore -------------------------
create or replace function public.protect_last_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'DELETE' and old.role = 'admin')
     or (tg_op = 'UPDATE' and old.role = 'admin' and new.role <> 'admin') then
    if exists (select 1 from public.tenants t where t.id = old.tenant_id)
       and not exists (
         select 1 from public.members m
         where m.tenant_id = old.tenant_id and m.role = 'admin' and m.user_id <> old.user_id
       ) then
      raise exception 'Deve restare almeno un amministratore';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists members_protect_last_admin on public.members;
create trigger members_protect_last_admin before update or delete on public.members
  for each row execute function public.protect_last_admin();
