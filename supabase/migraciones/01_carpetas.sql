-- Ejecutar en Supabase > SQL Editor (agrega carpetas anidadas)
create table public.folders (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  parent_id uuid references public.folders(id) on delete cascade,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);
alter table public.documents add column folder_id uuid references public.folders(id) on delete cascade;
alter table public.folders enable row level security;
create policy "ver carpetas" on folders for select using (is_active());
create policy "crear carpetas" on folders for insert with check (is_active());
create policy "editar carpetas" on folders for update using (is_active());
create policy "borrar carpetas" on folders for delete using (is_admin() or created_by = auth.uid());
create policy "editar documentos" on documents for update using (is_active());
