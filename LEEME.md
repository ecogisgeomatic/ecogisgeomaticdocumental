# Gerencia Ecogis Geomatic

Aplicación web de gestión documental y operativa de Ecogis Geomatic S.A.S. (React + Vite + Supabase, publicada en Vercel).

## Instalación desde cero
1. **Supabase**: crea un proyecto. En *SQL Editor* ejecuta, EN ORDEN, los archivos de `supabase/migraciones/` (00 a 11).
   - `04_estructura_documental.sql` crea las carpetas de la empresa (se ejecuta después de registrar al primer usuario, que queda como administrador).
   - `12_privacidad_por_dependencia.sql` es OPCIONAL: vuelve privadas las carpetas principales y da acceso por área (ver más abajo).
2. **Autenticación**: *Authentication → Providers → Email*: apaga "Confirm email" (o configura el correo). En *URL Configuration* pon la dirección de Vercel.
3. **Variables**: copia `.env.example` a `.env` con `VITE_SUPABASE_URL` (sin `/rest/v1/`) y `VITE_SUPABASE_ANON_KEY` (la clave *publishable*). En Vercel van como variables de entorno.
4. **Vercel**: sube esta carpeta a GitHub, impórtala en Vercel (Framework: Vite) y despliega.
5. **Primer ingreso**: regístrate tú primero. Quedas como administrador.
6. **Avisos por correo** (opcional): ver `supabase/functions/alertas-vencimientos` y `supabase/cron_alertas.sql`. Requiere cuenta en Resend y los secretos RESEND_API_KEY, CRON_SECRET y ALERT_TO.

## Actualizar una instalación existente
Sube los archivos nuevos a GitHub (Vercel publica solo) y ejecuta en Supabase únicamente las migraciones nuevas (la 11 y, si lo deseas, la 12).

## Accesos por área
Más → *Usuarios y áreas*: crea áreas, asigna personas y elige a qué carpetas principales entra cada una. Una carpeta privada la ve el administrador, las personas marcadas y los miembros de las áreas marcadas.

## Verificación en dos pasos
Cada persona la activa desde su foto → *Verificación en dos pasos*. Quien la activa no puede leer ni escribir datos sin completar el código (lo exige la base de datos, no solo la pantalla). Si alguien pierde el celular, un administrador quita su factor en el panel de Supabase (*Authentication → Users*).
Si más adelante se crean tablas nuevas, vuelve a ejecutar la migración 11 para que también queden protegidas.

## Convención de nombres
Ver el documento IN-GD-001 (guía de nomenclatura): `CODIGO-PROYECTO_Descripcion_vNN_AAAAMMDD.ext`.
