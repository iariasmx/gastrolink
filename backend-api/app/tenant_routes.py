import logging

logger = logging.getLogger(__name__)
from functools import lru_cache
from typing import Literal, Optional
from uuid import UUID
from secrets import token_urlsafe
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, ConfigDict, create_model, model_validator
from supabase import create_client
from app.config import settings
from app.database import supabase
from app.modifier_routes import GroupData, GroupCreate, OptionData, OptionCreate

router = APIRouter(prefix="/api")
bearer = HTTPBearer(auto_error=False)
Role = Literal['superadmin', 'business_owner', 'business_admin', 'staff']
BusinessRole = Literal['business_owner', 'business_admin', 'staff']


class StrictGroupCreate(GroupCreate):
    model_config = ConfigDict(extra='forbid')


class StrictOptionCreate(OptionCreate):
    model_config = ConfigDict(extra='forbid')


def rows(table, **filters):
    return _rows_query(table, tuple(sorted(filters.items(), key=lambda kv: kv[0])))


def _rows_query(table, filters):
    cache_key = (table, filters)
    cached = _rows_cache.get(cache_key)
    if cached is not None:
        return cached
    query = supabase.table(table).select('*')
    for key, value in filters:
        query = query.eq(key, str(value))
    data = query.execute().data or []
    _rows_cache[cache_key] = data
    if len(_rows_cache) > 2048:
        for _ in range(64):
            try:
                _rows_cache.pop(next(iter(_rows_cache)))
            except StopIteration:
                break
    return data


_rows_cache = {}


def invalidate_rows_cache(*tables):
    if not tables:
        _rows_cache.clear()
        return
    to_remove = [k for k in _rows_cache if k[0] in tables]
    for k in to_remove:
        _rows_cache.pop(k, None)


def one(table, **filters):
    data = rows(table, **filters)
    if not data:
        raise HTTPException(404, 'Recurso no encontrado')
    return data[0]


def current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer)):
    if not credentials:
        raise HTTPException(401, 'Se requiere un token válido', headers={'WWW-Authenticate': 'Bearer'})
    if not (settings.SUPABASE_SECRET_KEY or settings.SUPABASE_SERVICE_ROLE_KEY):
        raise HTTPException(503, 'La administración requiere SUPABASE_SECRET_KEY o SUPABASE_SERVICE_ROLE_KEY en el backend')
    try:
        auth = supabase.auth.get_user(credentials.credentials)
    except Exception as exc:
        logger.warning("current_user get_user exception type=%s msg=%s key_prefix=%s key_len=%s",
                       type(exc).__name__, str(exc),
                       (settings.SUPABASE_SECRET_KEY or settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_KEY or '')[:18],
                       len(settings.SUPABASE_SECRET_KEY or settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_KEY or ''))
        raise HTTPException(401, 'Token inválido o vencido', headers={'WWW-Authenticate': 'Bearer'})
    if not auth.user:
        raise HTTPException(401, 'Token inválido')
    profiles = rows('users', id=auth.user.id)
    if not profiles or not profiles[0]['is_active']:
        logger.warning("current_user missing or inactive profile auth_user_id=%s profiles=%s", auth.user.id, profiles)
        raise HTTPException(403, 'Usuario inactivo o sin perfil')
    return profiles[0]


def superadmin(user=Depends(current_user)):
    if user['role'] != 'superadmin':
        raise HTTPException(403, 'Se requiere superadmin')
    return user


def permit(user, business_id, action='menu'):
    if user['role'] == 'superadmin':
        return
    links = rows('user_businesses', user_id=user['id'], business_id=business_id)
    allowed = {'read': {'business_owner', 'business_admin', 'staff'},
               'menu': {'business_owner', 'business_admin'},
               'settings': {'business_owner', 'business_admin'},
               'users': {'business_owner'}}
    if not links or links[0]['role'] not in allowed[action]:
        raise HTTPException(403, 'Sin permiso sobre este negocio')


def businesses(user):
    if user['role'] == 'superadmin':
        return [{**r, 'role': 'superadmin'} for r in rows('restaurants')]
    links = rows('user_businesses', user_id=user['id'])
    if not links:
        return []
    found = supabase.table('restaurants').select('*').in_('id', [r['business_id'] for r in links]).execute().data or []
    roles = {str(r['business_id']): r['role'] for r in links}
    return [{**r, 'role': roles[str(r['id'])]} for r in found]


class Login(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1)


class SessionExchange(BaseModel):
    access_token: str = Field(min_length=1)


@router.post('/auth/login')
def login(payload: Login):
    # Separate client: sign-in must not change the database client's privileged credentials.
    client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    logger.info("POST /auth/login attempt email=%s key_prefix=%s key_len=%s url=%s",
                payload.email, settings.SUPABASE_KEY[:18], len(settings.SUPABASE_KEY), settings.SUPABASE_URL)
    try:
        result = client.auth.sign_in_with_password(payload.model_dump())
    except Exception as exc:
        logger.warning("POST /auth/login sign_in exception type=%s msg=%s", type(exc).__name__, str(exc))
        raise HTTPException(401, 'Credenciales incorrectas')
    if not result.session:
        logger.warning("POST /auth/login no session returned")
        raise HTTPException(401, 'Credenciales incorrectas')
    user = current_user(HTTPAuthorizationCredentials(scheme='Bearer', credentials=result.session.access_token))
    return {'access_token': result.session.access_token, 'token_type': 'bearer',
            'user_email': user['email'], 'user': user, 'businesses': businesses(user)}


@router.post('/auth/session')
def attach_session(payload: SessionExchange):
    logger.info("POST /auth/session token_prefix=%s", payload.access_token[:20] if payload.access_token else None)
    user = current_user(HTTPAuthorizationCredentials(scheme='Bearer', credentials=payload.access_token))
    return {'access_token': payload.access_token, 'token_type': 'bearer',
            'user_email': user['email'], 'user': user, 'businesses': businesses(user)}


@router.get('/auth/me')
def me(user=Depends(current_user)):
    return {'user': user, 'businesses': businesses(user)}


@router.get('/me/businesses')
def mine(user=Depends(current_user)):
    return businesses(user)


class BusinessData(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=100)
    slug: str = Field(min_length=1, max_length=100, pattern=r'^[a-z0-9]+(?:-[a-z0-9]+)*$')
    whatsapp_number: str = Field(min_length=1, max_length=20)
    logo_url: Optional[str] = None
    allows_table_order: bool = True
    allows_takeaway: bool = True
    allows_delivery: bool = False
    delivery_fee: float = Field(default=0, ge=0, allow_inf_nan=False)
    minimum_order: float = Field(default=0, ge=0, allow_inf_nan=False)
    is_active: bool = True


class BusinessCreate(BusinessData):
    owner_email: str = Field(min_length=3, max_length=254, pattern=r'^[^\s@]+@[^\s@]+\.[^\s@]+$')


BusinessUpdate = create_model('BusinessUpdate', __config__=ConfigDict(extra='forbid'),
    **{name: (Optional[field.annotation], Field(default=None, **({
        'min_length': 1, 'max_length': 100, 'pattern': r'^[a-z0-9]+(?:-[a-z0-9]+)*$'
    } if name == 'slug' else {}))) for name, field in BusinessData.model_fields.items()})


def write(table, data, record_id=None, **scope):
    try:
        query = supabase.table(table)
        if record_id:
            query = query.update(data).eq('id', str(record_id))
            for key, value in scope.items():
                query = query.eq(key, str(value))
        else:
            query = query.insert(data)
        result = query.execute().data
    except Exception as exc:
        if getattr(exc, 'code', '') == '23505':
            raise HTTPException(409, 'El slug o la asociación ya existe')
        raise HTTPException(500, 'No se pudo guardar el recurso')
    finally:
        _invalidate_caches_for_write(table, record_id=record_id, scope=scope)
    if not result:
        raise HTTPException(404, 'Recurso no encontrado')
    return result[0]


def remove(table, record_id, **scope):
    query = supabase.table(table).delete().eq('id', str(record_id))
    for key, value in scope.items():
        query = query.eq(key, str(value))
    if not query.execute().data:
        _invalidate_caches_for_write(table, record_id=record_id, scope=scope)
        raise HTTPException(404, 'Recurso no encontrado')
    _invalidate_caches_for_write(table, record_id=record_id, scope=scope)
    return {'id': str(record_id)}


_TABLE_TO_MENU_TABLES = {
    'restaurants': ['restaurants'],
    'categories': ['categories'],
    'products': ['products', 'categories'],
    'modifier_groups': ['modifier_groups', 'products', 'categories'],
    'modifier_options': ['modifier_options', 'modifier_groups', 'products', 'categories'],
    'users': [],
    'user_businesses': [],
}


def _invalidate_caches_for_write(table, record_id=None, scope=None):
    invalidate_rows_cache(table, *(_TABLE_TO_MENU_TABLES.get(table) or []))
    clear_menu_cache()
    return None


@router.get('/admin/businesses')
def list_businesses(user=Depends(superadmin)):
    return rows('restaurants')


def owner_id(email):
    email = email.strip().lower()
    existing = rows('users', email=email)
    if existing:
        if not existing[0]['is_active']:
            raise HTTPException(409, 'El usuario está inactivo')
        return existing[0]['id']
    # No email is sent. The owner must complete the usual password recovery flow.
    try:
        created = supabase.auth.admin.create_user({'email': email, 'password': token_urlsafe(48),
                                                   'email_confirm': False})
    except Exception:
        raise HTTPException(409, 'No se pudo crear el usuario; comprueba su perfil existente')
    return str(created.user.id)


@router.post('/admin/businesses', status_code=201)
def create_business(payload: BusinessCreate, user=Depends(superadmin)):
    if rows('restaurants', slug=payload.slug):
        raise HTTPException(409, 'El slug ya existe')
    owner = owner_id(payload.owner_email)
    try:
        return supabase.rpc('create_business_with_owner', {
            'business_data': payload.model_dump(exclude={'owner_email'}), 'owner_id': owner
        }).execute().data
    except Exception as exc:
        if getattr(exc, 'code', '') == '23505':
            raise HTTPException(409, 'El slug ya existe')
        raise HTTPException(500, 'No se pudo crear el negocio')


@router.get('/admin/businesses/{business_id}')
def get_business(business_id: UUID, user=Depends(superadmin)):
    return one('restaurants', id=business_id)


def validated_business_update(payload):
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(400, 'No se enviaron cambios')
    # Validate the complete merged model at the caller, including nulls and prices.
    return data


@router.put('/admin/businesses/{business_id}')
def update_business(business_id: UUID, payload: BusinessUpdate, user=Depends(superadmin)):
    return update_settings_record(business_id, payload)


@router.delete('/admin/businesses/{business_id}')
def delete_business(business_id: UUID, user=Depends(superadmin)):
    return remove('restaurants', business_id)


class Assignment(BaseModel):
    model_config = ConfigDict(extra='forbid')
    email: str = Field(pattern=r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
    role: BusinessRole


@router.get('/admin/businesses/{business_id}/users')
def list_users(business_id: UUID, user=Depends(current_user)):
    permit(user, business_id, 'users')
    one('restaurants', id=business_id)
    return rows('user_businesses', business_id=business_id)


@router.post('/admin/businesses/{business_id}/users', status_code=201)
def assign_user(business_id: UUID, payload: Assignment, user=Depends(current_user)):
    permit(user, business_id, 'users')
    one('restaurants', id=business_id)
    return write('user_businesses', {'business_id': str(business_id),
                 'user_id': owner_id(payload.email), 'role': payload.role})


@router.delete('/admin/businesses/{business_id}/users/{user_id}')
def unassign_user(business_id: UUID, user_id: UUID, user=Depends(current_user)):
    permit(user, business_id, 'users')
    link = one('user_businesses', business_id=business_id, user_id=user_id)
    return remove('user_businesses', link['id'], business_id=business_id)


def menu(business_id, include_all):
    cache_key = (str(business_id), bool(include_all))
    cached = _menu_cache.get(cache_key)
    if cached:
        return cached
    result = _build_menu(business_id, include_all)
    _menu_cache[cache_key] = result
    if len(_menu_cache) > 64:
        try:
            _menu_cache.pop(next(iter(_menu_cache)))
        except StopIteration:
            pass
    return result


_menu_cache = {}


def clear_menu_cache(business_id=None):
    if business_id is None:
        _menu_cache.clear()
        return
    remove_keys = [k for k in _menu_cache if str(k[0]) == str(business_id)]
    for k in remove_keys:
        _menu_cache.pop(k, None)


def _build_menu(business_id, include_all):
    restaurant = one('restaurants', id=business_id)
    if not include_all and not restaurant['is_active']:
        raise HTTPException(404, 'Negocio no encontrado o inactivo')
    categories = rows('categories', restaurant_id=business_id)
    if not include_all:
        categories = [c for c in categories if c.get('is_active', True)]
    categories.sort(key=lambda c: c['sort_order'])
    for category in categories:
        products = rows('products', category_id=category['id'])
        if not include_all:
            products = [p for p in products if p['is_available']]
        products.sort(key=lambda p: p.get('sort_order', 0))
        for product in products:
            groups = rows('modifier_groups', product_id=product['id'])
            groups.sort(key=lambda g: g['sort_order'])
            for group in groups:
                options = rows('modifier_options', modifier_group_id=group['id'])
                group['options'] = sorted([o for o in options if include_all or o['is_available']], key=lambda o: o['sort_order'])
            product['modifier_groups'] = groups
        category['products'] = products
    return {'restaurant': restaurant, 'categories': categories}


@router.get('/restaurants/by-slug/{slug}')
def public_menu(slug: str, include_all: bool = Query(False), credentials=Depends(bearer)):
    restaurant = one('restaurants', slug=slug)
    if include_all:
        permit(current_user(credentials), restaurant['id'], 'menu')
    return menu(restaurant['id'], include_all)


@router.get('/businesses/{business_id}/menu')
def business_menu(business_id: UUID, include_all: bool = Query(True), user=Depends(current_user)):
    permit(user, business_id, 'menu')
    return menu(business_id, include_all)


def update_settings_record(business_id, payload):
    from pydantic import ValidationError
    existing = one('restaurants', id=business_id)
    updates = validated_business_update(payload)
    try:
        merged = BusinessData.model_validate({k: v for k, v in {**existing, **updates}.items()
                                              if k in BusinessData.model_fields})
    except ValidationError:
        raise HTTPException(422, 'Configuración inválida')
    return write('restaurants', {k: merged.model_dump()[k] for k in updates}, business_id)


@router.put('/businesses/{business_id}/settings')
def settings_update(business_id: UUID, payload: BusinessUpdate, user=Depends(current_user)):
    permit(user, business_id, 'settings')
    return update_settings_record(business_id, payload)


class CategoryData(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=50)
    sort_order: int = Field(default=0, ge=0)
    is_active: bool = True


class ProductData(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    category_id: UUID
    name: str = Field(min_length=1, max_length=100)
    description: Optional[str] = None
    price: float = Field(gt=0, allow_inf_nan=False)
    image_url: Optional[str] = None
    is_available: bool = True
    sort_order: int = Field(default=0, ge=0)


def scoped_record(table, resource_id, business_id):
    if table == 'categories' or table == 'products':
        return one(table, id=resource_id, restaurant_id=business_id)
    record = one(table, id=resource_id)
    if table == 'modifier_groups':
        scoped_record('products', record['product_id'], business_id)
    else:
        scoped_record('modifier_groups', record['modifier_group_id'], business_id)
    return record


def register_resource(path, table, create_schema, update_schema, parent=None):
    partial_schema = create_model('Update_' + table, __config__=ConfigDict(extra='forbid'),
        **{name: (Optional[field.annotation], None) for name, field in update_schema.model_fields.items()})
    # Typed body signatures give FastAPI validation and OpenAPI for each resource.
    def create(business_id: UUID, payload: create_schema, user=Depends(current_user)):
        permit(user, business_id)
        one('restaurants', id=business_id)
        data = payload.model_dump(mode='json')
        if parent:
            field, parent_table = parent
            scoped_record(parent_table, data[field], business_id)
        if table in ('categories', 'products'):
            data['restaurant_id'] = str(business_id)
        return write(table, data)

    def update(business_id: UUID, resource_id: UUID, payload: partial_schema, user=Depends(current_user)):
        permit(user, business_id)
        existing = scoped_record(table, resource_id, business_id)
        data = payload.model_dump(mode='json', exclude_unset=True)
        if not data:
            raise HTTPException(400, 'No se enviaron cambios')
        from pydantic import ValidationError
        try:
            validated = update_schema.model_validate({k: v for k, v in {**existing, **data}.items()
                                                     if k in update_schema.model_fields})
        except ValidationError:
            raise HTTPException(422, 'Datos inválidos')
        data = {k: validated.model_dump(mode='json')[k] for k in data}
        if parent and parent[0] in data:
            scoped_record(parent[1], data[parent[0]], business_id)
        scope = {'restaurant_id': business_id} if table in ('categories', 'products') else {}
        return write(table, data, resource_id, **scope)

    def delete(business_id: UUID, resource_id: UUID, user=Depends(current_user)):
        permit(user, business_id)
        scoped_record(table, resource_id, business_id)
        scope = {'restaurant_id': business_id} if table in ('categories', 'products') else {}
        return remove(table, resource_id, **scope)

    base = '/businesses/{business_id}/' + path
    router.add_api_route(base, create, methods=['POST'], status_code=201, name='create_' + table)
    router.add_api_route(base + '/{resource_id}', update, methods=['PUT'], name='update_' + table)
    router.add_api_route(base + '/{resource_id}', delete, methods=['DELETE'], name='delete_' + table)


register_resource('categories', 'categories', CategoryData, CategoryData)
register_resource('products', 'products', ProductData, ProductData, ('category_id', 'categories'))
register_resource('modifier-groups', 'modifier_groups', StrictGroupCreate, GroupData, ('product_id', 'products'))
register_resource('modifier-options', 'modifier_options', StrictOptionCreate, OptionData, ('modifier_group_id', 'modifier_groups'))
