import {
  Component,
  OnInit,
  DestroyRef,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Observable, Subject, combineLatest, finalize, of, switchMap, takeUntil } from "rxjs";
import {
  Restaurant,
  Category,
  CategoryWithProducts,
  Product,
  ModifierGroup,
} from "../../models/restaurant.model";
import { ModifierEditorComponent } from "../modifier-editor/modifier-editor.component";

import { AuthService } from "../../services/auth.service";
import { AdminService } from "../../services/admin.service";
import { OrderService } from "../../services/order.service";
import { SupabaseService } from "../../services/supabase.service";
import { BusinessOrder, OrderStatus } from "../../models/order.model";

@Component({
  selector: "app-admin",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ModifierEditorComponent],
  templateUrl: "./admin.component.html",
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: "./admin.component.css",
})
export class AdminComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private contextChanged = new Subject<void>();
  businessId = signal("");
  businessSlug = signal("");
  loading = signal(false);
  loadError = signal("");
  actionError = signal("");
  actionMessage = signal("");
  actionBusy = signal(false);
  authService = inject(AuthService);
  adminService = inject(AdminService);
  private orderService = inject(OrderService);
  private supabaseService = inject(SupabaseService);

  activeTab = signal<"overview" | "menu" | "settings" | "orders">("overview");
  orders = signal<BusinessOrder[]>([]);
  ordersLoading = signal(false);
  ordersError = signal("");
  orderBusyId = signal<string | null>(null);
  ordersFilter = signal<"active" | "all">("active");
  visibleOrders = computed(() =>
    this.ordersFilter() === "all"
      ? this.orders()
      : this.orders().filter((order) => !["completed", "cancelled"].includes(order.status)),
  );

  restaurant = signal<Restaurant | null>(null);
  categories = signal<CategoryWithProducts[]>([]);
  modifiersProduct: Product | null = null;

  updateProductModifiers(groups: ModifierGroup[]): void {
    const productId = this.modifiersProduct?.id;
    this.categories.update((categories) =>
      categories.map((category) => ({
        ...category,
        products: category.products.map((product) =>
          product.id === productId
            ? { ...product, modifier_groups: groups }
            : product,
        ),
      })),
    );
  }

  modifierNames(item: BusinessOrder["items"][number]): string {
    return item.selected_modifiers.map((modifier) => modifier.name).join(", ");
  }

  // Settings form binding
  editName = "";
  editSlug = "";
  editWhatsapp = "";
  editLogo = "";
  editLogoFile: File | null = null;
  editDeliveryFee = 0;
  editMinimumOrder = 0;
  editIsActive = true;
  editAllowsTable = true;
  editAllowsTakeaway = true;
  editAllowsDelivery = true;

  // Add Product Modal State
  showAddModal = false;
  newProductCategoryId = "";
  newProductName = "";
  newProductPrice = 0;
  newProductDescription = "";
  newProductImageUrl = "";
  newProductImageFile: File | null = null;

  // Edit Product Modal State
  showEditModal = false;
  editingProductId = "";
  editProductCategoryId = "";
  editProductName = "";
  editProductPrice = 0;
  editProductDescription = "";
  editProductImageUrl = "";
  editProductImageFile: File | null = null;

  // Category CRUD state
  showCategoryForm = false;
  editingCategoryId = "";
  categoryName = "";
  categorySortOrder = 0;
  categoryIsActive = true;

  ngOnInit(): void {
    combineLatest([this.route.paramMap, this.route.data])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([params, data]) => {
        const businessRef =
          params.get("businessSlug") ?? params.get("businessId") ?? "";
        const business = this.authService.getBusinessByIdOrSlug(businessRef);
        this.businessId.set(business?.id ?? "");
        this.businessSlug.set(business?.slug ?? "");
        this.activeTab.set(data["tab"] ?? "overview");
        if (!business) {
          this.loadError.set("No se encontró el negocio seleccionado.");
          return;
        }
        this.authService.selectBusiness(business.id);
        if (this.activeTab() === "orders") {
          this.contextChanged.next();
          this.restaurant.set(business);
          this.orders.set([]);
          this.loadOrders();
          return;
        }
        this.loadBusiness();
      });
  }

  openTab(tab: "overview" | "menu" | "settings" | "orders"): void {
    const path = ["/admin/businesses", this.businessSlug()];
    if (!this.businessSlug()) return;
    if (tab !== "overview") path.push(tab);
    void this.router.navigate(path);
  }

  loadBusiness(): void {
    this.contextChanged.next();
    this.restaurant.set(null);
    this.categories.set([]);
    this.modifiersProduct = null;
    this.showAddModal = this.showEditModal = false;
    this.actionError.set("");
    this.actionMessage.set("");
    this.loadError.set("");
    if (!this.businessId()) return;
    this.loading.set(true);
    this.adminService
      .getBusinessMenu(this.businessId())
      .pipe(
        takeUntil(this.contextChanged),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (data) => {
          if (data.restaurant.id !== this.businessId()) {
            this.loadError.set(
              "La respuesta no corresponde al negocio seleccionado.",
            );
            return;
          }
          this.restaurant.set(data.restaurant);
          this.categories.set(data.categories);
          this.populateSettings(data.restaurant);
          if (this.activeTab() === "orders") this.loadOrders();
        },
        error: (error) =>
          this.loadError.set(
            error.status === 403
              ? "No tienes permiso para administrar este negocio."
              : "No se pudo cargar el negocio. Intenta de nuevo.",
          ),
      });
  }

  loadOrders(): void {
    if (!this.businessId()) return;
    this.ordersLoading.set(true);
    this.ordersError.set("");
    this.orderService
      .list(this.businessId())
      .pipe(
        takeUntil(this.contextChanged),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.ordersLoading.set(false)),
      )
      .subscribe({
        next: (orders) => this.orders.set(orders),
        error: () => this.ordersError.set("No se pudieron cargar los pedidos."),
      });
  }

  updateOrderStatus(order: BusinessOrder, status: OrderStatus): void {
    if (order.status === status || this.orderBusyId()) return;
    this.orderBusyId.set(order.id);
    this.ordersError.set("");
    this.orderService
      .updateStatus(this.businessId(), order.id, status)
      .pipe(
        takeUntil(this.contextChanged),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.orderBusyId.set(null)),
      )
      .subscribe({
        next: (updated) =>
          this.orders.update((orders) =>
            orders.map((item) => (item.id === updated.id ? updated : item)),
          ),
        error: () => this.ordersError.set("No se pudo actualizar el pedido."),
      });
  }

  private save<T>(request: Observable<T>, apply: (value: T) => void): void {
    if (this.actionBusy() || !this.restaurant()) return;
    this.actionBusy.set(true);
    this.actionError.set("");
    this.actionMessage.set("");
    request
      .pipe(
        takeUntil(this.contextChanged),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.actionBusy.set(false)),
      )
      .subscribe({
        next: (value) => {
          apply(value);
          this.actionMessage.set("Cambios guardados.");
        },
        error: () =>
          this.actionError.set(
            "No se pudieron guardar los cambios. Revisa los datos e intenta de nuevo.",
          ),
      });
  }

  populateSettings(r: Restaurant): void {
    this.editName = r.name;
    this.editSlug = r.slug;
    this.editWhatsapp = r.whatsapp_number;
    this.editLogo = r.logo_url || "";
    this.editDeliveryFee = r.delivery_fee || 0;
    this.editMinimumOrder = r.minimum_order;
    this.editIsActive = r.is_active;
    this.editAllowsTable = r.allows_table_order;
    this.editAllowsTakeaway = r.allows_takeaway;
    this.editAllowsDelivery = r.allows_delivery;
  }

  getMenuFullUrl(): string {
    const slug = this.restaurant()?.slug;
    return slug
      ? `${window.location.origin}/menu/${encodeURIComponent(slug)}`
      : "";
  }

  getQrUrl(): string {
    const fullUrl = this.getMenuFullUrl();
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(fullUrl)}`;
  }

  downloadQr(): void {
    const link = document.createElement("a");
    link.href = this.getQrUrl();
    link.download = `QR_Menu_${this.restaurant()?.slug || "gastrolink"}.png`;
    link.target = "_blank";
    link.click();
  }

  printQr(): void {
    window.print();
  }

  getTotalProducts(): number {
    return this.categories().reduce((acc, cat) => acc + cat.products.length, 0);
  }

  toggleAvailability(product: Product): void {
    this.save(
      this.adminService.updateProduct(this.businessId(), product.id, {
        is_available: !product.is_available,
      }),
      (updated) => {
        this.replaceProduct(updated);
      },
    );
  }

  private replaceProduct(updated: Product): void {
    this.categories.update((categories) =>
      categories.map((category) => ({
        ...category,
        products: [
          ...category.products.filter((product) => product.id !== updated.id),
          ...(category.id === updated.category_id
            ? [
                {
                  ...category.products.find((p) => p.id === updated.id),
                  ...updated,
                },
              ]
            : []),
        ],
      })),
    );
  }

  deleteProduct(productId: string): void {
    if (
      this.actionBusy() ||
      !confirm("?Est?s seguro de que deseas eliminar este platillo?")
    )
      return;
    this.save(
      this.adminService.deleteProduct(this.businessId(), productId),
      () => {
        this.categories.update((categories) =>
          categories.map((category) => ({
            ...category,
            products: category.products.filter((p) => p.id !== productId),
          })),
        );
      },
    );
  }

  openAddProductModal(): void {
    if (this.categories().length > 0) {
      this.newProductCategoryId = this.categories()[0].id;
    }
    this.showAddModal = true;
  }

  openNewCategory(): void {
    this.editingCategoryId = "";
    this.categoryName = "";
    this.categorySortOrder = this.categories().length;
    this.categoryIsActive = true;
    this.showCategoryForm = true;
    this.actionError.set("");
  }

  openEditCategory(category: Category): void {
    this.editingCategoryId = category.id;
    this.categoryName = category.name;
    this.categorySortOrder = category.sort_order;
    this.categoryIsActive = category.is_active ?? true;
    this.showCategoryForm = true;
    this.actionError.set("");
  }

  cancelCategoryForm(): void {
    this.showCategoryForm = false;
    this.editingCategoryId = "";
    this.categoryName = "";
  }

  saveCategory(): void {
    const name = this.categoryName.trim();
    if (
      !name ||
      name.length > 50 ||
      !Number.isInteger(this.categorySortOrder) ||
      this.categorySortOrder < 0
    ) {
      this.actionError.set(
        "Indica un nombre de hasta 50 caracteres y un orden igual o mayor que cero.",
      );
      this.actionMessage.set("");
      return;
    }
    const payload = {
      name,
      sort_order: this.categorySortOrder,
      is_active: this.categoryIsActive,
    };
    const previous = this.categories().find(
      (category) => category.id === this.editingCategoryId,
    );
    const request = previous
      ? this.adminService.updateCategory(
          this.businessId(),
          previous.id,
          payload,
        )
      : this.adminService.createCategory(this.businessId(), payload);
    this.save(request, (saved) => {
      this.categories.update((categories) => {
        const updated = { ...saved, products: previous?.products ?? [] };
        return previous
          ? categories.map((category) =>
              category.id === previous.id ? updated : category,
            )
          : [...categories, updated];
      });
      this.cancelCategoryForm();
    });
  }

  deleteCategory(category: CategoryWithProducts): void {
    if (
      this.actionBusy() ||
      !confirm(
        `¿Eliminar la categoría "${category.name}" y sus ${category.products.length} productos? Esta acción no se puede deshacer.`,
      )
    )
      return;
    this.save(
      this.adminService.deleteCategory(this.businessId(), category.id),
      () => {
        this.categories.update((categories) =>
          categories.filter((item) => item.id !== category.id),
        );
      },
    );
  }

  saveNewProduct(): void {
    if (
      !this.newProductName.trim() ||
      !Number.isFinite(this.newProductPrice) ||
      this.newProductPrice <= 0 ||
      !this.categories().some((c) => c.id === this.newProductCategoryId)
    )
      return;
    const payload = {
      category_id: this.newProductCategoryId,
      name: this.newProductName.trim(),
      price: this.newProductPrice,
      description: this.newProductDescription,
      image_url: this.newProductImageUrl || null,
      is_available: true,
    };
    const imageUrl$ = this.newProductImageFile
      ? this.supabaseService.uploadDishPhoto(this.businessId(), this.newProductImageFile)
      : of(payload.image_url);
    this.save(
      imageUrl$.pipe(
        switchMap((imageUrl) =>
          this.adminService.createProduct(this.businessId(), {
            ...payload,
            image_url: imageUrl ?? undefined,
          }),
        ),
      ),
      (created) => {
        this.categories.update((categories) =>
          categories.map((category) =>
            category.id === created.category_id
              ? { ...category, products: [...category.products, created] }
              : category,
          ),
        );
        this.newProductName = "";
        this.newProductPrice = 0;
        this.newProductDescription = "";
        this.newProductImageUrl = "";
        this.newProductImageFile = null;
        this.showAddModal = false;
      },
    );
  }

  // --- EDIT PRODUCT METHODS ---
  openEditProductModal(product: Product): void {
    this.editingProductId = product.id;
    this.editProductCategoryId = product.category_id;
    this.editProductName = product.name;
    this.editProductPrice = product.price;
    this.editProductDescription = product.description || "";
    this.editProductImageUrl = product.image_url || "";
    this.editProductImageFile = null;
    this.showEditModal = true;
  }

  saveEditedProduct(): void {
    if (
      !this.editingProductId ||
      !this.editProductName.trim() ||
      !Number.isFinite(this.editProductPrice) ||
      this.editProductPrice <= 0
    )
      return;
    const updates: Partial<Product> = {
      category_id: this.editProductCategoryId,
      name: this.editProductName.trim(),
      price: this.editProductPrice,
      description: this.editProductDescription,
    };
    const imageUrl$ = this.editProductImageFile
      ? this.supabaseService.uploadDishPhoto(this.businessId(), this.editProductImageFile)
      : of(this.editProductImageUrl);
    this.save(
      imageUrl$.pipe(
        switchMap((imageUrl) =>
          this.adminService.updateProduct(
            this.businessId(),
            this.editingProductId,
            { ...updates, image_url: imageUrl },
          ),
        ),
      ),
      (updated) => {
        this.replaceProduct(updated);
        this.showEditModal = false;
      },
    );
  }

  selectDishPhoto(event: Event, form: "new" | "edit"): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (!file) return;
    if (!("image/jpeg,image/png,image/webp".split(",").includes(file.type)) || file.size > 20 * 1024 * 1024) {
      this.actionError.set("Elige una imagen JPG, PNG o WebP de máximo 20 MB; se comprimirá antes de subirla.");
      input.value = "";
      if (form === "new") this.newProductImageFile = null;
      else this.editProductImageFile = null;
      return;
    }
    this.actionError.set("");
    if (form === "new") this.newProductImageFile = file;
    else this.editProductImageFile = file;
  }

  saveSettings(): void {
    const payload = {
      name: this.editName.trim(),
      slug: this.editSlug.trim(),
      whatsapp_number: this.editWhatsapp.trim(),
      logo_url: this.editLogo,
      delivery_fee: this.editDeliveryFee,
      minimum_order: this.editMinimumOrder,
      is_active: this.editIsActive,
      allows_table_order: this.editAllowsTable,
      allows_takeaway: this.editAllowsTakeaway,
      allows_delivery: this.editAllowsDelivery,
    };
    if (
      !payload.name ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(payload.slug) ||
      !payload.whatsapp_number ||
      !Number.isFinite(payload.delivery_fee) ||
      payload.delivery_fee < 0 ||
      !Number.isFinite(payload.minimum_order) ||
      payload.minimum_order < 0
    ) {
      this.actionError.set(
        "Revisa nombre, slug, WhatsApp y los importes antes de guardar.",
      );
      return;
    }
    const logoUrl$ = this.editLogoFile
      ? this.supabaseService.uploadBusinessLogo(this.businessId(), this.editLogoFile)
      : of(payload.logo_url);
    this.save(
      logoUrl$.pipe(
        switchMap((logoUrl) =>
          this.adminService.updateBusinessSettings(this.businessId(), {
            ...payload,
            logo_url: logoUrl,
          }),
        ),
      ),
      (updated) => {
        this.restaurant.set(updated);
        this.populateSettings(updated);
        this.editLogoFile = null;
        this.businessSlug.set(updated.slug);
        const path = ["/admin/businesses", updated.slug];
        if (this.activeTab() !== "overview") path.push(this.activeTab());
        void this.router.navigate(path, { replaceUrl: true });
      },
    );
  }

  selectBusinessLogo(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (!file) return;
    if (
      !("image/jpeg,image/png,image/webp".split(",").includes(file.type)) ||
      file.size > 20 * 1024 * 1024
    ) {
      this.actionError.set("Elige un logo JPG, PNG o WebP de máximo 20 MB.");
      this.editLogoFile = null;
      input.value = "";
      return;
    }
    this.actionError.set("");
    this.editLogoFile = file;
  }

  onImageError(event: Event): void {
    const target = event.target as HTMLImageElement;
    if (target) {
      target.src =
        "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80";
    }
  }
}
