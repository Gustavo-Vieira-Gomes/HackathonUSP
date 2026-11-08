-- Vaga Certa: protótipo. Dinheiro em centavos; horários em timestamptz, exibidos em America/Sao_Paulo.

create table public.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null
);

create table public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  agency_id uuid not null references public.agencies(id),
  distance_km numeric(4,1) not null default 0
);

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cpf text,
  email text,
  phone text,
  created_at timestamptz not null default now()
);

-- region_key vem do catálogo único (src/lib/catalog.ts), ex.: 'ressonancia.joelho'.
-- side: 'ambos' | 'esquerdo' | 'direito' | null (região sem lado).
create table public.clinic_exams (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  region_key text not null,
  side text check (side in ('ambos','esquerdo','direito')),
  display_name text not null,
  tuss text,
  room text not null,
  full_price_cents int not null check (full_price_cents > 0),
  floor_price_cents int not null check (floor_price_cents > 0),
  min_notice_hours int not null default 3,
  prep text not null default 'Nenhum',
  prep_starts text not null default '0 h antes',
  late_tolerance_min int not null default 15,
  warnings text[] not null default '{}',
  active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (floor_price_cents <= full_price_cents)
);
create index on public.clinic_exams (clinic_id);
create index on public.clinic_exams (region_key);

-- Só a Google Agenda é simulada; as demais integrações aparecem como "a caminho" no app.
create table public.calendar_connections (
  clinic_id uuid not null references public.clinics(id),
  provider text not null check (provider in ('google')),
  account_email text,
  connected boolean not null default false,
  connected_at timestamptz,
  primary key (clinic_id, provider)
);

-- Agenda da clínica: paciente marcado ou bloqueio. Vagas e reservas vêm das próprias tabelas.
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  room text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  kind text not null check (kind in ('patient','block')),
  title text not null,
  detail text,
  source text not null check (source in ('google','manual')),
  clinic_exam_id uuid references public.clinic_exams(id),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index on public.calendar_events (clinic_id, starts_at);
create index on public.calendar_events (clinic_exam_id);

create table public.vacancies (
  id uuid primary key default gen_random_uuid(),
  clinic_exam_id uuid not null references public.clinic_exams(id),
  event_id uuid references public.calendar_events(id),
  starts_at timestamptz not null,
  duration_min int not null default 40,
  reason text not null check (reason in ('cancelamento','noite','vazio')),
  status text not null default 'publicada' check (status in ('publicada','alertando','reservada','expirada')),
  alerted_count int not null default 0,
  published_at timestamptz not null default now()
);
create index on public.vacancies (clinic_exam_id);
create index on public.vacancies (event_id);

create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id),
  region_key text not null,
  side text,
  exam_label text not null,
  radius_km int not null,
  max_price_cents int not null,
  weekdays text[] not null default '{}',
  can_go_today boolean not null default false,
  expires_at timestamptz not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.waitlist (patient_id);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id),
  clinic_exam_id uuid not null references public.clinic_exams(id),
  vacancy_id uuid unique references public.vacancies(id),
  starts_at timestamptz not null,
  kind text not null check (kind in ('encaixe','normal')),
  price_cents int not null,
  deposit_cents int not null,
  payment_method text not null check (payment_method in ('pix','card')),
  status text not null default 'reservada' check (status in ('reservada','cancelada')),
  created_at timestamptz not null default now()
);
create index on public.reservations (patient_id);
create index on public.reservations (clinic_exam_id);

create table public.demo_settings (
  id int primary key default 1 check (id = 1),
  offset_hours int not null default 0
);
insert into public.demo_settings (id, offset_hours) values (1, 0);

-- "Agora" da demo: relógio real mais o avanço do operador.
create function public.demo_now() returns timestamptz
language sql stable security definer set search_path = '' as $$
  select now() + make_interval(hours => (select offset_hours from public.demo_settings where id = 1));
$$;

-- Escada de preço: cheio acima de 48 h; −10% até 24 h; −20% até 6 h; −30% depois. Nunca abaixo do piso.
create function public.price_step(p_hours_left numeric) returns int
language sql immutable set search_path = '' as $$
  select case when p_hours_left > 48 then 0 when p_hours_left > 24 then 1 when p_hours_left > 6 then 2 else 3 end;
$$;

create function public.vacancy_price_cents(p_full int, p_floor int, p_starts timestamptz) returns int
language sql stable set search_path = '' as $$
  select greatest(p_floor, round(p_full * (1 - 0.1 * public.price_step(extract(epoch from (p_starts - public.demo_now())) / 3600.0)))::int);
$$;

create view public.vacancies_live with (security_invoker = true) as
select
  v.id, v.clinic_exam_id, v.event_id, v.starts_at, v.duration_min, v.reason, v.alerted_count, v.published_at,
  ce.display_name, ce.region_key, ce.side, ce.room, ce.full_price_cents, ce.floor_price_cents, ce.warnings, ce.prep,
  c.id as clinic_id, c.name as clinic_name, c.address as clinic_address, c.distance_km,
  a.name as agency_name,
  (extract(epoch from (v.starts_at - public.demo_now())) / 3600.0)::numeric(10,2) as hours_left,
  public.price_step(extract(epoch from (v.starts_at - public.demo_now())) / 3600.0) as step,
  public.vacancy_price_cents(ce.full_price_cents, ce.floor_price_cents, v.starts_at) as price_cents,
  case
    when v.status in ('publicada','alertando') and v.starts_at <= public.demo_now() then 'expirada'
    else v.status
  end as status
from public.vacancies v
join public.clinic_exams ce on ce.id = v.clinic_exam_id
join public.clinics c on c.id = ce.clinic_id
join public.agencies a on a.id = c.agency_id;

-- RLS: leitura pública dos dados do marketplace; gravação só pelas funções de 20261108120100_functions.sql.
alter table public.agencies enable row level security;
alter table public.clinics enable row level security;
alter table public.patients enable row level security;
alter table public.clinic_exams enable row level security;
alter table public.calendar_connections enable row level security;
alter table public.calendar_events enable row level security;
alter table public.vacancies enable row level security;
alter table public.waitlist enable row level security;
alter table public.reservations enable row level security;
alter table public.demo_settings enable row level security;

create policy "leitura publica" on public.agencies for select to anon, authenticated using (true);
create policy "leitura publica" on public.clinics for select to anon, authenticated using (true);
create policy "leitura publica" on public.clinic_exams for select to anon, authenticated using (deleted_at is null);
create policy "leitura publica" on public.calendar_connections for select to anon, authenticated using (true);
create policy "leitura publica" on public.calendar_events for select to anon, authenticated using (true);
create policy "leitura publica" on public.vacancies for select to anon, authenticated using (true);
create policy "leitura publica" on public.reservations for select to anon, authenticated using (true);
create policy "leitura publica" on public.waitlist for select to anon, authenticated using (true);
create policy "leitura publica" on public.demo_settings for select to anon, authenticated using (true);
-- patients: sem leitura direta (dado pessoal); o app usa get_patient().
