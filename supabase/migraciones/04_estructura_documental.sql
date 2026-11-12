-- Estructura documental de Ecogis Geomatic SAS (según Manual MO-001)
-- Ejecutar UNA vez en Supabase > SQL Editor. Si una carpeta ya existe, no se duplica.
do $$
declare t record; pid uuid;
  creador uuid := (select id from profiles where rol = 'admin' order by created_at limit 1);
begin
  for t in select * from (values
    ('01_DIRECCIONAMIENTO-ESTRATEGICO','#000000', array['01_Identidad-Corporativa-y-Marca','02_Actas-Asamblea-y-Gerencia','03_Planeacion-y-Presupuesto','04_Legal-Societario','05_Manuales-y-Politicas']),
    ('02_CALIDAD-SST-AMBIENTE','#000000', array['01_Sistema-de-Gestion','02_SG-SST','03_Gestion-Ambiental','04_Matriz-de-Riesgos']),
    ('03_GESTION-COMERCIAL','#2a2aff', array['01_Clientes','02_Propuestas-y-Cotizaciones','03_Licitaciones-SECOP','04_Portafolio-y-Mercadeo']),
    ('04_PROYECTOS','#2a2aff', array['00_Formatos-de-Proyecto','99_Proyectos-Cerrados']),
    ('05_POSVENTA-Y-SOPORTE','#2a2aff', array['01_PQRS','02_Garantias-y-Soporte','03_Encuestas-de-Satisfaccion']),
    ('06_TALENTO-HUMANO','#374845', array['01_Seleccion-y-Contratacion','02_Hojas-de-Vida','03_Nomina-y-Seguridad-Social','04_Capacitacion-e-Induccion','05_Reglamento-Interno']),
    ('07_ADMINISTRATIVA-Y-FINANCIERA','#374845', array['01_Contabilidad','02_Facturacion-Electronica','03_Impuestos-DIAN','04_Tesoreria-y-Bancos','05_Compras-y-Proveedores','06_Contratos-y-Polizas','07_Activos-y-Equipos']),
    ('08_TECNOLOGIA-Y-DATOS','#374845', array['01_Licencias-de-Software','02_Respaldos','03_Infraestructura-y-Accesos','04_Datos-Geoespaciales-Base']),
    ('09_GESTION-DOCUMENTAL','#374845', array['01_Listado-Maestro','02_Tablas-de-Retencion','03_Documentos-Obsoletos']),
    ('10_AUDITORIA-Y-MEJORA','#00cdff', array['01_Auditorias-Internas','02_Acciones-Correctivas','03_Indicadores','04_Revision-por-la-Direccion'])
  ) as v(n, c, h) loop
    if not exists (select 1 from folders where nombre = t.n and parent_id is null) then
      insert into folders (nombre, color, created_by) values (t.n, t.c, creador) returning id into pid;
      insert into folders (nombre, parent_id, color, created_by) select unnest(t.h), pid, t.c, creador;
    end if;
  end loop;
end $$;
