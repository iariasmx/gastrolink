# 📱 MenuQR SaaS - Generador de Menús Digitales con Pedidos por WhatsApp (GastroLink)

Un micro-SaaS *bootstrapped* de arquitectura multi-inquilino (*multi-tenant*) diseñado específicamente para el mercado de restaurantes y PyMEs gastronómicas en México. Permite a los negocios digitalizar sus menús, gestionar opciones de servicio (Mesa, Recoger y Servicio a Domicilio) y recibir pedidos estructurados directamente en su cuenta de WhatsApp, eliminando las altas comisiones de las plataformas de entrega tradicionales.

Soporte nativo **multi-negocio**: un superadmin gestiona múltiples restaurantes, cada dueño o administrador de negocio accede únicamente a su menú, configuración, QR y usuarios.

## 🚀 Arquitectura Tecnológica

El proyecto está construido bajo un enfoque de costo operativo de infraestructura cero (\$0 MXN) en su fase de validación, utilizando las capacidades más modernas del ecosistema de desarrollo actual:

*   **Frontend:** **Angular 22** (Standalone Components, Signals + `computed()` para estado reactivo, control flow sintáctico `@if/@for` sin `*ngIf`/`*ngFor`, `ChangeDetectionStrategy.Eager`).
*   **Backend:** Python 3.11+ (FastAPI para APIs de alto rendimiento y tipado estricto Pydantic v2; cliente oficial `supabase` Python con roles y scope por negocio).
*   **Autenticación & Base de Datos:** **Supabase** (PostgreSQL administrado + GoTrue Auth con JWTs). Los JWT se validan siempre en el backend con la `SUPABASE_SECRET_KEY`; la publishable/anon key solo envía correos y firma logins.
*   **Entorno de Desarrollo:** JetBrains Ecosystem (PyCharm / WebStorm) o VS Code.

```text
┌────────────────────────┐       JWT Bearer         ┌────────────────────────┐          ┌──────────────────────────┐
│  Frontend Angular 22   │ ───────────────────────▶ │  Backend FastAPI        │ ───────▶ │  Supabase (PostreSQL +   │
│  Panel Admin + Menús   │ ◀─────────────────────── │  tenant_routes.py       │ ◀─────── │  GoTrue Auth + PostgREST │
└────────────────────────┘    Respuestas 200/401/403└────────────────────────┘          └──────────────────────────┘
          ▲                                                                                          ▲
          │ SDK @supabase/supabase-js (OTP recovery, update password)                                │ Dashboard: Email Templates
          └──────────────────────────────────────────────────────────────────────────────────────────┘ OTP 6 dígitos, Redirect URLs
```

---

## 📁 Estructura del Repositorio

```text
GastroLink/
├── backend-api/         # Microservicio de APIs (Python + FastAPI)
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py      # Punto de entrada FastAPI; mount router /api, /health
│   │   ├── config.py    # Settings (Pydantic) con env_file .env + ../.env
│   │   ├── database.py  # create_supabase_client(url, key) helpers
│   │   ├── schemas.py   # Esquemas Pydantic: Restaurant, Category, Product, Modifier, etc.
│   │   └── tenant_routes.py  # 🔐 TODOS los endpoints: auth, admin crud, menu, modifiers, settings
│   ├── requirements.txt
│   ├── myenv/           # Entorno virtual local (EXCLUIDO de Git; NO se sube)
│   └── .env.example
│
├── frontend-app/        # Aplicación Web y Panel Admin (Angular 22)
│   ├── src/
│   │   └── app/
│   │       ├── components/
│   │       │   ├── login/                       # Inicio de sesión + link "¿Olvidaste tu contraseña?"
│   │       │   ├── reset-password-request/      # Solicitar OTP por correo
│   │       │   ├── verify-otp/                  # 6 inputs OTP, auto-advance, paste distribuido
│   │       │   ├── reset-password/              # Nueva contraseña tras OTP verificado
│   │       │   ├── admin/                       # Panel contextual por negocio (overview + menu + settings, loading skeleton)
│   │       │   └── business-list/               # Listado de negocios (superadmin + multi-negocio)
│   │       ├── services/
│   │       │   ├── auth.service.ts              # Sesión, roles, caché TTL 60s, loginWithSupabaseToken()
│   │       │   ├── supabase.service.ts          # SDK navegador Supabase: OTP recovery, verifyOtp(type=recovery)
│   │       │   └── admin.service.ts             # CRUD negocio / menú / modifiers por businessId
│   │       ├── guards/auth.guard.ts             # Validación token / superadmin / canManageBusiness
│   │       └── app.routes.ts                    # Rutas /login, /reset-*, /verify-otp, /admin/**, /menu/:slug
│   └── package.json
│
├── agente.md         # Guía ejecutable/paso-a-paso para agentes de dev (última rev: 2026-10-08)
├── README.md         # Este documento
└── .gitignore        # Incluye myenv/, **/myenv/, __pycache__/, *.py[cod]
```

---

## 🧑‍🍳 Roles y Permisos Multi-Negocio

Roles declarados en backend (`Literal['superadmin','business_owner','business_admin','staff']`) y replicados en el frontend para el `AuthGuard`. No se confía solo en el cliente; el backend valida todo.

| Acción / Endpoint tipo            | superadmin | business_owner | business_admin |  staff |
| --------------------------------- | :--------: | :------------: | :------------: | :----: |
| Leer datos del negocio (`read`)   |     ✅      |       ✅        |       ✅        |   ✅    |
| Ver/editar menú                   |     ✅      |       ✅        |       ✅        |   ❌    |
| Ver/editar settings del negocio   |     ✅      |       ✅        |       ✅        |   ❌    |
| Gestionar **usuarios** del negocio|     ✅      |       ✅        |       ❌        |   ❌    |
| CRUD restaurantes globales        |     ✅      |       ❌        |       ❌        |   ❌    |
| Acceso a panel `/admin`           |     ✅      |       ✅        |       ✅        |   ❌    |

- Tabla puente clave: **`public.user_businesses(user_id, business_id, role)`** (agrega un usuario a un negocio con un rol específico).
- El superadmin tiene acceso global **sin necesitar fila en user_businesses**; los demás sí.

---

## 🗄️ Modelo de Base de Datos (PostgreSQL / Supabase)

El script completo crea tablas + triggers + constraints. Versión mínima:

```sql
create extension if not exists "uuid-ossp";

-- TABLA DE RESTAURANTES (Configuración general y de entregas)
create table restaurants (
    id uuid primary key default uuid_generate_v4(),
    name varchar(100) not null,
    slug varchar(100) unique not null
        constraint slug_format check (slug ~ '^[a-z0-9-]+$'),
    whatsapp_number varchar(20) not null,
    logo_url text,
    allows_table_order boolean default true,
    allows_takeaway boolean default true,
    allows_delivery boolean default false,
    delivery_fee numeric(10, 2) default 0.00,
    minimum_order numeric(10, 2) default 0.00,
    is_active boolean default true,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create index idx_restaurants_slug on restaurants(slug);

-- TABLA DE USUARIOS (1 fila por auth.users con trigger after create)
create table users (
    id uuid primary key references auth.users(id) on delete cascade,
    email text unique not null,
    full_name text,
    phone text,
    role varchar(20) not null default 'staff'
        check (role in ('superadmin','business_owner','business_admin','staff')),
    is_active boolean default true,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- TABLA PUENTE (usuario pertenece a X negocios con un rol)
create table user_businesses (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid not null references users(id) on delete cascade,
    business_id uuid not null references restaurants(id) on delete cascade,
    role varchar(20) not null default 'staff'
        check (role in ('business_owner','business_admin','staff')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    unique(user_id, business_id)
);
create index idx_user_businesses_user on user_businesses(user_id);
create index idx_user_businesses_business on user_businesses(business_id);

-- TABLA DE CATEGORÍAS (agrupación de platillos por negocio)
create table categories (
    id uuid primary key default uuid_generate_v4(),
    restaurant_id uuid references restaurants(id) on delete cascade not null,
    name varchar(50) not null,
    sort_order integer default 0,
    is_active boolean default true,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- TABLA DE PRODUCTOS / PLATILLOS
create table products (
    id uuid primary key default uuid_generate_v4(),
    category_id uuid references categories(id) on delete cascade not null,
    restaurant_id uuid references restaurants(id) on delete cascade not null,
    name varchar(100) not null,
    description text,
    price numeric(10, 2) not null,
    image_url text,
    is_available boolean default true,
    sort_order integer default 0,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- MODIFICADORES (ej: "Tamaño", "Extras de carne" con opciones y precio extra)
create table modifier_groups (
    id uuid primary key default uuid_generate_v4(),
    product_id uuid references products(id) on delete cascade not null,
    name varchar(100) not null,
    is_required boolean default false,
    min_selection integer default 0,
    max_selection integer default 1,
    sort_order integer default 0,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create table modifier_options (
    id uuid primary key default uuid_generate_v4(),
    modifier_group_id uuid references modifier_groups(id) on delete cascade not null,
    name varchar(100) not null,
    price_extra numeric(10, 2) default 0.00 not null,
    is_available boolean default true,
    sort_order integer default 0,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Trigger genérico updated_at (recomendado para todas las tablas)
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;
select (case when not exists (select 1 from pg_trigger where tgname = 'set_updated_at_' || t) then create_trigger(t) end)
from unnest('{restaurants,users,categories,products,modifier_groups,modifier_options}'::text[]) t;
```

El script completo de migración (incluyendo el trigger para crear fila en `users` cuando se crea el `auth.users`, y RLS) está en los playbooks del proyecto o se puede generar desde `agente.md`.

---

## 🛠️ Configuración e Instalación

### 1. Backend (FastAPI)

1. Navega al directorio del backend e inicializa tu entorno virtual:
   ```bash
   cd backend-api
   python -m venv myenv
   source myenv/bin/activate          # macOS/Linux
   # .\myenv\Scripts\activate         # Windows PowerShell
   ```
2. Instala dependencias (exactas):
   ```bash
   pip install -r requirements.txt
   # o si lo haces manual:
   # pip install fastapi "uvicorn[standard]" pydantic-settings supabase python-dotenv
   ```
3. Crea tu `.env` en la carpeta `backend-api/`. **Necesitas 3 variables**:
   ```env
   # backend-api/.env
   SUPABASE_URL=https://<TU-PROYECTO-REF>.supabase.co
   SUPABASE_KEY=sb_publishable_xxxxxxxxxxxxxxxxxxxxxxxxxxx       # Clave ANON/publishable (para signIn)
   SUPABASE_SECRET_KEY=sb_secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx  # Clave service_role secreta (para get_user y escrituras) ¡SOLO BACKEND!
   ```
   > ⚠️ `SUPABASE_SECRET_KEY` NO sube al frontend, NO al bundle, NO al cliente. Es solo para backend.
4. Levanta el servidor en modo desarrollo:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```
   - Swagger UI: `http://127.0.0.1:8000/docs`
   - Health: `GET http://127.0.0.1:8000/health` → `{"status":"ok"}`
5. Si cambias las variables del `.env` mientras uvicorn corre, **reinícialo** (Pydantic Settings las carga 1 vez al importar).

---

### 2. Frontend (Angular 22)

1. Navega al directorio:
   ```bash
   cd frontend-app
   ```
2. Instala dependencias locales + SDK Supabase navegador (ya listado en `package.json` desde 2026-10-08):
   ```bash
   npm install
   # @supabase/supabase-js ya es dep; si lo quisieras reinstalar: npm i @supabase/supabase-js --save
   ```
3. **Configura credenciales**: abre `src/app/services/supabase.service.ts` y escribe **las MISMAS** `SUPABASE_URL` y anon key que usaste en backend:
   ```typescript
   // frontend-app/src/app/services/supabase.service.ts
   export const SUPABASE_URL = "https://<TU-PROYECTO-REF>.supabase.co";
   export const SUPABASE_ANON_KEY = "sb_publishable_xxxxxxxxxxxxxxxxxxxxxxxxxxx"; // misma que SUPABASE_KEY en .env backend
   ```
   *(Pendiente migrar a `environment.ts`/`fileReplacements` cuando termine la configuración inicial del proyecto).*
4. Inicia el dev server:
   ```bash
   ng serve --host 127.0.0.1 --port 4200
   ```
   - Panel admin login: `http://127.0.0.1:4200/login`
   - Construye producción: `npm run build` (output en `dist/frontend-app/browser/`).

---

### 3. Configuración Obligatoria en el Dashboard de Supabase

Para que **envío de OTPs por correo** y **cambio de contraseña** funcionen, en `Authentication` del dashboard:

1. **Providers → Email**: habilitado (`ENABLED = ON`).
2. **Email Templates → Reset password template**: configura el correo para que muestre **el token numérico de 6 dígitos** (no un magic link). Usa la variable de plantilla `{{ .Token }}` (GoTrue la sustituye por el código de 6 dígitos).
3. **URL Configuration → Redirect URLs allowed**: agrega (ajusta dominio/PUERTO al entorno):
   ```
   http://localhost:4200/verify-otp
   http://127.0.0.1:4200/verify-otp
   http://localhost:4200/reset-password
   http://127.0.0.1:4200/reset-password
   ```
4. **Auth → Rate Limits**: durante pruebas, sube temporalmente límites de "Email OTP" / "Recovery" para no bloquear el correo.

---

## 🔐 Autenticación y Recuperación de Contraseña (OTP 6 dígitos)

Implementado 2026-10-08. **No hay magic links**. Todo flujo de recuperación de contraseña se basa en un código OTP de **6 dígitos enviado por email** mediante Supabase GoTrue.

### Endpoints Auth Backend (FastAPI)

| Método | Endpoint             | Descripción                                                                              |
| :----: | -------------------- | ---------------------------------------------------------------------------------------- |
| POST   | `/api/auth/login`    | `{ email, password }` → Supabase `signInWithPassword` → `{access_token, user, businesses}`. |
| GET    | `/api/auth/me`       | Valida JWT (con `SUPABASE_SECRET_KEY`) y perfil `users`; devuelve usuario + businesses.  |
| POST   | `/api/auth/session`  | `{ access_token: '<JWT de Supabase>' }` → **misma respuesta que `/login`**. Utilizado por el OTP recovery (ya que el JWT viene del cliente JS). |

### Flujo del usuario (Frontend, ruta por ruta):
```
 /login
  │  "¿Olvidaste tu contraseña?"
  ▼
 /reset-password-request   (email → supabase.signInWithOtp email OTP → guarda email en localStorage gastrolink_recovery_email)
  │
  ▼
 /verify-otp               (6 inputs OTP → verifyOtp({email, token, type:'recovery'}) → POST /api/auth/session para cargar perfil/negocios)
  │
  ▼
 /reset-password           (updateUser({password}) sobre la sesión recovery → redirección 2.5s a /login)
  │
  ▼
 /login                    (ya puedes entrar con email + contraseña nueva)
```

#### Componentes de UI del flujo
- **ResetPasswordRequestComponent**: email → botón Enviar código.
- **VerifyOtpComponent**: 6 inputs independientes, auto-advance, backspace que salta atrás, flechas L/R, Ctrl+V distribuye código de 6 dígitos desde cualquier celda. No hay desincronía entre la Signal `digits()` y el valor mostrado en el input (garantizado con `queueMicrotask` tras cada write).
- **ResetPasswordComponent**: si accedes directamente aquí sin verificar OTP antes, muestra banner "Primero verifica tu código" y bloquea el formulario (validación via `hasRecoverySession()` del SDK de Supabase).

### Mensajes de error traducidos al español
El servicio `SupabaseService` traduce status HTTP del `AuthError`:
| Status | Mensaje al usuario                                                                    |
| :----: | ------------------------------------------------------------------------------------- |
| 401/403| El código de recuperación no es válido o ha expirado. Solicita uno nuevo.             |
| 422    | La contraseña no cumple los requisitos de seguridad (long, mayúsc/núm/símbolo…) / El código no coincide. |
| 429    | Has hecho demasiados intentos. Espera unos minutos e inténtalo de nuevo.             |

---

## ⚡ Optimizaciones (aplicadas 2026-10-08)

**Problema resuelto**: "la carga de las páginas para administrar el negocio tardan unos segundos".

### Frontend
- **AuthService cache TTL 60s**: 1ª carga de `/auth/me` normal; navegaciones subsiguientes entre tabs overview/menu/settings → `loadCurrentUser()` devuelve `of(true)` instantáneo (0ms, 0 llamada HTTP). La caché se invalida si cambia el JWT o al hacer logout.

### Backend
Antes: `GET /api/businesses/:id/menu?include_all=true` lanzaba **~60 requests HTTP individuales a PostgREST** por menú mediano (1 restaurante → N categorías → M productos → O modifier_groups → P modifier_options).
Ahora:
- **`_rows_cache[ (tabla, filtros) ]`**: caché en memoria (máx 2048 entradas; FIFO 64 limpieza al llenarse) sobre la función `rows()` de consultas PostgREST.
- **`_menu_cache[ (business_id, include_all) ]`**: caché de la respuesta final (objeto completo `FullMenuResponse` ya armado).
- **Invalidación automática**: cualquier `write()` o `remove()` en `tenant_routes.py` llama `clear_menu_cache()` + invalida `_rows_cache` solo de las tablas afectadas (mapa de dependencias: modifier_options → groups → products → categories → restaurants). No se muestra data vieja.

### UX Loading
- Se eliminó el texto "Cargando negocio?" de `AdminComponent`. En su lugar se muestra una **pantalla de carga amigable**:
  - Spinner circular de marca (verde #25d366 + azul oscuro) + pulso radial.
  - Título "Cargando tu panel de administración" con subtítulo humano (incluye nombre del negocio, si ya está disponible en caché).
  - **Skeleton shimmers** de la estructura real (1 header + grid 1 QR grande + 3 stats pequeñas). Aria `role="status"` y `aria-live="polite"`.

---

## 🧠 Flujos del Negocio Implementados

### Gestión de Estado de la Orden (Angular Signals)
El carrito de compras calcula cantidades, subtotales y adiciones condicionales (como el costo de envío configurado por el restaurante) de manera reactiva y síncrona en el cliente mediante la API nativa de **Signals**, evitando sobrecargar la memoria con suscripciones manuales de RxJS.

### Canalización de Pedidos por WhatsApp (Costo de API \$0)
El cierre de la venta y la logística de entrega se delegan por completo al operador del restaurante. El sistema concatena el carrito de compras junto con los detalles de entrega recopilados dinámicamente en el formulario de Checkout (Dirección, referencias de domicilio y método de pago) y redirige al comensal mediante la API abierta de WhatsApp Web/App utilizando codificación de caracteres estándar (`encodeURIComponent`), garantizando el envío seguro de la orden sin costos por mensaje de broker de mensajería externa.

### Selección automática / Switcher de Negocio en Admin
- superadmin entra en `/admin` → redirige al listado `/admin/businesses`.
- usuario con **1 solo negocio asignado** entra en `/admin` → redirige directamente a `/admin/businesses/:slug` (overview del negocio).
- usuario con múltiples negocios → selector / listado para elegir.
- `AdminComponent` **no carga un negocio fijo**: resuelve `businessId/slug` desde `ActivatedRoute.paramMap` y carga `AuthService.getBusinessByIdOrSlug(...)` + `AdminService.getBusinessMenu(...)`.

### 🎨 Psicología del Color & Diseño de Alta Conversión Gastronómica
La interfaz del menú público para comensales fue diseñada aplicando principios de la psicología del color orientados a la industria gastronómica:

* **Rojo Carmesí & Coral (`#e11d48` / `#f43f5e`):** Estimula el sistema nervioso simpático, desencadenando el apetito y aumentando el impulso de compra. Aplicado en botones CTA **"+ Añadir al Pedido"**, pestañas activas y carrito flotante.
* **Ámbar Dorado Tostado (`#f59e0b` / `#b45309`):** Evoca sensaciones visuales de horneado, parrilla artesanal y calidad de ingredientes (etiquetas de precio, badges destacados).
* **Fondo Marmolado Cálido (`#fafaf9`):** Higiénico pero acogedor, optimiza el contraste de las fotografías de los platillos.
* **Glass card Admin:** gradiente 135° `#0f172a → #1e293b` con botones verde WhatsApp `#25d366` (hover + loading states incluidos).

---

## 🗺️ Roadmap de Desarrollo Técnico (Checklist)

### ✅ Base + Core
- [x] Configuración del esquema relacional en PostgreSQL (Supabase) + triggers `updated_at` + perfil `users`.
- [x] Estructuración del Backend Base en FastAPI (tenant_routes, schemas, config, database).
- [x] Arquitectura reactiva del carrito en Angular mediante Signals.
- [x] Consultas optimizadas (menú completo por slug / businessId, include_all protegido).
- [x] Ruta dinámica `/menu/:slug` por código QR + generador de QR descargable/imprimible.
- [x] Panel administrativo (`/admin`) CRUD de productos y modificadores.

### ✅ Multi-Negocio (Fase 1-2 Completada 2026-10-07/08)
- [x] Backend: 4 roles + tabla `user_businesses` + scoped records por negocio.
- [x] Endpoints login, `/auth/me`, **nuevo `/auth/session`** (intercambio JWT OTP → sesión backend).
- [x] Superadmin CRUD global de negocios. Transacción crear-negocio → dueño → asociación.
- [x] Aislamiento: business_admin NO modifica productos de otro negocio (403).
- [x] Frontend: AuthService + AuthGuard (`superadmin`, `canManageBusiness`).
- [x] `/admin/businesses` (listado) + `/admin/businesses/:slug` (overview contextual).
- [x] Caché TTL frontend, cachés rows/menu backend con invalidación automática.

### ✅ Recuperación de Contraseña (Fase nueva 2026-10-08)
- [x] SDK Supabase navegador (`@supabase/supabase-js`) instalado y persistido en `package.json`.
- [x] Pantallas: `/reset-password-request`, `/verify-otp` (6 inputs), `/reset-password`.
- [x] Integración Supabase `signInWithOtp → verifyOtp(type:recovery) → updateUser(password)`.
- [x] Sesión OTP reconocida por el backend mediante `POST /api/auth/session` (no queda solo en navegador).
- [x] Mensajes de error en español por status code (401/403/422/429).
- [x] Corrección bugs verify-otp: paste Array length negativo, getter privado en template, desincronía DOM↔signal.

### 🟡 Fase 3 (Pendiente)
- [ ] `BusinessFormComponent` (alta y edición de restaurante + plantillas).
- [ ] UI asignación de usuarios a un negocio (lista + search + dropdown roles).
- [ ] Validación visual de slug + errores 409 duplicado / 422 formato.

### 🟡 Fase 4 (Pendiente)
- [ ] Helpers AdminService dedicados para categorías (create/update/delete reutilizables).
- [ ] Modelos TS de usuario / user_businesses formales en `models/auth.model.ts`.
- [ ] Completar campos `sort_order`, `is_active` a nivel de UI admin (drag-and-drop / toggles).
- [ ] Reemplazar credenciales inline `supabase.service.ts` por `environment.{dev,prod}.ts` + fileReplacements.
- [ ] Migrar credenciales heredadas de service role a formato nuevo `sb_secret_...` (a más tardar finales 2026).

### 🔜 Fase 5 (Opcionales / Futuro)
- [ ] Plantillas al crear negocio: empty / taquería / hamburguesería / cafetería / pizzería / restaurante_general (categorías base seed).
- [ ] Módulo de asignación avanzada de usuarios (invitar por email directo sin que tenga que hacer password reset).
- [ ] Módulo de pedidos: guardar pedidos en BD y panel "Pedidos en curso" por negocio.
- [ ] Multi-idioma (ES/EN) para el menú público.

---

## 🧹 Limpieza del Repositorio y .gitignore

- `myenv/` y `**/myenv/` (entornos virtuales en cualquier subcarpeta) están excluidos del tracking Git.
- `__pycache__/`, `*.py[cod]`, `.pytest_cache`, `.ruff_cache` ya están excluidos por reglas globales.
- **Acción 2026-10-08**: se eliminaron del index de Git archivos `.pyc` antiguos + binarios `.pyd/exe` de `myenv` que habían sido trackeados por error. Si en tu entorno local alguna vez vuelves a ver archivos de bytecode en `git status`, ejecuta una sola vez:
  ```bash
  git rm -r --cached backend-api/app/__pycache__
  git rm -r --cached backend-api/myenv
  ```

---

## 📚 Referencias y más detalles

Para desarrollo a detalle, scripts de migración completa, contratos endpoint por endpoint y checklist granular de fases, consulta:
- [agente.md](file:///g:/Desarrollo/Proyectos/gastrolink/agente.md) — guía ejecutable y progreso fases, última revisión **2026-10-08**.

Soporte y gestión de incidencias: reporta bugs con captura del `Network → Request/Response` (Supabase o FastAPI) y correo del usuario afectado (si aplica).
