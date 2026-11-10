import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from './supabase'
import logo from './logo.svg'

const APP = 'Geoteca Ecogis'
let ACTOR = null
const registrar = (accion, detalle) => { if (ACTOR) supabase.from('activity').insert({ user_id: ACTOR.id, user_nombre: ACTOR.nombre || ACTOR.email, accion, detalle }).then(() => {}) }
const SUB_PROYECTO = ['01_Contrato-y-Propuesta', '02_Planeacion', '03_Captura-de-Campo', '04_Procesamiento-y-Analisis', '05_Control-de-Calidad', '06_Entregables', '07_Cierre-y-Evaluacion']

const TIPOS = ['Contrato', 'Informe técnico', 'Cartografía / SIG', 'Plano / CAD', 'Hoja de cálculo', 'Presentación', 'Imagen', 'Facturación', 'Legal', 'Otro']
const COLORES = ['#374845', '#2a2aff', '#00cdff', '#e53935', '#fb8c00', '#43a047', '#8e24aa', '#6d4c41']
const COL = { pdf: '#e53935', doc: '#2a2aff', docx: '#2a2aff', xls: '#2e7d32', xlsx: '#2e7d32', csv: '#2e7d32', ppt: '#fb8c00', pptx: '#fb8c00', dwg: '#6d4c41', dxf: '#6d4c41', shp: '#8e24aa', kml: '#8e24aa', kmz: '#8e24aa', geojson: '#8e24aa', tif: '#00a6cc', tiff: '#00a6cc', jpg: '#c2185b', jpeg: '#c2185b', png: '#c2185b', zip: '#546e7a' }
const fmt = b => (!b ? '—' : b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.ceil(b / 1024) + ' KB')
const fecha = d => new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
const ext = n => (n.includes('.') ? n.split('.').pop() : '').toLowerCase()
const detectar = n => {
  const e = ext(n)
  if (['shp', 'shx', 'dbf', 'prj', 'kml', 'kmz', 'geojson', 'gpkg', 'tif', 'tiff'].includes(e)) return 'Cartografía / SIG'
  if (['dwg', 'dxf'].includes(e)) return 'Plano / CAD'
  if (['xls', 'xlsx', 'csv'].includes(e)) return 'Hoja de cálculo'
  if (['ppt', 'pptx'].includes(e)) return 'Presentación'
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(e)) return 'Imagen'
  if (['pdf', 'doc', 'docx'].includes(e)) return 'Informe técnico'
  return 'Otro'
}
const signed = async (path, name) => {
  const { data, error } = await supabase.storage.from('documentos').createSignedUrl(path, 3600, name ? { download: name } : undefined)
  return error ? null : data.signedUrl
}
const cargarMammoth = () => window.mammoth ? Promise.resolve() : new Promise((ok, no) => {
  const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js'
  s.onload = ok; s.onerror = no; document.head.appendChild(s)
})

const ESTADOS = { borrador: 'Borrador', revision: 'En revisión', vigente: 'Vigente', obsoleto: 'Obsoleto' }
const cargarLib = (src, g) => window[g] ? Promise.resolve() : new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s) })
const subirGrande = async (file, path, onProg) => {
  await cargarLib('https://cdn.jsdelivr.net/npm/tus-js-client@4.1.0/dist/tus.min.js', 'tus')
  const { data: { session } } = await supabase.auth.getSession()
  const ref = new URL(import.meta.env.VITE_SUPABASE_URL).hostname.split('.')[0]
  return new Promise(resolve => {
    const up = new window.tus.Upload(file, {
      endpoint: `https://${ref}.storage.supabase.co/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: { authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, 'x-upsert': 'false' },
      uploadDataDuringCreation: true, removeFingerprintOnSuccess: true, chunkSize: 6 * 1024 * 1024,
      metadata: { bucketName: 'documentos', objectName: path, contentType: file.type || 'application/octet-stream', cacheControl: 3600 },
      onError: e => resolve({ message: 'No se pudo subir (' + (e.message || e) + '). Revisa el límite de tamaño de tu plan en Supabase.' }),
      onProgress: (a, t) => onProg(Math.round((a / t) * 100)), onSuccess: () => resolve(null)
    })
    up.findPreviousUploads().then(prev => { if (prev.length) up.resumeFromPreviousUpload(prev[0]); up.start() })
  })
}
const limpio = t => t.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '')
const crearProyectoCompleto = async (padreId, hermanos, perfil, cliente, nombre) => {
  const anio = new Date().getFullYear()
  const nums = hermanos.filter(n => n.startsWith(anio + '-')).map(n => parseInt(n.slice(5, 8)) || 0)
  const cod = `${anio}-${String(Math.max(0, ...nums) + 1).padStart(3, '0')}`
  const { data, error } = await supabase.from('folders').insert({ nombre: `${cod}_${limpio(cliente)}_${limpio(nombre)}`, parent_id: padreId, color: '#2a2aff', created_by: perfil.id }).select().single()
  if (error) return { error }
  await supabase.from('folders').insert(SUB_PROYECTO.map(n => ({ nombre: n, parent_id: data.id, color: '#2a2aff', created_by: perfil.id })))
  await supabase.from('proyectos').insert({ folder_id: data.id, codigo: cod, nombre: nombre.trim(), cliente: cliente.trim(), created_by: perfil.id })
  registrar('Creó proyecto', `${cod} ${nombre.trim()}`)
  return { data }
}
const hoyStr = () => new Date().toISOString().slice(0, 10)
const GRUPOS = [
  { t: 'Gestión', items: [['proy', 'Proyectos'], ['tareas', 'Tareas y cronograma'], ['equipos', 'Equipos y reservas'], ['firmas', 'Firmas electrónicas'], ['ind', 'Indicadores']] },
  { t: 'Comercial', items: [['opor', 'Oportunidades'], ['hab', 'Documentos habilitantes'], ['pqrs', 'PQRS (posventa)']] }
]
const EST_T = { pendiente: 'Pendiente', en_curso: 'En curso', hecha: 'Hecha', bloqueada: 'Bloqueada' }
const EST_O = { identificada: 'Identificada', evaluando: 'Evaluando', preparando: 'Preparando propuesta', presentada: 'Presentada', adjudicada: 'Adjudicada', perdida: 'Perdida', descartada: 'Descartada' }
const MODALIDADES = ['Licitación pública', 'Selección abreviada', 'Concurso de méritos', 'Contratación directa', 'Mínima cuantía', 'Cotización privada', 'Otra']
const CAT_H = ['Jurídico', 'Financiero', 'Técnico', 'Experiencia', 'Otro']
const ESTA = { pendiente: 'Pendiente', aprobado: 'Aprobado', rechazado: 'Rechazado', cancelado: 'Cancelado' }
const useUsuarios = () => { const [us, setUs] = useState([]); useEffect(() => { supabase.from('profiles').select('id,nombre,email').eq('activo', true).order('nombre').then(({ data }) => setUs(data || [])) }, []); return us }
const nom = (us, id) => { const u = us.find(x => x.id === id); return u ? (u.nombre || u.email) : '' }
const vacioNull = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === '' ? null : v]))
const plata = v => (v == null ? '—' : '$ ' + Number(v).toLocaleString('es-CO'))
const sha256 = async buf => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map(b => b.toString(16).padStart(2, '0')).join('')
const EST_Q = { recibida: 'Recibida', en_tramite: 'En trámite', respondida: 'Respondida', cerrada: 'Cerrada' }
const TIPO_Q = { peticion: 'Petición', queja: 'Queja', reclamo: 'Reclamo', sugerencia: 'Sugerencia' }
const pin6 = () => String(Math.floor(100000 + Math.random() * 900000))
const wa = t => 'https://wa.me/?text=' + encodeURIComponent(t)
const FileIcon = ({ n }) => <div className="fi" style={{ background: COL[ext(n)] || '#546e7a' }}>{ext(n).slice(0, 4) || 'file'}</div>
const FolderIcon = ({ c }) => <svg width="46" height="46" viewBox="0 0 24 24" fill={c || '#374845'}><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" /></svg>
const Logo = ({ h = 40 }) => <div className="logo"><img src={logo} alt="Ecogis Geomatic SAS" height={h} /><span className="appn">{APP}</span></div>

function Mapa({ url, ext }) {
  const ref = useRef(), [msg, setMsg] = useState('Cargando mapa…'), [info, setInfo] = useState('')
  useEffect(() => {
    let mapa
    ;(async () => {
      try {
        if (!document.getElementById('leaflet-css')) { const l = document.createElement('link'); l.id = 'leaflet-css'; l.rel = 'stylesheet'; l.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(l) }
        await cargarLib('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js', 'L')
        const L = window.L; L.Icon.Default.imagePath = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/'
        const buf = await (await fetch(url)).arrayBuffer()
        if (buf.byteLength > 30 * 1048576) throw new Error('El archivo pesa más de 30 MB; ábrelo en QGIS')
        let gj
        if (ext === 'geojson') gj = JSON.parse(new TextDecoder().decode(buf))
        else if (ext === 'kml' || ext === 'kmz') {
          await cargarLib('https://cdnjs.cloudflare.com/ajax/libs/togeojson/0.16.0/togeojson.min.js', 'toGeoJSON')
          let txt
          if (ext === 'kmz') { await cargarLib('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', 'JSZip'); const z = await window.JSZip.loadAsync(buf); const n = Object.keys(z.files).find(k => k.toLowerCase().endsWith('.kml')); txt = await z.files[n].async('string') }
          else txt = new TextDecoder().decode(buf)
          gj = window.toGeoJSON.kml(new DOMParser().parseFromString(txt, 'text/xml'))
        } else { await cargarLib('https://cdn.jsdelivr.net/npm/shpjs@4.0.4/dist/shp.min.js', 'shp'); gj = await window.shp(buf) }
        const capas = Array.isArray(gj) ? gj : [gj]
        mapa = L.map(ref.current); L.control.scale().addTo(mapa)
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mapa)
        const grupo = L.featureGroup(capas.map(c => L.geoJSON(c, { onEachFeature: (f, l) => {
          const pr = Object.entries(f.properties || {}).filter(([, v]) => v != null && typeof v !== 'object').slice(0, 12)
          if (pr.length) l.bindPopup(() => { const d = document.createElement('div'); pr.forEach(([k, v]) => { const r = document.createElement('div'); r.textContent = `${k}: ${v}`; d.appendChild(r) }); return d })
        } }))).addTo(mapa)
        if (!grupo.getBounds().isValid()) throw new Error('El archivo no tiene geometrías para mostrar')
        mapa.fitBounds(grupo.getBounds(), { padding: [20, 20] })
        setInfo(`${capas.reduce((a, c) => a + (c.features?.length || 0), 0)} elementos · clic en uno para ver sus atributos`); setMsg('')
      } catch (e) { setMsg('No se pudo mostrar el mapa: ' + (e.message || e) + '. Descarga el archivo para abrirlo en QGIS.') }
    })()
    return () => { if (mapa) mapa.remove() }
  }, [url, ext])
  return <div className="mapw"><div ref={ref} className="mapa" />{msg && <div className="vacio mapmsg">{msg}</div>}{info && <div className="mapinfo">{info}</div>}</div>
}

function Preview({ d, onClose }) {
  const [u, setU] = useState(null), [html, setHtml] = useState(''), [txt, setTxt] = useState(''), [err, setErr] = useState('')
  const e = ext(d.nombre)
  useEffect(() => {
    (async () => {
      const url = await signed(d.path); setU(url); if (!url) return setErr('No se pudo abrir el archivo')
      try {
        if (e === 'docx') { await cargarMammoth(); const r = await window.mammoth.convertToHtml({ arrayBuffer: await (await fetch(url)).arrayBuffer() }); setHtml(r.value || '<p>Documento vacío</p>') }
        else if (['txt', 'csv', 'json', 'md'].includes(e)) setTxt((await (await fetch(url)).text()).slice(0, 200000))
      } catch { setErr('No se pudo generar la vista previa. Descárgalo para abrirlo.') }
    })()
  }, [d])
  const bajar = async () => { const x = await signed(d.path, d.nombre); if (x) { registrar('Descargó', d.nombre); window.open(x, '_blank') } }
  return (
    <div className="modal" onClick={onClose}><div className="pv" onClick={e => e.stopPropagation()}>
      <div className="pvh"><b>{d.nombre}</b><span><button className="btn" onClick={bajar}>Descargar</button> <button className="btn ghost" onClick={onClose}>Cerrar</button></span></div>
      <div className="pvb">
        {err ? <div className="vacio">{err}</div> : !u ? <div className="vacio">Cargando…</div>
          : ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(e) ? <img src={u} alt={d.nombre} />
          : e === 'pdf' ? <iframe src={u} title={d.nombre} />
          : e === 'docx' ? <div className="word" dangerouslySetInnerHTML={{ __html: html }} />
          : ['geojson', 'kml', 'kmz', 'zip'].includes(e) ? <Mapa url={u} ext={e} />
          : txt ? <pre className="txt">{txt}</pre>
          : <div className="vacio"><b>Sin vista previa para .{e || 'este formato'}</b><p>{e === 'doc' ? 'Guárdalo como .docx para verlo aquí, o descárgalo.' : e === 'shp' ? 'Para verlo en el mapa, sube el shapefile completo en un .zip (.shp, .dbf, .prj).' : 'Descárgalo para abrirlo en tu equipo.'}</p></div>}
      </div>
    </div></div>
  )
}

function Compartir({ t, i, perfil, onClose }) {
  const [lista, setLista] = useState([]), [exp, setExp] = useState('0'), [ok, setOk] = useState('')
  const tipo = t === 'f' ? 'folder' : 'document'
  const cargar = useCallback(async () => {
    const { data } = await supabase.from('shares').select('*').eq('item_type', tipo).eq('item_id', i.id).order('created_at', { ascending: false })
    setLista(data || [])
  }, [i.id, tipo])
  useEffect(() => { cargar() }, [cargar])
  const crear = async () => {
    await supabase.from('shares').insert({ item_type: tipo, item_id: i.id, expires_at: exp === '0' ? null : new Date(Date.now() + exp * 864e5).toISOString(), created_by: perfil.id }); registrar('Creó enlace para compartir', i.nombre); cargar()
  }
  const link = s => `${location.origin}/?s=${s.token}`
  return (
    <div className="modal" onClick={onClose}><div className="dlg" onClick={e => e.stopPropagation()}>
      <h3>Compartir {t === 'f' ? 'carpeta' : 'archivo'}: {i.nombre}</h3>
      <p className="muted">Cualquiera con el enlace podrá ver y descargar {t === 'f' ? 'todo el contenido de esta carpeta' : 'este archivo'} sin iniciar sesión.</p>
      <div className="bar2"><select value={exp} onChange={e => setExp(e.target.value)}><option value="0">Sin vencimiento</option><option value="1">Vence en 1 día</option><option value="7">Vence en 7 días</option><option value="30">Vence en 30 días</option></select>
        <button className="btn" onClick={crear}>Crear enlace</button></div>
      {lista.map(s => <div key={s.id} className="lnk">
        <input readOnly value={link(s)} onFocus={e => e.target.select()} />
        <button className="btn" onClick={async () => { await navigator.clipboard.writeText(link(s)); setOk(s.id) }}>{ok === s.id ? '¡Copiado!' : 'Copiar'}</button>
        <button className="btn ghost" onClick={async () => { await supabase.from('shares').delete().eq('id', s.id); cargar() }}>Quitar</button>
        <small>{s.expires_at ? 'Vence ' + fecha(s.expires_at) : 'Sin vencimiento'}</small></div>)}
      <div className="dact"><button className="btn ghost" onClick={onClose}>Listo</button></div>
    </div></div>
  )
}

function Compartido({ token }) {
  const [data, setData] = useState(undefined), [cur, setCur] = useState(null), [prev, setPrev] = useState(null)
  useEffect(() => { supabase.rpc('get_share', { p_token: token }).then(({ data }) => { setData(data); setCur(data?.root || null) }) }, [token])
  if (data === undefined) return <p className="vacio">Cargando…</p>
  if (!data) return <div className="auth"><div className="auth-box"><Logo /><h2>Enlace no válido o vencido</h2><p className="muted">Pide a quien te lo envió que genere uno nuevo.</p></div></div>
  const ruta = []; for (let f = data.carpetas.find(x => x.id === cur); f; f = f.id === data.root ? null : data.carpetas.find(x => x.id === f.parent_id)) ruta.unshift(f)
  const subs = data.carpetas.filter(f => f.parent_id === cur && f.id !== data.root), docs = data.documentos.filter(d => data.tipo === 'document' || d.folder_id === cur)
  return (
    <div className="app"><header className="top"><Logo /><span className="muted">Contenido compartido · {data.nombre}</span></header>
      <div className="panel pub">
        {data.tipo === 'folder' && <div className="crumbs">{ruta.map((f, k) => <span key={f.id}>{k > 0 && ' › '}<button onClick={() => setCur(f.id)}>{f.nombre}</button></span>)}</div>}
        <div className="grid">
          {subs.map(f => <div key={f.id} className="it" onClick={() => setCur(f.id)}><div className="ic"><FolderIcon c={f.color} /></div><div className="nm">{f.nombre}</div></div>)}
          {docs.map(d => <div key={d.id} className="it" onClick={() => setPrev(d)}><div className="ic"><FileIcon n={d.nombre} /></div><div className="nm">{d.nombre}</div><div className="meta">{fmt(d.tamano)}</div></div>)}
        </div>
        {!subs.length && !docs.length && <div className="vacio">Esta carpeta está vacía</div>}
      </div>
      {prev && <Preview d={prev} onClose={() => setPrev(null)} />}
    </div>
  )
}

function Auth() {
  const [modo, setModo] = useState('in'), [f, setF] = useState({ email: '', pass: '', nombre: '' }), [msg, setMsg] = useState('')
  const set = k => e => setF({ ...f, [k]: e.target.value })
  const enviar = async e => {
    e.preventDefault(); setMsg('')
    const { error } = modo === 'in' ? await supabase.auth.signInWithPassword({ email: f.email, password: f.pass })
      : await supabase.auth.signUp({ email: f.email, password: f.pass, options: { data: { nombre: f.nombre } } })
    if (error) setMsg(error.message)
  }
  return (
    <div className="auth"><form onSubmit={enviar} className="auth-box"><Logo /><p className="muted">Centro documental de Ecogis Geomatic</p>
      {modo === 'up' && <input placeholder="Nombre completo" required value={f.nombre} onChange={set('nombre')} />}
      <input type="email" placeholder="Correo" required value={f.email} onChange={set('email')} />
      <input type="password" placeholder="Contraseña (mínimo 6)" minLength={6} required value={f.pass} onChange={set('pass')} />
      <button className="btn">{modo === 'in' ? 'Ingresar' : 'Crear cuenta'}</button>{msg && <p className="msg">{msg}</p>}
      <a href="#" onClick={e => { e.preventDefault(); setModo(modo === 'in' ? 'up' : 'in'); setMsg('') }}>{modo === 'in' ? 'Crear una cuenta nueva' : 'Ya tengo cuenta'}</a>
      {modo === 'in' && <a href="#" onClick={async e => { e.preventDefault(); if (!f.email) return setMsg('Escribe tu correo arriba y vuelve a pulsar aquí.'); const { error } = await supabase.auth.resetPasswordForEmail(f.email, { redirectTo: window.location.origin }); setMsg(error ? error.message : 'Te enviamos un enlace para crear una contraseña nueva. Revisa tu correo.') }}>¿Olvidaste tu contraseña?</a>}
    </form></div>
  )
}

function NuevaClave({ onListo }) {
  const [p, setP] = useState(''), [msg, setMsg] = useState('')
  const guardar = async e => { e.preventDefault(); const { error } = await supabase.auth.updateUser({ password: p }); if (error) setMsg(error.message); else onListo() }
  return <div className="auth"><form onSubmit={guardar} className="auth-box"><Logo /><h2>Crea tu nueva contraseña</h2>
    <input type="password" minLength={6} required placeholder="Nueva contraseña (mínimo 6)" value={p} onChange={e => setP(e.target.value)} />
    <button className="btn">Guardar contraseña</button>{msg && <p className="msg">{msg}</p>}</form></div>
}

function Permisos({ f, onClose, onChange }) {
  const [users, setUsers] = useState([]), [acc, setAcc] = useState([]), [priv, setPriv] = useState(!!f.restringida)
  const cargar = useCallback(async () => {
    const { data: u } = await supabase.from('profiles').select('id,nombre,email,rol').eq('activo', true).order('nombre'); setUsers(u || [])
    const { data: a } = await supabase.from('folder_access').select('user_id').eq('folder_id', f.id); setAcc((a || []).map(x => x.user_id))
  }, [f.id])
  useEffect(() => { cargar() }, [cargar])
  const alternar = async () => {
    const { error } = await supabase.from('folders').update({ restringida: !priv }).eq('id', f.id); if (error) return
    setPriv(!priv); registrar(!priv ? 'Hizo privada la carpeta' : 'Quitó la privacidad de la carpeta', f.nombre); onChange()
  }
  const dar = async (u, on) => {
    if (on) await supabase.from('folder_access').insert({ folder_id: f.id, user_id: u.id }); else await supabase.from('folder_access').delete().eq('folder_id', f.id).eq('user_id', u.id)
    registrar(on ? 'Dio acceso' : 'Quitó acceso', `${f.nombre} → ${u.nombre || u.email}`); cargar()
  }
  const miembros = users.filter(u => u.rol !== 'admin')
  return (
    <div className="modal" onClick={onClose}><div className="dlg" onClick={e => e.stopPropagation()}>
      <h3>Permisos: {f.nombre}</h3>
      <label className="chk"><input type="checkbox" checked={priv} onChange={alternar} /> Carpeta privada: solo las personas marcadas y los administradores</label>
      <p className="muted">Aplica también a todas sus subcarpetas y archivos.</p>
      {priv && <div className="plist">{miembros.map(u => <label key={u.id} className="prow chk"><input type="checkbox" checked={acc.includes(u.id)} onChange={e => dar(u, e.target.checked)} /> {u.nombre || u.email}</label>)}{!miembros.length && <p className="muted">Aún no hay miembros activos.</p>}</div>}
      <div className="dact"><button className="btn" onClick={onClose}>Listo</button></div>
    </div></div>
  )
}

function Papelera({ perfil }) {
  const [fs, setFs] = useState([]), [ds, setDs] = useState([]), [msg, setMsg] = useState('')
  const cargar = useCallback(async () => {
    const { data: f } = await supabase.from('folders').select('*'); const { data: d } = await supabase.from('documents').select('*').not('deleted_at', 'is', null)
    setFs(f || []); setDs(d || [])
  }, [])
  useEffect(() => { cargar() }, [cargar])
  const raizF = fs.filter(f => f.deleted_at && !(fs.find(x => x.id === f.parent_id)?.deleted_at === f.deleted_at))
  const raizD = ds.filter(d => fs.find(x => x.id === d.folder_id)?.deleted_at !== d.deleted_at)
  const dias = ts => 30 - Math.floor((Date.now() - new Date(ts)) / 864e5)
  const sub = (id, ts) => [id, ...fs.filter(f => f.parent_id === id && f.deleted_at === ts).flatMap(f => sub(f.id, ts))]
  const restaurar = async (t, x) => {
    setMsg('')
    if (t === 'd') {
      const vivo = !x.folder_id || fs.some(f => f.id === x.folder_id && !f.deleted_at)
      const { error } = await supabase.from('documents').update({ deleted_at: null, ...(vivo ? {} : { folder_id: null }) }).eq('id', x.id); if (error) return setMsg(error.message)
    } else {
      const ids = sub(x.id, x.deleted_at), padreVivo = !x.parent_id || fs.some(f => f.id === x.parent_id && !f.deleted_at)
      const { error } = await supabase.from('folders').update({ deleted_at: null }).in('id', ids).eq('deleted_at', x.deleted_at); if (error) return setMsg(error.message)
      if (!padreVivo) await supabase.from('folders').update({ parent_id: null }).eq('id', x.id)
      await supabase.from('documents').update({ deleted_at: null }).in('folder_id', ids).eq('deleted_at', x.deleted_at)
    }
    registrar('Restauró', x.nombre); cargar()
  }
  const eliminar = async (t, x, auto) => {
    if (!auto && !confirm(`¿Eliminar "${x.nombre}" para siempre? No se puede deshacer.`)) return
    setMsg(''); let paths = []
    if (t === 'd') {
      paths = [x.path]; const { data: vs } = await supabase.from('document_versions').select('path').eq('document_id', x.id); paths.push(...(vs || []).map(r => r.path))
    } else {
      const ids = sub(x.id, x.deleted_at); const { data } = await supabase.from('documents').select('id,path').in('folder_id', ids)
      paths = (data || []).map(r => r.path)
      const { data: vs } = await supabase.from('document_versions').select('path').in('document_id', (data || []).map(r => r.id)); paths.push(...(vs || []).map(r => r.path))
    }
    const { error } = await supabase.from(t === 'd' ? 'documents' : 'folders').delete().eq('id', x.id); if (error) return setMsg(error.message)
    if (paths.length) await supabase.storage.from('documentos').remove(paths)
    registrar('Eliminó definitivamente', x.nombre); if (!auto) cargar()
  }
  const vaciarVencidos = async () => {
    const v = [...raizF.filter(f => dias(f.deleted_at) < 0).map(f => ['f', f]), ...raizD.filter(d => dias(d.deleted_at) < 0).map(d => ['d', d])]
    if (!v.length) return setMsg('No hay elementos vencidos.')
    if (!confirm(`¿Eliminar para siempre ${v.length} elemento(s) con más de 30 días en la papelera?`)) return
    for (const [t, x] of v) await eliminar(t, x, true)
    cargar()
  }
  const fila = (t, x) => <tr key={t + x.id}><td>{x.nombre}</td><td>{t === 'f' ? 'Carpeta' : 'Archivo'}</td><td>{fecha(x.deleted_at)}</td><td>{dias(x.deleted_at) >= 0 ? `${dias(x.deleted_at)} días` : 'Vencido'}</td>
    <td><button className="chip si" onClick={() => restaurar(t, x)}>Restaurar</button> <button className="chip no" onClick={() => eliminar(t, x)}>Eliminar para siempre</button></td></tr>
  return (
    <div className="panel solo"><h2>Papelera</h2><p className="muted">Lo que eliminas queda aquí y puedes restaurarlo. Pasados 30 días se considera vencido y un administrador puede eliminarlo para siempre.</p>
      {perfil.rol === 'admin' && <button className="btn ghost" onClick={vaciarVencidos}>Vaciar vencidos (más de 30 días)</button>}
      {msg && <p className="msg">{msg}</p>}
      {!raizF.length && !raizD.length ? <div className="vacio">La papelera está vacía</div>
        : <table><thead><tr><th>Nombre</th><th>Tipo</th><th>Eliminado</th><th>Quedan</th><th /></tr></thead><tbody>{raizF.map(f => fila('f', f))}{raizD.map(d => fila('d', d))}</tbody></table>}
    </div>
  )
}

function Actividad() {
  const [l, setL] = useState([])
  useEffect(() => { supabase.from('activity').select('*').order('created_at', { ascending: false }).limit(300).then(({ data }) => setL(data || [])) }, [])
  return (
    <div className="panel solo"><h2>Registro de actividad</h2><p className="muted">Últimos 300 movimientos hechos desde la página.</p>
      <table><thead><tr><th>Fecha</th><th>Persona</th><th>Acción</th><th>Detalle</th></tr></thead>
        <tbody>{l.map(a => <tr key={a.id}><td>{new Date(a.created_at).toLocaleString('es-CO')}</td><td>{a.user_nombre}</td><td>{a.accion}</td><td>{a.detalle}</td></tr>)}</tbody></table>
    </div>
  )
}

function Ficha({ d, onClose, onChange }) {
  const [f, setF] = useState({ codigo: d.codigo || '', version: d.version || '1.0', estado: d.estado || 'vigente', categoria: d.categoria || 'Otro', etiquetas: (d.etiquetas || []).join(', ') })
  const [vs, setVs] = useState([]), [msg, setMsg] = useState('')
  useEffect(() => { supabase.from('document_versions').select('*').eq('document_id', d.id).order('created_at', { ascending: false }).then(({ data }) => setVs(data || [])) }, [d.id])
  const guardar = async () => {
    const { error } = await supabase.from('documents').update({ ...f, etiquetas: f.etiquetas.split(',').map(x => x.trim().toLowerCase()).filter(Boolean) }).eq('id', d.id); if (error) return setMsg(error.message)
    registrar('Actualizó propiedades', `${d.nombre} · v${f.version} · ${ESTADOS[f.estado]}`); onChange(); onClose()
  }
  const bajar = async v => { const u = await signed(v.path, v.nombre); if (u) { registrar('Descargó versión anterior', `${v.nombre} v${v.version}`); window.open(u, '_blank') } }
  const set = k => e => setF({ ...f, [k]: e.target.value })
  return (
    <div className="modal" onClick={onClose}><div className="dlg" onClick={e => e.stopPropagation()}>
      <h3>Propiedades: {d.nombre}</h3>
      <div className="frm">
        <label>Código del documento<input placeholder="ej. PR-GP-002" value={f.codigo} onChange={set('codigo')} /></label>
        <label>Versión<input value={f.version} onChange={set('version')} /></label>
        <label>Estado<select value={f.estado} onChange={set('estado')}>{Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>Tipo de documento<select value={f.categoria} onChange={set('categoria')}>{TIPOS.map(t => <option key={t}>{t}</option>)}</select></label>
      </div>
      <label className="et">Etiquetas (separadas por coma)<input placeholder="ej. catastro, valledupar, 2026" value={f.etiquetas} onChange={set('etiquetas')} /></label>
      {vs.length > 0 && <><b>Versiones anteriores</b>{vs.map(v => <div className="lnk" key={v.id}><span>v{v.version} · reemplazada el {fecha(v.created_at)} · {fmt(v.tamano)}</span><button className="btn ghost" onClick={() => bajar(v)}>Descargar</button></div>)}</>}
      {msg && <p className="msg">{msg}</p>}
      <Aprobacion d={d} onChange={onChange} />
      <Comentarios tipo="d" id={d.id} />
      <div className="dact"><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn" onClick={guardar}>Guardar</button></div>
    </div></div>
  )
}

const EST_P = { propuesta: 'Propuesta', contratado: 'Contratado', ejecucion: 'En ejecución', entregado: 'Entregado', suspendido: 'Suspendido', cerrado: 'Cerrado' }
const EST_EQ = { operativo: 'Operativo', mantenimiento: 'En mantenimiento', baja: 'De baja' }
const EV_EQ = { calibracion: 'Calibración', mantenimiento: 'Mantenimiento', reparacion: 'Reparación', incidente: 'Incidente', asignacion: 'Asignación' }
const EV = { no_conformidad: 'No conformidad', accidente: 'Accidente / incidente', capacitacion_programada: 'Capacitación programada', capacitacion_ejecutada: 'Capacitación ejecutada' }
const TIPOS_EQ = ['GNSS', 'Estación total', 'Dron', 'Nivel', 'Computador', 'Vehículo', 'Otro']
const semaforo = f => { if (!f) return ['', '—']; const d = Math.ceil((new Date(f) - new Date()) / 864e5); return [d < 0 ? 'rojo' : d <= 30 ? 'amar' : 'verde', d < 0 ? `Vencido hace ${-d} d` : `${d} días`] }

function Comentarios({ tipo, id }) {
  const [l, setL] = useState([]), [t, setT] = useState('')
  const cargar = useCallback(async () => { const { data } = await supabase.from('comentarios').select('*').eq('item_type', tipo).eq('item_id', id).order('created_at'); setL(data || []) }, [tipo, id])
  useEffect(() => { cargar() }, [cargar])
  const enviar = async () => { if (!t.trim() || !ACTOR) return; await supabase.from('comentarios').insert({ item_type: tipo, item_id: id, user_id: ACTOR.id, user_nombre: ACTOR.nombre || ACTOR.email, texto: t.trim() }); setT(''); cargar() }
  return (
    <div className="coms"><b>Comentarios</b>
      {l.map(c => <div key={c.id} className="com"><small>{c.user_nombre} · {new Date(c.created_at).toLocaleString('es-CO')}{(ACTOR?.rol === 'admin' || ACTOR?.id === c.user_id) && <button className="x2" title="Borrar" onClick={async () => { await supabase.from('comentarios').delete().eq('id', c.id); cargar() }}>✕</button>}</small><p>{c.texto}</p></div>)}
      <div className="lnk"><input placeholder="Escribe un comentario…" value={t} onChange={e => setT(e.target.value)} onKeyDown={e => e.key === 'Enter' && enviar()} /><button className="btn" onClick={enviar}>Enviar</button></div>
    </div>
  )
}

function FichaProyecto({ p, admin, onClose, onChange, onAbrir }) {
  const [f, setF] = useState({ nombre: p.nombre, cliente: p.cliente || '', responsable: p.responsable || '', estado: p.estado, fecha_inicio: p.fecha_inicio || '', fecha_fin_prevista: p.fecha_fin_prevista || '', fecha_entrega_real: p.fecha_entrega_real || '', satisfaccion: p.satisfaccion ?? '', descripcion: p.descripcion || '' })
  const [fin, setFin] = useState({ valor: '', costo: '' }), [msg, setMsg] = useState('')
  useEffect(() => { if (admin) supabase.from('proyecto_finanzas').select('*').eq('proyecto_id', p.id).maybeSingle().then(({ data }) => data && setFin({ valor: data.valor ?? '', costo: data.costo ?? '' })) }, [p.id, admin])
  const set = k => e => setF({ ...f, [k]: e.target.value })
  const guardar = async () => {
    const d = { ...f }; ['fecha_inicio', 'fecha_fin_prevista', 'fecha_entrega_real'].forEach(k => { if (!d[k]) d[k] = null }); d.satisfaccion = d.satisfaccion === '' ? null : Number(d.satisfaccion)
    const { error } = await supabase.from('proyectos').update(d).eq('id', p.id); if (error) return setMsg(error.message)
    if (admin) await supabase.from('proyecto_finanzas').upsert({ proyecto_id: p.id, valor: fin.valor === '' ? null : Number(fin.valor), costo: fin.costo === '' ? null : Number(fin.costo) })
    registrar('Actualizó proyecto', `${p.codigo || ''} ${f.nombre}`); onChange(); onClose()
  }
  return (
    <div className="modal" onClick={onClose}><div className="dlg" onClick={e => e.stopPropagation()}>
      <h3>{p.codigo} · {p.nombre}</h3>
      <div className="frm">
        <label>Nombre<input value={f.nombre} onChange={set('nombre')} /></label>
        <label>Cliente<input value={f.cliente} onChange={set('cliente')} /></label>
        <label>Responsable<input value={f.responsable} onChange={set('responsable')} /></label>
        <label>Estado<select value={f.estado} onChange={set('estado')}>{Object.entries(EST_P).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>Inicio<input type="date" value={f.fecha_inicio} onChange={set('fecha_inicio')} /></label>
        <label>Entrega prevista<input type="date" value={f.fecha_fin_prevista} onChange={set('fecha_fin_prevista')} /></label>
        <label>Entrega real<input type="date" value={f.fecha_entrega_real} onChange={set('fecha_entrega_real')} /></label>
        <label>Satisfacción del cliente (0-100 %)<input type="number" min="0" max="100" value={f.satisfaccion} onChange={set('satisfaccion')} /></label>
        {admin && <label>Valor del contrato ($)<input type="number" value={fin.valor} onChange={e => setFin({ ...fin, valor: e.target.value })} /></label>}
        {admin && <label>Costo real ($)<input type="number" value={fin.costo} onChange={e => setFin({ ...fin, costo: e.target.value })} /></label>}
      </div>
      <label className="et">Descripción<input value={f.descripcion} onChange={set('descripcion')} /></label>
      {msg && <p className="msg">{msg}</p>}
      <EncuestasProyecto p={p} />
      <Comentarios tipo="p" id={p.id} />
      <div className="dact">{p.folder_id && <button className="btn ghost" onClick={() => { onClose(); onAbrir(p.folder_id) }}>Abrir carpeta</button>}<button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn" onClick={guardar}>Guardar</button></div>
    </div></div>
  )
}

function Proyectos({ perfil, onAbrir }) {
  const [l, setL] = useState([]), [sel, setSel] = useState(null), [msg, setMsg] = useState('')
  const admin = perfil.rol === 'admin'
  const cargar = useCallback(async () => { const { data } = await supabase.from('proyectos').select('*').order('codigo', { ascending: false }); setL(data || []) }, [])
  useEffect(() => { cargar() }, [cargar])
  const raiz = async () => (await supabase.from('folders').select('id').eq('nombre', '04_PROYECTOS').is('parent_id', null).is('deleted_at', null).maybeSingle()).data
  const nuevo = async () => {
    const cliente = prompt('Cliente (ej. Alcaldia Valledupar):'); if (!cliente?.trim()) return
    const nombre = prompt('Nombre corto del proyecto (ej. Catastro Rural):'); if (!nombre?.trim()) return
    const r = await raiz(); const { data: hs } = r ? await supabase.from('folders').select('nombre').eq('parent_id', r.id) : { data: [] }
    const { error } = await crearProyectoCompleto(r?.id || null, (hs || []).map(h => h.nombre), perfil, cliente, nombre)
    if (error) setMsg(error.message); cargar()
  }
  const sincronizar = async () => {
    const r = await raiz(); if (!r) return setMsg('No encontré la carpeta 04_PROYECTOS.')
    const { data: fs } = await supabase.from('folders').select('id,nombre').eq('parent_id', r.id).is('deleted_at', null)
    const nuevos = (fs || []).filter(f => /^\d{4}-\d{3}_/.test(f.nombre) && !l.some(x => x.folder_id === f.id))
    if (!nuevos.length) return setMsg('Todo está al día: no hay carpetas sin ficha.')
    await supabase.from('proyectos').insert(nuevos.map(f => { const [cod, cli, ...r2] = f.nombre.split('_'); return { folder_id: f.id, codigo: cod, cliente: (cli || '').replace(/-/g, ' '), nombre: r2.join(' ').replace(/-/g, ' ') || f.nombre, created_by: perfil.id } }))
    setMsg(`Se crearon ${nuevos.length} ficha(s).`); cargar()
  }
  return (
    <div className="panel solo">
      <div className="head"><div><h2>Proyectos</h2><p className="muted">Tablero por estado. Haz clic en un proyecto para ver su ficha.</p></div>
        <div className="lnk"><button className="btn" onClick={nuevo}>＋ Nuevo proyecto</button>{admin && <button className="btn ghost" onClick={sincronizar}>Sincronizar con carpetas</button>}</div></div>
      {msg && <p className="msg ok">{msg}</p>}
      <div className="kan">{Object.entries(EST_P).map(([k, t]) => <div key={k} className="col"><b>{t} <span className="muted">({l.filter(p => p.estado === k).length})</span></b>
        {l.filter(p => p.estado === k).map(p => <div key={p.id} className="pc" onClick={() => setSel(p)}><b>{p.codigo}</b> · {p.nombre}<small>{p.cliente}{p.responsable ? ' · ' + p.responsable : ''}</small>
          {p.fecha_fin_prevista && <small className={k === 'ejecucion' && p.fecha_fin_prevista < hoyStr() ? 'rojo' : ''}>Entrega: {fecha(p.fecha_fin_prevista)}</small>}</div>)}</div>)}</div>
      {sel && <FichaProyecto p={sel} admin={admin} onClose={() => setSel(null)} onChange={cargar} onAbrir={onAbrir} />}
    </div>
  )
}

function FichaEquipo({ e, admin, onClose, onChange }) {
  const vacio = { codigo: '', nombre: '', tipo: 'GNSS', marca: '', modelo: '', serial: '', responsable: '', estado: 'operativo', fecha_adquisicion: '', proxima_calibracion: '', proximo_mantenimiento: '', vence_seguro: '', notas: '' }
  const [f, setF] = useState({ ...vacio, ...Object.fromEntries(Object.entries(e).filter(([k, v]) => k in vacio && v != null)) })
  const [ev, setEv] = useState([]), [msg, setMsg] = useState('')
  const [nv, setNv] = useState({ tipo: 'calibracion', fecha: hoyStr(), detalle: '', proxima: '' })
  const cargarEv = useCallback(async () => { if (e.id) { const { data } = await supabase.from('equipo_eventos').select('*').eq('equipo_id', e.id).order('fecha', { ascending: false }); setEv(data || []) } }, [e.id])
  useEffect(() => { cargarEv() }, [cargarEv])
  const set = k => x => setF({ ...f, [k]: x.target.value })
  const limpiar = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === '' ? null : v]))
  const guardar = async () => {
    if (!f.nombre.trim()) return setMsg('El nombre es obligatorio.')
    const { error } = e.id ? await supabase.from('equipos').update(limpiar(f)).eq('id', e.id) : await supabase.from('equipos').insert(limpiar(f))
    if (error) return setMsg(error.message); registrar(e.id ? 'Actualizó equipo' : 'Creó equipo', f.nombre); onChange(); onClose()
  }
  const agregar = async () => {
    if (!nv.detalle.trim()) return setMsg('Escribe el detalle del evento.')
    await supabase.from('equipo_eventos').insert({ equipo_id: e.id, tipo: nv.tipo, fecha: nv.fecha, detalle: nv.detalle.trim(), created_by: ACTOR.id })
    if (nv.tipo === 'calibracion') { await supabase.from('equipos').update({ ultima_calibracion: nv.fecha, proxima_calibracion: nv.proxima || null }).eq('id', e.id); setF({ ...f, proxima_calibracion: nv.proxima }) }
    if (nv.tipo === 'mantenimiento') { await supabase.from('equipos').update({ ultimo_mantenimiento: nv.fecha, proximo_mantenimiento: nv.proxima || null }).eq('id', e.id); setF({ ...f, proximo_mantenimiento: nv.proxima }) }
    setNv({ ...nv, detalle: '', proxima: '' }); registrar('Registró en hoja de vida', `${f.nombre}: ${EV_EQ[nv.tipo]}`); setMsg(''); cargarEv(); onChange()
  }
  return (
    <div className="modal" onClick={onClose}><div className="dlg" onClick={x => x.stopPropagation()}>
      <h3>{e.id ? `Hoja de vida: ${e.nombre}` : 'Nuevo equipo'}</h3>
      <fieldset disabled={!admin} className="fs"><div className="frm">
        <label>Código interno<input placeholder="ej. GNSS-001" value={f.codigo} onChange={set('codigo')} /></label>
        <label>Nombre<input value={f.nombre} onChange={set('nombre')} /></label>
        <label>Tipo<select value={f.tipo} onChange={set('tipo')}>{TIPOS_EQ.map(t => <option key={t}>{t}</option>)}</select></label>
        <label>Estado<select value={f.estado} onChange={set('estado')}>{Object.entries(EST_EQ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>Marca<input value={f.marca} onChange={set('marca')} /></label>
        <label>Modelo<input value={f.modelo} onChange={set('modelo')} /></label>
        <label>Serial<input value={f.serial} onChange={set('serial')} /></label>
        <label>Responsable<input value={f.responsable} onChange={set('responsable')} /></label>
        <label>Fecha de adquisición<input type="date" value={f.fecha_adquisicion} onChange={set('fecha_adquisicion')} /></label>
        <label>Próxima calibración<input type="date" value={f.proxima_calibracion} onChange={set('proxima_calibracion')} /></label>
        <label>Próximo mantenimiento<input type="date" value={f.proximo_mantenimiento} onChange={set('proximo_mantenimiento')} /></label>
        <label>Vence seguro / licencia<input type="date" value={f.vence_seguro} onChange={set('vence_seguro')} /></label>
      </div><label className="et">Notas<input value={f.notas} onChange={set('notas')} /></label></fieldset>
      {e.id && <><b>Hoja de vida</b>
        {admin && <div className="frm"><label>Evento<select value={nv.tipo} onChange={x => setNv({ ...nv, tipo: x.target.value })}>{Object.entries(EV_EQ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label>Fecha<input type="date" value={nv.fecha} onChange={x => setNv({ ...nv, fecha: x.target.value })} /></label>
          <label>Detalle<input value={nv.detalle} onChange={x => setNv({ ...nv, detalle: x.target.value })} /></label>
          <label>Próxima fecha (si aplica)<input type="date" value={nv.proxima} onChange={x => setNv({ ...nv, proxima: x.target.value })} /></label></div>}
        {admin && <button className="btn ghost" onClick={agregar}>Agregar a la hoja de vida</button>}
        {ev.map(v => <div key={v.id} className="com"><small>{fecha(v.fecha)} · {EV_EQ[v.tipo]}</small><p>{v.detalle}</p></div>)}</>}
      {msg && <p className="msg">{msg}</p>}
      <div className="dact"><button className="btn ghost" onClick={onClose}>{admin ? 'Cancelar' : 'Cerrar'}</button>{admin && <button className="btn" onClick={guardar}>Guardar</button>}</div>
    </div></div>
  )
}

function Equipos({ perfil }) {
  const [l, setL] = useState([]), [sel, setSel] = useState(null), admin = perfil.rol === 'admin'
  const cargar = useCallback(async () => { const { data } = await supabase.from('equipos').select('*').order('codigo'); setL(data || []) }, [])
  useEffect(() => { cargar() }, [cargar])
  const cel = f => { const [c, t] = semaforo(f); return <td><span className={'sem ' + c}>{t}</span></td> }
  return (
    <div className="panel solo">
      <div className="head"><div><h2>Equipos</h2><p className="muted">GNSS, estaciones totales, drones y demás activos, con sus vencimientos de calibración, mantenimiento y seguro.</p></div>
        {admin && <button className="btn" onClick={() => setSel({})}>＋ Nuevo equipo</button>}</div>
      {!l.length ? <div className="vacio">Aún no hay equipos registrados</div> : <div className="tabla-w"><table><thead><tr><th>Código</th><th>Equipo</th><th>Tipo</th><th>Responsable</th><th>Estado</th><th>Calibración</th><th>Mantenimiento</th><th>Seguro / licencia</th></tr></thead>
        <tbody>{l.map(e => <tr key={e.id} className="clic" onClick={() => setSel(e)}><td>{e.codigo}</td><td>{e.nombre}<small>{[e.marca, e.modelo].filter(Boolean).join(' ')}</small></td><td>{e.tipo}</td><td>{e.responsable}</td><td>{EST_EQ[e.estado]}</td>{cel(e.proxima_calibracion)}{cel(e.proximo_mantenimiento)}{cel(e.vence_seguro)}</tr>)}</tbody></table></div>}
      <Reservas perfil={perfil} equipos={l} />
      {sel && <FichaEquipo e={sel} admin={admin} onClose={() => setSel(null)} onChange={cargar} />}
    </div>
  )
}

function Indicadores({ perfil }) {
  const admin = perfil.rol === 'admin'
  const [P, setP] = useState([]), [E, setE] = useState([]), [FN, setFN] = useState([])
  const [form, setForm] = useState({ tipo: 'no_conformidad', fecha: hoyStr(), detalle: '' })
  const cargar = useCallback(async () => {
    const { data: p } = await supabase.from('proyectos').select('*'); setP(p || [])
    const { data: e } = await supabase.from('eventos_sgi').select('*').order('fecha', { ascending: false }); setE(e || [])
    if (admin) { const { data: f } = await supabase.from('proyecto_finanzas').select('*'); setFN(f || []) }
  }, [admin])
  useEffect(() => { cargar() }, [cargar])
  const reg = async () => { if (!form.detalle.trim()) return; await supabase.from('eventos_sgi').insert({ ...form, created_by: perfil.id }); registrar('Registró evento', EV[form.tipo]); setForm({ ...form, detalle: '' }); cargar() }
  const man = new Date(Date.now() + 864e5), hace = n => new Date(Date.now() - n * 864e5)
  const entre = (t, a, b) => E.filter(e => e.tipo === t && new Date(e.fecha) >= a && new Date(e.fecha) < b).length
  const ent = P.filter(p => p.fecha_entrega_real && p.fecha_fin_prevista), aT = ent.filter(p => p.fecha_entrega_real <= p.fecha_fin_prevista).length
  const sat = P.filter(p => p.satisfaccion != null), satP = sat.length ? sat.reduce((a, p) => a + p.satisfaccion, 0) / sat.length : null
  const nc1 = entre('no_conformidad', hace(90), man), nc0 = entre('no_conformidad', hace(180), hace(90))
  const anio = new Date(new Date().getFullYear(), 0, 1), prog = entre('capacitacion_programada', anio, man), ejec = entre('capacitacion_ejecutada', anio, man)
  const acc = entre('accidente', new Date(new Date().getFullYear(), new Date().getMonth(), 1), man)
  const rent = FN.filter(f => f.valor > 0 && f.costo != null).map(f => ((f.valor - f.costo) / f.valor) * 100), rentP = rent.length ? rent.reduce((a, b) => a + b, 0) / rent.length : null
  const cards = [
    { t: 'Cumplimiento de entregas', v: ent.length ? ((aT / ent.length) * 100).toFixed(0) + ' %' : '—', m: 'Meta ≥ 95 %', ok: ent.length ? aT / ent.length >= 0.95 : null, n: `${aT} de ${ent.length} entregados a tiempo` },
    { t: 'Satisfacción del cliente', v: satP != null ? satP.toFixed(0) + ' %' : '—', m: 'Meta ≥ 90 %', ok: satP != null ? satP >= 90 : null, n: `${sat.length} proyecto(s) calificados` },
    { t: 'No conformidades (90 días)', v: nc1, m: 'Tendencia a la baja', ok: nc1 <= nc0, n: `Trimestre anterior: ${nc0}` },
    { t: 'Plan de capacitación (año)', v: prog ? Math.min(100, (ejec / prog) * 100).toFixed(0) + ' %' : '—', m: 'Meta 100 %', ok: prog ? ejec >= prog : null, n: `${ejec} de ${prog} ejecutadas` },
    { t: 'Accidentalidad (mes)', v: acc, m: 'Meta 0', ok: acc === 0, n: 'Accidentes e incidentes reportados' },
    { t: 'Rentabilidad por proyecto', v: !admin ? 'Solo administradores' : rentP != null ? rentP.toFixed(0) + ' %' : '—', m: 'Meta definida por la gerencia', ok: null, n: admin ? `${rent.length} proyecto(s) con valor y costo` : '' }
  ]
  return (
    <div className="panel solo"><h2>Indicadores</h2><p className="muted">Calculados automáticamente con las fichas de proyecto y los eventos registrados (manual, numeral 12).</p>
      <div className="inds">{cards.map(c => <div key={c.t} className={'ind ' + (c.ok === null ? 'na' : c.ok ? 'ok' : 'mal')}><small>{c.t}</small><b>{c.v}</b><span>{c.m}</span><small>{c.n}</small></div>)}</div>
      <h3 className="gt">Registrar un evento</h3>
      <div className="frm"><label>Tipo<select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>{Object.entries(EV).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>Fecha<input type="date" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} /></label>
        <label className="et2">Detalle<input value={form.detalle} onChange={e => setForm({ ...form, detalle: e.target.value })} /></label></div>
      <button className="btn" onClick={reg}>Registrar</button>
      {admin && E.length > 0 && <><h3 className="gt">Últimos eventos</h3><div className="tabla-w"><table><tbody>{E.slice(0, 15).map(e => <tr key={e.id}><td>{fecha(e.fecha)}</td><td>{EV[e.tipo]}</td><td>{e.detalle}</td><td><button className="x2" title="Borrar" onClick={async () => { await supabase.from('eventos_sgi').delete().eq('id', e.id); cargar() }}>✕</button></td></tr>)}</tbody></table></div></>}
    </div>
  )
}

function Destacados({ onAbrir }) {
  const [fs, setFs] = useState([]), [ds, setDs] = useState([]), [prev, setPrev] = useState(null)
  useEffect(() => {
    (async () => {
      const { data: fv } = await supabase.from('favoritos').select('*')
      const fi = (fv || []).filter(x => x.item_type === 'f').map(x => x.item_id), di = (fv || []).filter(x => x.item_type === 'd').map(x => x.item_id)
      setFs(fi.length ? (await supabase.from('folders').select('*').in('id', fi).is('deleted_at', null)).data || [] : [])
      setDs(di.length ? (await supabase.from('documents').select('*').in('id', di).is('deleted_at', null)).data || [] : [])
    })()
  }, [])
  return (
    <div className="panel solo"><h2>⭐ Destacados</h2><p className="muted">Tus carpetas y archivos favoritos. Para destacar algo, clic derecho → Destacar.</p>
      {!fs.length && !ds.length ? <div className="vacio">Aún no has destacado nada</div> : <div className="grid">
        {fs.map(f => <div key={f.id} className="it" onClick={() => onAbrir(f.id)}><div className="ic"><FolderIcon c={f.color} /></div><div className="nm">{f.nombre}</div></div>)}
        {ds.map(d => <div key={d.id} className="it" onClick={() => setPrev(d)}><div className="ic"><FileIcon n={d.nombre} /></div><div className="nm">{d.nombre}</div></div>)}</div>}
      {prev && <Preview d={prev} onClose={() => setPrev(null)} />}
    </div>
  )
}

function Aprobacion({ d, onChange }) {
  const us = useUsuarios()
  const [l, setL] = useState([]), [rev, setRev] = useState(''), [apr, setApr] = useState(''), [msg, setMsg] = useState('')
  const cargar = useCallback(async () => { const { data } = await supabase.from('aprobaciones').select('*').eq('document_id', d.id).order('ronda').order('orden'); setL(data || []) }, [d.id])
  useEffect(() => { cargar() }, [cargar])
  const solicitar = async () => {
    if (!apr) return setMsg('Elige quién aprueba.')
    const ronda = Math.max(0, ...l.map(x => x.ronda)) + 1
    const filas = [...(rev ? [{ rol: 'revision', orden: 1, user_id: rev }] : []), { rol: 'aprobacion', orden: 2, user_id: apr }].map(x => ({ ...x, document_id: d.id, ronda, version: d.version, solicitado_por: ACTOR.id }))
    const { error } = await supabase.from('aprobaciones').insert(filas); if (error) return setMsg(error.message)
    await supabase.from('documents').update({ estado: 'revision' }).eq('id', d.id)
    registrar('Solicitó revisión/aprobación', d.nombre); setMsg(''); setRev(''); setApr(''); cargar(); onChange()
  }
  const sel = (v, set, ph) => <select value={v} onChange={e => set(e.target.value)}><option value="">{ph}</option>{us.map(u => <option key={u.id} value={u.id}>{u.nombre || u.email}</option>)}</select>
  return (
    <div className="coms"><b>Revisión y aprobación</b>
      {l.map(a => <div key={a.id} className="apr"><b>Ronda {a.ronda} · {a.rol === 'revision' ? 'Revisa' : 'Aprueba'}:</b> {nom(us, a.user_id)} — <span className={'est ' + (a.estado === 'aprobado' ? '' : a.estado === 'pendiente' ? 'revision' : 'borrador')}>{ESTA[a.estado]}</span>{a.comentario && <small>“{a.comentario}”</small>}</div>)}
      {!l.some(x => x.estado === 'pendiente') && <div className="frm">{sel(rev, setRev, 'Revisa (opcional)')}{sel(apr, setApr, 'Aprueba (obligatorio)')}<button className="btn ghost" onClick={solicitar}>Solicitar aprobación</button></div>}
      {msg && <p className="msg">{msg}</p>}
    </div>
  )
}

function MisAprobaciones({ perfil }) {
  const us = useUsuarios()
  const [l, setL] = useState([]), [prev, setPrev] = useState(null), [msg, setMsg] = useState('')
  const cargar = useCallback(async () => {
    const { data } = await supabase.from('aprobaciones').select('*, documents(id,nombre,path,version,estado)').or(`user_id.eq.${perfil.id},solicitado_por.eq.${perfil.id}`).order('created_at', { ascending: false }).limit(100); setL(data || [])
  }, [perfil.id])
  useEffect(() => { cargar() }, [cargar])
  const resolver = async (a, estado) => {
    const c = prompt(estado === 'aprobado' ? 'Comentario (opcional):' : 'Motivo del rechazo:'); if (c === null) return
    if (estado === 'rechazado' && !c.trim()) return setMsg('Escribe el motivo del rechazo.')
    const { error } = await supabase.rpc('resolver_aprobacion', { p_id: a.id, p_estado: estado, p_comentario: c.trim() || null }); if (error) return setMsg(error.message)
    registrar(estado === 'aprobado' ? 'Aprobó' : 'Rechazó', a.documents?.nombre); setMsg(''); cargar()
  }
  const mias = l.filter(a => a.user_id === perfil.id && a.estado === 'pendiente'), enviadas = l.filter(a => a.solicitado_por === perfil.id)
  return (
    <div className="panel solo"><h2>Mis aprobaciones</h2><p className="muted">Documentos que te piden revisar o aprobar, y el estado de los que tú solicitaste.</p>
      {msg && <p className="msg">{msg}</p>}
      <h3 className="gt">Pendientes para mí ({mias.length})</h3>
      {!mias.length ? <div className="vacio">No tienes nada pendiente</div> : mias.map(a => <div key={a.id} className="lnk"><span><b>{a.documents?.nombre}</b> · {a.rol === 'revision' ? 'Revisar' : 'Aprobar'} v{a.version}</span>
        <button className="btn ghost" onClick={() => setPrev(a.documents)}>Ver documento</button><button className="btn" onClick={() => resolver(a, 'aprobado')}>Aprobar</button><button className="chip no" onClick={() => resolver(a, 'rechazado')}>Rechazar</button></div>)}
      <h3 className="gt">Solicitudes que envié</h3>
      {!enviadas.length ? <div className="vacio">Aún no has solicitado aprobaciones</div> : <table><tbody>{enviadas.map(a => <tr key={a.id}><td>{a.documents?.nombre}</td><td>{a.rol === 'revision' ? 'Revisión' : 'Aprobación'}: {nom(us, a.user_id)}</td><td>{ESTA[a.estado]}</td><td>{a.comentario}</td></tr>)}</tbody></table>}
      {prev && <Preview d={prev} onClose={() => setPrev(null)} />}
    </div>
  )
}

function FichaTarea({ t, ps, us, perfil, onClose, onChange }) {
  const [f, setF] = useState({ titulo: t.titulo || '', descripcion: t.descripcion || '', proyecto_id: t.proyecto_id || '', responsable: t.responsable || perfil.id, fecha_inicio: t.fecha_inicio || '', fecha_fin: t.fecha_fin || '', estado: t.estado || 'pendiente', prioridad: t.prioridad || 'media' })
  const [msg, setMsg] = useState(''), set = k => e => setF({ ...f, [k]: e.target.value })
  const guardar = async () => {
    if (!f.titulo.trim()) return setMsg('Escribe el nombre de la tarea.')
    if (f.fecha_inicio && f.fecha_fin && f.fecha_fin < f.fecha_inicio) return setMsg('La fecha final no puede ser anterior a la inicial.')
    const { error } = t.id ? await supabase.from('tareas').update(vacioNull(f)).eq('id', t.id) : await supabase.from('tareas').insert({ ...vacioNull(f), created_by: perfil.id })
    if (error) return setMsg(error.message); registrar(t.id ? 'Editó tarea' : 'Creó tarea', f.titulo); onChange(); onClose()
  }
  const borrar = async () => { if (!confirm('¿Eliminar esta tarea?')) return; const { error } = await supabase.from('tareas').delete().eq('id', t.id); if (error) return setMsg(error.message); onChange(); onClose() }
  return (
    <div className="modal" onClick={onClose}><div className="dlg" onClick={e => e.stopPropagation()}>
      <h3>{t.id ? 'Editar tarea' : 'Nueva tarea'}</h3>
      <div className="frm">
        <label className="et2">Tarea<input value={f.titulo} onChange={set('titulo')} /></label>
        <label>Proyecto<select value={f.proyecto_id} onChange={set('proyecto_id')}><option value="">General (sin proyecto)</option>{ps.map(p => <option key={p.id} value={p.id}>{p.codigo} · {p.nombre}</option>)}</select></label>
        <label>Responsable<select value={f.responsable} onChange={set('responsable')}>{us.map(u => <option key={u.id} value={u.id}>{u.nombre || u.email}</option>)}</select></label>
        <label>Inicio<input type="date" value={f.fecha_inicio} onChange={set('fecha_inicio')} /></label>
        <label>Fin<input type="date" value={f.fecha_fin} onChange={set('fecha_fin')} /></label>
        <label>Estado<select value={f.estado} onChange={set('estado')}>{Object.entries(EST_T).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>Prioridad<select value={f.prioridad} onChange={set('prioridad')}><option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option></select></label>
      </div>
      <label className="et">Descripción<input value={f.descripcion} onChange={set('descripcion')} /></label>
      {msg && <p className="msg">{msg}</p>}
      <div className="dact">{t.id && <button className="chip no" onClick={borrar}>Eliminar</button>}<button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn" onClick={guardar}>Guardar</button></div>
    </div></div>
  )
}

function Tareas({ perfil }) {
  const us = useUsuarios()
  const [l, setL] = useState([]), [ps, setPs] = useState([]), [sel, setSel] = useState(null), [modo, setModo] = useState('lista')
  const [fp, setFp] = useState(''), [fr, setFr] = useState(''), [fe, setFe] = useState('')
  const cargar = useCallback(async () => {
    const { data } = await supabase.from('tareas').select('*').order('fecha_fin', { ascending: true, nullsFirst: false }); setL(data || [])
    const { data: p } = await supabase.from('proyectos').select('id,codigo,nombre').order('codigo'); setPs(p || [])
  }, [])
  useEffect(() => { cargar() }, [cargar])
  const v = l.filter(t => (!fp || (fp === '-' ? !t.proyecto_id : t.proyecto_id === fp)) && (!fr || t.responsable === (fr === 'yo' ? perfil.id : fr)) && (!fe || t.estado === fe))
  const pn = id => { const p = ps.find(x => x.id === id); return p ? `${p.codigo || ''} ${p.nombre}` : 'General' }
  const atras = t => t.estado !== 'hecha' && t.fecha_fin && t.fecha_fin < hoyStr()
  const cambiar = async (t, estado) => { await supabase.from('tareas').update({ estado }).eq('id', t.id); registrar('Cambió tarea', `${t.titulo} → ${EST_T[estado]}`); cargar() }
  const gantt = () => {
    const t = v.filter(x => x.fecha_inicio && x.fecha_fin); if (!t.length) return <div className="vacio">Las tareas que tengan fecha de inicio y fin aparecen aquí</div>
    const a = Math.min(...t.map(x => +new Date(x.fecha_inicio))), b = Math.max(...t.map(x => +new Date(x.fecha_fin))) + 864e5, span = b - a, hoy = ((Date.now() - a) / span) * 100
    return <div className="gantt">{t.map(x => <div key={x.id} className="gr"><span className="gn" title={x.titulo}>{x.titulo}</span>
      <div className="gt2" onClick={() => setSel(x)}><i className={'gb ' + x.estado} title={`${x.fecha_inicio} → ${x.fecha_fin}`} style={{ left: ((+new Date(x.fecha_inicio) - a) / span) * 100 + '%', width: Math.max(1.5, ((+new Date(x.fecha_fin) + 864e5 - +new Date(x.fecha_inicio)) / span) * 100) + '%' }} />{hoy >= 0 && hoy <= 100 && <u className="hoy" style={{ left: hoy + '%' }} />}</div></div>)}
      <div className="gx"><small>{fecha(a)}</small><small>Línea roja: hoy</small><small>{fecha(b - 864e5)}</small></div></div>
  }
  return (
    <div className="panel solo">
      <div className="head"><div><h2>Tareas y cronograma</h2><p className="muted">Quién hace qué y para cuándo.</p></div><button className="btn" onClick={() => setSel({})}>＋ Nueva tarea</button></div>
      <div className="bar2">
        <select value={fp} onChange={e => setFp(e.target.value)}><option value="">Todos los proyectos</option><option value="-">General</option>{ps.map(p => <option key={p.id} value={p.id}>{p.codigo} · {p.nombre}</option>)}</select>
        <select value={fr} onChange={e => setFr(e.target.value)}><option value="">Todas las personas</option><option value="yo">Solo mis tareas</option>{us.map(u => <option key={u.id} value={u.id}>{u.nombre || u.email}</option>)}</select>
        <select value={fe} onChange={e => setFe(e.target.value)}><option value="">Todos los estados</option>{Object.entries(EST_T).map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select>
        <div className="seg"><button className={modo === 'lista' ? 'on' : ''} onClick={() => setModo('lista')}>Lista</button><button className={modo === 'gantt' ? 'on' : ''} onClick={() => setModo('gantt')}>Cronograma</button></div>
      </div>
      {modo === 'gantt' ? gantt() : !v.length ? <div className="vacio">No hay tareas con estos filtros</div> : <div className="tabla-w"><table><thead><tr><th>Tarea</th><th>Proyecto</th><th>Responsable</th><th>Inicio</th><th>Fin</th><th>Prioridad</th><th>Estado</th></tr></thead>
        <tbody>{v.map(t => <tr key={t.id}><td className={'clic' + (atras(t) ? ' rojo' : '')} onClick={() => setSel(t)}>{t.titulo}{atras(t) && ' ⚠'}</td><td>{pn(t.proyecto_id)}</td><td>{nom(us, t.responsable)}</td><td>{t.fecha_inicio ? fecha(t.fecha_inicio) : '—'}</td><td>{t.fecha_fin ? fecha(t.fecha_fin) : '—'}</td><td>{t.prioridad}</td>
          <td><select value={t.estado} onChange={e => cambiar(t, e.target.value)}>{Object.entries(EST_T).map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select></td></tr>)}</tbody></table></div>}
      {sel && <FichaTarea t={sel} ps={ps} us={us} perfil={perfil} onClose={() => setSel(null)} onChange={cargar} />}
    </div>
  )
}

function Reservas({ perfil, equipos }) {
  const us = useUsuarios()
  const [l, setL] = useState([]), [ps, setPs] = useState([]), [msg, setMsg] = useState('')
  const [f, setF] = useState({ equipo_id: '', proyecto_id: '', desde: hoyStr(), hasta: hoyStr(), nota: '' })
  const cargar = useCallback(async () => { const { data } = await supabase.from('reservas').select('*').gte('hasta', hoyStr()).order('desde'); setL(data || []) }, [])
  useEffect(() => { cargar(); supabase.from('proyectos').select('id,codigo,nombre').neq('estado', 'cerrado').then(({ data }) => setPs(data || [])) }, [cargar])
  const en = id => equipos.find(e => e.id === id)?.nombre || '—'
  const reservar = async () => {
    if (!f.equipo_id) return setMsg('Elige el equipo.'); if (f.hasta < f.desde) return setMsg('La fecha final no puede ser anterior a la inicial.')
    const { error } = await supabase.from('reservas').insert({ ...vacioNull(f), user_id: perfil.id })
    if (error) return setMsg(/exclu|overlap|conflict/i.test(error.message) ? 'Ese equipo ya está reservado en esas fechas. Mira la lista y elige otras.' : error.message)
    registrar('Reservó equipo', `${en(f.equipo_id)} · ${f.desde} a ${f.hasta}`); setMsg(''); setF({ ...f, nota: '' }); cargar()
  }
  const set = k => e => setF({ ...f, [k]: e.target.value })
  return (
    <div><h3 className="gt">Reservas de equipos</h3>
      <div className="frm">
        <label>Equipo<select value={f.equipo_id} onChange={set('equipo_id')}><option value="">Elige…</option>{equipos.filter(e => e.estado === 'operativo').map(e => <option key={e.id} value={e.id}>{e.codigo} · {e.nombre}</option>)}</select></label>
        <label>Proyecto (opcional)<select value={f.proyecto_id} onChange={set('proyecto_id')}><option value="">—</option>{ps.map(p => <option key={p.id} value={p.id}>{p.codigo} · {p.nombre}</option>)}</select></label>
        <label>Desde<input type="date" value={f.desde} onChange={set('desde')} /></label><label>Hasta<input type="date" value={f.hasta} onChange={set('hasta')} /></label>
        <label className="et2">Nota<input value={f.nota} onChange={set('nota')} placeholder="ej. Comisión de campo Valledupar" /></label>
      </div>
      <button className="btn" onClick={reservar}>Reservar</button>{msg && <p className="msg">{msg}</p>}
      {l.length > 0 && <div className="tabla-w"><table><thead><tr><th>Equipo</th><th>Quién</th><th>Desde</th><th>Hasta</th><th>Nota</th><th /></tr></thead>
        <tbody>{l.map(r => <tr key={r.id}><td>{en(r.equipo_id)}</td><td>{nom(us, r.user_id)}</td><td>{fecha(r.desde)}</td><td>{fecha(r.hasta)}</td><td>{r.nota}</td>
          <td>{(perfil.rol === 'admin' || r.user_id === perfil.id) && <button className="x2" title="Cancelar reserva" onClick={async () => { await supabase.from('reservas').delete().eq('id', r.id); cargar() }}>✕</button>}</td></tr>)}</tbody></table></div>}
    </div>
  )
}

function FichaOpor({ o, us, perfil, onClose, onChange }) {
  const [f, setF] = useState({ entidad: o.entidad || '', objeto: o.objeto || '', proceso: o.proceso || '', enlace: o.enlace || '', modalidad: o.modalidad || '', valor: o.valor ?? '', fecha_cierre: o.fecha_cierre || '', responsable: o.responsable || '', estado: o.estado || 'identificada', notas: o.notas || '' })
  const [msg, setMsg] = useState(''), set = k => e => setF({ ...f, [k]: e.target.value })
  const guardar = async () => {
    if (!f.objeto.trim()) return setMsg('Escribe el objeto del proceso.')
    const d = vacioNull(f); if (d.enlace && !/^https?:\/\//i.test(d.enlace)) d.enlace = 'https://' + d.enlace
    const { error } = o.id ? await supabase.from('oportunidades').update(d).eq('id', o.id) : await supabase.from('oportunidades').insert({ ...d, created_by: perfil.id })
    if (error) return setMsg(error.message); registrar(o.id ? 'Actualizó oportunidad' : 'Creó oportunidad', f.objeto.slice(0, 80)); onChange(); onClose()
  }
  return (
    <div className="modal" onClick={onClose}><div className="dlg" onClick={e => e.stopPropagation()}>
      <h3>{o.id ? 'Oportunidad' : 'Nueva oportunidad'}</h3>
      <div className="frm">
        <label>Entidad / cliente<input value={f.entidad} onChange={set('entidad')} /></label><label>N.º de proceso<input value={f.proceso} onChange={set('proceso')} /></label>
        <label className="et2">Objeto<input value={f.objeto} onChange={set('objeto')} /></label>
        <label>Enlace (SECOP II u otro)<input value={f.enlace} onChange={set('enlace')} /></label>
        <label>Modalidad<select value={f.modalidad} onChange={set('modalidad')}><option value="">—</option>{MODALIDADES.map(m => <option key={m}>{m}</option>)}</select></label>
        <label>Valor estimado ($)<input type="number" value={f.valor} onChange={set('valor')} /></label><label>Fecha de cierre<input type="date" value={f.fecha_cierre} onChange={set('fecha_cierre')} /></label>
        <label>Responsable<select value={f.responsable} onChange={set('responsable')}><option value="">—</option>{us.map(u => <option key={u.id} value={u.id}>{u.nombre || u.email}</option>)}</select></label>
        <label>Estado<select value={f.estado} onChange={set('estado')}>{Object.entries(EST_O).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      </div>
      <label className="et">Notas<input value={f.notas} onChange={set('notas')} /></label>
      {msg && <p className="msg">{msg}</p>}
      <div className="dact">{o.enlace && <a className="btn ghost" href={o.enlace} target="_blank" rel="noopener noreferrer">Abrir proceso</a>}<button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn" onClick={guardar}>Guardar</button></div>
    </div></div>
  )
}

function Oportunidades({ perfil }) {
  const us = useUsuarios()
  const [l, setL] = useState([]), [sel, setSel] = useState(null)
  const cargar = useCallback(async () => { const { data } = await supabase.from('oportunidades').select('*').order('fecha_cierre', { nullsFirst: false }); setL(data || []) }, [])
  useEffect(() => { cargar() }, [cargar])
  const abiertas = l.filter(o => ['identificada', 'evaluando', 'preparando'].includes(o.estado))
  return (
    <div className="panel solo">
      <div className="head"><div><h2>Oportunidades</h2><p className="muted">Procesos que están siguiendo: {abiertas.length} abiertos · {plata(abiertas.reduce((a, o) => a + (Number(o.valor) || 0), 0))} en juego.</p></div><button className="btn" onClick={() => setSel({})}>＋ Nueva oportunidad</button></div>
      <div className="kan">{Object.entries(EST_O).map(([k, t]) => <div key={k} className="col"><b>{t} <span className="muted">({l.filter(o => o.estado === k).length})</span></b>
        {l.filter(o => o.estado === k).map(o => { const [c, tx] = semaforo(o.fecha_cierre); return <div key={o.id} className="pc" onClick={() => setSel(o)}><b>{o.entidad || 'Sin entidad'}</b><small>{o.objeto}</small><small>{plata(o.valor)}</small>
          {o.fecha_cierre && ['identificada', 'evaluando', 'preparando'].includes(k) && <small><span className={'sem ' + c}>Cierra: {fecha(o.fecha_cierre)} · {tx}</span></small>}{o.responsable && <small>{nom(us, o.responsable)}</small>}</div> })}</div>)}</div>
      {sel && <FichaOpor o={sel} us={us} perfil={perfil} onClose={() => setSel(null)} onChange={cargar} />}
    </div>
  )
}

function FichaHab({ h, onClose, onChange }) {
  const [f, setF] = useState({ nombre: h.nombre || '', categoria: h.categoria || 'Jurídico', fecha_expedicion: h.fecha_expedicion || '', fecha_vence: h.fecha_vence || '', observaciones: h.observaciones || '' })
  const [doc, setDoc] = useState(null), [q, setQ] = useState(''), [res, setRes] = useState([]), [msg, setMsg] = useState('')
  useEffect(() => { if (h.document_id) supabase.from('documents').select('id,nombre').eq('id', h.document_id).maybeSingle().then(({ data }) => setDoc(data)) }, [h.document_id])
  const buscar = async v => { setQ(v); if (v.trim().length < 2) return setRes([]); const { data } = await supabase.from('documents').select('id,nombre').is('deleted_at', null).ilike('nombre', `%${v.trim().replace(/[%,]/g, '')}%`).limit(6); setRes(data || []) }
  const set = k => e => setF({ ...f, [k]: e.target.value })
  const guardar = async () => {
    if (!f.nombre.trim()) return setMsg('Escribe el nombre del documento.')
    const d = { ...vacioNull(f), document_id: doc?.id || null }
    const { error } = h.id ? await supabase.from('habilitantes').update(d).eq('id', h.id) : await supabase.from('habilitantes').insert(d)
    if (error) return setMsg(error.message); registrar('Actualizó habilitante', f.nombre); onChange(); onClose()
  }
  const borrar = async () => { if (!confirm('¿Quitar este documento de la lista?')) return; await supabase.from('habilitantes').delete().eq('id', h.id); onChange(); onClose() }
  return (
    <div className="modal" onClick={onClose}><div className="dlg" onClick={e => e.stopPropagation()}>
      <h3>{h.id ? 'Documento habilitante' : 'Nuevo documento habilitante'}</h3>
      <div className="frm"><label className="et2">Nombre<input value={f.nombre} onChange={set('nombre')} /></label>
        <label>Categoría<select value={f.categoria} onChange={set('categoria')}>{CAT_H.map(c => <option key={c}>{c}</option>)}</select></label><label>Fecha de expedición<input type="date" value={f.fecha_expedicion} onChange={set('fecha_expedicion')} /></label>
        <label>Vence<input type="date" value={f.fecha_vence} onChange={set('fecha_vence')} /></label></div>
      <label className="et">Observaciones<input value={f.observaciones} onChange={set('observaciones')} /></label>
      <label className="et">Archivo vigente: {doc ? <b>{doc.nombre} <button className="x2" onClick={() => setDoc(null)}>✕ quitar</button></b> : 'ninguno'}<input placeholder="Busca el archivo por nombre…" value={q} onChange={e => buscar(e.target.value)} /></label>
      {res.map(r => <button key={r.id} className="nav small" onClick={() => { setDoc(r); setRes([]); setQ('') }}>{r.nombre}</button>)}
      {msg && <p className="msg">{msg}</p>}
      <div className="dact">{h.id && <button className="chip no" onClick={borrar}>Quitar</button>}<button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn" onClick={guardar}>Guardar</button></div>
    </div></div>
  )
}

function Habilitantes({ perfil }) {
  const admin = perfil.rol === 'admin'
  const [l, setL] = useState([]), [ds, setDs] = useState({}), [sel, setSel] = useState(null), [prev, setPrev] = useState(null)
  const cargar = useCallback(async () => {
    const { data } = await supabase.from('habilitantes').select('*').order('nombre'); setL(data || [])
    const ids = (data || []).map(x => x.document_id).filter(Boolean)
    if (ids.length) { const { data: d } = await supabase.from('documents').select('*').in('id', ids); setDs(Object.fromEntries((d || []).map(x => [x.id, x]))) }
  }, [])
  useEffect(() => { cargar() }, [cargar])
  const est = h => (!h.document_id ? ['rojo', 'Sin archivo'] : !h.fecha_vence ? ['amar', 'Sin fecha de vencimiento'] : semaforo(h.fecha_vence))
  const cuenta = c => l.filter(h => est(h)[0] === c).length
  return (
    <div className="panel solo">
      <div className="head"><div><h2>Documentos habilitantes</h2><p className="muted">Lo que piden en las licitaciones, siempre vigente y a un clic.</p></div>{admin && <button className="btn" onClick={() => setSel({})}>＋ Agregar</button>}</div>
      <div className="hsum"><span className="sem verde">{cuenta('verde')} vigentes</span><span className="sem amar">{cuenta('amar')} por vencer o sin fecha</span><span className="sem rojo">{cuenta('rojo')} vencidos o sin archivo</span></div>
      {CAT_H.filter(c => l.some(h => h.categoria === c)).map(c => <div key={c}><h3 className="gt">{c}</h3><div className="tabla-w"><table><tbody>
        {l.filter(h => h.categoria === c).map(h => { const [cl, tx] = est(h); const d = ds[h.document_id]; return <tr key={h.id}><td className={admin ? 'clic' : ''} onClick={() => admin && setSel(h)}>{h.nombre}</td><td><span className={'sem ' + cl}>{tx}</span></td><td>{h.fecha_vence ? 'Vence ' + fecha(h.fecha_vence) : ''}</td>
          <td>{d ? <button className="chip si" onClick={() => setPrev(d)}>Ver archivo</button> : ''}</td></tr> })}</tbody></table></div></div>)}
      {sel && <FichaHab h={sel} onClose={() => setSel(null)} onChange={cargar} />}
      {prev && <Preview d={prev} onClose={() => setPrev(null)} />}
    </div>
  )
}

function Lienzo({ onData }) {
  const ref = useRef(), dib = useRef(false)
  const pos = e => { const r = ref.current.getBoundingClientRect(); return [(e.clientX - r.left) * (ref.current.width / r.width), (e.clientY - r.top) * (ref.current.height / r.height)] }
  const ini = e => { dib.current = true; const c = ref.current.getContext('2d'); c.lineWidth = 2.5; c.lineCap = 'round'; c.strokeStyle = '#000'; c.beginPath(); c.moveTo(...pos(e)); ref.current.setPointerCapture(e.pointerId) }
  const mov = e => { if (dib.current) { const c = ref.current.getContext('2d'); c.lineTo(...pos(e)); c.stroke() } }
  const fin = () => { if (dib.current) { dib.current = false; onData(ref.current.toDataURL('image/png')) } }
  return <div><canvas ref={ref} width={600} height={200} className="lienzo" onPointerDown={ini} onPointerMove={mov} onPointerUp={fin} onPointerLeave={fin} />
    <button className="chip no" onClick={() => { ref.current.getContext('2d').clearRect(0, 0, 600, 200); onData('') }}>Borrar y repetir</button></div>
}

function PanelFirma({ path, hashEsperado, nombre0, externo, onFirmar, onRechazar }) {
  const [url, setUrl] = useState(null), [hash, setHash] = useState(''), [integro, setIntegro] = useState(null)
  const [f, setF] = useState({ nombre: nombre0 || '', cedula: '', ok: false }), [firma, setFirma] = useState(''), [msg, setMsg] = useState(''), [env, setEnv] = useState(false)
  useEffect(() => { (async () => { const u = await signed(path); setUrl(u); try { const h = await sha256(await (await fetch(u)).arrayBuffer()); setHash(h); setIntegro(h === hashEsperado) } catch { setIntegro(false) } })() }, [path, hashEsperado])
  const ir = async () => {
    if (externo && (!f.nombre.trim() || !f.cedula.trim())) return setMsg('Escribe tu nombre completo y tu documento de identidad.')
    if (!firma) return setMsg('Dibuja tu firma en el recuadro.'); if (!f.ok) return setMsg('Debes aceptar la declaración para firmar.')
    setEnv(true); setMsg(''); const err = await onFirmar({ nombre: f.nombre.trim(), cedula: f.cedula.trim(), firma, hash }); if (err) { setMsg(err); setEnv(false) }
  }
  return (
    <div>
      {url ? <><iframe src={url} title="Documento a firmar" className="pdfv" /><p><a href={url} target="_blank" rel="noopener noreferrer">Abrir el documento en otra pestaña</a></p></> : <div className="vacio">Cargando documento…</div>}
      {integro === false && <p className="msg">No se pudo verificar la integridad del documento (cambió o no se pudo leer). No es posible firmar. Pide una nueva solicitud.</p>}
      {integro && <>
        <p className="msg ok">✔ Documento verificado. Huella SHA-256: <small>{hash}</small></p>
        {externo && <div className="frm"><label>Nombre completo<input value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} /></label><label>Documento de identidad<input value={f.cedula} onChange={e => setF({ ...f, cedula: e.target.value })} /></label></div>}
        <b>Tu firma</b><Lienzo onData={setFirma} />
        <label className="chk"><input type="checkbox" checked={f.ok} onChange={e => setF({ ...f, ok: e.target.checked })} /> Declaro que leí el documento, que lo que firmo corresponde a su contenido y que manifiesto mi voluntad de firmarlo por medios electrónicos. Autorizo el registro de mi firma, fecha, hora y dirección IP como constancia.</label>
        {msg && <p className="msg">{msg}</p>}
        <div className="dact">{onRechazar && <button className="chip no" onClick={onRechazar}>No firmar</button>}<button className="btn" disabled={env} onClick={ir}>{env ? 'Firmando…' : 'Firmar documento'}</button></div></>}
    </div>
  )
}

function PubLayout({ children }) { return <div className="app"><header className="top"><Logo /></header><div className="panel pub narrow">{children}</div></div> }

function FirmaPublica({ token }) {
  const [paso, setPaso] = useState('pin'), [pin, setPin] = useState(''), [d, setD] = useState(null), [msg, setMsg] = useState('')
  const abrir = async () => {
    setMsg(''); const { data, error } = await supabase.rpc('abrir_firma', { p_token: token, p_pin: pin.trim() })
    if (error) return setMsg(error.message); if (data?.error) return setMsg(data.error)
    setD(data); setPaso(data.estado_firmante === 'pendiente' ? 'firmar' : 'listo')
  }
  const firmar = async x => { const { data, error } = await supabase.rpc('firmar_externo', { p_token: token, p_pin: pin.trim(), p_nombre: x.nombre, p_cedula: x.cedula, p_firma: x.firma, p_hash: x.hash, p_ua: navigator.userAgent }); const e = error?.message || data?.error; if (e) return e; setD({ ...d, estado_firmante: 'firmado' }); setPaso('listo') }
  const rechazar = async () => { const m = prompt('¿Por qué no firmas? (obligatorio)'); if (!m?.trim()) return; const { data, error } = await supabase.rpc('rechazar_firma', { p_token: token, p_pin: pin.trim(), p_motivo: m.trim() }); if (error || data?.error) return setMsg(error?.message || data.error); setD({ ...d, estado_firmante: 'rechazado' }); setPaso('listo') }
  return (
    <PubLayout>
      {paso === 'pin' && <><h2>Firma electrónica</h2><p className="muted">Ecogis Geomatic S.A.S. te envió un documento para firmar. Escribe el PIN de 6 números que te dieron por otro medio (llamada o mensaje).</p>
        <div className="lnk"><input inputMode="numeric" maxLength={6} placeholder="PIN de 6 números" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} /><button className="btn" onClick={abrir}>Continuar</button></div>{msg && <p className="msg">{msg}</p>}</>}
      {paso === 'firmar' && <><h2>{d.titulo}</h2>{d.mensaje && <p className="muted">{d.mensaje}</p>}<p className="muted">Archivo: {d.nombre_doc}</p>
        <PanelFirma path={d.path} hashEsperado={d.hash_documento} nombre0={d.firmante_nombre} externo onFirmar={firmar} onRechazar={rechazar} /></>}
      {paso === 'listo' && <div className="vacio"><b>{d.estado_firmante === 'firmado' ? '✔ Documento firmado' : d.estado_firmante === 'rechazado' ? 'Respondiste que no firmas' : ''}</b><p>Gracias. Ecogis Geomatic S.A.S. recibió tu respuesta.</p></div>}
    </PubLayout>
  )
}

function EncuestaPublica({ token }) {
  const [d, setD] = useState(undefined), [r, setR] = useState({ p1: 0, p2: 0, p3: 0, p4: 0 }), [com, setCom] = useState(''), [ok, setOk] = useState(false), [msg, setMsg] = useState('')
  useEffect(() => { supabase.rpc('get_encuesta', { p_token: token }).then(({ data }) => setD(data)) }, [token])
  const PREG = [['p1', 'Cumplimiento de los plazos acordados'], ['p2', 'Calidad técnica de los productos entregados'], ['p3', 'Atención y comunicación del equipo'], ['p4', '¿Nos recomendaría a otras entidades o empresas?']]
  const enviar = async () => {
    if (Object.values(r).some(v => !v)) return setMsg('Por favor califica las cuatro preguntas.')
    const { error } = await supabase.rpc('responder_encuesta', { p_token: token, p1: r.p1, p2: r.p2, p3: r.p3, p4: r.p4, p_comentario: com.trim() || null }); if (error) return setMsg(error.message); setOk(true)
  }
  if (d === undefined) return <PubLayout><p className="vacio">Cargando…</p></PubLayout>
  if (!d) return <PubLayout><div className="vacio"><b>Enlace no válido</b><p>Pide uno nuevo a Ecogis Geomatic.</p></div></PubLayout>
  if (d.respondida || ok) return <PubLayout><div className="vacio"><b>¡Gracias por tu opinión!</b><p>Nos ayuda a mejorar cada proyecto.</p></div></PubLayout>
  return (
    <PubLayout><h2>Encuesta de satisfacción</h2><p className="muted">Proyecto: <b>{d.proyecto}</b>{d.cliente ? ` · ${d.cliente}` : ''}. Califica de 1 (muy mal) a 5 (excelente). Toma menos de un minuto.</p>
      {PREG.map(([k, t]) => <div key={k} className="preg"><span>{t}</span><div>{[1, 2, 3, 4, 5].map(n => <button key={n} className={'est5' + (r[k] >= n ? ' on' : '')} aria-label={n + ' de 5'} onClick={() => setR({ ...r, [k]: n })}>★</button>)}</div></div>)}
      <label className="et">Comentarios (opcional)<input value={com} onChange={e => setCom(e.target.value)} /></label>
      {msg && <p className="msg">{msg}</p>}<button className="btn" onClick={enviar}>Enviar</button></PubLayout>
  )
}

function PqrsPublica() {
  const [f, setF] = useState({ tipo: 'peticion', nombre: '', documento: '', email: '', telefono: '', asunto: '', mensaje: '', acepta: false, hp: '' })
  const [res, setRes] = useState(null), [msg, setMsg] = useState(''), [cr, setCr] = useState(''), [ce, setCe] = useState(''), [est, setEst] = useState(null)
  const set = k => e => setF({ ...f, [k]: e.target.value })
  const enviar = async e => {
    e.preventDefault(); setMsg('')
    const { data, error } = await supabase.rpc('radicar_pqrs', { p_tipo: f.tipo, p_nombre: f.nombre, p_documento: f.documento || null, p_email: f.email, p_telefono: f.telefono || null, p_asunto: f.asunto, p_mensaje: f.mensaje, p_acepta: f.acepta, p_hp: f.hp })
    if (error) return setMsg(error.message); setRes(data)
  }
  const consultar = async () => { const { data, error } = await supabase.rpc('consultar_pqrs', { p_radicado: cr, p_email: ce }); setEst(error ? { error: error.message } : data || { error: 'No encontramos una solicitud con esos datos.' }) }
  return (
    <PubLayout>
      {res ? <div className="vacio"><b>✔ Solicitud recibida</b><p>Tu número de radicado es <b>{res.radicado}</b>. Guárdalo para consultar el estado.</p><p>Fecha límite de respuesta: {fecha(res.fecha_limite)}</p></div> : <>
        <h2>Peticiones, quejas, reclamos y sugerencias</h2><p className="muted">Ecogis Geomatic S.A.S. te responderá al correo que escribas.</p>
        <form onSubmit={enviar} className="auth-box" style={{ boxShadow: 'none', padding: 0, width: '100%' }}>
          <label className="et">Tipo<select value={f.tipo} onChange={set('tipo')}>{Object.entries(TIPO_Q).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <input placeholder="Nombre completo" required value={f.nombre} onChange={set('nombre')} /><input placeholder="Documento de identidad (opcional)" value={f.documento} onChange={set('documento')} />
          <input type="email" placeholder="Correo electrónico" required value={f.email} onChange={set('email')} /><input placeholder="Teléfono (opcional)" value={f.telefono} onChange={set('telefono')} />
          <input placeholder="Asunto" required value={f.asunto} onChange={set('asunto')} /><textarea rows={5} placeholder="Cuéntanos con detalle" required value={f.mensaje} onChange={set('mensaje')} style={{ font: 'inherit', padding: 10, border: '1px solid var(--line)', borderRadius: 8 }} />
          <input className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.hp} onChange={set('hp')} />
          <label className="chk"><input type="checkbox" checked={f.acepta} onChange={e => setF({ ...f, acepta: e.target.checked })} /> Autorizo a Ecogis Geomatic S.A.S. a tratar mis datos personales para gestionar esta solicitud, conforme a la Ley 1581 de 2012.</label>
          {msg && <p className="msg">{msg}</p>}<button className="btn">Enviar solicitud</button></form>
        <h3 className="gt">¿Ya radicaste una solicitud?</h3>
        <div className="lnk"><input placeholder="Radicado (ej. PQRS-2026-0001)" value={cr} onChange={e => setCr(e.target.value)} /><input type="email" placeholder="Tu correo" value={ce} onChange={e => setCe(e.target.value)} /><button className="btn ghost" onClick={consultar}>Consultar</button></div>
        {est && (est.error ? <p className="msg">{est.error}</p> : <div className="com"><b>{est.radicado}</b> · {TIPO_Q[est.tipo]} · {EST_Q[est.estado]}<small>Fecha límite: {fecha(est.fecha_limite)}</small>{est.respuesta && <p><b>Respuesta:</b> {est.respuesta}</p>}</div>)}</>}
    </PubLayout>
  )
}

function EncuestasProyecto({ p }) {
  const [l, setL] = useState([]), [ok, setOk] = useState('')
  const cargar = useCallback(async () => { const { data } = await supabase.from('encuestas').select('*').eq('proyecto_id', p.id).order('created_at', { ascending: false }); setL(data || []) }, [p.id])
  useEffect(() => { cargar() }, [cargar])
  const link = e => `${window.location.origin}/?encuesta=${e.token}`
  const msg = e => `Hola, para Ecogis Geomatic S.A.S. su opinión sobre el proyecto "${p.nombre}" es muy importante. Responder toma 1 minuto: ${link(e)}`
  return (
    <div className="coms"><b>Encuesta de satisfacción</b> <button className="btn ghost" onClick={async () => { await supabase.from('encuestas').insert({ proyecto_id: p.id, created_by: ACTOR.id }); registrar('Creó encuesta', p.nombre); cargar() }}>＋ Crear enlace</button>
      {l.map(e => <div key={e.id} className="lnk"><input readOnly value={link(e)} onFocus={x => x.target.select()} />
        {e.respondida_at ? <span className="sem verde">Respondida · {Math.round(((e.p1 + e.p2 + e.p3 + e.p4) / 4) * 20)} %</span> : <>
          <button className="btn" onClick={async () => { await navigator.clipboard.writeText(link(e)); setOk(e.id) }}>{ok === e.id ? '¡Copiado!' : 'Copiar'}</button>
          <a className="btn ghost" target="_blank" rel="noopener noreferrer" href={wa(msg(e))}>WhatsApp</a>
          <a className="btn ghost" href={'mailto:?subject=' + encodeURIComponent('Encuesta de satisfacción · Ecogis Geomatic') + '&body=' + encodeURIComponent(msg(e))}>Correo</a></>}
        {e.comentario && <small>“{e.comentario}”</small>}</div>)}
    </div>
  )
}

function Pqrs({ perfil }) {
  const [l, setL] = useState([]), [sel, setSel] = useState(null), [fe, setFe] = useState(''), [ok, setOk] = useState(false)
  const cargar = useCallback(async () => { const { data } = await supabase.from('pqrs').select('*').order('created_at', { ascending: false }); setL(data || []) }, [])
  useEffect(() => { cargar() }, [cargar])
  if (perfil.rol !== 'admin') return <div className="panel solo"><div className="vacio">Solo los administradores gestionan las PQRS porque contienen datos personales.</div></div>
  const pub = `${window.location.origin}/?pqrs=1`, v = l.filter(x => !fe || x.estado === fe)
  const guardar = async () => {
    const d = { estado: sel.estado, respuesta: sel.respuesta || null }; if (sel.estado === 'respondida' && !sel.respondida_at) d.respondida_at = new Date().toISOString()
    const { error } = await supabase.from('pqrs').update(d).eq('id', sel.id); if (error) return alert(error.message)
    registrar('Gestionó PQRS', `${sel.radicado} → ${EST_Q[sel.estado]}`); setSel(null); cargar()
  }
  return (
    <div className="panel solo"><div className="head"><div><h2>PQRS</h2><p className="muted">Peticiones, quejas, reclamos y sugerencias de clientes. Enlace público del formulario:</p></div>
      <select value={fe} onChange={e => setFe(e.target.value)}><option value="">Todas</option>{Object.entries(EST_Q).map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select></div>
      <div className="lnk"><input readOnly value={pub} onFocus={e => e.target.select()} /><button className="btn" onClick={async () => { await navigator.clipboard.writeText(pub); setOk(true) }}>{ok ? '¡Copiado!' : 'Copiar enlace'}</button></div>
      {!v.length ? <div className="vacio">No hay solicitudes</div> : <div className="tabla-w"><table><thead><tr><th>Radicado</th><th>Tipo</th><th>Solicitante</th><th>Asunto</th><th>Estado</th><th>Plazo</th></tr></thead>
        <tbody>{v.map(x => { const [c, t] = ['respondida', 'cerrada'].includes(x.estado) ? ['verde', '—'] : semaforo(x.fecha_limite); return <tr key={x.id} className="clic" onClick={() => setSel(x)}><td>{x.radicado}</td><td>{TIPO_Q[x.tipo]}</td><td>{x.nombre}</td><td>{x.asunto}</td><td>{EST_Q[x.estado]}</td><td><span className={'sem ' + c}>{t}</span></td></tr> })}</tbody></table></div>}
      {sel && <div className="modal" onClick={() => setSel(null)}><div className="dlg" onClick={e => e.stopPropagation()}>
        <h3>{sel.radicado} · {TIPO_Q[sel.tipo]}</h3><p><b>{sel.nombre}</b> · {sel.email}{sel.telefono ? ' · ' + sel.telefono : ''}{sel.documento ? ' · Doc. ' + sel.documento : ''}</p>
        <p><b>{sel.asunto}</b></p><p className="com">{sel.mensaje}</p><small>Recibida {new Date(sel.created_at).toLocaleString('es-CO')} · plazo {fecha(sel.fecha_limite)}</small>
        <div className="frm"><label>Estado<select value={sel.estado} onChange={e => setSel({ ...sel, estado: e.target.value })}>{Object.entries(EST_Q).map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select></label></div>
        <label className="et">Respuesta<textarea rows={4} value={sel.respuesta || ''} onChange={e => setSel({ ...sel, respuesta: e.target.value })} style={{ font: 'inherit', padding: 10, border: '1px solid var(--line)', borderRadius: 8 }} /></label>
        <div className="dact"><a className="btn ghost" href={`mailto:${sel.email}?subject=${encodeURIComponent('Respuesta a su solicitud ' + sel.radicado)}&body=${encodeURIComponent(sel.respuesta || '')}`}>Responder por correo</a><button className="btn ghost" onClick={() => setSel(null)}>Cancelar</button><button className="btn" onClick={guardar}>Guardar</button></div></div></div>}
    </div>
  )
}

function EnlacesFirma({ titulo, items, onClose }) {
  const [it, setIt] = useState(items), [ok, setOk] = useState('')
  const link = x => `${window.location.origin}/?firma=${x.token}`
  const msg = x => `Hola ${x.nombre}, Ecogis Geomatic S.A.S. te envía "${titulo}" para firma electrónica: ${link(x)}\nEl PIN de acceso te lo daré por otro medio.`
  const nuevo = async x => { const pin = pin6(); const { data, error } = await supabase.rpc('regenerar_firmante', { p_fid: x.id, p_pin: pin }); if (error) return alert(error.message); setIt(it.map(y => (y.id === x.id ? { ...y, token: data, pin } : y))) }
  return (
    <div className="modal" onClick={onClose}><div className="dlg" onClick={e => e.stopPropagation()}>
      <h3>Enlaces de firma</h3><p className="muted">Envía el <b>enlace</b> por un medio (WhatsApp o correo) y dile el <b>PIN</b> por otro (llamada o mensaje aparte). Así solo quien tiene ambos puede firmar. El PIN no se puede volver a ver: si se pierde, genera uno nuevo.</p>
      {it.length === 0 && <p className="vacio">No hay firmantes externos pendientes</p>}
      {it.map(x => <div key={x.id} className="com"><b>{x.nombre}</b>{x.pin && <div className="pinbig">PIN: {x.pin}</div>}
        <div className="lnk"><input readOnly value={link(x)} onFocus={e => e.target.select()} /><button className="btn" onClick={async () => { await navigator.clipboard.writeText(link(x)); setOk(x.id) }}>{ok === x.id ? '¡Copiado!' : 'Copiar'}</button>
          <a className="btn ghost" target="_blank" rel="noopener noreferrer" href={wa(msg(x))}>WhatsApp</a><a className="btn ghost" href={'mailto:?subject=' + encodeURIComponent('Firma de documento · Ecogis Geomatic') + '&body=' + encodeURIComponent(msg(x))}>Correo</a><button className="chip no" onClick={() => nuevo(x)}>Nuevo PIN y enlace</button></div></div>)}
      <div className="dact"><button className="btn" onClick={onClose}>Listo</button></div>
    </div></div>
  )
}

function NuevaFirma({ onClose, onCreada }) {
  const us = useUsuarios()
  const [doc, setDoc] = useState(null), [q, setQ] = useState(''), [res, setRes] = useState([]), [titulo, setTitulo] = useState(''), [mensaje, setMensaje] = useState('')
  const [fs, setFs] = useState([]), [ext, setExt] = useState({ nombre: '', email: '', cedula: '' }), [uid, setUid] = useState(''), [msg, setMsg] = useState(''), [env, setEnv] = useState(false)
  const buscar = async v => { setQ(v); if (v.trim().length < 2) return setRes([]); const { data } = await supabase.from('documents').select('id,nombre,path').is('deleted_at', null).ilike('nombre', `%${v.trim().replace(/[%,]/g, '')}%.pdf`).limit(8); setRes(data || []) }
  const addInt = () => { const u = us.find(x => x.id === uid); if (!u || fs.some(f => f.user_id === uid)) return; setFs([...fs, { tipo: 'interno', user_id: uid, nombre: u.nombre || u.email }]); setUid('') }
  const addExt = () => { if (!ext.nombre.trim()) return setMsg('Escribe el nombre de la persona externa.'); setMsg(''); setFs([...fs, { tipo: 'externo', nombre: ext.nombre.trim(), email: ext.email.trim(), cedula: ext.cedula.trim(), pin: pin6() }]); setExt({ nombre: '', email: '', cedula: '' }) }
  const crear = async () => {
    if (!doc) return setMsg('Elige el PDF a firmar.'); if (!fs.length) return setMsg('Agrega al menos un firmante.')
    setEnv(true); setMsg('')
    try {
      const hash = await sha256(await (await fetch(await signed(doc.path))).arrayBuffer())
      const { data, error } = await supabase.rpc('crear_solicitud_firma', { p_document: doc.id, p_titulo: titulo.trim() || doc.nombre, p_mensaje: mensaje.trim() || null, p_hash: hash, p_firmantes: fs })
      if (error) throw error
      registrar('Solicitó firmas', titulo.trim() || doc.nombre)
      const ext2 = data.firmantes.filter(x => x.tipo === 'externo').map(x => ({ ...x, pin: fs.find(f => f.tipo === 'externo' && f.nombre === x.nombre)?.pin }))
      onCreada(titulo.trim() || doc.nombre, ext2)
    } catch (e) { setMsg(e.message || 'No se pudo crear la solicitud'); setEnv(false) }
  }
  return (
    <div className="modal" onClick={onClose}><div className="dlg" onClick={e => e.stopPropagation()}>
      <h3>Nueva solicitud de firma</h3>
      <label className="et">Documento (solo PDF): {doc ? <b>{doc.nombre} <button className="x2" onClick={() => setDoc(null)}>✕</button></b> : 'ninguno'}<input placeholder="Busca el PDF por nombre…" value={q} onChange={e => buscar(e.target.value)} /></label>
      {res.map(r => <button key={r.id} className="nav small" onClick={() => { setDoc(r); setTitulo(r.nombre.replace(/\.pdf$/i, '')); setRes([]); setQ('') }}>{r.nombre}</button>)}
      <div className="frm"><label>Título<input value={titulo} onChange={e => setTitulo(e.target.value)} /></label><label>Mensaje para los firmantes<input value={mensaje} onChange={e => setMensaje(e.target.value)} /></label></div>
      <b>Firmantes</b>{fs.map((f, i) => <div key={i} className="apr">{f.tipo === 'interno' ? '👤 Ecogis' : '🌐 Externo'} · {f.nombre} <button className="x2" onClick={() => setFs(fs.filter((_, j) => j !== i))}>✕</button></div>)}
      <div className="lnk"><select value={uid} onChange={e => setUid(e.target.value)}><option value="">Persona de Ecogis…</option>{us.map(u => <option key={u.id} value={u.id}>{u.nombre || u.email}</option>)}</select><button className="btn ghost" onClick={addInt}>Agregar</button></div>
      <div className="lnk"><input placeholder="Externo: nombre" value={ext.nombre} onChange={e => setExt({ ...ext, nombre: e.target.value })} /><input placeholder="correo (opcional)" value={ext.email} onChange={e => setExt({ ...ext, email: e.target.value })} /><button className="btn ghost" onClick={addExt}>Agregar externo</button></div>
      {msg && <p className="msg">{msg}</p>}
      <div className="dact"><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn" disabled={env} onClick={crear}>{env ? 'Creando…' : 'Crear solicitud'}</button></div>
    </div></div>
  )
}

function Firmas({ perfil }) {
  const [ss, setSs] = useState([]), [fm, setFm] = useState([]), [docs, setDocs] = useState({}), [nuevo, setNuevo] = useState(false), [firmando, setFirmando] = useState(null), [enl, setEnl] = useState(null), [prev, setPrev] = useState(null), [msg, setMsg] = useState('')
  const cargar = useCallback(async () => {
    const { data: s } = await supabase.from('firmas_solicitudes').select('*').order('created_at', { ascending: false }); setSs(s || [])
    const { data: f } = await supabase.from('firmas_firmantes').select('id,solicitud_id,tipo,user_id,nombre,email,cedula,estado,firmado_at,ip,firma_png,hash_firmado,motivo'); setFm(f || [])
    const ids = [...new Set((s || []).flatMap(x => [x.document_id, x.doc_firmado_id]).filter(Boolean))]
    if (ids.length) { const { data: d } = await supabase.from('documents').select('*').in('id', ids); setDocs(Object.fromEntries((d || []).map(x => [x.id, x]))) }
  }, [])
  useEffect(() => { cargar() }, [cargar])
  const mias = fm.filter(f => f.user_id === perfil.id && f.estado === 'pendiente' && ss.find(x => x.id === f.solicitud_id)?.estado === 'abierta')
  const verEnlaces = async s => { const { data, error } = await supabase.rpc('ver_enlaces_firma', { p_sid: s.id }); if (error) return setMsg(error.message); setEnl({ titulo: s.titulo, items: (data || []).filter(x => x.estado === 'pendiente') }) }
  const cancelar = async s => { if (!confirm('¿Cancelar esta solicitud? Los enlaces dejarán de funcionar.')) return; await supabase.from('firmas_solicitudes').update({ estado: 'cancelada' }).eq('id', s.id); registrar('Canceló solicitud de firma', s.titulo); cargar() }
  const generar = async s => {
    setMsg('Generando PDF firmado…')
    try {
      await cargarLib('https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js', 'PDFLib')
      const { PDFDocument, StandardFonts, rgb } = window.PDFLib, d = docs[s.document_id]
      const bytes = await (await fetch(await signed(d.path))).arrayBuffer()
      if ((await sha256(bytes)) !== s.hash_documento) return setMsg('El archivo original cambió; no se puede generar el PDF firmado.')
      const pdf = await PDFDocument.load(bytes), font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold)
      const wa1 = x => String(x ?? '').replace(/[^\x20-\x7E\xA0-\xFF]/g, '?')
      let page = pdf.addPage([595, 842]), y = 800
      const t = (txt, o = {}) => { if (y < 70) { page = pdf.addPage([595, 842]); y = 800 } page.drawText(wa1(txt), { x: 50, y, size: o.size || 10, font: o.bold ? bold : font, color: rgb(0.2, 0.28, 0.27), maxWidth: 495 }); y -= o.dy || 15 }
      t('CERTIFICADO DE FIRMAS ELECTRONICAS', { size: 16, bold: true, dy: 26 }); t('Ecogis Geomatic S.A.S. - Geoteca Ecogis', { dy: 20 })
      t('Documento: ' + d.nombre, { bold: true }); t('Titulo: ' + s.titulo); t('Huella SHA-256 del documento original:'); t(s.hash_documento, { size: 8, dy: 22 })
      for (const f of fm.filter(x => x.solicitud_id === s.id)) {
        if (y < 190) { page = pdf.addPage([595, 842]); y = 800 }
        t(`${f.nombre} (${f.tipo === 'interno' ? 'Ecogis, cuenta verificada' : 'externo, enlace + PIN'})`, { bold: true }); if (f.cedula) t('Documento de identidad: ' + f.cedula); if (f.email) t('Correo: ' + f.email)
        t(`Estado: ${f.estado === 'firmado' ? 'FIRMADO' : f.estado.toUpperCase()} - ${f.firmado_at ? new Date(f.firmado_at).toLocaleString('es-CO') : ''}`); t('IP: ' + (f.ip || 'no disponible'), { dy: 8 })
        if (f.firma_png) { const img = await pdf.embedPng(f.firma_png); const w = 150, h = (img.height / img.width) * w; y -= h; page.drawImage(img, { x: 50, y, width: w, height: h }); y -= 6 }
        y -= 14
      }
      t('Este certificado deja constancia de la voluntad de firmar por medios electronicos. No equivale a una firma digital emitida por una entidad de certificacion.', { size: 8 })
      const out = await pdf.save(), base = d.nombre.replace(/\.pdf$/i, ''), path = `${d.folder_id || 'raiz'}/${Date.now()}-${(base + '_firmado').replace(/[^\w.\-]/g, '_')}.pdf`
      const up = await supabase.storage.from('documentos').upload(path, new Blob([out], { type: 'application/pdf' })); if (up.error) throw up.error
      const { data: nd, error } = await supabase.from('documents').insert({ folder_id: d.folder_id, nombre: base + '_firmado.pdf', path, tamano: out.length, tipo: 'application/pdf', categoria: d.categoria, estado: 'vigente', uploaded_by: perfil.id, uploaded_by_nombre: perfil.nombre || perfil.email }).select().single(); if (error) throw error
      await supabase.from('firmas_solicitudes').update({ doc_firmado_id: nd.id }).eq('id', s.id); registrar('Generó PDF firmado', base); setMsg(''); cargar()
    } catch (e) { setMsg('No se pudo generar el PDF firmado: ' + (e.message || e)) }
  }
  const chip = e => <span className={'est ' + (e === 'firmado' || e === 'completa' ? '' : e === 'pendiente' || e === 'abierta' ? 'revision' : 'borrador')}>{e === 'firmado' ? 'Firmado' : e === 'completa' ? 'Completa' : e === 'abierta' ? 'Abierta' : e === 'pendiente' ? 'Pendiente' : e === 'rechazado' ? 'Rechazó' : 'Cancelada'}</span>
  return (
    <div className="panel solo">
      <div className="head"><div><h2>Firmas electrónicas</h2><p className="muted">Firma documentos PDF y pídele firma a clientes y empleados.</p></div><button className="btn" onClick={() => setNuevo(true)}>＋ Solicitar firmas</button></div>
      {msg && <p className="msg ok">{msg}</p>}
      <h3 className="gt">Pendientes por firmar ({mias.length})</h3>
      {!mias.length ? <div className="vacio">No tienes documentos por firmar</div> : mias.map(f => { const s = ss.find(x => x.id === f.solicitud_id); return <div key={f.id} className="lnk"><span><b>{s?.titulo}</b></span><button className="btn" onClick={() => setFirmando({ f, s })}>Revisar y firmar</button></div> })}
      <h3 className="gt">Solicitudes</h3>
      {!ss.length ? <div className="vacio">Aún no hay solicitudes de firma</div> : ss.map(s => <div key={s.id} className="com"><b>{s.titulo}</b> {chip(s.estado)} <small>{docs[s.document_id]?.nombre} · {fecha(s.created_at)}</small>
        {fm.filter(f => f.solicitud_id === s.id).map(f => <div key={f.id} className="apr">{f.tipo === 'interno' ? '👤' : '🌐'} {f.nombre} — {chip(f.estado)}{f.firmado_at && ` · ${new Date(f.firmado_at).toLocaleString('es-CO')}`}{f.motivo && <small>Motivo: {f.motivo}</small>}</div>)}
        <div className="lnk">{s.estado === 'abierta' && (s.creada_por === perfil.id || perfil.rol === 'admin') && <><button className="btn ghost" onClick={() => verEnlaces(s)}>Enlaces para externos</button><button className="chip no" onClick={() => cancelar(s)}>Cancelar</button></>}
          {s.estado === 'completa' && !s.doc_firmado_id && (s.creada_por === perfil.id || perfil.rol === 'admin') && <button className="btn" onClick={() => generar(s)}>Generar PDF firmado</button>}
          {s.doc_firmado_id && docs[s.doc_firmado_id] && <button className="btn ghost" onClick={() => setPrev(docs[s.doc_firmado_id])}>Ver PDF firmado</button>}</div></div>)}
      {nuevo && <NuevaFirma onClose={() => setNuevo(false)} onCreada={(titulo, items) => { setNuevo(false); cargar(); if (items.length) setEnl({ titulo, items }) }} />}
      {enl && <EnlacesFirma titulo={enl.titulo} items={enl.items} onClose={() => setEnl(null)} />}
      {prev && <Preview d={prev} onClose={() => setPrev(null)} />}
      {firmando && <div className="modal" onClick={() => setFirmando(null)}><div className="pv" onClick={e => e.stopPropagation()}><div className="pvh"><b>{firmando.s?.titulo}</b><button className="btn ghost" onClick={() => setFirmando(null)}>Cerrar</button></div>
        <div className="pvb" style={{ display: 'block', overflow: 'auto', padding: 16 }}><PanelFirma path={docs[firmando.s.document_id]?.path} hashEsperado={firmando.s.hash_documento} onFirmar={async x => { const { error } = await supabase.rpc('firmar_interno', { p_firmante: firmando.f.id, p_firma: x.firma, p_hash: x.hash, p_ua: navigator.userAgent }); if (error) return error.message; registrar('Firmó electrónicamente', firmando.s.titulo); setFirmando(null); cargar() }} /></div></div></div>}
    </div>
  )
}

function Drive({ perfil, q, inicio, irVista }) {
  const [folders, setFolders] = useState([]), [docs, setDocs] = useState([]), [cur, setCur] = useState(null), [idx, setIdx] = useState(0)
  const [vista, setVista] = useState('grid'), [ft, setFt] = useState(''), [menu, setMenu] = useState(null), [nuevo, setNuevo] = useState(false)
  const [prev, setPrev] = useState(null), [share, setShare] = useState(null), [pend, setPend] = useState(null)
  const [over, setOver] = useState(false), [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [rec, setRec] = useState(false), [uso, setUso] = useState(0), [perm, setPerm] = useState(null), [prog, setProg] = useState(null), [ficha, setFicha] = useState(null), [favs, setFavs] = useState(new Set())
  const drag = useRef(null), inp = useRef(), mx = useRef(0), nvInp = useRef(), nvDoc = useRef(null)

  const cargar = useCallback(async () => {
    const { data: f } = await supabase.from('folders').select('*').is('deleted_at', null).order('nombre'); setFolders(f || [])
    const { data: fv } = await supabase.from('favoritos').select('item_type,item_id'); setFavs(new Set((fv || []).map(x => x.item_type + x.item_id)))
    let qq = supabase.from('documents').select('*').order('nombre')
    qq = q ? qq.or(`nombre.ilike.%${q.replace(/[,(){}"]/g, '')}%,etiquetas.cs.{${q.toLowerCase().replace(/[,(){}"\s]/g, '')}}`) : rec ? supabase.from('documents').select('*').order('created_at', { ascending: false }).limit(30) : cur ? qq.eq('folder_id', cur) : qq.is('folder_id', null)
    const { data: d } = await qq.is('deleted_at', null); setDocs(d || [])
    const { data: u } = await supabase.from('documents').select('tamano'); setUso((u || []).reduce((a, x) => a + (x.tamano || 0), 0))
  }, [cur, q, rec])
  useEffect(() => { cargar() }, [cargar])
  useEffect(() => {
    window.history.replaceState({ f: null, i: 0 }, '')
    const p = e => { setRec(false); setCur(e.state?.f ?? null); setIdx(e.state?.i ?? 0) }
    const c = () => { setMenu(null); setNuevo(false) }
    window.addEventListener('popstate', p); window.addEventListener('click', c)
    return () => { window.removeEventListener('popstate', p); window.removeEventListener('click', c) }
  }, [])
  const ir = id => { const i = (window.history.state?.i ?? 0) + 1; mx.current = i; window.history.pushState({ f: id, i }, ''); setRec(false); setCur(id); setIdx(i) }

  useEffect(() => { if (inicio) ir(inicio.id) }, [inicio])
  const descend = id => [id, ...folders.filter(f => f.parent_id === id).flatMap(f => descend(f.id))]
  const actual = folders.find(x => x.id === cur)
  const ruta = []; for (let f = actual; f; f = folders.find(x => x.id === f.parent_id)) ruta.unshift(f)
  const subs = rec && !q ? [] : q ? folders.filter(f => f.nombre.toLowerCase().includes(q.toLowerCase())) : folders.filter(f => f.parent_id === cur)
  const lista = docs.filter(d => !ft || d.categoria === ft)

  const crearCarpeta = async () => {
    const nombre = prompt('Nombre de la carpeta o proyecto:'); if (!nombre?.trim()) return
    const { error } = await supabase.from('folders').insert({ nombre: nombre.trim(), parent_id: cur, created_by: perfil.id })
    if (error) setMsg(error.message); cargar()
  }
  const crearProyecto = async () => {
    const cliente = prompt('Cliente (ej. Alcaldia Valledupar):'); if (!cliente?.trim()) return
    const nombre = prompt('Nombre corto del proyecto (ej. Catastro Rural):'); if (!nombre?.trim()) return
    const { data, error } = await crearProyectoCompleto(cur, folders.filter(f => f.parent_id === cur).map(f => f.nombre), perfil, cliente, nombre)
    if (error) return setMsg(error.message)
    await cargar(); ir(data.id)
  }
  const alternarFav = async (t, x) => {
    if (favs.has(t + x.id)) await supabase.from('favoritos').delete().eq('item_type', t).eq('item_id', x.id)
    else await supabase.from('favoritos').insert({ item_type: t, item_id: x.id, user_id: perfil.id })
    cargar()
  }
  const enviar = async (file, path, nombre) => {
    setProg({ nombre, pct: 0 })
    try {
      if (file.size > 6 * 1024 * 1024) return await subirGrande(file, path, pct => setProg({ nombre, pct }))
      const { error } = await supabase.storage.from('documentos').upload(path, file); return error
    } catch (e) { return { message: 'No se pudo subir: ' + (e.message || e) } } finally { setProg(null) }
  }
  const nuevaVersion = async file => {
    const d = nvDoc.current; if (!file || !d) return
    const pt = (d.version || '1.0').split('.'); pt[pt.length - 1] = String((parseInt(pt[pt.length - 1]) || 0) + 1)
    const ver = prompt('Número de la nueva versión:', pt.join('.')); if (!ver?.trim()) return
    setBusy(true); setMsg('')
    const path = `${d.folder_id || 'raiz'}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`
    const ue = await enviar(file, path, file.name); if (ue) { setBusy(false); return setMsg(ue.message) }
    await supabase.from('document_versions').insert({ document_id: d.id, version: d.version, path: d.path, tamano: d.tamano, nombre: d.nombre, created_by: perfil.id })
    const { error } = await supabase.from('documents').update({ path, tamano: file.size, tipo: file.type, version: ver.trim() }).eq('id', d.id)
    if (error) setMsg(error.message); else registrar('Subió nueva versión', `${d.nombre} → v${ver.trim()}`)
    setBusy(false); cargar()
  }
  const bajarZip = async f => {
    setMsg('Preparando ZIP…')
    const ids = descend(f.id)
    const { data } = await supabase.from('documents').select('*').in('folder_id', ids).is('deleted_at', null)
    if (!data?.length) return setMsg('La carpeta no tiene archivos.')
    const total = data.reduce((a, d) => a + (d.tamano || 0), 0)
    if (total > 500 * 1048576 && !confirm(`El ZIP pesa ${fmt(total)} y puede ser lento o fallar en el navegador. ¿Continuar?`)) return setMsg('')
    try {
      await cargarLib('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', 'JSZip')
      const zip = new window.JSZip(); let n = 0
      const ruta = id => { const r = []; for (let x = folders.find(y => y.id === id); x && x.id !== f.parent_id; x = folders.find(y => y.id === x.parent_id)) r.unshift(x.nombre); return r.join('/') }
      for (const d of data) {
        const u = await signed(d.path); if (!u) continue
        zip.file(`${ruta(d.folder_id)}/${d.nombre}`, await (await fetch(u)).blob()); setMsg(`Armando ZIP… ${++n}/${data.length}`)
      }
      const out = await zip.generateAsync({ type: 'blob' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(out); a.download = `${f.nombre}.zip`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60000)
      registrar('Descargó carpeta en ZIP', f.nombre); setMsg('')
    } catch { setMsg('No se pudo armar el ZIP. Prueba con una carpeta más pequeña.') }
  }
  const exportarMaestro = async () => {
    setMsg('Generando listado maestro…')
    const { data } = await supabase.from('documents').select('*').is('deleted_at', null).order('nombre')
    try { await cargarLib('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', 'XLSX') } catch { return setMsg('No se pudo cargar el generador de Excel.') }
    const ruta = id => { const r = []; for (let x = folders.find(y => y.id === id); x; x = folders.find(y => y.id === x.parent_id)) r.unshift(x.nombre); return r.join(' / ') || 'Raíz' }
    const filas = (data || []).map(d => ({ 'Código': d.codigo || '', Documento: d.nombre, Tipo: d.categoria || '', 'Versión': d.version, Estado: ESTADOS[d.estado] || d.estado, Carpeta: ruta(d.folder_id), 'Subido por': d.uploaded_by_nombre || '', Fecha: fecha(d.created_at), 'Tamaño (KB)': Math.ceil((d.tamano || 0) / 1024) }))
    const wb = window.XLSX.utils.book_new(); window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(filas), 'Listado maestro')
    window.XLSX.writeFile(wb, `Listado-Maestro_${new Date().toISOString().slice(0, 10).replaceAll('-', '')}.xlsx`)
    registrar('Exportó listado maestro', `${filas.length} documentos`); setMsg('')
  }
  const preparar = files => files.length && setPend(files.map(file => ({ file, tipo: detectar(file.name) })))
  const subir = async arr => {
    setPend(null); setBusy(true); setMsg('')
    for (const { file, tipo } of arr) {
      const path = `${cur || 'raiz'}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`
      const ue = await enviar(file, path, file.name); if (ue) { setMsg(ue.message); continue }
      const { error } = await supabase.from('documents').insert({ folder_id: cur, nombre: file.name, path, tamano: file.size, tipo: file.type, categoria: tipo, uploaded_by: perfil.id, uploaded_by_nombre: perfil.nombre || perfil.email })
      if (error) setMsg(error.message); else registrar('Subió', file.name)
    }
    setBusy(false); cargar()
  }
  const descargar = async d => { const u = await signed(d.path, d.nombre); if (u) { registrar('Descargó', d.nombre); window.open(u, '_blank') } }
  const renombrar = async (t, x) => { const n = prompt('Nuevo nombre:', x.nombre); if (!n?.trim()) return; await supabase.from(t === 'f' ? 'folders' : 'documents').update({ nombre: n.trim() }).eq('id', x.id); cargar() }
  const colorear = async (f, c) => { await supabase.from('folders').update({ color: c }).eq('id', f.id); setMenu(null); cargar() }
  const borrar = async (t, x) => {
    if (!confirm(`¿Enviar "${x.nombre}" a la papelera?${t === 'f' ? ' Se incluye todo su contenido.' : ''} Podrás restaurarlo.`)) return
    const ts = new Date().toISOString(); setMsg('')
    if (t === 'd') { const { error } = await supabase.from('documents').update({ deleted_at: ts }).eq('id', x.id); if (error) return setMsg(error.message) }
    else {
      const ids = descend(x.id)
      const { error } = await supabase.from('folders').update({ deleted_at: ts }).in('id', ids).is('deleted_at', null); if (error) return setMsg(error.message)
      await supabase.from('documents').update({ deleted_at: ts }).in('folder_id', ids).is('deleted_at', null)
      if (ids.includes(cur)) ir(x.parent_id)
    }
    registrar('Envió a la papelera', x.nombre); cargar()
  }
  const mover = async dest => {
    const d = drag.current; drag.current = null; if (!d) return
    if (d.tipo === 'f') { if (d.id === dest || descend(d.id).includes(dest)) return; await supabase.from('folders').update({ parent_id: dest }).eq('id', d.id) }
    else await supabase.from('documents').update({ folder_id: dest }).eq('id', d.id)
    cargar()
  }
  const dnd = id => ({ onDragOver: e => drag.current && e.preventDefault(), onDrop: e => { e.stopPropagation(); mover(id) } })
  const dz = {
    onDragOver: e => { if (!drag.current && e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true) } }, onDragLeave: () => setOver(false),
    onDrop: e => { setOver(false); if (e.dataTransfer.files.length) { e.preventDefault(); preparar([...e.dataTransfer.files]) } }
  }
  const item = (t, x) => {
    const f = t === 'f'
    return (
      <div key={t + x.id} className="it" draggable onDragStart={e => { drag.current = { tipo: t, id: x.id }; e.dataTransfer.effectAllowed = 'move' }} onDragEnd={() => { drag.current = null }}
        onClick={() => (f ? ir(x.id) : setPrev(x))} onContextMenu={e => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, t, i: x }) }} {...(f ? dnd(x.id) : {})}>
        <div className="ic">{f ? <FolderIcon c={x.color} /> : <FileIcon n={x.nombre} />}</div>
        <div className="nm" title={x.nombre}>{x.nombre}{x.restringida ? ' 🔒' : ''}{favs.has(t + x.id) ? ' ⭐' : ''}{!f && x.estado && x.estado !== 'vigente' && <span className={'est ' + x.estado}>{ESTADOS[x.estado]}</span>}{!f && (x.etiquetas || []).slice(0, 2).map(g => <span key={g} className="tg">#{g}</span>)}</div>
        <div className="meta">{f ? 'Carpeta' : x.categoria || '—'}</div><div className="meta">{f ? '' : fmt(x.tamano)}</div><div className="meta">{f ? '' : x.uploaded_by_nombre}</div><div className="meta">{fecha(x.created_at)}</div>
        <button className="dots" aria-label="Más opciones" onClick={e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.left - 140, y: r.bottom, t, i: x }) }}>⋮</button>
      </div>
    )
  }

  return (
    <div className="drive">
      <aside className="side">
        <div style={{ position: 'relative' }}>
          <button className="nuevo" onClick={e => { e.stopPropagation(); setNuevo(!nuevo) }}><span>＋</span> Nuevo</button>
          {nuevo && <div className="pop" onClick={e => e.stopPropagation()}>
            <button onClick={() => { setNuevo(false); crearProyecto() }}>Nuevo proyecto (estructura estándar)</button>
            <button onClick={() => { setNuevo(false); crearCarpeta() }}>Nueva carpeta</button>
            <button onClick={() => { setNuevo(false); inp.current.click() }}>Subir archivos</button></div>}
          <input ref={inp} type="file" multiple hidden onChange={e => { preparar([...e.target.files]); e.target.value = '' }} />
          <input ref={nvInp} type="file" hidden onChange={e => { nuevaVersion(e.target.files[0]); e.target.value = '' }} />
        </div>
        <button className={'nav' + (!cur && !q && !rec ? ' on' : '')} onClick={() => ir(null)} {...dnd(null)}>Unidad de Ecogis</button>
        <button className={'nav' + (rec && !q ? ' on' : '')} onClick={() => setRec(true)}>Recientes</button>
        <button className="nav" onClick={() => irVista('fav')}>⭐ Destacados</button>
        <div className="sub">Proyectos</div>
        {folders.filter(f => !f.parent_id).map(f => <button key={f.id} className={'nav small' + (ruta[0]?.id === f.id ? ' on' : '')} onClick={() => ir(f.id)} {...dnd(f.id)}><i style={{ background: f.color || '#374845' }} />{f.nombre}</button>)}
        {perfil.rol === 'admin' && <button className="nav small" onClick={exportarMaestro}>⬇ Listado maestro (Excel)</button>}
        <div className="uso"><div className="barra"><i style={{ width: Math.min(100, (uso / 1073741824) * 100) + '%' }} /></div><small>{uso ? fmt(uso) : '0 KB'} usados de 1 GB</small></div>
      </aside>
      <main className={'panel' + (over ? ' over' : '')} {...dz}>
        <div className="bar">
          <div className="navb">
            <button disabled={idx < 1} onClick={() => window.history.back()} title="Atrás">←</button>
            <button disabled={idx >= mx.current} onClick={() => window.history.forward()} title="Adelante">→</button>
            <button disabled={!cur} onClick={() => ir(actual?.parent_id ?? null)} title="Subir un nivel">↑</button>
          </div>
          <div className="crumbs">
            {rec && !q ? <b>Archivos recientes</b> : q ? <b>Resultados para “{q}”</b> : <><button onClick={() => ir(null)} {...dnd(null)}>Unidad de Ecogis</button>
              {ruta.map(f => <span key={f.id}> › <button onClick={() => ir(f.id)} {...dnd(f.id)}>{f.nombre}</button></span>)}</>}
          </div>
          <select className="ftipo" value={ft} onChange={e => setFt(e.target.value)}><option value="">Todos los tipos</option>{TIPOS.map(t => <option key={t}>{t}</option>)}</select>
          <div className="seg"><button className={vista === 'list' ? 'on' : ''} onClick={() => setVista('list')} title="Lista">☰</button><button className={vista === 'grid' ? 'on' : ''} onClick={() => setVista('grid')} title="Cuadrícula">▦</button></div>
        </div>
        {busy && <p className="msg ok">{prog ? `Subiendo ${prog.nombre}… ${prog.pct}%` : 'Subiendo archivos…'}</p>}{msg && <p className="msg">{msg}</p>}
        {vista === 'list' && subs.length + lista.length > 0 && <div className="it head"><div /><div>Nombre</div><div>Tipo</div><div>Tamaño</div><div>Subido por</div><div>Fecha</div><div /></div>}
        <div className={vista}>{subs.map(f => item('f', f))}{lista.map(d => item('d', d))}</div>
        {subs.length + lista.length === 0 && <div className="vacio"><b>{q ? 'Sin resultados' : 'Aquí no hay nada todavía'}</b><p>{q ? 'Prueba con otro nombre.' : 'Arrastra archivos o usa el botón Nuevo.'}</p></div>}
        {over && <div className="drop">Suelta los archivos para subirlos</div>}
      </main>
      {menu && <div className="ctx" style={{ left: Math.min(menu.x, window.innerWidth - 200), top: Math.min(menu.y, window.innerHeight - 260) }} onClick={e => e.stopPropagation()}>
        <button onClick={() => { menu.t === 'f' ? ir(menu.i.id) : setPrev(menu.i); setMenu(null) }}>Abrir</button>
        <button onClick={() => { setShare(menu); setMenu(null) }}>Compartir</button>
        <button onClick={() => { alternarFav(menu.t, menu.i); setMenu(null) }}>{favs.has(menu.t + menu.i.id) ? 'Quitar de destacados' : 'Destacar ⭐'}</button>
        {menu.t === 'f' && perfil.rol === 'admin' && <button onClick={() => { setPerm(menu.i); setMenu(null) }}>Permisos y privacidad</button>}
        {menu.t === 'd' && <button onClick={() => { descargar(menu.i); setMenu(null) }}>Descargar</button>}
        {menu.t === 'd' && <button onClick={() => { setFicha(menu.i); setMenu(null) }}>Propiedades y versiones</button>}
        {menu.t === 'd' && <button onClick={() => { nvDoc.current = menu.i; nvInp.current.click(); setMenu(null) }}>Subir nueva versión</button>}
        {menu.t === 'f' && <button onClick={() => { bajarZip(menu.i); setMenu(null) }}>Descargar como ZIP</button>}
        <button onClick={() => { renombrar(menu.t, menu.i); setMenu(null) }}>Cambiar nombre</button>
        {menu.t === 'f' && <div className="sw">{COLORES.map(c => <button key={c} aria-label={'Color ' + c} style={{ background: c }} onClick={() => colorear(menu.i, c)} />)}</div>}
        <button className="rojo" onClick={() => { borrar(menu.t, menu.i); setMenu(null) }}>Enviar a la papelera</button>
      </div>}
      {prev && <Preview d={prev} onClose={() => setPrev(null)} />}
      {share && <Compartir t={share.t} i={share.i} perfil={perfil} onClose={() => setShare(null)} />}
      {perm && <Permisos f={perm} onClose={() => setPerm(null)} onChange={cargar} />}
      {ficha && <Ficha d={ficha} onClose={() => setFicha(null)} onChange={cargar} />}
      {pend && <div className="modal" onClick={() => setPend(null)}><div className="dlg" onClick={e => e.stopPropagation()}>
        <h3>Subir {pend.length} archivo{pend.length > 1 ? 's' : ''}</h3><p className="muted">El formato se reconoce solo. Cambia el tipo de documento si hace falta.</p>
        <div className="plist">{pend.map((p, k) => <div key={k} className="prow"><FileIcon n={p.file.name} /><div className="nm">{p.file.name}<small>{ext(p.file.name).toUpperCase() || 'Archivo'} · {fmt(p.file.size)}</small></div>
          <select value={p.tipo} onChange={e => setPend(pend.map((x, j) => (j === k ? { ...x, tipo: e.target.value } : x)))}>{TIPOS.map(t => <option key={t}>{t}</option>)}</select></div>)}</div>
        <div className="dact"><button className="btn ghost" onClick={() => setPend(null)}>Cancelar</button><button className="btn" onClick={() => subir(pend)}>Subir</button></div>
      </div></div>}
    </div>
  )
}

function Usuarios({ perfil }) {
  const [users, setUsers] = useState([])
  const cargar = useCallback(async () => { const { data } = await supabase.from('profiles').select('*').order('created_at'); setUsers(data || []) }, [])
  useEffect(() => { cargar() }, [cargar])
  const cambiar = async (id, c) => { await supabase.from('profiles').update(c).eq('id', id); cargar() }
  return (
    <div className="panel solo"><h2>Usuarios</h2><p className="muted">Quienes se registran quedan inactivos hasta que los actives aquí.</p>
      <table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Acceso</th></tr></thead><tbody>{users.map(u => <tr key={u.id}><td>{u.nombre || '—'}</td><td>{u.email}</td>
        <td><select disabled={u.id === perfil.id} value={u.rol} onChange={e => cambiar(u.id, { rol: e.target.value })}><option value="miembro">Miembro</option><option value="admin">Administrador</option></select></td>
        <td><button className={'chip ' + (u.activo ? 'si' : 'no')} disabled={u.id === perfil.id} onClick={() => cambiar(u.id, { activo: !u.activo })}>{u.activo ? 'Activo' : 'Inactivo · activar'}</button></td></tr>)}</tbody></table></div>
  )
}

function MiCuenta({ perfil, onNombre }) {
  const [n, setN] = useState(null)
  useEffect(() => { supabase.from('documents').select('id', { count: 'exact', head: true }).eq('uploaded_by', perfil.id).then(({ count }) => setN(count)) }, [perfil.id])
  const cambiar = async () => {
    const v = prompt('Tu nombre:', perfil.nombre || ''); if (!v?.trim()) return
    await supabase.rpc('actualizar_mi_nombre', { p_nombre: v.trim() }); onNombre(v.trim())
  }
  return (
    <div className="acct" onClick={e => e.stopPropagation()}>
      <div className="big">{(perfil.nombre || perfil.email || '?')[0].toUpperCase()}</div>
      <b>{perfil.nombre || 'Sin nombre'}</b><span className="muted">{perfil.email}</span>
      <div className="kv"><span>Rol</span><b>{perfil.rol === 'admin' ? 'Administrador' : 'Miembro'}</b></div>
      <div className="kv"><span>Archivos subidos</span><b>{n ?? '…'}</b></div>
      <div className="kv"><span>Miembro desde</span><b>{fecha(perfil.created_at)}</b></div>
      <button className="btn ghost" onClick={cambiar}>Editar mi nombre</button>
      <button className="btn" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
    </div>
  )
}

function Accesos({ perfil }) {
  const [l, setL] = useState([])
  const cargar = useCallback(async () => { const { data } = await supabase.from('links').select('*').order('orden'); setL(data || []) }, [])
  useEffect(() => { cargar() }, [cargar])
  const admin = perfil.rol === 'admin'
  const agregar = async () => {
    const nombre = prompt('Nombre del acceso (ej. Página de la empresa):'); if (!nombre?.trim()) return
    let url = prompt('Dirección web (https://…):'); if (!url?.trim()) return
    if (!/^https?:\/\//i.test(url.trim())) url = 'https://' + url.trim()
    const grupo = prompt('Grupo (ej. Empresa, Contratación, Impuestos DIAN):', 'Empresa') || 'Otros'
    await supabase.from('links').insert({ nombre: nombre.trim(), url: url.trim(), grupo: grupo.trim(), orden: 100 + l.length }); cargar()
  }
  const quitar = async x => { if (confirm(`¿Quitar "${x.nombre}"?`)) { await supabase.from('links').delete().eq('id', x.id); cargar() } }
  const grupos = [...new Set(l.map(x => x.grupo))]
  const pal = ['#2a2aff', '#00a6cc', '#374845', '#8e24aa', '#e37400', '#2e7d32', '#c2185b']
  return (
    <div className="panel solo">
      <div className="head"><div><h2>Accesos rápidos</h2><p className="muted">Las páginas y trámites que usa Ecogis Geomatic, en un solo lugar.</p></div>
        {admin && <button className="btn" onClick={agregar}>＋ Agregar acceso</button>}</div>
      {grupos.map((g, k) => <div key={g}><h3 className="gt">{g}</h3>
        <div className="links">{l.filter(x => x.grupo === g).map(x =>
          <a key={x.id} className="lk" href={x.url} target="_blank" rel="noopener noreferrer">
            <span className="lki" style={{ background: pal[k % pal.length] }}>{x.nombre[0]}</span>
            <span><b>{x.nombre}</b><small>{x.descripcion}</small></span>
            {admin && <button className="x" title="Quitar" onClick={e => { e.preventDefault(); quitar(x) }}>✕</button>}
          </a>)}</div></div>)}
    </div>
  )
}

function Principal() {
  const [sesion, setSesion] = useState(undefined), [perfil, setPerfil] = useState(null), [vista, setVista] = useState('docs'), [q, setQ] = useState(''), [cuenta, setCuenta] = useState(false), [recuperar, setRecuperar] = useState(false), [mas, setMas] = useState(false), [inicio, setInicio] = useState(null), [pend, setPend] = useState(0), [pendF, setPendF] = useState(0)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSesion(data.session))
    const { data: s } = supabase.auth.onAuthStateChange((ev, ses) => { if (ev === 'PASSWORD_RECOVERY') setRecuperar(true); setSesion(ses) }); return () => s.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (!sesion) return setPerfil(null)
    supabase.from('profiles').select('*').eq('id', sesion.user.id).single().then(({ data }) => setPerfil(data))
  }, [sesion])
  useEffect(() => { const c = () => { setCuenta(false); setMas(false) }; window.addEventListener('click', c); return () => window.removeEventListener('click', c) }, [])
  useEffect(() => { ACTOR = perfil }, [perfil])
  const abrir = id => { setInicio({ id }); setVista('docs') }
  useEffect(() => { if (!perfil?.activo) return; const c = t => supabase.from(t).select('id', { count: 'exact', head: true }).eq('user_id', perfil.id).eq('estado', 'pendiente'); Promise.all([c('aprobaciones'), c('firmas_firmantes')]).then(([x, y]) => { setPend((x.count || 0) + (y.count || 0)); setPendF(y.count || 0) }) }, [perfil, vista])
  if (sesion === undefined) return null
  if (recuperar) return <NuevaClave onListo={() => setRecuperar(false)} />
  if (!sesion) return <Auth />
  if (!perfil) return <p className="vacio">Cargando…</p>
  if (!perfil.activo) return <div className="auth"><div className="auth-box"><Logo /><h2>Cuenta pendiente de activación</h2><p className="muted">Un administrador de Ecogis debe activar tu acceso.</p><button className="btn" onClick={() => supabase.auth.signOut()}>Salir</button></div></div>
  return (
    <div className="app">
      <header className="top"><Logo />
        <input className="search" placeholder="Buscar en la unidad" value={q} onChange={e => { setQ(e.target.value); setVista('docs') }} />
        <button className={'tab' + (vista === 'docs' ? ' on' : '')} onClick={() => setVista('docs')}>Archivos</button>
        {GRUPOS.map(g => <div key={g.t} className="masw"><button className={'tab' + (g.items.some(([k]) => k === vista) ? ' on' : '')} onClick={e => { e.stopPropagation(); setMas(mas === g.t ? false : g.t) }}>{g.t} ▾</button>
          {mas === g.t && <div className="ctx mas" onClick={e => e.stopPropagation()}>{g.items.map(([k, t]) => <button key={k} onClick={() => { setVista(k); setMas(false) }}>{t}</button>)}</div>}</div>)}
        <button className={'tab' + (vista === 'links' ? ' on' : '')} onClick={() => setVista('links')}>Accesos</button>
        <div className="masw"><button className={'tab' + (['apr', 'trash', 'users', 'log', 'fav'].includes(vista) ? ' on' : '')} onClick={e => { e.stopPropagation(); setMas(mas === 'mas' ? false : 'mas') }}>Más{pend ? ` (${pend})` : ''} ▾</button>
          {mas === 'mas' && <div className="ctx mas" onClick={e => e.stopPropagation()}>
            <button onClick={() => { setVista('apr'); setMas(false) }}>Mis aprobaciones{pend - pendF ? ` (${pend - pendF})` : ''}</button>
            <button onClick={() => { setVista('firmas'); setMas(false) }}>Mis firmas{pendF ? ` (${pendF})` : ''}</button>
            <button onClick={() => { setVista('fav'); setMas(false) }}>⭐ Destacados</button>
            <button onClick={() => { setVista('trash'); setMas(false) }}>Papelera</button>
            {perfil.rol === 'admin' && <button onClick={() => { setVista('users'); setMas(false) }}>Usuarios</button>}
            {perfil.rol === 'admin' && <button onClick={() => { setVista('log'); setMas(false) }}>Actividad</button>}</div>}</div>
        <div className="avw"><button className="av" title="Mi cuenta" onClick={e => { e.stopPropagation(); setCuenta(!cuenta) }}>{(perfil.nombre || perfil.email || '?')[0].toUpperCase()}</button>
          {cuenta && <MiCuenta perfil={perfil} onNombre={n => setPerfil({ ...perfil, nombre: n })} />}</div>
      </header>
      {vista === 'docs' ? <Drive perfil={perfil} q={q} inicio={inicio} irVista={setVista} /> : vista === 'proy' ? <Proyectos perfil={perfil} onAbrir={abrir} /> : vista === 'equipos' ? <Equipos perfil={perfil} /> : vista === 'tareas' ? <Tareas perfil={perfil} /> : vista === 'opor' ? <Oportunidades perfil={perfil} /> : vista === 'hab' ? <Habilitantes perfil={perfil} /> : vista === 'firmas' ? <Firmas perfil={perfil} /> : vista === 'pqrs' ? <Pqrs perfil={perfil} /> : vista === 'apr' ? <MisAprobaciones perfil={perfil} /> : vista === 'ind' ? <Indicadores perfil={perfil} /> : vista === 'fav' ? <Destacados onAbrir={abrir} /> : vista === 'links' ? <Accesos perfil={perfil} /> : vista === 'trash' ? <Papelera perfil={perfil} /> : vista === 'log' ? <Actividad /> : <Usuarios perfil={perfil} />}
    </div>
  )
}

export default function App() {
  const q = new URLSearchParams(window.location.search)
  if (q.get('s')) return <Compartido token={q.get('s')} />
  if (q.get('encuesta')) return <EncuestaPublica token={q.get('encuesta')} />
  if (q.get('firma')) return <FirmaPublica token={q.get('firma')} />
  if (q.has('pqrs')) return <PqrsPublica />
  return <Principal />
}
