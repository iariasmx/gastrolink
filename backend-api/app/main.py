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


# --- ORDERS / WHATSAPP CHECKOUT HELPER ---
@app.post("/api/checkout/whatsapp-url", response_model=schemas.WhatsAppLinkResponse, tags=["Checkout"])
def generate_whatsapp_order_link(order: schemas.OrderCheckoutRequest):
    """
    Genera el enlace de WhatsApp estructurado calculando los extras de los modificadores elegidos.
    """
    try:
        rest_res = supabase.table("restaurants").select("*").eq("slug", order.restaurant_slug).eq("is_active", True).execute()
        if not rest_res.data:
            raise HTTPException(status_code=404, detail="Restaurante no encontrado")
        
        restaurant = rest_res.data[0]
        phone = restaurant.get("whatsapp_number", "").replace("+", "").replace(" ", "").replace("-", "")

        msg_lines = [
            f"*NUEVO PEDIDO - {restaurant.get('name', 'GastroLink')}*",
            "----------------------------------",
            f"*Cliente:* {order.customer_name}",
            f"*Teléfono:* {order.customer_phone}",
            f"*Modalidad:* {order.service_type.upper()}"
        ]

        if order.service_type.lower() == "table" and order.table_number:
            msg_lines.append(f"*Mesa:* {order.table_number}")
        elif order.service_type.lower() == "delivery":
            msg_lines.append(f"*Dirección:* {order.delivery_address or 'No especificada'}")
            if order.address_references:
                msg_lines.append(f"*Referencias:* {order.address_references}")

        msg_lines.append(f"*Método de pago:* {order.payment_method}")
        msg_lines.append("----------------------------------")
        msg_lines.append("*DETALLE DEL PEDIDO:*")

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
                msg_lines.append(f"    _Nota: {item.notes}_")

        delivery_fee = float(restaurant.get("delivery_fee", 0.00)) if order.service_type.lower() == "delivery" else 0.0
        grand_total = subtotal + delivery_fee

        msg_lines.append("----------------------------------")
        msg_lines.append(f"*Subtotal:* ${subtotal:.2f}")
        if delivery_fee > 0:
            msg_lines.append(f"*Costo de envío:* ${delivery_fee:.2f}")
        msg_lines.append(f"*TOTAL A PAGAR:* ${grand_total:.2f}")
        
        if order.payment_method.lower() == "transferencia":
            msg_lines.append("\n_Por favor adjunta el comprobante de tu transferencia a este chat._")
            
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



# Business-scoped replacements for the old unauthenticated CRUD routes.
from app.tenant_routes import router as tenant_router
app.include_router(tenant_router)
