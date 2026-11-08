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
const FileIcon = ({ n }) => <div className="fi" style={{ background: COL[ext(n)] || '#546e7a' }}>{ext(n).slice(0, 4) || 'file'}</div>
const FolderIcon = ({ c }) => <svg width="46" height="46" viewBox="0 0 24 24" fill={c || '#374845'}><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" /></svg>
const Logo = ({ h = 40 }) => <div className="logo"><img src={logo} alt="Ecogis Geomatic SAS" height={h} /><span className="appn">{APP}</span></div>

function Preview({ d, onClose }) {
  const [u, setU] = useState(null), [html, setHtml] = useState(''), [txt, setTxt] = useState(''), [err, setErr] = useState('')
  const e = ext(d.nombre)
  useEffect(() => {
    (async () => {
      const url = await signed(d.path); setU(url); if (!url) return setErr('No se pudo abrir el archivo')
      try {
        if (e === 'docx') { await cargarMammoth(); const r = await window.mammoth.convertToHtml({ arrayBuffer: await (await fetch(url)).arrayBuffer() }); setHtml(r.value || '<p>Documento vacío</p>') }
        else if (['txt', 'csv', 'json', 'md', 'kml', 'geojson'].includes(e)) setTxt((await (await fetch(url)).text()).slice(0, 200000))
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
          : txt ? <pre className="txt">{txt}</pre>
          : <div className="vacio"><b>Sin vista previa para .{e || 'este formato'}</b><p>{e === 'doc' ? 'Guárdalo como .docx para verlo aquí, o descárgalo.' : 'Descárgalo para abrirlo en tu equipo.'}</p></div>}
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
  const [sesion, setSesion] = useState(undefined), [perfil, setPerfil] = useState(null), [vista, setVista] = useState('docs'), [q, setQ] = useState(''), [cuenta, setCuenta] = useState(false), [recuperar, setRecuperar] = useState(false), [mas, setMas] = useState(false), [inicio, setInicio] = useState(null)
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
  if (sesion === undefined) return null
  if (recuperar) return <NuevaClave onListo={() => setRecuperar(false)} />
  if (!sesion) return <Auth />
  if (!perfil) return <p className="vacio">Cargando…</p>
  if (!perfil.activo) return <div className="auth"><div className="auth-box"><Logo /><h2>Cuenta pendiente de activación</h2><p className="muted">Un administrador de Ecogis debe activar tu acceso.</p><button className="btn" onClick={() => supabase.auth.signOut()}>Salir</button></div></div>
  return (
    <div className="app">
      <header className="top"><Logo />
        <input className="search" placeholder="Buscar en la unidad" value={q} onChange={e => { setQ(e.target.value); setVista('docs') }} />
        {[['docs', 'Archivos'], ['proy', 'Proyectos'], ['equipos', 'Equipos'], ['ind', 'Indicadores'], ['links', 'Accesos']].map(([k, t]) => <button key={k} className={'tab' + (vista === k ? ' on' : '')} onClick={() => setVista(k)}>{t}</button>)}
        <div className="masw"><button className={'tab' + (['trash', 'users', 'log', 'fav'].includes(vista) ? ' on' : '')} onClick={e => { e.stopPropagation(); setMas(!mas) }}>Más ▾</button>
          {mas && <div className="ctx mas" onClick={e => e.stopPropagation()}>
            <button onClick={() => { setVista('fav'); setMas(false) }}>⭐ Destacados</button>
            <button onClick={() => { setVista('trash'); setMas(false) }}>Papelera</button>
            {perfil.rol === 'admin' && <button onClick={() => { setVista('users'); setMas(false) }}>Usuarios</button>}
            {perfil.rol === 'admin' && <button onClick={() => { setVista('log'); setMas(false) }}>Actividad</button>}</div>}</div>
        <div className="avw"><button className="av" title="Mi cuenta" onClick={e => { e.stopPropagation(); setCuenta(!cuenta) }}>{(perfil.nombre || perfil.email || '?')[0].toUpperCase()}</button>
          {cuenta && <MiCuenta perfil={perfil} onNombre={n => setPerfil({ ...perfil, nombre: n })} />}</div>
      </header>
      {vista === 'docs' ? <Drive perfil={perfil} q={q} inicio={inicio} irVista={setVista} /> : vista === 'proy' ? <Proyectos perfil={perfil} onAbrir={abrir} /> : vista === 'equipos' ? <Equipos perfil={perfil} /> : vista === 'ind' ? <Indicadores perfil={perfil} /> : vista === 'fav' ? <Destacados onAbrir={abrir} /> : vista === 'links' ? <Accesos perfil={perfil} /> : vista === 'trash' ? <Papelera perfil={perfil} /> : vista === 'log' ? <Actividad /> : <Usuarios perfil={perfil} />}
    </div>
  )
}

export default function App() {
  const tk = new URLSearchParams(window.location.search).get('s')
  return tk ? <Compartido token={tk} /> : <Principal />
}
