import {
  Component,
  DestroyRef,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
} from "@angular/core";

import { FormsModule } from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { finalize } from "rxjs";
import { AdminService } from "../../services/admin.service";
import { AuthService } from "../../services/auth.service";
import { UserBusiness } from "../../models/auth.model";

@Component({
  selector: "app-business-list",
  imports: [FormsModule, RouterLink],
  templateUrl: "./business-list.component.html",
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: "./business-list.component.css",
})
export class BusinessListComponent {
  auth = inject(AuthService);
  private admin = inject(AdminService);
  private destroyRef = inject(DestroyRef);
  accessDenied =
    inject(ActivatedRoute).snapshot.queryParamMap.get("accessDenied") ===
    "true";
  query = signal("");
  deletingBusinessId = signal<string | null>(null);
  deleteError = signal("");
  filtered = computed(() => {
    const query = this.query().trim().toLocaleLowerCase();
    return this.auth
      .businesses()
      .filter((b) => `${b.name} ${b.slug}`.toLocaleLowerCase().includes(query));
  });

  deleteBusiness(business: UserBusiness): void {
    if (!this.auth.isSuperadmin() || this.deletingBusinessId()) return;
    if (
      !confirm(
        `¿Eliminar "${business.name}" y todo su menú? Esta acción no se puede deshacer.`,
      )
    )
      return;

    this.deletingBusinessId.set(business.id);
    this.deleteError.set("");
    this.admin
      .deleteBusiness(business.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.deletingBusinessId.set(null)),
      )
      .subscribe({
        next: () => this.auth.removeBusinessFromSession(business.id),
        error: () =>
          this.deleteError.set(
            "No se pudo eliminar el negocio. Intenta de nuevo.",
          ),
      });
  }
}
