import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FullMenuResponse } from '../models/restaurant.model';
import { catchError, of } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class MenuService {
  private readonly apiUrl = 'http://localhost:8000/api';

  readonly menuData = signal<FullMenuResponse | null>(null);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  constructor(private http: HttpClient) {}

  loadMenuBySlug(slug: string): void {
    this.loading.set(true);
    this.error.set(null);

    this.http.get<FullMenuResponse>(`${this.apiUrl}/restaurants/by-slug/${slug}`)
      .pipe(
        catchError(err => {
          console.warn('Backend API not reachable or slug not found, loading demo menu data.', err);
          return of(this.getDemoMenuData(slug));
        })
      )
      .subscribe({
        next: (data) => {
          this.menuData.set(data);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set('No se pudo cargar el menú del restaurante.');
          this.loading.set(false);
        }
      });
  }

  private getDemoMenuData(slug: string): FullMenuResponse {
    const isTacos = slug.includes('tacos') || slug === 'tacos-el-pastor';
    
    return {
      restaurant: {
        id: '11111111-1111-1111-1111-111111111111',
        name: isTacos ? 'Tacos El Pastor Mexa' : 'GastroLink Gourmet',
        slug: slug,
        whatsapp_number: '525512345678',
        logo_url: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=300&q=80',
        allows_table_order: true,
        allows_takeaway: true,
        allows_delivery: true,
        delivery_fee: 35.00,
        minimum_order: 100.00,
        is_active: true
      },
      categories: [
        {
          id: '22222222-1111-1111-1111-111111111111',
          restaurant_id: '11111111-1111-1111-1111-111111111111',
          name: '🌮 Tacos Especiales',
          sort_order: 1,
          products: [
            {
              id: '33333333-1111-1111-1111-111111111111',
              category_id: '22222222-1111-1111-1111-111111111111',
              name: 'Taco al Pastor Tradicional',
              description: 'Carne de cerdo adobada al pastor en tortilla de maíz nixtamalizado, piña asada, cilantro y cebolla.',
              price: 26.00,
              image_url: 'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?auto=format&fit=crop&w=400&q=80',
              is_available: true
            },
            {
              id: '33333333-1111-1111-1111-222222222222',
              category_id: '22222222-1111-1111-1111-111111111111',
              name: 'Gringa de Suadero',
              description: 'Doble tortilla de harina con abundante queso oaxaca fundido y suave carne de suadero marinada.',
              price: 65.00,
              image_url: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=400&q=80',
              is_available: true
            },
            {
              id: '33333333-1111-1111-1111-333333333333',
              category_id: '22222222-1111-1111-1111-111111111111',
              name: 'Volcán de Arrachera',
              description: 'Tortilla tostada al carbón con cama de queso manchego fundido y jugosa arrachera corte prime.',
              price: 78.00,
              image_url: 'https://images.unsplash.com/photo-1615870216519-2f9fa575fa5c?auto=format&fit=crop&w=400&q=80',
              is_available: true
            }
          ]
        },
        {
          id: '22222222-2222-2222-2222-222222222222',
          restaurant_id: '11111111-1111-1111-1111-111111111111',
          name: '🥤 Bebidas & Aguas Frescas',
          sort_order: 2,
          products: [
            {
              id: '33333333-2222-2222-2222-111111111111',
              category_id: '22222222-2222-2222-2222-222222222222',
              name: 'Agua Fresca de Horchata 1L',
              description: 'Receta secreta de la casa con arroz artesanal, canela y toque de vainilla de papantla.',
              price: 45.00,
              image_url: 'https://images.unsplash.com/photo-1546171753-97d7676e4179?auto=format&fit=crop&w=400&q=80',
              is_available: true
            },
            {
              id: '33333333-2222-2222-2222-222222222222',
              category_id: '22222222-2222-2222-2222-222222222222',
              name: 'Refresco de Vidrio 355ml',
              description: 'Coca-Cola, Sidral Mundet o Boing de Mango bien helado.',
              price: 32.00,
              image_url: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=400&q=80',
              is_available: true
            }
          ]
        },
        {
          id: '22222222-3333-3333-3333-333333333333',
          restaurant_id: '11111111-1111-1111-1111-111111111111',
          name: '🍰 Postres Mexicanos',
          sort_order: 3,
          products: [
            {
              id: '33333333-3333-3333-3333-111111111111',
              category_id: '22222222-3333-3333-3333-333333333333',
              name: 'Churros con Cajeta de Celaya',
              description: '4 piezas de churros crujientes espolvoreados con azúcar y canela, acompañados de cajeta.',
              price: 55.00,
              image_url: 'https://images.unsplash.com/photo-1624300629298-e9de39c13be5?auto=format&fit=crop&w=400&q=80',
              is_available: true
            }
          ]
        }
      ]
    };
  }
}
