import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Product, Restaurant, Category, ModifierGroup, ModifierOption, FullMenuResponse } from '../models/restaurant.model';
import { API_URL } from './api.config';

export type BusinessPayload = Omit<Restaurant, 'id' | 'created_at' | 'updated_at'>;
export type CreateBusinessPayload = BusinessPayload & { owner_email: string };

@Injectable({ providedIn: 'root' })
export class AdminService {
  private http = inject(HttpClient);
  private businessUrl(id: string): string { return `${API_URL}/businesses/${encodeURIComponent(id)}`; }
  getBusinesses(): Observable<Restaurant[]> { return this.http.get<Restaurant[]>(`${API_URL}/admin/businesses`); }
  getBusinessById(id: string): Observable<Restaurant> { return this.http.get<Restaurant>(`${API_URL}/admin/businesses/${encodeURIComponent(id)}`); }
  createBusiness(payload: CreateBusinessPayload): Observable<Restaurant> { return this.http.post<Restaurant>(`${API_URL}/admin/businesses`, payload); }
  updateBusiness(id: string, payload: Partial<BusinessPayload>): Observable<Restaurant> { return this.http.put<Restaurant>(`${API_URL}/admin/businesses/${encodeURIComponent(id)}`, payload); }
  getBusinessMenu(id: string): Observable<FullMenuResponse> { return this.http.get<FullMenuResponse>(`${this.businessUrl(id)}/menu?include_all=true`); }
  updateBusinessSettings(id: string, payload: Partial<BusinessPayload>): Observable<Restaurant> { return this.http.put<Restaurant>(`${this.businessUrl(id)}/settings`, payload); }
  createProduct(businessId: string, payload: Partial<Product>): Observable<Product> { return this.http.post<Product>(`${this.businessUrl(businessId)}/products`, payload); }
  updateProduct(businessId: string, id: string, payload: Partial<Product>): Observable<Product> { return this.http.put<Product>(`${this.businessUrl(businessId)}/products/${encodeURIComponent(id)}`, payload); }
  deleteProduct(businessId: string, id: string): Observable<unknown> { return this.http.delete(`${this.businessUrl(businessId)}/products/${encodeURIComponent(id)}`); }
  createCategory(businessId: string, payload: Pick<Category, 'name' | 'sort_order'>): Observable<Category> { return this.http.post<Category>(`${this.businessUrl(businessId)}/categories`, payload); }
  saveModifierGroup(businessId: string, productId: string, group: ModifierGroup): Observable<ModifierGroup> {
    const data = { name: group.name, is_required: group.is_required, min_selection: group.min_selection, max_selection: group.max_selection, sort_order: group.sort_order };
    return group.id
      ? this.http.put<ModifierGroup>(`${this.businessUrl(businessId)}/modifier-groups/${encodeURIComponent(group.id)}`, data)
      : this.http.post<ModifierGroup>(`${this.businessUrl(businessId)}/modifier-groups`, { ...data, product_id: productId });
  }
  deleteModifierGroup(businessId: string, id: string): Observable<unknown> { return this.http.delete(`${this.businessUrl(businessId)}/modifier-groups/${encodeURIComponent(id)}`); }
  saveModifierOption(businessId: string, groupId: string, option: ModifierOption): Observable<ModifierOption> {
    const data = { name: option.name, price_extra: option.price_extra, is_available: option.is_available, sort_order: option.sort_order };
    return option.id
      ? this.http.put<ModifierOption>(`${this.businessUrl(businessId)}/modifier-options/${encodeURIComponent(option.id)}`, data)
      : this.http.post<ModifierOption>(`${this.businessUrl(businessId)}/modifier-options`, { ...data, modifier_group_id: groupId });
  }
  deleteModifierOption(businessId: string, id: string): Observable<unknown> { return this.http.delete(`${this.businessUrl(businessId)}/modifier-options/${encodeURIComponent(id)}`); }
}
