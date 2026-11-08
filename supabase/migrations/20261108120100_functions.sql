-- Gravações do protótipo. Toda escrita passa por estas funções (security definer); as tabelas não têm
-- política de escrita. Sem autenticação: o paciente é identificado por um cookie com o id dele e a
-- clínica do painel é a de demonstração. Não use este modelo fora do protótipo.

create function public.get_patient(p_id uuid)
returns table (id uuid, name text, email text, phone text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.name, p.email, p.phone from public.patients p where p.id = p_id;
$$;

create function public.register_patient(p_name text, p_cpf text, p_email text, p_phone text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if coalesce(trim(p_name), '') = '' then raise exception 'Informe o nome completo.'; end if;
  if coalesce(regexp_replace(p_cpf, '\D', '', 'g'), '') !~ '^\d{11}$' then raise exception 'O CPF precisa ter 11 números.'; end if;
  insert into public.patients (name, cpf, email, phone)
  values (trim(p_name), regexp_replace(p_cpf, '\D', '', 'g'), nullif(trim(p_email), ''), nullif(trim(p_phone), ''))
  returning id into v_id;
  return v_id;
end $$;

create function public.subscribe_waitlist(
  p_patient uuid, p_region_key text, p_side text, p_exam_label text,
  p_radius_km int, p_max_price_cents int, p_weekdays text[], p_can_go_today boolean
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not exists (select 1 from public.patients where id = p_patient) then raise exception 'Paciente não encontrado.'; end if;
  if p_radius_km not between 1 and 100 then raise exception 'Distância fora do limite.'; end if;
  if p_max_price_cents <= 0 then raise exception 'Informe um preço máximo.'; end if;
  insert into public.waitlist (patient_id, region_key, side, exam_label, radius_km, max_price_cents, weekdays, can_go_today, expires_at)
  values (p_patient, p_region_key, p_side, p_exam_label, p_radius_km, p_max_price_cents, coalesce(p_weekdays, '{}'), p_can_go_today, now() + interval '30 days')
  returning id into v_id;
  return v_id;
end $$;

-- Reserva de encaixe: trava a vaga, cobra o preço do momento e guarda o sinal de 20%.
create function public.reserve_vacancy(p_patient uuid, p_vacancy uuid, p_payment text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v public.vacancies%rowtype;
  ce public.clinic_exams%rowtype;
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
  select * into ce from public.clinic_exams where id = v.clinic_exam_id;
  v_price := public.vacancy_price_cents(ce.full_price_cents, ce.floor_price_cents, v.starts_at);
  update public.vacancies set status = 'reservada' where id = v.id;
  insert into public.reservations (patient_id, clinic_exam_id, vacancy_id, starts_at, kind, price_cents, deposit_cents, payment_method)
  values (p_patient, ce.id, v.id, v.starts_at, 'encaixe', v_price, round(v_price * 0.2)::int, p_payment)
  returning id into v_id;
  return v_id;
end $$;

-- Horário ocupado na sala: evento ativo, reserva ativa ou vaga aberta.
create function public.room_busy(p_clinic uuid, p_room text, p_starts timestamptz, p_ends timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.calendar_events e
    where e.clinic_id = p_clinic and e.room = p_room and e.cancelled_at is null
      and e.starts_at < p_ends and e.ends_at > p_starts
  ) or exists (
    select 1 from public.reservations r join public.clinic_exams ce on ce.id = r.clinic_exam_id
    where ce.clinic_id = p_clinic and ce.room = p_room and r.status = 'reservada'
      and r.starts_at < p_ends and r.starts_at + interval '40 minutes' > p_starts
  ) or exists (
    select 1 from public.vacancies v join public.clinic_exams ce on ce.id = v.clinic_exam_id
    where ce.clinic_id = p_clinic and ce.room = p_room and v.status in ('publicada','alertando')
      and v.starts_at < p_ends and v.starts_at + make_interval(mins => v.duration_min) > p_starts
  );
$$;

-- Reserva em horário normal: preço cheio, sinal de 20% pelo app.
create function public.reserve_normal(p_patient uuid, p_clinic_exam uuid, p_starts timestamptz, p_payment text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare ce public.clinic_exams%rowtype; v_id uuid;
begin
  if p_payment not in ('pix','card') then raise exception 'Forma de pagamento inválida.'; end if;
  if not exists (select 1 from public.patients where id = p_patient) then raise exception 'Paciente não encontrado.'; end if;
  select * into ce from public.clinic_exams where id = p_clinic_exam and deleted_at is null and active;
  if not found then raise exception 'Exame indisponível.'; end if;
  if p_starts <= public.demo_now() then raise exception 'Este horário já passou.'; end if;
  perform pg_advisory_xact_lock(hashtext(ce.clinic_id::text || ce.room));
  if public.room_busy(ce.clinic_id, ce.room, p_starts, p_starts + interval '40 minutes') then
    raise exception 'Este horário acabou de ser ocupado. Escolha outro.';
  end if;
  insert into public.reservations (patient_id, clinic_exam_id, starts_at, kind, price_cents, deposit_cents, payment_method)
  values (p_patient, ce.id, p_starts, 'normal', ce.full_price_cents, round(ce.full_price_cents * 0.2)::int, p_payment)
  returning id into v_id;
  return v_id;
end $$;

-- A clínica cancela um agendamento e o horário vira vaga de encaixe no marketplace.
create function public.publish_cancellation(p_event uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare e public.calendar_events%rowtype; ce public.clinic_exams%rowtype; v_alerted int; v_id uuid;
begin
  select * into e from public.calendar_events where id = p_event for update;
  if not found or e.kind <> 'patient' then raise exception 'Agendamento não encontrado.'; end if;
  if e.cancelled_at is not null then raise exception 'Este agendamento já foi cancelado.'; end if;
  if e.starts_at <= public.demo_now() then raise exception 'Este horário já passou.'; end if;
  if e.clinic_exam_id is null then raise exception 'O agendamento não tem exame ligado.'; end if;
  select * into ce from public.clinic_exams where id = e.clinic_exam_id;
  update public.calendar_events set cancelled_at = now() where id = e.id;
  select count(*) into v_alerted from public.waitlist w
    where w.active and w.expires_at > now() and w.region_key = ce.region_key;
  insert into public.vacancies (clinic_exam_id, event_id, starts_at, duration_min, reason, status, alerted_count)
  values (ce.id, e.id, e.starts_at, greatest(20, (extract(epoch from (e.ends_at - e.starts_at)) / 60)::int), 'cancelamento', 'alertando', greatest(v_alerted, 5))
  returning id into v_id;
  return v_id;
end $$;

create function public.create_calendar_event(
  p_clinic uuid, p_room text, p_starts timestamptz, p_ends timestamptz, p_kind text, p_title text, p_detail text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_kind not in ('patient','block') then raise exception 'Tipo de horário inválido.'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Informe o nome ou o motivo.'; end if;
  if p_ends <= p_starts then raise exception 'O horário de fim precisa ser depois do início.'; end if;
  if not exists (select 1 from public.clinics where id = p_clinic) then raise exception 'Clínica não encontrada.'; end if;
  insert into public.calendar_events (clinic_id, room, starts_at, ends_at, kind, title, detail, source)
  values (p_clinic, p_room, p_starts, p_ends, p_kind, trim(p_title), nullif(trim(p_detail), ''), 'manual')
  returning id into v_id;
  return v_id;
end $$;

-- Google Agenda simulada: conectar mostra os eventos de origem google; desconectar esconde.
create function public.set_google_connection(p_clinic uuid, p_connected boolean, p_email text)
returns void language sql security definer set search_path = '' as $$
  insert into public.calendar_connections (clinic_id, provider, account_email, connected, connected_at)
  values (p_clinic, 'google', p_email, p_connected, case when p_connected then now() end)
  on conflict (clinic_id, provider) do update
    set connected = excluded.connected,
        account_email = coalesce(excluded.account_email, public.calendar_connections.account_email),
        connected_at = excluded.connected_at;
$$;

-- Cria (p_id nulo) ou edita um exame. Tipo, região e lado não mudam depois de criado.
create function public.upsert_clinic_exam(
  p_id uuid, p_clinic uuid, p_region_key text, p_side text, p_display_name text, p_tuss text, p_room text,
  p_full_cents int, p_floor_cents int, p_min_notice_hours int, p_prep text, p_prep_starts text,
  p_late_tolerance_min int, p_warnings text[], p_active boolean
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
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
    returning id into v_id;
  else
    update public.clinic_exams set
      display_name = trim(p_display_name), tuss = nullif(trim(p_tuss), ''),
      full_price_cents = p_full_cents, floor_price_cents = p_floor_cents, min_notice_hours = p_min_notice_hours,
      prep = coalesce(nullif(trim(p_prep), ''), 'Nenhum'), prep_starts = coalesce(nullif(trim(p_prep_starts), ''), '0 h antes'),
      late_tolerance_min = p_late_tolerance_min, warnings = coalesce(p_warnings, '{}'), active = coalesce(p_active, active),
      updated_at = now()
    where id = p_id and clinic_id = p_clinic and deleted_at is null
    returning id into v_id;
    if v_id is null then raise exception 'Exame não encontrado.'; end if;
  end if;
  return v_id;
end $$;

create function public.delete_clinic_exam(p_id uuid, p_clinic uuid)
returns void language sql security definer set search_path = '' as $$
  update public.clinic_exams set deleted_at = now(), active = false where id = p_id and clinic_id = p_clinic;
$$;

create function public.demo_advance(p_hours int)
returns void language sql security definer set search_path = '' as $$
  update public.demo_settings set offset_hours = greatest(0, offset_hours + p_hours) where id = 1;
$$;

-- Funções expostas à chave pública. As demais (demo_now, price_step, room_busy...) ficam internas.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.demo_now() to anon, authenticated;
grant execute on function public.price_step(numeric) to anon, authenticated;
grant execute on function public.vacancy_price_cents(int, int, timestamptz) to anon, authenticated;
grant execute on function public.get_patient(uuid) to anon, authenticated;
grant execute on function public.register_patient(text, text, text, text) to anon, authenticated;
grant execute on function public.subscribe_waitlist(uuid, text, text, text, int, int, text[], boolean) to anon, authenticated;
grant execute on function public.reserve_vacancy(uuid, uuid, text) to anon, authenticated;
grant execute on function public.reserve_normal(uuid, uuid, timestamptz, text) to anon, authenticated;
grant execute on function public.publish_cancellation(uuid) to anon, authenticated;
grant execute on function public.create_calendar_event(uuid, text, timestamptz, timestamptz, text, text, text) to anon, authenticated;
grant execute on function public.set_google_connection(uuid, boolean, text) to anon, authenticated;
grant execute on function public.upsert_clinic_exam(uuid, uuid, text, text, text, text, text, int, int, int, text, text, int, text[], boolean) to anon, authenticated;
grant execute on function public.delete_clinic_exam(uuid, uuid) to anon, authenticated;
grant execute on function public.demo_advance(int) to anon, authenticated;
