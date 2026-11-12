-- FASE 6: encuesta de satisfacción, PQRS público y firma electrónica
create extension if not exists pgcrypto with schema extensions;

-- ================= ENCUESTA DE SATISFACCIÓN =================
create table public.encuestas (
  id uuid primary key default gen_random_uuid(),
  token text unique not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  p1 int check (p1 between 1 and 5), p2 int check (p2 between 1 and 5), p3 int check (p3 between 1 and 5), p4 int check (p4 between 1 and 5),
  comentario text, respondida_at timestamptz,
  created_by uuid references public.profiles(id), created_at timestamptz default now()
);
alter table public.encuestas enable row level security;
create policy "ver encuestas" on encuestas for select using (is_active());
create policy "crear encuestas" on encuestas for insert with check (is_active());
create policy "borrar encuestas" on encuestas for delete using (is_admin());

create function public.get_encuesta(p_token text) returns jsonb language sql security definer set search_path=public stable as $$
  select jsonb_build_object('proyecto', pr.nombre, 'cliente', pr.cliente, 'respondida', e.respondida_at is not null)
  from encuestas e join proyectos pr on pr.id = e.proyecto_id where e.token = p_token $$;

create function public.responder_encuesta(p_token text, p1 int, p2 int, p3 int, p4 int, p_comentario text) returns void language plpgsql security definer set search_path=public as $$
declare pid uuid;
begin
  if least(p1,p2,p3,p4) < 1 or greatest(p1,p2,p3,p4) > 5 then raise exception 'Las calificaciones van de 1 a 5'; end if;
  update encuestas set p1 = responder_encuesta.p1, p2 = responder_encuesta.p2, p3 = responder_encuesta.p3, p4 = responder_encuesta.p4,
    comentario = left(p_comentario, 2000), respondida_at = now()
  where token = p_token and respondida_at is null returning proyecto_id into pid;
  if pid is null then raise exception 'Esta encuesta no existe o ya fue respondida'; end if;
  update proyectos set satisfaccion = (select round(avg((e.p1 + e.p2 + e.p3 + e.p4) / 4.0 * 20))::int from encuestas e where e.proyecto_id = pid and e.respondida_at is not null) where id = pid;
end $$;
grant execute on function public.get_encuesta(text), public.responder_encuesta(text,int,int,int,int,text) to anon, authenticated;

-- ================= PQRS =================
create sequence public.pqrs_seq;
create table public.pqrs (
  id uuid primary key default gen_random_uuid(), radicado text unique not null,
  tipo text not null check (tipo in ('peticion','queja','reclamo','sugerencia')),
  nombre text not null, documento text, email text not null, telefono text,
  asunto text not null, mensaje text not null, acepta_datos boolean not null,
  estado text not null default 'recibida' check (estado in ('recibida','en_tramite','respondida','cerrada')),
  fecha_limite date not null, respuesta text, respondida_at timestamptz, ip text, created_at timestamptz default now()
);
alter table public.pqrs enable row level security;
create policy "admin ve pqrs" on pqrs for select using (is_admin());
create policy "admin edita pqrs" on pqrs for update using (is_admin());
create policy "admin borra pqrs" on pqrs for delete using (is_admin());

-- Suma días hábiles (lunes a viernes; no descuenta festivos)
create function public.sumar_habiles(d date, n int) returns date language plpgsql immutable as $$
declare r date := d; c int := 0;
begin
  while c < n loop r := r + 1; if extract(isodow from r) < 6 then c := c + 1; end if; end loop;
  return r;
end $$;

create function public.radicar_pqrs(p_tipo text, p_nombre text, p_documento text, p_email text, p_telefono text, p_asunto text, p_mensaje text, p_acepta boolean, p_hp text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare rad text; lim date; v_ip text;
begin
  if coalesce(p_hp, '') <> '' then return jsonb_build_object('radicado', 'PQRS-0000', 'fecha_limite', current_date); end if;
  if p_tipo not in ('peticion','queja','reclamo','sugerencia') then raise exception 'Tipo no válido'; end if;
  if not coalesce(p_acepta, false) then raise exception 'Debes autorizar el tratamiento de tus datos personales'; end if;
  if length(trim(coalesce(p_nombre,''))) < 3 or length(trim(coalesce(p_asunto,''))) < 3 or length(trim(coalesce(p_mensaje,''))) < 10 then raise exception 'Completa tu nombre, el asunto y el mensaje'; end if;
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'El correo no es válido'; end if;
  if length(p_mensaje) > 5000 or length(p_asunto) > 200 or length(p_nombre) > 150 then raise exception 'Texto demasiado largo'; end if;
  if (select count(*) from pqrs where lower(email) = lower(p_email) and created_at > now() - interval '1 hour') >= 5
     or (select count(*) from pqrs where created_at > now() - interval '10 minutes') >= 30 then raise exception 'Hay demasiadas solicitudes en este momento. Intenta de nuevo en un rato.'; end if;
  rad := 'PQRS-' || extract(year from now())::int || '-' || lpad(nextval('pqrs_seq')::text, 4, '0');
  lim := sumar_habiles(current_date, 15);   -- plazo interno por defecto: ajústalo según el manual (numeral 10.6)
  v_ip := nullif(trim(split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1)), '');
  insert into pqrs (radicado, tipo, nombre, documento, email, telefono, asunto, mensaje, acepta_datos, fecha_limite, ip)
  values (rad, p_tipo, trim(p_nombre), nullif(trim(p_documento),''), trim(p_email), nullif(trim(p_telefono),''), trim(p_asunto), trim(p_mensaje), true, lim, v_ip);
  return jsonb_build_object('radicado', rad, 'fecha_limite', lim);
end $$;

create function public.consultar_pqrs(p_radicado text, p_email text) returns jsonb language sql security definer set search_path=public stable as $$
  select jsonb_build_object('radicado', radicado, 'tipo', tipo, 'estado', estado, 'fecha_limite', fecha_limite, 'respuesta', respuesta, 'creada', created_at)
  from pqrs where radicado = upper(trim(p_radicado)) and lower(email) = lower(trim(p_email)) $$;
grant execute on function public.radicar_pqrs(text,text,text,text,text,text,text,boolean,text), public.consultar_pqrs(text,text) to anon, authenticated;

-- ================= FIRMA ELECTRÓNICA =================
create table public.firmas_solicitudes (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete restrict,
  titulo text not null, mensaje text, version text, hash_documento text not null,
  estado text not null default 'abierta' check (estado in ('abierta','completa','cancelada')),
  doc_firmado_id uuid references public.documents(id) on delete set null,
  creada_por uuid not null references public.profiles(id),
  created_at timestamptz default now(), completada_at timestamptz
);
create table public.firmas_firmantes (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references public.firmas_solicitudes(id) on delete cascade,
  tipo text not null check (tipo in ('interno','externo')),
  user_id uuid references public.profiles(id),
  nombre text not null, email text, cedula text,
  token text unique, pin_hash text, intentos int not null default 0,
  estado text not null default 'pendiente' check (estado in ('pendiente','firmado','rechazado')),
  firmado_at timestamptz, ip text, user_agent text, firma_png text, hash_firmado text, motivo text,
  created_at timestamptz default now()
);
alter table public.firmas_solicitudes enable row level security;
alter table public.firmas_firmantes enable row level security;

create function public.es_parte_firma(sid uuid) returns boolean language sql security definer set search_path=public stable as $$
  select is_admin()
    or exists (select 1 from firmas_solicitudes s where s.id = sid and s.creada_por = auth.uid())
    or exists (select 1 from firmas_firmantes f where f.solicitud_id = sid and f.user_id = auth.uid()) $$;
create policy "ver solicitudes" on firmas_solicitudes for select using (es_parte_firma(id));
create policy "actualizar solicitudes" on firmas_solicitudes for update using (is_admin() or creada_por = auth.uid());
create policy "ver firmantes" on firmas_firmantes for select using (es_parte_firma(solicitud_id));
-- El token y el PIN nunca se pueden leer desde la página
revoke select on public.firmas_firmantes from anon, authenticated;
grant select (id, solicitud_id, tipo, user_id, nombre, email, cedula, estado, firmado_at, ip, firma_png, hash_firmado, motivo, created_at) on public.firmas_firmantes to authenticated;

create function public.crear_solicitud_firma(p_document uuid, p_titulo text, p_mensaje text, p_hash text, p_firmantes jsonb)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare d documents; sid uuid; x jsonb; tk text; res jsonb := '[]'::jsonb; fid uuid; nm text;
begin
  if not is_active() then raise exception 'Sin permiso'; end if;
  select * into d from documents where id = p_document and deleted_at is null;
  if not found or not can_view_folder(d.folder_id) then raise exception 'Documento no disponible'; end if;
  if lower(d.nombre) not like '%.pdf' then raise exception 'Solo se pueden enviar a firmar archivos PDF'; end if;
  if jsonb_array_length(p_firmantes) = 0 then raise exception 'Agrega al menos un firmante'; end if;
  insert into firmas_solicitudes (document_id, titulo, mensaje, version, hash_documento, creada_por)
  values (d.id, left(p_titulo,200), left(p_mensaje,1000), d.version, p_hash, auth.uid()) returning id into sid;
  for x in select * from jsonb_array_elements(p_firmantes) loop
    if x->>'tipo' = 'interno' then
      select coalesce(nombre, email) into nm from profiles where id = (x->>'user_id')::uuid and activo;
      if nm is null then raise exception 'Persona interna no válida'; end if;
      insert into firmas_firmantes (solicitud_id, tipo, user_id, nombre) values (sid, 'interno', (x->>'user_id')::uuid, nm) returning id into fid;
      res := res || jsonb_build_object('id', fid, 'tipo', 'interno', 'nombre', nm);
    else
      if coalesce(x->>'pin','') !~ '^[0-9]{6}$' then raise exception 'El PIN debe tener 6 números'; end if;
      tk := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
      insert into firmas_firmantes (solicitud_id, tipo, nombre, email, cedula, token, pin_hash)
      values (sid, 'externo', left(x->>'nombre',150), nullif(x->>'email',''), nullif(x->>'cedula',''), tk, encode(digest((x->>'pin') || ':' || tk, 'sha256'), 'hex')) returning id into fid;
      res := res || jsonb_build_object('id', fid, 'tipo', 'externo', 'nombre', x->>'nombre', 'token', tk);
    end if;
  end loop;
  return jsonb_build_object('solicitud', sid, 'firmantes', res);
end $$;

create function public.ver_enlaces_firma(p_sid uuid) returns jsonb language sql security definer set search_path=public stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'nombre', f.nombre, 'token', f.token, 'estado', f.estado)), '[]'::jsonb)
  from firmas_firmantes f join firmas_solicitudes s on s.id = f.solicitud_id
  where f.solicitud_id = p_sid and f.tipo = 'externo' and (s.creada_por = auth.uid() or is_admin()) $$;

create function public.regenerar_firmante(p_fid uuid, p_pin text) returns text language plpgsql security definer set search_path=public,extensions as $$
declare tk text;
begin
  if p_pin !~ '^[0-9]{6}$' then raise exception 'El PIN debe tener 6 números'; end if;
  tk := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  update firmas_firmantes f set token = tk, pin_hash = encode(digest(p_pin || ':' || tk, 'sha256'), 'hex'), intentos = 0
  where f.id = p_fid and f.tipo = 'externo' and f.estado = 'pendiente'
    and exists (select 1 from firmas_solicitudes s where s.id = f.solicitud_id and s.estado = 'abierta' and (s.creada_por = auth.uid() or is_admin()));
  if not found then raise exception 'No se pudo regenerar'; end if;
  return tk;
end $$;

create function public._cerrar_si_completa(sid uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists (select 1 from firmas_firmantes where solicitud_id = sid and estado <> 'firmado') then
    update firmas_solicitudes set estado = 'completa', completada_at = now() where id = sid and estado = 'abierta';
  end if;
end $$;

-- Verifica enlace + PIN y cuenta los intentos fallidos (máximo 5)
create function public._chk(p_token text, p_pin text) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare f firmas_firmantes; s firmas_solicitudes;
begin
  select * into f from firmas_firmantes where token = p_token and tipo = 'externo';
  if not found then return jsonb_build_object('error', 'Enlace no válido'); end if;
  if f.intentos >= 5 then return jsonb_build_object('error', 'Enlace bloqueado por demasiados intentos. Pide uno nuevo a quien te lo envió.'); end if;
  if f.pin_hash <> encode(digest(coalesce(p_pin,'') || ':' || f.token, 'sha256'), 'hex') then
    update firmas_firmantes set intentos = intentos + 1 where id = f.id;
    return jsonb_build_object('error', 'PIN incorrecto. Intentos restantes: ' || (4 - f.intentos));
  end if;
  select * into s from firmas_solicitudes where id = f.solicitud_id;
  if s.estado = 'cancelada' then return jsonb_build_object('error', 'Esta solicitud fue cancelada'); end if;
  return jsonb_build_object('id', f.id);
end $$;

create function public.abrir_firma(p_token text, p_pin text) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare r jsonb; f firmas_firmantes; s firmas_solicitudes; d documents;
begin
  r := _chk(p_token, p_pin); if r->>'error' is not null then return r; end if;
  select * into f from firmas_firmantes where id = (r->>'id')::uuid;
  select * into s from firmas_solicitudes where id = f.solicitud_id;
  select * into d from documents where id = s.document_id;
  return jsonb_build_object('firmante_nombre', f.nombre, 'estado_firmante', f.estado, 'titulo', s.titulo, 'mensaje', s.mensaje, 'path', d.path, 'nombre_doc', d.nombre, 'hash_documento', s.hash_documento);
end $$;

create function public.firmar_externo(p_token text, p_pin text, p_nombre text, p_cedula text, p_firma text, p_hash text, p_ua text) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare r jsonb; f firmas_firmantes; s firmas_solicitudes; v_ip text;
begin
  r := _chk(p_token, p_pin); if r->>'error' is not null then return r; end if;
  select * into f from firmas_firmantes where id = (r->>'id')::uuid for update;
  if f.estado <> 'pendiente' then return jsonb_build_object('error', 'Ya respondiste esta solicitud'); end if;
  select * into s from firmas_solicitudes where id = f.solicitud_id;
  if s.estado <> 'abierta' then return jsonb_build_object('error', 'La solicitud ya no está abierta'); end if;
  if p_hash is distinct from s.hash_documento then return jsonb_build_object('error', 'El documento cambió desde que se pidió la firma. No se puede firmar.'); end if;
  if left(coalesce(p_firma,''), 22) <> 'data:image/png;base64,' or length(p_firma) > 400000 then return jsonb_build_object('error', 'Firma no válida'); end if;
  v_ip := nullif(trim(split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1)), '');
  update firmas_firmantes set estado = 'firmado', nombre = left(p_nombre,150), cedula = left(p_cedula,40), firma_png = p_firma, hash_firmado = p_hash, firmado_at = now(), ip = v_ip, user_agent = left(p_ua,300) where id = f.id;
  perform _cerrar_si_completa(s.id);
  return jsonb_build_object('ok', true);
end $$;

create function public.rechazar_firma(p_token text, p_pin text, p_motivo text) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare r jsonb; v_ip text;
begin
  r := _chk(p_token, p_pin); if r->>'error' is not null then return r; end if;
  v_ip := nullif(trim(split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1)), '');
  update firmas_firmantes set estado = 'rechazado', motivo = left(p_motivo,500), firmado_at = now(), ip = v_ip where id = (r->>'id')::uuid and estado = 'pendiente';
  return jsonb_build_object('ok', true);
end $$;

create function public.firmar_interno(p_firmante uuid, p_firma text, p_hash text, p_ua text) returns jsonb language plpgsql security definer set search_path=public as $$
declare f firmas_firmantes; s firmas_solicitudes; v_ip text;
begin
  select * into f from firmas_firmantes where id = p_firmante for update;
  if not found or f.user_id is distinct from auth.uid() or f.estado <> 'pendiente' then raise exception 'No puedes firmar esta solicitud'; end if;
  select * into s from firmas_solicitudes where id = f.solicitud_id;
  if s.estado <> 'abierta' then raise exception 'La solicitud ya no está abierta'; end if;
  if p_hash is distinct from s.hash_documento then raise exception 'El documento cambió desde que se pidió la firma. No se puede firmar.'; end if;
  if left(coalesce(p_firma,''), 22) <> 'data:image/png;base64,' or length(p_firma) > 400000 then raise exception 'Firma no válida'; end if;
  v_ip := nullif(trim(split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1)), '');
  update firmas_firmantes set estado = 'firmado', firma_png = p_firma, hash_firmado = p_hash, firmado_at = now(), ip = v_ip, user_agent = left(p_ua,300) where id = f.id;
  perform _cerrar_si_completa(s.id);
  return jsonb_build_object('ok', true);
end $$;

create function public.path_en_firma(p text) returns boolean language sql security definer set search_path=public stable as $$
  select exists (select 1 from documents d join firmas_solicitudes s on s.document_id = d.id where d.path = p and s.estado in ('abierta','completa')) $$;
create policy "leer archivos en firma" on storage.objects for select using (bucket_id = 'documentos' and public.path_en_firma(name));

-- Permisos de ejecución: lo público solo puede usar las funciones de enlace + PIN
revoke execute on function public._chk(text,text), public._cerrar_si_completa(uuid), public.es_parte_firma(uuid) from public, anon, authenticated;
grant execute on function public.es_parte_firma(uuid) to authenticated;
revoke execute on function public.crear_solicitud_firma(uuid,text,text,text,jsonb), public.ver_enlaces_firma(uuid), public.regenerar_firmante(uuid,text), public.firmar_interno(uuid,text,text,text) from public, anon;
grant execute on function public.crear_solicitud_firma(uuid,text,text,text,jsonb), public.ver_enlaces_firma(uuid), public.regenerar_firmante(uuid,text), public.firmar_interno(uuid,text,text,text) to authenticated;
grant execute on function public.abrir_firma(text,text), public.firmar_externo(text,text,text,text,text,text,text), public.rechazar_firma(text,text,text) to anon, authenticated;
