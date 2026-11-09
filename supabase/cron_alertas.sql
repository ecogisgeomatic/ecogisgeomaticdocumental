-- Programa el aviso diario a las 7:00 a. m. (hora de Colombia = 12:00 UTC).
-- 1) Cambia PEGA_AQUI_TU_CLAVE por la MISMA clave que pusiste como secreto CRON_SECRET.
-- 2) Ejecuta en Supabase > SQL Editor.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('alertas-vencimientos-diarias', '0 12 * * *', $$
  select net.http_post(
    url := 'https://zbnelcizbgcejmndratu.supabase.co/functions/v1/alertas-vencimientos',
    headers := '{"Content-Type":"application/json","x-cron-secret":"PEGA_AQUI_TU_CLAVE"}'::jsonb,
    body := '{}'::jsonb) $$);

-- PRUEBA (ejecútala aparte para forzar un correo con todo lo que vence en 30 días o menos):
-- select net.http_post(
--   url := 'https://zbnelcizbgcejmndratu.supabase.co/functions/v1/alertas-vencimientos',
--   headers := '{"Content-Type":"application/json","x-cron-secret":"PEGA_AQUI_TU_CLAVE"}'::jsonb,
--   body := '{"forzar": true}'::jsonb);
-- Resultado de la prueba:  select status_code, content from net._http_response order by created_at desc limit 1;
