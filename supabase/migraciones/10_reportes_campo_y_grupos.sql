-- FASE 8: reportes de campo, grupos por área, oportunidad -> proyecto

-- ===== Grupos por área =====
create table public.grupos (id uuid primary key default gen_random_uuid(), nombre text unique not null, created_at timestamptz default now());
create table public.grupo_miembros (
  grupo_id uuid not null references public.grupos(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (grupo_id, user_id)
);
create table public.folder_access_grupos (
  folder_id uuid not null references public.folders(id) on delete cascade,
  grupo_id uuid not null references public.grupos(id) on delete cascade,
  primary key (folder_id, grupo_id)
);
alter table public.grupos enable row level security;
alter table public.grupo_miembros enable row level security;
alter table public.folder_access_grupos enable row level security;
create policy "ver grupos" on grupos for select using (is_active());
create policy "admin grupos" on grupos for all using (is_admin()) with check (is_admin());
create policy "ver miembros" on grupo_miembros for select using (is_active());
create policy "admin miembros" on grupo_miembros for all using (is_admin()) with check (is_admin());
create policy "admin acceso grupos" on folder_access_grupos for all using (is_admin()) with check (is_admin());

-- La carpeta privada más cercana manda; ahora entran las personas marcadas O los miembros de un grupo marcado
create or replace function public.can_view_folder(fid uuid) returns boolean language sql security definer set search_path=public stable as $$
  with recursive up as (
    select id, parent_id, restringida, 0 as lvl from folders where id = fid
    union all
    select f.id, f.parent_id, f.restringida, u.lvl + 1 from folders f join up u on f.id = u.parent_id),
  r as (select id from up where restringida order by lvl limit 1)
  select case
    when not is_active() then false
    when fid is null or is_admin() then true
    when not exists (select 1 from r) then true
    else exists (select 1 from folder_access a where a.user_id = auth.uid() and a.folder_id = (select id from r))
      or exists (select 1 from folder_access_grupos g join grupo_miembros m on m.grupo_id = g.grupo_id
                 where g.folder_id = (select id from r) and m.user_id = auth.uid())
  end $$;

-- ===== Oportunidad adjudicada -> proyecto =====
alter table public.oportunidades add column if not exists proyecto_id uuid references public.proyectos(id) on delete set null;

-- ===== Reportes de campo =====
create table public.reportes_campo (
  id uuid primary key,
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  fecha date not null, hora text, ubicacion jsonb, clima text, personal text, equipos jsonb,
  actividades text, observaciones text, checklist jsonb,
  dron boolean not null default false, dron_checklist jsonb,
  incidente boolean not null default false, incidente_detalle text,
  fotos jsonb, pdf_document_id uuid references public.documents(id) on delete set null,
  created_at timestamptz default now()
);
alter table public.reportes_campo enable row level security;
create policy "ver reportes" on reportes_campo for select using (exists (select 1 from public.proyectos p where p.id = proyecto_id));
create policy "crear reportes" on reportes_campo for insert with check (is_active() and user_id = auth.uid());
create policy "editar reportes" on reportes_campo for update using (user_id = auth.uid() or is_admin());
create policy "borrar reportes" on reportes_campo for delete using (is_admin());
