"""Offline API contract and tenant isolation tests; no real Supabase access."""
import sys
import unittest
from pathlib import Path
from types import ModuleType, SimpleNamespace
from copy import deepcopy
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

class Query:
    def __init__(self, db, table):
        self.db, self.table, self.filters = db, table, []
        self.action, self.payload = 'select', None
    def select(self, *args): return self
    def eq(self, key, value):
        self.filters.append(lambda r: str(r.get(key)) == str(value)); return self
    def in_(self, key, values):
        self.filters.append(lambda r: r[key] in values); return self
    def insert(self, data): self.action, self.payload = 'insert', data; return self
    def update(self, data): self.action, self.payload = 'update', data; return self
    def delete(self): self.action = 'delete'; return self
    def execute(self):
        data = self.db.data[self.table]
        found = [r for r in data if all(f(r) for f in self.filters)]
        if self.action == 'insert':
            record = {'id': str(uuid4()), **self.payload}; data.append(record); found = [record]
        elif self.action == 'update':
            for r in found: r.update(self.payload)
        elif self.action == 'delete':
            for r in found: data.remove(r)
        return SimpleNamespace(data=deepcopy(found))

class Database:
    def __init__(self): self.auth = SimpleNamespace(get_user=self.get_user)
    def table(self, table): return Query(self, table)
    def get_user(self, token):
        if token not in self.tokens: raise ValueError('invalid')
        return SimpleNamespace(user=SimpleNamespace(id=self.tokens[token]))

db = Database()
database = ModuleType('app.database'); database.supabase = db
config = ModuleType('app.config'); config.settings = SimpleNamespace(SUPABASE_URL='https://example.supabase.co', SUPABASE_KEY='unused', SUPABASE_SECRET_KEY='', SUPABASE_SERVICE_ROLE_KEY='test-only', CORS_ORIGINS=['http://localhost:4200'])
sys.modules['app.database'] = database
sys.modules['app.config'] = config
from fastapi.testclient import TestClient
from app.main import app
client = TestClient(app)

class TenantTests(unittest.TestCase):
    def setUp(self):
        self.a, self.b, self.u, self.v, self.s = [str(uuid4()) for _ in range(5)]
        self.ca, self.cb, self.pa, self.pb, self.gb, self.ob = [str(uuid4()) for _ in range(6)]
        db.tokens = {'owner': self.u, 'staff': self.v, 'super': self.s}
        db.data = {
            'users': [{'id': self.u, 'email': 'owner@test.mx', 'role': 'business_owner', 'is_active': True},
                      {'id': self.v, 'email': 'staff@test.mx', 'role': 'staff', 'is_active': True},
                      {'id': self.s, 'email': 'super@test.mx', 'role': 'superadmin', 'is_active': True}],
            'user_businesses': [{'id': str(uuid4()), 'user_id': self.u, 'business_id': self.a, 'role': 'business_owner'},
                                {'id': str(uuid4()), 'user_id': self.v, 'business_id': self.a, 'role': 'staff'}],
            'restaurants': [{'id': self.a, 'name': 'A', 'slug': 'a', 'is_active': True},
                            {'id': self.b, 'name': 'B', 'slug': 'b', 'is_active': True}],
            'categories': [{'id': self.ca, 'restaurant_id': self.a, 'name': 'A', 'is_active': True, 'sort_order': 0},
                           {'id': self.cb, 'restaurant_id': self.b, 'name': 'B', 'is_active': True, 'sort_order': 0}],
            'products': [{'id': self.pa, 'restaurant_id': self.a, 'category_id': self.ca, 'name': 'A', 'price': 10, 'is_available': False, 'sort_order': 0},
                         {'id': self.pb, 'restaurant_id': self.b, 'category_id': self.cb, 'name': 'B', 'price': 10, 'is_available': True, 'sort_order': 0}],
            'modifier_groups': [{'id': self.gb, 'product_id': self.pb, 'name': 'Extra', 'sort_order': 0}],
            'modifier_options': [{'id': self.ob, 'modifier_group_id': self.gb, 'name': 'Cheese', 'is_available': False, 'sort_order': 0}]
        }
    def headers(self, token='owner'): return {'Authorization': 'Bearer ' + token}
    def test_auth_me_and_business_visibility(self):
        r = client.get('/api/auth/me', headers=self.headers())
        self.assertEqual(r.status_code, 200)
        self.assertEqual([b['id'] for b in r.json()['businesses']], [self.a])
        self.assertEqual(len(client.get('/api/me/businesses', headers=self.headers('super')).json()), 2)
    def test_reject_missing_invalid_and_inactive_auth(self):
        for headers in ({}, self.headers('invalid')):
            self.assertEqual(client.get('/api/admin/businesses', headers=headers).status_code, 401)
        db.data['users'][0]['is_active'] = False
        self.assertEqual(client.get('/api/auth/me', headers=self.headers()).status_code, 403)
    def test_superadmin_only(self):
        self.assertEqual(client.get('/api/admin/businesses', headers=self.headers()).status_code, 403)
        self.assertEqual(client.get('/api/admin/businesses', headers=self.headers('super')).status_code, 200)
    def test_cross_business_resource_rejected(self):
        for path, resource in [('products', self.pb), ('categories', self.cb), ('modifier-groups', self.gb), ('modifier-options', self.ob)]:
            r = client.delete(f'/api/businesses/{self.a}/{path}/{resource}', headers=self.headers())
            self.assertEqual(r.status_code, 404)
            self.assertEqual(client.delete(f'/api/businesses/{self.b}/{path}/{resource}', headers=self.headers()).status_code, 403)
        self.assertEqual(len(db.data['products']), 2)
    def test_cross_business_parent_rejected(self):
        r = client.post(f'/api/businesses/{self.a}/products', headers=self.headers(),
                        json={'name': 'X', 'price': 10, 'category_id': self.cb})
        self.assertEqual(r.status_code, 404)
        r = client.put(f'/api/businesses/{self.a}/products/{self.pa}', headers=self.headers(), json={'category_id': self.cb})
        self.assertEqual(r.status_code, 404)
    def test_staff_cannot_write(self):
        self.assertEqual(client.delete(f'/api/businesses/{self.a}/products/{self.pa}', headers=self.headers('staff')).status_code, 403)
    def test_public_filters_and_private_include_all(self):
        self.assertEqual(client.get('/api/restaurants/by-slug/a').json()['categories'][0]['products'], [])
        self.assertEqual(client.get('/api/restaurants/by-slug/a?include_all=true').status_code, 401)
        self.assertEqual(client.get('/api/restaurants/by-slug/b?include_all=true', headers=self.headers()).status_code, 403)
        self.assertEqual(len(client.get('/api/restaurants/by-slug/a?include_all=true', headers=self.headers()).json()['categories'][0]['products']), 1)
        options = client.get('/api/restaurants/by-slug/b').json()['categories'][0]['products'][0]['modifier_groups'][0]['options']
        self.assertEqual(options, [])
        db.data['restaurants'][0]['is_active'] = False
        self.assertEqual(client.get('/api/restaurants/by-slug/a').status_code, 404)
        self.assertEqual(client.get('/api/restaurants/by-slug/unknown').status_code, 404)
    def test_partial_updates_and_validation(self):
        url = f'/api/businesses/{self.a}/products/{self.pa}'
        self.assertEqual(client.put(url, headers=self.headers(), json={'is_available': True}).status_code, 200)
        self.assertEqual(client.put(url, headers=self.headers(), json={'price': -1}).status_code, 422)
        self.assertEqual(client.put(url, headers=self.headers(), json={'restaurant_id': self.b}).status_code, 422)
    def test_legacy_write_routes_removed(self):
        for path in ['/api/products', '/api/categories', '/api/modifier-groups', '/api/modifier-options']:
            self.assertEqual(client.post(path, json={}).status_code, 404)
    def test_create_and_delete_scoped_category(self):
        url = f'/api/businesses/{self.a}/categories'
        r = client.post(url, headers=self.headers(), json={'name': 'New'})
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()['restaurant_id'], self.a)
        self.assertEqual(client.delete(url + '/' + r.json()['id'], headers=self.headers()).status_code, 200)
    def test_login_no_demo_fallback(self):
        from unittest.mock import patch
        with patch('app.tenant_routes.create_client') as factory:
            factory.return_value.auth.sign_in_with_password.side_effect = ValueError('offline')
            r = client.post('/api/auth/login', json={'email': 'admin@gastrolink.mx', 'password': 'admin123'})
            self.assertEqual(r.status_code, 401)

    def test_login_returns_user_and_assigned_businesses(self):
        from unittest.mock import patch
        with patch('app.tenant_routes.create_client') as factory:
            factory.return_value.auth.sign_in_with_password.return_value = SimpleNamespace(session=SimpleNamespace(access_token='owner'))
            r = client.post('/api/auth/login', json={'email': 'owner@test.mx', 'password': 'valid'})
            self.assertEqual(r.status_code, 200)
            self.assertEqual(r.json()['user']['id'], self.u)
            self.assertEqual([b['id'] for b in r.json()['businesses']], [self.a])

    def test_business_creation_passes_owner_to_transaction(self):
        from unittest.mock import patch
        payload = {'name': 'New', 'slug': 'new', 'whatsapp_number': '525512345678', 'owner_email': 'owner@test.mx'}
        with patch.object(db, 'rpc', create=True) as rpc:
            rpc.return_value.execute.return_value = SimpleNamespace(data={'id': 'created', 'slug': 'new'})
            r = client.post('/api/admin/businesses', headers=self.headers('super'), json=payload)
            self.assertEqual(r.status_code, 201)
            args = rpc.call_args.args
            self.assertEqual(args[0], 'create_business_with_owner')
            self.assertEqual(args[1]['owner_id'], self.u)
            self.assertNotIn('owner_email', args[1]['business_data'])
        payload['slug'] = 'a'
        self.assertEqual(client.post('/api/admin/businesses', headers=self.headers('super'), json=payload).status_code, 409)
        payload['slug'] = 'Bad Slug'
        self.assertEqual(client.post('/api/admin/businesses', headers=self.headers('super'), json=payload).status_code, 422)

    def test_user_assignment_permissions_and_scope(self):
        url = f'/api/admin/businesses/{self.a}/users'
        payload = {'email': 'staff@test.mx', 'role': 'business_admin'}
        self.assertEqual(client.post(url, headers=self.headers('staff'), json=payload).status_code, 403)
        r = client.post(url, headers=self.headers(), json={'email': 'super@test.mx', 'role': 'business_admin'})
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()['business_id'], self.a)
        self.assertEqual(client.delete(url + '/' + self.s, headers=self.headers()).status_code, 200)
        self.assertEqual(client.post(url, headers=self.headers(), json={**payload, 'role': 'superadmin'}).status_code, 422)

    def test_groups_and_options_preserve_business_parent(self):
        url = f'/api/businesses/{self.a}/modifier-groups'
        r = client.post(url, headers=self.headers(), json={'product_id': self.pa, 'name': 'Extras'})
        self.assertEqual(r.status_code, 201)
        group = r.json()['id']
        self.assertEqual(client.put(url + '/' + group, headers=self.headers(), json={'min_selection': 2, 'max_selection': 1}).status_code, 422)
        self.assertEqual(client.put(url + '/' + group, headers=self.headers(), json={'product_id': self.pb}).status_code, 422)
        r = client.post(f'/api/businesses/{self.a}/modifier-options', headers=self.headers(), json={'modifier_group_id': group, 'name': 'Cheese'})
        self.assertEqual(r.status_code, 201)
        self.assertEqual(client.post(f'/api/businesses/{self.a}/modifier-options', headers=self.headers(), json={'modifier_group_id': self.gb, 'name': 'Cheese'}).status_code, 404)

    def test_business_settings_validation(self):
        db.data['restaurants'][0].update({'whatsapp_number': '123'})
        url = f'/api/businesses/{self.a}/settings'
        self.assertEqual(client.put(url, headers=self.headers(), json={'minimum_order': 100, 'is_active': False}).status_code, 200)
        self.assertEqual(client.put(url, headers=self.headers(), json={'slug': 'Invalid'}).status_code, 422)
        self.assertEqual(client.put(url, headers=self.headers(), json={'delivery_fee': -1}).status_code, 422)
        self.assertEqual(client.put(url, headers=self.headers(), json={'name': None}).status_code, 422)

    def test_public_menu_supports_pre_migration_schema(self):
        for category in db.data['categories']:
            category.pop('is_active')
        for product in db.data['products']:
            product.pop('restaurant_id')
            product.pop('sort_order')
        self.assertEqual(client.get('/api/restaurants/by-slug/b').status_code, 200)

    def test_administration_requires_service_key(self):
        from unittest.mock import patch
        with patch.object(config.settings, 'SUPABASE_SERVICE_ROLE_KEY', ''):
            self.assertEqual(client.get('/api/auth/me', headers=self.headers()).status_code, 503)
            self.assertEqual(client.get('/api/restaurants/by-slug/b').status_code, 200)

    def test_secret_key_enables_administration_without_legacy_key(self):
        from unittest.mock import patch
        with patch.object(config.settings, 'SUPABASE_SERVICE_ROLE_KEY', ''), patch.object(config.settings, 'SUPABASE_SECRET_KEY', 'sb_secret_test'):
            self.assertEqual(client.get('/api/auth/me', headers=self.headers()).status_code, 200)

    def test_database_key_precedence(self):
        import runpy
        from unittest.mock import patch
        path = Path(__file__).resolve().parents[1] / 'app' / 'database.py'
        for secret, legacy, expected in [('sb_secret_test', 'legacy', 'sb_secret_test'), ('', 'legacy', 'legacy'), ('', '', 'unused')]:
            with patch.object(config.settings, 'SUPABASE_SECRET_KEY', secret), patch.object(config.settings, 'SUPABASE_SERVICE_ROLE_KEY', legacy), patch('supabase.create_client', return_value=db) as factory:
                runpy.run_path(str(path))
                factory.assert_called_once_with(config.settings.SUPABASE_URL, expected)

if __name__ == '__main__': unittest.main()

