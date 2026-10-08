import {
  Component,
  inject,
  ChangeDetectionStrategy,
  signal,
  ElementRef,
  ViewChildren,
  QueryList,
  AfterViewInit,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterModule, Router } from "@angular/router";
import { SupabaseService } from "../../services/supabase.service";
import { AuthService } from "../../services/auth.service";

@Component({
  selector: "app-verify-otp",
  standalone: true,
  imports: [FormsModule, RouterModule],
  templateUrl: "./verify-otp.component.html",
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: "./verify-otp.component.css",
})
export class VerifyOtpComponent implements AfterViewInit {
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  @ViewChildren("digitInput") digitInputs?: QueryList<
    ElementRef<HTMLInputElement>
  >;

  readonly email = signal(this.supabase.getPendingRecoveryEmail() ?? "");
  readonly digits = signal<string[]>(["", "", "", "", "", ""]);
  readonly loading = signal(false);
  readonly resending = signal(false);
  readonly errorMessage = signal("");
  readonly successMessage = signal("");

  private get otpToken(): string {
    return this.digits().join("");
  }

  ngAfterViewInit(): void {
    if (!this.email()) {
      this.errorMessage.set(
        "Introduce primero tu correo para recibir el código de recuperación.",
      );
    } else {
      this.focusInput(0);
    }
  }

  onDigitInput(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const rawValue = input.value.replace(/\D/g, "");
    const newDigits = [...this.digits()];

    if (rawValue.length >= 1) {
      newDigits[index] = rawValue.slice(-1);
      this.digits.set(newDigits);
      if (index < 5) this.focusInput(index + 1);
    } else {
      newDigits[index] = "";
      this.digits.set(newDigits);
    }

    if (this.otpToken.length === 6) {
      void this.onVerify();
    }
  }

  onDigitKeydown(index: number, event: KeyboardEvent): void {
    if (event.key === "Backspace") {
      const newDigits = [...this.digits()];
      if (!newDigits[index] && index > 0) {
        newDigits[index - 1] = "";
        this.digits.set(newDigits);
        this.focusInput(index - 1);
        event.preventDefault();
        return;
      }
      newDigits[index] = "";
      this.digits.set(newDigits);
      return;
    }
    if (event.key === "ArrowLeft" && index > 0) {
      this.focusInput(index - 1);
      event.preventDefault();
      return;
    }
    if (event.key === "ArrowRight" && index < 5) {
      this.focusInput(index + 1);
      event.preventDefault();
      return;
    }
    if (
      event.key.length === 1 &&
      (event.key < "0" || event.key > "9")
    ) {
      event.preventDefault();
    }
  }

  onPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const text = event.clipboardData?.getData("text") ?? "";
    const digits = text.replace(/\D/g, "").slice(0, 6).split("");
    const padded = [...digits, ...Array(6 - digits.length).fill("")];
    this.digits.set(padded);
    const nextIndex = Math.min(digits.length, 5);
    this.focusInput(nextIndex);
    if (this.otpToken.length === 6) {
      void this.onVerify();
    }
  }

  async onVerify(): Promise<void> {
    if (this.loading()) return;
    if (!this.email()) {
      this.errorMessage.set(
        "Introduce primero tu correo para recibir el código de recuperación.",
      );
      return;
    }
    if (this.otpToken.length !== 6) {
      this.errorMessage.set("Introduce los 6 dígitos del código.");
      return;
    }

    this.loading.set(true);
    this.errorMessage.set("");
    this.successMessage.set("");

    this.supabase
      .verifyRecoveryOtpWithSession(this.email(), this.otpToken)
      .subscribe({
        next: (result) => {
          if (!result.success) {
            this.loading.set(false);
            this.errorMessage.set(
              result.error ??
                "No pudimos verificar el código. Inténtalo de nuevo.",
            );
            this.digits.set(["", "", "", "", "", ""]);
            this.focusInput(0);
            return;
          }

          if (!result.accessToken) {
            this.loading.set(false);
            this.errorMessage.set(
              "No pudimos completar la sesión. Vuelve a solicitar el código.",
            );
            return;
          }

          this.auth.loginWithSupabaseToken(result.accessToken).subscribe({
            next: (loggedIn) => {
              this.loading.set(false);
              if (loggedIn) {
                this.successMessage.set(
                  "Código verificado. Define tu nueva contraseña.",
                );
                setTimeout(
                  () => this.router.navigate(["/reset-password"]),
                  1200,
                );
              } else {
                this.errorMessage.set(
                  "Tu cuenta está inactiva o no tiene perfil. Contacta al administrador.",
                );
              }
            },
            error: () => {
              this.loading.set(false);
              this.errorMessage.set(
                "Ocurrió un error al iniciar tu sesión. Inténtalo más tarde.",
              );
            },
          });
        },
        error: () => {
          this.loading.set(false);
          this.errorMessage.set(
            "Ocurrió un error al verificar el código. Inténtalo más tarde.",
          );
        },
      });
  }

  onResend(): void {
    if (this.resending() || !this.email()) return;
    this.resending.set(true);
    this.errorMessage.set("");
    this.successMessage.set("");

    this.supabase.sendRecoveryOtp(this.email()).subscribe({
      next: (result) => {
        this.resending.set(false);
        if (result.success) {
          this.digits.set(["", "", "", "", "", ""]);
          this.focusInput(0);
          this.successMessage.set(
            "Código reenviado. Revisa tu bandeja de entrada.",
          );
        } else {
          this.errorMessage.set(
            result.error ?? "No pudimos reenviar el código. Inténtalo más tarde.",
          );
        }
      },
      error: () => {
        this.resending.set(false);
        this.errorMessage.set(
          "Ocurrió un error al reenviar el código. Inténtalo más tarde.",
        );
      },
    });
  }

  goToRequest(): void {
    void this.router.navigate(["/reset-password-request"]);
  }

  goToLogin(): void {
    void this.router.navigate(["/login"]);
  }

  private focusInput(index: number): void {
    const inputs = this.digitInputs?.toArray();
    if (!inputs || !inputs[index]) return;
    const element = inputs[index].nativeElement;
    element.focus();
    element.select();
  }
}
