-- Dados de demonstração, gerados em relação ao dia de hoje em São Paulo para a demo nunca envelhecer.
-- demo_reset() apaga tudo e recria. Ids fixos: clínica do painel e paciente Marina (usados no app).

create function public.seed_demo()
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
    values (c_ivn, 'ressonancia.joelho', 'ambos', 'Ressonância de joelho', 'Ressonância', 48000, 33600, 3, 'Sem jejum. Tire objetos de metal antes de entrar.', warn_rm) returning id into e_joelho;
  insert into public.clinic_exams (clinic_id, region_key, side, display_name, room, full_price_cents, floor_price_cents, min_notice_hours, prep, warnings)
    values (c_ivn, 'ressonancia.coluna-lombar', null, 'Ressonância da coluna lombar', 'Ressonância', 62000, 43400, 3, 'Sem jejum. Tire objetos de metal antes de entrar.', warn_rm) returning id into e_coluna;
  insert into public.clinic_exams (clinic_id, region_key, side, display_name, room, full_price_cents, floor_price_cents, min_notice_hours, prep, warnings)
    values (c_ivn, 'ressonancia.ombro', 'ambos', 'Ressonância de ombro', 'Ressonância', 48000, 33600, 3, 'Sem jejum. Tire objetos de metal antes de entrar.', warn_rm) returning id into e_ombro;
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
    values (c_ivn, 'mamografia', 'ambos', 'Mamografia das duas mamas', 'Mamografia', 22000, 15400, 2, warn_mg) returning id into e_mamo;

  -- Outras clínicas, para o marketplace ter comparação
  insert into public.clinic_exams (clinic_id, region_key, side, display_name, room, full_price_cents, floor_price_cents, prep, warnings)
    values (c_dc, 'ressonancia.joelho', 'ambos', 'Ressonância de joelho', 'Ressonância', 52000, 36400, 'Sem jejum. Tire objetos de metal antes de entrar.', warn_rm) returning id into d_joelho;
  insert into public.clinic_exams (clinic_id, region_key, side, display_name, room, full_price_cents, floor_price_cents, prep, warnings)
    values (c_lumen, 'ressonancia.joelho', 'ambos', 'Ressonância de joelho', 'Ressonância', 46000, 32200, 'Sem jejum. Tire objetos de metal antes de entrar.', warn_rm) returning id into l_joelho;

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

create function public.demo_reset()
returns void language sql security definer set search_path = '' as $$
  select public.seed_demo();
$$;

revoke execute on function public.seed_demo() from public, anon, authenticated;
revoke execute on function public.demo_reset() from public;
grant execute on function public.demo_reset() to anon, authenticated;

select public.seed_demo();
