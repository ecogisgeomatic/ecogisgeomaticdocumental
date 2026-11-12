-- OPCIONAL. Deja cada carpeta principal PRIVADA y da acceso por área, según el organigrama del manual (MO-001).
-- Ejecutar DESPUÉS de crear la estructura de carpetas. Los administradores siguen viendo todo.
-- Después de ejecutarla, cada persona solo ve las carpetas de las áreas a las que la asignes (Más > Usuarios y áreas).
insert into public.grupos (nombre) values
 ('Dirección Técnica / Operaciones'), ('Dirección Comercial'), ('Dirección Administrativa y Financiera'),
 ('Calidad, SST y Ambiente'), ('Talento Humano'), ('Tecnología (TI)')
on conflict (nombre) do nothing;

alter table public.folders disable trigger t_guard_folder;   -- este ajuste se hace desde el editor SQL, no desde la página
update public.folders set restringida = true where parent_id is null and deleted_at is null and nombre ~ '^(0[1-9]|10)_';
alter table public.folders enable trigger t_guard_folder;

with m(pref, grupo) as (values
 ('02_','Calidad, SST y Ambiente'),
 ('03_','Dirección Comercial'),
 ('04_','Dirección Técnica / Operaciones'), ('04_','Dirección Comercial'), ('04_','Calidad, SST y Ambiente'), ('04_','Dirección Administrativa y Financiera'),
 ('05_','Dirección Comercial'), ('05_','Calidad, SST y Ambiente'),
 ('06_','Talento Humano'),
 ('07_','Dirección Administrativa y Financiera'),
 ('08_','Tecnología (TI)'), ('08_','Dirección Técnica / Operaciones'),
 ('09_','Calidad, SST y Ambiente'), ('09_','Dirección Administrativa y Financiera'),
 ('10_','Calidad, SST y Ambiente'))
insert into public.folder_access_grupos (folder_id, grupo_id)
select f.id, g.id from m
  join public.folders f on f.parent_id is null and f.deleted_at is null and f.nombre like m.pref || '%'
  join public.grupos g on g.nombre = m.grupo
on conflict do nothing;
-- 01_DIRECCIONAMIENTO-ESTRATEGICO queda solo para administradores (Gerencia).
