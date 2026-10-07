import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Product, Restaurant, Category } from '../models/restaurant.model';

@Injectable({
  providedIn: 'root'
})
export class AdminService {
  private readonly apiUrl = 'http://localhost:8000/api';
  private http = inject(HttpClient);

  // Products CRUD
  createProduct(product: Partial<Product>): Observable<Product> {
    return this.http.post<Product>(`${this.apiUrl}/products`, product);
  }

  updateProduct(productId: string, updates: Partial<Product>): Observable<Product> {
    return this.http.put<Product>(`${this.apiUrl}/products/${productId}`, updates);
  }

  deleteProduct(productId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/products/${productId}`);
  }

  // Categories CRUD
  createCategory(category: Partial<Category>): Observable<Category> {
    return this.http.post<Category>(`${this.apiUrl}/categories`, category);
  }

  // Restaurant Settings CRUD
  updateRestaurant(restaurantId: string, updates: Partial<Restaurant>): Observable<Restaurant> {
    return this.http.put<Restaurant>(`${this.apiUrl}/restaurants/${restaurantId}`, updates);
  }
}
