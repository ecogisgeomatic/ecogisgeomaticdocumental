import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from './supabase'

const fmt = b => (!b ? '—' : b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.ceil(b / 1024) + ' KB')
const fecha = d => new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
const ext = n => (n.includes('.') ? n.split('.').pop() : '').toLowerCase()
const COL = { pdf: '#d93025', doc: '#1a73e8', docx: '#1a73e8', xls: '#188038', xlsx: '#188038', csv: '#188038', dwg: '#e37400', shp: '#7b1fa2', kml: '#7b1fa2', kmz: '#7b1fa2', tif: '#00897b', tiff: '#00897b', jpg: '#c2185b', jpeg: '#c2185b', png: '#c2185b', zip: '#5f6368' }
const FileIcon = ({ n }) => <div className="fi" style={{ background: COL[ext(n)] || '#5f6368' }}>{ext(n).slice(0, 4) || 'file'}</div>
const FolderIcon = () => <svg width="44" height="44" viewBox="0 0 24 24" fill="#4f7d68"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" /></svg>

function Auth() {
  const [modo, setModo] = useState('in')
  const [f, setF] = useState({ email: '', pass: '', nombre: '' })
  const [msg, setMsg] = useState('')
  const set = k => e => setF({ ...f, [k]: e.target.value })
  const enviar = async e => {
    e.preventDefault(); setMsg('')
    const { error } = modo === 'in'
      ? await supabase.auth.signInWithPassword({ email: f.email, password: f.pass })
      : await supabase.auth.signUp({ email: f.email, password: f.pass, options: { data: { nombre: f.nombre } } })
    if (error) setMsg(error.message)
  }
  return (
    <div className="auth"><form onSubmit={enviar} className="auth-box">
      <h1>Ecogis Geomatic SAS</h1><p className="muted">Gestor documental</p>
      {modo === 'up' && <input placeholder="Nombre completo" required value={f.nombre} onChange={set('nombre')} />}
      <input type="email" placeholder="Correo" required value={f.email} onChange={set('email')} />
      <input type="password" placeholder="Contraseña (mínimo 6)" minLength={6} required value={f.pass} onChange={set('pass')} />
      <button className="btn">{modo === 'in' ? 'Ingresar' : 'Crear cuenta'}</button>
      {msg && <p className="msg">{msg}</p>}
      <a href="#" onClick={e => { e.preventDefault(); setModo(modo === 'in' ? 'up' : 'in'); setMsg('') }}>{modo === 'in' ? 'Crear una cuenta nueva' : 'Ya tengo cuenta'}</a>
    </form></div>
  )
}

function Drive({ perfil, q }) {
  const [folders, setFolders] = useState([])
  const [docs, setDocs] = useState([])
  const [cur, setCur] = useState(null)
  const [vista, setVista] = useState('grid')
  const [menu, setMenu] = useState(null)
  const [nuevo, setNuevo] = useState(false)
  const [prev, setPrev] = useState(null)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const drag = useRef(null)
  const inp = useRef()

  const cargar = useCallback(async () => {
    const { data: f } = await supabase.from('folders').select('*').order('nombre')
    setFolders(f || [])
    let qq = supabase.from('documents').select('*').order('nombre')
    qq = q ? qq.ilike('nombre', `%${q}%`) : cur ? qq.eq('folder_id', cur) : qq.is('folder_id', null)
    const { data: d } = await qq
    setDocs(d || [])
  }, [cur, q])
  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { const c = () => { setMenu(null); setNuevo(false) }; window.addEventListener('click', c); return () => window.removeEventListener('click', c) }, [])

  const descend = id => [id, ...folders.filter(f => f.parent_id === id).flatMap(f => descend(f.id))]
  const ruta = []
  for (let f = folders.find(x => x.id === cur); f; f = folders.find(x => x.id === f.parent_id)) ruta.unshift(f)
  const subs = q ? folders.filter(f => f.nombre.toLowerCase().includes(q.toLowerCase())) : folders.filter(f => f.parent_id === cur)

  const crearCarpeta = async () => {
    const nombre = prompt('Nombre de la carpeta o proyecto:'); if (!nombre?.trim()) return
    const { error } = await supabase.from('folders').insert({ nombre: nombre.trim(), parent_id: cur, created_by: perfil.id })
    if (error) setMsg(error.message); cargar()
  }
  const subir = async files => {
    setBusy(true); setMsg('')
    for (const file of files) {
      const path = `${cur || 'raiz'}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`
      const u = await supabase.storage.from('documentos').upload(path, file)
      if (u.error) { setMsg(u.error.message); continue }
      const { error } = await supabase.from('documents').insert({ folder_id: cur, nombre: file.name, path, tamano: file.size, tipo: file.type, uploaded_by: perfil.id, uploaded_by_nombre: perfil.nombre || perfil.email })
      if (error) setMsg(error.message)
    }
    setBusy(false); cargar()
  }
  const url = async (d, descarga) => {
    const { data, error } = await supabase.storage.from('documentos').createSignedUrl(d.path, 3600, descarga ? { download: d.nombre } : undefined)
    if (error) { setMsg(error.message); return null } return data.signedUrl
  }
  const abrir = async d => { const u = await url(d); if (u) setPrev({ d, u }) }
  const descargar = async d => { const u = await url(d, true); if (u) window.open(u, '_blank') }
  const renombrar = async (t, x) => {
    const nombre = prompt('Nuevo nombre:', x.nombre); if (!nombre?.trim()) return
    await supabase.from(t === 'f' ? 'folders' : 'documents').update({ nombre: nombre.trim() }).eq('id', x.id); cargar()
  }
  const borrar = async (t, x) => {
    if (!confirm(`¿Eliminar "${x.nombre}"${t === 'f' ? ' con todo su contenido' : ''}?`)) return
    if (t === 'd') {
      const { error } = await supabase.from('documents').delete().eq('id', x.id)
      if (error) return setMsg(error.message)
      await supabase.storage.from('documentos').remove([x.path])
    } else {
      const ids = descend(x.id)
      const { data } = await supabase.from('documents').select('path').in('folder_id', ids)
      const { error } = await supabase.from('folders').delete().eq('id', x.id)
      if (error) return setMsg(error.message)
      if (data?.length) await supabase.storage.from('documentos').remove(data.map(r => r.path))
      if (ids.includes(cur)) setCur(x.parent_id)
    }
    cargar()
  }
  const mover = async dest => {
    const d = drag.current; drag.current = null; if (!d) return
    if (d.tipo === 'f') { if (d.id === dest || descend(d.id).includes(dest)) return; await supabase.from('folders').update({ parent_id: dest }).eq('id', d.id) }
    else await supabase.from('documents').update({ folder_id: dest }).eq('id', d.id)
    cargar()
  }
  const dz = { onDragOver: e => { if (drag.current) return; if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true) } }, onDragLeave: () => setOver(false), onDrop: e => { setOver(false); if (e.dataTransfer.files.length) { e.preventDefault(); subir([...e.dataTransfer.files]) } } }

  const item = (t, x) => {
    const f = t === 'f'
    return (
      <div key={t + x.id} className="it" draggable
        onDragStart={e => { drag.current = { tipo: t, id: x.id }; e.dataTransfer.effectAllowed = 'move' }} onDragEnd={() => { drag.current = null }}
        onClick={() => (f ? (setCur(x.id)) : abrir(x))}
        onContextMenu={e => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, t, i: x }) }}
        onDragOver={f ? e => { if (drag.current) e.preventDefault() } : undefined}
        onDrop={f ? e => { e.stopPropagation(); mover(x.id) } : undefined}>
        <div className="ic">{f ? <FolderIcon /> : <FileIcon n={x.nombre} />}</div>
        <div className="nm" title={x.nombre}>{x.nombre}</div>
        <div className="meta">{f ? '—' : fmt(x.tamano)}</div>
        <div className="meta">{f ? '' : x.uploaded_by_nombre}</div>
        <div className="meta">{fecha(x.created_at)}</div>
        <button className="dots" aria-label="Más opciones" onClick={e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.left - 120, y: r.bottom, t, i: x }) }}>⋮</button>
      </div>
    )
  }

  return (
    <div className="drive">
      <aside className="side">
        <div style={{ position: 'relative' }}>
          <button className="nuevo" onClick={e => { e.stopPropagation(); setNuevo(!nuevo) }}><span>＋</span> Nuevo</button>
          {nuevo && <div className="pop" onClick={e => e.stopPropagation()}>
            <button onClick={() => { setNuevo(false); crearCarpeta() }}>Nueva carpeta / proyecto</button>
            <button onClick={() => { setNuevo(false); inp.current.click() }}>Subir archivos</button>
          </div>}
          <input ref={inp} type="file" multiple hidden onChange={e => { subir([...e.target.files]); e.target.value = '' }} />
        </div>
        <button className={'nav' + (!cur && !q ? ' on' : '')} onClick={() => setCur(null)} onDragOver={e => drag.current && e.preventDefault()} onDrop={() => mover(null)}>Unidad de Ecogis</button>
        <div className="sub">Proyectos</div>
        {folders.filter(f => !f.parent_id).map(f => <button key={f.id} className={'nav small' + (ruta[0]?.id === f.id ? ' on' : '')} onClick={() => setCur(f.id)} onDragOver={e => drag.current && e.preventDefault()} onDrop={() => mover(f.id)}>{f.nombre}</button>)}
      </aside>
      <main className={'panel' + (over ? ' over' : '')} {...dz}>
        <div className="bar">
          <div className="crumbs">
            {q ? <b>Resultados para “{q}”</b> : <>
              <button onClick={() => setCur(null)} onDragOver={e => drag.current && e.preventDefault()} onDrop={() => mover(null)}>Unidad de Ecogis</button>
              {ruta.map(f => <span key={f.id}> › <button onClick={() => setCur(f.id)} onDragOver={e => drag.current && e.preventDefault()} onDrop={() => mover(f.id)}>{f.nombre}</button></span>)}</>}
          </div>
          <div className="seg">
            <button className={vista === 'list' ? 'on' : ''} onClick={() => setVista('list')} title="Lista">☰</button>
            <button className={vista === 'grid' ? 'on' : ''} onClick={() => setVista('grid')} title="Cuadrícula">▦</button>
          </div>
        </div>
        {busy && <p className="msg ok">Subiendo archivos…</p>}
        {msg && <p className="msg">{msg}</p>}
        {vista === 'list' && subs.length + docs.length > 0 && <div className="it head"><div className="ic" /><div className="nm">Nombre</div><div className="meta">Tamaño</div><div className="meta">Subido por</div><div className="meta">Fecha</div><div className="dots" /></div>}
        <div className={vista}>
          {subs.map(f => item('f', f))}
          {docs.map(d => item('d', d))}
        </div>
        {subs.length + docs.length === 0 && <div className="vacio"><b>{q ? 'Sin resultados' : 'Esta carpeta está vacía'}</b><p>{q ? 'Prueba con otro nombre.' : 'Arrastra archivos aquí o usa el botón Nuevo.'}</p></div>}
        {over && <div className="drop">Suelta los archivos para subirlos</div>}
      </main>
      {menu && <div className="ctx" style={{ left: Math.min(menu.x, window.innerWidth - 190), top: Math.min(menu.y, window.innerHeight - 190) }} onClick={e => e.stopPropagation()}>
        <button onClick={() => { menu.t === 'f' ? setCur(menu.i.id) : abrir(menu.i); setMenu(null) }}>Abrir</button>
        {menu.t === 'd' && <button onClick={() => { descargar(menu.i); setMenu(null) }}>Descargar</button>}
        <button onClick={() => { renombrar(menu.t, menu.i); setMenu(null) }}>Cambiar nombre</button>
        <button className="rojo" onClick={() => { borrar(menu.t, menu.i); setMenu(null) }}>Eliminar</button>
      </div>}
      {prev && <div className="modal" onClick={() => setPrev(null)}>
        <div className="pv" onClick={e => e.stopPropagation()}>
          <div className="pvh"><b>{prev.d.nombre}</b><span><button className="btn" onClick={() => descargar(prev.d)}>Descargar</button> <button className="btn ghost" onClick={() => setPrev(null)}>Cerrar</button></span></div>
          {['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext(prev.d.nombre)) ? <img src={prev.u} alt={prev.d.nombre} />
            : ext(prev.d.nombre) === 'pdf' ? <iframe src={prev.u} title={prev.d.nombre} />
            : <div className="vacio"><b>Sin vista previa para este tipo de archivo</b><p>Descárgalo para abrirlo en tu equipo.</p></div>}
        </div>
      </div>}
    </div>
  )
}

function Usuarios({ perfil }) {
  const [users, setUsers] = useState([])
  const cargar = useCallback(async () => { const { data } = await supabase.from('profiles').select('*').order('created_at'); setUsers(data || []) }, [])
  useEffect(() => { cargar() }, [cargar])
  const cambiar = async (id, c) => { await supabase.from('profiles').update(c).eq('id', id); cargar() }
  return (
    <div className="panel solo"><h2>Usuarios</h2>
      <p className="muted">Quienes se registran quedan inactivos hasta que los actives aquí.</p>
      <table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Acceso</th></tr></thead>
        <tbody>{users.map(u => <tr key={u.id}><td>{u.nombre || '—'}</td><td>{u.email}</td>
          <td><select disabled={u.id === perfil.id} value={u.rol} onChange={e => cambiar(u.id, { rol: e.target.value })}><option value="miembro">Miembro</option><option value="admin">Administrador</option></select></td>
          <td><button className={'chip ' + (u.activo ? 'si' : 'no')} disabled={u.id === perfil.id} onClick={() => cambiar(u.id, { activo: !u.activo })}>{u.activo ? 'Activo' : 'Inactivo · activar'}</button></td></tr>)}</tbody></table>
    </div>
  )
}

export default function App() {
  const [sesion, setSesion] = useState(undefined)
  const [perfil, setPerfil] = useState(null)
  const [vista, setVista] = useState('docs')
  const [q, setQ] = useState('')
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSesion(data.session))
    const { data: s } = supabase.auth.onAuthStateChange((_e, ses) => setSesion(ses))
    return () => s.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (!sesion) return setPerfil(null)
    supabase.from('profiles').select('*').eq('id', sesion.user.id).single().then(({ data }) => setPerfil(data))
  }, [sesion])
  if (sesion === undefined) return null
  if (!sesion) return <Auth />
  if (!perfil) return <p className="vacio">Cargando…</p>
  if (!perfil.activo) return <div className="auth"><div className="auth-box"><h2>Cuenta pendiente de activación</h2><p className="muted">Un administrador de Ecogis debe activar tu acceso.</p><button className="btn" onClick={() => supabase.auth.signOut()}>Salir</button></div></div>
  const ini = (perfil.nombre || perfil.email || '?')[0].toUpperCase()
  return (
    <div className="app">
      <header className="top">
        <div className="logo">Ecogis <span>Documentos</span></div>
        <input className="search" placeholder="Buscar en la unidad" value={q} onChange={e => { setQ(e.target.value); setVista('docs') }} />
        {perfil.rol === 'admin' && <button className={'tab' + (vista === 'users' ? ' on' : '')} onClick={() => setVista(vista === 'users' ? 'docs' : 'users')}>Usuarios</button>}
        <button className="av" title="Cerrar sesión" onClick={() => supabase.auth.signOut()}>{ini}</button>
      </header>
      {vista === 'docs' ? <Drive perfil={perfil} q={q} /> : <Usuarios perfil={perfil} />}
    </div>
  )
}
