import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'

const CATEGORIAS = ['Contrato', 'Informe técnico', 'Cartografía / SIG', 'Facturación', 'Legal', 'Otro']
const fmt = b => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.ceil(b / 1024) + ' KB')
const fecha = d => new Date(d).toLocaleDateString('es-CO')

function Auth() {
  const [modo, setModo] = useState('in')
  const [f, setF] = useState({ email: '', pass: '', nombre: '' })
  const [msg, setMsg] = useState('')
  const enviar = async e => {
    e.preventDefault(); setMsg('')
    const { error } = modo === 'in'
      ? await supabase.auth.signInWithPassword({ email: f.email, password: f.pass })
      : await supabase.auth.signUp({ email: f.email, password: f.pass, options: { data: { nombre: f.nombre } } })
    if (error) setMsg(error.message)
    else if (modo === 'up') setMsg('Cuenta creada. Si te llega un correo de confirmación, ábrelo y luego ingresa.')
  }
  return (
    <div className="auth">
      <form onSubmit={enviar} className="auth-box">
        <h1>Ecogis Geomatic SAS</h1>
        <p className="muted">Gestor documental de proyectos</p>
        {modo === 'up' && <input placeholder="Nombre completo" required value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} />}
        <input type="email" placeholder="Correo" required value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
        <input type="password" placeholder="Contraseña (mínimo 6)" minLength={6} required value={f.pass} onChange={e => setF({ ...f, pass: e.target.value })} />
        <button className="btn">{modo === 'in' ? 'Ingresar' : 'Crear cuenta'}</button>
        {msg && <p className="msg">{msg}</p>}
        <a href="#" onClick={e => { e.preventDefault(); setModo(modo === 'in' ? 'up' : 'in'); setMsg('') }}>
          {modo === 'in' ? 'Crear una cuenta nueva' : 'Ya tengo cuenta'}
        </a>
      </form>
    </div>
  )
}

function Documentos({ perfil }) {
  const [proyectos, setProyectos] = useState([])
  const [sel, setSel] = useState('general')
  const [docs, setDocs] = useState([])
  const [busca, setBusca] = useState('')
  const [nuevo, setNuevo] = useState(null)
  const [cat, setCat] = useState(CATEGORIAS[0])
  const [subiendo, setSubiendo] = useState(false)
  const [err, setErr] = useState('')

  const cargarProyectos = useCallback(async () => {
    const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: false })
    setProyectos(data || [])
  }, [])
  const cargarDocs = useCallback(async () => {
    let q = supabase.from('documents').select('*').order('created_at', { ascending: false })
    q = sel === 'general' ? q.is('project_id', null) : q.eq('project_id', sel)
    const { data } = await q
    setDocs(data || [])
  }, [sel])
  useEffect(() => { cargarProyectos() }, [cargarProyectos])
  useEffect(() => { cargarDocs() }, [cargarDocs])

  const crearProyecto = async e => {
    e.preventDefault()
    const { data, error } = await supabase.from('projects').insert({ ...nuevo, created_by: perfil.id }).select().single()
    if (error) return setErr(error.message)
    setNuevo(null); await cargarProyectos(); setSel(data.id)
  }
  const subir = async e => {
    const files = [...e.target.files]; if (!files.length) return
    setSubiendo(true); setErr('')
    for (const file of files) {
      const path = `${sel}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`
      const up = await supabase.storage.from('documentos').upload(path, file)
      if (up.error) { setErr(up.error.message); continue }
      const { error } = await supabase.from('documents').insert({
        project_id: sel === 'general' ? null : sel, nombre: file.name, path, tamano: file.size,
        tipo: file.type || 'archivo', categoria: cat, uploaded_by: perfil.id, uploaded_by_nombre: perfil.nombre || perfil.email
      })
      if (error) setErr(error.message)
    }
    e.target.value = ''; setSubiendo(false); cargarDocs()
  }
  const descargar = async d => {
    const { data, error } = await supabase.storage.from('documentos').createSignedUrl(d.path, 60, { download: d.nombre })
    if (error) return setErr(error.message)
    window.open(data.signedUrl, '_blank')
  }
  const borrar = async d => {
    if (!confirm(`¿Eliminar "${d.nombre}"?`)) return
    await supabase.storage.from('documentos').remove([d.path])
    const { error } = await supabase.from('documents').delete().eq('id', d.id)
    if (error) setErr(error.message); else cargarDocs()
  }
  const borrarProyecto = async p => {
    if (!confirm(`¿Eliminar el proyecto "${p.nombre}" y todos sus documentos?`)) return
    const { data } = await supabase.from('documents').select('path').eq('project_id', p.id)
    if (data?.length) await supabase.storage.from('documentos').remove(data.map(x => x.path))
    await supabase.from('projects').delete().eq('id', p.id)
    setSel('general'); cargarProyectos()
  }

  const actual = proyectos.find(p => p.id === sel)
  const lista = docs.filter(d => (d.nombre + d.categoria).toLowerCase().includes(busca.toLowerCase()))

  return (
    <div className="split">
      <aside>
        <button className="btn full" onClick={() => setNuevo({ nombre: '', cliente: '', descripcion: '' })}>Nuevo proyecto</button>
        <ul className="lista">
          <li className={sel === 'general' ? 'on' : ''} onClick={() => setSel('general')}>Documentos generales</li>
          {proyectos.map(p => (
            <li key={p.id} className={sel === p.id ? 'on' : ''} onClick={() => setSel(p.id)}>
              {p.nombre}<small>{p.cliente}</small>
            </li>
          ))}
        </ul>
      </aside>
      <section>
        <div className="head">
          <div>
            <h2>{actual ? actual.nombre : 'Documentos generales de la empresa'}</h2>
            <p className="muted">{actual ? actual.descripcion || actual.cliente : 'Legal, administrativo y archivos de uso común'}</p>
          </div>
          {actual && (perfil.rol === 'admin' || actual.created_by === perfil.id) &&
            <button className="btn ghost" onClick={() => borrarProyecto(actual)}>Eliminar proyecto</button>}
        </div>
        <div className="bar">
          <input placeholder="Buscar por nombre o categoría" value={busca} onChange={e => setBusca(e.target.value)} />
          <select value={cat} onChange={e => setCat(e.target.value)}>{CATEGORIAS.map(c => <option key={c}>{c}</option>)}</select>
          <label className="btn">{subiendo ? 'Subiendo…' : 'Subir archivos'}<input type="file" multiple hidden onChange={subir} disabled={subiendo} /></label>
        </div>
        {err && <p className="msg">{err}</p>}
        {lista.length === 0 ? <p className="vacio">Aún no hay archivos aquí. Sube el primero con “Subir archivos”.</p> : (
          <div className="tabla-w"><table>
            <thead><tr><th>Archivo</th><th>Categoría</th><th>Tamaño</th><th>Subido por</th><th>Fecha</th><th></th></tr></thead>
            <tbody>{lista.map(d => (
              <tr key={d.id}>
                <td>{d.nombre}</td><td>{d.categoria}</td><td>{fmt(d.tamano)}</td><td>{d.uploaded_by_nombre}</td><td>{fecha(d.created_at)}</td>
                <td className="acc">
                  <button onClick={() => descargar(d)}>Descargar</button>
                  {(perfil.rol === 'admin' || d.uploaded_by === perfil.id) && <button onClick={() => borrar(d)}>Eliminar</button>}
                </td>
              </tr>))}</tbody>
          </table></div>)}
      </section>
      {nuevo && (
        <div className="modal" onClick={() => setNuevo(null)}>
          <form className="auth-box" onClick={e => e.stopPropagation()} onSubmit={crearProyecto}>
            <h2>Nuevo proyecto</h2>
            <input placeholder="Nombre del proyecto" required value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} />
            <input placeholder="Cliente" value={nuevo.cliente} onChange={e => setNuevo({ ...nuevo, cliente: e.target.value })} />
            <textarea placeholder="Descripción" rows={3} value={nuevo.descripcion} onChange={e => setNuevo({ ...nuevo, descripcion: e.target.value })} />
            <button className="btn">Crear proyecto</button>
          </form>
        </div>)}
    </div>
  )
}

function Usuarios({ perfil }) {
  const [users, setUsers] = useState([])
  const cargar = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').order('created_at')
    setUsers(data || [])
  }, [])
  useEffect(() => { cargar() }, [cargar])
  const cambiar = async (id, cambios) => { await supabase.from('profiles').update(cambios).eq('id', id); cargar() }
  return (
    <section className="solo">
      <h2>Usuarios</h2>
      <p className="muted">Las personas nuevas se registran solas y quedan inactivas hasta que las actives aquí.</p>
      <div className="tabla-w"><table>
        <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th></tr></thead>
        <tbody>{users.map(u => (
          <tr key={u.id}>
            <td>{u.nombre || '—'}</td><td>{u.email}</td>
            <td><select disabled={u.id === perfil.id} value={u.rol} onChange={e => cambiar(u.id, { rol: e.target.value })}>
              <option value="miembro">Miembro</option><option value="admin">Administrador</option></select></td>
            <td><button disabled={u.id === perfil.id} onClick={() => cambiar(u.id, { activo: !u.activo })}>{u.activo ? 'Activo · desactivar' : 'Inactivo · activar'}</button></td>
          </tr>))}</tbody>
      </table></div>
    </section>
  )
}

export default function App() {
  const [sesion, setSesion] = useState(undefined)
  const [perfil, setPerfil] = useState(null)
  const [vista, setVista] = useState('docs')
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
  if (!perfil.activo) return (
    <div className="auth"><div className="auth-box">
      <h2>Cuenta pendiente de activación</h2>
      <p className="muted">Un administrador de Ecogis debe activar tu acceso. Vuelve a ingresar cuando te avisen.</p>
      <button className="btn" onClick={() => supabase.auth.signOut()}>Salir</button>
    </div></div>)

  return (
    <>
      <header>
        <strong>Ecogis Geomatic SAS</strong>
        <nav>
          <button className={vista === 'docs' ? 'on' : ''} onClick={() => setVista('docs')}>Proyectos y archivos</button>
          {perfil.rol === 'admin' && <button className={vista === 'users' ? 'on' : ''} onClick={() => setVista('users')}>Usuarios</button>}
        </nav>
        <span className="muted">{perfil.nombre || perfil.email}</span>
        <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Salir</button>
      </header>
      {vista === 'docs' ? <Documentos perfil={perfil} /> : <Usuarios perfil={perfil} />}
    </>
  )
}
