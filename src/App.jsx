import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from './supabase'
import logo from './logo.svg'

const APP = 'Geoteca Ecogis'
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
  const bajar = async () => { const x = await signed(d.path, d.nombre); x && window.open(x, '_blank') }
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
    await supabase.from('shares').insert({ item_type: tipo, item_id: i.id, expires_at: exp === '0' ? null : new Date(Date.now() + exp * 864e5).toISOString(), created_by: perfil.id }); cargar()
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
    </form></div>
  )
}

function Drive({ perfil, q }) {
  const [folders, setFolders] = useState([]), [docs, setDocs] = useState([]), [cur, setCur] = useState(null), [idx, setIdx] = useState(0)
  const [vista, setVista] = useState('grid'), [ft, setFt] = useState(''), [menu, setMenu] = useState(null), [nuevo, setNuevo] = useState(false)
  const [prev, setPrev] = useState(null), [share, setShare] = useState(null), [pend, setPend] = useState(null)
  const [over, setOver] = useState(false), [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [rec, setRec] = useState(false), [uso, setUso] = useState(0)
  const drag = useRef(null), inp = useRef(), mx = useRef(0)

  const cargar = useCallback(async () => {
    const { data: f } = await supabase.from('folders').select('*').order('nombre'); setFolders(f || [])
    let qq = supabase.from('documents').select('*').order('nombre')
    qq = q ? qq.ilike('nombre', `%${q}%`) : rec ? supabase.from('documents').select('*').order('created_at', { ascending: false }).limit(30) : cur ? qq.eq('folder_id', cur) : qq.is('folder_id', null)
    const { data: d } = await qq; setDocs(d || [])
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
    const limpio = t => t.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '')
    const anio = new Date().getFullYear()
    const nums = folders.filter(f => f.parent_id === cur && f.nombre.startsWith(anio + '-')).map(f => parseInt(f.nombre.slice(5, 8)) || 0)
    const cod = `${anio}-${String(Math.max(0, ...nums) + 1).padStart(3, '0')}`
    const { data, error } = await supabase.from('folders').insert({ nombre: `${cod}_${limpio(cliente)}_${limpio(nombre)}`, parent_id: cur, color: '#2a2aff', created_by: perfil.id }).select().single()
    if (error) return setMsg(error.message)
    await supabase.from('folders').insert(SUB_PROYECTO.map(n => ({ nombre: n, parent_id: data.id, color: '#2a2aff', created_by: perfil.id })))
    await cargar(); ir(data.id)
  }
  const preparar = files => files.length && setPend(files.map(file => ({ file, tipo: detectar(file.name) })))
  const subir = async arr => {
    setPend(null); setBusy(true); setMsg('')
    for (const { file, tipo } of arr) {
      const path = `${cur || 'raiz'}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`
      const u = await supabase.storage.from('documentos').upload(path, file); if (u.error) { setMsg(u.error.message); continue }
      const { error } = await supabase.from('documents').insert({ folder_id: cur, nombre: file.name, path, tamano: file.size, tipo: file.type, categoria: tipo, uploaded_by: perfil.id, uploaded_by_nombre: perfil.nombre || perfil.email })
      if (error) setMsg(error.message)
    }
    setBusy(false); cargar()
  }
  const descargar = async d => { const u = await signed(d.path, d.nombre); u && window.open(u, '_blank') }
  const renombrar = async (t, x) => { const n = prompt('Nuevo nombre:', x.nombre); if (!n?.trim()) return; await supabase.from(t === 'f' ? 'folders' : 'documents').update({ nombre: n.trim() }).eq('id', x.id); cargar() }
  const colorear = async (f, c) => { await supabase.from('folders').update({ color: c }).eq('id', f.id); setMenu(null); cargar() }
  const borrar = async (t, x) => {
    if (!confirm(`¿Eliminar "${x.nombre}"${t === 'f' ? ' con todo su contenido' : ''}?`)) return
    if (t === 'd') {
      const { error } = await supabase.from('documents').delete().eq('id', x.id); if (error) return setMsg(error.message)
      await supabase.storage.from('documentos').remove([x.path])
    } else {
      const ids = descend(x.id); const { data } = await supabase.from('documents').select('path').in('folder_id', ids)
      const { error } = await supabase.from('folders').delete().eq('id', x.id); if (error) return setMsg(error.message)
      if (data?.length) await supabase.storage.from('documentos').remove(data.map(r => r.path))
      if (ids.includes(cur)) ir(x.parent_id)
    }
    cargar()
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
        <div className="nm" title={x.nombre}>{x.nombre}</div>
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
        </div>
        <button className={'nav' + (!cur && !q && !rec ? ' on' : '')} onClick={() => ir(null)} {...dnd(null)}>Unidad de Ecogis</button>
        <button className={'nav' + (rec && !q ? ' on' : '')} onClick={() => setRec(true)}>Recientes</button>
        <div className="sub">Proyectos</div>
        {folders.filter(f => !f.parent_id).map(f => <button key={f.id} className={'nav small' + (ruta[0]?.id === f.id ? ' on' : '')} onClick={() => ir(f.id)} {...dnd(f.id)}><i style={{ background: f.color || '#374845' }} />{f.nombre}</button>)}
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
        {busy && <p className="msg ok">Subiendo archivos…</p>}{msg && <p className="msg">{msg}</p>}
        {vista === 'list' && subs.length + lista.length > 0 && <div className="it head"><div /><div>Nombre</div><div>Tipo</div><div>Tamaño</div><div>Subido por</div><div>Fecha</div><div /></div>}
        <div className={vista}>{subs.map(f => item('f', f))}{lista.map(d => item('d', d))}</div>
        {subs.length + lista.length === 0 && <div className="vacio"><b>{q ? 'Sin resultados' : 'Aquí no hay nada todavía'}</b><p>{q ? 'Prueba con otro nombre.' : 'Arrastra archivos o usa el botón Nuevo.'}</p></div>}
        {over && <div className="drop">Suelta los archivos para subirlos</div>}
      </main>
      {menu && <div className="ctx" style={{ left: Math.min(menu.x, window.innerWidth - 200), top: Math.min(menu.y, window.innerHeight - 260) }} onClick={e => e.stopPropagation()}>
        <button onClick={() => { menu.t === 'f' ? ir(menu.i.id) : setPrev(menu.i); setMenu(null) }}>Abrir</button>
        <button onClick={() => { setShare(menu); setMenu(null) }}>Compartir</button>
        {menu.t === 'd' && <button onClick={() => { descargar(menu.i); setMenu(null) }}>Descargar</button>}
        <button onClick={() => { renombrar(menu.t, menu.i); setMenu(null) }}>Cambiar nombre</button>
        {menu.t === 'f' && <div className="sw">{COLORES.map(c => <button key={c} aria-label={'Color ' + c} style={{ background: c }} onClick={() => colorear(menu.i, c)} />)}</div>}
        <button className="rojo" onClick={() => { borrar(menu.t, menu.i); setMenu(null) }}>Eliminar</button>
      </div>}
      {prev && <Preview d={prev} onClose={() => setPrev(null)} />}
      {share && <Compartir t={share.t} i={share.i} perfil={perfil} onClose={() => setShare(null)} />}
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
  const [sesion, setSesion] = useState(undefined), [perfil, setPerfil] = useState(null), [vista, setVista] = useState('docs'), [q, setQ] = useState(''), [cuenta, setCuenta] = useState(false)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSesion(data.session))
    const { data: s } = supabase.auth.onAuthStateChange((_e, ses) => setSesion(ses)); return () => s.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (!sesion) return setPerfil(null)
    supabase.from('profiles').select('*').eq('id', sesion.user.id).single().then(({ data }) => setPerfil(data))
  }, [sesion])
  useEffect(() => { const c = () => setCuenta(false); window.addEventListener('click', c); return () => window.removeEventListener('click', c) }, [])
  if (sesion === undefined) return null
  if (!sesion) return <Auth />
  if (!perfil) return <p className="vacio">Cargando…</p>
  if (!perfil.activo) return <div className="auth"><div className="auth-box"><Logo /><h2>Cuenta pendiente de activación</h2><p className="muted">Un administrador de Ecogis debe activar tu acceso.</p><button className="btn" onClick={() => supabase.auth.signOut()}>Salir</button></div></div>
  return (
    <div className="app">
      <header className="top"><Logo />
        <input className="search" placeholder="Buscar en la unidad" value={q} onChange={e => { setQ(e.target.value); setVista('docs') }} />
        <button className={'tab' + (vista === 'docs' ? ' on' : '')} onClick={() => setVista('docs')}>Archivos</button>
        <button className={'tab' + (vista === 'links' ? ' on' : '')} onClick={() => setVista('links')}>Accesos rápidos</button>
        {perfil.rol === 'admin' && <button className={'tab' + (vista === 'users' ? ' on' : '')} onClick={() => setVista('users')}>Usuarios</button>}
        <div className="avw"><button className="av" title="Mi cuenta" onClick={e => { e.stopPropagation(); setCuenta(!cuenta) }}>{(perfil.nombre || perfil.email || '?')[0].toUpperCase()}</button>
          {cuenta && <MiCuenta perfil={perfil} onNombre={n => setPerfil({ ...perfil, nombre: n })} />}</div>
      </header>
      {vista === 'docs' ? <Drive perfil={perfil} q={q} /> : vista === 'links' ? <Accesos perfil={perfil} /> : <Usuarios perfil={perfil} />}
    </div>
  )
}

export default function App() {
  const tk = new URLSearchParams(window.location.search).get('s')
  return tk ? <Compartido token={tk} /> : <Principal />
}
