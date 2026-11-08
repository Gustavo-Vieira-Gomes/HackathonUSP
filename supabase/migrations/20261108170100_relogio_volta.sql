-- Voltar o relógio da demo (Zerar) desfaz as reservas simuladas que ainda não teriam acontecido.

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
    -- Voltar o relógio desfaz as reservas simuladas que ainda não teriam acontecido.
    update public.vacancies v set status = 'publicada'
      from public.reservations x
      where x.vacancy_id = v.id and x.status = 'reservada' and x.created_at > v_after
        and x.patient_id = any(public.demo_simulated_patients());
    delete from public.reservations x
      where x.created_at > v_after and x.vacancy_id is not null
        and x.patient_id = any(public.demo_simulated_patients());
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

revoke execute on function public.demo_advance(int) from public;
grant execute on function public.demo_advance(int) to anon, authenticated;

-- O Zerar feito antes desta correção deixou reservas simuladas no futuro: desfaz agora.
update public.vacancies v set status = 'publicada'
  from public.reservations r
  where r.vacancy_id = v.id and r.status = 'reservada' and r.created_at > public.demo_now()
    and r.patient_id = any(public.demo_simulated_patients());
delete from public.reservations r
  where r.created_at > public.demo_now() and r.vacancy_id is not null
    and r.patient_id = any(public.demo_simulated_patients());
