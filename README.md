# GastroLink — Beta `v0.1.0-beta.1`

GastroLink ayuda a restaurantes pequeños y medianos de México a publicar su menú digital y recibir pedidos por WhatsApp. Esta es la primera beta pública: permite probar la gestión multi-negocio, el catálogo, los extras, las fotos y los pedidos desde un panel web.

> **Estado:** beta inicial. Algunas funciones y flujos todavía pueden cambiar. Antes de usarla con clientes reales, configura Supabase, aplica las migraciones y verifica el flujo de pedidos en tu entorno.

## Qué incluye esta beta

- Menús públicos por negocio, accesibles mediante slug y QR.
- Paneles para superadmin, dueños, administradores y personal, con permisos por negocio.
- Alta y edición de negocios, slug sugerido, plantillas iniciales para restaurantes mexicanos y carga de logo optimizado.
- Gestión de categorías, platillos, disponibilidad y extras/modificadores.
- Carga de fotos de platillos optimizadas a WebP y almacenadas en Supabase Storage.
- Carrito con pedidos para mesa, para recoger o a domicilio; el backend valida precios y evita pedidos duplicados.
- Bandeja de pedidos y actualización de estados en el panel.
- Invitación de usuarios y recuperación de contraseña por código enviado por correo.

## Tecnologías

- **Frontend:** Angular 22, TypeScript y Signals.
- **Backend:** Python 3.11+ y FastAPI.
- **Datos, autenticación y almacenamiento:** Supabase (PostgreSQL, Auth, PostgREST y Storage).

## Requisitos

- Node.js compatible con Angular 22 y npm.
- Python 3.11 o posterior.
- Un proyecto de Supabase.

## Configuración

### 1. Base de datos y Storage

En el SQL Editor de Supabase, aplica las migraciones en orden sobre el esquema existente de GastroLink:

1. `backend-api/migrations/001_multi_business.sql`
2. `backend-api/migrations/002_business_menu_templates.sql`
3. `backend-api/migrations/003_orders.sql`
4. `backend-api/migrations/004_dish_photos_storage.sql`
5. `backend-api/migrations/005_order_address_references.sql`

`002` crea las plantillas de menú. `003` y `005` preparan la bandeja de pedidos y completan las columnas del checkout para instalaciones previas. `004` configura el bucket y sus políticas de acceso.

### 2. Variables del backend

Crea `backend-api/.env`:

```env
SUPABASE_URL=https://<PROJECT-REF>.supabase.co
SUPABASE_KEY=<PUBLISHABLE-KEY>
SUPABASE_SECRET_KEY=<SECRET-KEY-SOLO-BACKEND>
CORS_ORIGINS=http://localhost:4200,http://127.0.0.1:4200
```

`SUPABASE_SECRET_KEY` (o la clave heredada `SUPABASE_SERVICE_ROLE_KEY`) es privada: consérvala solo en el backend y en el entorno de despliegue seguro. Nunca la pongas en Angular, en GitHub ni en un archivo `.env` versionado.

Instala y ejecuta el backend:

```bash
cd backend-api
python -m venv .venv
source .venv/bin/activate       # macOS/Linux
# .venv\Scripts\Activate.ps1   # Windows PowerShell
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

API: `http://127.0.0.1:8000/api` · Swagger: `http://127.0.0.1:8000/docs` · Estado: `http://127.0.0.1:8000/health`.

### 3. Variables del frontend

Edita `frontend-app/src/environments/environment.ts` y `environment.development.ts` con la URL del proyecto y su **publishable/anon key**. Esa clave es pública para el navegador; no uses aquí una secret/service-role key.

Instala e inicia Angular:

```bash
cd frontend-app
npm install
npm start -- --host 127.0.0.1 --port 4200
```

Abre `http://127.0.0.1:4200/login`. Para compilar el frontend: `npm run build`.

### 4. Correo y recuperación de contraseña

En Supabase Auth:

- Habilita el proveedor Email y configura SMTP para pruebas con usuarios reales.
- En el template de recuperación de contraseña incluye el token OTP `{{ .Token }}`.
- Agrega las URL de la aplicación a la lista de redirecciones permitidas, por ejemplo `http://localhost:4200/verify-otp` y `http://127.0.0.1:4200/verify-otp`.

Los usuarios restablecen su propia contraseña desde el correo. El dueño puede solicitar el envío de recuperación a un usuario asignado desde la gestión de usuarios; no puede consultar ni ver la contraseña de ese usuario.

## Roles principales

| Rol | Alcance |
| --- | --- |
| `superadmin` | Administra todos los negocios y asignaciones. |
| `business_owner` | Administra el negocio, su menú y sus usuarios. |
| `business_admin` | Administra el menú y la configuración permitida del negocio. |
| `staff` | Acceso operativo limitado, como la gestión de pedidos. |

La autorización se valida en el backend. La pertenencia de usuarios a negocios se representa en `public.user_businesses`.

## Rutas principales

- `/menu/:slug` — menú público.
- `/login` — inicio de sesión.
- `/admin` — entrada al panel y selección de negocio cuando aplica.
- `/admin/businesses` — administración de negocios para superadmin.
- `/admin/businesses/:slug` — panel del negocio.
- `/admin/businesses/:slug/menu`, `/settings`, `/orders` — menú, configuración y pedidos.

## Versión beta en GitHub

La beta está identificada por el tag [`v0.1.0-beta.1`](https://github.com/iariasmx/gastrolink/releases/tag/v0.1.0-beta.1). Las releases de prueba pueden cambiar antes de una versión estable.

## Screenshots

<img width="513" height="615" alt="image" src="https://github.com/user-attachments/assets/42c43d97-6c92-4fd9-be4d-ed12e0117668" />

<img width="1903" height="1037" alt="image" src="https://github.com/user-attachments/assets/522ef27b-3beb-4ad7-ad74-aa7db0c27af5" />

<img width="1896" height="981" alt="image" src="https://github.com/user-attachments/assets/50e5fb0d-8052-4c9e-878e-4b46f0afa041" />

<img width="1890" height="1042" alt="image" src="https://github.com/user-attachments/assets/f25ad20b-3cec-4ec5-a481-920d0b37b76d" />

<img width="1900" height="794" alt="image" src="https://github.com/user-attachments/assets/a96962e3-6e15-4a10-ae86-54e73d112c3a" />

<img width="1906" height="1040" alt="image" src="https://github.com/user-attachments/assets/9cca2670-43a0-475e-9895-b7d647b3bb94" />

<img width="987" height="985" alt="image" src="https://github.com/user-attachments/assets/d3644c2c-8da3-4b3a-8724-103660dcecdf" />

<img width="960" height="912" alt="image" src="https://github.com/user-attachments/assets/215458f0-171e-4e92-8adf-37c404c6be28" />

<img width="1389" height="1029" alt="image" src="https://github.com/user-attachments/assets/e100e59b-83af-49d7-9656-0a15dcc8cf58" />




## Respaldo del README anterior

La versión de README previa a esta edición se conserva completa en [`README-pre-beta-v0.1.0-beta.1.md`](README-pre-beta-v0.1.0-beta.1.md).

## Reportar un problema

Al reportar un error, incluye los pasos para reproducirlo, la ruta donde ocurrió y el mensaje de error. No compartas contraseñas, tokens de sesión ni claves secretas de Supabase.
