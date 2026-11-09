// Avisa por correo los vencimientos de equipos (calibración, mantenimiento, seguro/licencia)
// y las entregas de proyectos en ejecución. Se ejecuta una vez al día (ver cron_alertas.sql).
import { createClient } from 'npm:@supabase/supabase-js@2'

const DIAS_AVISO = [30, 15, 7, 3, 1, 0] // días antes en que se avisa; los vencidos, cada lunes
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
const dias = (f: string) => Math.ceil((new Date(f + 'T00:00:00-05:00').getTime() - Date.now()) / 864e5)

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) return new Response('No autorizado', { status: 401 })
  const { forzar } = await req.json().catch(() => ({}))
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const lunes = new Date(Date.now() - 5 * 3600e3).getUTCDay() === 1 // hora de Colombia
  const toca = (d: number) => (forzar ? d <= 30 : DIAS_AVISO.includes(d) || (d < 0 && lunes))
  const filas: { tipo: string; item: string; que: string; fecha: string; d: number }[] = []

  const { data: eq } = await db.from('equipos').select('*').neq('estado', 'baja')
  for (const e of eq ?? []) {
    for (const [campo, que] of [['proxima_calibracion', 'Calibración'], ['proximo_mantenimiento', 'Mantenimiento'], ['vence_seguro', 'Seguro / licencia']]) {
      const f = e[campo]; if (!f) continue
      const d = dias(f); if (toca(d)) filas.push({ tipo: 'Equipo', item: `${e.codigo ?? ''} ${e.nombre}`.trim(), que, fecha: f, d })
    }
  }
  const { data: pr } = await db.from('proyectos').select('*').eq('estado', 'ejecucion')
  for (const p of pr ?? []) {
    if (!p.fecha_fin_prevista) continue
    const d = dias(p.fecha_fin_prevista); if (toca(d)) filas.push({ tipo: 'Proyecto', item: `${p.codigo ?? ''} ${p.nombre}`.trim(), que: 'Entrega prevista', fecha: p.fecha_fin_prevista, d })
  }
  if (!filas.length) return Response.json({ enviado: false, motivo: 'Nada por avisar hoy' })
  filas.sort((a, b) => a.d - b.d)

  let para = (Deno.env.get('ALERT_TO') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (!para.length) {
    const { data: ad } = await db.from('profiles').select('email').eq('rol', 'admin').eq('activo', true)
    para = (ad ?? []).map((a) => a.email).filter(Boolean)
  }
  const estado = (d: number) => (d < 0 ? `<b style="color:#d32f2f">Vencido hace ${-d} d</b>` : d === 0 ? '<b style="color:#d32f2f">Vence hoy</b>' : `<b style="color:${d <= 7 ? '#e37400' : '#374845'}">En ${d} días</b>`)
  const html = `<div style="font-family:Trebuchet MS,Arial,sans-serif;color:#374845">
    <h2 style="color:#2a2aff">Geoteca Ecogis · Vencimientos por atender</h2>
    <table cellpadding="8" style="border-collapse:collapse;width:100%">
    <tr style="background:#2a2aff;color:#fff;text-align:left"><th>Tipo</th><th>Elemento</th><th>Qué</th><th>Fecha</th><th>Estado</th></tr>
    ${filas.map((f) => `<tr style="border-bottom:1px solid #dbe3e4"><td>${f.tipo}</td><td>${esc(f.item)}</td><td>${f.que}</td><td>${f.fecha}</td><td>${estado(f.d)}</td></tr>`).join('')}
    </table><p style="color:#6b7c79;font-size:12px">Aviso automático de Geoteca Ecogis. Actualiza las fechas en la pestaña Equipos o Proyectos.</p></div>`

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: Deno.env.get('ALERT_FROM') ?? 'Geoteca Ecogis <onboarding@resend.dev>', to: para, subject: `Geoteca Ecogis: ${filas.length} vencimiento(s) por atender`, html }),
  })
  return Response.json({ enviado: r.ok, estado: r.status, items: filas.length, destinatarios: para.length, detalle: r.ok ? undefined : await r.text() })
})
