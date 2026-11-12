-- FASE 2: estado y versión por archivo, historial de versiones
alter table public.documents
  add column if not exists codigo text,
  add column if not exists version text not null default '1.0',
  add column if not exists estado text not null default 'vigente' check (estado in ('borrador','revision','vigente','obsoleto'));

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  version text, nombre text, path text not null, tamano bigint,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);
alter table public.document_versions enable row level security;
create policy "ver versiones" on document_versions for select using (exists (select 1 from public.documents d where d.id = document_id));
create policy "crear versiones" on document_versions for insert with check (is_active());
create policy "borrar versiones" on document_versions for delete using (is_admin());

-- Las versiones anteriores también se pueden descargar
drop policy "leer archivos" on storage.objects;
create policy "leer archivos" on storage.objects for select using (bucket_id = 'documentos' and (
  exists (select 1 from public.documents d where d.path = storage.objects.name)
  or exists (select 1 from public.document_versions v where v.path = storage.objects.name)));
