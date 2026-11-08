-- Desfaz o registro de presença (20261108160000): a clínica não marca compareceu/faltou.
-- No lugar, o relógio da demo simula a procura: ao avançar, toda vaga aberta ganha a reserva
-- de um paciente da lista de espera antes do horário, no máximo 6 h antes (degrau mais barato).

drop function public.mark_attendance(uuid, text);
update public.reservations set status = 'reservada' where status in ('realizada','falta');
alter table public.reservations drop constraint reservations_status_check;
alter table public.reservations add constraint reservations_status_check
  check (status in ('reservada','cancelada'));
alter table public.reservations drop column attendance_at;

create or replace function public.demo_reset()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.clinic_exam_substitutes where true;
  perform public.seed_demo();
  perform public.seed_demo_history();
  perform public.seed_demo_substitutes();
end $$;

-- Pacientes simulados que «reservam» as vagas quando o relógio avança.
create function public.demo_simulated_patients()
returns uuid[] language plpgsql security definer set search_path = '' as $$
declare v_ids uuid[]; v_name text;
begin
  foreach v_name in array array['Cláudia B.','Rafael M.','Joana P.','Sérgio T.'] loop
    if not exists (select 1 from public.patients where name = v_name) then
      insert into public.patients (name) values (v_name);
    end if;
  end loop;
  select array_agg(id order by name) into v_ids
    from public.patients where name in ('Cláudia B.','Rafael M.','Joana P.','Sérgio T.');
  return v_ids;
end $$;

create or replace function public.demo_advance(p_hours int)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_before timestamptz := public.demo_now();
  v_after timestamptz;
  v_patients uuid[];
  r record;
  v_at timestamptz;
  v_price int;
begin
  update public.demo_settings set offset_hours = greatest(0, offset_hours + p_hours) where id = 1;
  v_after := public.demo_now();
  if v_after <= v_before then return; end if;

  v_patients := public.demo_simulated_patients();
  for r in
    select v.id, v.clinic_exam_id, v.starts_at, v.published_at, ce.full_price_cents, ce.floor_price_cents, ce.side
    from public.vacancies v
    join public.clinic_exams ce on ce.id = v.clinic_exam_id
    where v.status in ('publicada','alertando') and v.starts_at > v_before
    for update of v
  loop
    -- Momento da reserva: quando faltam 6 h (ou 20 min depois de publicar), sempre antes do horário.
    v_at := least(greatest(r.starts_at - interval '6 hours', r.published_at + interval '20 minutes'),
                  r.starts_at - interval '15 minutes');
    if v_at > v_after then continue; end if;
    v_at := greatest(v_at, v_before);
    v_price := greatest(r.floor_price_cents,
      round(r.full_price_cents * (1 - 0.1 * public.price_step(extract(epoch from (r.starts_at - v_at)) / 3600.0)))::int);
    update public.vacancies set status = 'reservada' where id = r.id;
    insert into public.reservations (patient_id, clinic_exam_id, vacancy_id, starts_at, kind, price_cents, deposit_cents,
      payment_method, side, created_at)
    values (v_patients[1 + abs(hashtext(r.id::text)) % array_length(v_patients, 1)], r.clinic_exam_id, r.id, r.starts_at,
      'encaixe', v_price, round(v_price * 0.2)::int, 'pix', case when r.side = 'bilateral' then 'ambos' end, v_at);
  end loop;
end $$;

revoke execute on function public.demo_simulated_patients() from public, anon, authenticated;
revoke execute on function public.demo_reset() from public;
grant execute on function public.demo_reset() to anon, authenticated;
revoke execute on function public.demo_advance(int) from public;
grant execute on function public.demo_advance(int) to anon, authenticated;
