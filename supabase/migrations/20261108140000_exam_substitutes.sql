-- Exames substitutos: quando um agendamento do exame A é cancelado, o horário pode ser ocupado
-- também pelos exames que a clínica marcou como substitutos de A (mesma clínica e mesma sala).
-- Ex.: o horário de uma ressonância de joelho cancelada vale também para ressonância de ombro.

create table public.clinic_exam_substitutes (
  clinic_exam_id uuid not null references public.clinic_exams(id) on delete cascade,
  substitute_id uuid not null references public.clinic_exams(id) on delete cascade,
  primary key (clinic_exam_id, substitute_id),
  check (clinic_exam_id <> substitute_id)
);
create index on public.clinic_exam_substitutes (substitute_id);

alter table public.clinic_exam_substitutes enable row level security;
create policy "leitura publica" on public.clinic_exam_substitutes for select to anon, authenticated using (true);

-- Ofertas de cada vaga: o próprio exame da vaga e os substitutos ativos. Cada oferta tem o preço
-- do exame oferecido, na mesma escada de degraus da vaga. `id` é o id da vaga.
create view public.vacancy_offers with (security_invoker = true) as
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
  end as status
from offers o
join public.vacancies v on v.id = o.vacancy_id
join public.clinic_exams ce on ce.id = o.offer_exam_id
join public.clinic_exams ve on ve.id = v.clinic_exam_id
join public.clinics c on c.id = ce.clinic_id
join public.agencies a on a.id = c.agency_id
where ce.deleted_at is null and (not o.is_substitute or ce.active);

-- Reserva de encaixe com o exame escolhido (o da vaga ou um substituto dele).
drop function public.reserve_vacancy(uuid, uuid, text);
create function public.reserve_vacancy(p_patient uuid, p_vacancy uuid, p_payment text, p_offer_exam uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v public.vacancies%rowtype;
  ce public.clinic_exams%rowtype;
  v_exam uuid;
  v_price int;
  v_id uuid;
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
  if not found or (v_exam <> v.clinic_exam_id and not ce.active) then raise exception 'Exame indisponível.'; end if;
  v_price := public.vacancy_price_cents(ce.full_price_cents, ce.floor_price_cents, v.starts_at);
  update public.vacancies set status = 'reservada' where id = v.id;
  insert into public.reservations (patient_id, clinic_exam_id, vacancy_id, starts_at, kind, price_cents, deposit_cents, payment_method)
  values (p_patient, ce.id, v.id, v.starts_at, 'encaixe', v_price, round(v_price * 0.2)::int, p_payment)
  returning id into v_id;
  return v_id;
end $$;

-- Cadastro e edição de exame agora recebem a lista de substitutos.
drop function public.upsert_clinic_exam(uuid, uuid, text, text, text, text, text, int, int, int, text, text, int, text[], boolean);
create function public.upsert_clinic_exam(
  p_id uuid, p_clinic uuid, p_region_key text, p_side text, p_display_name text, p_tuss text, p_room text,
  p_full_cents int, p_floor_cents int, p_min_notice_hours int, p_prep text, p_prep_starts text,
  p_late_tolerance_min int, p_warnings text[], p_active boolean, p_substitutes uuid[] default '{}'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_room text;
begin
  if coalesce(trim(p_display_name), '') = '' then raise exception 'Informe o nome que o paciente vê.'; end if;
  if p_full_cents <= 0 then raise exception 'Informe o preço cheio.'; end if;
  if p_floor_cents <= 0 or p_floor_cents > p_full_cents then raise exception 'O piso não pode passar do preço cheio.'; end if;
  if p_id is null then
    insert into public.clinic_exams (clinic_id, region_key, side, display_name, tuss, room, full_price_cents, floor_price_cents,
      min_notice_hours, prep, prep_starts, late_tolerance_min, warnings, active)
    values (p_clinic, p_region_key, p_side, trim(p_display_name), nullif(trim(p_tuss), ''), p_room, p_full_cents, p_floor_cents,
      p_min_notice_hours, coalesce(nullif(trim(p_prep), ''), 'Nenhum'), coalesce(nullif(trim(p_prep_starts), ''), '0 h antes'),
      p_late_tolerance_min, coalesce(p_warnings, '{}'), coalesce(p_active, true))
    returning id, room into v_id, v_room;
  else
    update public.clinic_exams set
      display_name = trim(p_display_name), tuss = nullif(trim(p_tuss), ''),
      full_price_cents = p_full_cents, floor_price_cents = p_floor_cents, min_notice_hours = p_min_notice_hours,
      prep = coalesce(nullif(trim(p_prep), ''), 'Nenhum'), prep_starts = coalesce(nullif(trim(p_prep_starts), ''), '0 h antes'),
      late_tolerance_min = p_late_tolerance_min, warnings = coalesce(p_warnings, '{}'), active = coalesce(p_active, active),
      updated_at = now()
    where id = p_id and clinic_id = p_clinic and deleted_at is null
    returning id, room into v_id, v_room;
    if v_id is null then raise exception 'Exame não encontrado.'; end if;
  end if;

  -- Substitutos: só exames da mesma clínica e da mesma sala (mesmo equipamento).
  delete from public.clinic_exam_substitutes where clinic_exam_id = v_id;
  insert into public.clinic_exam_substitutes (clinic_exam_id, substitute_id)
  select v_id, ce.id from public.clinic_exams ce
  where ce.id = any(coalesce(p_substitutes, '{}')) and ce.id <> v_id
    and ce.clinic_id = p_clinic and ce.room = v_room and ce.deleted_at is null;
  return v_id;
end $$;

-- Demo: ressonância de sacro e cóccix na Imagem Vila Nova e substitutos entre as ressonâncias.
create function public.seed_demo_substitutes()
returns void language plpgsql security definer set search_path = '' as $$
declare
  c_ivn uuid := '11111111-1111-4111-8111-111111111111';
  e_joelho uuid; e_ombro uuid; e_coluna uuid; e_sacro uuid;
begin
  select id into e_joelho from public.clinic_exams where clinic_id = c_ivn and region_key = 'ressonancia.joelho';
  select id into e_ombro from public.clinic_exams where clinic_id = c_ivn and region_key = 'ressonancia.ombro';
  select id into e_coluna from public.clinic_exams where clinic_id = c_ivn and region_key = 'ressonancia.coluna-lombar';
  insert into public.clinic_exams (clinic_id, region_key, side, display_name, room, full_price_cents, floor_price_cents, min_notice_hours, prep, warnings)
    values (c_ivn, 'ressonancia.sacro-coccix', null, 'Ressonância de sacro e cóccix', 'Ressonância', 52000, 36400, 3,
      'Sem jejum. Tire objetos de metal antes de entrar.',
      array['Marca-passo ou desfibrilador','Gravidez','Clipe de aneurisma','Implante coclear','Metal no corpo','Medo de lugar fechado'])
    returning id into e_sacro;
  insert into public.clinic_exam_substitutes (clinic_exam_id, substitute_id) values
    (e_joelho, e_ombro), (e_joelho, e_coluna), (e_joelho, e_sacro),
    (e_ombro, e_joelho), (e_ombro, e_sacro),
    (e_coluna, e_sacro), (e_sacro, e_coluna);
end $$;

-- O reset apaga exames; os substitutos caem junto pelo on delete cascade.
create or replace function public.demo_reset()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.clinic_exam_substitutes where true;
  perform public.seed_demo();
  perform public.seed_demo_history();
  perform public.seed_demo_substitutes();
end $$;

revoke execute on function public.seed_demo_substitutes() from public, anon, authenticated;
revoke execute on function public.reserve_vacancy(uuid, uuid, text, uuid) from public;
grant execute on function public.reserve_vacancy(uuid, uuid, text, uuid) to anon, authenticated;
revoke execute on function public.upsert_clinic_exam(uuid, uuid, text, text, text, text, text, int, int, int, text, text, int, text[], boolean, uuid[]) from public;
grant execute on function public.upsert_clinic_exam(uuid, uuid, text, text, text, text, text, int, int, int, text, text, int, text[], boolean, uuid[]) to anon, authenticated;
revoke execute on function public.demo_reset() from public;
grant execute on function public.demo_reset() to anon, authenticated;

select public.demo_reset();
