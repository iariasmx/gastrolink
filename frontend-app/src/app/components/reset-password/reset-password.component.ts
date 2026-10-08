import {
  Component,
  inject,
  ChangeDetectionStrategy,
  signal,
  OnInit,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterModule, Router } from "@angular/router";
import { SupabaseService } from "../../services/supabase.service";

@Component({
  selector: "app-reset-password",
  standalone: true,
  imports: [FormsModule, RouterModule],
  templateUrl: "./reset-password.component.html",
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: "./reset-password.component.css",
})
export class ResetPasswordComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);

  readonly password = signal("");
  readonly confirmPassword = signal("");
  readonly loading = signal(false);
  readonly errorMessage = signal("");
  readonly successMessage = signal("");
  readonly invalidLink = signal(false);

  ngOnInit(): void {
    // Antes de permitir cambiar la contraseña, se requiere haber validado el
    // código OTP en `/verify-otp`, lo que crea una sesión de recovery en el
    // cliente de Supabase. Sin esa sesión, mostramos el botón para volver.
    this.supabase.hasRecoverySession().subscribe((hasSession) => {
      this.invalidLink.set(!hasSession);
    });
  }

  onSubmit(): void {
    if (!this.password() || !this.confirmPassword()) {
      this.errorMessage.set("Por favor completa ambos campos.");
      return;
    }
    if (this.password().length < 6) {
      this.errorMessage.set("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (this.password() !== this.confirmPassword()) {
      this.errorMessage.set("Las contraseñas no coinciden.");
      return;
    }

    this.loading.set(true);
    this.errorMessage.set("");
    this.successMessage.set("");

    this.supabase.updateUserPassword(this.password()).subscribe({
      next: (result) => {
        this.loading.set(false);
        if (result.success) {
          this.successMessage.set(
            "Contraseña actualizada correctamente. Ahora puedes iniciar sesión.",
          );
          setTimeout(() => this.router.navigate(["/login"]), 2500);
        } else {
          this.errorMessage.set(
            result.error ??
              "No pudimos actualizar la contraseña. Verifica el código y vuelve a intentarlo.",
          );
        }
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set(
          "Ocurrió un error al actualizar la contraseña. Inténtalo más tarde.",
        );
      },
    });
  }
}
