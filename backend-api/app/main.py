from urllib.parse import quote
from typing import List, Optional
from fastapi import FastAPI, HTTPException, status, Query
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import supabase
from app import schemas

app = FastAPI(
    title="GastroLink API",
    description="API para el generador de menús digitales MenuQR SaaS con pedidos por WhatsApp.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configuración CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS if isinstance(settings.CORS_ORIGINS, list) else [settings.CORS_ORIGINS],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", tags=["Health"])
def root():
    return {
        "message": "Bienvenido a GastroLink API",
        "status": "online",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "ok"}


# --- RESTAURANTS ENDPOINTS ---

@app.get("/api/restaurants", response_model=List[schemas.Restaurant], tags=["Restaurants"])
def list_restaurants():
    """
    Lista todos los restaurantes registrados y activos.
    """
    try:
        response = supabase.table("restaurants").select("*").eq("is_active", True).execute()
        return response.data
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al consultar la base de datos: {str(e)}"
        )


@app.get("/api/restaurants/by-slug/{slug}", response_model=schemas.FullMenuResponse, tags=["Menu Público"])
def get_menu_by_slug(slug: str, include_all: bool = Query(True, description="Incluir productos no disponibles")):
    """
    Obtiene el restaurante y su menú completo enriquecido con grupos de modificadores y opciones.
    """
    try:
        # 1. Buscar el restaurante
        rest_res = supabase.table("restaurants").select("*").eq("slug", slug).eq("is_active", True).execute()
        if not rest_res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Restaurante con slug '{slug}' no encontrado o inactivo."
            )
        
        restaurant_data = rest_res.data[0]
        restaurant_id = restaurant_data["id"]

        # 2. Buscar categorías del restaurante
        cat_res = supabase.table("categories")\
            .select("*")\
            .eq("restaurant_id", restaurant_id)\
            .order("sort_order", desc=False)\
            .execute()
        
        categories_data = cat_res.data or []
        category_ids = [c["id"] for c in categories_data]

        # 3. Buscar productos, sus grupos de modificadores y opciones
        products_data = []
        if category_ids:
            p_query = supabase.table("products").select("*").in_("category_id", category_ids)
            if not include_all:
                p_query = p_query.eq("is_available", True)
            prod_res = p_query.execute()
            products_data = prod_res.data or []

        if products_data:
            product_ids = [p["id"] for p in products_data]
            
            # Buscar grupos de modificadores para estos productos
            groups_res = supabase.table("modifier_groups")\
                .select("*")\
                .in_("product_id", product_ids)\
                .order("sort_order", desc=False)\
                .execute()
            groups_data = groups_res.data or []
            
            # Buscar opciones de modificadores para estos grupos
            options_data = []
            if groups_data:
                group_ids = [g["id"] for g in groups_data]
                opt_query = supabase.table("modifier_options").select("*").in_("modifier_group_id", group_ids)
                if not include_all:
                    opt_query = opt_query.eq("is_available", True)
                opt_res = opt_query.order("sort_order", desc=False).execute()
                options_data = opt_res.data or []

            # --- ANIDACIÓN MANUAL ---
            # Pegar opciones dentro de sus grupos correspondientes
            for group in groups_data:
                group["options"] = [o for o in options_data if str(o["modifier_group_id"]) == str(group["id"])]
            
            # Pegar grupos de modificadores dentro de sus productos correspondientes
            for prod in products_data:
                prod["modifier_groups"] = [g for g in groups_data if str(g["product_id"]) == str(prod["id"])]
        else:
            products_data = []

        # Mapear productos estructurados por categoría
        categories_with_products = []
        for cat in categories_data:
            cat_id = cat["id"]
            cat_products = [p for p in products_data if str(p.get("category_id")) == str(cat_id)]
            categories_with_products.append({
                **cat,
                "products": cat_products
            })

        return {
            "restaurant": restaurant_data,
            "categories": categories_with_products
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al procesar la solicitud: {str(e)}"
        )


# --- ORDERS / WHATSAPP CHECKOUT HELPER ---
@app.post("/api/checkout/whatsapp-url", response_model=schemas.WhatsAppLinkResponse, tags=["Checkout"])
def generate_whatsapp_order_link(order: schemas.OrderCheckoutRequest):
    """
    Genera el enlace de WhatsApp estructurado calculando los extras de los modificadores elegidos.
    """
    try:
        rest_res = supabase.table("restaurants").select("*").eq("slug", order.restaurant_slug).execute()
        if not rest_res.data:
            raise HTTPException(status_code=404, detail="Restaurante no encontrado")
        
        restaurant = rest_res.data[0]
        phone = restaurant.get("whatsapp_number", "").replace("+", "").replace(" ", "").replace("-", "")

        msg_lines = [
            f"🛒 *NUEVO PEDIDO - {restaurant.get('name', 'GastroLink')}*",
            "----------------------------------",
            f"👤 *Cliente:* {order.customer_name}",
            f"📞 *Teléfono:* {order.customer_phone}",
            f"📍 *Modalidad:* {order.service_type.upper()}"
        ]

        if order.service_type.lower() == "table" and order.table_number:
            msg_lines.append(f"🪑 *Mesa:* {order.table_number}")
        elif order.service_type.lower() == "delivery":
            msg_lines.append(f"🏠 *Dirección:* {order.delivery_address or 'No especificada'}")
            if order.address_references:
                msg_lines.append(f"ℹ️ *Referencias:* {order.address_references}")

        msg_lines.append(f"💳 *Método de Pago:* {order.payment_method}")
        msg_lines.append("----------------------------------")
        msg_lines.append("📋 *DETALLE DEL PEDIDO:*")

        subtotal = 0.0
        for idx, item in enumerate(order.items, start=1):
            # 1. Calcular costos extras de los modificadores de este platillo
            modifiers_cost = sum(float(mod.price_extra) for mod in item.selected_modifiers)
            item_unit_price = float(item.price) + modifiers_cost
            item_total = item_unit_price * item.quantity
            subtotal += item_total
            
            # Línea principal del producto
            line = f"{idx}. {item.quantity}x {item.product_name} - ${item_total:.2f}"
            msg_lines.append(line)
            
            # Indentar visualmente los modificadores seleccionados debajo del platillo
            for mod in item.selected_modifiers:
                mod_line = f"    └─ _{mod.name}_"
                if float(mod.price_extra) > 0:
                    mod_line += f" (+${float(mod.price_extra):.2f})"
                msg_lines.append(mod_line)
                
            if item.notes:
                msg_lines.append(f"    📝 _Nota: {item.notes}_")

        delivery_fee = float(restaurant.get("delivery_fee", 0.00)) if order.service_type.lower() == "delivery" else 0.0
        grand_total = subtotal + delivery_fee

        msg_lines.append("----------------------------------")
        msg_lines.append(f"💵 *Subtotal:* ${subtotal:.2f}")
        if delivery_fee > 0:
            msg_lines.append(f"🛵 *Costo Envío:* ${delivery_fee:.2f}")
        msg_lines.append(f"💰 *TOTAL A PAGAR:* ${grand_total:.2f}")
        
        if order.payment_method.lower() == "transferencia":
            msg_lines.append("\n⚠️ _Por favor adjunta el comprobante de tu transferencia a este chat._")
            
        msg_lines.append("\n¡Gracias por tu compra!")

        full_message = "\n".join(msg_lines)
        encoded_message = quote(full_message)
        whatsapp_url = f"https://wa.me/{phone}?text={encoded_message}"

        return {
            "whatsapp_number": phone,
            "message_text": full_message,
            "whatsapp_url": whatsapp_url
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al generar enlace de WhatsApp: {str(e)}"
        )



# --- AUTHENTICATION ENDPOINTS ---

@app.post("/api/auth/login", response_model=schemas.TokenResponse, tags=["Autenticación"])
def login(credentials: schemas.LoginRequest):
    """
    Autenticación de administradores de restaurante.
    Soporta inicio de sesión mediante Supabase Auth o credenciales de administración.
    """
    try:
        # Intentar autenticar vía Supabase Auth
        try:
            auth_res = supabase.auth.sign_in_with_password({
                "email": credentials.email,
                "password": credentials.password
            })
            if auth_res and auth_res.session:
                return {
                    "access_token": auth_res.session.access_token,
                    "token_type": "bearer",
                    "user_email": credentials.email,
                    "restaurant_slug": "tacos-el-pastor"
                }
        except Exception:
            pass

        # Autenticación fallback para entorno local de pruebas
        if credentials.email == "admin@gastrolink.mx" and credentials.password == "admin123":
            return {
                "access_token": "demo_jwt_token_gastrolink_admin_2026",
                "token_type": "bearer",
                "user_email": credentials.email,
                "restaurant_slug": "tacos-el-pastor"
            }

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales de acceso incorrectas (Email o contraseña no válidos)."
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error en servidor de autenticación: {str(e)}"
        )


# --- PRODUCTS CRUD ENDPOINTS ---

@app.post("/api/products", response_model=schemas.Product, tags=["CRUD Productos"])
def create_product(product: schemas.ProductCreate):
    """
    Crea un nuevo producto en el catálogo.
    """
    try:
        data = product.model_dump()
        data["category_id"] = str(data["category_id"])
        response = supabase.table("products").insert(data).execute()
        if not response.data:
            raise HTTPException(status_code=400, detail="No se pudo crear el producto")
        return response.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al crear producto: {str(e)}")


@app.put("/api/products/{product_id}", response_model=schemas.Product, tags=["CRUD Productos"])
def update_product(product_id: str, product_update: schemas.ProductUpdate):
    """
    Actualiza los datos de un producto (nombre, precio, disponibilidad, etc.).
    """
    try:
        update_data = {k: (str(v) if isinstance(v, schemas.UUID) else v) for k, v in product_update.model_dump(exclude_unset=True).items()}
        if not update_data:
            raise HTTPException(status_code=400, detail="No se enviaron campos para actualizar")
        
        response = supabase.table("products").update(update_data).eq("id", product_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Producto no encontrado")
        return response.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al actualizar producto: {str(e)}")


@app.delete("/api/products/{product_id}", tags=["CRUD Productos"])
def delete_product(product_id: str):
    """
    Elimina un producto del menú.
    """
    try:
        response = supabase.table("products").delete().eq("id", product_id).execute()
        return {"message": "Producto eliminado correctamente", "id": product_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al eliminar producto: {str(e)}")


# --- CATEGORIES CRUD ENDPOINTS ---

@app.post("/api/categories", response_model=schemas.Category, tags=["CRUD Categorías"])
def create_category(category: schemas.CategoryCreate):
    """
    Crea una nueva categoría para agrupar platillos.
    """
    try:
        data = category.model_dump()
        data["restaurant_id"] = str(data["restaurant_id"])
        response = supabase.table("categories").insert(data).execute()
        if not response.data:
            raise HTTPException(status_code=400, detail="No se pudo crear la categoría")
        return response.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al crear categoría: {str(e)}")


# --- RESTAURANTS CRUD ENDPOINTS ---

@app.put("/api/restaurants/{restaurant_id}", response_model=schemas.Restaurant, tags=["CRUD Restaurante"])
def update_restaurant(restaurant_id: str, restaurant_update: schemas.RestaurantUpdate):
    """
    Actualiza la configuración del restaurante (nombre, slug, whatsapp, modalidades).
    """
    try:
        update_data = restaurant_update.model_dump(exclude_unset=True)
        response = supabase.table("restaurants").update(update_data).eq("id", restaurant_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Restaurante no encontrado")
        return response.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al actualizar restaurante: {str(e)}")


