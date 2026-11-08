-- Presença no exame: depois do horário, a clínica registra se o paciente compareceu ou faltou.
-- reservations.status: 'reservada' (antes ou aguardando a clínica) | 'realizada' | 'falta' | 'cancelada'.

alter table public.reservations drop constraint reservations_status_check;
alter table public.reservations add constraint reservations_status_check
  check (status in ('reservada','realizada','falta','cancelada'));
alter table public.reservations add column attendance_at timestamptz;

create function public.mark_attendance(p_reservation uuid, p_outcome text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.reservations%rowtype;
begin
  if p_outcome not in ('realizada','falta') then raise exception 'Escolha compareceu ou faltou.'; end if;
  select * into r from public.reservations where id = p_reservation for update;
  if not found then raise exception 'Reserva não encontrada.'; end if;
  if r.status = 'cancelada' then raise exception 'Esta reserva foi cancelada.'; end if;
  if r.starts_at > public.demo_now() then raise exception 'O horário do exame ainda não chegou.'; end if;
  update public.reservations set status = p_outcome, attendance_at = now() where id = r.id;
end $$;

-- Histórico da demo: reservas de mais de um dia atrás já têm o desfecho registrado.
create or replace function public.demo_reset()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.clinic_exam_substitutes where true;
  perform public.seed_demo();
  perform public.seed_demo_history();
  perform public.seed_demo_substitutes();
  update public.reservations set status = 'realizada', attendance_at = starts_at + interval '1 hour'
    where status = 'reservada' and starts_at < now() - interval '1 day';
end $$;

update public.reservations set status = 'realizada', attendance_at = starts_at + interval '1 hour'
  where status = 'reservada' and starts_at < now() - interval '1 day';

revoke execute on function public.mark_attendance(uuid, text) from public;
grant execute on function public.mark_attendance(uuid, text) to anon, authenticated;
revoke execute on function public.demo_reset() from public;
grant execute on function public.demo_reset() to anon, authenticated;
