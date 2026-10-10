import { Injectable } from "@angular/core";
import { from, Observable, map, switchMap } from "rxjs";
import { createClient, SupabaseClient, AuthError } from "@supabase/supabase-js";
import { environment } from "../../environments/environment";

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
  private readonly dishPhotosBucket = "dish-photos";

  constructor() {
    this.client = createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }

  /** Optimiza, sube una foto de platillo y devuelve su URL pública. */
  uploadDishPhoto(businessId: string, file: File): Observable<string> {
    return this.uploadBusinessImage(businessId, file, "dishes", 1600, 5 * 1024 * 1024);
  }

  /** Optimiza y sube el logo del negocio a una variante ligera para encabezados. */
  uploadBusinessLogo(businessId: string, file: File): Observable<string> {
    return this.uploadBusinessImage(businessId, file, "logos", 512, 1024 * 1024);
  }

  private uploadBusinessImage(
    businessId: string,
    file: File,
    folder: "dishes" | "logos",
    maxDimension: number,
    maxBytes: number,
  ): Observable<string> {
    if (!(file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp")) {
      return from(Promise.reject(new Error("Usa una imagen JPG, PNG o WebP.")));
    }
    if (file.size > 20 * 1024 * 1024) {
      return from(Promise.reject(new Error("La imagen original debe pesar 20 MB o menos.")));
    }

    return from(
      this.optimizeImage(file, maxDimension, maxBytes).then((optimized) => ({ optimized })),
    ).pipe(
      switchMap(({ optimized }) => {
        const path = `${businessId}/${folder}/${crypto.randomUUID()}.webp`;
        const accessToken = localStorage.getItem("gastrolink_token");
        if (!accessToken) {
          return from(Promise.reject(new Error("Tu sesión expiró. Inicia sesión e inténtalo de nuevo.")));
        }
        const storage = this.client.storage.from(this.dishPhotosBucket);
        // The app authenticates through its API, so the Supabase client does not
        // hold an auth session. Pass the app's verified Supabase JWT to Storage.
        storage.setHeader("Authorization", `Bearer ${accessToken}`);
        return from(
          storage.upload(path, optimized, {
              contentType: "image/webp",
              cacheControl: "3600",
              upsert: false,
            })
            .then(({ data, error }) => {
              if (error) throw error;
              if (!data) throw new Error("No se pudo guardar la imagen.");
              return storage.getPublicUrl(data.path).data.publicUrl;
            }),
        );
      }),
    );
  }

  private async optimizeImage(file: File, maxDimension: number, maxBytes: number): Promise<File> {
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No se pudo preparar la imagen.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      for (const quality of [0.82, 0.7, 0.58]) {
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (result) => result ? resolve(result) : reject(new Error("No se pudo comprimir la imagen.")),
            "image/webp",
            quality,
          ),
        );
        if (blob.size <= maxBytes) {
          const name = file.name.replace(/\.[^.]+$/, "") || "platillo";
          return new File([blob], `${name}.webp`, { type: "image/webp" });
        }
      }
      throw new Error("La imagen sigue siendo muy pesada después de comprimirla.");
    } finally {
      bitmap.close();
    }
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
        .resetPasswordForEmail(normalizedEmail, {
          redirectTo:
            typeof window !== "undefined"
              ? window.location.origin + "/verify-otp"
              : undefined,
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

  /** Solicita un OTP para un usuario asignado sin guardar su correo en el navegador del dueño. */
  sendAssignedUserRecoveryOtp(email: string): Observable<AuthResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/verify-otp?email=${encodeURIComponent(normalizedEmail)}`
        : undefined;
    return from(
      this.client.auth
        .resetPasswordForEmail(normalizedEmail, { redirectTo })
        .then(({ error }) => ({
          success: !error,
          error: SupabaseService.translateError(error),
        })),
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
