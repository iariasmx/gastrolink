import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  ChangeDetectorRef,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, concatMap, defaultIfEmpty, finalize, from, of, tap } from 'rxjs';
import { AdminService } from '../../services/admin.service';
import { Product, ModifierGroup, ModifierOption } from '../../models/restaurant.model';

@Component({
  selector: 'app-modifier-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './modifier-editor.component.html',
  styleUrl: './modifier-editor.component.css',
})
export class ModifierEditorComponent implements OnChanges {
  @Input({ required: true }) businessId!: string;
  @Input({ required: true }) product!: Product;
  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<ModifierGroup[]>();
  private admin = inject(AdminService);
  private changeDetector = inject(ChangeDetectorRef);
  groups: ModifierGroup[] = [];
  private persisted = new Map<string, ModifierGroup>();
  busy = false;
  error = '';
  message = '';

  ngOnChanges(): void {
    this.groups = structuredClone(this.product.modifier_groups ?? []);
    this.persisted = new Map(this.groups.map((g) => [g.id, structuredClone(g)]));
    this.error = this.message = '';
  }

  private groupData(group: ModifierGroup): string {
    return JSON.stringify([
      group.name.trim(),
      group.is_required,
      group.min_selection,
      group.max_selection,
      group.sort_order,
    ]);
  }

  private optionData(option: ModifierOption): string {
    return JSON.stringify([
      option.name.trim(),
      option.price_extra,
      option.is_available,
      option.sort_order,
    ]);
  }

  hasChanges(): boolean {
    return this.groups.some((group) => {
      const stored = this.persisted.get(group.id);
      return (
        !stored ||
        this.groupData(group) !== this.groupData(stored) ||
        group.options.some((option) => {
          const previous = stored.options.find((o) => o.id === option.id);
          return !previous || this.optionData(option) !== this.optionData(previous);
        })
      );
    });
  }

  requestClose(): void {
    if (this.busy) return;
    if (this.hasChanges() && !confirm('Hay cambios sin guardar. ¿Cerrar y descartarlos?')) return;
    this.close.emit();
  }

  saveAll(): void {
    if (this.busy) return;
    if (
      !this.groups.every(
        (group) =>
          this.validGroup(group) && group.options.every((option) => this.validOption(option)),
      )
    ) {
      this.error =
        'Revisa los nombres, precios y límites de selección. El mínimo debe ser menor o igual al máximo.';
      this.message = '';
      return;
    }
    if (
      this.groups.some(
        (group) =>
          group.is_required &&
          group.options.filter((o) => o.is_available).length < group.min_selection,
      )
    ) {
      this.error =
        'Cada grupo obligatorio necesita suficientes opciones disponibles para cumplir su mínimo.';
      this.message = '';
      return;
    }
    const requests = from(this.groups).pipe(
      concatMap((group) => {
        const stored = this.persisted.get(group.id);
        const groupRequest =
          !stored || this.groupData(group) !== this.groupData(stored)
            ? this.admin
                .saveModifierGroup(this.businessId, this.product.id, { ...group, name: group.name.trim() })
                .pipe(
                  tap((saved) => {
                    const options = this.persisted.get(group.id)?.options ?? [];
                    Object.assign(group, saved, { options: group.options });
                    this.persisted.set(group.id, { ...saved, options: structuredClone(options) });
                  }),
                )
            : of(group);
        return groupRequest.pipe(
          concatMap(() =>
            from(group.options).pipe(
              concatMap((option) => {
                const previous = this.persisted
                  .get(group.id)!
                  .options.find((o) => o.id === option.id);
                if (previous && this.optionData(option) === this.optionData(previous))
                  return of(option);
                return this.admin
                  .saveModifierOption(this.businessId, group.id, { ...option, name: option.name.trim() })
                  .pipe(
                    tap((saved) => {
                      Object.assign(option, saved);
                      const current = this.persisted.get(group.id)!;
                      current.options = [
                        ...current.options.filter((o) => o.id !== saved.id),
                        saved,
                      ];
                    }),
                  );
              }),
              defaultIfEmpty(null),
            ),
          ),
        );
      }),
      defaultIfEmpty(null),
    );
    this.busy = true;
    this.error = this.message = '';
    requests
      .pipe(
        finalize(() => {
          this.busy = false;
          this.emitSaved();
          this.changeDetector.markForCheck();
        }),
      )
      .subscribe({
        complete: () => (this.message = 'Todos los cambios se guardaron correctamente.'),
        error: () =>
          (this.error =
            'No se pudieron guardar todos los cambios. Tu borrador se conserva; vuelve a intentar.'),
      });
  }

  validGroup(g: ModifierGroup): boolean {
    return (
      !!g.name.trim() &&
      g.name.trim().length <= 100 &&
      Number.isInteger(g.min_selection) &&
      Number.isInteger(g.max_selection) &&
      g.min_selection >= 0 &&
      g.max_selection >= 1 &&
      g.min_selection <= g.max_selection &&
      (!g.is_required || g.min_selection >= 1) &&
      Number.isInteger(g.sort_order) &&
      g.sort_order >= 0
    );
  }

  validOption(o: ModifierOption): boolean {
    return (
      !!o.name.trim() &&
      o.name.trim().length <= 100 &&
      Number.isFinite(o.price_extra) &&
      o.price_extra >= 0 &&
      Number.isInteger(o.sort_order) &&
      o.sort_order >= 0
    );
  }

  addGroup(): void {
    this.message = '';
    this.groups.push({
      id: '',
      product_id: this.product.id,
      name: '',
      is_required: false,
      min_selection: 0,
      max_selection: 1,
      sort_order: this.groups.length,
      options: [],
    });
  }

  addOption(group: ModifierGroup): void {
    this.message = '';
    group.options.push({
      id: '',
      modifier_group_id: group.id,
      name: '',
      price_extra: 0,
      is_available: true,
      sort_order: group.options.length,
    });
  }

  private run<T>(request: Observable<T>, success: (value: T) => void): void {
    if (this.busy) return;
    this.busy = true;
    this.error = this.message = '';
    request
      .pipe(
        finalize(() => {
          this.busy = false;
          this.changeDetector.markForCheck();
        }),
      )
      .subscribe({
        next: (value) => {
          success(value);
          this.message = 'Cambios guardados.';
          this.emitSaved();
        },
        error: () => (this.error = 'No se pudieron guardar los cambios. Intenta de nuevo.'),
      });
  }

  private emitSaved(): void {
    this.saved.emit(structuredClone([...this.persisted.values()]));
  }

  removeGroup(group: ModifierGroup): void {
    if (!group.id) {
      this.groups = this.groups.filter((g) => g !== group);
      return;
    }
    if (!confirm('¿Eliminar este grupo y todas sus opciones?')) return;
    this.run(this.admin.deleteModifierGroup(this.businessId, group.id), () => {
      this.groups = this.groups.filter((g) => g !== group);
      this.persisted.delete(group.id);
    });
  }

  removeOption(group: ModifierGroup, option: ModifierOption): void {
    if (!option.id) {
      group.options = group.options.filter((o) => o !== option);
      return;
    }
    if (!confirm('¿Eliminar esta opción?')) return;
    this.run(this.admin.deleteModifierOption(this.businessId, option.id), () => {
      group.options = group.options.filter((o) => o !== option);
      const stored = this.persisted.get(group.id)!;
      stored.options = stored.options.filter((o) => o.id !== option.id);
    });
  }
}
