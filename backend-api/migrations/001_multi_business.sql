-- Apply after the existing GastroLink schema. Non-destructive migration.
BEGIN;
CREATE TABLE IF NOT EXISTS public.users (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email text NOT NULL UNIQUE,
    role text NOT NULL DEFAULT 'staff' CHECK (role IN ('superadmin','business_owner','business_admin','staff')),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.user_businesses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    business_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('business_owner','business_admin','staff')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id,business_id)
);
CREATE INDEX IF NOT EXISTS user_businesses_business_idx ON public.user_businesses(business_id);

-- Passwords remain exclusively in Supabase Auth, never in public.users.
CREATE OR REPLACE FUNCTION public.sync_auth_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    INSERT INTO public.users(id,email) VALUES (NEW.id, lower(NEW.email))
    ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email, updated_at=now();
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS gastrolink_auth_profile ON auth.users;
CREATE TRIGGER gastrolink_auth_profile AFTER INSERT OR UPDATE OF email ON auth.users
FOR EACH ROW WHEN (NEW.email IS NOT NULL) EXECUTE FUNCTION public.sync_auth_profile();
INSERT INTO public.users(id,email)
SELECT id,lower(email) FROM auth.users WHERE email IS NOT NULL
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.modifier_groups ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.modifier_options ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
UPDATE public.products p SET restaurant_id=c.restaurant_id FROM public.categories c WHERE p.category_id=c.id;
ALTER TABLE public.products ALTER COLUMN restaurant_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS categories_id_restaurant_idx ON public.categories(id,restaurant_id);
ALTER TABLE public.products ADD CONSTRAINT products_category_business_fk
    FOREIGN KEY(category_id,restaurant_id) REFERENCES public.categories(id,restaurant_id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS restaurants_slug_unique_idx ON public.restaurants(slug);
ALTER TABLE public.restaurants ADD CONSTRAINT restaurants_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE public.restaurants ADD CONSTRAINT restaurants_nonnegative_fees CHECK (delivery_fee >= 0 AND minimum_order >= 0);

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN NEW.updated_at=now(); RETURN NEW; END; $$;
DO $$ DECLARE t text; BEGIN
    FOREACH t IN ARRAY ARRAY['users','user_businesses','restaurants','categories','products','modifier_groups','modifier_options'] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS gastrolink_updated_at ON public.%I',t);
        EXECUTE format('CREATE TRIGGER gastrolink_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()',t);
        -- All access goes through the API and a server-only service-role key.
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
        EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated',t);
        EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.create_business_with_owner(business_data jsonb, owner_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE business public.restaurants;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=owner_id AND is_active) THEN
        RAISE EXCEPTION 'Owner inactive or missing';
    END IF;
    INSERT INTO public.restaurants(name,slug,whatsapp_number,logo_url,allows_table_order,allows_takeaway,
        allows_delivery,delivery_fee,minimum_order,is_active)
    VALUES (business_data->>'name',business_data->>'slug',business_data->>'whatsapp_number',business_data->>'logo_url',
        (business_data->>'allows_table_order')::boolean,(business_data->>'allows_takeaway')::boolean,
        (business_data->>'allows_delivery')::boolean,(business_data->>'delivery_fee')::numeric,
        (business_data->>'minimum_order')::numeric,(business_data->>'is_active')::boolean)
    RETURNING * INTO business;
    INSERT INTO public.user_businesses(user_id,business_id,role) VALUES(owner_id,business.id,'business_owner');
    RETURN to_jsonb(business);
END; $$;
REVOKE ALL ON FUNCTION public.create_business_with_owner(jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_business_with_owner(jsonb,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.sync_auth_profile() FROM PUBLIC,anon,authenticated;
COMMIT;
