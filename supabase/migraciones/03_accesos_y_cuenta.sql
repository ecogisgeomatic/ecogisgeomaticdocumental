-- Ejecutar en Supabase > SQL Editor (accesos rápidos + editar mi nombre)
create table public.links (
  id uuid primary key default gen_random_uuid(),
  grupo text not null, nombre text not null, descripcion text, url text not null,
  orden int default 100, created_at timestamptz default now()
);
alter table public.links enable row level security;
create policy "ver accesos" on links for select using (is_active());
create policy "crear accesos" on links for insert with check (is_admin());
create policy "editar accesos" on links for update using (is_admin());
create policy "borrar accesos" on links for delete using (is_admin());

insert into public.links (grupo,nombre,descripcion,url,orden) values
('Contratación','SECOP II','Portal de contratación pública','https://community.secop.gov.co/',1),
('Contratación','Colombia Compra Eficiente','Agencia Nacional de Contratación','https://www.colombiacompra.gov.co/',2),
('Contratación','RUES','Registro único empresarial','https://www.rues.org.co/',3),
('Seguridad social','ARL SURA','Riesgos laborales','https://www.arlsura.com/',10),
('Seguridad social','Planilla SOI','Pago de seguridad social','https://www.soi.com.co/',11),
('Impuestos DIAN','RUT y MUISCA','Servicios en línea DIAN','https://muisca.dian.gov.co/',20),
('Impuestos DIAN','Facturación electrónica','Factura electrónica DIAN','https://www.dian.gov.co/impuestos/factura-electronica/Paginas/default.aspx',21),
('Impuestos DIAN','Portal DIAN','Sitio principal de la DIAN','https://www.dian.gov.co/',22),
('Comunicación','Correo Ecogis','ecogisgeomatic@gmail.com','https://mail.google.com/mail/?authuser=ecogisgeomatic@gmail.com',30),
('Comunicación','Google Drive','Archivos en la nube de Google','https://drive.google.com/',31),
('Certificados','Antecedentes Procuraduría','Certificado de antecedentes','https://www.procuraduria.gov.co/Pages/Generacion-de-antecedentes.aspx',40),
('Certificados','Antecedentes Policía','Antecedentes judiciales','https://antecedentes.policia.gov.co:7005/WebJudicial/',41),
('Certificados','Contraloría','Responsabilidad fiscal','https://www.contraloria.gov.co/',42),
('Geografía','IGAC','Instituto Geográfico Agustín Codazzi','https://www.igac.gov.co/',50),
('Geografía','Colombia en Mapas','Información geográfica oficial','https://www.colombiaenmapas.gov.co/',51),
('Administración técnica','Supabase','Base de datos y archivos','https://supabase.com/dashboard',60),
('Administración técnica','Vercel','Publicación de esta página','https://vercel.com/dashboard',61),
('Administración técnica','GitHub','Código de esta página','https://github.com/',62);

create function public.actualizar_mi_nombre(p_nombre text) returns void language sql security definer set search_path=public as $$
  update profiles set nombre = p_nombre where id = auth.uid() $$;
grant execute on function public.actualizar_mi_nombre(text) to authenticated;
