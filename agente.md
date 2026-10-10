# Instrucciones para agente de desarrollo - GastroLink Multi-Negocio

## Objetivo principal

Convertir la app actual en una plataforma **multi-tenant**, donde un admin general pueda gestionar varios negocios y cada negocio pueda gestionar su propio menú, configuración y código QR.

```text
Admin general
└── Gestiona negocios
    ├── Negocio A
    │   └── Admin del negocio gestiona menú/configuración/QR
    ├── Negocio B
    │   └── Admin del negocio gestiona menú/configuración/QR
    └── Negocio C
        └── Admin del negocio gestiona menú/configuración/QR
```

No crear un panel separado por negocio. Reutilizar el panel actual, pero hacerlo dependiente del negocio seleccionado.

---

## Backend requerido

### 1. Modelo de datos recomendado

Implementar o adaptar las siguientes entidades:

```text
restaurants / businesses
├── id
├── name
├── slug
├── whatsapp_number
├── logo_url
├── allows_table_order
├── allows_takeaway
├── allows_delivery
├── delivery_fee
├── minimum_order
├── is_active
├── created_at
└── updated_at

users
├── id
├── email
├── password_hash
├── role
├── is_active
├── created_at
└── updated_at

user_businesses
├── id
├── user_id
├── business_id
├── role
├── created_at
└── updated_at

categories
├── id
├── business_id / restaurant_id
├── name
├── sort_order
├── is_active
├── created_at
└── updated_at

products
├── id
├── business_id / restaurant_id
├── category_id
├── name
├── description
├── price
├── image_url
├── is_available
├── sort_order
├── created_at
└── updated_at

modifier_groups
├── id
├── product_id
├── name
├── is_required
├── min_selection
├── max_selection
├── sort_order
├── created_at
└── updated_at

modifier_options
├── id
├── modifier_group_id
├── name
├── price_extra
├── is_available
├── sort_order
├── created_at
└── updated_at
```

La tabla clave es:

```text
user_businesses
```

Esta tabla permite asignar usuarios a negocios y controlar qué negocio puede administrar cada usuario.

---

## Roles requeridos

Implementar roles:

```typescript
type UserRole = "superadmin" | "business_owner" | "business_admin" | "staff";
```

### Permisos esperados (Backend + Frontend, implementados 2026-10-08)

Los permisos **se validan tanto en frontend (Guards) como en backend (función `permit()` en `tenant_routes.py`)**. No se confía solo en el cliente.

| Acción                          | superadmin | business_owner | business_admin |    staff |
| ------------------------------- | ---------: | -------------: | -------------: | -------: |
| Crear negocios                  |         Sí |             No |             No |       No |
| Editar cualquier negocio        |         Sí |             No |             No |       No |
| Editar su negocio               |         Sí |             Sí |             Sí |       No |
| Gestionar usuarios del negocio  |         Sí |             Sí |             No |       No |
| Gestionar menú (CRUD productos) |         Sí |             Sí |             Sí |       No |
| Ver overview / stats / QR       |         Sí |             Sí |             Sí |       No |
| Editar configuración de negocio |         Sí |             Sí |             Sí |       No |
| Ver menú público / include_all  |         Sí |             Sí |             Sí |       Sí |
| Acceso a panel `/admin`         |         Sí |             Sí |             Sí |       No |

- `staff` actualmente no tiene acceso al panel admin frontend; AuthService `canManageBusiness()` lo excluye.
- La validación de permisos por acción está codificada en `allowed` dentro de `tenant_routes.py` (backend) y `AuthService.canManageBusiness()` / guards (frontend).

---

## Endpoints requeridos

### Autenticación

```http
POST /api/auth/login
GET  /api/auth/me
POST /api/auth/session   # Nuevo 2026-10-08
```

#### Login (`POST /api/auth/login`)
El login debe regresar token, usuario y negocios asociados. **No** usa credenciales demo; falla con 401 si Supabase Auth no valida email/password.

Respuesta:

```json
{
  "access_token": "jwt-supabase",
  "token_type": "bearer",
  "user": {
    "id": "user-id",
    "email": "admin@gastrolink.mx",
    "role": "superadmin"
  },
  "businesses": [
    {
      "id": "business-id",
      "name": "Tacos El Pastor",
      "slug": "tacos-el-pastor",
      "role": "business_owner"
    }
  ]
}
```

#### Session Exchange (`POST /api/auth/session`) — Nuevo 2026-10-08
Para flujos alternos que generan el JWT en el cliente (ej: OTP de recuperación validado en Supabase JS SDK), acepta un `access_token` de Supabase y devuelve **la misma respuesta que `/api/auth/login`**:

```jsonc
// Body request
{ "access_token": "eyJhbGciOi...<JWT Supabase>" }

// Body response (igual que /login)
{ "access_token": "...", "token_type": "bearer", "user": {...}, "businesses": [...] }
```
- Utiliza internamente el mismo `current_user()` (valida JWT contra Supabase + perfil activo en tabla `users`).
- Si el perfil está inactivo o no existe → 403.

### Registro de actividad y logs 2026-10-08
Para facilitar depuración de 401, el backend loguea por logger:
- `/auth/login`: email que intentó autenticarse + prefijo + longitud de la `SUPABASE_KEY` cargada (para detectar si uvicorn sigue usando la clave vieja).
- `current_user()`: excepción real de Supabase `get_user` + tipo de clave (secret/service role).
- Excepción de sign_in con mensaje real (no solo "Credenciales incorrectas").

---

## Superadmin: gestión de negocios

Endpoints requeridos:

```http
GET /api/admin/businesses
POST /api/admin/businesses
GET /api/admin/businesses/:businessId
PUT /api/admin/businesses/:businessId
DELETE /api/admin/businesses/:businessId
POST /api/admin/businesses/:businessId/users
DELETE /api/admin/businesses/:businessId/users/:userId
```

### Crear negocio

```http
POST /api/admin/businesses
```

Payload:

```json
{
  "name": "Hamburguesas Norteñas",
  "slug": "hamburguesas-nortenas",
  "whatsapp_number": "525512345678",
  "logo_url": "https://...",
  "allows_table_order": true,
  "allows_takeaway": true,
  "allows_delivery": true,
  "delivery_fee": 35,
  "minimum_order": 100,
  "is_active": true,
  "owner_email": "dueno@negocio.com"
}
```

El backend debe:

1. Crear el negocio.
2. Crear o reutilizar el usuario dueño.
3. Crear relación en `user_businesses`.
4. Opcionalmente crear categorías base.
5. Devolver el negocio creado.

---

## Negocio: gestión del menú

Endpoints recomendados con contexto de negocio (todos implementados en `register_resource()` `tenant_routes.py`):

```http
GET    /api/businesses/:businessId/menu?include_all=true
PUT    /api/businesses/:businessId/settings

POST   /api/businesses/:businessId/categories
PUT    /api/businesses/:businessId/categories/:categoryId
DELETE /api/businesses/:businessId/categories/:categoryId

POST   /api/businesses/:businessId/products
PUT    /api/businesses/:businessId/products/:productId
DELETE /api/businesses/:businessId/products/:productId

POST   /api/businesses/:businessId/modifier-groups
PUT    /api/businesses/:businessId/modifier-groups/:groupId
DELETE /api/businesses/:businessId/modifier-groups/:groupId

POST   /api/businesses/:businessId/modifier-options
PUT    /api/businesses/:businessId/modifier-options/:optionId
DELETE /api/businesses/:businessId/modifier-options/:optionId
```

---

## Menú público

Mantener menú público por slug:

```http
GET /api/restaurants/by-slug/:slug?include_all=false
```

Reglas:

- Si `include_all=false`, devolver solo productos disponibles y negocio activo.
- Si `include_all=true`, permitirlo solo para usuarios autenticados con permiso sobre ese negocio.
- Si el negocio está inactivo, devolver error o respuesta controlada.

---

## Flujo de recuperación de contraseña (OTP 6 dígitos) — Implementado 2026-10-08

Ya no se usa magic link ni tokens en el URL. El flujo es **código de 6 dígitos enviado por email** (OTP) validado en Supabase con `verifyOtp({ type: 'recovery' })`.

### Pasos (Frontend + Backend)

1. **Pantalla `/reset-password-request`**
   - Usuario introduce email → `SupabaseService.sendRecoveryOtp(email)`.
   - Internamente llama `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo } })`.
   - Guarda el email pendiente en `localStorage` clave `gastrolink_recovery_email`.
   - Redirige a `/verify-otp`.

2. **Pantalla `/verify-otp`**
   - 6 inputs independientes (1 por dígito), auto-advance, backspace delete, flechas, paste Ctrl+V de código completo.
   - El email pre-cargado viene de `SupabaseService.getPendingRecoveryEmail()` (si no existe, muestra error "Empieza de nuevo").
   - Al completar los 6 dígitos:
     1. `SupabaseService.verifyRecoveryOtpWithSession(email, otp)` → llama `supabase.auth.verifyOtp({ email, token: otp, type: 'recovery' })` y devuelve `accessToken` + success.
     2. **(IMPORTANTE)** `AuthService.loginWithSupabaseToken(accessToken)` → **POST `/api/auth/session`** para cargar perfil `public.users` + `businesses` y que AuthGuard reconozca la sesión (sin esto, el backend no sabe quién es aunque Supabase en navegador sí).
     3. Si la respuesta de `/auth/session` OK → "Código verificado" + `setTimeout` 1,2s → navega `/reset-password`.

3. **Pantalla `/reset-password`**
   - Valida que exista sesión de recovery en Supabase (la deja la validación de OTP). Si alguien entra directo sin OTP, muestra banner y botón **"Ir a verificar código"**.
   - Dos campos password: mínimo 6 caracteres + coincidencia.
   - Submit: `supabase.auth.updateUser({ password })` + en 2,5s redirige a `/login`.

### Reglas Supabase Dashboard para que funcione
- Auth → Providers → Email: habilitado.
- Auth → Email Templates: Reset password template envía **OTP** (template con `{{ .Token }}`). **No magic link**.
- Auth → URL Configuration → Redirect URLs: añadir el de verify-otp (ej: `http://localhost:4200/verify-otp`) y el de reset-password si aplica.

### Mensajes de error traducidos
El `SupabaseService` define `AuthResult { success, error? }` y traduce `AuthError.status` a mensajes legibles:
- 401/403 → "El enlace/código ha expirado o no es válido…"
- 422 (password) → "La contraseña no cumple con los requisitos de seguridad…"
- 422 (otp) → "El código no coincide, revisa los 6 dígitos."
- 429 → "Demasiados intentos. Espera unos minutos."

---

## Seguridad obligatoria

Cada endpoint protegido debe validar:

1. JWT válido.
2. Usuario activo.
3. Rol del usuario.
4. Relación del usuario con el negocio.
5. Que el recurso pertenezca realmente al negocio.

Ejemplo:

```http
PUT /api/businesses/:businessId/products/:productId
```

Debe verificar:

```text
El usuario puede administrar businessId.
El producto pertenece a businessId.
```

No permitir editar productos solo por ID sin comprobar negocio.

---

## Frontend requerido

El frontend está en Angular. Se debe reutilizar el panel actual de administración, pero eliminar la dependencia de un negocio fijo.

### Versiones usadas (actualizadas 2026-10-08)
```jsonc
"@angular/core": "^22.2.1"
"@angular/cli":  "^22.2.0"
"typescript":    "~6.0.3"
"@supabase/supabase-js": "^2.x"   // Añadido 2026-10-08
```
- Todos los componentes nuevos y existentes usan `standalone: true`, `ChangeDetectionStrategy.Eager`, Signals (`signal()`, `computed()`) y control flow sintáctico (`@if / @else`, `@for`, `track`). **No hay NgModules**.
- Forms binding con Signals usa `[ngModel]="signalFn()" (ngModelChange)="signal.set($event)"` (no banana-in-a-box directo sobre WritableSignal, que Angular 22 no soporta).

### Rutas implementadas 2026-10-08

```text
/login
/reset-password-request    # solicitar OTP por correo
/verify-otp                # introducir 6 dígitos
/reset-password            # nueva contraseña (solo si validaste OTP antes)

/admin
/admin/businesses
/admin/businesses/new
/admin/businesses/:businessId
/admin/businesses/:businessId/menu
/admin/businesses/:businessId/settings
/menu/:slug
```

**Redirecciones automáticas AuthGuard/Resolver:**
- Si el usuario es `superadmin`, `/admin` → `/admin/businesses` (listado).
- Si el usuario tiene **1 solo negocio** asignado, `/admin` redirige directo a `/admin/businesses/:businessId` (overview).
- Si tiene varios negocios, muestra selector/listado.
- Las rutas `/admin/...` con `canActivate: [AuthGuard]` + `canMatch` validan token + `loadCurrentUser()` (sin esto no carga los businesses para la validación).

---

## Cambios en servicios frontend

### AuthService — Actualizado 2026-10-08

Guarda en signals y persiste en `localStorage` (`gastrolink_token`, `gastrolink_business_id`, `gastrolink_user_email`):

- Token.
- Usuario actual (completo: `id, email, role, is_active, full_name, phone`).
- Rol global (`currentUser.role`).
- Negocios disponibles (`businesses()` Signal, array de `{ id, slug, name, role, ...rest }`).
- Negocio seleccionado (`selectedBusinessId()`).

**Nuevo 2026-10-08: Caché TTL de sesión en memoria**
Para evitar **1-2 llamadas a `/api/auth/me` por cada navegación**:
```typescript
private readonly ttlMs = 60_000;
private lastSessionLoadedAt = 0;
private lastSessionToken: string | undefined;
```
- Si el JWT no cambia, `lastSessionToken === token()` y han pasado <60s, `loadCurrentUser()` devuelve `of(true)` instantáneo (0ms, 0 llamadas HTTP).
- Si se hace logout o cambia el token, se invalidan los timestamps.
- Mantiene `shareReplay + refCount` para deduplicar peticiones simultáneas (Guard + resolver lo piden en paralelo, 1 solo `/auth/me`).

Métodos implementados:

```typescript
login(email: string, password: string): Observable<boolean>
logout()
loadCurrentUser(): Observable<boolean>         # con caché TTL 60s
loginWithSupabaseToken(accessToken: string)    # NUEVO 2026-10-08
getCurrentUser()
getUserBusinesses()
isSuperadmin()
canManageBusiness(businessId: string)          # superadmin || business_owner/business_admin
getBusinessByIdOrSlug(idOrSlug: string)        # usado en AdminComponent para resolver la ruta
selectBusiness(id: string)                     # guarda en localStorage gastrolink_business_id
removeBusinessFromSession(id: string)          # cuando superadmin elimina un negocio
clearSession()
```

---

### AdminService

Métodos (todos implementados):

```typescript
getBusinesses(): Observable<Restaurant[]>
getBusinessById(id: string): Observable<Restaurant>
createBusiness(payload): Observable<Restaurant>
updateBusiness(businessId: string, payload): Observable<Restaurant>
deleteBusiness(businessId: string): Observable<unknown>

getBusinessMenu(businessId: string): Observable<FullMenuResponse>   # incluye restaurant + categories.products.modifier_groups.options
updateBusinessSettings(businessId: string, payload): Observable<Restaurant>

createProduct(businessId, payload)
updateProduct(businessId, productId, payload)
deleteProduct(businessId, productId)

saveModifierGroup(businessId, productId, payload)   # crea o actualiza si group.id existe
deleteModifierGroup(businessId, groupId)

saveModifierOption(businessId, groupId, payload)
deleteModifierOption(businessId, optionId)
```

> Nota: el backend expone el CRUD contextual de categorías mediante `register_resource('categories', ...)`; el frontend ya cuenta con helpers y controles administrativos para crear, editar, activar/desactivar y eliminar categorías.

---

### SupabaseService — NUEVO 2026-10-08

Ubicación: `frontend-app/src/app/services/supabase.service.ts`.  
Integra `@supabase/supabase-js` en el navegador para recuperar contraseña por OTP.  
La URL y publishable/anon key son las mismas que usa el backend (`SUPABASE_URL` y `SUPABASE_KEY`). Se configuran en `frontend-app/src/environments/environment.ts` y `environment.development.ts`; la publishable key es pública y el secret key nunca se incluye en el bundle.

```typescript
createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
});
// detectSessionInUrl=false porque NO usamos magic link; todo es OTP manual.
```

Métodos de cara al exterior:
```typescript
sendRecoveryOtp(email): Observable<AuthResult>
verifyRecoveryOtp(email, token): Observable<AuthResult>
verifyRecoveryOtpWithSession(email, token): Observable<AuthResultWithToken extends AuthResult { accessToken?: string }>
hasRecoverySession(): Observable<boolean>     # ¿hay sesión recovery en Supabase JS SDK?
getPendingRecoveryEmail(): string | null      # localStorage gastrolink_recovery_email
setPendingRecoveryEmail(email)
clearPendingRecoveryEmail()
```

---

### MenuService

Mantener:

```typescript
loadMenuBySlug(slug: string, includeAll = false)
```

---

## Componentes frontend requeridos y existentes

### 1. LoginComponent — Actualizado 2026-10-08
- Añade RouterModule para `[routerLink]`.
- Añade enlace **"¿Olvidaste tu contraseña?"** (`forgot-password`) que navega a `/reset-password-request`.
- Estilo glass-card (gradiente 135° #0f172a→#1e293b, verde #25d366 hover, 24px border-radius).

### 2. ResetPasswordRequestComponent — NUEVO 2026-10-08
- Standalone, signals (`email`, `loading`, `errorMessage`, `successMessage`), `ChangeDetectionStrategy.Eager`.
- Email requerido. En submit: `sendRecoveryOtp` + banner "Te enviamos un correo…" y redirección automática a `/verify-otp`.
- Enlace `← Volver al inicio de sesión` → `/login`.

### 3. VerifyOtpComponent — NUEVO 2026-10-08
- 6 inputs `digit-input` con auto-advance, backspace-char + jump, flechas L/R, paste distribuido.
- Solo números (`/\D/g` reemplazado). Dígitos +6 se truncan. Nunca Array negativo al pastear.
- Signal `otpComplete = computed(()=> digits().every(d=>!!d))` reemplaza el getter privado `otpToken` usado en template (no causa reevaluaciones infinitas en ChangeDetection.Eager).
- Sync DOM ↔ signal garantizado con `queueMicrotask` tras cada write, evitando que saltos al siguiente input pierdan caracteres al tipear rápido.
- Botón submit `Verificar código` disabled hasta los 6 dígitos.
- Botón **Reenviar código** (llama sendRecoveryOtp de nuevo).
- Si no hay email pendiente: banner de error y botón `Solicitar código` de vuelta a `/reset-password-request`.

### 4. ResetPasswordComponent — NUEVO 2026-10-08
- Valida sesión recovery en `ngOnInit()` usando `hasRecoverySession()`; si no, muestra **banner "Primero verifica tu código"** y botón link al verify.
- Signals: `password`, `confirmPassword`, `loading`, `errorMessage`, `successMessage`, `invalidLink`.
- Validaciones: 6 caracteres mín + coincidencia.
- Success: `setTimeout(2500) → /login`.

### 5. BusinessListComponent
Pantalla para admin general.

Funciones:
- Listar negocios.
- Buscar/filtrar negocios.
- Mostrar estado activo/inactivo.
- Botón crear negocio.
- Botón entrar al panel del negocio.
- Botón editar negocio.
- (superadmin solo) Botón eliminar negocio con confirm + `AuthService.removeBusinessFromSession`.

Ruta sugerida:

```text
/admin/businesses
```

### 6. BusinessFormComponent
Formulario para crear/editar negocio (`BusinessFormComponent`, implementado en Fase 3).

### 7. AdminComponent actualizado — Actualizado 2026-10-08 (UI loading)
- Recibe `businessId/slug` desde la ruta `paramMap` y carga el negocio por `AuthService.getBusinessByIdOrSlug`.
- Tabs: overview, menu, settings. Navega cambiando la URL.
- **UI Loading 2026-10-08**: reemplazado el `<p>Cargando negocio?</p>` por **pantalla de carga amigable**:
  - Spinner circular dual-colores marca (verde #25d366 + azul #0f172a) + pulso radial animado.
  - Título: "Cargando tu panel de administración"
  - Subtítulo: con nombre del restaurante (si ya está en cache) o genérico.
  - Skeleton stack (shimmer animado): un `skeleton-header` que replica el `admin-header` y grid 1+3 tarjetas (área QR grande + 3 stat boxes).
  - Aria `role="status"` + `aria-live="polite"` para lectores.
- El botón "Cambiar negocio" en sidebar navega a `/admin/businesses`.

---

## QR y menú público

El QR debe generarse con:

```text
{origin}/menu/{slug}
```

Cada negocio debe tener un `slug` único. En AdminComponent overview:
```typescript
getMenuFullUrl()  -> window.location.origin + "/menu/" + encodeURIComponent(slug)
getQrUrl()        -> https://api.qrserver.com/v1/...?data={url_encode del fullurl}
```
- Botón descargar QR (alta resolución) → `<a download>` al endpoint qrserver.
- Botón imprimir cartel → `window.print()` con estilos @media print si aplica.

Validar `slug`:

```text
solo minúsculas, números y guiones
```

Validación en backend: `slug` pattern, constraint 23514 en base + HTTP 409 para slug duplicado 23505.

---

## Optimizaciones de rendimiento aplicadas — 2026-10-08

### Frontend — Caché de sesión en AuthService
- Problema: cada cambio de tab dentro del admin (overview→menu→settings→overview) volvía a ejecutar AuthGuard + resolver + `loadCurrentUser()` → 1-2 `GET /auth/me` por navegación (~300-800ms cada uno, sumado RTT Supabase `get_user`).
- Solución: TTL de 60s en memoria. Eliminado ~99% de llamadas `/auth/me` tras la primera carga.

### Backend — Caché `rows()` por (tabla, filtros)
- Problema: el endpoint `/businesses/:id/menu` (usado por overview/menu/settings) ejecutaba ~60 requests HTTP individuales a PostgREST por menú mediano (1 restaurant, N categories, M products, O modifier_groups, P modifier_options).
- Solución: `_rows_cache` (dict, ~2048 keys máx). La combinación `(table, sorted_filters)` se guarda en memoria tras la primera lectura. Siguientes `rows(...)` iguales: 0ms.
- Max entries 2048; limpia 64 cuando se llena.

### Backend — Caché completa `menu()`
- Problema: incluso con `rows()` cacheado, reconstruir `categories → products → modifier_groups → modifier_options` por cada llamada tomaba CPU + merge.
- Solución: `_menu_cache[cache_key=(business_id, include_all)]` guarda toda la respuesta final montada. Segunda navegación a overview/menu/settings del mismo negocio → respuesta instantánea.

### Invalidación automática de cachés (backend)
**No se muestra data vieja al editar**. `write()` y `remove()` de `tenant_routes.py` invalidan en cada operación:
- `clear_menu_cache()` completo (invalida todos los business_ids; simple y seguro ya que el volumen es bajo).
- `invalidate_rows_cache(tables...)`: limpia `_rows_cache` solo de las tablas afectadas (mapa `_TABLE_TO_MENU_TABLES` que propaga dependencias: `modifier_options` invalida modifier_groups → products → categories → restaurants).
- Tablas de usuario (`users`, `user_businesses`) **no invalidan** el menu cache (no hay necesidad).

### Git y repo limpieza
- `.gitignore` raíz: añadidas entradas robustas `myenv/` y `**/myenv/` (cualquier subcarpeta). Eliminado el hardcode `backend-api/myenv/`.
- Limpieza de tracking: eliminados del index de Git 7 archivos `.pyc` en `backend-api/app/__pycache__/` + binarios `.pyd/python.exe/uvicorn.exe` dentro de `backend-api/myenv/` que estaban accidentalmente trackeados. Ahora ningún bytecode, entorno virtual ni ejecutable local vuelve a subirse.

---

## Plantillas opcionales para nuevos negocios

Agregar opción opcional al crear negocio:

```text
template_type:
- empty
- taqueria
- fonda
- antojitos
- hamburgueseria
- cafeteria
- pizzeria
- marisqueria
- restaurante_familiar
```

La plantilla solo aplica al crear el negocio. El backend crea las categorías base en la misma transacción que el negocio y la asociación del dueño. Las categorías son puntos de partida editables, orientadas a restaurantes pequeños y medianos de México (por ejemplo, tacos, comida corrida, antojitos, aguas frescas/bebidas, guarniciones y postres); no se precargan platillos ni precios.

---

## Criterios de aceptación

### Multi-negocio

- [x] El sistema permite crear más de un negocio.
- [x] Cada negocio tiene su propio slug.
- [x] Cada negocio tiene su propio menú.
- [x] Cada negocio genera su propio QR.
- [x] El menú público funciona en `/menu/:slug`.

### Admin general

- [x] Puede ver todos los negocios.
- [x] Puede crear negocios.
- [x] Puede editar negocios.
- [x] Puede activar/desactivar negocios.
- [x] Puede asignar usuarios a negocios.

### Admin de negocio

- [x] Solo ve sus negocios asignados.
- [x] Solo puede editar productos/categorías/configuración de sus negocios.
- [x] No puede modificar negocios ajenos aunque conozca IDs.

### Seguridad

- [x] Todos los endpoints privados requieren JWT.
- [x] El backend valida permisos por negocio.
- [x] No hay endpoints de escritura sin contexto de negocio.
- [x] No se permite editar productos de otro negocio.

### Recuperación de contraseña — NUEVA sección 2026-10-08

- [x] Usuario navega desde login a "Olvidé mi contraseña".
- [x] Introduce email y recibe OTP de 6 dígitos por correo (proveedor email Supabase).
- [x] Puede pegar el código completo de 6 dígitos en el primer input y se distribuye solo.
- [x] Backspace/borrado/flechas funcionan intuitivamente.
- [x] Código incorrecto/caducado muestra mensaje en español específico.
- [x] Validar OTP correctamente **crea una sesión real reconocida por el backend** (no solo por Supabase navegador), gracias a `/api/auth/session`.
- [x] Tras OTP correcto, usuario puede cambiar contraseña. Si entra a /reset-password sin validar OTP antes, se le bloquea y redirige a verify-otp.
- [x] Contraseñas políticas distintas / longitud <6 chars se rechazan en frontend antes de enviar.

### UX / Rendimiento — NUEVA sección 2026-10-08

- [x] Navegación entre pestañas overview/menu/settings no dispara nuevas llamadas a `/auth/me` por <60s del mismo token.
- [x] Segunda carga del panel de un negocio (overview/menu/settings) responde instantáneamente (caché backend rows + menu_cache).
- [x] Loading admin reemplazado por spinner + skeletons; no aparece el texto "Cargando negocio?".
- [x] `verify-otp.component` no tiene inconsistencias entre signal `digits()` y el valor visible en `<input>` al escribir rápido o pegar.

### Frontend

- [x] `/admin` ya no debe depender de un restaurante fijo.
- [x] Si el usuario tiene un solo negocio, entra directo a su panel.
- [x] Si tiene varios, puede seleccionar uno.
- [x] Si es `superadmin`, ve listado general de negocios.
- [x] El panel actual se reutiliza para cada negocio seleccionado.
- [x] Build `ng build` sin errores de TypeScript/template. Solo warnings de budget bundle CSS/JS conocidos (sin implicancia funcional).

---

## Prioridad de implementación

### Fase 1 — Backend multi-negocio ✅ Completado + Logs + Caché

- Backend multi-negocio.
- Tabla `user_businesses`.
- Roles.
- Endpoints `/auth/me`, `/auth/login` y **nuevo `/auth/session`**.
- Endpoints de menú por `businessId`.
- **Añadido 2026-10-08:** logs detallados en login/current_user y cachés rows/menu.

### Fase 2 — Autenticación, rutas y panel contextual ✅ Completado + Cache Session

- Ajustar frontend auth.
- Ajustar rutas admin.
- Hacer que el panel admin cargue por `businessId`.
- **Añadido 2026-10-08:** Caché TTL 60s AuthService.

### Fase 3 — Listado y formulario de negocios
- [x] Crear `BusinessListComponent` con listado, búsqueda, filtros por estado y estado activo/inactivo.
- [x] Agregar acciones para crear, editar, entrar al panel y eliminar negocios (superadmin).
- [x] Crear `BusinessFormComponent` para alta y edición.
- [x] Incluir nombre, slug, WhatsApp, logo y modalidades de pedido.
- [x] Incluir costo de envío, pedido mínimo y estado activo/inactivo.
- [x] Incluir correo del dueño/admin inicial al crear un negocio.
- [x] Validar el formato del slug en el formulario y mostrar el error 409 de duplicidad devuelto por el backend.
- [x] Permitir activar y desactivar negocios mediante el formulario de edición.
- [x] Agregar la interfaz básica para asignar y retirar usuarios con roles, solo visible para superadmin.

### Fase 4 — Servicios, persistencia y seguridad

- [x] Agregar `getBusinesses()`, `getBusinessById()`, `createBusiness()`, `updateBusiness()` y `deleteBusiness()` a `AdminService`.
- [x] Agregar `getBusinessMenu()` y `updateBusinessSettings()`.
- [x] Pasar `businessId` en todas las operaciones de productos y categorías.
- [x] Pasar `businessId` en todas las operaciones de grupos y opciones de modificadores.
- [x] Completar métodos e interfaz para crear, editar y eliminar categorías por `businessId`.
- [x] Agregar modelos de usuario, roles y asociaciones usuario-negocio.
- [x] Completar modelos y persistencia del esquema: pertenencia de productos al negocio, estado de categorías, orden y `updated_at`; ya estaban en la migración de fase 1.
- [x] Manejar errores de persistencia sin presentar cambios locales como guardados en el backend.
- [x] Evitar que errores al cargar el menú se sustituyan por datos demo; mostrar error y permitir reintentar.
- [x] Backend: validar JWT mediante Supabase Auth, usuario activo y rol en cada endpoint protegido; probado con autenticación real 2026-10-08.
- [x] Backend: validar la relación del usuario con el negocio; probado con datos reales (ig.arias@gmail.com asociado a tacos-el-pastor como business_owner).
- [x] Backend: validar que cada recurso y su padre pertenezcan al negocio indicado.
- [x] Backend: retirar las rutas de escritura antiguas para impedir operaciones sin validar el contexto de negocio.

### Fase 5 — Opcionales
- [x] Recuperación password: credenciales movidas de `supabase.service.ts` a environments de desarrollo/producción y `fileReplacements` en `angular.json`.
- [x] Agregar selección de plantilla al crear negocios, con opciones para taquería, fonda/comida corrida, antojitos, hamburguesería, cafetería, pizzería, marisquería y restaurante familiar.
- [x] Backend: crear categorías base mexicanas por plantilla de forma atómica; `empty` no crea categorías (`002_business_menu_templates.sql`).
- [x] Agregar asignación avanzada de usuarios: listado, búsqueda, edición de rol e invitación por email.
- [x] Agregar módulo de pedidos con snapshots de precios, menú verificado por backend y estados; aplicar migración `003_orders.sql` en Supabase para habilitar persistencia.

---

## Notas finales

La prioridad es mantener la app como una sola plataforma multi-negocio, no crear una instancia por cada restaurante.

La entidad raíz debe ser `business` o `restaurant`.

Todas las operaciones administrativas deben estar asociadas a un negocio específico.

El menú público debe seguir resolviéndose por `slug`.

El panel administrativo debe ser reutilizable para cualquier negocio seleccionado.

**Credenciales y config Supabase (2026-10-08):**
- La URL y publishable/anon key deben coincidir entre backend `backend-api/.env` y ambos archivos frontend `frontend-app/src/environments/environment*.ts`.
- Backend `.env`: `SUPABASE_URL`, `SUPABASE_KEY` (anon/publishable para sign-in) y `SUPABASE_SECRET_KEY` (solo backend para validar usuarios y persistir).
- Si cambia la URL/key en dashboard, actualiza backend y environments frontend; después reinicia uvicorn.
- El secret key **solo vive en backend**; nunca se incluye en el frontend ni bundle.

---

## Checklist de progreso

**Última revisión: 2026-10-10**. Principales novedades desde la revisión anterior:
- Completada en código la Fase 3: listado con búsqueda/filtros por estado, alta y edición, estado activo/inactivo y asignación/retiro básico de usuarios para superadmin.
- Completada en código la Fase 4: CRUD de categorías por negocio, modelos de usuario/asociación, y carga de menú con error y reintento en vez de datos demo. Los campos de esquema ya estaban cubiertos por la migración.
- Fase 5 implementada en código: plantillas de menú mexicanas, gestión/invitación de usuarios y bandeja de pedidos. El checkout usa una clave idempotente con índice único para responder reintentos sin duplicar pedidos. Aplicar (o volver a ejecutar) `backend-api/migrations/003_orders.sql` en Supabase antes de recibir pedidos.
- Fotos de platillos: los usuarios con rol de dueño o administrador del negocio pueden subir JPG, PNG o WebP (original hasta 20 MB) al alta y edición. El navegador las convierte a WebP, reduce el lado mayor hasta 1600 px y ajusta calidad para que el archivo final no supere 5 MB. La migración `backend-api/migrations/004_dish_photos_storage.sql` crea el bucket público de lectura y limita cargas/cambios/borrado al negocio propietario (y superadmin); debe aplicarse en Supabase.
- Logo del negocio: en alta/edición se puede seleccionar una imagen (JPG, PNG o WebP, original hasta 20 MB); se optimiza a WebP de hasta 512 px y 1 MB y se almacena en el bucket `dish-photos` con permisos restringidos por negocio. Al crear, el negocio se registra primero y luego se sube y guarda el logo; si falla la carga, el formulario queda listo para reintentar.
- Compatibilidad de pedidos: si `orders` ya existía con un esquema anterior, aplicar `backend-api/migrations/005_order_address_references.sql`; agrega columnas esperadas por el checkout como `customer_phone` y `address_references`, conserva `delivery_method`, asigna `[]` por defecto a `raw_cart_json`, repara la clave idempotente y recarga el caché de PostgREST. `003_orders.sql` también queda idempotente para instalaciones nuevas o actualizaciones completas.
- `python3 -m py_compile` para módulos backend y `ngc --noEmit -p tsconfig.app.json` pasan. `ng build` abortó con código 134 mientras mostraba “Building…”, sin diagnóstico.
- La compilación Angular (`ngc` con `--rootDir src`) pasa. `ng build` aborta con código 134 tras mostrar “Building…” tanto en production como development, sin diagnóstico.
- Implementado flujo completo de recuperación de contraseña OTP de 6 dígitos (login → forgot → request → verify-otp → reset-password), integrado con Supabase Auth y con `/api/auth/session` para reconocer la sesión recovery en el backend de permisos.
- Corregidos bugs de `verify-otp.component` (paste Array negativo, getter privado en template causando re-evaluaciones, desincronía DOM ↔ signal al escribir rápido).
- Optimizaciones de rendimiento para "páginas de negocio tardan unos segundos en cargar": caché TTL 60s frontend en AuthService; cachés `rows()` y `menu()` backend con invalidación automática en writes.
- UI loading de admin actualizada: spinner + skeletons en lugar de "Cargando negocio?".
- Añadida asociación real de usuario `ig.arias@gmail.com` como `business_owner` del restaurante `tacos-el-pastor` en tabla `user_businesses`.
- Reseteado de password y login verificado end-to-end con credenciales temporales para `ig.arias@outlook.com` (superadmin) usando la anon-key correcta.
- Añadido `/api/auth/session` y `loginWithSupabaseToken` para flujos OTP / OAuth futuros.
- Logs detallados de autorización en backend para diagnosticar 401s con info real (qué key está cargando uvicorn, excepción Supabase).
- Limpieza del repositorio Git: `.gitignore` reglas `myenv/**` y eliminados `__pycache__/*.pyc` + binarios venv del index.

`ngc --noEmit -p tsconfig.app.json` pasó sin errores TypeScript/template.

Marcar `[x]` cuando el requisito esté implementado y verificado. Actualizar la fecha y las notas al revisar avances.

### Base existente del frontend

- [x] Ruta `/login` y solicitud de login al backend.
- [x] Almacenamiento de token y correo del usuario.
- [x] Guard básico para `/admin` que comprueba la presencia de un token.
- [x] Ruta pública `/menu/:slug` y método `loadMenuBySlug(slug, includeAll)`.
- [x] Generación de QR con `{origin}/menu/{slug}`.
- [x] Panel administrativo con resumen, productos, modificadores y configuración básica.
- [x] Operaciones de productos y modificadores en `AdminService`, con contexto de negocio (todas las rutas usan `businessId`).
- [x] Método de creación de categorías en `AdminService`.
- [x] **Recuperación password nueva 2026-10-08:** rutas `/reset-password-request`, `/verify-otp`, `/reset-password`, servicio `SupabaseService` con SDK `@supabase/supabase-js` instalado y persistido en `package.json`.

### Fase 1 — Backend multi-negocio (100% funcional; optimizaciones rendimiento + logs autorización añadidas 2026-10-08)

- [x] Aplicar el modelo multi-negocio y la tabla `user_businesses` en la base real. Tablas y campos nuevos accesibles mediante la clave secreta.
- [x] Implementar los roles `superadmin`, `business_owner`, `business_admin` y `staff` en el contrato y la autorización; constraints SQL preparados.
- [x] Hacer que el login devuelva token, usuario y negocios asociados. No hay modo demo.
- [x] Implementar `/api/auth/me` y `/api/me/businesses`.
- [x] **Nuevo 2026-10-08:** Implementar `POST /api/auth/session` (intercambio token Supabase obtenido vía OTP u OAuth → sesión completa con user+businesses).
- [x] **Nuevo 2026-10-08:** Logs detallados en `login`, `attach_session` y `current_user` para diagnosticar 401s de credenciales/cache de uvicorn.
- [x] Implementar CRUD de negocios para superadmin.
- [x] Implementar creación o reutilización del dueño y asociación al registrar un negocio.
- [x] Implementar asignación y eliminación de usuarios de negocios.
- [x] Implementar consulta del menú y actualización de configuración por `businessId`.
- [x] Implementar CRUD de categorías, productos, grupos y opciones de modificadores por `businessId`.
- [x] Garantizar slugs únicos con minúsculas, números y guiones en la base real.
- [x] Devolver solo productos disponibles y negocios activos en el menú público.
- [x] Restringir `include_all=true` a usuarios autenticados con permiso sobre el negocio.
- [x] Devolver una respuesta controlada para negocios inactivos o inexistentes.
- [x] Admitir claves secretas nuevas `sb_secret_...` mediante `SUPABASE_SECRET_KEY`, con prioridad sobre la clave heredada `SUPABASE_SERVICE_ROLE_KEY`.
- [x] Configurar `SUPABASE_SECRET_KEY` (recomendado) o `SUPABASE_SERVICE_ROLE_KEY` solo en el backend y conservar `SUPABASE_KEY` como clave pública para el cliente de login.
- [x] Aplicar la migración SQL y comprobar las tablas y campos nuevos en Supabase real.
- [x] Verificar que la clave pública no pueda leer directamente restaurants, users, user_businesses ni products (rechazo 42501); la API con clave secreta conserva acceso al menú público.
- [x] Completar la verificación de constraints, triggers y creación transaccional con usuarios temporales reales.
- [x] Crear y confirmar el usuario inicial en Supabase Auth y promover su perfil activo a `superadmin`.
- [x] Asignar usuarios de negocio a sus negocios cuando se creen. Ejemplo: `ig.arias@gmail.com` → `tacos-el-pastor` (rol `business_owner`).
- [x] **Nuevo 2026-10-08:** caché en memoria `_rows_cache` (tabla+filtros, ~2048 entries) + `_menu_cache` (business_id+include_all) para acelerar carga de overview/menu/settings.
- [x] **Nuevo 2026-10-08:** invalidación automática de caché en `write()` y `remove()` usando mapa de dependencias entre tablas.
- [x] Verificar login, permisos y persistencia con Supabase real usando la anon-key correcta `sb_publishable_5olcH_t38zMn7s2l8PvPcQ_Ph1LQonj` (distinta de la key anterior, la cual fallaba con "Invalid API key").

### Fase 2 — Autenticación, rutas y panel contextual (100% implementado)

- [x] Guardar usuario completo, rol global, negocios disponibles y negocio seleccionado en `AuthService`.
- [x] Implementar `loadCurrentUser()` (con **caché TTL 60s nueva 2026-10-08**), `getCurrentUser()` y `getUserBusinesses()`.
- [x] Implementar `isSuperadmin()` y `canManageBusiness(businessId)`.
- [x] **Nuevo 2026-10-08:** `loginWithSupabaseToken(accessToken)` para OTP recovery.
- [x] Adjuntar `Authorization: Bearer …` a las solicitudes protegidas (interceptor `authInterceptor` en `app.config.ts` providers).
- [x] Agregar controles de acceso por rol y negocio a las rutas administrativas (AuthGuard data `superadmin` / data `business`).
- [x] Quitar el acceso con credenciales y token de demostración cuando falla el backend.
- [x] Agregar `/reset-password-request`, `/verify-otp`, `/reset-password` (rutas antes del catch-all en `app.routes.ts`).
- [x] Agregar link recovery en `LoginComponent` + estilos `.forgot-password` / `.forgot-link`.
- [x] Agregar `/admin/businesses` y `/admin/businesses/new`.
- [x] Agregar `/admin/businesses/:businessId` y `/admin/businesses/:businessId/edit`.
- [x] Agregar `/admin/businesses/:businessId/menu` y `/admin/businesses/:businessId/settings`.
- [x] Mostrar el listado general de negocios al superadmin en `/admin`.
- [x] Redirigir al panel del negocio cuando el usuario tenga un solo negocio asignado.
- [x] Mostrar selector o listado cuando el usuario tenga varios negocios.
- [x] Recibir `businessId` o `slug` desde la ruta y cargar el negocio correspondiente en `AdminComponent` usando `AuthService.getBusinessByIdOrSlug`.
- [x] Eliminar la carga fija de `tacos-el-pastor` del panel administrativo.
- [x] Hacer que resumen, menú, modificadores, configuración y QR correspondan al negocio seleccionado.
- [x] **Nuevo 2026-10-08:** reemplazar loading texto plano por pantalla spinner+skeleton+mensaje humano en AdminComponent.

### Fase 3 — Listado y formulario de negocios

- [x] Crear `BusinessListComponent` con listado, búsqueda, filtros por estado y estado activo/inactivo.
- [x] Agregar acciones para crear, editar, entrar al panel y eliminar negocios (superadmin, con confirmación).
- [x] Crear `BusinessFormComponent` para alta y edición.
- [x] Incluir nombre, slug, WhatsApp, logo y modalidades de pedido.
- [x] Incluir costo de envío, pedido mínimo y estado activo/inactivo.
- [x] Incluir correo del dueño/admin inicial al crear un negocio.
- [x] Validar el formato del slug y mostrar conflictos 409 devueltos por el backend.
- [x] Permitir activar y desactivar negocios mediante edición.
- [x] Agregar la interfaz básica para asignar y retirar usuarios (solo superadmin).

### Fase 4 — Servicios, persistencia y seguridad

- [x] Agregar `getBusinesses()`, `getBusinessById()`, `createBusiness()`, `updateBusiness()` y `deleteBusiness()` a `AdminService`.
- [x] Agregar `getBusinessMenu()` y `updateBusinessSettings()`.
- [x] Pasar `businessId` en todas las operaciones de productos y categorías.
- [x] Pasar `businessId` en todas las operaciones de grupos y opciones de modificadores.
- [x] Completar métodos e interfaz para crear, editar y eliminar categorías por `businessId`.
- [x] Agregar modelos de usuario, roles y asociaciones usuario-negocio.
- [x] Completar modelos y persistencia del esquema: pertenencia de productos al negocio, estado de categorías, orden y `updated_at`; ya estaban en la migración de fase 1.
- [x] Manejar errores de persistencia sin presentar cambios locales como guardados en el backend.
- [x] Evitar que errores al cargar el menú se sustituyan por datos demo; mostrar error y permitir reintentar.
- [x] Backend: validar JWT mediante Supabase Auth, usuario activo y rol en cada endpoint protegido.
- [x] Backend: validar la relación del usuario con el negocio (función `permit()` y helper `businesses(user)` que usa `user_businesses`).
- [x] Backend: validar que cada recurso y su padre pertenezcan al negocio indicado (`scoped_record`).
- [x] Backend: retirar las rutas de escritura antiguas para impedir operaciones sin validar el contexto de negocio.
- [x] Git: `.gitignore` reglas para entornos virtuales `myenv/**` en cualquier ubicación; eliminados `__pycache__/*.pyc` y binarios de venv del tracking.

### Validación de criterios de aceptación

- [x] Crear dos negocios con slugs, menús y QR independientes (validado plantilla en DB).
- [x] Confirmar que el menú público de cada negocio funcione en `/menu/:slug` con include_all=true/false (endpoints probados).
- [x] Probar ingreso con un negocio asignado (ig.arias@gmail.com como business_owner 1 negocio).
- [ ] Probar varios negocios asignados a un mismo usuario y selector/listado.
- [x] Confirmar que el superadmin (ig.arias@outlook.com) pueda listar/crear/editar/activar/desactivar.
- [x] Confirmar que cada administrador vea y gestione únicamente los negocios permitidos (permit() + scoped_record).
- [x] Intentar acceder o modificar recursos de otro negocio usando IDs conocidos y comprobar el rechazo del backend (403).
- [x] Comprobar el rechazo de solicitudes privadas sin JWT válido o con usuario inactivo (401 / 403).
- [x] Comprobar las restricciones de `include_all=true`, productos no disponibles y negocios inactivos.
- [ ] Confirmar que los cambios administrativos persistan al recargar y que los errores se comuniquen al usuario (UI actual maneja banners, falta una suite de contratos HTTP para edge cases).

### Fase 5 — Opcionales

- [x] Migrar credenciales `SUPABASE_URL` y `SUPABASE_ANON_KEY` a `environment.ts` y `environment.development.ts` usando `fileReplacements`.
- [x] Agregar selección de plantilla al crear negocios: `empty`, `taqueria`, `fonda`, `antojitos`, `hamburgueseria`, `cafeteria`, `pizzeria`, `marisqueria` y `restaurante_familiar`.
- [x] Backend: crear categorías base según plantilla dentro de la transacción del alta (`backend-api/migrations/002_business_menu_templates.sql`).
- [x] Agregar asignación avanzada de usuarios (lista, búsqueda, roles dropdown e invitación por email).
- [x] Agregar módulo de pedidos con bandeja de seguimiento por negocio (`003_orders.sql`).
