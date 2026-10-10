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
import { catchError, finalize, of, switchMap, throwError } from "rxjs";
import { AuthService } from "../../services/auth.service";
import {
  AdminService,
  BusinessPayload,
  BusinessTemplate,
} from "../../services/admin.service";
import { SupabaseService } from "../../services/supabase.service";

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
  private supabase = inject(SupabaseService);
  private businessRef = this.route.snapshot.paramMap.get("businessSlug");
  businessId = this.businessRef
    ? (this.auth.getBusinessByIdOrSlug(this.businessRef)?.id ?? null)
    : null;
  loading = signal(false);
  saving = signal(false);
  ready = signal(!this.businessId);
  error = signal("");
  ownerEmail = "";
  logoFile: File | null = null;
  templateType: BusinessTemplate = "empty";
  private lastSuggestedSlug = "";
  private slugManuallyEdited = false;
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

  onNameChange(name: string): void {
    if (this.businessId) return;
    if (!this.slugManuallyEdited || this.draft.slug === this.lastSuggestedSlug) {
      this.suggestSlug(name);
    }
  }

  onSlugChange(slug: string): void {
    this.slugManuallyEdited = slug !== this.lastSuggestedSlug;
  }

  regenerateSlug(): void {
    this.suggestSlug(this.draft.name);
    this.slugManuallyEdited = false;
  }

  private suggestSlug(name: string): void {
    this.lastSuggestedSlug = name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    this.draft.slug = this.lastSuggestedSlug;
  }

  onLogoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (!file) return;
    if (!("image/jpeg,image/png,image/webp".split(",").includes(file.type)) || file.size > 20 * 1024 * 1024) {
      this.error.set("Elige un logo JPG, PNG o WebP de máximo 20 MB.");
      this.logoFile = null;
      input.value = "";
      return;
    }
    this.error.set("");
    this.logoFile = file;
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
    let createdBusinessId: string | null = null;
    let recoveredExistingBusiness = false;
    const request = businessId
      ? (this.logoFile
          ? this.supabase.uploadBusinessLogo(businessId, this.logoFile)
          : of(payload.logo_url)
        ).pipe(
          switchMap((logoUrl) =>
            this.admin.updateBusiness(businessId, { ...payload, logo_url: logoUrl }),
          ),
        )
      : this.admin
          .createBusiness({
            ...payload,
            logo_url: "",
            owner_email: this.ownerEmail.trim().toLowerCase(),
            template_type: this.templateType,
          })
          .pipe(
            catchError((error) => {
              if (error.status !== 409) return throwError(() => error);
              return this.admin.getBusinesses().pipe(
                switchMap((businesses) => {
                  const existing = businesses.find(
                    (business) =>
                      business.slug === payload.slug &&
                      business.name.trim() === payload.name &&
                      !business.logo_url,
                  );
                  if (!existing) return throwError(() => error);
                  recoveredExistingBusiness = true;
                  return of(existing);
                }),
              );
            }),
          )
          .pipe(
            switchMap((created) => {
              createdBusinessId = created.id;
              if (recoveredExistingBusiness) this.businessId = created.id;
              if (!this.logoFile) {
                if (recoveredExistingBusiness) {
                  return throwError(
                    () => new Error("Este negocio ya se había creado. Selecciona su logo y vuelve a guardar."),
                  );
                }
                return of(created);
              }
              return this.supabase.uploadBusinessLogo(created.id, this.logoFile).pipe(
                switchMap((logoUrl) =>
                  this.admin.updateBusiness(
                    created.id,
                    recoveredExistingBusiness
                      ? { logo_url: logoUrl }
                      : { ...payload, logo_url: logoUrl },
                  ),
                ),
              );
            }),
          );
    request
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.saving.set(false)),
      )
      .subscribe({
        next: (business) => {
          this.logoFile = null;
          this.auth.refreshCurrentUser().subscribe((loaded) => {
            if (this.auth.isSuperadmin())
              void this.router.navigate(["/admin"]);
            else if (loaded)
              void this.router.navigate(["/admin/businesses", business.slug]);
            else void this.router.navigate(["/admin/businesses"]);
          });
        },
        error: (error) => {
          if (createdBusinessId) {
            this.businessId = createdBusinessId;
            this.auth.refreshCurrentUser().subscribe();
            this.error.set(
              recoveredExistingBusiness && !this.logoFile
                ? this.errorDetail(error)
                : `El negocio ya está creado, pero no se pudo guardar el logo. ${this.errorDetail(error)} Puedes volver a guardar para reintentar.`,
            );
            return;
          }
          this.error.set(
            error.status === 409
              ? "El slug ya existe o no se pudo asociar al dueño. Revisa los datos."
              : `No se pudo guardar el negocio. ${this.errorDetail(error)} Tus cambios se conservan.`,
          );
        },
      });
  }

  private errorDetail(error: unknown): string {
    const value = error as { message?: string; error?: { detail?: string; message?: string } };
    return value?.error?.detail || value?.error?.message || value?.message || "Revisa la configuración de Supabase Storage.";
  }
}
