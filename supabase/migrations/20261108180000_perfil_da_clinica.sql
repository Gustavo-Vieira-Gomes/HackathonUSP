-- Perfil da clínica no header: horário de funcionamento e edição de nome, endereço e horário.

alter table public.clinics add column opening_hours text not null default 'Seg a sex, 7h às 19h';
update public.clinics set opening_hours = 'Seg a sex, 7h às 22h · Sáb, 8h às 14h'
  where id = '11111111-1111-4111-8111-111111111111';

create function public.update_clinic_info(p_clinic uuid, p_name text, p_address text, p_opening_hours text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(trim(p_name), '') = '' then raise exception 'Informe o nome da clínica.'; end if;
  if coalesce(trim(p_address), '') = '' then raise exception 'Informe o endereço.'; end if;
  if coalesce(trim(p_opening_hours), '') = '' then raise exception 'Informe o horário de funcionamento.'; end if;
  update public.clinics set name = trim(p_name), address = trim(p_address), opening_hours = trim(p_opening_hours)
    where id = p_clinic;
  if not found then raise exception 'Clínica não encontrada.'; end if;
end $$;

revoke execute on function public.update_clinic_info(uuid, text, text, text) from public;
grant execute on function public.update_clinic_info(uuid, text, text, text) to anon, authenticated;

-- O reset recria as clínicas: devolve o horário da Imagem Vila Nova.
create or replace function public.demo_reset()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.clinic_exam_substitutes where true;
  perform public.seed_demo();
  perform public.seed_demo_history();
  perform public.seed_demo_substitutes();
  update public.clinics set opening_hours = 'Seg a sex, 7h às 22h · Sáb, 8h às 14h'
    where id = '11111111-1111-4111-8111-111111111111';
end $$;
revoke execute on function public.demo_reset() from public;
grant execute on function public.demo_reset() to anon, authenticated;
