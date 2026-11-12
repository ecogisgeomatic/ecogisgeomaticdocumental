-- FASE 5: aprobaciones, tareas, reservas de equipos, oportunidades, documentos habilitantes
create extension if not exists btree_gist;

-- El equipo puede ver quién es quién (para asignar tareas, aprobaciones y reservas)
create policy "equipo ve equipo" on public.profiles for select using (is_active());

-- ===== Flujo de aprobación =====
create table public.aprobaciones (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  ronda int not null default 1, version text,
  rol text not null check (rol in ('revision','aprobacion')), orden int not null default 1,
  user_id uuid not null references public.profiles(id),
  estado text not null default 'pendiente' check (estado in ('pendiente','aprobado','rechazado','cancelado')),
  comentario text, solicitado_por uuid references public.profiles(id),
  created_at timestamptz default now(), resuelto_at timestamptz
);
alter table public.aprobaciones enable row level security;
create policy "ver aprobaciones" on aprobaciones for select using (is_active());
create policy "pedir aprobacion" on aprobaciones for insert with check (is_active() and solicitado_por = auth.uid());
create policy "borrar aprobacion" on aprobaciones for delete using (is_admin() or solicitado_por = auth.uid());

create function public.resolver_aprobacion(p_id uuid, p_estado text, p_comentario text) returns void language plpgsql security definer set search_path=public as $$
declare a aprobaciones;
begin
  select * into a from aprobaciones where id = p_id;
  if not found or a.user_id <> auth.uid() or a.estado <> 'pendiente' then raise exception 'No puedes resolver esta solicitud'; end if;
  if p_estado not in ('aprobado','rechazado') then raise exception 'Estado no válido'; end if;
  if exists (select 1 from aprobaciones where document_id = a.document_id and ronda = a.ronda and orden < a.orden and estado <> 'aprobado') then
    raise exception 'Aún falta la revisión anterior';
  end if;
  update aprobaciones set estado = p_estado, comentario = p_comentario, resuelto_at = now() where id = p_id;
  if p_estado = 'rechazado' then
    update aprobaciones set estado = 'cancelado', resuelto_at = now() where document_id = a.document_id and ronda = a.ronda and estado = 'pendiente';
    update documents set estado = 'borrador' where id = a.document_id;
  elsif a.rol = 'aprobacion' then
    update documents set estado = 'vigente' where id = a.document_id;
  end if;
end $$;
grant execute on function public.resolver_aprobacion(uuid, text, text) to authenticated;

-- ===== Tareas y cronograma =====
create table public.tareas (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid references public.proyectos(id) on delete cascade,
  titulo text not null, descripcion text, responsable uuid references public.profiles(id),
  fecha_inicio date, fecha_fin date,
  estado text not null default 'pendiente' check (estado in ('pendiente','en_curso','hecha','bloqueada')),
  prioridad text not null default 'media' check (prioridad in ('baja','media','alta')),
  created_by uuid references public.profiles(id), created_at timestamptz default now()
);
alter table public.tareas enable row level security;
create policy "ver tareas" on tareas for select using (proyecto_id is null or exists (select 1 from public.proyectos p where p.id = proyecto_id));
create policy "crear tareas" on tareas for insert with check (is_active());
create policy "editar tareas" on tareas for update using (is_active());
create policy "borrar tareas" on tareas for delete using (is_admin() or created_by = auth.uid());

-- ===== Reservas de equipos (sin cruces de fechas) =====
create table public.reservas (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references public.equipos(id) on delete cascade,
  proyecto_id uuid references public.proyectos(id) on delete set null,
  user_id uuid not null default auth.uid() references public.profiles(id),
  desde date not null, hasta date not null check (hasta >= desde), nota text,
  created_at timestamptz default now(),
  exclude using gist (equipo_id with =, daterange(desde, hasta, '[]') with &&)
);
alter table public.reservas enable row level security;
create policy "ver reservas" on reservas for select using (is_active());
create policy "crear reservas" on reservas for insert with check (is_active() and user_id = auth.uid());
create policy "borrar reservas" on reservas for delete using (is_admin() or user_id = auth.uid());

-- ===== Oportunidades =====
create table public.oportunidades (
  id uuid primary key default gen_random_uuid(),
  entidad text, objeto text not null, proceso text, enlace text, modalidad text, valor numeric,
  fecha_cierre date, responsable uuid references public.profiles(id),
  estado text not null default 'identificada' check (estado in ('identificada','evaluando','preparando','presentada','adjudicada','perdida','descartada')),
  notas text, created_by uuid references public.profiles(id), created_at timestamptz default now()
);
alter table public.oportunidades enable row level security;
create policy "ver oportunidades" on oportunidades for select using (is_active());
create policy "crear oportunidades" on oportunidades for insert with check (is_active());
create policy "editar oportunidades" on oportunidades for update using (is_active());
create policy "borrar oportunidades" on oportunidades for delete using (is_admin());

-- ===== Documentos habilitantes =====
create table public.habilitantes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  categoria text not null default 'Otro' check (categoria in ('Jurídico','Financiero','Técnico','Experiencia','Otro')),
  document_id uuid references public.documents(id) on delete set null,
  fecha_expedicion date, fecha_vence date, observaciones text, created_at timestamptz default now()
);
alter table public.habilitantes enable row level security;
create policy "ver habilitantes" on habilitantes for select using (is_active());
create policy "admin habilitantes" on habilitantes for all using (is_admin()) with check (is_admin());
insert into public.habilitantes (nombre, categoria) values
 ('RUT actualizado','Jurídico'),
 ('Certificado de existencia y representación legal (Cámara de Comercio)','Jurídico'),
 ('Cédula del representante legal','Jurídico'),
 ('Registro Único de Proponentes (RUP)','Jurídico'),
 ('Certificado de antecedentes fiscales (Contraloría)','Jurídico'),
 ('Certificado de antecedentes disciplinarios (Procuraduría)','Jurídico'),
 ('Antecedentes judiciales (Policía)','Jurídico'),
 ('Pago de seguridad social y parafiscales','Jurídico'),
 ('Estados financieros con corte a 31 de diciembre','Financiero'),
 ('Certificación bancaria','Financiero'),
 ('Hojas de vida y soportes del equipo técnico','Técnico'),
 ('Licencias y registros de operación de drones','Técnico'),
 ('Certificaciones de experiencia (contratos ejecutados)','Experiencia');
