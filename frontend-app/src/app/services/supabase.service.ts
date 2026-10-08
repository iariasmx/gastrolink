import { Injectable } from "@angular/core";
import { from, Observable, map } from "rxjs";
import { createClient, SupabaseClient, AuthError } from "@supabase/supabase-js";

export const SUPABASE_URL = "https://xjonzsfrqtlprpnvznzh.supabase.co";

export const SUPABASE_ANON_KEY =
  "sb_publishable_5olcH_t38zMn7s2l8PvPcQ_Ph1LQonj";

const PENDING_RECOVERY_EMAIL_KEY = "gastrolink_recovery_email";

export interface AuthResult {
  success: boolean;
  error?: string;
}

export interface AuthResultWithToken extends AuthResult {
  accessToken?: string;
}

@Injectable({ providedIn: "root" })
export class SupabaseService {
  private readonly client: SupabaseClient;

  constructor() {
    this.client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }

  private static translateError(error: unknown): string | undefined {
    if (!error) return undefined;
    const authError = error as AuthError;
    const message = authError.message ?? String(error);
    switch (authError.status) {
      case 401:
      case 403:
        return (
          "El código no es válido o ha expirado. " +
          "Solicita uno nuevo desde la pantalla de inicio de sesión."
        );
      case 404:
        if (/otp/i.test(message) || /email/i.test(message)) {
          return (
            "El código no coincide o el correo no está registrado. " +
            "Verifica los datos e inténtalo de nuevo."
          );
        }
        return message;
      case 422:
        if (/password/i.test(message)) {
          return (
            "La contraseña no cumple con los requisitos de seguridad " +
            "configurados en Supabase. Intenta con una más larga o compleja."
          );
        }
        if (/otp/i.test(message) || /email/i.test(message)) {
          return "Código inválido. Verifica los 6 dígitos e inténtalo de nuevo.";
        }
        return "Datos inválidos: " + message;
      case 429:
        return "Has hecho demasiados intentos. Espera unos minutos e inténtalo de nuevo.";
      default:
        return message;
    }
  }

  getPendingRecoveryEmail(): string | null {
    return localStorage.getItem(PENDING_RECOVERY_EMAIL_KEY);
  }

  setPendingRecoveryEmail(email: string): void {
    localStorage.setItem(PENDING_RECOVERY_EMAIL_KEY, email.trim().toLowerCase());
  }

  clearPendingRecoveryEmail(): void {
    localStorage.removeItem(PENDING_RECOVERY_EMAIL_KEY);
  }

  /**
   * Envía un código OTP de recuperación al correo indicado.
   * Este flujo reemplaza al "magic link" y pide al usuario que escriba
   * 6 dígitos en la siguiente pantalla.
   */
  sendRecoveryOtp(email: string): Observable<AuthResult> {
    const normalizedEmail = email.trim().toLowerCase();
    return from(
      this.client.auth
        .signInWithOtp({
          email: normalizedEmail,
          options: {
            shouldCreateUser: false,
            emailRedirectTo:
              typeof window !== "undefined"
                ? window.location.origin + "/verify-otp"
                : undefined,
          },
        })
        .then(({ error }) => {
          if (!error) {
            this.setPendingRecoveryEmail(normalizedEmail);
          }
          return {
            success: !error,
            error: SupabaseService.translateError(error),
          };
        }),
    );
  }

  /**
   * Valida el código OTP de 6 dígitos enviado al correo.
   * Si la validación es exitosa, Supabase crea una sesión de recovery
   * que permite después llamar a `updateUser` con la nueva contraseña.
   */
  verifyRecoveryOtp(email: string, token: string): Observable<AuthResult> {
    return this.verifyRecoveryOtpWithSession(email, token).pipe(
      map((result) => ({
        success: result.success,
        error: result.error,
      })),
    );
  }

  /**
   * Igual que verifyRecoveryOtp, pero además devuelve el access_token
   * generado por Supabase si la validación fue exitosa. Útil para que
   * AuthService complete la sesión y AuthGuard reconozca al usuario.
   */
  verifyRecoveryOtpWithSession(
    email: string,
    token: string,
  ): Observable<AuthResultWithToken> {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedToken = token.trim();
    return from(
      this.client.auth
        .verifyOtp({
          email: normalizedEmail,
          token: normalizedToken,
          type: "recovery",
        })
        .then(({ data, error }) => {
          if (!error) {
            this.clearPendingRecoveryEmail();
          }
          return {
            success: !error,
            error: SupabaseService.translateError(error),
            accessToken:
              !error && data.session ? data.session.access_token : undefined,
          } as AuthResultWithToken;
        }),
    );
  }

  /**
   * Actualiza la contraseña del usuario actual.
   * Se debe haber llamado antes a `verifyRecoveryOtp` con éxito, o bien
   * haber iniciado sesión, para que el cliente Supabase tenga una sesión.
   */
  updateUserPassword(password: string): Observable<AuthResult> {
    return from(
      this.client.auth
        .updateUser({ password })
        .then(({ error }) => ({
          success: !error,
          error: SupabaseService.translateError(error),
        })),
    );
  }

  /**
   * Comprueba si hay una sesión activa (tras verifyOtp) para permitir
   * avanzar a la pantalla de nueva contraseña.
   */
  hasRecoverySession(): Observable<boolean> {
    return from(
      this.client.auth.getSession().then(({ data }) => {
        const session = data.session;
        return !!session && !!session.user;
      }),
    );
  }
}
