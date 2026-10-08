import { Component, inject, ChangeDetectionStrategy } from "@angular/core";

import { FormsModule } from "@angular/forms";
import { Router, ActivatedRoute } from "@angular/router";
import { AuthService } from "../../services/auth.service";

@Component({
  selector: "app-login",
  standalone: true,
  imports: [FormsModule],
  templateUrl: "./login.component.html",
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: "./login.component.css",
})
export class LoginComponent {
  authService = inject(AuthService);
  router = inject(Router);
  route = inject(ActivatedRoute);

  email = "";
  password = "";
  loading = false;
  errorMessage = "";

  onLogin(): void {
    if (!this.email || !this.password) {
      this.errorMessage = "Por favor ingresa tu correo y contraseña.";
      return;
    }

    this.loading = true;
    this.errorMessage = "";

    this.authService.login(this.email, this.password).subscribe((success) => {
      this.loading = false;
      if (success) {
        const target = this.route.snapshot.queryParamMap.get("returnUrl");
        void this.router.navigateByUrl(
          target && /^\/admin(?:\/|$)/.test(target) ? target : "/admin",
        );
      } else {
        this.errorMessage =
          "Credenciales inválidas. Por favor verifica tu correo y contraseña.";
      }
    });
  }
}
