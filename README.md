# Gestor documental · Ecogis Geomatic SAS

React + Vite + Supabase (auth, base de datos, storage). Se despliega en Vercel.

## 1. Supabase
1. Crea un proyecto en https://supabase.com.
2. SQL Editor → pega `supabase/schema.sql` → Run.
3. Authentication → Providers → Email: para pruebas rápidas desactiva "Confirm email".
4. Project Settings → API: copia `Project URL` y la clave `anon public`.
5. **Regístrate tú primero en la web**: el primer usuario queda como administrador. Los demás quedan inactivos hasta que los actives en la pestaña "Usuarios".

## 2. Probar local
```
cp .env.example .env   # pega tus claves
npm install
npm run dev
```

## 3. Publicar en Vercel
1. Sube la carpeta a un repositorio de GitHub.
2. En https://vercel.com → Add New → Project → importa el repo (detecta Vite solo).
3. Environment Variables: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
4. Deploy.
5. En Supabase → Authentication → URL Configuration, pon la URL de Vercel en "Site URL".

## Qué incluye
- Login/registro, activación de usuarios y roles (administrador / miembro).
- Proyectos con cliente y descripción, más una carpeta de documentos generales de la empresa.
- Subida múltiple de archivos con categoría, búsqueda, descarga con enlace temporal y eliminación con permisos.
- Archivos en bucket privado; todo protegido con RLS.
