-- FASE 3: proyectos, equipos, indicadores, favoritos, comentarios, etiquetas
alter table public.documents add column if not exists etiquetas text[] not null default '{}';

create table public.proyectos (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid unique references public.folders(id) on delete set null,
  codigo text, nombre text not null, cliente text, responsable text,
  estado text not null default 'contratado' check (estado in ('propuesta','contratado','ejecucion','entregado','suspendido','cerrado')),
  fecha_inicio date, fecha_fin_prevista date, fecha_entrega_real date,
  satisfaccion int check (satisfaccion between 0 and 100),
  descripcion text, created_by uuid references public.profiles(id), created_at timestamptz default now()
);
alter table public.proyectos enable row level security;
create policy "ver proyectos" on proyectos for select using (can_view_folder(folder_id));
create policy "crear proyectos" on proyectos for insert with check (is_active());
create policy "editar proyectos" on proyectos for update using (is_active());
create policy "borrar proyectos" on proyectos for delete using (is_admin());

-- Valor y costo: solo administradores
create table public.proyecto_finanzas (
  proyecto_id uuid primary key references public.proyectos(id) on delete cascade,
  valor numeric, costo numeric
);
alter table public.proyecto_finanzas enable row level security;
create policy "finanzas admin" on proyecto_finanzas for all using (is_admin()) with check (is_admin());

create table public.equipos (
  id uuid primary key default gen_random_uuid(),
  codigo text, nombre text not null, tipo text, marca text, modelo text, serial text, responsable text,
  estado text not null default 'operativo' check (estado in ('operativo','mantenimiento','baja')),
  fecha_adquisicion date, ultima_calibracion date, proxima_calibracion date,
  ultimo_mantenimiento date, proximo_mantenimiento date, vence_seguro date, notas text,
  created_at timestamptz default now()
);
create table public.equipo_eventos (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references public.equipos(id) on delete cascade,
  tipo text not null check (tipo in ('calibracion','mantenimiento','reparacion','incidente','asignacion')),
  fecha date not null default current_date, detalle text, created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);
alter table public.equipos enable row level security;
alter table public.equipo_eventos enable row level security;
create policy "ver equipos" on equipos for select using (is_active());
create policy "admin equipos" on equipos for all using (is_admin()) with check (is_admin());
create policy "ver hoja de vida" on equipo_eventos for select using (is_active());
create policy "admin hoja de vida" on equipo_eventos for all using (is_admin()) with check (is_admin());

create table public.eventos_sgi (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('no_conformidad','accidente','capacitacion_programada','capacitacion_ejecutada')),
  fecha date not null default current_date, detalle text,
  created_by uuid references public.profiles(id), created_at timestamptz default now()
);
alter table public.eventos_sgi enable row level security;
create policy "ver eventos" on eventos_sgi for select using (is_active());
create policy "registrar eventos" on eventos_sgi for insert with check (is_active());
create policy "borrar eventos" on eventos_sgi for delete using (is_admin());

create table public.favoritos (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  item_type text not null check (item_type in ('f','d')), item_id uuid not null,
  primary key (user_id, item_type, item_id)
);
alter table public.favoritos enable row level security;
create policy "mis favoritos" on favoritos for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.comentarios (
  id uuid primary key default gen_random_uuid(),
  item_type text not null check (item_type in ('d','f','p')), item_id uuid not null,
  user_id uuid references public.profiles(id), user_nombre text, texto text not null,
  created_at timestamptz default now()
);
alter table public.comentarios enable row level security;
create policy "ver comentarios" on comentarios for select using (is_active());
create policy "escribir comentarios" on comentarios for insert with check (is_active() and user_id = auth.uid());
create policy "borrar comentarios" on comentarios for delete using (is_admin() or user_id = auth.uid());
