import { Injectable, signal, computed, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Router } from "@angular/router";
import {
  Observable,
  tap,
  map,
  catchError,
  of,
  finalize,
  shareReplay,
} from "rxjs";
import {
  CurrentUser,
  CurrentSession,
  UserBusiness,
  TokenResponse,
} from "../models/auth.model";
import { API_URL } from "./api.config";

@Injectable({ providedIn: "root" })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private sessionRequest?: Observable<boolean>;
  readonly token = signal<string | null>(
    localStorage.getItem("gastrolink_token"),
  );
  readonly currentUser = signal<CurrentUser | null>(null);
  readonly businesses = signal<UserBusiness[]>([]);
  readonly selectedBusinessId = signal<string | null>(
    localStorage.getItem("gastrolink_business_id"),
  );
  readonly currentUserEmail = computed(() => this.currentUser()?.email ?? null);
  readonly globalRole = computed(() => this.currentUser()?.role ?? null);
  readonly selectedBusiness = computed(
    () =>
      this.businesses().find((b) => b.id === this.selectedBusinessId()) ?? null,
  );
  readonly isAuthenticated = computed(
    () => !!this.token() && !!this.currentUser()?.is_active,
  );

  login(email: string, password: string): Observable<boolean> {
    return this.http
      .post<TokenResponse>(`${API_URL}/auth/login`, { email, password })
      .pipe(
        tap((response) => {
          if (
            !response.access_token ||
            !response.user?.is_active ||
            !Array.isArray(response.businesses)
          )
            throw new Error("Sesión inválida");
          localStorage.setItem("gastrolink_token", response.access_token);
          this.token.set(response.access_token);
          this.setCurrentSession(response);
        }),
        map(() => true),
        catchError(() => {
          this.clearSession();
          return of(false);
        }),
      );
  }

  loadCurrentUser(): Observable<boolean> {
    if (!this.token()) return of(false);
    if (this.sessionRequest) return this.sessionRequest;
    const requestedToken = this.token();
    this.sessionRequest = this.http
      .get<CurrentSession>(`${API_URL}/auth/me`)
      .pipe(
        map((response) => {
          if (this.token() !== requestedToken) return false;
          if (
            !response.user?.is_active ||
            !Array.isArray(response.businesses)
          ) {
            this.clearSession();
            return false;
          }
          this.setCurrentSession(response);
          return true;
        }),
        catchError((error) => {
          if (this.token() === requestedToken) {
            if (error.status === 401 || error.status === 403)
              this.clearSession();
            else {
              this.currentUser.set(null);
              this.businesses.set([]);
            }
          }
          return of(false);
        }),
        finalize(() => {
          this.sessionRequest = undefined;
        }),
        shareReplay({ bufferSize: 1, refCount: true }),
      );
    return this.sessionRequest;
  }

  getCurrentUser(): CurrentUser | null {
    return this.currentUser();
  }
  getUserBusinesses(): UserBusiness[] {
    return this.businesses();
  }
  getBusinessByIdOrSlug(reference: string): UserBusiness | null {
    return (
      this.businesses().find(
        (business) => business.id === reference || business.slug === reference,
      ) ?? null
    );
  }
  isSuperadmin(): boolean {
    return this.isAuthenticated() && this.globalRole() === "superadmin";
  }
  canManageBusiness(businessId: string): boolean {
    if (!this.isAuthenticated()) return false;
    if (this.isSuperadmin()) return true;
    const business = this.businesses().find((b) => b.id === businessId);
    return (
      business?.role === "business_owner" || business?.role === "business_admin"
    );
  }
  selectBusiness(businessId: string): void {
    if (!this.businesses().some((b) => b.id === businessId)) return;
    this.selectedBusinessId.set(businessId);
    localStorage.setItem("gastrolink_business_id", businessId);
  }
  removeBusinessFromSession(businessId: string): void {
    this.businesses.update((businesses) =>
      businesses.filter((business) => business.id !== businessId),
    );
    if (this.selectedBusinessId() === businessId) {
      this.selectedBusinessId.set(null);
      localStorage.removeItem("gastrolink_business_id");
    }
  }
  private setCurrentSession(session: CurrentSession): void {
    this.currentUser.set(session.user);
    this.businesses.set(session.businesses);
    if (!session.businesses.some((b) => b.id === this.selectedBusinessId())) {
      this.selectedBusinessId.set(null);
      localStorage.removeItem("gastrolink_business_id");
    }
    if (session.businesses.length === 1)
      this.selectBusiness(session.businesses[0].id);
  }
  clearSession(): void {
    for (const key of [
      "gastrolink_token",
      "gastrolink_user_email",
      "gastrolink_business_id",
    ])
      localStorage.removeItem(key);
    this.token.set(null);
    this.currentUser.set(null);
    this.businesses.set([]);
    this.selectedBusinessId.set(null);
  }
  logout(): void {
    this.clearSession();
    void this.router.navigate(["/login"]);
  }
}
