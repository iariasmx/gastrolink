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

### Permisos esperados

| Acción                          | superadmin | business_owner | business_admin |    staff |
| ------------------------------- | ---------: | -------------: | -------------: | -------: |
| Crear negocios                  |         Sí |             No |             No |       No |
| Editar cualquier negocio        |         Sí |             No |             No |       No |
| Editar su negocio               |         Sí |             Sí |             Sí |       No |
| Gestionar usuarios del negocio  |         Sí |             Sí |             No |       No |
| Gestionar menú                  |         Sí |             Sí |             Sí | Opcional |
| Ver pedidos                     |         Sí |             Sí |             Sí |       Sí |
| Editar configuración de negocio |         Sí |             Sí |       Opcional |       No |

---

## Endpoints requeridos

### Autenticación

```http
POST /api/auth/login
GET /api/auth/me
```

El login debe regresar token, usuario y negocios asociados.

Respuesta sugerida:

```json
{
  "access_token": "jwt-token",
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

Endpoints recomendados con contexto de negocio:

```http
GET /api/businesses/:businessId/menu?include_all=true
PUT /api/businesses/:businessId/settings

POST /api/businesses/:businessId/categories
PUT /api/businesses/:businessId/categories/:categoryId
DELETE /api/businesses/:businessId/categories/:categoryId

POST /api/businesses/:businessId/products
PUT /api/businesses/:businessId/products/:productId
DELETE /api/businesses/:businessId/products/:productId

POST /api/businesses/:businessId/modifier-groups
PUT /api/businesses/:businessId/modifier-groups/:groupId
DELETE /api/businesses/:businessId/modifier-groups/:groupId

POST /api/businesses/:businessId/modifier-options
PUT /api/businesses/:businessId/modifier-options/:optionId
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

### Rutas sugeridas

Agregar rutas tipo:

```text
/admin
/admin/businesses
/admin/businesses/new
/admin/businesses/:businessId
/admin/businesses/:businessId/menu
/admin/businesses/:businessId/settings
/menu/:slug
/login
```

Comportamiento esperado:

- Si el usuario es `superadmin`, `/admin` debe mostrar listado de negocios.
- Si el usuario tiene un solo negocio, `/admin` puede redirigir a `/admin/businesses/:businessId`.
- Si el usuario tiene varios negocios, mostrar selector/listado.
- El menú público sigue en `/menu/:slug`.

---

## Cambios en servicios frontend

### AuthService

Debe guardar:

- Token.
- Usuario actual.
- Rol global.
- Negocios disponibles.
- Negocio seleccionado.

Métodos sugeridos:

```typescript
login(email: string, password: string)
logout()
loadCurrentUser()
getCurrentUser()
getUserBusinesses()
isSuperadmin()
canManageBusiness(businessId: string)
```

---

### AdminService

Agregar métodos:

```typescript
getBusinesses()
getBusinessById(businessId: string)
createBusiness(payload)
updateBusiness(businessId: string, payload)
deleteBusiness(businessId: string)

getBusinessMenu(businessId: string)
updateBusinessSettings(businessId: string, payload)

createCategory(businessId: string, payload)
updateCategory(businessId: string, categoryId: string, payload)
deleteCategory(businessId: string, categoryId: string)

createProduct(businessId: string, payload)
updateProduct(businessId: string, productId: string, payload)
deleteProduct(businessId: string, productId: string)

saveModifierGroup(businessId: string, productId: string, payload)
deleteModifierGroup(businessId: string, groupId: string)

saveModifierOption(businessId: string, groupId: string, payload)
deleteModifierOption(businessId: string, optionId: string)
```

---

### MenuService

Mantener:

```typescript
loadMenuBySlug(slug: string, includeAll = false)
```

Agregar si hace falta:

```typescript
loadMenuByBusinessId(businessId: string)
```

---

## Componentes frontend requeridos

### 1. BusinessListComponent

Pantalla para admin general.

Funciones:

- Listar negocios.
- Buscar/filtrar negocios.
- Mostrar estado activo/inactivo.
- Botón crear negocio.
- Botón entrar al panel del negocio.
- Botón editar negocio.

Ruta sugerida:

```text
/admin/businesses
```

---

### 2. BusinessFormComponent

Formulario para crear/editar negocio.

Campos:

- Nombre.
- Slug.
- WhatsApp.
- Logo.
- Permitir pedidos en mesa.
- Permitir pedidos para llevar.
- Permitir domicilio.
- Costo de envío.
- Pedido mínimo.
- Activo/inactivo.
- Email del dueño/admin inicial.

Rutas sugeridas:

```text
/admin/businesses/new
/admin/businesses/:businessId/edit
```

---

### 3. AdminComponent actualizado

Debe recibir `businessId` desde la ruta y cargar ese negocio.

El panel debe convertirse en panel contextual:

```text
/admin/businesses/:businessId
```

Debe gestionar únicamente:

- Resumen y QR.
- Menú.
- Productos.
- Modificadores.
- Configuración del negocio seleccionado.

No debe cargar un negocio fijo.

---

## QR y menú público

El QR debe generarse con:

```text
{origin}/menu/{slug}
```

Cada negocio debe tener un `slug` único.

Validar `slug`:

```text
solo minúsculas, números y guiones
```

Ejemplos válidos:

```text
tacos-el-pastor
hamburguesas-nortenas
cafe-centro
```

---

## Plantillas opcionales para nuevos negocios

Agregar opción opcional al crear negocio:

```text
template_type:
- empty
- taqueria
- hamburgueseria
- cafeteria
- pizzeria
- restaurante_general
```

Si se selecciona plantilla, backend crea categorías base.

Ejemplo para taquería:

```text
Tacos
Gringas
Bebidas
Postres
Promociones
```

Ejemplo para cafetería:

```text
Café caliente
Café frío
Panadería
Postres
Bebidas
```

---

## Criterios de aceptación

### Multi-negocio

- El sistema permite crear más de un negocio.
- Cada negocio tiene su propio slug.
- Cada negocio tiene su propio menú.
- Cada negocio genera su propio QR.
- El menú público funciona en `/menu/:slug`.

### Admin general

- Puede ver todos los negocios.
- Puede crear negocios.
- Puede editar negocios.
- Puede activar/desactivar negocios.
- Puede asignar usuarios a negocios.

### Admin de negocio

- Solo ve sus negocios asignados.
- Solo puede editar productos/categorías/configuración de sus negocios.
- No puede modificar negocios ajenos aunque conozca IDs.

### Seguridad

- Todos los endpoints privados requieren JWT.
- El backend valida permisos por negocio.
- No hay endpoints de escritura sin contexto de negocio.
- No se permite editar productos de otro negocio.

### Frontend

- `/admin` ya no debe depender de un restaurante fijo.
- Si el usuario tiene un solo negocio, entra directo a su panel.
- Si tiene varios, puede seleccionar uno.
- Si es `superadmin`, ve listado general de negocios.
- El panel actual se reutiliza para cada negocio.

---

## Prioridad de implementación

### Fase 1

- Backend multi-negocio.
- Tabla `user_businesses`.
- Roles.
- Endpoints `/auth/me`, `/me/businesses` o equivalente.
- Endpoints de menú por `businessId`.

### Fase 2

- Ajustar frontend auth.
- Ajustar rutas admin.
- Hacer que el panel admin cargue por `businessId`.

### Fase 3

- Crear pantalla de listado de negocios para superadmin.
- Crear formulario de nuevo negocio.

### Fase 4

- Migrar endpoints actuales de productos/categorías/modificadores para usar `businessId`.
- Validar seguridad por negocio.

### Fase 5

- Agregar plantillas de negocio.
- Agregar asignación avanzada de usuarios.
- Opcional: módulo de pedidos.

---

## Notas finales

La prioridad es mantener la app como una sola plataforma multi-negocio, no crear una instancia por cada restaurante.

La entidad raíz debe ser `business` o `restaurant`.

Todas las operaciones administrativas deben estar asociadas a un negocio específico.

El menú público debe seguir resolviéndose por `slug`.

El panel administrativo debe ser reutilizable para cualquier negocio seleccionado.

---

## Checklist de progreso

Última revisión: **2026-10-07**. Revisados el frontend y el backend en `../backend-api`. La Fase 1 cuenta con **20 pruebas HTTP simuladas** y una validación de integración real en Supabase con usuarios y negocio temporales: login/JWT, roles, transacción, asociaciones, persistencia, constraints y limpieza pasaron. Sigue pendiente probar las credenciales del superadmin inicial y la creación de dueño nuevo por email. La fase 2 está implementada en el frontend: estado de sesión, rutas protegidas y panel contextual por negocio. Angular se actualizó a 22.2.1, CLI/Build 22.2.2 y TypeScript 6.0.3; el build de producción pasa con un aviso de presupuesto CSS del menú y las 9 pruebas frontend pasan. `npm audit` no reporta vulnerabilidades.

Marcar `[x]` cuando el requisito esté implementado y verificado. Actualizar la fecha y las notas al revisar avances. Los elementos completados de la base actual no implican que ya exista aislamiento multi-negocio.

### Base existente del frontend

- [x] Ruta `/login` y solicitud de login al backend.
- [x] Almacenamiento de token y correo del usuario.
- [x] Guard básico para `/admin` que comprueba la presencia de un token.
- [x] Ruta pública `/menu/:slug` y método `loadMenuBySlug(slug, includeAll)`.
- [x] Generación de QR con `{origin}/menu/{slug}`.
- [x] Panel administrativo con resumen, productos, modificadores y configuración básica.
- [x] Operaciones de productos y modificadores en `AdminService`, todavía sin contexto de negocio.
- [x] Método de creación de categorías en `AdminService`.

### Fase 1 — Backend multi-negocio (integración probada; acceso de cuenta inicial pendiente)

Conexión pública real comprobada con el .env raíz del backend: arranque correcto y respuestas HTTP 200 en /health, /api/restaurants y menú público. La clave existente es pública; administración requiere configurar la clave de servicio. La carga del .env ya no depende del directorio desde el que se inicie Python.

- [x] Aplicar el modelo multi-negocio y la tabla `user_businesses` en la base real. Tablas y campos nuevos accesibles mediante la clave secreta el 2026-10-07.
- [x] Implementar los roles `superadmin`, `business_owner`, `business_admin` y `staff` en el contrato y la autorización; constraints SQL preparados.
- [x] Hacer que el login devuelva token, usuario y negocios asociados, sin acceso demo.
- [x] Implementar `/api/auth/me` y `/api/me/businesses`.
- [x] Implementar CRUD de negocios para superadmin.
- [x] Implementar creación o reutilización del dueño y asociación al registrar un negocio. La transacción y reutilización de dueño se probaron con datos temporales en Supabase; falta probar el camino de crear un dueño nuevo desde el endpoint.
- [x] Implementar asignación y eliminación de usuarios de negocios.
- [x] Implementar consulta del menú y actualización de configuración por `businessId`.
- [x] Implementar CRUD de categorías, productos, grupos y opciones de modificadores por `businessId`.
- [x] Garantizar slugs únicos con minúsculas, números y guiones en la base real. API y base rechazaron slug duplicado (23505) y formato inválido (23514).
- [x] Devolver solo productos disponibles y negocios activos en el menú público, verificado con datos simulados.
- [x] Restringir `include_all=true` a usuarios autenticados con permiso sobre el negocio.
- [x] Devolver una respuesta controlada para negocios inactivos o inexistentes.
- [x] Agregar y ejecutar 20 pruebas de contratos HTTP, roles, aislamiento, validación y rechazo del login demo.
- [x] Admitir claves secretas nuevas `sb_secret_...` mediante `SUPABASE_SECRET_KEY`, con prioridad sobre la clave heredada `SUPABASE_SERVICE_ROLE_KEY`.
- [x] Configurar `SUPABASE_SECRET_KEY` (recomendado) o `SUPABASE_SERVICE_ROLE_KEY` solo en el backend y conservar `SUPABASE_KEY` como clave pública para el cliente de login. Nueva clave `sb_secret_...` cargada y conexión real a `restaurants` verificada el 2026-10-07, sin exponer credenciales.
- [x] Aplicar la migración SQL y comprobar las tablas y campos nuevos en Supabase real.
- [x] Verificar que la clave pública no pueda leer directamente restaurants, users, user_businesses ni products (rechazo 42501); la API con clave secreta conserva acceso al menú público.
- [x] Completar la verificación de constraints, triggers y creación transaccional con usuarios temporales reales; se verificaron el trigger de perfil Auth, `updated_at`, constraints de slug y asociación transaccional.
- [x] Crear y confirmar el usuario inicial en Supabase Auth y promover su perfil activo a `superadmin`. Verificado el 2026-10-07: un usuario Auth confirmado y un perfil activo con rol `superadmin`, vinculados por ID.
- [x] Asignar usuarios de negocio a sus negocios cuando se creen; se verificaron dueño y staff temporales. El superadmin tiene acceso global sin necesitar una asociación.
- [x] Verificar login, permisos y persistencia con Supabase real mediante usuarios temporales superadmin, dueño y staff. No se cambió ni probó la contraseña del superadmin inicial.

Comprobación de la base real del 2026-10-07 tras aplicar la migración: las siete tablas y sus campos nuevos están disponibles. `/health` y el menú público responden HTTP 200 usando la API. En esa revisión inicial, `users` y `user_businesses` estaban vacías. El usuario inicial y su rol superadmin se verificaron en la revisión posterior descrita abajo.

La revisión inicial no encontró usuarios. La última revisión, después de crear el usuario desde Authentication, confirma un usuario de Auth con correo confirmado y su perfil activo `superadmin`. El trigger de creación del perfil funcionó. El **2026-10-07**, usuarios temporales verificaron login, JWT, permisos de superadmin/dueño/staff, asociación y persistencia mediante Supabase real; se eliminaron al terminar y se comprobó que no quedaron registros de prueba. La contraseña del superadmin inicial no se probó.

Guía de instalación y contrato: `../backend-api/PHASE1.md`. Las rutas antiguas de escritura sin contexto se retiraron; el frontend necesita los ajustes de las fases 2 y 4. Los usuarios nuevos no reciben mensajes automáticos y deben completar el flujo de recuperación de contraseña/confirmación de Supabase Auth.

Aviso de migración aportado por el usuario: planificar el cambio de claves heredadas `service_role` a claves secretas `sb_secret_...` para finales de 2026. El backend admite ambas y prioriza la nueva clave; ninguna sustituye el JWT de usuario.

### Fase 2 — Autenticación, rutas y panel contextual (implementada en código)

- [x] Guardar usuario completo, rol global, negocios disponibles y negocio seleccionado en `AuthService`.
- [x] Implementar `loadCurrentUser()`, `getCurrentUser()` y `getUserBusinesses()`.
- [x] Implementar `isSuperadmin()` y `canManageBusiness(businessId)`.
- [x] Adjuntar `Authorization: Bearer …` a las solicitudes protegidas.
- [x] Agregar controles de acceso por rol y negocio a las rutas administrativas.
- [x] Quitar el acceso con credenciales y token de demostración cuando falla el backend.
- [x] Agregar `/admin/businesses` y `/admin/businesses/new`.
- [x] Agregar `/admin/businesses/:businessId` y `/admin/businesses/:businessId/edit`.
- [x] Agregar `/admin/businesses/:businessId/menu` y `/admin/businesses/:businessId/settings`.
- [x] Mostrar el listado general de negocios al superadmin en `/admin`.
- [x] Redirigir al panel del negocio cuando el usuario tenga un solo negocio asignado.
- [x] Mostrar selector o listado cuando el usuario tenga varios negocios.
- [x] Recibir `businessId` desde la ruta y cargar el negocio correspondiente en `AdminComponent`.
- [x] Eliminar la carga fija de `tacos-el-pastor` del panel administrativo.
- [x] Hacer que resumen, menú, modificadores, configuración y QR correspondan al negocio seleccionado.

### Fase 3 — Listado y formulario de negocios

- [ ] Crear `BusinessListComponent` con listado, búsqueda/filtros y estado activo/inactivo.
- [ ] Agregar acciones para crear, editar y entrar al panel de un negocio.
- [ ] Crear `BusinessFormComponent` para alta y edición.
- [ ] Incluir nombre, slug, WhatsApp, logo y modalidades de pedido.
- [ ] Incluir costo de envío, pedido mínimo y estado activo/inactivo.
- [ ] Incluir correo del dueño/admin inicial al crear un negocio.
- [ ] Validar el formato del slug y mostrar errores de duplicidad devueltos por el backend.
- [ ] Permitir activar y desactivar negocios.
- [ ] Agregar la interfaz básica para asignar y retirar usuarios, según los permisos requeridos.

### Fase 4 — Servicios, persistencia y seguridad

- [ ] Agregar `getBusinesses()`, `getBusinessById()`, `createBusiness()`, `updateBusiness()` y `deleteBusiness()` a `AdminService`.
- [ ] Agregar `getBusinessMenu()` y `updateBusinessSettings()`.
- [ ] Pasar `businessId` en todas las operaciones de productos y categorías.
- [ ] Pasar `businessId` en todas las operaciones de grupos y opciones de modificadores.
- [ ] Completar métodos e interfaz para crear, editar y eliminar categorías.
- [ ] Agregar modelos de usuario, roles y asociaciones usuario-negocio.
- [ ] Completar los campos faltantes del esquema recomendado: pertenencia de productos al negocio, estado de categorías, orden de productos y marcas de actualización.
- [ ] Manejar errores de persistencia sin presentar cambios locales como guardados en el backend.
- [ ] Evitar que cualquier error de carga del menú se sustituya automáticamente por datos demo.
- [x] Backend: validar JWT mediante Supabase Auth, usuario activo y rol en cada endpoint protegido; probado con autenticación simulada.
- [x] Backend: validar la relación del usuario con el negocio; probado con datos simulados.
- [x] Backend: validar que cada recurso y su padre pertenezcan al negocio indicado; probado con datos simulados.
- [x] Backend: retirar las rutas de escritura antiguas para impedir operaciones sin validar el contexto de negocio.

### Validación de criterios de aceptación

- [ ] Crear dos negocios con slugs, menús y QR independientes.
- [ ] Confirmar que el menú público de cada negocio funcione en `/menu/:slug`.
- [ ] Probar ingreso con un negocio asignado, varios negocios y rol superadmin.
- [ ] Confirmar que el superadmin pueda listar, crear, editar, activar/desactivar y asignar usuarios.
- [ ] Confirmar que cada administrador vea y gestione únicamente los negocios permitidos.
- [ ] Intentar acceder o modificar recursos de otro negocio usando IDs conocidos y comprobar el rechazo del backend.
- [ ] Comprobar el rechazo de solicitudes privadas sin JWT válido o con usuario inactivo.
- [ ] Comprobar las restricciones de `include_all=true`, productos no disponibles y negocios inactivos.
- [ ] Confirmar que los cambios administrativos persistan al recargar y que los errores se comuniquen al usuario.

### Fase 5 — Opcionales

- [ ] Agregar selección de plantilla al crear negocios: `empty`, `taqueria`, `hamburgueseria`, `cafeteria`, `pizzeria` y `restaurante_general`.
- [ ] Backend: crear categorías base según la plantilla seleccionada (por verificar).
- [ ] Agregar asignación avanzada de usuarios.
- [ ] Agregar módulo de pedidos.
