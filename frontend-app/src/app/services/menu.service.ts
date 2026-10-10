import { Injectable, signal, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { FullMenuResponse } from "../models/restaurant.model";
import { API_URL } from "./api.config";

@Injectable({ providedIn: "root" })
export class MenuService {
  private http = inject(HttpClient);
  private activeRequest = 0;

  readonly menuData = signal<FullMenuResponse | null>(null);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  loadMenuBySlug(slug: string, includeAll = false): void {
    const requestId = ++this.activeRequest;
    this.menuData.set(null);
    this.loading.set(true);
    this.error.set(null);

    this.http
      .get<FullMenuResponse>(
        `${API_URL}/restaurants/by-slug/${encodeURIComponent(slug)}?include_all=${includeAll}`,
      )
      .subscribe({
        next: (data) => {
          if (requestId !== this.activeRequest) return;
          this.menuData.set(data);
          this.loading.set(false);
        },
        error: (error) => {
          if (requestId !== this.activeRequest) return;
          this.menuData.set(null);
          this.error.set(
            error.status === 404
              ? "No encontramos un menú activo con esa dirección."
              : "No se pudo cargar el menú. Revisa tu conexión e intenta de nuevo.",
          );
          this.loading.set(false);
        },
      });
  }
}
