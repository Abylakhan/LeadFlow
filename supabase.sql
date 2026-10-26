-- LeadFlow: база данных команды в Supabase (бесплатный тариф).
-- Supabase → SQL Editor → New query → вставить ВЕСЬ файл → Run. Повторный запуск безопасен.
-- Сразу после этого зарегистрируйтесь на сайте с главным email — этот аккаунт станет единственным администратором.

-- Главный аккаунт (единственный администратор)
create or replace function public.owner_email() returns text language sql immutable as $$
  select 'abylakhannurbolat06@icloud.com'::text;
$$;

-- Профили сотрудников: pending — ждёт подтверждения, active — работает, disabled — отключён
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null default '',
  role text not null default 'member' check (role in ('admin', 'member')),
  status text not null default 'pending' check (status in ('pending', 'active', 'disabled')),
  created_at timestamptz not null default now()
);

create table if not exists public.leads (
  id text primary key check (length(id) between 3 and 64),
  data jsonb not null check (pg_column_size(data) < 200000),
  owner uuid references public.profiles(id) on delete set null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
create index if not exists leads_updated_idx on public.leads (updated_at desc);
create index if not exists leads_owner_idx on public.leads (owner);

-- 'site' — контакты и цены (видны всем), 'team' — настройки команды (только сотрудникам)
create table if not exists public.app_config (
  key text primary key check (key in ('site', 'team')),
  data jsonb not null check (pg_column_size(data) < 200000),
  updated_at timestamptz not null default now()
);

-- Проверки прав
create or replace function public.is_member() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'active');
$$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'active' and role = 'admin');
$$;

-- Регистрация: главный email сразу администратор, остальные ждут подтверждения
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare owner boolean := lower(new.email) = public.owner_email();
begin
  if not owner and (select count(*) from public.profiles) >= 30 then
    raise exception 'Регистрация закрыта: слишком много заявок. Обратитесь к администратору';
  end if;
  insert into public.profiles (id, name, role, status) values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), split_part(new.email, '@', 1)), 60),
    case when owner then 'admin' else 'member' end,
    case when owner then 'active' else 'pending' end);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Защита профилей: роль менять нельзя, администратора отключить нельзя, активных не больше 10
create or replace function public.guard_profile() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.id <> old.id or new.role <> old.role then raise exception 'Роль менять нельзя'; end if;
  if old.role = 'admin' and new.status <> 'active' then raise exception 'Главный аккаунт нельзя отключить'; end if;
  if new.status = 'active' and old.status <> 'active'
     and (select count(*) from public.profiles where status = 'active') >= 10 then
    raise exception 'Лимит: не больше 10 активных сотрудников';
  end if;
  new.name := left(trim(new.name), 60);
  return new;
end $$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles for each row execute function public.guard_profile();

-- Лиды: кто и когда изменил — ставит сервер, а не браузер
create or replace function public.stamp_lead() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  new.data := jsonb_set(new.data, '{owner}', coalesce(to_jsonb(new.owner), 'null'::jsonb));
  return new;
end $$;
drop trigger if exists leads_stamp on public.leads;
create trigger leads_stamp before insert or update on public.leads for each row execute function public.stamp_lead();

-- Функции администратора
create or replace function public.admin_list_users()
returns table (id uuid, name text, email text, role text, status text, created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Только для администратора'; end if;
  return query select p.id, p.name, u.email::text, p.role, p.status, p.created_at, u.last_sign_in_at
    from public.profiles p join auth.users u on u.id = p.id order by p.created_at;
end $$;

create extension if not exists pgcrypto with schema extensions;
create or replace function public.admin_set_password(uid uuid, new_password text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then raise exception 'Только для администратора'; end if;
  if length(new_password) < 8 then raise exception 'Пароль должен быть не короче 8 символов'; end if;
  update auth.users set encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf')), updated_at = now() where id = uid;
end $$;

create or replace function public.admin_delete_user(uid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Только для администратора'; end if;
  if uid = auth.uid() then raise exception 'Нельзя удалить свой аккаунт'; end if;
  delete from auth.users where id = uid;
end $$;

revoke execute on function public.admin_list_users() from anon;
revoke execute on function public.admin_set_password(uuid, text) from anon;
revoke execute on function public.admin_delete_user(uuid) from anon;

-- Правила доступа (RLS)
alter table public.profiles enable row level security;
alter table public.leads enable row level security;
alter table public.app_config enable row level security;

drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select using (id = auth.uid() or public.is_member());
drop policy if exists "profiles admin update" on public.profiles;
create policy "profiles admin update" on public.profiles for update using (public.is_admin()) with check (public.is_admin());

-- Сотрудник видит всю базу, меняет только свободных и своих лидов; удаляет только администратор
drop policy if exists "leads team" on public.leads;
drop policy if exists "leads read" on public.leads;
create policy "leads read" on public.leads for select using (public.is_member());
drop policy if exists "leads insert" on public.leads;
create policy "leads insert" on public.leads for insert with check (public.is_member() and (owner is null or owner = auth.uid()));
drop policy if exists "leads update" on public.leads;
create policy "leads update" on public.leads for update
  using (public.is_member() and (owner is null or owner = auth.uid() or public.is_admin()))
  with check (public.is_member() and (owner is null or owner = auth.uid() or public.is_admin()));
drop policy if exists "leads delete" on public.leads;
create policy "leads delete" on public.leads for delete using (public.is_admin());

drop policy if exists "config read" on public.app_config;
create policy "config read" on public.app_config for select using (key = 'site' or public.is_member());
drop policy if exists "config admin write" on public.app_config;
create policy "config admin write" on public.app_config for all using (public.is_admin()) with check (public.is_admin());

-- Живое обновление: изменения коллег появляются без перезагрузки
do $$ begin
  alter publication supabase_realtime add table public.leads;
exception when duplicate_object then null; end $$;

-- ===== Ключи ИИ: хранятся только на сервере, сотрудники их не видят =====
create table if not exists public.ai_keys (
  id bigint generated always as identity primary key,
  provider text not null check (provider in ('gemini', 'groq', 'cerebras', 'openrouter')),
  key text not null,
  model text not null default '',
  label text not null default '',
  disabled boolean not null default false,
  cooldown_until timestamptz,
  last_used_at timestamptz,
  last_error text,
  uses integer not null default 0,
  fails integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.ai_keys enable row level security;
-- политик нет: напрямую таблицу не читает никто, только функция ИИ (service role) и функции ниже

create or replace function public.admin_add_ai_key(p_provider text, p_key text, p_model text default '', p_label text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Только для администратора'; end if;
  if length(trim(p_key)) < 20 then raise exception 'Ключ слишком короткий — скопируйте его целиком'; end if;
  if exists (select 1 from public.ai_keys where key = trim(p_key)) then raise exception 'Этот ключ уже добавлен'; end if;
  if (select count(*) from public.ai_keys) >= 30 then raise exception 'Слишком много ключей (максимум 30)'; end if;
  insert into public.ai_keys (provider, key, model, label) values (p_provider, trim(p_key), coalesce(trim(p_model), ''), left(coalesce(p_label, ''), 40));
end $$;

create or replace function public.admin_list_ai_keys()
returns table (id bigint, provider text, masked text, model text, label text, disabled boolean, cooldown_until timestamptz, last_used_at timestamptz, last_error text, uses integer, fails integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Только для администратора'; end if;
  return query select k.id, k.provider, left(k.key, 4) || '…' || right(k.key, 4), k.model, k.label, k.disabled, k.cooldown_until, k.last_used_at, k.last_error, k.uses, k.fails
    from public.ai_keys k order by k.created_at;
end $$;

create or replace function public.admin_update_ai_key(p_id bigint, p_disabled boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Только для администратора'; end if;
  update public.ai_keys set disabled = p_disabled, cooldown_until = null, last_error = case when p_disabled then last_error else null end where id = p_id;
end $$;

create or replace function public.admin_delete_ai_key(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Только для администратора'; end if;
  delete from public.ai_keys where id = p_id;
end $$;
revoke execute on function public.admin_add_ai_key(text, text, text, text) from anon;
revoke execute on function public.admin_list_ai_keys() from anon;
revoke execute on function public.admin_update_ai_key(bigint, boolean) from anon;
revoke execute on function public.admin_delete_ai_key(bigint) from anon;

-- ===== История поиска команды: чтобы не искать одно и то же дважды =====
create table if not exists public.searches (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null default auth.uid(),
  user_name text not null default '',
  category text not null,
  city text not null,
  found integer not null default 0,
  added integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists searches_created_idx on public.searches (created_at desc);
alter table public.searches enable row level security;
drop policy if exists "searches read" on public.searches;
create policy "searches read" on public.searches for select using (public.is_member());
drop policy if exists "searches insert" on public.searches;
create policy "searches insert" on public.searches for insert with check (public.is_member() and user_id = auth.uid());
drop policy if exists "searches admin delete" on public.searches;
create policy "searches admin delete" on public.searches for delete using (public.is_admin());

-- ===== Журнал действий для соревнования и отчётов: пишет только сервер, подделать нельзя =====
create table if not exists public.activity (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  lead_id text,
  type text not null,
  value numeric not null default 1,
  created_at timestamptz not null default now()
);
create index if not exists activity_time_idx on public.activity (created_at);
create index if not exists activity_user_time_idx on public.activity (user_id, created_at);
alter table public.activity enable row level security;
drop policy if exists "activity read" on public.activity;
create policy "activity read" on public.activity for select using (public.is_member());
-- вставлять, менять и удалять записи из браузера нельзя: политик на запись нет

create or replace function public.jnum(j jsonb, k text) returns numeric language sql immutable as $$
  select coalesce(nullif(regexp_replace(coalesce(j->>k, ''), '[^0-9.]', '', 'g'), '')::numeric, 0);
$$;

create or replace function public.log_lead_activity() returns trigger language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  o jsonb := case when tg_op = 'UPDATE' then old.data else '{}'::jsonb end;
  n jsonb := new.data;
  admin boolean := public.is_admin();
  credit uuid;
begin
  if uid is null or coalesce(n->>'deleted', '') = 'true' then return new; end if;
  -- upsert сначала вызывает BEFORE INSERT и для уже существующей строки — её обработает BEFORE UPDATE
  if tg_op = 'INSERT' and exists (select 1 from public.leads where id = new.id) then return new; end if;
  -- оплату подтверждает только администратор; очки за неё получает сотрудник, который ведёт лида
  if public.jnum(n, 'paid') <> public.jnum(o, 'paid') then
    if not admin then
      new.data := jsonb_set(n, '{paid}', to_jsonb(public.jnum(o, 'paid')));
    elsif public.jnum(n, 'paid') > public.jnum(o, 'paid') then
      credit := coalesce(new.owner, uid);
      insert into public.activity (user_id, lead_id, type, value) values (credit, new.id, 'paid', public.jnum(n, 'paid') - public.jnum(o, 'paid'));
    end if;
  end if;
  if tg_op = 'INSERT' then
    insert into public.activity (user_id, lead_id, type) values (uid, new.id, 'added');
  end if;
  if public.jnum(n, 'touches') > public.jnum(o, 'touches') then
    insert into public.activity (user_id, lead_id, type, value) values (uid, new.id, 'touch', least(public.jnum(n, 'touches') - public.jnum(o, 'touches'), 5));
  end if;
  if tg_op = 'UPDATE' and coalesce(n->>'status', '') <> coalesce(o->>'status', '') then
    -- этап сделки засчитывается сотруднику, который ведёт лида (даже если статус поставил администратор)
    insert into public.activity (user_id, lead_id, type) values (coalesce(new.owner, uid), new.id, 'status:' || coalesce(n->>'status', ''));
  end if;
  return new;
end $$;
drop trigger if exists leads_activity on public.leads;
-- BEFORE-триггеры идут по алфавиту: leads_activity срабатывает раньше leads_stamp
create trigger leads_activity before insert or update on public.leads for each row execute function public.log_lead_activity();

-- ===== Права доступа к таблицам через API (поверх правил RLS выше) =====
grant usage on schema public to anon, authenticated;
grant select on public.app_config to anon;
grant select, insert, update, delete on public.app_config, public.leads to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, delete on public.searches to authenticated;
grant select on public.activity to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke all on public.ai_keys from anon, authenticated;
grant execute on function public.is_member(), public.is_admin() to authenticated;
