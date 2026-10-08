import {
  Component,
  OnInit,
  computed,
  inject,
  signal,
  ChangeDetectionStrategy,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { MenuService } from "../../services/menu.service";
import { CartService } from "../../services/cart.service";
import { CartDrawerComponent } from "../cart-drawer/cart-drawer.component";
import {
  ModifierGroup,
  ModifierOption,
  Product,
  SelectedModifier,
} from "../../models/restaurant.model";

@Component({
  selector: "app-menu",
  standalone: true,
  imports: [CommonModule, FormsModule, CartDrawerComponent],
  templateUrl: "./menu.component.html",
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: "./menu.component.css",
})
export class MenuComponent implements OnInit {
  menuService = inject(MenuService);
  cartService = inject(CartService);
  route = inject(ActivatedRoute);

  isCartOpen = false;
  activeCategoryId = "";

  // PROPIEDADES REACTIVAS DE CONTROL PARA EL MODAL
  isModalOpen = false;
  private readonly selectedProductState = signal<Product | null>(null);

  get selectedProduct(): Product | null {
    return this.selectedProductState();
  }

  set selectedProduct(product: Product | null) {
    this.selectedProductState.set(product);
  }
  productNotes = "";
  selectedModifiersList = signal<SelectedModifier[]>([]);

  // Señal computada para recalcular en tiempo real el precio del platillo en el modal
  calculatedItemPrice = computed(() => {
    if (!this.selectedProduct) return 0;
    const base = this.selectedProduct.price;
    const extra = this.selectedModifiersList().reduce(
      (sum, m) => sum + m.price_extra,
      0,
    );
    return base + extra;
  });

  ngOnInit(): void {
    this.route.params.subscribe((params) => {
      const slug = params["slug"] || "tacos-el-pastor";
      this.menuService.loadMenuBySlug(slug);
    });
  }

  scrollToCategory(catId: string): void {
    this.activeCategoryId = catId;
    const el = document.getElementById(catId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  }

  /**
   * Evalúa si meter el producto directo o levantar la pantalla de modificadores
   */
  handleProductClick(product: Product): void {
    if (product.modifier_groups && product.modifier_groups.length > 0) {
      this.selectedProduct = product;
      this.productNotes = "";
      this.selectedModifiersList.set([]); // Limpiar selecciones previas

      // Auto-seleccionar la primera opción para grupos requeridos de selección única
      product.modifier_groups.forEach((group) => {
        if (
          group.is_required &&
          group.max_selection === 1 &&
          group.options.length > 0
        ) {
          this.selectRadioOption(group, group.options[0]);
        }
      });

      this.isModalOpen = true;
    } else {
      this.cartService.addItem(product, []);
    }
  }

  closeModifiersModal(): void {
    this.isModalOpen = false;
    this.selectedProduct = null;
  }

  isOptionSelected(optionId: string): boolean {
    return this.selectedModifiersList().some(
      (m) => m.modifier_option_id === optionId,
    );
  }

  /**
   * Controla grupos de selección única (Radio buttons)
   */
  selectRadioOption(group: ModifierGroup, option: ModifierOption): void {
    this.selectedModifiersList.update((current) => {
      // Remover cualquier opción seleccionada anteriormente que pertenezca a este mismo grupo
      const filtered = current.filter(
        (m) => !group.options.some((o) => o.id === m.modifier_option_id),
      );
      // Agregar la nueva opción única
      return [
        ...filtered,
        {
          modifier_option_id: option.id,
          name: option.name,
          price_extra: option.price_extra,
        },
      ];
    });
  }

  /**
   * Controla grupos de selección múltiple (Checkboxes)
   */
  toggleCheckboxOption(group: ModifierGroup, option: ModifierOption): void {
    this.selectedModifiersList.update((current) => {
      const exists = current.some((m) => m.modifier_option_id === option.id);

      if (exists) {
        return current.filter((m) => m.modifier_option_id !== option.id);
      } else {
        // Validar que no se rompa la cuota máxima permitida antes de agregar
        const countInGroup = current.filter((m) =>
          group.options.some((o) => o.id === m.modifier_option_id),
        ).length;

        if (countInGroup < group.max_selection) {
          return [
            ...current,
            {
              modifier_option_id: option.id,
              name: option.name,
              price_extra: option.price_extra,
            },
          ];
        }
        return current;
      }
    });
  }

  isGroupSelectionFull(group: ModifierGroup): boolean {
    const count = this.selectedModifiersList().filter((m) =>
      group.options.some((o) => o.id === m.modifier_option_id),
    ).length;
    return count >= group.max_selection;
  }

  /**
   * Valida en tiempo real que se cumplan las reglas obligatorias de selección
   */
  isModalSelectionValid(): boolean {
    if (!this.selectedProduct?.modifier_groups) return true;

    return this.selectedProduct.modifier_groups.every((group) => {
      const selectionsCount = this.selectedModifiersList().filter((m) =>
        group.options.some((o) => o.id === m.modifier_option_id),
      ).length;

      if (group.is_required) {
        return (
          selectionsCount >= group.min_selection &&
          selectionsCount <= group.max_selection
        );
      }
      return selectionsCount <= group.max_selection;
    });
  }

  /**
   * Envía el platillo totalmente personalizado al Carrito
   */
  confirmModifiersAndAddToCart(): void {
    if (!this.selectedProduct || !this.isModalSelectionValid()) return;

    this.cartService.addItem(
      this.selectedProduct,
      this.selectedModifiersList(),
      this.productNotes.trim() || undefined,
    );

    this.closeModifiersModal();
  }

  onImageError(event: Event): void {
    const target = event.target as HTMLImageElement;
    if (target) {
      target.style.display = "none";
    }
  }
}
