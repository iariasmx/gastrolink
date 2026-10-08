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
  updated_at?: string;
  created_at?: string;
}

export interface Category {
  is_active?: boolean;
  id: string;
  restaurant_id: string;
  name: string;
  sort_order: number;
  updated_at?: string;
  created_at?: string;
}

// --- NUEVAS INTERFACES PARA VARIANTES ---
export interface ModifierOption {
  id: string;
  modifier_group_id: string;
  name: string;
  price_extra: number;
  is_available: boolean;
  sort_order: number;
  updated_at?: string;
  created_at?: string;
}

export interface ModifierGroup {
  id: string;
  product_id: string;
  name: string;
  is_required: boolean;
  min_selection: number;
  max_selection: number;
  sort_order: number;
  options: ModifierOption[]; // Opciones anidadas
  updated_at?: string;
  created_at?: string;
}

// --- PRODUCTO ACTUALIZADO CON SUS VARIANTES ---
export interface Product {
  restaurant_id?: string;
  sort_order?: number;
  id: string;
  category_id: string;
  name: string;
  description?: string;
  price: number;
  image_url?: string;
  is_available: boolean;
  modifier_groups?: ModifierGroup[]; // Añadido como opcional para no romper productos simples
  updated_at?: string;
  created_at?: string;
}

export interface CategoryWithProducts extends Category {
  products: Product[];
}

export interface FullMenuResponse {
  restaurant: Restaurant;
  categories: CategoryWithProducts[];
}

// --- INTERFACES PARA LA ESTRUCTURA DEL CARRITO DE COMPRAS ---
export interface SelectedModifier {
  modifier_option_id: string;
  name: string;
  price_extra: number;
}

export interface CartItem {
  product_id: string;
  product_name: string;
  price: number; // Precio base
  quantity: number;
  notes?: string;
  selected_modifiers: SelectedModifier[];
}
