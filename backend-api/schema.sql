-- GastroLink v0.1.0-beta.1 — esquema inicial consolidado para Supabase/PostgreSQL.
--
-- Ejecutar en una base Supabase nueva, con los esquemas auth y storage habilitados.
-- Este archivo consolida el estado final de migrations/001..005; no ejecutar
-- después las migraciones sobre la misma base.
--
-- No es SQL portable a MySQL, SQL Server, Oracle u otros motores. La aplicación
-- también usa Supabase Auth, Storage, PostgREST, roles y funciones de PostgreSQL;
-- cambiar únicamente el motor requiere adaptar el backend y la autenticación.

BEGIN;

-- -----------------------------------------------------------------------------
-- Perfil de usuario y sincronización con Supabase Auth
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.users (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email text NOT NULL UNIQUE,
    full_name text,
    phone text,
    role text NOT NULL DEFAULT 'staff'
        CHECK (role IN ('superadmin', 'business_owner', 'business_admin', 'staff')),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.sync_auth_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.users (id, email)
    VALUES (NEW.id, lower(NEW.email))
    ON CONFLICT (id) DO UPDATE
        SET email = EXCLUDED.email,
            updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gastrolink_auth_profile ON auth.users;
CREATE TRIGGER gastrolink_auth_profile
AFTER INSERT OR UPDATE OF email ON auth.users
FOR EACH ROW
WHEN (NEW.email IS NOT NULL)
EXECUTE FUNCTION public.sync_auth_profile();

INSERT INTO public.users (id, email)
SELECT id, lower(email)
FROM auth.users
WHERE email IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Negocios, categorías, platillos y extras
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.restaurants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(100) NOT NULL,
    slug varchar(100) NOT NULL UNIQUE
        CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    whatsapp_number varchar(20) NOT NULL,
    logo_url text,
    allows_table_order boolean NOT NULL DEFAULT true,
    allows_takeaway boolean NOT NULL DEFAULT true,
    allows_delivery boolean NOT NULL DEFAULT false,
    delivery_fee numeric(10, 2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
    minimum_order numeric(10, 2) NOT NULL DEFAULT 0 CHECK (minimum_order >= 0),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_businesses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    business_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('business_owner', 'business_admin', 'staff')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, business_id)
);

CREATE TABLE IF NOT EXISTS public.categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    name varchar(50) NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, restaurant_id)
);

CREATE TABLE IF NOT EXISTS public.products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id uuid NOT NULL,
    restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    name varchar(100) NOT NULL,
    description text,
    price numeric(10, 2) NOT NULL CHECK (price > 0),
    image_url text,
    is_available boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT products_category_business_fk
        FOREIGN KEY (category_id, restaurant_id)
        REFERENCES public.categories(id, restaurant_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.modifier_groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    name varchar(100) NOT NULL,
    is_required boolean NOT NULL DEFAULT false,
    min_selection integer NOT NULL DEFAULT 0 CHECK (min_selection >= 0),
    max_selection integer NOT NULL DEFAULT 1 CHECK (max_selection >= min_selection),
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.modifier_options (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    modifier_group_id uuid NOT NULL REFERENCES public.modifier_groups(id) ON DELETE CASCADE,
    name varchar(100) NOT NULL,
    price_extra numeric(10, 2) NOT NULL DEFAULT 0 CHECK (price_extra >= 0),
    is_available boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_businesses_user_idx ON public.user_businesses(user_id);
CREATE INDEX IF NOT EXISTS user_businesses_business_idx ON public.user_businesses(business_id);
CREATE INDEX IF NOT EXISTS categories_restaurant_sort_idx ON public.categories(restaurant_id, sort_order);
CREATE INDEX IF NOT EXISTS products_restaurant_sort_idx ON public.products(restaurant_id, sort_order);
CREATE INDEX IF NOT EXISTS products_category_sort_idx ON public.products(category_id, sort_order);
CREATE INDEX IF NOT EXISTS modifier_groups_product_sort_idx ON public.modifier_groups(product_id, sort_order);
CREATE INDEX IF NOT EXISTS modifier_options_group_sort_idx ON public.modifier_options(modifier_group_id, sort_order);

-- -----------------------------------------------------------------------------
-- Pedidos y prevención de duplicados
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key uuid NOT NULL UNIQUE,
    restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    customer_name text NOT NULL,
    customer_phone text NOT NULL,
    service_type text NOT NULL CHECK (service_type IN ('table', 'takeaway', 'delivery')),
    -- Conservado para instalaciones anteriores; el backend también lo envía.
    delivery_method text,
    table_number text,
    delivery_address text,
    address_references text,
    payment_method text NOT NULL,
    items jsonb NOT NULL DEFAULT '[]'::jsonb,
    -- Compatibilidad con esquemas anteriores de pedidos.
    raw_cart_json jsonb NOT NULL DEFAULT '[]'::jsonb,
    subtotal numeric(10, 2) NOT NULL CHECK (subtotal >= 0),
    delivery_fee numeric(10, 2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
    total numeric(10, 2) NOT NULL CHECK (total >= 0),
    status text NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_business_created_idx
    ON public.orders(restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_business_status_created_idx
    ON public.orders(restaurant_id, status, created_at DESC);

-- -----------------------------------------------------------------------------
-- Funciones compartidas y plantillas de menú
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DO $$
DECLARE table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'users', 'user_businesses', 'restaurants', 'categories', 'products',
        'modifier_groups', 'modifier_options', 'orders'
    ] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS gastrolink_updated_at ON public.%I', table_name);
        EXECUTE format(
            'CREATE TRIGGER gastrolink_updated_at BEFORE UPDATE ON public.%I '
            'FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()',
            table_name
        );
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_business_with_owner(business_data jsonb, owner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    business public.restaurants;
    template text := coalesce(business_data->>'template_type', 'empty');
    category_names text[];
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.users WHERE id = owner_id AND is_active
    ) THEN
        RAISE EXCEPTION 'Owner inactive or missing';
    END IF;

    CASE template
        WHEN 'empty' THEN category_names := ARRAY[]::text[];
        WHEN 'taqueria' THEN category_names := ARRAY['Tacos','Gringas y quesadillas','Tortas','Especialidades','Bebidas','Extras'];
        WHEN 'fonda' THEN category_names := ARRAY['Desayunos','Comidas corridas','Antojitos','Bebidas','Postres'];
        WHEN 'antojitos' THEN category_names := ARRAY['Tacos y quesadillas','Sopes y huaraches','Gorditas','Tostadas','Bebidas'];
        WHEN 'hamburgueseria' THEN category_names := ARRAY['Hamburguesas','Hot dogs','Papas y complementos','Malteadas y bebidas','Extras'];
        WHEN 'cafeteria' THEN category_names := ARRAY['Café','Bebidas frías','Desayunos','Pan dulce y postres','Alimentos'];
        WHEN 'pizzeria' THEN category_names := ARRAY['Pizzas','Pastas','Entradas','Bebidas','Postres'];
        WHEN 'marisqueria' THEN category_names := ARRAY['Ceviches y cocteles','Tostadas','Tacos y quesadillas','Platillos','Bebidas'];
        WHEN 'restaurante_familiar' THEN category_names := ARRAY['Entradas','Sopas y ensaladas','Platos fuertes','Guarniciones','Bebidas','Postres'];
        ELSE RAISE EXCEPTION 'Unsupported business template: %', template;
    END CASE;

    INSERT INTO public.restaurants (
        name, slug, whatsapp_number, logo_url, allows_table_order,
        allows_takeaway, allows_delivery, delivery_fee, minimum_order, is_active
    ) VALUES (
        business_data->>'name',
        business_data->>'slug',
        business_data->>'whatsapp_number',
        business_data->>'logo_url',
        coalesce((business_data->>'allows_table_order')::boolean, true),
        coalesce((business_data->>'allows_takeaway')::boolean, true),
        coalesce((business_data->>'allows_delivery')::boolean, false),
        coalesce((business_data->>'delivery_fee')::numeric, 0),
        coalesce((business_data->>'minimum_order')::numeric, 0),
        coalesce((business_data->>'is_active')::boolean, true)
    ) RETURNING * INTO business;

    INSERT INTO public.user_businesses (user_id, business_id, role)
    VALUES (owner_id, business.id, 'business_owner');

    INSERT INTO public.categories (restaurant_id, name, sort_order)
    SELECT business.id, category_name, ordinal::integer - 1
    FROM unnest(category_names) WITH ORDINALITY AS seeded(category_name, ordinal);

    RETURN to_jsonb(business);
END;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_dish_photos(p_business_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT CASE
        WHEN p_business_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN false
        ELSE EXISTS (
            SELECT 1
            FROM public.users u
            WHERE u.id = (SELECT auth.uid())
              AND u.is_active
              AND (
                  u.role = 'superadmin'
                  OR EXISTS (
                      SELECT 1 FROM public.user_businesses ub
                      WHERE ub.user_id = u.id
                        AND ub.business_id::text = p_business_id
                        AND ub.role IN ('business_owner', 'business_admin')
                  )
              )
        )
    END;
$$;

-- -----------------------------------------------------------------------------
-- Supabase Storage: fotos públicas, escrituras restringidas por negocio
-- -----------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('dish-photos', 'dish-photos', true, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "dish photos public read" ON storage.objects;
CREATE POLICY "dish photos public read"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'dish-photos');

DROP POLICY IF EXISTS "business members upload dish photos" ON storage.objects;
CREATE POLICY "business members upload dish photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'dish-photos'
    AND public.can_manage_dish_photos((storage.foldername(name))[1])
);

DROP POLICY IF EXISTS "business members update dish photos" ON storage.objects;
CREATE POLICY "business members update dish photos"
ON storage.objects FOR UPDATE TO authenticated
USING (
    bucket_id = 'dish-photos'
    AND public.can_manage_dish_photos((storage.foldername(name))[1])
)
WITH CHECK (
    bucket_id = 'dish-photos'
    AND public.can_manage_dish_photos((storage.foldername(name))[1])
);

DROP POLICY IF EXISTS "business members delete dish photos" ON storage.objects;
CREATE POLICY "business members delete dish photos"
ON storage.objects FOR DELETE TO authenticated
USING (
    bucket_id = 'dish-photos'
    AND public.can_manage_dish_photos((storage.foldername(name))[1])
);

-- -----------------------------------------------------------------------------
-- Permisos: los datos de la aplicación solo se consultan mediante el backend
-- -----------------------------------------------------------------------------

DO $$
DECLARE table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'users', 'user_businesses', 'restaurants', 'categories', 'products',
        'modifier_groups', 'modifier_options', 'orders'
    ] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
        EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', table_name);
        EXECUTE format('GRANT ALL ON public.%I TO service_role', table_name);
    END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_auth_profile() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_business_with_owner(jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_business_with_owner(jsonb, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.can_manage_dish_photos(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_dish_photos(text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
