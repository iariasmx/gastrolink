from supabase import create_client, Client
from app.config import settings


def get_supabase_client() -> Client:
    """
    Inicializa y retorna el cliente oficial de Supabase.
    """
    # Existing publishable keys support public reads; administration requires
    # a separate server-only service key, checked by the protected API.
    key = settings.SUPABASE_SECRET_KEY or settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_KEY
    return create_client(settings.SUPABASE_URL, key)


supabase: Client = get_supabase_client()
