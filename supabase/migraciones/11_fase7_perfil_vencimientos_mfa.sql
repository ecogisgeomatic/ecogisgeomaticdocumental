-- FASE 7: foto de perfil, vencimiento/revisión por archivo y verificación en dos pasos con exigencia en la base de datos
alter table public.profiles add column if not exists avatar text;
alter table public.documents
  add column if not exists vence_at date,
  add column if not exists revision_meses int,
  add column if not exists proxima_revision date;

create or replace function public.actualizar_mi_perfil(p_nombre text, p_avatar text) returns void language sql security definer set search_path=public as $$
  update profiles set nombre = coalesce(nullif(trim(p_nombre), ''), nombre), avatar = coalesce(p_avatar, avatar) where id = auth.uid() $$;
grant execute on function public.actualizar_mi_perfil(text, text) to authenticated;

-- Fotos de perfil: carpeta pública, pero cada persona solo escribe en la suya
insert into storage.buckets (id, name, public) values ('avatares', 'avatares', true) on conflict (id) do update set public = true;
drop policy if exists "ver avatares" on storage.objects;
drop policy if exists "subir avatar propio" on storage.objects;
drop policy if exists "borrar avatar propio" on storage.objects;
create policy "ver avatares" on storage.objects for select using (bucket_id = 'avatares');
create policy "subir avatar propio" on storage.objects for insert with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "borrar avatar propio" on storage.objects for delete using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);

-- Verificación en dos pasos: quien activó el segundo factor no puede leer ni escribir datos hasta completarlo
create or replace function public.mfa_ok() returns boolean language sql security definer set search_path=public stable as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified') $$;
do $$ declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('drop policy if exists "exigir_mfa" on public.%I', t);
    execute format('create policy "exigir_mfa" on public.%I as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok())', t);
  end loop;
end $$;
drop policy if exists "exigir_mfa_storage" on storage.objects;
create policy "exigir_mfa_storage" on storage.objects as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok());
-- Si más adelante se crean tablas nuevas, vuelve a ejecutar este archivo para que también queden protegidas.
