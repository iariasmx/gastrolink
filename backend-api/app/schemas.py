from datetime import datetime
from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel, Field, ConfigDict


# --- RESTAURANTS SCHEMAS ---
class RestaurantBase(BaseModel):
    name: str = Field(..., max_length=100, example="Tacos El Pastor")
    slug: str = Field(..., max_length=100, example="tacos-el-pastor")
    whatsapp_number: str = Field(..., max_length=20, example="525512345678")
    logo_url: Optional[str] = None
    allows_table_order: bool = True
    allows_takeaway: bool = True
    allows_delivery: bool = False
    delivery_fee: float = 0.00
    minimum_order: float = 0.00
    is_active: bool = True


class RestaurantCreate(RestaurantBase):
    pass


class Restaurant(RestaurantBase):
    id: UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# --- CATEGORIES SCHEMAS ---
class CategoryBase(BaseModel):
    name: str = Field(..., max_length=50, example="Entradas")
    sort_order: int = 0


class CategoryCreate(CategoryBase):
    restaurant_id: UUID


class Category(CategoryBase):
    id: UUID
    restaurant_id: UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# --- PRODUCTS SCHEMAS ---
class ProductBase(BaseModel):
    name: str = Field(..., max_length=100, example="Taco al Pastor")
    description: Optional[str] = Field(None, example="Con todo: tortilla de maíz, carne de cerdo adobada, piña, cilantro y cebolla.")
    price: float = Field(..., gt=0, example=25.00)
    image_url: Optional[str] = None
    is_available: bool = True


class ProductCreate(ProductBase):
    category_id: UUID


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    image_url: Optional[str] = None
    is_available: Optional[bool] = None
    category_id: Optional[UUID] = None


class Product(ProductBase):
    id: UUID
    category_id: UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

    # --- MODIFIER SCHEMAS ---
class ModifierOptionBase(BaseModel):
    name: str = Field(..., max_length=100, example="Queso Extra")
    price_extra: float = Field(default=0.00, ge=0, example=15.00)
    is_available: bool = True
    sort_order: int = 0

class ModifierOptionCreate(ModifierOptionBase):
    modifier_group_id: UUID

class ModifierOption(ModifierOptionBase):
    id: UUID
    modifier_group_id: UUID
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ModifierGroupBase(BaseModel):
    name: str = Field(..., max_length=100, example="Elige tus extras")
    is_required: bool = False
    min_selection: int = 0
    max_selection: int = 1
    sort_order: int = 0

class ModifierGroupCreate(ModifierGroupBase):
    product_id: UUID

class ModifierGroup(ModifierGroupBase):
    id: UUID
    product_id: UUID
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class RestaurantUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    whatsapp_number: Optional[str] = None
    logo_url: Optional[str] = None
    allows_table_order: Optional[bool] = None
    allows_takeaway: Optional[bool] = None
    allows_delivery: Optional[bool] = None
    delivery_fee: Optional[float] = None
    minimum_order: Optional[float] = None


# --- AGGREGATED MENU SCHEMAS ---
class ModifierGroupWithWithOptions(ModifierGroup):
    options: List[ModifierOption] = []  # Lista de opciones dentro del grupo (ej: Queso, Tocino)

class ProductWithModifiers(Product):
    modifier_groups: List[ModifierGroupWithWithOptions] = []  # Lista de grupos pegados al producto

class CategoryWithProducts(Category):
    # Cambiamos List[Product] por List[ProductWithModifiers]
    products: List[ProductWithModifiers] = [] 

class FullMenuResponse(BaseModel):
    restaurant: Restaurant
    categories: List[CategoryWithProducts] = []


# --- ORDER / WHATSAPP CHECKOUT SCHEMAS ---
class SelectedModifierSchema(BaseModel):
    modifier_option_id: UUID
    name: str = Field(..., example="Queso Extra")
    price_extra: float = Field(..., example=15.00)

class OrderItemSchema(BaseModel):
    product_id: UUID
    product_name: str
    price: float  # Precio base del producto
    quantity: int = Field(..., gt=0)
    notes: Optional[str] = None
    # Nueva lista con las opciones exactas elegidas por el cliente
    selected_modifiers: List[SelectedModifierSchema] = [] 


class OrderCheckoutRequest(BaseModel):
    idempotency_key: UUID
    restaurant_slug: str
    service_type: str = Field(..., example="delivery", description="table, takeaway, or delivery")
    table_number: Optional[str] = Field(None, example="Mesa 4")
    customer_name: str = Field(..., example="Juan Pérez")
    customer_phone: str = Field(..., example="5512345678")
    delivery_address: Optional[str] = Field(None, example="Av. Insurgentes Sur 123, Col. Roma")
    address_references: Optional[str] = Field(None, example="Entre Cima y Pino, portón blanco")
    payment_method: str = Field(..., example="Efectivo")
    items: List[OrderItemSchema]


class WhatsAppLinkResponse(BaseModel):
    whatsapp_number: str
    message_text: str
    whatsapp_url: str


# --- AUTHENTICATION SCHEMAS ---
class LoginRequest(BaseModel):
    email: str = Field(..., example="admin@gastrolink.mx")
    password: str = Field(..., example="admin123")


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_email: str
    restaurant_slug: Optional[str] = "tacos-el-pastor"


