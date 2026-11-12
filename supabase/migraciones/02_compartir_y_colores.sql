-- Ejecutar en Supabase > SQL Editor (colores de carpeta + enlaces para compartir)
alter table public.folders add column if not exists color text;

create table public.shares (
  id uuid primary key default gen_random_uuid(),
  token text unique not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  item_type text not null check (item_type in ('folder','document')),
  item_id uuid not null,
  expires_at timestamptz,
  activo boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);
alter table public.shares enable row level security;
create policy "ver enlaces" on shares for select using (is_active());
create policy "crear enlaces" on shares for insert with check (is_active());
create policy "editar enlaces" on shares for update using (is_admin() or created_by = auth.uid());
create policy "borrar enlaces" on shares for delete using (is_admin() or created_by = auth.uid());

create function public.folder_tree(root uuid) returns setof uuid language sql security definer set search_path=public stable as $$
  with recursive t as (select id from folders where id = root union all select f.id from folders f join t on f.parent_id = t.id)
  select id from t $$;

create function public.get_share(p_token text) returns json language plpgsql security definer set search_path=public stable as $$
declare s shares; r json;
begin
  select * into s from shares where token = p_token and activo and (expires_at is null or expires_at > now());
  if not found then return null; end if;
  if s.item_type = 'document' then
    select json_build_object('tipo','document','nombre',d.nombre,'root',null,'carpetas','[]'::json,'documentos',json_build_array(row_to_json(d)))
      into r from documents d where d.id = s.item_id;
  else
    select json_build_object('tipo','folder','nombre',(select nombre from folders where id = s.item_id),'root',s.item_id,
      'carpetas',coalesce((select json_agg(f) from folders f where f.id in (select x from folder_tree(s.item_id) x)),'[]'::json),
      'documentos',coalesce((select json_agg(d) from documents d where d.folder_id in (select x from folder_tree(s.item_id) x)),'[]'::json))
      into r;
  end if;
  return r;
end $$;
grant execute on function public.get_share(text) to anon, authenticated;

create function public.path_shared(p text) returns boolean language sql security definer set search_path=public stable as $$
  select exists(select 1 from documents d join shares s on s.activo and (s.expires_at is null or s.expires_at > now())
    where d.path = p and ((s.item_type='document' and s.item_id = d.id)
      or (s.item_type='folder' and d.folder_id in (select x from folder_tree(s.item_id) x)))) $$;
grant execute on function public.path_shared(text) to anon, authenticated;
create policy "leer archivos compartidos" on storage.objects for select using (bucket_id='documentos' and public.path_shared(name));
