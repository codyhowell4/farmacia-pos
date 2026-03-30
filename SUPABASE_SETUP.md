# Guía de configuración — Supabase

## 1. Crear el proyecto en Supabase

1. Ve a https://supabase.com y crea una cuenta
2. Clic en **New Project**
3. Nombre: `farmacia-pos` (o el que prefieras)
4. Contraseña de base de datos: guárdala en un lugar seguro
5. Región: **US East (N. Virginia)** — la más cercana a México
6. Espera ~2 minutos a que se aprovisione

---

## 2. Crear las tablas

1. En el panel de Supabase, ve a **SQL Editor**
2. Clic en **New query**
3. Pega todo el contenido del archivo `supabase_schema.sql`
4. Clic en **Run** (botón verde)
5. Verifica que aparezca "Success. No rows returned"

---

## 3. Crear tu primer usuario (organización + admin)

En el **SQL Editor**, ejecuta esto (cambia los valores):

```sql
-- 1. Crear la organización
insert into organizations (name, slug)
values ('Farmacia del Centro', 'farmacia-del-centro')
returning id;
-- Copia el ID que aparece — lo necesitas abajo

-- 2. Crear la ubicación
insert into locations (org_id, name, address)
values ('<ORG_ID_AQUI>', 'Sucursal Principal', 'Calle Principal #123, Ciudad de México')
returning id;
-- Copia el ID de la ubicación

-- 3. Crear el usuario admin en Supabase Auth
-- Ve a Authentication → Users → Add user
-- Email: admin@tufarmacia.com
-- Password: (elige una segura)
-- Copia el UUID del usuario creado

-- 4. Actualizar el perfil del admin
update profiles
set
  org_id = '<ORG_ID_AQUI>',
  location_id = '<LOCATION_ID_AQUI>',
  full_name = 'Administrador',
  role = 'admin',
  pin = '1234'
where id = '<USER_UUID_AQUI>';
```

---

## 4. Configurar variables de entorno

1. En Supabase ve a **Settings → API**
2. Copia:
   - **Project URL** (algo como `https://abcxyz.supabase.co`)
   - **anon public** key
3. En la raíz del proyecto crea un archivo `.env`:

```
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key-aqui
```

> ⚠️ Nunca subas `.env` a GitHub. Ya está en `.gitignore`.

---

## 5. Instalar dependencias y correr localmente

```bash
npm install
npm run dev
```

---

## 6. Deploy en Vercel

1. Sube tu código a GitHub (repositorio privado)
2. Ve a https://vercel.com → New Project → importa tu repo
3. En **Environment Variables** agrega:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Clic en Deploy
5. Tu app estará en `https://tu-proyecto.vercel.app`

---

## 7. Crear usuarios adicionales (POS, Inventario)

Para cada empleado:
1. Ve a Supabase → **Authentication → Users → Add user**
2. Ingresa su correo y contraseña temporal
3. En **SQL Editor** actualiza su perfil:

```sql
update profiles
set
  org_id = '<ORG_ID>',
  location_id = '<LOCATION_ID>',
  full_name = 'Nombre del Empleado',
  role = 'pos'  -- o 'inventory'
where id = '<USER_UUID>';
```

---

## 8. Segunda farmacia (vender a otro cliente)

1. Crea una nueva organización en la tabla `organizations`
2. Crea sus ubicaciones en `locations`
3. Crea sus usuarios en Supabase Auth y actualiza sus perfiles con el nuevo `org_id`
4. Row Level Security (RLS) garantiza automáticamente que no vean los datos de la primera farmacia

---

## Archivos nuevos en este proyecto

| Archivo | Descripción |
|---|---|
| `src/lib/supabase.js` | Cliente de Supabase |
| `src/lib/db.js` | Todas las operaciones de base de datos |
| `src/contexts/AuthContext.jsx` | Autenticación con Supabase Auth |
| `src/contexts/ShiftContext.jsx` | Turnos en Supabase |
| `supabase_schema.sql` | Schema completo de la base de datos |
| `.env.example` | Template de variables de entorno |

