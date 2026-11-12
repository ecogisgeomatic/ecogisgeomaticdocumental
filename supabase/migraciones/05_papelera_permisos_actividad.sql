-- FASE 1: papelera, permisos por carpeta, registro de actividad
alter table public.folders add column if not exists deleted_at timestamptz;
alter table public.folders add column if not exists restringida boolean not null default false;
alter table public.documents add column if not exists deleted_at timestamptz;

create table public.folder_access (
  folder_id uuid references public.folders(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  primary key (folder_id, user_id)
);
alter table public.folder_access enable row level security;
create policy "ver accesos carpeta" on folder_access for select using (is_admin() or user_id = auth.uid());
create policy "dar acceso" on folder_access for insert with check (is_admin());
create policy "quitar acceso" on folder_access for delete using (is_admin());

create table public.activity (
  id bigint generated always as identity primary key,
  user_id uuid, user_nombre text, accion text not null, detalle text,
  created_at timestamptz default now()
);
alter table public.activity enable row level security;
create policy "ver actividad" on activity for select using (is_admin());
create policy "registrar actividad" on activity for insert with check (is_active() and user_id = auth.uid());

-- ¿Puede la persona ver esta carpeta? La carpeta privada más cercana (ella o sus padres) manda.
create or replace function public.can_view_folder(fid uuid) returns boolean language sql security definer set search_path=public stable as $$
  with recursive up as (
    select id, parent_id, restringida, 0 as lvl from folders where id = fid
    union all
    select f.id, f.parent_id, f.restringida, u.lvl + 1 from folders f join up u on f.id = u.parent_id)
  select case
    when not is_active() then false
    when fid is null or is_admin() then true
    when not exists (select 1 from up where restringida) then true
    else exists (select 1 from folder_access a where a.user_id = auth.uid()
                 and a.folder_id = (select id from up where restringida order by lvl limit 1))
  end $$;

drop policy "ver carpetas" on public.folders;
drop policy "crear carpetas" on public.folders;
drop policy "ver documentos" on public.documents;
drop policy "subir documentos" on public.documents;
drop policy "leer archivos" on storage.objects;
create policy "ver carpetas" on folders for select using (can_view_folder(id));
create policy "crear carpetas" on folders for insert with check (is_active() and can_view_folder(parent_id));
create policy "ver documentos" on documents for select using (can_view_folder(folder_id));
create policy "subir documentos" on documents for insert with check (is_active() and can_view_folder(folder_id));
create policy "leer archivos" on storage.objects for select using (bucket_id = 'documentos' and exists (select 1 from public.documents d where d.path = storage.objects.name));

-- Solo administradores cambian la privacidad; solo admin o dueño envía a la papelera / restaura
create function public.guard_folder() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.restringida is distinct from old.restringida and not is_admin() then new.restringida := old.restringida; end if;
  return new;
end $$;
create trigger t_guard_folder before update on folders for each row execute function guard_folder();

create function public.guard_borrado() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.deleted_at is distinct from old.deleted_at and not (is_admin() or auth.uid()::text = coalesce(to_jsonb(old)->>'uploaded_by', to_jsonb(old)->>'created_by')) then
    raise exception 'Solo el administrador o quien lo creó puede enviarlo a la papelera o restaurarlo';
  end if;
  return new;
end $$;
create trigger t_borrado_f before update on folders for each row execute function guard_borrado();
create trigger t_borrado_d before update on documents for each row execute function guard_borrado();

-- Los enlaces compartidos no deben mostrar lo que está en la papelera
create or replace function public.get_share(p_token text) returns json language plpgsql security definer set search_path=public stable as $$
declare s shares; r json;
begin
  select * into s from shares where token = p_token and activo and (expires_at is null or expires_at > now());
  if not found then return null; end if;
  if s.item_type = 'document' then
    select json_build_object('tipo','document','nombre',d.nombre,'root',null,'carpetas','[]'::json,'documentos',json_build_array(row_to_json(d)))
      into r from documents d where d.id = s.item_id and d.deleted_at is null;
  else
    select json_build_object('tipo','folder','nombre',(select nombre from folders where id = s.item_id),'root',s.item_id,
      'carpetas',coalesce((select json_agg(f) from folders f where f.deleted_at is null and f.id in (select x from folder_tree(s.item_id) x)),'[]'::json),
      'documentos',coalesce((select json_agg(d) from documents d where d.deleted_at is null and d.folder_id in (select x from folder_tree(s.item_id) x)),'[]'::json))
      into r where exists (select 1 from folders where id = s.item_id and deleted_at is null);
  end if;
  return r;
end $$;
create or replace function public.path_shared(p text) returns boolean language sql security definer set search_path=public stable as $$
  select exists(select 1 from documents d join shares s on s.activo and (s.expires_at is null or s.expires_at > now())
    where d.path = p and d.deleted_at is null and ((s.item_type='document' and s.item_id = d.id)
      or (s.item_type='folder' and d.folder_id in (select x from folder_tree(s.item_id) x)))) $$;
