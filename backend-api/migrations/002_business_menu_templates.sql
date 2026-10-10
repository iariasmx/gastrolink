-- Seed starter menu categories atomically when a business is created.
-- Run after 001_multi_business.sql.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_business_with_owner(business_data jsonb, owner_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    business public.restaurants;
    template text := coalesce(business_data->>'template_type', 'empty');
    category_names text[];
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=owner_id AND is_active) THEN
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

    INSERT INTO public.restaurants(name,slug,whatsapp_number,logo_url,allows_table_order,allows_takeaway,
        allows_delivery,delivery_fee,minimum_order,is_active)
    VALUES (business_data->>'name',business_data->>'slug',business_data->>'whatsapp_number',business_data->>'logo_url',
        (business_data->>'allows_table_order')::boolean,(business_data->>'allows_takeaway')::boolean,
        (business_data->>'allows_delivery')::boolean,(business_data->>'delivery_fee')::numeric,
        (business_data->>'minimum_order')::numeric,(business_data->>'is_active')::boolean)
    RETURNING * INTO business;

    INSERT INTO public.user_businesses(user_id,business_id,role)
    VALUES(owner_id,business.id,'business_owner');

    INSERT INTO public.categories(restaurant_id,name,sort_order)
    SELECT business.id, category_name, ordinal::integer - 1
    FROM unnest(category_names) WITH ORDINALITY AS seeded(category_name, ordinal);

    RETURN to_jsonb(business);
END; $$;

REVOKE ALL ON FUNCTION public.create_business_with_owner(jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_business_with_owner(jsonb,uuid) TO service_role;

COMMIT;
