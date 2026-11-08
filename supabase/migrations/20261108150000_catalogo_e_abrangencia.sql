-- Catálogo conforme «Catalogo_de_exames.pdf» (08/11/2026) e abrangência do lado.
-- Antes, side = 'ambos' numa oferta queria dizer «aceita qualquer lado». Agora:
--   clinic_exams.side  = abrangência da oferta: 'unilateral' (o paciente diz o lado) | 'bilateral' (os dois lados) | null
--   reservations.side  = lado pedido pelo paciente: 'esquerdo' | 'direito' | 'ambos' | null (a conferir no pedido)
-- «Ambos» é o exame bilateral, com preço e duração próprios; não é uma vaga unilateral que aceita os dois lados.

-- 1. Abrangência da oferta e duração do exame
alter table public.clinic_exams drop constraint clinic_exams_side_check;
update public.clinic_exams set side = case when region_key = 'mamografia' then 'bilateral' else 'unilateral' end where side = 'ambos';
update public.clinic_exams set side = 'unilateral' where side in ('esquerdo','direito');
alter table public.clinic_exams add constraint clinic_exams_side_check check (side in ('unilateral','bilateral'));
alter table public.clinic_exams add column duration_min int not null default 40 check (duration_min between 10 and 240);

-- Sacro e cóccix não está no catálogo do PDF: sai das ofertas.
delete from public.clinic_exam_substitutes where clinic_exam_id in (select id from public.clinic_exams where region_key = 'ressonancia.sacro-coccix')
  or substitute_id in (select id from public.clinic_exams where region_key = 'ressonancia.sacro-coccix');
update public.clinic_exams set deleted_at = now(), active = false where region_key = 'ressonancia.sacro-coccix' and deleted_at is null;

-- 2. Lado pedido pelo paciente, guardado na reserva
alter table public.reservations add column side text check (side in ('esquerdo','direito','ambos'));

-- 3. Horário ocupado usa a duração do exame reservado
create or replace function public.room_busy(p_clinic uuid, p_room text, p_starts timestamptz, p_ends timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.calendar_events e
    where e.clinic_id = p_clinic and e.room = p_room and e.cancelled_at is null
      and e.starts_at < p_ends and e.ends_at > p_starts
  ) or exists (
    select 1 from public.reservations r join public.clinic_exams ce on ce.id = r.clinic_exam_id
    where ce.clinic_id = p_clinic and ce.room = p_room and r.status = 'reservada'
      and r.starts_at < p_ends and r.starts_at + make_interval(mins => ce.duration_min) > p_starts
  ) or exists (
    select 1 from public.vacancies v join public.clinic_exams ce on ce.id = v.clinic_exam_id
    where ce.clinic_id = p_clinic and ce.room = p_room and v.status in ('publicada','alertando')
      and v.starts_at < p_ends and v.starts_at + make_interval(mins => v.duration_min) > p_starts
  );
$$;

-- Lado pedido × abrangência da oferta: unilateral exige direito/esquerdo (ou a conferir); bilateral é «ambos».
create function public.side_for_offer(p_scope text, p_side text)
returns text language plpgsql immutable set search_path = '' as $$
begin
  if p_side is not null and p_side not in ('esquerdo','direito','ambos') then raise exception 'Lado inválido.'; end if;
  if p_scope = 'bilateral' then
    if p_side in ('esquerdo','direito') then raise exception 'Esta oferta é para os dois lados. Escolha a oferta de um lado só.'; end if;
    return 'ambos';
  elsif p_scope = 'unilateral' then
    if p_side = 'ambos' then raise exception 'Esta oferta é para um lado só. Escolha a oferta bilateral.'; end if;
    return p_side;
  end if;
  return null;
end $$;

-- 4. Ofertas por vaga: substituto só se cabe na duração do horário
create or replace view public.vacancy_offers with (security_invoker = true) as
with offers as (
  select v.id as vacancy_id, v.clinic_exam_id as offer_exam_id, false as is_substitute
  from public.vacancies v
  union all
  select v.id, s.substitute_id, true
  from public.vacancies v
  join public.clinic_exam_substitutes s on s.clinic_exam_id = v.clinic_exam_id
)
select
  v.id, o.offer_exam_id as clinic_exam_id, v.clinic_exam_id as vacancy_exam_id, o.is_substitute,
  ve.display_name as vacancy_display_name,
  v.event_id, v.starts_at, v.duration_min, v.reason, v.alerted_count, v.published_at,
  ce.display_name, ce.region_key, ce.side, ce.room, ce.full_price_cents, ce.floor_price_cents, ce.warnings, ce.prep,
  c.id as clinic_id, c.name as clinic_name, c.address as clinic_address, c.distance_km,
  a.name as agency_name,
  (extract(epoch from (v.starts_at - public.demo_now())) / 3600.0)::numeric(10,2) as hours_left,
  public.price_step(extract(epoch from (v.starts_at - public.demo_now())) / 3600.0) as step,
  public.vacancy_price_cents(ce.full_price_cents, ce.floor_price_cents, v.starts_at) as price_cents,
  case
    when v.status in ('publicada','alertando') and v.starts_at <= public.demo_now() then 'expirada'
    else v.status
  end as status,
  ce.duration_min as exam_duration_min
from offers o
join public.vacancies v on v.id = o.vacancy_id
join public.clinic_exams ce on ce.id = o.offer_exam_id
join public.clinic_exams ve on ve.id = v.clinic_exam_id
join public.clinics c on c.id = ce.clinic_id
join public.agencies a on a.id = c.agency_id
where ce.deleted_at is null
  and (not o.is_substitute or (ce.active and ce.duration_min <= v.duration_min));

-- 5. Reservas guardam o lado pedido
drop function public.reserve_vacancy(uuid, uuid, text, uuid);
create function public.reserve_vacancy(p_patient uuid, p_vacancy uuid, p_payment text, p_offer_exam uuid default null, p_side text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v public.vacancies%rowtype;
  ce public.clinic_exams%rowtype;
  v_exam uuid; v_price int; v_side text; v_id uuid;
begin
  if p_payment not in ('pix','card') then raise exception 'Forma de pagamento inválida.'; end if;
  if not exists (select 1 from public.patients where id = p_patient) then raise exception 'Paciente não encontrado.'; end if;
  select * into v from public.vacancies where id = p_vacancy for update;
  if not found then raise exception 'Vaga não encontrada.'; end if;
  if v.status not in ('publicada','alertando') or v.starts_at <= public.demo_now() then
    raise exception 'Esta vaga já foi reservada ou expirou.';
  end if;
  v_exam := coalesce(p_offer_exam, v.clinic_exam_id);
  if v_exam <> v.clinic_exam_id and not exists (
    select 1 from public.clinic_exam_substitutes s where s.clinic_exam_id = v.clinic_exam_id and s.substitute_id = v_exam
  ) then
    raise exception 'Este exame não pode ocupar esta vaga.';
  end if;
  select * into ce from public.clinic_exams where id = v_exam and deleted_at is null;
  if not found or (v_exam <> v.clinic_exam_id and (not ce.active or ce.duration_min > v.duration_min)) then
    raise exception 'Exame indisponível.';
  end if;
  v_side := public.side_for_offer(ce.side, p_side);
  v_price := public.vacancy_price_cents(ce.full_price_cents, ce.floor_price_cents, v.starts_at);
  update public.vacancies set status = 'reservada' where id = v.id;
  insert into public.reservations (patient_id, clinic_exam_id, vacancy_id, starts_at, kind, price_cents, deposit_cents, payment_method, side)
  values (p_patient, ce.id, v.id, v.starts_at, 'encaixe', v_price, round(v_price * 0.2)::int, p_payment, v_side)
  returning id into v_id;
  return v_id;
end $$;

drop function public.reserve_normal(uuid, uuid, timestamptz, text);
create function public.reserve_normal(p_patient uuid, p_clinic_exam uuid, p_starts timestamptz, p_payment text, p_side text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare ce public.clinic_exams%rowtype; v_side text; v_id uuid;
begin
  if p_payment not in ('pix','card') then raise exception 'Forma de pagamento inválida.'; end if;
  if not exists (select 1 from public.patients where id = p_patient) then raise exception 'Paciente não encontrado.'; end if;
  select * into ce from public.clinic_exams where id = p_clinic_exam and deleted_at is null and active;
  if not found then raise exception 'Exame indisponível.'; end if;
  if p_starts <= public.demo_now() then raise exception 'Este horário já passou.'; end if;
  v_side := public.side_for_offer(ce.side, p_side);
  perform pg_advisory_xact_lock(hashtext(ce.clinic_id::text || ce.room));
  if public.room_busy(ce.clinic_id, ce.room, p_starts, p_starts + make_interval(mins => ce.duration_min)) then
    raise exception 'Este horário acabou de ser ocupado. Escolha outro.';
  end if;
  insert into public.reservations (patient_id, clinic_exam_id, starts_at, kind, price_cents, deposit_cents, payment_method, side)
  values (p_patient, ce.id, p_starts, 'normal', ce.full_price_cents, round(ce.full_price_cents * 0.2)::int, p_payment, v_side)
  returning id into v_id;
  return v_id;
end $$;

-- 6. Cadastro: abrangência e duração
drop function public.upsert_clinic_exam(uuid, uuid, text, text, text, text, text, int, int, int, text, text, int, text[], boolean, uuid[]);
create function public.upsert_clinic_exam(
  p_id uuid, p_clinic uuid, p_region_key text, p_side text, p_display_name text, p_tuss text, p_room text,
  p_full_cents int, p_floor_cents int, p_min_notice_hours int, p_prep text, p_prep_starts text,
  p_late_tolerance_min int, p_warnings text[], p_active boolean, p_substitutes uuid[] default '{}', p_duration_min int default 40
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_room text;
begin
  if coalesce(trim(p_display_name), '') = '' then raise exception 'Informe o nome que o paciente vê.'; end if;
  if p_full_cents <= 0 then raise exception 'Informe o preço cheio.'; end if;
  if p_floor_cents <= 0 or p_floor_cents > p_full_cents then raise exception 'O piso não pode passar do preço cheio.'; end if;
  if p_duration_min is null or p_duration_min not between 10 and 240 then raise exception 'Informe a duração entre 10 e 240 minutos.'; end if;
  if p_side is not null and p_side not in ('unilateral','bilateral') then raise exception 'Abrangência inválida.'; end if;
  if p_id is null then
    insert into public.clinic_exams (clinic_id, region_key, side, display_name, tuss, room, full_price_cents, floor_price_cents,
      min_notice_hours, prep, prep_starts, late_tolerance_min, warnings, active, duration_min)
    values (p_clinic, p_region_key, p_side, trim(p_display_name), nullif(trim(p_tuss), ''), p_room, p_full_cents, p_floor_cents,
      p_min_notice_hours, coalesce(nullif(trim(p_prep), ''), 'Nenhum'), coalesce(nullif(trim(p_prep_starts), ''), '0 h antes'),
      p_late_tolerance_min, coalesce(p_warnings, '{}'), coalesce(p_active, true), p_duration_min)
    returning id, room into v_id, v_room;
  else
    update public.clinic_exams set
      display_name = trim(p_display_name), tuss = nullif(trim(p_tuss), ''),
      full_price_cents = p_full_cents, floor_price_cents = p_floor_cents, min_notice_hours = p_min_notice_hours,
      prep = coalesce(nullif(trim(p_prep), ''), 'Nenhum'), prep_starts = coalesce(nullif(trim(p_prep_starts), ''), '0 h antes'),
      late_tolerance_min = p_late_tolerance_min, warnings = coalesce(p_warnings, '{}'), active = coalesce(p_active, active),
      duration_min = p_duration_min, updated_at = now()
    where id = p_id and clinic_id = p_clinic and deleted_at is null
    returning id, room into v_id, v_room;
    if v_id is null then raise exception 'Exame não encontrado.'; end if;
  end if;

  delete from public.clinic_exam_substitutes where clinic_exam_id = v_id;
  insert into public.clinic_exam_substitutes (clinic_exam_id, substitute_id)
  select v_id, ce.id from public.clinic_exams ce
  where ce.id = any(coalesce(p_substitutes, '{}')) and ce.id <> v_id
    and ce.clinic_id = p_clinic and ce.room = v_room and ce.deleted_at is null;
  return v_id;
end $$;

-- 7. Dados da demo no novo formato
create or replace function public.seed_demo()
returns void language plpgsql security definer set search_path = '' as $$
declare
  d0 timestamp := date_trunc('day', now() at time zone 'America/Sao_Paulo');
  c_ivn uuid := '11111111-1111-4111-8111-111111111111';
  p_marina uuid := '22222222-2222-4222-8222-222222222222';
  a_pulso uuid; a_vitta uuid; c_dc uuid; c_lumen uuid; p_claudia uuid;
  e_joelho uuid; e_coluna uuid; e_ombro uuid; e_cranio_tc uuid; e_torax uuid; e_abd uuid; e_tireoide uuid; e_mamo uuid; e_cranio_rm uuid;
  d_joelho uuid; l_joelho uuid; v_mamo uuid;
  warn_rm text[] := array['Marca-passo ou desfibrilador','Gravidez','Clipe de aneurisma','Implante coclear','Metal no corpo','Medo de lugar fechado'];
  warn_tc text[] := array['Gravidez','Alergia a contraste'];
  warn_mg text[] := array['Gravidez ou amamentação','Prótese de silicone'];
begin
  -- "where true": o Supabase recusa DELETE sem WHERE em chamadas pela API (demo_reset).
  delete from public.reservations where true; delete from public.waitlist where true; delete from public.vacancies where true;
  delete from public.calendar_events where true; delete from public.calendar_connections where true; delete from public.clinic_exams where true;
  delete from public.patients where true; delete from public.clinics where true; delete from public.agencies where true;
  update public.demo_settings set offset_hours = 0 where id = 1;

  insert into public.agencies (name) values ('Agência Pulso') returning id into a_pulso;
  insert into public.agencies (name) values ('Agência Vitta') returning id into a_vitta;

  insert into public.clinics (id, name, address, agency_id, distance_km)
    values (c_ivn, 'Imagem Vila Nova', 'Rua das Acácias, 120', a_pulso, 2.4);
  insert into public.clinics (name, address, agency_id, distance_km)
    values ('Diagnóstico Centro', 'Av. Brasil, 1450', a_vitta, 4.1) returning id into c_dc;
  insert into public.clinics (name, address, agency_id, distance_km)
    values ('Clínica Lumen', 'Rua Harmonia, 88', a_vitta, 6.3) returning id into c_lumen;

  insert into public.patients (id, name, cpf, email, phone)
    values (p_marina, 'Marina Souza', '00000000000', 'marina@exemplo.com', '(11) 90000-0000');
  insert into public.patients (name) values ('Cláudia B.') returning id into p_claudia;

  -- Exames da Imagem Vila Nova
  insert into public.clinic_exams (clinic_id, region_key, side, display_name, room, full_price_cents, floor_price_cents, min_notice_hours, prep, warnings)
    values (c_ivn, 'ressonancia.joelho', 'unilateral', 'Ressonância de joelho', 'Ressonância', 48000, 33600, 3, 'Sem jejum. Tire objetos de metal antes de entrar.', warn_rm) returning id into e_joelho;
  insert into public.clinic_exams (clinic_id, region_key, side, display_name, room, full_price_cents, floor_price_cents, min_notice_hours, prep, warnings)
    values (c_ivn, 'ressonancia.coluna-lombar', null, 'Ressonância da coluna lombar', 'Ressonância', 62000, 43400, 3, 'Sem jejum. Tire objetos de metal antes de entrar.', warn_rm) returning id into e_coluna;
  insert into public.clinic_exams (clinic_id, region_key, side, display_name, room, full_price_cents, floor_price_cents, min_notice_hours, prep, warnings)
    values (c_ivn, 'ressonancia.ombro', 'unilateral', 'Ressonância de ombro', 'Ressonância', 48000, 33600, 3, 'Sem jejum. Tire objetos de metal antes de entrar.', warn_rm) returning id into e_ombro;
  insert into public.clinic_exams (clinic_id, region_key, side, display_name, room, full_price_cents, floor_price_cents, min_notice_hours, prep, warnings, active)
    values (c_ivn, 'ressonancia.cranio', null, 'Ressonância do crânio', 'Ressonância', 58000, 40600, 3, 'Sem jejum. Tire objetos de metal antes de entrar.', warn_rm, false) returning id into e_cranio_rm;
  insert into public.clinic_exams (clinic_id, region_key, side, display_name, room, full_price_cents, floor_price_cents, min_notice_hours, warnings)
    values (c_ivn, 'tomografia.cranio', null, 'Tomografia do crânio', 'Tomografia', 35000, 24500, 2, warn_tc) returning id into e_cranio_tc;
  insert into public.clinic_exams (clinic_id, region_key, side, display_name, room, full_price_cents, floor_price_cents, min_notice_hours, warnings, active)
    values (c_ivn, 'tomografia.torax', null, 'Tomografia do tórax', 'Tomografia', 35000, 24500, 2, warn_tc, false) returning id into e_torax;
  insert into public.clinic_exams (clinic_id, region_key, side, display_name, room, full_price_cents, floor_price_cents, min_notice_hours, prep)
    values (c_ivn, 'ultrassom.abdomen', null, 'Ultrassom do abdômen', 'Ultrassom', 16000, 11200, 1, 'Jejum de 6 horas.') returning id into e_abd;
  insert into public.clinic_exams (clinic_id, region_key, side, display_name, room, full_price_cents, floor_price_cents, min_notice_hours)
    values (c_ivn, 'ultrassom.tireoide', null, 'Ultrassom da tireoide', 'Ultrassom', 16000, 11200, 1) returning id into e_tireoide;
  insert into public.clinic_exams (clinic_id, region_key, side, display_name, room, full_price_cents, floor_price_cents, min_notice_hours, warnings)
    values (c_ivn, 'mamografia', 'bilateral', 'Mamografia bilateral', 'Mamografia', 22000, 15400, 2, warn_mg) returning id into e_mamo;

  -- Outras clínicas, para o marketplace ter comparação
  insert into public.clinic_exams (clinic_id, region_key, side, display_name, room, full_price_cents, floor_price_cents, prep, warnings)
    values (c_dc, 'ressonancia.joelho', 'unilateral', 'Ressonância de joelho', 'Ressonância', 52000, 36400, 'Sem jejum. Tire objetos de metal antes de entrar.', warn_rm) returning id into d_joelho;
  insert into public.clinic_exams (clinic_id, region_key, side, display_name, room, full_price_cents, floor_price_cents, prep, warnings)
    values (c_lumen, 'ressonancia.joelho', 'unilateral', 'Ressonância de joelho', 'Ressonância', 46000, 32200, 'Sem jejum. Tire objetos de metal antes de entrar.', warn_rm) returning id into l_joelho;

  insert into public.calendar_connections (clinic_id, provider, account_email, connected, connected_at)
    values (c_ivn, 'google', 'agenda@imagemvilanova.com.br', true, now());

  -- Agenda da Imagem Vila Nova (hoje, amanhã e depois)
  insert into public.calendar_events (clinic_id, room, starts_at, ends_at, kind, title, detail, source, clinic_exam_id)
  select c_ivn, x.room,
         (d0 + x.dia * interval '1 day' + x.ini::interval) at time zone 'America/Sao_Paulo',
         (d0 + x.dia * interval '1 day' + x.fim::interval) at time zone 'America/Sao_Paulo',
         x.kind, x.title, x.detail, x.source, x.exam
  from (values
    (0, 'Ressonância', '07:40', '08:20', 'patient', 'Ana Paula S.', 'Joelho esquerdo', 'google', e_joelho),
    (0, 'Ressonância', '09:00', '09:40', 'patient', 'Carlos M.', 'Coluna lombar', 'google', e_coluna),
    (0, 'Ressonância', '12:00', '13:00', 'block', 'Manutenção', 'Equipamento', 'manual', null),
    (0, 'Ressonância', '15:20', '16:00', 'patient', 'Pedro H.', 'Ombro direito', 'google', e_ombro),
    (0, 'Ressonância', '19:00', '19:40', 'patient', 'Renata C.', 'Joelho direito', 'manual', e_joelho),
    (0, 'Tomografia', '08:00', '08:30', 'patient', 'Roberto S.', 'Crânio', 'google', e_cranio_tc),
    (0, 'Tomografia', '11:00', '11:30', 'patient', 'Marina L.', 'Tórax', 'manual', e_torax),
    (0, 'Tomografia', '13:30', '14:00', 'patient', 'Luís F.', 'Crânio', 'google', e_cranio_tc),
    (0, 'Ultrassom', '07:30', '08:00', 'patient', 'Beatriz C.', 'Abdômen', 'manual', e_abd),
    (0, 'Ultrassom', '08:30', '09:00', 'patient', 'Rafael T.', 'Tireoide', 'google', e_tireoide),
    (0, 'Ultrassom', '10:00', '10:30', 'patient', 'Sônia A.', 'Abdômen', 'google', e_abd),
    (0, 'Ultrassom', '12:00', '13:00', 'block', 'Almoço', null, 'manual', null),
    (0, 'Ultrassom', '16:30', '17:00', 'patient', 'Diego N.', 'Tireoide', 'manual', e_tireoide),
    (0, 'Mamografia', '08:00', '08:20', 'patient', 'Fernanda O.', 'Rastreamento', 'google', e_mamo),
    (0, 'Mamografia', '09:20', '09:40', 'patient', 'Helena G.', 'Rastreamento', 'google', e_mamo),
    (0, 'Mamografia', '11:00', '11:20', 'patient', 'Patrícia V.', 'Diagnóstica', 'manual', e_mamo),
    (1, 'Ressonância', '08:00', '08:40', 'patient', 'Joana P.', 'Joelho esquerdo', 'google', e_joelho),
    (1, 'Ressonância', '09:00', '09:40', 'patient', 'Carlos M.', 'Coluna lombar', 'google', e_coluna),
    (1, 'Ressonância', '14:00', '14:40', 'patient', 'Bruno L.', 'Ombro esquerdo', 'manual', e_ombro),
    (1, 'Tomografia', '10:00', '10:30', 'patient', 'Marcos A.', 'Crânio', 'google', e_cranio_tc),
    (1, 'Ultrassom', '09:00', '09:30', 'patient', 'Lia R.', 'Abdômen', 'manual', e_abd),
    (1, 'Ultrassom', '12:00', '13:00', 'block', 'Almoço', null, 'manual', null),
    (2, 'Ressonância', '11:00', '11:40', 'patient', 'Marina L.', 'Joelho', 'google', e_joelho),
    (2, 'Mamografia', '10:00', '10:20', 'patient', 'Sueli M.', 'Rastreamento', 'google', e_mamo)
  ) as x(dia, room, ini, fim, kind, title, detail, source, exam);

  -- Vagas de encaixe. O horário de hoje cai para amanhã quando já está perto demais.
  insert into public.vacancies (clinic_exam_id, starts_at, duration_min, reason, status, alerted_count, published_at)
  select x.exam, x.ts, x.dur, x.reason, x.status, x.alerted, now() - x.ago * interval '1 minute'
  from (
    select e_joelho as exam,
      case when (d0 + interval '21 hours') at time zone 'America/Sao_Paulo' > now() + interval '2 hours'
           then (d0 + interval '21 hours') at time zone 'America/Sao_Paulo'
           else (d0 + interval '1 day 21 hours') at time zone 'America/Sao_Paulo' end as ts,
      40 as dur, 'noite' as reason, 'publicada' as status, 0 as alerted, 90 as ago
    union all
    select d_joelho, (d0 + interval '1 day 7 hours 40 minutes') at time zone 'America/Sao_Paulo', 40, 'cancelamento', 'alertando', 5, 25
    union all
    select e_joelho,
      case when (d0 + interval '17 hours') at time zone 'America/Sao_Paulo' > now() + interval '2 hours'
           then (d0 + interval '17 hours') at time zone 'America/Sao_Paulo'
           else (d0 + interval '1 day 17 hours') at time zone 'America/Sao_Paulo' end,
      40, 'cancelamento', 'alertando', 5, 12
    union all
    select l_joelho, (d0 + interval '3 days 21 hours 30 minutes') at time zone 'America/Sao_Paulo', 40, 'noite', 'publicada', 0, 200
    union all
    select e_cranio_tc,
      case when (d0 + interval '18 hours') at time zone 'America/Sao_Paulo' > now() + interval '2 hours'
           then (d0 + interval '18 hours') at time zone 'America/Sao_Paulo'
           else (d0 + interval '1 day 18 hours') at time zone 'America/Sao_Paulo' end,
      30, 'vazio', 'publicada', 0, 60
    union all
    select e_abd, (d0 + interval '1 day 15 hours') at time zone 'America/Sao_Paulo', 30, 'vazio', 'publicada', 0, 45
  ) x;

  -- Encaixe já reservado amanhã (mamografia), para o painel mostrar receita recuperada
  insert into public.vacancies (clinic_exam_id, starts_at, duration_min, reason, status, alerted_count, published_at)
    values (e_mamo, (d0 + interval '1 day 18 hours 30 minutes') at time zone 'America/Sao_Paulo', 20, 'cancelamento', 'reservada', 5, now() - interval '3 hours')
    returning id into v_mamo;
  insert into public.reservations (patient_id, clinic_exam_id, vacancy_id, starts_at, kind, price_cents, deposit_cents, payment_method)
    values (p_claudia, e_mamo, v_mamo, (d0 + interval '1 day 18 hours 30 minutes') at time zone 'America/Sao_Paulo', 'encaixe', 19800, 3960, 'pix');

  -- Marina: próxima reserva e aviso de vaga ativo
  insert into public.reservations (patient_id, clinic_exam_id, starts_at, kind, price_cents, deposit_cents, payment_method)
    values (p_marina, e_mamo, (d0 + interval '2 days 14 hours 20 minutes') at time zone 'America/Sao_Paulo', 'normal', 22000, 4400, 'pix');
  insert into public.waitlist (patient_id, region_key, side, exam_label, radius_km, max_price_cents, weekdays, can_go_today, expires_at, created_at)
    values (p_marina, 'ressonancia.joelho', 'esquerdo', 'Ressonância de joelho', 15, 40000, array['seg','ter','qua','qui','sex'], true, now() + interval '27 days', now() - interval '3 days');
end $$;

-- Extras da demo: oferta bilateral de joelho (60 min) e substitutos entre as ressonâncias de 40 min.
create or replace function public.seed_demo_substitutes()
returns void language plpgsql security definer set search_path = '' as $$
declare
  c_ivn uuid := '11111111-1111-4111-8111-111111111111';
  e_joelho uuid; e_ombro uuid; e_coluna uuid;
begin
  select id into e_joelho from public.clinic_exams where clinic_id = c_ivn and region_key = 'ressonancia.joelho' and side = 'unilateral';
  select id into e_ombro from public.clinic_exams where clinic_id = c_ivn and region_key = 'ressonancia.ombro';
  select id into e_coluna from public.clinic_exams where clinic_id = c_ivn and region_key = 'ressonancia.coluna-lombar';
  insert into public.clinic_exams (clinic_id, region_key, side, display_name, room, full_price_cents, floor_price_cents, min_notice_hours, prep, warnings, duration_min)
    values (c_ivn, 'ressonancia.joelho', 'bilateral', 'Ressonância de joelho bilateral', 'Ressonância', 86000, 60200, 3,
      'Sem jejum. Tire objetos de metal antes de entrar.',
      array['Marca-passo ou desfibrilador','Gravidez','Clipe de aneurisma','Implante coclear','Metal no corpo','Medo de lugar fechado'], 60);
  insert into public.clinic_exam_substitutes (clinic_exam_id, substitute_id) values
    (e_joelho, e_ombro), (e_joelho, e_coluna),
    (e_ombro, e_joelho), (e_ombro, e_coluna),
    (e_coluna, e_joelho);
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.demo_now() to anon, authenticated;
grant execute on function public.price_step(numeric) to anon, authenticated;
grant execute on function public.vacancy_price_cents(int, int, timestamptz) to anon, authenticated;
grant execute on function public.get_patient(uuid) to anon, authenticated;
grant execute on function public.register_patient(text, text, text, text) to anon, authenticated;
grant execute on function public.subscribe_waitlist(uuid, text, text, text, int, int, text[], boolean) to anon, authenticated;
grant execute on function public.reserve_vacancy(uuid, uuid, text, uuid, text) to anon, authenticated;
grant execute on function public.reserve_normal(uuid, uuid, timestamptz, text, text) to anon, authenticated;
grant execute on function public.publish_cancellation(uuid) to anon, authenticated;
grant execute on function public.create_calendar_event(uuid, text, timestamptz, timestamptz, text, text, text) to anon, authenticated;
grant execute on function public.set_google_connection(uuid, boolean, text) to anon, authenticated;
grant execute on function public.upsert_clinic_exam(uuid, uuid, text, text, text, text, text, int, int, int, text, text, int, text[], boolean, uuid[], int) to anon, authenticated;
grant execute on function public.delete_clinic_exam(uuid, uuid) to anon, authenticated;
grant execute on function public.demo_advance(int) to anon, authenticated;
grant execute on function public.demo_reset() to anon, authenticated;

select public.demo_reset();
