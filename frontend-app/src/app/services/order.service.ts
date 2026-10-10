import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";
import { API_URL } from "./api.config";
import { BusinessOrder, CreateOrderPayload, OrderStatus } from "../models/order.model";

@Injectable({ providedIn: "root" })
export class OrderService {
  private http = inject(HttpClient);

  create(payload: CreateOrderPayload): Observable<BusinessOrder> {
    return this.http.post<BusinessOrder>(`${API_URL}/orders`, payload);
  }

  list(businessId: string): Observable<BusinessOrder[]> {
    return this.http.get<BusinessOrder[]>(
      `${API_URL}/businesses/${encodeURIComponent(businessId)}/orders`,
    );
  }

  updateStatus(
    businessId: string,
    orderId: string,
    status: OrderStatus,
  ): Observable<BusinessOrder> {
    return this.http.patch<BusinessOrder>(
      `${API_URL}/businesses/${encodeURIComponent(businessId)}/orders/${encodeURIComponent(orderId)}`,
      { status },
    );
  }
}
