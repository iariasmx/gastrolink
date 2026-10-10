-- Public menu photos with uploads restricted to each business's owners/admins.
BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('dish-photos', 'dish-photos', true, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- This SECURITY DEFINER helper can read the app's RLS-protected membership tables.
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
                        AND ub.role IN ('business_owner','business_admin')
                  )
              )
        )
    END;
$$;
REVOKE ALL ON FUNCTION public.can_manage_dish_photos(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_dish_photos(text) TO authenticated;

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

COMMIT;
