# Fase 1: backend multi-negocio

## Instalación

1. Aplicar `migrations/001_multi_business.sql` una sola vez mediante el SQL Editor de Supabase, sobre el esquema existente. La migración es transaccional y conserva los restaurantes y sus menús; fallará sin cambios si los datos existentes violan los nuevos constraints. No ejecutar `seed.sql`: contiene `TRUNCATE` y deshabilita RLS.
2. Configurar `SUPABASE_SECRET_KEY=sb_secret_...` en el `.env` del backend para habilitar administración. También se admite la clave heredada mediante `SUPABASE_SERVICE_ROLE_KEY`. La prioridad es `SUPABASE_SECRET_KEY`, después `SUPABASE_SERVICE_ROLE_KEY` y finalmente `SUPABASE_KEY` para lecturas públicas previas a la migración. Mantener `SUPABASE_KEY` como clave pública para el cliente de login. Nunca llevar claves secretas al frontend. El backend puede iniciar con el `.env` existente; si faltan ambas claves administrativas, las operaciones administrativas responden 503. Tras aplicar RLS, las lecturas públicas también necesitan que el backend use una clave administrativa. Se carga `app/.env` como compatibilidad y el `.env` raíz del backend tiene prioridad, independientemente de dónde se ejecute Python.

   Preferir las nuevas claves secretas `sb_secret_...` para nuevas configuraciones. Las claves secretas identifican al backend y no son JWT de usuario; los tokens de acceso del login siguen verificándose mediante Supabase Auth.
3. Crear el usuario inicial mediante Supabase Auth y, desde el SQL Editor, promover su perfil existente:

   ```sql
   UPDATE public.users SET role = 'superadmin'
   WHERE email = 'correo-real-del-administrador@ejemplo.com';
   ```

4. Asignar los administradores existentes a sus negocios en `user_businesses` antes de usar el panel; la migración no inventa asociaciones ni concede permisos a todos los usuarios.
5. Iniciar con `python -m uvicorn app.main:app --reload` y comprobar `/docs` y `/api/auth/me` usando un login real.

## Contrato

- `POST /api/auth/login`: token real de Supabase Auth, `user`, `businesses` y `user_email` para compatibilidad de lectura.
- `GET /api/auth/me`: usuario activo y negocios accesibles. `GET /api/me/businesses`: lista de negocios accesibles.
- `/api/admin/businesses`: GET/POST; `/{business_id}`: GET/PUT/DELETE, solo superadmin.
- `/api/admin/businesses/{business_id}/users`: GET/POST; `/{user_id}`: DELETE, superadmin o dueño asignado.
- `/api/businesses/{business_id}/menu`: GET protegido; `include_all` por defecto es `true`.
- `/api/businesses/{business_id}/settings`: PUT protegido, con actualizaciones parciales.
- `/api/businesses/{business_id}/categories`, `/products`, `/modifier-groups` y `/modifier-options`: POST y PUT/DELETE por ID, con comprobación de negocio y del recurso padre. PUT acepta cambios parciales.
- `/api/restaurants/by-slug/{slug}`: GET público; `include_all=false` por defecto. `true` exige permiso para administrar el menú.

El rol global `superadmin` concede administración general. Los permisos de los demás usuarios dependen del rol en `user_businesses`; un usuario puede tener distintos roles en distintos negocios. `staff` no administra el menú. Se eligió permitir configuración a `business_admin`, opción permitida por el documento.

Los usuarios nuevos se crean en Supabase Auth con una contraseña aleatoria que no se devuelve y sin enviar mensajes. Deben completar la recuperación de contraseña y confirmación de correo mediante el flujo de Auth configurado por el proyecto. Las contraseñas se almacenan únicamente en Supabase Auth. El negocio y su relación con el dueño se crean en una transacción SQL; si esta falla, puede quedar el usuario de Auth sin negocio y se reutilizará en el siguiente intento.

Las rutas antiguas `/api/products`, `/api/categories`, `/api/modifier-groups`, `/api/modifier-options` y PUT `/api/restaurants/{id}` se retiraron. El frontend actual debe migrar sus llamadas y adjuntar el JWT en las fases 2 y 4. No hay login demo en el backend.

RLS está habilitado y `anon`/`authenticated` no tienen acceso directo a las tablas de la aplicación. La API usa la clave de servicio y valida permisos antes de cada operación. El cliente de login es separado para evitar que la sesión de un usuario sustituya la credencial del cliente de base de datos.

## Validación

Desde la carpeta del backend:

```powershell
python -m unittest discover -s tests -v
```

Las pruebas usan una base y autenticación simuladas: verifican contratos HTTP, autorización e aislamiento sin conexiones ni cambios en Supabase. La aplicación de la migración, RLS, los triggers, Auth real y la creación transaccional deben verificarse contra un proyecto Supabase configurado antes de dar la fase por terminada.
