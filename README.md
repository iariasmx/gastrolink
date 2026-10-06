# 📱 MenuQR SaaS - Generador de Menús Digitales con Pedidos por WhatsApp (GastroLink)

Un micro-SaaS *bootstrapped* de arquitectura multi-inquilino (*multi-tenant*) diseñado específicamente para el mercado de restaurantes y PyMEs gastronómicas en México. Permite a los negocios digitalizar sus menús, gestionar opciones de servicio (Mesa, Recoger y Servicio a Domicilio) y recibir pedidos estructurados directamente en su cuenta de WhatsApp, eliminando las altas comisiones de las plataformas de entrega tradicionales.

## 🚀 Arquitectura Tecnológica

El proyecto está construido bajo un enfoque de costo operativo de infraestructura cero (\$0 MXN) en su fase de validación, utilizando las capacidades más modernas del ecosistema de desarrollo actual:

*   **Frontend:** Angular 19+ (Standalone Components, Signals API para gestión de estado reactivo).
*   **Backend:** Python 3.11+ (FastAPI para APIs asíncronas de alto rendimiento y tipado estricto).
*   **Base de Datos:** PostgreSQL administrado vía Supabase.
*   **Entorno de Desarrollo:** JetBrains Ecosystem (PyCharm / WebStorm).

---

## 📁 Estructura del Repositorio

```text
menuqr-saas/
├── backend-api/         # Microservicio de APIs (Python + FastAPI)
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py      # Punto de entrada de FastAPI
│   │   ├── config.py    # Variables de entorno
│   │   ├── database.py  # Cliente de conexión a Supabase
│   │   └── schemas.py   # Esquemas de validación Pydantic v2
│   ├── requirements.txt
│   └── .env.example
└── frontend-app/        # Aplicación Web y Panel Admin (Angular)
    ├── src/
    │   └── app/         # Componentes autónomos y servicios de Signals
    └── package.json
```

---

## 🗄️ Modelo de Base de Datos (PostgreSQL / Supabase)

Ejecuta el siguiente script en el **SQL Editor** de tu consola de Supabase para inicializar el esquema relacional con soporte nativo para UUIDs e indexación optimizada de slugs:

```sql
create extension if not exists "uuid-ossp";

-- TABLA DE RESTAURANTES (Configuración general y de entregas)
create table restaurants (
    id uuid primary key default uuid_generate_v4(),
    name varchar(100) not null,
    slug varchar(100) unique not null,
    whatsapp_number varchar(20) not null,
    logo_url text,
    allows_table_order boolean default true,
    allows_takeaway boolean default true,
    allows_delivery boolean default false,
    delivery_fee numeric(10, 2) default 0.00,
    minimum_order numeric(10, 2) default 0.00,
    is_active boolean default true,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index idx_restaurants_slug on restaurants(slug);

-- TABLA DE CATEGORÍAS (Para agrupar los platillos)
create table categories (
    id uuid primary key default uuid_generate_v4(),
    restaurant_id uuid references restaurants(id) on delete cascade not null,
    name varchar(50) not null,
    sort_order integer default 0,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- TABLA DE PRODUCTOS
create table products (
    id uuid primary key default uuid_generate_v4(),
    category_id uuid references categories(id) on delete cascade not null,
    name varchar(100) not null,
    description text,
    price numeric(10, 2) not null,
    image_url text,
    is_available boolean default true,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
```

---

## 🛠️ Configuración e Instalación

### 1. Backend (FastAPI)

1. Navega al directorio del backend e inicializa tu entorno virtual:
   ```bash
   cd backend-api
   python -m venv venv
   source venv/bin/activate  # En Windows: venv\Scripts\activate
   ```
2. Instala las dependencias base:
   ```bash
   pip install fastapi uvicorn pydantic supabase python-dotenv
   ```
3. Crea un archivo `.env` basado en las credenciales de tu proyecto en Supabase:
   ```env
   SUPABASE_URL=https://supabase.co
   SUPABASE_KEY=tu-anon-key-de-supabase
   ```
4. Levanta el servidor en modo desarrollo:
   ```bash
   uvicorn app.main:app --reload
   ```
   *La documentación interactiva e interactuable estará disponible de inmediato en `http://127.0.0` (Swagger UI).*

### 2. Frontend (Angular)

1. Navega al directorio de la aplicación web:
   ```bash
   cd frontend-app
   ```
2. Instala los paquetes globales y locales mediante npm:
   ```bash
   npm install
   ```
3. Inicia el servidor de desarrollo local:
   ```bash
   ng serve
   ```
   *Accede a la aplicación en tu navegador mediante `http://localhost:4200`.*

---

## 🧠 Flujos del Negocio Implementados

### Gestión de Estado de la Orden (Angular Signals)
El carrito de compras calcula cantidades, subtotales y adiciones condicionales (como el costo de envío configurado por el restaurante) de manera reactiva y síncrona en el cliente mediante la API nativa de **Signals**, evitando sobrecargar la memoria con suscripciones manuales de RxJS.

### Canalización de Pedidos por WhatsApp (Costo de API \$0)
El cierre de la venta y la logística de entrega se delegan por completo al operador del restaurante. El sistema concatena el carrito de compras junto con los detalles de entrega recopilados dinámicamente en el formulario de Checkout (Dirección, referencias de domicilio y método de pago) y redirige al comensal mediante la API abierta de WhatsApp Web/App utilizando codificación de caracteres estándar (`encodeURIComponent`), garantizando el envío seguro de la orden sin costos por mensaje de broker de mensajería externa.

---

## 🗺️ Roadmap de Desarrollo Técnico (Tiempo Libre)
- [x] Configuración del esquema relacional en PostgreSQL (Supabase).
- [x] Estructuración del Backend Base en FastAPI.
- [x] Arquitectura reactiva del servicio del carrito de compras en Angular mediante Signals.
- [ ] Implementación de consultas relacionales (*Joins*) optimizadas en FastAPI para la extracción de menús completos.
- [ ] Configuración de la estrategia de enrutamiento dinámico en Angular para atrapar URLs vía código QR (`/menu/:slug`).
- [ ] Módulo administrativo de autenticación (JWT) y CRUD visual para restaurantes de lado del cliente.
