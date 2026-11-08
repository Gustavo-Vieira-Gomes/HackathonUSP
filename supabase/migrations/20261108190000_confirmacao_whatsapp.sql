-- Confirmação de presença pelo WhatsApp (Evolution API).
-- A clínica define no perfil quando a mensagem sai (confirm_send_hours antes do exame) e até quando o
-- paciente pode responder (confirm_deadline_hours antes). O paciente responde 1 (confirma) ou 2 (cancela).
-- Cancelou ou não respondeu até o prazo: a reserva cai, o sinal é devolvido e o horário vira encaixe.
-- Reserva feita depois do prazo (encaixe de última hora) não passa pela confirmação.

alter table public.clinics
  add column confirm_send_hours int not null default 48,
  add column confirm_deadline_hours int not null default 24,
  add constraint clinics_confirm_window_check
    check (confirm_deadline_hours >= 1 and confirm_send_hours > confirm_deadline_hours and confirm_send_hours <= 168);

alter table public.reservations
  add column confirmation text check (confirmation in ('pendente','confirmada','cancelada','sem_resposta')),
  add column confirmation_sent_at timestamptz,
  add column confirmation_deadline timestamptz,
  add column confirmation_answered_at timestamptz,
  add column cancel_reason text check (cancel_reason in ('clinica','paciente','sem_resposta')),
  add column cancelled_at timestamptz,
  -- Vaga que a reserva liberou ao cair: a anterior reaberta (released_created = false) ou uma nova.
  add column released_vacancy_id uuid references public.vacancies(id) on delete set null,
  add column released_created boolean;
update public.reservations set cancel_reason = 'clinica' where status = 'cancelada';
create index on public.reservations (confirmation) where confirmation = 'pendente';

create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete cascade,
  direction text not null check (direction in ('out','in')),
  body text not null,
  provider text not null check (provider in ('evolution','simulado')),
  provider_id text,
  error text,
  created_at timestamptz not null default public.demo_now()
);
create index on public.whatsapp_messages (patient_id, created_at);
create index on public.whatsapp_messages (reservation_id);
alter table public.whatsapp_messages enable row level security;
create policy "leitura publica" on public.whatsapp_messages for select to anon, authenticated using (true);

-- Libera o horário de uma reserva que caiu: reabre a vaga de encaixe dela ou publica uma nova.
create function public.release_reservation(p_reservation uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r public.reservations%rowtype; ce public.clinic_exams%rowtype; v_alerted int; v_id uuid; v_created boolean := false;
begin
  select * into r from public.reservations where id = p_reservation for update;
  if not found or r.status <> 'reservada' then return null; end if;
  select * into ce from public.clinic_exams where id = r.clinic_exam_id;
  select count(*) into v_alerted from public.waitlist w
    where w.active and w.expires_at > now() and w.region_key = ce.region_key;

  if r.starts_at > public.demo_now() then
    if r.vacancy_id is not null then
      update public.vacancies set status = 'alertando', reason = 'cancelamento', published_at = now(),
        alerted_count = greatest(v_alerted, 5)
        where id = r.vacancy_id returning id into v_id;
    else
      insert into public.vacancies (clinic_exam_id, starts_at, duration_min, reason, status, alerted_count)
      values (ce.id, r.starts_at, ce.duration_min, 'cancelamento', 'alertando', greatest(v_alerted, 5))
      returning id into v_id;
      v_created := true;
    end if;
  end if;

  update public.reservations set status = 'cancelada', cancel_reason = p_reason, cancelled_at = public.demo_now(),
    vacancy_id = null, released_vacancy_id = v_id, released_created = case when v_id is null then null else v_created end
    where id = r.id;
  return v_id;
end $$;

-- Reservas cuja mensagem de confirmação deve sair agora. Marca como pendentes e devolve os dados da mensagem.
create function public.claim_confirmations()
returns table (reservation_id uuid, patient_id uuid, patient_name text, phone text, exam text, clinic_name text,
  clinic_address text, starts_at timestamptz, deadline timestamptz, deposit_cents int)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with due as (
    select r.id, r.starts_at - make_interval(hours => c.confirm_deadline_hours) as dl
    from public.reservations r
    join public.clinic_exams ce on ce.id = r.clinic_exam_id
    join public.clinics c on c.id = ce.clinic_id
    where r.status = 'reservada' and r.confirmation is null
      and r.starts_at - make_interval(hours => c.confirm_send_hours) <= public.demo_now()
      and r.starts_at - make_interval(hours => c.confirm_deadline_hours) > public.demo_now()
    for update of r skip locked
  ), upd as (
    update public.reservations r set confirmation = 'pendente', confirmation_sent_at = public.demo_now(), confirmation_deadline = due.dl
    from due where r.id = due.id
    returning r.id, r.patient_id, r.clinic_exam_id, r.starts_at, r.confirmation_deadline, r.deposit_cents
  )
  select upd.id, upd.patient_id, p.name, p.phone, ce.display_name, c.name, c.address, upd.starts_at, upd.confirmation_deadline, upd.deposit_cents
  from upd
  join public.patients p on p.id = upd.patient_id
  join public.clinic_exams ce on ce.id = upd.clinic_exam_id
  join public.clinics c on c.id = ce.clinic_id;
end $$;

-- Pendentes que passaram do prazo: a reserva cai (sinal devolvido) e o horário vira encaixe.
create function public.expire_confirmations()
returns table (reservation_id uuid, patient_id uuid, patient_name text, phone text, exam text, clinic_name text,
  starts_at timestamptz, deposit_cents int)
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in
    select x.id from public.reservations x
    where x.status = 'reservada' and x.confirmation = 'pendente' and x.confirmation_deadline <= public.demo_now()
    for update skip locked
  loop
    update public.reservations set confirmation = 'sem_resposta' where id = r.id;
    perform public.release_reservation(r.id, 'sem_resposta');
    return query
      select x.id, x.patient_id, p.name, p.phone, ce.display_name, c.name, x.starts_at, x.deposit_cents
      from public.reservations x
      join public.patients p on p.id = x.patient_id
      join public.clinic_exams ce on ce.id = x.clinic_exam_id
      join public.clinics c on c.id = ce.clinic_id
      where x.id = r.id;
  end loop;
end $$;

-- Resposta do paciente: 'confirmar' ou 'cancelar'. Devolve o desfecho para a mensagem de retorno.
create function public.answer_confirmation(p_reservation uuid, p_answer text)
returns text language plpgsql security definer set search_path = '' as $$
declare r public.reservations%rowtype;
begin
  if p_answer not in ('confirmar','cancelar') then raise exception 'Resposta inválida.'; end if;
  select * into r from public.reservations where id = p_reservation for update;
  if not found then raise exception 'Reserva não encontrada.'; end if;
  if r.status <> 'reservada' or r.confirmation is distinct from 'pendente' then return 'ja_respondida'; end if;
  if r.confirmation_deadline <= public.demo_now() then return 'fora_do_prazo'; end if;
  if p_answer = 'confirmar' then
    update public.reservations set confirmation = 'confirmada', confirmation_answered_at = public.demo_now() where id = r.id;
    return 'confirmada';
  end if;
  update public.reservations set confirmation = 'cancelada', confirmation_answered_at = public.demo_now() where id = r.id;
  perform public.release_reservation(r.id, 'paciente');
  return 'cancelada';
end $$;

-- Reserva pendente mais próxima do paciente (para a resposta que chega pelo WhatsApp ou pelo simulador).
create function public.pending_confirmation(p_patient uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.reservations
  where patient_id = p_patient and status = 'reservada' and confirmation = 'pendente'
  order by starts_at limit 1;
$$;

-- Paciente pelo número do WhatsApp: compara os 8 últimos dígitos (o JID às vezes vem sem o 9 da frente).
create function public.patient_by_phone(p_digits text)
returns uuid language sql stable security definer set search_path = '' as $$
  select p.id from public.patients p
  where p.phone is not null
    and length(regexp_replace(p_digits, '\D', '', 'g')) >= 8
    and right(regexp_replace(p.phone, '\D', '', 'g'), 8) = right(regexp_replace(p_digits, '\D', '', 'g'), 8)
  order by p.id limit 1;
$$;

create function public.log_whatsapp_message(p_patient uuid, p_reservation uuid, p_direction text, p_body text,
  p_provider text, p_provider_id text, p_error text)
returns void language sql security definer set search_path = '' as $$
  insert into public.whatsapp_messages (patient_id, reservation_id, direction, body, provider, provider_id, error)
  values (p_patient, p_reservation, p_direction, p_body, p_provider, p_provider_id, p_error);
$$;

create function public.update_clinic_confirmation(p_clinic uuid, p_send_hours int, p_deadline_hours int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_deadline_hours < 1 then raise exception 'O prazo precisa ser de pelo menos 1 hora antes do exame.'; end if;
  if p_send_hours <= p_deadline_hours then raise exception 'A mensagem precisa sair antes do fim do prazo para responder.'; end if;
  if p_send_hours > 168 then raise exception 'Envie a mensagem no máximo 7 dias antes.'; end if;
  update public.clinics set confirm_send_hours = p_send_hours, confirm_deadline_hours = p_deadline_hours where id = p_clinic;
  if not found then raise exception 'Clínica não encontrada.'; end if;
end $$;

-- Voltar o relógio da demo desfaz também a confirmação que ainda não teria acontecido.
create function public.demo_rewind_confirmations(p_to timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  delete from public.whatsapp_messages where created_at > p_to;
  for r in
    select * from public.reservations
    where status = 'cancelada' and cancel_reason in ('paciente','sem_resposta') and cancelled_at > p_to
    for update
  loop
    if r.released_vacancy_id is not null then
      if r.released_created then
        if not exists (select 1 from public.reservations x where x.vacancy_id = r.released_vacancy_id) then
          delete from public.vacancies where id = r.released_vacancy_id;
        end if;
      elsif not exists (select 1 from public.reservations x where x.vacancy_id = r.released_vacancy_id) then
        update public.vacancies set status = 'reservada' where id = r.released_vacancy_id;
        update public.reservations set vacancy_id = r.released_vacancy_id where id = r.id;
      end if;
    end if;
    update public.reservations set status = 'reservada', cancel_reason = null, cancelled_at = null,
      released_vacancy_id = null, released_created = null, confirmation = 'pendente', confirmation_answered_at = null
      where id = r.id;
  end loop;
  update public.reservations set confirmation = 'pendente', confirmation_answered_at = null
    where confirmation_answered_at > p_to;
  update public.reservations set confirmation = null, confirmation_sent_at = null, confirmation_deadline = null
    where confirmation_sent_at > p_to;
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
  if v_after < v_before then
    -- Voltar o relógio desfaz as reservas simuladas e as confirmações que ainda não teriam acontecido.
    update public.vacancies v set status = 'publicada'
      from public.reservations x
      where x.vacancy_id = v.id and x.status = 'reservada' and x.created_at > v_after
        and x.patient_id = any(public.demo_simulated_patients());
    delete from public.reservations x
      where x.created_at > v_after and x.vacancy_id is not null
        and x.patient_id = any(public.demo_simulated_patients());
    perform public.demo_rewind_confirmations(v_after);
    return;
  end if;
  if v_after = v_before then return; end if;

  v_patients := public.demo_simulated_patients();
  for r in
    select v.id, v.clinic_exam_id, v.starts_at, v.published_at, ce.full_price_cents, ce.floor_price_cents, ce.side
    from public.vacancies v
    join public.clinic_exams ce on ce.id = v.clinic_exam_id
    where v.status in ('publicada','alertando') and v.starts_at > v_before
    for update of v
  loop
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

revoke execute on function public.release_reservation(uuid, text) from public, anon, authenticated;
revoke execute on function public.demo_rewind_confirmations(timestamptz) from public, anon, authenticated;
revoke execute on function public.claim_confirmations() from public;
revoke execute on function public.expire_confirmations() from public;
revoke execute on function public.answer_confirmation(uuid, text) from public;
revoke execute on function public.pending_confirmation(uuid) from public;
revoke execute on function public.patient_by_phone(text) from public;
revoke execute on function public.log_whatsapp_message(uuid, uuid, text, text, text, text, text) from public;
revoke execute on function public.update_clinic_confirmation(uuid, int, int) from public;
revoke execute on function public.demo_advance(int) from public;
grant execute on function public.claim_confirmations() to anon, authenticated;
grant execute on function public.expire_confirmations() to anon, authenticated;
grant execute on function public.answer_confirmation(uuid, text) to anon, authenticated;
grant execute on function public.pending_confirmation(uuid) to anon, authenticated;
grant execute on function public.patient_by_phone(text) to anon, authenticated;
grant execute on function public.log_whatsapp_message(uuid, uuid, text, text, text, text, text) to anon, authenticated;
grant execute on function public.update_clinic_confirmation(uuid, int, int) to anon, authenticated;
grant execute on function public.demo_advance(int) to anon, authenticated;
