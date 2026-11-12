-- Ecogis Geomatic SAS · esquema del gestor documental
-- Pega TODO esto en Supabase > SQL Editor > Run

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text, nombre text,
  rol text not null default 'miembro' check (rol in ('admin','miembro')),
  activo boolean not null default false,
  created_at timestamptz default now()
);
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  nombre text not null, cliente text, descripcion text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade, -- null = documentos generales
  nombre text not null, path text not null, tamano bigint, tipo text, categoria text,
  uploaded_by uuid references public.profiles(id), uploaded_by_nombre text,
  created_at timestamptz default now()
);

-- Funciones de apoyo
create function public.is_active() returns boolean language sql security definer set search_path=public stable
as $$ select coalesce((select activo from profiles where id = auth.uid()), false) $$;
create function public.is_admin() returns boolean language sql security definer set search_path=public stable
as $$ select coalesce((select rol='admin' and activo from profiles where id = auth.uid()), false) $$;

-- El primer usuario registrado queda como administrador activo; los demás quedan inactivos
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
declare primero boolean;
begin
  select not exists(select 1 from profiles) into primero;
  insert into profiles(id,email,nombre,rol,activo)
  values (new.id,new.email,new.raw_user_meta_data->>'nombre', case when primero then 'admin' else 'miembro' end, primero);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Seguridad por filas (RLS)
alter table profiles enable row level security;
alter table projects enable row level security;
alter table documents enable row level security;

create policy "perfil propio o admin" on profiles for select using (id = auth.uid() or is_admin());
create policy "admin edita perfiles" on profiles for update using (is_admin());

create policy "ver proyectos" on projects for select using (is_active());
create policy "crear proyectos" on projects for insert with check (is_active());
create policy "editar proyectos" on projects for update using (is_admin() or created_by = auth.uid());
create policy "borrar proyectos" on projects for delete using (is_admin() or created_by = auth.uid());

create policy "ver documentos" on documents for select using (is_active());
create policy "subir documentos" on documents for insert with check (is_active());
create policy "borrar documentos" on documents for delete using (is_admin() or uploaded_by = auth.uid());

-- Almacenamiento privado
insert into storage.buckets (id,name,public) values ('documentos','documentos',false) on conflict do nothing;
create policy "leer archivos" on storage.objects for select using (bucket_id='documentos' and public.is_active());
create policy "subir archivos" on storage.objects for insert with check (bucket_id='documentos' and public.is_active());
create policy "borrar archivos" on storage.objects for delete using (bucket_id='documentos' and (public.is_admin() or owner = auth.uid()));
