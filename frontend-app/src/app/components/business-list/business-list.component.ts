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
import { finalize, switchMap } from "rxjs";
import {
  AdminService,
  BusinessUserRole,
} from "../../services/admin.service";
import { AuthService } from "../../services/auth.service";
import { SupabaseService } from "../../services/supabase.service";
import { BusinessUserAssignment, UserBusiness } from "../../models/auth.model";

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
  private supabase = inject(SupabaseService);
  private destroyRef = inject(DestroyRef);
  accessDenied =
    inject(ActivatedRoute).snapshot.queryParamMap.get("accessDenied") ===
    "true";
  query = signal("");
  deletingBusinessId = signal<string | null>(null);
  deleteError = signal("");
  loadError = signal("");
  loading = signal(true);
  status = signal<"all" | "active" | "inactive">("all");
  expandedUsersFor = signal<string | null>(null);
  users = signal<BusinessUserAssignment[]>([]);
  usersQuery = signal("");
  userEmail = signal("");
  userRole = signal<BusinessUserRole>("business_owner");
  userError = signal("");
  userMessage = signal("");
  userBusy = signal(false);
  filtered = computed(() => {
    const query = this.query().trim().toLocaleLowerCase();
    return this.auth
      .businesses()
      .filter((b) => `${b.name} ${b.slug}`.toLocaleLowerCase().includes(query))
      .filter(
        (b) =>
          this.status() === "all" ||
          b.is_active === (this.status() === "active"),
      );
  });
  filteredUsers = computed(() => {
    const query = this.usersQuery().trim().toLocaleLowerCase();
    return this.users().filter((user) =>
      `${user.email ?? ""} ${user.user_id} ${user.role}`
        .toLocaleLowerCase()
        .includes(query),
    );
  });

  constructor() {
    if (!this.auth.isSuperadmin()) {
      this.loading.set(false);
      return;
    }
    this.admin
      .getBusinesses()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (businesses) =>
          this.auth.replaceBusinesses(
            businesses.map((business) => ({
              ...business,
              role: "superadmin" as const,
            })),
          ),
        error: () =>
          this.loadError.set(
            "No se pudo cargar el listado de negocios. Actualiza la página e intenta de nuevo.",
          ),
      });
  }

  toggleUsers(businessId: string): void {
    this.userError.set("");
    if (this.expandedUsersFor() === businessId) {
      this.expandedUsersFor.set(null);
      return;
    }
    this.expandedUsersFor.set(businessId);
    this.loadUsers(businessId);
  }

  private loadUsers(businessId: string): void {
    this.users.set([]);
    this.admin
      .getBusinessUsers(businessId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (users) => this.users.set(users),
        error: () =>
          this.userError.set("No se pudieron cargar los usuarios asignados."),
      });
  }

  assignUser(business: UserBusiness): void {
    if (!this.userEmail().trim() || this.userBusy()) return;
    this.userBusy.set(true);
    this.userError.set("");
    this.userMessage.set("");
    this.admin
      .assignBusinessUser(
        business.id,
        this.userEmail().trim().toLowerCase(),
        this.userRole(),
      )
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.userBusy.set(false)),
      )
      .subscribe({
        next: () => {
          this.userEmail.set("");
          this.userMessage.set("Acceso asignado. Si era una cuenta nueva, se envió una invitación por correo.");
          this.loadUsers(business.id);
        },
        error: (error) =>
          this.userError.set(
            error.status === 409
              ? "Ese usuario ya está asignado."
              : error.status === 502
                ? "No se pudo enviar la invitación. Revisa la configuración de correo de Supabase."
              : "No se pudo asignar el usuario. Verifica el correo y vuelve a intentar.",
          ),
      });
  }

  removeUser(businessId: string, userId: string): void {
    if (this.userBusy()) return;
    this.userBusy.set(true);
    this.userError.set("");
    this.admin
      .removeBusinessUser(businessId, userId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.userBusy.set(false)),
      )
      .subscribe({
        next: () =>
          this.users.update((users) =>
            users.filter((user) => user.user_id !== userId),
          ),
        error: () =>
          this.userError.set("No se pudo retirar el acceso del usuario."),
      });
  }

  updateUserRole(businessId: string, assignment: BusinessUserAssignment, role: BusinessUserRole): void {
    if (this.userBusy() || assignment.role === role) return;
    this.userBusy.set(true);
    this.userError.set("");
    this.admin
      .updateBusinessUserRole(businessId, assignment.user_id, role)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.userBusy.set(false)),
      )
      .subscribe({
        next: () =>
          this.users.update((users) =>
            users.map((user) =>
              user.user_id === assignment.user_id ? { ...user, role } : user,
            ),
          ),
        error: () =>
          this.userError.set("No se pudo cambiar el rol. Intenta de nuevo."),
      });
  }

  sendUserPasswordReset(businessId: string, assignment: BusinessUserAssignment): void {
    if (this.userBusy() || !assignment.email) return;
    this.userBusy.set(true);
    this.userError.set("");
    this.userMessage.set("");
    this.admin
      .requestBusinessUserPasswordReset(businessId, assignment.user_id)
      .pipe(
        switchMap(({ email }) => this.supabase.sendAssignedUserRecoveryOtp(email)),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.userBusy.set(false)),
      )
      .subscribe({
        next: (result) => {
          if (result.success) {
            this.userMessage.set(`Se envió un código de recuperación a ${assignment.email}.`);
          } else {
            this.userError.set(result.error ?? "No se pudo enviar el código de recuperación.");
          }
        },
        error: () =>
          this.userError.set("No se pudo solicitar la recuperación. Revisa la conexión e intenta de nuevo."),
      });
  }

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
