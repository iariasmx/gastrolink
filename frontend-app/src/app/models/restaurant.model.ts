export interface Restaurant {
  id: string;
  name: string;
  slug: string;
  whatsapp_number: string;
  logo_url?: string;
  allows_table_order: boolean;
  allows_takeaway: boolean;
  allows_delivery: boolean;
  delivery_fee: number;
  minimum_order: number;
  is_active: boolean;
  created_at?: string;
}

export interface Category {
  id: string;
  restaurant_id: string;
  name: string;
  sort_order: number;
  created_at?: string;
}

export interface Product {
  id: string;
  category_id: string;
  name: string;
  description?: string;
  price: number;
  image_url?: string;
  is_available: boolean;
  created_at?: string;
}

export interface CategoryWithProducts extends Category {
  products: Product[];
}

export interface FullMenuResponse {
  restaurant: Restaurant;
  categories: CategoryWithProducts[];
}
