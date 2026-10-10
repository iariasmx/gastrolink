from decimal import Decimal, ROUND_HALF_UP
import logging
from typing import Literal, Optional
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from app.database import supabase
from app.tenant_routes import current_user, permit

router = APIRouter(prefix='/api')
logger = logging.getLogger(__name__)
OrderStatus = Literal['new', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled']
ServiceType = Literal['table', 'takeaway', 'delivery']
PaymentMethod = Literal['Efectivo', 'Transferencia']


class ModifierChoice(BaseModel):
    model_config = ConfigDict(extra='ignore')
    modifier_option_id: UUID


class OrderItemInput(BaseModel):
    model_config = ConfigDict(extra='ignore')
    product_id: UUID
    quantity: int = Field(ge=1, le=50)
    notes: Optional[str] = Field(default=None, max_length=500)
    selected_modifiers: list[ModifierChoice] = Field(default_factory=list, max_length=20)


class OrderCreate(BaseModel):
    model_config = ConfigDict(extra='ignore', str_strip_whitespace=True)
    restaurant_slug: str = Field(min_length=1, max_length=100)
    idempotency_key: UUID
    service_type: ServiceType
    table_number: Optional[str] = Field(default=None, max_length=50)
    customer_name: str = Field(min_length=1, max_length=100)
    customer_phone: str = Field(min_length=7, max_length=20)
    delivery_address: Optional[str] = Field(default=None, max_length=250)
    address_references: Optional[str] = Field(default=None, max_length=250)
    payment_method: PaymentMethod
    items: list[OrderItemInput] = Field(min_length=1, max_length=50)


class OrderStatusUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    status: OrderStatus


def _one(table, **filters):
    query = supabase.table(table).select('*')
    for key, value in filters.items():
        query = query.eq(key, str(value))
    result = query.execute().data or []
    return result[0] if result else None


def _money(value):
    return Decimal(str(value)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def create_order_record(payload):
    order = payload if isinstance(payload, OrderCreate) else OrderCreate.model_validate(payload)
    restaurant = _one('restaurants', slug=order.restaurant_slug)
    if not restaurant or not restaurant.get('is_active', True):
        raise HTTPException(404, 'Restaurante no encontrado')
    allowed = {
        'table': restaurant.get('allows_table_order', True),
        'takeaway': restaurant.get('allows_takeaway', True),
        'delivery': restaurant.get('allows_delivery', False),
    }
    if not allowed[order.service_type]:
        raise HTTPException(422, 'Esta modalidad de pedido no está disponible')
    if order.service_type == 'table' and not order.table_number:
        raise HTTPException(422, 'Indica el número o nombre de mesa')
    if order.service_type == 'delivery' and not order.delivery_address:
        raise HTTPException(422, 'Indica la dirección de entrega')

    item_snapshots = []
    subtotal = Decimal('0.00')
    for item in order.items:
        product = _one('products', id=item.product_id)
        if not product or str(product.get('restaurant_id')) != str(restaurant['id']) or not product.get('is_available', True):
            raise HTTPException(422, 'Uno de los productos ya no está disponible')

        groups = supabase.table('modifier_groups').select('*').eq('product_id', str(product['id'])).execute().data or []
        choices_by_group = {}
        chosen_snapshots = []
        extra_total = Decimal('0.00')
        for choice in item.selected_modifiers:
            option = _one('modifier_options', id=choice.modifier_option_id)
            group = next((g for g in groups if option and str(g['id']) == str(option.get('modifier_group_id'))), None)
            if not option or not group or not option.get('is_available', True):
                raise HTTPException(422, 'Una opción seleccionada ya no está disponible')
            options = choices_by_group.setdefault(str(group['id']), set())
            if str(option['id']) in options:
                raise HTTPException(422, 'No repitas una opción del producto')
            options.add(str(option['id']))
            price_extra = _money(option.get('price_extra', 0))
            extra_total += price_extra
            chosen_snapshots.append({
                'modifier_option_id': str(option['id']),
                'name': option['name'],
                'price_extra': float(price_extra),
            })

        for group in groups:
            selected_count = len(choices_by_group.get(str(group['id']), set()))
            minimum = int(group.get('min_selection') or 0)
            maximum = int(group.get('max_selection') or 1)
            if selected_count < minimum or selected_count > maximum:
                raise HTTPException(422, f"Selecciona entre {minimum} y {maximum} opciones de {group['name']}")

        unit_price = _money(product['price']) + extra_total
        line_total = unit_price * item.quantity
        subtotal += line_total
        item_snapshots.append({
            'product_id': str(product['id']),
            'product_name': product['name'],
            'unit_price': float(unit_price),
            'quantity': item.quantity,
            'line_total': float(line_total),
            'notes': item.notes,
            'selected_modifiers': chosen_snapshots,
        })

    subtotal = _money(subtotal)
    delivery_fee = _money(restaurant.get('delivery_fee', 0)) if order.service_type == 'delivery' else Decimal('0.00')
    total = subtotal + delivery_fee
    if subtotal < _money(restaurant.get('minimum_order', 0)):
        raise HTTPException(422, 'El pedido no alcanza el mínimo de compra')

    row = {
        'idempotency_key': str(order.idempotency_key),
        'restaurant_id': str(restaurant['id']),
        'customer_name': order.customer_name,
        'customer_phone': order.customer_phone,
        'service_type': order.service_type,
        # Backward compatibility with older Supabase orders tables where this
        # legacy NOT NULL column remains present alongside service_type.
        'delivery_method': order.service_type,
        'table_number': order.table_number,
        'delivery_address': order.delivery_address,
        'address_references': order.address_references,
        'payment_method': order.payment_method,
        'items': item_snapshots,
        'subtotal': float(subtotal),
        'delivery_fee': float(delivery_fee),
        'total': float(total),
        'status': 'new',
    }
    try:
        inserted = supabase.table('orders').insert(row).execute().data or []
        saved = inserted[0] if inserted else None
    except Exception as exc:
        logger.exception("Failed to persist order record")
        if getattr(exc, 'code', None) == '23505':
            saved = _one('orders', idempotency_key=order.idempotency_key)
            if saved and str(saved.get('restaurant_id')) != str(restaurant['id']):
                raise HTTPException(409, 'La clave de pedido ya fue utilizada')
        else:
            error_code = str(getattr(exc, 'code', '') or '')
            error_text = str(exc).lower()
            if error_code in {'42P01', 'PGRST204', 'PGRST205'} or (
                'orders' in error_text and ('not found' in error_text or 'does not exist' in error_text)
            ):
                raise HTTPException(
                    503,
                    'El esquema de pedidos en Supabase está incompleto o desactualizado. Aplica las migraciones pendientes de backend-api/migrations/.',
                )
            saved = None
    if not saved:
        raise HTTPException(503, 'No se pudo registrar el pedido. Intenta de nuevo.')
    item_snapshots = saved['items']
    subtotal = _money(saved['subtotal'])
    delivery_fee = _money(saved['delivery_fee'])
    total = _money(saved['total'])
    reference = str(saved['id']).split('-')[0].upper()
    phone = ''.join(c for c in str(restaurant.get('whatsapp_number', '')) if c.isdigit())
    message = [
        f"*PEDIDO #{reference} - {restaurant['name']}*",
        f"*Cliente:* {saved['customer_name']}", f"*Teléfono:* {saved['customer_phone']}",
        f"*Modalidad:* {saved['service_type'].upper()}",
    ]
    if saved.get('table_number'):
        message.append(f"*Mesa:* {saved['table_number']}")
    if saved.get('delivery_address'):
        message.append(f"*Dirección:* {saved['delivery_address']}")
    if saved.get('address_references'):
        message.append(f"*Referencias:* {saved['address_references']}")
    message.append(f"*Pago:* {saved['payment_method']}")
    message.append('*Detalle:*')
    for index, snapshot in enumerate(item_snapshots, start=1):
        message.append(f"{index}. {snapshot['quantity']}x {snapshot['product_name']} - ${snapshot['line_total']:.2f}")
        for modifier in snapshot['selected_modifiers']:
            extra = f" (+${modifier['price_extra']:.2f})" if modifier['price_extra'] else ''
            message.append(f"  - {modifier['name']}{extra}")
        if snapshot['notes']:
            message.append(f"  Nota: {snapshot['notes']}")
    message += [f"*Subtotal:* ${float(subtotal):.2f}"]
    if delivery_fee:
        message.append(f"*Envío:* ${float(delivery_fee):.2f}")
    message.append(f"*Total:* ${float(total):.2f} MXN")
    saved['order_reference'] = reference
    saved['whatsapp_number'] = phone
    saved['message_text'] = '\n'.join(message)
    saved['whatsapp_url'] = f"https://wa.me/{phone}?text={quote(saved['message_text'])}"
    return saved


@router.post('/orders', status_code=201, tags=['Pedidos'], summary='Registrar pedido y generar enlace de WhatsApp')
def create_order(payload: OrderCreate):
    return create_order_record(payload)


@router.get('/businesses/{business_id}/orders', tags=['Pedidos'], summary='Listar pedidos recientes del negocio')
def list_orders(business_id: UUID, status: Optional[OrderStatus] = Query(None), user=Depends(current_user)):
    permit(user, business_id, 'orders')
    query = supabase.table('orders').select('*').eq('restaurant_id', str(business_id)).order('created_at', desc=True).limit(100)
    if status:
        query = query.eq('status', status)
    return query.execute().data or []


@router.patch('/businesses/{business_id}/orders/{order_id}', tags=['Pedidos'], summary='Actualizar estado de un pedido')
def update_order_status(business_id: UUID, order_id: UUID, payload: OrderStatusUpdate, user=Depends(current_user)):
    permit(user, business_id, 'orders')
    result = (supabase.table('orders').update({'status': payload.status})
              .eq('id', str(order_id)).eq('restaurant_id', str(business_id)).execute().data or [])
    if not result:
        raise HTTPException(404, 'Pedido no encontrado')
    return result[0]
