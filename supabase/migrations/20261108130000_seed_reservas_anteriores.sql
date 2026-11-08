-- Histórico da Marina para a aba «Anteriores» de Minhas reservas (prancha Paciente-Reservas):
-- dois exames realizados e um cancelado pela clínica, em datas passadas relativas a hoje.
-- Também dá à Clínica Lumen e ao Diagnóstico Centro um exame a mais cada, para o histórico variar de clínica.

create function public.seed_demo_history()
returns void language plpgsql security definer set search_path = '' as $$
declare
  d0 timestamp := date_trunc('day', now() at time zone 'America/Sao_Paulo');
  p_marina uuid := '22222222-2222-4222-8222-222222222222';
  c_lumen uuid; c_dc uuid; e_lumen_abd uuid; e_dc_cranio uuid; e_ivn_tireoide uuid;
begin
  select id into c_lumen from public.clinics where name = 'Clínica Lumen';
  select id into c_dc from public.clinics where name = 'Diagnóstico Centro';
  select id into e_ivn_tireoide from public.clinic_exams
    where clinic_id = '11111111-1111-4111-8111-111111111111' and region_key = 'ultrassom.tireoide';

  insert into public.clinic_exams (clinic_id, region_key, side, display_name, room, full_price_cents, floor_price_cents, min_notice_hours, prep)
    values (c_lumen, 'ultrassom.abdomen', null, 'Ultrassom do abdômen', 'Ultrassom', 16000, 11200, 1, 'Jejum de 6 horas.')
    returning id into e_lumen_abd;
  insert into public.clinic_exams (clinic_id, region_key, side, display_name, room, full_price_cents, floor_price_cents, min_notice_hours, warnings)
    values (c_dc, 'tomografia.cranio', null, 'Tomografia do crânio', 'Tomografia', 35000, 24500, 2, array['Gravidez','Alergia a contraste'])
    returning id into e_dc_cranio;

  insert into public.reservations (patient_id, clinic_exam_id, starts_at, kind, price_cents, deposit_cents, payment_method, status, created_at)
  values
    (p_marina, e_lumen_abd, (d0 - interval '27 days' + interval '9 hours') at time zone 'America/Sao_Paulo',
      'encaixe', 11200, 2240, 'pix', 'reservada', now() - interval '28 days'),
    (p_marina, e_dc_cranio, (d0 - interval '41 days' + interval '14 hours') at time zone 'America/Sao_Paulo',
      'normal', 35000, 7000, 'card', 'cancelada', now() - interval '45 days'),
    (p_marina, e_ivn_tireoide, (d0 - interval '70 days' + interval '10 hours') at time zone 'America/Sao_Paulo',
      'normal', 16000, 3200, 'pix', 'reservada', now() - interval '75 days');
end $$;

create or replace function public.demo_reset()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.seed_demo();
  perform public.seed_demo_history();
end $$;

revoke execute on function public.seed_demo_history() from public, anon, authenticated;
revoke execute on function public.demo_reset() from public;
grant execute on function public.demo_reset() to anon, authenticated;

select public.demo_reset();
