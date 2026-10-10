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
  private readonly ttlMs = 60_000;
  private lastSessionLoadedAt = 0;
  private lastSessionToken: string | undefined = undefined;
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
        tap((response) => this.applyTokenResponse(response)),
        map(() => true),
        catchError(() => {
          this.clearSession();
          return of(false);
        }),
      );
  }

  /**
   * Completa una sesión obtenida por una vía alternativa a usuario/contraseña
   * (por ejemplo, OTP de recovery validado directamente en Supabase).
   * Toma el access_token de Supabase, lo valida contra el backend y carga
   * el perfil y sus negocios en AuthService para que AuthGuard lo reconozca.
   */
  loginWithSupabaseToken(accessToken: string): Observable<boolean> {
    return this.http
      .post<TokenResponse>(`${API_URL}/auth/session`, {
        access_token: accessToken,
      })
      .pipe(
        tap((response) => this.applyTokenResponse(response)),
        map(() => true),
        catchError((error) => {
          if (error.status === 401 || error.status === 403) this.clearSession();
          return of(false);
        }),
      );
  }

  loadCurrentUser(): Observable<boolean> {
    const currentToken = this.token();
    if (!currentToken) return of(false);
    const now = Date.now();
    const freshSession =
      this.isAuthenticated() &&
      this.lastSessionToken === currentToken &&
      now - this.lastSessionLoadedAt < this.ttlMs;
    if (freshSession) return of(true);
    if (this.sessionRequest) return this.sessionRequest;
    this.sessionRequest = this.http
      .get<CurrentSession>(`${API_URL}/auth/me`)
      .pipe(
        map((response) => {
          if (this.token() !== currentToken) return false;
          if (
            !response.user?.is_active ||
            !Array.isArray(response.businesses)
          ) {
            this.clearSession();
            return false;
          }
          this.setCurrentSession(response);
          this.lastSessionToken = currentToken;
          this.lastSessionLoadedAt = Date.now();
          return true;
        }),
        catchError((error) => {
          if (this.token() === currentToken) {
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

  /** Fuerza una lectura nueva de perfil y negocios tras cambios administrativos. */
  refreshCurrentUser(): Observable<boolean> {
    this.lastSessionLoadedAt = 0;
    this.lastSessionToken = undefined;
    return this.loadCurrentUser();
  }

  getCurrentUser(): CurrentUser | null {
    return this.currentUser();
  }
  getUserBusinesses(): UserBusiness[] {
    return this.businesses();
  }
  replaceBusinesses(businesses: UserBusiness[]): void {
    this.businesses.set(businesses);
    if (
      !businesses.some((business) => business.id === this.selectedBusinessId())
    ) {
      this.selectedBusinessId.set(null);
      localStorage.removeItem("gastrolink_business_id");
    }
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
    this.lastSessionLoadedAt = 0;
    this.lastSessionToken = undefined;
  }
  logout(): void {
    this.clearSession();
    void this.router.navigate(["/login"]);
  }

  private applyTokenResponse(response: TokenResponse): void {
    if (
      !response.access_token ||
      !response.user?.is_active ||
      !Array.isArray(response.businesses)
    ) {
      throw new Error("Sesión inválida");
    }
    localStorage.setItem("gastrolink_token", response.access_token);
    this.token.set(response.access_token);
    this.setCurrentSession(response);
  }
}
