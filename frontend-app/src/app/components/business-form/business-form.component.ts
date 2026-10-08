import {
  Component,
  DestroyRef,
  inject,
  signal,
  ChangeDetectionStrategy,
} from "@angular/core";

import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { finalize } from "rxjs";
import { AuthService } from "../../services/auth.service";
import { AdminService, BusinessPayload } from "../../services/admin.service";

@Component({
  selector: "app-business-form",
  imports: [FormsModule, RouterLink],
  templateUrl: "./business-form.component.html",
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: "./business-form.component.css",
})
export class BusinessFormComponent {
  private admin = inject(AdminService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);
  private businessRef = this.route.snapshot.paramMap.get("businessSlug");
  businessId = this.businessRef
    ? (this.auth.getBusinessByIdOrSlug(this.businessRef)?.id ?? null)
    : null;
  loading = signal(false);
  saving = signal(false);
  ready = signal(!this.businessId);
  error = signal("");
  ownerEmail = "";
  draft: BusinessPayload = {
    name: "",
    slug: "",
    whatsapp_number: "",
    logo_url: "",
    allows_table_order: true,
    allows_takeaway: true,
    allows_delivery: false,
    delivery_fee: 0,
    minimum_order: 0,
    is_active: true,
  };

  constructor() {
    const businessId = this.businessId;
    if (!businessId) return;
    this.loading.set(true);
    this.admin
      .getBusinessById(businessId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (business) => {
          for (const key of Object.keys(
            this.draft,
          ) as (keyof BusinessPayload)[])
            Object.assign(this.draft, { [key]: business[key] });
          this.ready.set(true);
        },
        error: () =>
          this.error.set(
            "No se pudo cargar el negocio. Regresa al listado e intenta de nuevo.",
          ),
      });
  }
  save(): void {
    if (this.saving() || !this.ready()) return;
    const businessId = this.businessId;
    this.saving.set(true);
    this.error.set("");
    const payload = {
      ...this.draft,
      name: this.draft.name.trim(),
      slug: this.draft.slug.trim(),
      whatsapp_number: this.draft.whatsapp_number.trim(),
    };
    const request = businessId
      ? this.admin.updateBusiness(businessId, payload)
      : this.admin.createBusiness({
          ...payload,
          owner_email: this.ownerEmail.trim().toLowerCase(),
        });
    request
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.saving.set(false)),
      )
      .subscribe({
        next: (business) => {
          void this.router.navigate(["/admin/businesses", business.slug]);
        },
        error: (error) =>
          this.error.set(
            error.status === 409
              ? "El slug ya existe o no se pudo asociar al dueño. Revisa los datos."
              : "No se pudo guardar el negocio. Tus cambios se conservan.",
          ),
      });
  }
}
