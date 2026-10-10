-- Bring older orders tables up to the columns expected by the checkout API.
-- Existing historical records receive safe defaults where needed; new records
-- are populated and validated by the backend before insert.
BEGIN;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS idempotency_key uuid DEFAULT gen_random_uuid();
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_name text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_phone text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS service_type text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_method text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS table_number text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_address text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS address_references text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS items jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS raw_cart_json jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS subtotal numeric(10,2) DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_fee numeric(10,2) DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total numeric(10,2) DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS status text DEFAULT 'new';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE public.orders SET id = gen_random_uuid() WHERE id IS NULL;
UPDATE public.orders SET idempotency_key = gen_random_uuid() WHERE idempotency_key IS NULL;
UPDATE public.orders SET items = '[]'::jsonb WHERE items IS NULL;
UPDATE public.orders SET raw_cart_json = '[]' WHERE raw_cart_json IS NULL;
UPDATE public.orders SET subtotal = 0 WHERE subtotal IS NULL;
UPDATE public.orders SET delivery_fee = 0 WHERE delivery_fee IS NULL;
UPDATE public.orders SET total = 0 WHERE total IS NULL;
UPDATE public.orders SET status = 'new' WHERE status IS NULL;
UPDATE public.orders SET created_at = now() WHERE created_at IS NULL;
UPDATE public.orders SET updated_at = now() WHERE updated_at IS NULL;

ALTER TABLE public.orders ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.orders ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.orders ALTER COLUMN idempotency_key SET DEFAULT gen_random_uuid();
ALTER TABLE public.orders ALTER COLUMN idempotency_key SET NOT NULL;
ALTER TABLE public.orders ALTER COLUMN items SET DEFAULT '[]'::jsonb;
ALTER TABLE public.orders ALTER COLUMN raw_cart_json SET DEFAULT '[]';
ALTER TABLE public.orders ALTER COLUMN subtotal SET DEFAULT 0;
ALTER TABLE public.orders ALTER COLUMN delivery_fee SET DEFAULT 0;
ALTER TABLE public.orders ALTER COLUMN total SET DEFAULT 0;
ALTER TABLE public.orders ALTER COLUMN status SET DEFAULT 'new';
ALTER TABLE public.orders ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.orders ALTER COLUMN updated_at SET DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS orders_id_unique_idx ON public.orders(id);
CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_key_unique_idx ON public.orders(idempotency_key);
CREATE INDEX IF NOT EXISTS orders_business_created_idx ON public.orders(restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_business_status_created_idx ON public.orders(restaurant_id, status, created_at DESC);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.orders FROM anon, authenticated;
GRANT ALL ON public.orders TO service_role;

DROP TRIGGER IF EXISTS gastrolink_updated_at ON public.orders;
CREATE TRIGGER gastrolink_updated_at BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

NOTIFY pgrst, 'reload schema';
COMMIT;
