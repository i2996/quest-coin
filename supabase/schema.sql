-- ============================================================
-- 퀘스트 코인 (quest-coin) — 전체 스키마
-- Supabase SQL Editor 에 통째로 붙여넣고 Run. 여러 번 실행해도 안전해요.
-- '우리 가족' 앱과 같은 Supabase 프로젝트를 써도 되도록 모든 이름 앞에 qc_ 를 붙였어요.
-- 필요 설정: Authentication → Anonymous sign-ins 켜기
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- 테이블 ----------
create table if not exists public.qc_spaces (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  name          text not null default '우리 집',
  coin_rate     int  not null default 100 check (coin_rate > 0),   -- 1코인 = 몇 원 (용돈 교환)
  auto_approve  boolean not null default false,                   -- 완료하면 부모 확인 없이 바로 적립
  created_at    timestamptz not null default now()
);

create table if not exists public.qc_space_secrets (
  space_id        uuid primary key references public.qc_spaces(id) on delete cascade,
  password_hash   text not null,
  parent_pin_hash text not null
);

create table if not exists public.qc_access (
  user_id    uuid not null,
  space_id   uuid not null references public.qc_spaces(id) on delete cascade,
  role       text not null default 'member' check (role in ('member', 'parent')),
  created_at timestamptz not null default now(),
  primary key (user_id, space_id)
);

create table if not exists public.qc_kids (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references public.qc_spaces(id) on delete cascade,
  name       text not null,
  emoji      text not null default '🦊',
  color      text not null default '#7c5cff',
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);

-- 심부름(chore) + 돌발 미션(surprise)
create table if not exists public.qc_missions (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.qc_spaces(id) on delete cascade,
  kind        text not null default 'chore',             -- chore | surprise | quick(말로 시킨 심부름 기록)
  title       text not null,
  memo        text,
  emoji       text not null default '🧹',
  reward      int  not null default 10 check (reward >= 0),
  kid_ids     uuid[] not null default '{}',          -- 비어 있으면 모든 아이
  repeat      text not null default 'none' check (repeat in ('none', 'daily', 'weekly')),
  repeat_days int[] not null default '{}',           -- weekly: 0=일 … 6=토
  start_date  date not null default current_date,
  due_date    date,                                  -- none: 이 날까지 (비우면 기한 없음)
  expires_at  timestamptz,                           -- surprise: 마감 시각
  first_come  boolean not null default false,        -- surprise: 한 명만(선착순)
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists qc_missions_space_idx on public.qc_missions(space_id);
alter table public.qc_missions drop constraint if exists qc_missions_kind_check;
alter table public.qc_missions add constraint qc_missions_kind_check check (kind in ('chore', 'surprise', 'quick'));

-- 아이가 '다 했어요' 를 누른 기록 (날짜별)
create table if not exists public.qc_submissions (
  id              uuid primary key default gen_random_uuid(),
  space_id        uuid not null references public.qc_spaces(id) on delete cascade,
  mission_id      uuid not null references public.qc_missions(id) on delete cascade,
  kid_id          uuid not null references public.qc_kids(id) on delete cascade,
  occurrence_date date not null,
  status          text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reward          int  not null default 0,
  created_at      timestamptz not null default now(),
  decided_at      timestamptz,
  unique (mission_id, kid_id, occurrence_date)
);
create index if not exists qc_submissions_space_idx on public.qc_submissions(space_id, status);

-- 퀘스트: 주간/월간 미션 모두 완료(all) 또는 심부름 n개(count)
create table if not exists public.qc_quests (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.qc_spaces(id) on delete cascade,
  title       text not null,
  emoji       text not null default '🏆',
  goal        text not null default 'count' check (goal in ('count', 'all')),
  target      int  not null default 10 check (target > 0),     -- count 일 때 목표 개수
  period      text not null default 'week' check (period in ('week', 'month', 'range')),
  start_date  date,                                            -- range 일 때
  end_date    date,
  mission_ids uuid[] not null default '{}',                    -- all 일 때 대상 미션 (비우면 전체 심부름)
  kid_ids     uuid[] not null default '{}',
  reward      int  not null default 50 check (reward >= 0),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.qc_quest_claims (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references public.qc_spaces(id) on delete cascade,
  quest_id   uuid not null references public.qc_quests(id) on delete cascade,
  kid_id     uuid not null references public.qc_kids(id) on delete cascade,
  period_key text not null,
  reward     int  not null,
  created_at timestamptz not null default now(),
  unique (quest_id, kid_id, period_key)
);

-- 기프티콘 상점 목록 (부모가 추가)
create table if not exists public.qc_shop_items (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references public.qc_spaces(id) on delete cascade,
  title      text not null,
  emoji      text not null default '🍫',
  category   text not null default 'snack' check (category in ('snack', 'delivery', 'toy', 'etc')),
  price      int  not null check (price > 0),
  memo       text,
  stock      int  check (stock is null or stock >= 0),   -- null = 무제한
  active     boolean not null default true,
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);

-- 코인 사용 요청: 용돈 교환(cash) / 기프티콘(shop) / 부모에게 지불·대리구매(proxy)
create table if not exists public.qc_requests (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.qc_spaces(id) on delete cascade,
  kid_id      uuid not null references public.qc_kids(id) on delete cascade,
  kind        text not null check (kind in ('cash', 'shop', 'proxy')),
  title       text not null,
  emoji       text,
  coins       int  not null check (coins > 0),
  won         int,                                   -- cash: 받을 금액
  item_id     uuid references public.qc_shop_items(id) on delete set null,
  memo        text,
  status      text not null default 'pending' check (status in ('pending', 'done', 'rejected', 'canceled')),
  parent_note text,
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);
create index if not exists qc_requests_space_idx on public.qc_requests(space_id, status);

-- 코인 장부 (잔액 = 합계)
create table if not exists public.qc_ledger (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references public.qc_spaces(id) on delete cascade,
  kid_id     uuid not null references public.qc_kids(id) on delete cascade,
  amount     int  not null,
  reason     text not null,
  ref_type   text,
  ref_id     uuid,
  created_at timestamptz not null default now()
);
create index if not exists qc_ledger_kid_idx on public.qc_ledger(kid_id);
create index if not exists qc_ledger_ref_idx on public.qc_ledger(ref_id);

-- 아이별 한 달 용돈(현금) 교환 한도 (원). null = 제한 없음
alter table public.qc_kids add column if not exists cash_limit int default 10000 check (cash_limit is null or cash_limit >= 0);

-- 같이 모으기: 형제가 코인을 모아 치킨 같은 걸 사달라고 함
create table if not exists public.qc_goals (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references public.qc_spaces(id) on delete cascade,
  kid_id     uuid references public.qc_kids(id) on delete set null,   -- 만든 아이
  title      text not null,
  emoji      text not null default '🍗',
  target     int  not null check (target > 0),
  status     text not null default 'open' check (status in ('open', 'full', 'done', 'canceled')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists qc_goals_space_idx on public.qc_goals(space_id);

-- ---------- 권한 확인 함수 ----------
create or replace function public.qc_is_member(p_space uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.qc_access where user_id = auth.uid() and space_id = p_space);
$$;

create or replace function public.qc_is_parent(p_space uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.qc_access where user_id = auth.uid() and space_id = p_space and role = 'parent');
$$;

create or replace function public.qc_balance(p_kid uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0)::int from public.qc_ledger where kid_id = p_kid;
$$;

-- 이번 달(한국 시간) 용돈 교환으로 쓴 금액 (대기 중 포함, 거절·취소 제외)
create or replace function public.qc_cash_used(p_kid uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(won), 0)::int from public.qc_requests
   where kid_id = p_kid and kind = 'cash' and status in ('pending', 'done')
     and created_at >= (date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul');
$$;

-- 같이 모으기 목표에 모인 코인
create or replace function public.qc_goal_sum(p_goal uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(-sum(amount), 0)::int from public.qc_ledger where ref_id = p_goal and ref_type in ('goal', 'refund');
$$;

-- ---------- RLS ----------
alter table public.qc_spaces        enable row level security;
alter table public.qc_space_secrets enable row level security;  -- 정책 없음 = 클라이언트 접근 불가
alter table public.qc_access        enable row level security;
alter table public.qc_kids          enable row level security;
alter table public.qc_missions      enable row level security;
alter table public.qc_submissions   enable row level security;
alter table public.qc_quests        enable row level security;
alter table public.qc_quest_claims  enable row level security;
alter table public.qc_shop_items    enable row level security;
alter table public.qc_requests      enable row level security;
alter table public.qc_ledger        enable row level security;
alter table public.qc_goals         enable row level security;

drop policy if exists qc_spaces_read on public.qc_spaces;
create policy qc_spaces_read on public.qc_spaces for select to authenticated using (public.qc_is_member(id));
drop policy if exists qc_spaces_write on public.qc_spaces;
create policy qc_spaces_write on public.qc_spaces for update to authenticated
  using (public.qc_is_parent(id)) with check (public.qc_is_parent(id));

drop policy if exists qc_access_read on public.qc_access;
create policy qc_access_read on public.qc_access for select to authenticated using (user_id = auth.uid());

-- 읽기는 가족 모두, 쓰기는 부모 모드 기기만 (아이 몫의 쓰기는 아래 함수들이 처리)
do $$
declare t text;
begin
  foreach t in array array['qc_kids', 'qc_missions', 'qc_quests', 'qc_shop_items'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.qc_is_member(space_id))', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.qc_is_parent(space_id)) with check (public.qc_is_parent(space_id))', t || '_write', t);
  end loop;
  foreach t in array array['qc_submissions', 'qc_quest_claims', 'qc_requests', 'qc_ledger', 'qc_goals'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.qc_is_member(space_id))', t || '_read', t);
  end loop;
end $$;

-- ---------- 가족 공간 ----------
create or replace function public.qc_create_space(p_name text, p_code text, p_password text, p_parent_pin text)
returns public.qc_spaces
language plpgsql security definer set search_path = public, extensions as $$
declare s public.qc_spaces;
begin
  if auth.uid() is null then raise exception '로그인 세션이 없어요'; end if;
  if length(coalesce(p_password, '')) < 4 then raise exception '비밀번호는 4자 이상이어야 해요'; end if;
  if length(coalesce(p_parent_pin, '')) < 4 then raise exception '부모 PIN 은 4자리 이상이어야 해요'; end if;
  insert into public.qc_spaces(code, name) values (upper(p_code), coalesce(nullif(trim(p_name), ''), '우리 집')) returning * into s;
  insert into public.qc_space_secrets(space_id, password_hash, parent_pin_hash)
    values (s.id, crypt(p_password, gen_salt('bf')), crypt(p_parent_pin, gen_salt('bf')));
  insert into public.qc_access(user_id, space_id, role) values (auth.uid(), s.id, 'parent');
  return s;
end $$;

create or replace function public.qc_join_space(p_code text, p_password text)
returns public.qc_spaces
language plpgsql security definer set search_path = public, extensions as $$
declare s public.qc_spaces; h text;
begin
  if auth.uid() is null then raise exception '로그인 세션이 없어요'; end if;
  select * into s from public.qc_spaces where code = upper(trim(p_code));
  if not found then raise exception '코드 또는 비밀번호가 맞지 않아요'; end if;
  select password_hash into h from public.qc_space_secrets where space_id = s.id;
  if h is null or crypt(p_password, h) <> h then raise exception '코드 또는 비밀번호가 맞지 않아요'; end if;
  insert into public.qc_access(user_id, space_id) values (auth.uid(), s.id) on conflict do nothing;
  return s;
end $$;

create or replace function public.qc_parent_login(p_space_id uuid, p_pin text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare h text;
begin
  if not public.qc_is_member(p_space_id) then raise exception '가족 공간에 먼저 들어와야 해요'; end if;
  select parent_pin_hash into h from public.qc_space_secrets where space_id = p_space_id;
  if h is null or crypt(p_pin, h) <> h then return false; end if;
  update public.qc_access set role = 'parent' where user_id = auth.uid() and space_id = p_space_id;
  return true;
end $$;

create or replace function public.qc_parent_logout(p_space_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.qc_access set role = 'member' where user_id = auth.uid() and space_id = p_space_id;
$$;

create or replace function public.qc_my_role(p_space_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from public.qc_access where user_id = auth.uid() and space_id = p_space_id;
$$;

create or replace function public.qc_change_secret(p_space_id uuid, p_which text, p_value text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.qc_is_parent(p_space_id) then raise exception '부모만 바꿀 수 있어요'; end if;
  if length(coalesce(p_value, '')) < 4 then raise exception '4자 이상 입력해주세요'; end if;
  if p_which = 'password' then
    update public.qc_space_secrets set password_hash = crypt(p_value, gen_salt('bf')) where space_id = p_space_id;
  elsif p_which = 'pin' then
    update public.qc_space_secrets set parent_pin_hash = crypt(p_value, gen_salt('bf')) where space_id = p_space_id;
  else
    raise exception '알 수 없는 항목';
  end if;
end $$;

-- ---------- 미션 완료 → 승인 → 적립 ----------
create or replace function public.qc_submit(p_mission_id uuid, p_kid_id uuid, p_date date)
returns public.qc_submissions
language plpgsql security definer set search_path = public as $$
declare m public.qc_missions; k public.qc_kids; sp public.qc_spaces; r public.qc_submissions; st text;
begin
  select * into m from public.qc_missions where id = p_mission_id;
  if not found or not public.qc_is_member(m.space_id) then raise exception '미션을 찾을 수 없어요'; end if;
  select * into k from public.qc_kids where id = p_kid_id and space_id = m.space_id;
  if not found then raise exception '아이를 찾을 수 없어요'; end if;
  if cardinality(m.kid_ids) > 0 and not (p_kid_id = any(m.kid_ids)) then raise exception '이 아이의 미션이 아니에요'; end if;
  if not m.active then raise exception '끝난 미션이에요'; end if;
  if m.kind = 'surprise' then
    if m.expires_at is not null and m.expires_at < now() then raise exception '시간이 지났어요 ⏰'; end if;
    perform 1 from public.qc_missions where id = m.id for update;   -- 선착순 동시 처리
    if m.first_come and exists (select 1 from public.qc_submissions
        where mission_id = m.id and kid_id <> p_kid_id and status <> 'rejected') then
      raise exception '아쉽게도 다른 친구가 먼저 해냈어요!';
    end if;
  end if;
  select * into sp from public.qc_spaces where id = m.space_id;
  st := case when sp.auto_approve then 'approved' else 'pending' end;

  insert into public.qc_submissions(space_id, mission_id, kid_id, occurrence_date, status, reward, decided_at)
    values (m.space_id, m.id, p_kid_id, p_date, st, m.reward, case when st = 'approved' then now() end)
  on conflict (mission_id, kid_id, occurrence_date) do update
    set status = excluded.status, reward = excluded.reward, created_at = now(), decided_at = excluded.decided_at
    where public.qc_submissions.status = 'rejected'
  returning * into r;
  if r.id is null then raise exception '이미 완료한 미션이에요'; end if;

  if st = 'approved' and m.reward > 0 then
    insert into public.qc_ledger(space_id, kid_id, amount, reason, ref_type, ref_id)
      values (m.space_id, p_kid_id, m.reward, m.title, 'submission', r.id);
  end if;
  return r;
end $$;

-- 아이가 실수로 누른 완료 취소 (승인 전만)
create or replace function public.qc_unsubmit(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.qc_submissions;
begin
  select * into r from public.qc_submissions where id = p_id;
  if not found or not public.qc_is_member(r.space_id) then raise exception '기록을 찾을 수 없어요'; end if;
  if r.status <> 'pending' then raise exception '이미 확인이 끝났어요'; end if;
  delete from public.qc_submissions where id = p_id;
end $$;

create or replace function public.qc_decide_submission(p_id uuid, p_approve boolean)
returns public.qc_submissions
language plpgsql security definer set search_path = public as $$
declare r public.qc_submissions; m public.qc_missions;
begin
  select * into r from public.qc_submissions where id = p_id for update;
  if not found or not public.qc_is_parent(r.space_id) then raise exception '부모만 확인할 수 있어요'; end if;
  if r.status <> 'pending' then return r; end if;
  update public.qc_submissions set status = case when p_approve then 'approved' else 'rejected' end, decided_at = now()
    where id = p_id returning * into r;
  if p_approve and r.reward > 0 then
    select * into m from public.qc_missions where id = r.mission_id;
    insert into public.qc_ledger(space_id, kid_id, amount, reason, ref_type, ref_id)
      values (r.space_id, r.kid_id, r.reward, coalesce(m.title, '미션'), 'submission', r.id);
  end if;
  return r;
end $$;

-- 부모가 아이 대신 바로 완료 처리 (바로 적립)
create or replace function public.qc_complete_for(p_mission_id uuid, p_kid_id uuid, p_date date)
returns public.qc_submissions
language plpgsql security definer set search_path = public as $$
declare m public.qc_missions; r public.qc_submissions;
begin
  select * into m from public.qc_missions where id = p_mission_id;
  if not found or not public.qc_is_parent(m.space_id) then raise exception '부모만 할 수 있어요'; end if;
  perform 1 from public.qc_kids where id = p_kid_id and space_id = m.space_id;
  if not found then raise exception '아이를 찾을 수 없어요'; end if;
  insert into public.qc_submissions(space_id, mission_id, kid_id, occurrence_date, status, reward, decided_at)
    values (m.space_id, m.id, p_kid_id, p_date, 'pending', m.reward, null)
  on conflict (mission_id, kid_id, occurrence_date) do update set status = 'pending', reward = excluded.reward
    where public.qc_submissions.status = 'rejected'
  returning * into r;
  if r.id is null then
    select * into r from public.qc_submissions where mission_id = m.id and kid_id = p_kid_id and occurrence_date = p_date;
  end if;
  return public.qc_decide_submission(r.id, true);
end $$;

-- 부모: 앱에 없던 심부름을 말로 시켰을 때 → 바로 완료 기록 + 적립 (퀘스트 '심부름 n개' 에도 +1)
create or replace function public.qc_quick_chore(p_space_id uuid, p_kid_ids uuid[], p_title text, p_emoji text, p_reward int, p_date date)
returns int
language plpgsql security definer set search_path = public as $$
declare m public.qc_missions; k uuid; n int := 0;
begin
  if not public.qc_is_parent(p_space_id) then raise exception '부모만 할 수 있어요'; end if;
  if trim(coalesce(p_title, '')) = '' then raise exception '무슨 심부름인지 적어주세요'; end if;
  if cardinality(coalesce(p_kid_ids, '{}')) = 0 then raise exception '누가 했는지 골라주세요'; end if;
  insert into public.qc_missions(space_id, kind, title, emoji, reward, kid_ids, start_date, active)
    values (p_space_id, 'quick', trim(p_title), coalesce(nullif(p_emoji, ''), '✍️'), greatest(coalesce(p_reward, 0), 0), p_kid_ids, p_date, true)
    returning * into m;
  foreach k in array p_kid_ids loop
    perform 1 from public.qc_kids where id = k and space_id = p_space_id;
    if not found then raise exception '아이를 찾을 수 없어요'; end if;
    insert into public.qc_submissions(space_id, mission_id, kid_id, occurrence_date, status, reward, decided_at)
      values (p_space_id, m.id, k, p_date, 'approved', m.reward, now());
    if m.reward > 0 then
      insert into public.qc_ledger(space_id, kid_id, amount, reason, ref_type, ref_id)
        values (p_space_id, k, m.reward, m.title, 'submission', m.id);
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- 퀘스트 보상 ----------
create or replace function public.qc_claim_quest(p_quest_id uuid, p_kid_id uuid, p_period_key text)
returns public.qc_quest_claims
language plpgsql security definer set search_path = public as $$
declare q public.qc_quests; c public.qc_quest_claims;
begin
  select * into q from public.qc_quests where id = p_quest_id;
  if not found or not public.qc_is_member(q.space_id) then raise exception '퀘스트를 찾을 수 없어요'; end if;
  perform 1 from public.qc_kids where id = p_kid_id and space_id = q.space_id;
  if not found then raise exception '아이를 찾을 수 없어요'; end if;
  insert into public.qc_quest_claims(space_id, quest_id, kid_id, period_key, reward)
    values (q.space_id, q.id, p_kid_id, p_period_key, q.reward)
  on conflict do nothing returning * into c;
  if c.id is null then raise exception '이미 보상을 받았어요'; end if;
  if q.reward > 0 then
    insert into public.qc_ledger(space_id, kid_id, amount, reason, ref_type, ref_id)
      values (q.space_id, p_kid_id, q.reward, '퀘스트 · ' || q.title, 'quest', c.id);
  end if;
  return c;
end $$;

-- ---------- 코인 사용 요청 ----------
create or replace function public.qc_create_request(
  p_kid_id uuid, p_kind text, p_title text, p_coins int, p_item_id uuid, p_memo text)
returns public.qc_requests
language plpgsql security definer set search_path = public as $$
declare k public.qc_kids; sp public.qc_spaces; it public.qc_shop_items; r public.qc_requests;
        v_title text := trim(coalesce(p_title, '')); v_coins int := p_coins; v_emoji text; v_won int;
begin
  select * into k from public.qc_kids where id = p_kid_id for update;   -- 같은 아이의 동시 결제 막기
  if not found or not public.qc_is_member(k.space_id) then raise exception '아이를 찾을 수 없어요'; end if;
  select * into sp from public.qc_spaces where id = k.space_id;

  if p_kind = 'shop' then
    select * into it from public.qc_shop_items where id = p_item_id and space_id = k.space_id for update;
    if not found or not it.active then raise exception '판매하지 않는 상품이에요'; end if;
    if it.stock is not null and it.stock <= 0 then raise exception '품절이에요'; end if;
    v_title := it.title; v_coins := it.price; v_emoji := it.emoji;
    if it.stock is not null then update public.qc_shop_items set stock = stock - 1 where id = it.id; end if;
  elsif p_kind = 'cash' then
    v_title := '용돈 교환'; v_emoji := '💵'; v_won := v_coins * sp.coin_rate;
    if k.cash_limit is not null and public.qc_cash_used(k.id) + coalesce(v_won, 0) > k.cash_limit then
      raise exception '이번 달 용돈 한도를 넘어요 (남은 한도 %원). 남은 코인은 상점이나 같이 모으기에 쓰거나 다음 달까지 모아둘 수 있어요',
        greatest(k.cash_limit - public.qc_cash_used(k.id), 0);
    end if;
  elsif p_kind = 'proxy' then
    if v_title = '' then raise exception '무엇을 사고 싶은지 적어주세요'; end if;
    v_emoji := '🙏';
  else
    raise exception '알 수 없는 요청';
  end if;

  if coalesce(v_coins, 0) <= 0 then raise exception '코인을 1개 이상 입력해주세요'; end if;
  if public.qc_balance(k.id) < v_coins then raise exception '코인이 모자라요'; end if;

  insert into public.qc_requests(space_id, kid_id, kind, title, emoji, coins, won, item_id, memo)
    values (k.space_id, k.id, p_kind, v_title, v_emoji, v_coins, v_won, it.id, nullif(trim(coalesce(p_memo, '')), ''))
    returning * into r;
  insert into public.qc_ledger(space_id, kid_id, amount, reason, ref_type, ref_id)
    values (k.space_id, k.id, -v_coins,
            case p_kind when 'shop' then '기프티콘 · ' || v_title when 'cash' then '용돈 교환' else '부모님께 지불 · ' || v_title end,
            'request', r.id);
  return r;
end $$;

-- 부모: 처리 완료(done) / 거절(rejected, 코인 돌려줌). 아이: 대기 중 요청 취소(canceled, 코인 돌려줌)
create or replace function public.qc_decide_request(p_id uuid, p_status text, p_note text)
returns public.qc_requests
language plpgsql security definer set search_path = public as $$
declare r public.qc_requests;
begin
  select * into r from public.qc_requests where id = p_id for update;
  if not found or not public.qc_is_member(r.space_id) then raise exception '요청을 찾을 수 없어요'; end if;
  if p_status in ('done', 'rejected') and not public.qc_is_parent(r.space_id) then raise exception '부모만 처리할 수 있어요'; end if;
  if p_status not in ('done', 'rejected', 'canceled') then raise exception '알 수 없는 상태'; end if;
  if r.status <> 'pending' then raise exception '이미 처리된 요청이에요'; end if;
  update public.qc_requests set status = p_status, parent_note = nullif(trim(coalesce(p_note, '')), ''), decided_at = now()
    where id = p_id returning * into r;
  if p_status in ('rejected', 'canceled') then
    insert into public.qc_ledger(space_id, kid_id, amount, reason, ref_type, ref_id)
      values (r.space_id, r.kid_id, r.coins, case p_status when 'rejected' then '돌려받음 · ' else '취소 · ' end || r.title, 'refund', r.id);
    if r.kind = 'shop' and r.item_id is not null then
      update public.qc_shop_items set stock = stock + 1 where id = r.item_id and stock is not null;
    end if;
  end if;
  return r;
end $$;

-- 부모: 보너스 / 차감
create or replace function public.qc_adjust(p_kid_id uuid, p_amount int, p_reason text)
returns public.qc_ledger
language plpgsql security definer set search_path = public as $$
declare k public.qc_kids; l public.qc_ledger;
begin
  select * into k from public.qc_kids where id = p_kid_id;
  if not found or not public.qc_is_parent(k.space_id) then raise exception '부모만 할 수 있어요'; end if;
  if coalesce(p_amount, 0) = 0 then raise exception '0 이 아닌 숫자를 입력해주세요'; end if;
  insert into public.qc_ledger(space_id, kid_id, amount, reason, ref_type)
    values (k.space_id, k.id, p_amount,
            coalesce(nullif(trim(coalesce(p_reason, '')), ''), case when p_amount > 0 then '보너스' else '차감' end), 'adjust')
    returning * into l;
  return l;
end $$;

-- ---------- 아이끼리 코인 보내기 ----------
create or replace function public.qc_transfer(p_from uuid, p_to uuid, p_coins int, p_memo text)
returns void
language plpgsql security definer set search_path = public as $$
declare a public.qc_kids; b public.qc_kids; t uuid := gen_random_uuid(); m text := nullif(trim(coalesce(p_memo, '')), '');
begin
  select * into a from public.qc_kids where id = p_from for update;   -- 같은 아이의 동시 사용 막기
  if not found or not public.qc_is_member(a.space_id) then raise exception '아이를 찾을 수 없어요'; end if;
  select * into b from public.qc_kids where id = p_to and space_id = a.space_id;
  if not found then raise exception '받을 사람을 찾을 수 없어요'; end if;
  if a.id = b.id then raise exception '나에게는 보낼 수 없어요'; end if;
  if coalesce(p_coins, 0) <= 0 then raise exception '코인을 1개 이상 입력해주세요'; end if;
  if public.qc_balance(a.id) < p_coins then raise exception '코인이 모자라요'; end if;
  insert into public.qc_ledger(space_id, kid_id, amount, reason, ref_type, ref_id) values
    (a.space_id, a.id, -p_coins, '💌 ' || b.name || '에게 보냄' || coalesce(' · ' || m, ''), 'transfer', t),
    (a.space_id, b.id,  p_coins, '💌 ' || a.name || '에게 받음' || coalesce(' · ' || m, ''), 'transfer', t);
end $$;

-- ---------- 같이 모으기 ----------
create or replace function public.qc_goal_create(p_kid_id uuid, p_title text, p_emoji text, p_target int)
returns public.qc_goals
language plpgsql security definer set search_path = public as $$
declare k public.qc_kids; g public.qc_goals;
begin
  select * into k from public.qc_kids where id = p_kid_id;
  if not found or not public.qc_is_member(k.space_id) then raise exception '아이를 찾을 수 없어요'; end if;
  if trim(coalesce(p_title, '')) = '' then raise exception '무엇을 모을지 적어주세요'; end if;
  if coalesce(p_target, 0) <= 0 then raise exception '목표 코인을 입력해주세요'; end if;
  insert into public.qc_goals(space_id, kid_id, title, emoji, target)
    values (k.space_id, k.id, trim(p_title), coalesce(nullif(p_emoji, ''), '🍗'), p_target) returning * into g;
  return g;
end $$;

create or replace function public.qc_goal_put(p_goal_id uuid, p_kid_id uuid, p_coins int)
returns public.qc_goals
language plpgsql security definer set search_path = public as $$
declare g public.qc_goals; k public.qc_kids; left_ int;
begin
  select * into g from public.qc_goals where id = p_goal_id for update;
  if not found or not public.qc_is_member(g.space_id) then raise exception '목표를 찾을 수 없어요'; end if;
  if g.status <> 'open' then raise exception '이미 다 모았거나 끝난 목표예요'; end if;
  select * into k from public.qc_kids where id = p_kid_id and space_id = g.space_id for update;
  if not found then raise exception '아이를 찾을 수 없어요'; end if;
  if coalesce(p_coins, 0) <= 0 then raise exception '코인을 1개 이상 입력해주세요'; end if;
  left_ := g.target - public.qc_goal_sum(g.id);
  if p_coins > left_ then raise exception '%코인만 더 넣으면 돼요', left_; end if;
  if public.qc_balance(k.id) < p_coins then raise exception '코인이 모자라요'; end if;
  insert into public.qc_ledger(space_id, kid_id, amount, reason, ref_type, ref_id)
    values (g.space_id, k.id, -p_coins, '🫙 같이 모으기 · ' || g.title, 'goal', g.id);
  if public.qc_goal_sum(g.id) >= g.target then
    update public.qc_goals set status = 'full' where id = g.id returning * into g;
  end if;
  return g;
end $$;

-- 부모: 사줬어요(done). 취소(canceled): 부모는 언제든, 아이는 다 모이기 전만. 취소하면 넣은 코인 돌려줌
create or replace function public.qc_goal_decide(p_goal_id uuid, p_status text)
returns public.qc_goals
language plpgsql security definer set search_path = public as $$
declare g public.qc_goals; r record;
begin
  select * into g from public.qc_goals where id = p_goal_id for update;
  if not found or not public.qc_is_member(g.space_id) then raise exception '목표를 찾을 수 없어요'; end if;
  if p_status = 'done' then
    if not public.qc_is_parent(g.space_id) then raise exception '부모만 할 수 있어요'; end if;
    if g.status <> 'full' then raise exception '아직 다 모이지 않았어요'; end if;
  elsif p_status = 'canceled' then
    if g.status not in ('open', 'full') then raise exception '이미 끝난 목표예요'; end if;
    if g.status = 'full' and not public.qc_is_parent(g.space_id) then raise exception '다 모인 목표는 부모님만 취소할 수 있어요'; end if;
    for r in select kid_id, -sum(amount) as amt from public.qc_ledger
              where ref_id = g.id and ref_type in ('goal', 'refund') group by kid_id loop
      if r.amt > 0 then
        insert into public.qc_ledger(space_id, kid_id, amount, reason, ref_type, ref_id)
          values (g.space_id, r.kid_id, r.amt, '돌려받음 · ' || g.title, 'refund', g.id);
      end if;
    end loop;
  else
    raise exception '알 수 없는 상태';
  end if;
  update public.qc_goals set status = p_status, decided_at = now() where id = g.id returning * into g;
  return g;
end $$;

-- ---------- 실행 권한 ----------
revoke all on function public.qc_create_space(text, text, text, text) from public, anon;
revoke all on function public.qc_join_space(text, text) from public, anon;
revoke all on function public.qc_parent_login(uuid, text) from public, anon;
revoke all on function public.qc_parent_logout(uuid) from public, anon;
revoke all on function public.qc_my_role(uuid) from public, anon;
revoke all on function public.qc_change_secret(uuid, text, text) from public, anon;
revoke all on function public.qc_submit(uuid, uuid, date) from public, anon;
revoke all on function public.qc_unsubmit(uuid) from public, anon;
revoke all on function public.qc_decide_submission(uuid, boolean) from public, anon;
revoke all on function public.qc_complete_for(uuid, uuid, date) from public, anon;
revoke all on function public.qc_quick_chore(uuid, uuid[], text, text, int, date) from public, anon;
revoke all on function public.qc_claim_quest(uuid, uuid, text) from public, anon;
revoke all on function public.qc_create_request(uuid, text, text, int, uuid, text) from public, anon;
revoke all on function public.qc_decide_request(uuid, text, text) from public, anon;
revoke all on function public.qc_adjust(uuid, int, text) from public, anon;
grant execute on function public.qc_create_space(text, text, text, text) to authenticated;
grant execute on function public.qc_join_space(text, text) to authenticated;
grant execute on function public.qc_parent_login(uuid, text) to authenticated;
grant execute on function public.qc_parent_logout(uuid) to authenticated;
grant execute on function public.qc_my_role(uuid) to authenticated;
grant execute on function public.qc_change_secret(uuid, text, text) to authenticated;
grant execute on function public.qc_submit(uuid, uuid, date) to authenticated;
grant execute on function public.qc_unsubmit(uuid) to authenticated;
grant execute on function public.qc_decide_submission(uuid, boolean) to authenticated;
grant execute on function public.qc_complete_for(uuid, uuid, date) to authenticated;
grant execute on function public.qc_quick_chore(uuid, uuid[], text, text, int, date) to authenticated;
grant execute on function public.qc_claim_quest(uuid, uuid, text) to authenticated;
grant execute on function public.qc_create_request(uuid, text, text, int, uuid, text) to authenticated;
grant execute on function public.qc_decide_request(uuid, text, text) to authenticated;
grant execute on function public.qc_adjust(uuid, int, text) to authenticated;
revoke all on function public.qc_transfer(uuid, uuid, int, text) from public, anon;
revoke all on function public.qc_goal_create(uuid, text, text, int) from public, anon;
revoke all on function public.qc_goal_put(uuid, uuid, int) from public, anon;
revoke all on function public.qc_goal_decide(uuid, text) from public, anon;
grant execute on function public.qc_transfer(uuid, uuid, int, text) to authenticated;
grant execute on function public.qc_goal_create(uuid, text, text, int) to authenticated;
grant execute on function public.qc_goal_put(uuid, uuid, int) to authenticated;
grant execute on function public.qc_goal_decide(uuid, text) to authenticated;

-- ---------- 실시간 ----------
do $$
declare t text;
begin
  foreach t in array array['qc_spaces', 'qc_kids', 'qc_missions', 'qc_submissions', 'qc_quests',
                           'qc_quest_claims', 'qc_shop_items', 'qc_requests', 'qc_ledger', 'qc_goals'] loop
    execute format('alter table public.%I replica identity full', t);
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
