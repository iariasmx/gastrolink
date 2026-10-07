-- =======================================================
-- GastroLink - Script de Inicialización y Datos de Prueba (Seed)
-- Ejecuta este script en el SQL Editor de tu consola de Supabase
-- =======================================================

-- 1. Asegurar extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. DESHABILITAR RLS PARA DESARROLLO LOCAL (Permite lecturas y escrituras sin bloqueo)
ALTER TABLE IF EXISTS restaurants DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS products DISABLE ROW LEVEL SECURITY;

-- 3. Limpiar datos previos si existen
TRUNCATE TABLE products, categories, restaurants CASCADE;

-- 4. INSERTAR RESTAURANTE DE PRUEBA
INSERT INTO restaurants (
    id,
    name,
    slug,
    whatsapp_number,
    logo_url,
    allows_table_order,
    allows_takeaway,
    allows_delivery,
    delivery_fee,
    minimum_order,
    is_active
) VALUES (
    '11111111-1111-1111-1111-111111111111',
    'Tacos El Pastor Mexa',
    'tacos-el-pastor',
    '52551234567855',
    'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=300&q=80',
    true,
    true,
    true,
    35.00,
    100.00,
    true
);

-- 5. INSERTAR CATEGORÍAS DE PRUEBA
INSERT INTO categories (id, restaurant_id, name, sort_order) VALUES
('22222222-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', '🌮 Tacos Especiales', 1),
('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', '🥤 Bebidas & Aguas Frescas', 2),
('22222222-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', '🍰 Postres Mexicanos', 3);

-- 6. INSERTAR PRODUCTOS DE PRUEBA
INSERT INTO products (id, category_id, name, description, price, image_url, is_available) VALUES
-- Categoría 1: Tacos Especiales
('33333333-1111-1111-1111-111111111111', '22222222-1111-1111-1111-111111111111', 'Taco al Pastor Tradicional', 'Carne de cerdo adobada al pastor en tortilla de maíz nixtamalizado, piña asada, cilantro y cebolla.', 26.00, 'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?auto=format&fit=crop&w=400&q=80', true),
('33333333-1111-1111-1111-222222222222', '22222222-1111-1111-1111-111111111111', 'Gringa de Suadero', 'Doble tortilla de harina con abundante queso oaxaca fundido y suave carne de suadero marinada.', 65.00, 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=400&q=80', true),
('33333333-1111-1111-1111-333333333333', '22222222-1111-1111-1111-111111111111', 'Volcán de Arrachera', 'Tortilla tostada al carbón con cama de queso manchego fundido y jugosa arrachera corte prime.', 78.00, 'https://images.unsplash.com/photo-1615870216519-2f9fa575fa5c?auto=format&fit=crop&w=400&q=80', true),

-- Categoría 2: Bebidas
('33333333-2222-2222-2222-111111111111', '22222222-2222-2222-2222-222222222222', 'Agua Fresca de Horchata 1L', 'Receta secreta de la casa con arroz artesanal, canela y toque de vainilla de papantla.', 45.00, 'https://images.unsplash.com/photo-1546171753-97d7676e4179?auto=format&fit=crop&w=400&q=80', true),
('33333333-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'Refresco de Vidrio 355ml', 'Coca-Cola, Sidral Mundet o Boing de Mango bien helado.', 32.00, 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=400&q=80', true),

-- Categoría 3: Postres
('33333333-3333-3333-3333-111111111111', '22222222-3333-3333-3333-333333333333', 'Churros con Cajeta de Celaya', '4 piezas de churros crujientes espolvoreados con azúcar y canela, acompañados de cajeta.', 55.00, 'https://images.unsplash.com/photo-1624300629298-e9de39c13be5?auto=format&fit=crop&w=400&q=80', true);
