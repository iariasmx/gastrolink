import {
  Component,
  inject,
  ChangeDetectionStrategy,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterModule, Router } from "@angular/router";
import { SupabaseService } from "../../services/supabase.service";

@Component({
  selector: "app-reset-password-request",
  standalone: true,
  imports: [FormsModule, RouterModule],
  templateUrl: "./reset-password-request.component.html",
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: "./reset-password-request.component.css",
})
export class ResetPasswordRequestComponent {
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);

  readonly email = signal("");
  readonly loading = signal(false);
  readonly errorMessage = signal("");
  readonly successMessage = signal("");

  onSubmit(): void {
    if (!this.email()) {
      this.errorMessage.set("Por favor ingresa tu correo electrónico.");
      return;
    }

    this.loading.set(true);
    this.errorMessage.set("");
    this.successMessage.set("");

    this.supabase.sendRecoveryOtp(this.email()).subscribe({
      next: (result) => {
        this.loading.set(false);
        if (result.success) {
          this.successMessage.set(
            "Te enviamos un código de 6 dígitos a tu correo. Sigue los pasos en la siguiente pantalla.",
          );
          setTimeout(() => this.router.navigate(["/verify-otp"]), 900);
        } else {
          this.errorMessage.set(
            result.error ??
              "No pudimos enviar el código. Verifica que la dirección sea correcta e inténtalo nuevamente.",
          );
        }
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set(
          "Ocurrió un error al enviar la solicitud. Inténtalo más tarde.",
        );
      },
    });
  }

  goToLogin(): void {
    void this.router.navigate(["/login"]);
  }
}
