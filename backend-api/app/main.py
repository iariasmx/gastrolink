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
    redoc_url="/redoc",
    openapi_tags=[
        {"name": "Salud", "description": "Estado y disponibilidad de la API."},
        {"name": "Autenticación", "description": "Inicio de sesión y consulta de la sesión actual."},
        {"name": "Administración de negocios", "description": "Operaciones globales disponibles para superadmin."},
        {"name": "Menú y configuración", "description": "Consulta administrativa del menú y configuración de un negocio."},
        {"name": "Categorías", "description": "Categorías de menú asociadas a un negocio."},
        {"name": "Productos", "description": "Productos de menú asociados a un negocio."},
        {"name": "Grupos de modificadores", "description": "Grupos de opciones asociados a productos de un negocio."},
        {"name": "Opciones de modificadores", "description": "Opciones asociadas a grupos de modificadores de un negocio."},
        {"name": "Menú público", "description": "Consulta pública de negocios y menús activos."},
        {"name": "Checkout por WhatsApp", "description": "Preparación del enlace de pedido para WhatsApp."},
        {"name": "Pedidos", "description": "Registro y seguimiento de pedidos por negocio."},
    ],
)

# Configuración CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS if isinstance(settings.CORS_ORIGINS, list) else [settings.CORS_ORIGINS],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", tags=["Salud"])
def root():
    return {
        "message": "Bienvenido a GastroLink API",
        "status": "online",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/health", tags=["Salud"])
def health_check():
    return {"status": "ok"}


# --- RESTAURANTS ENDPOINTS ---

@app.get("/api/restaurants", response_model=List[schemas.Restaurant], tags=["Menú público"])
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
@app.post("/api/checkout/whatsapp-url", response_model=schemas.WhatsAppLinkResponse, tags=["Checkout por WhatsApp"])
def generate_whatsapp_order_link(order: schemas.OrderCheckoutRequest):
    """
    Genera el enlace de WhatsApp estructurado calculando los extras de los modificadores elegidos.
    """
    from app.order_routes import create_order_record
    saved = create_order_record(order.model_dump())
    return {key: saved[key] for key in ('whatsapp_number', 'message_text', 'whatsapp_url')}



# Business-scoped replacements for the old unauthenticated CRUD routes.
from app.tenant_routes import router as tenant_router
app.include_router(tenant_router)
from app.order_routes import router as orders_router
app.include_router(orders_router)
