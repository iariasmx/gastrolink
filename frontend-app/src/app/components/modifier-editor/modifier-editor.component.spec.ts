import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AdminService } from '../../services/admin.service';
import { ModifierEditorComponent } from './modifier-editor.component';
import { ModifierGroup, Product } from '../../models/restaurant.model';

describe('Modifier editor', () => {
  const group: ModifierGroup = {
    id: 'group',
    product_id: 'product',
    name: 'Extras',
    is_required: false,
    min_selection: 0,
    max_selection: 2,
    sort_order: 0,
    options: [],
  };
  const product: Product = {
    id: 'product',
    category_id: 'category',
    name: 'Taco',
    price: 26,
    is_available: true,
    modifier_groups: [group],
  };

  function setup(service: Partial<AdminService>) {
    TestBed.configureTestingModule({ providers: [{ provide: AdminService, useValue: service }] });
    const fixture = TestBed.createComponent(ModifierEditorComponent);
    fixture.componentRef.setInput('businessId', 'business');
    fixture.componentRef.setInput('product', product);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('saves edited groups and options together without mutating the input product', () => {
    const option = {
      id: 'option',
      modifier_group_id: 'group',
      name: 'Queso',
      price_extra: 12,
      is_available: true,
      sort_order: 0,
    };
    const editor = setup({
      saveModifierGroup: (_businessId, _productId, draft) => of(draft),
      saveModifierOption: () => of(option),
    });
    editor.groups[0].name = 'Updated extras';
    editor.addOption(editor.groups[0]);
    Object.assign(editor.groups[0].options[0], option, { id: '' });
    let emitted: ModifierGroup[] = [];
    editor.saved.subscribe((value) => (emitted = value));
    editor.saveAll();
    expect(emitted[0].name).toBe('Updated extras');
    expect(emitted[0].options).toEqual([option]);
    expect(product.modifier_groups![0].options).toEqual([]);
    expect(product.modifier_groups![0].name).toBe('Extras');
  });

  it('retains the draft and emits the last persisted state after a failed save', () => {
    const editor = setup({ saveModifierGroup: () => throwError(() => new Error('offline')) });
    editor.groups[0].name = 'Updated extras';
    let emitted: ModifierGroup[] = [];
    editor.saved.subscribe(value => emitted = value);
    editor.saveAll();
    expect(emitted[0].name).toBe('Extras');
    expect(editor.groups[0].name).toBe('Updated extras');
    expect(editor.error).toContain('No se pudieron guardar');
    expect(editor.busy).toBe(false);
    expect(editor.groups.length).toBe(1);
  });

  it('rejects invalid required groups and negative option prices', () => {
    const editor = setup({});
    expect(editor.validGroup({ ...group, is_required: true, min_selection: 0 })).toBe(false);
    expect(editor.validGroup({ ...group, min_selection: 3, max_selection: 2 })).toBe(false);
    expect(
      editor.validOption({
        id: '',
        modifier_group_id: 'group',
        name: 'Queso',
        price_extra: -1,
        is_available: true,
        sort_order: 0,
      }),
    ).toBe(false);
  });

  it('saves a new group and its draft options together using the returned group id', () => {
    const groupIds: string[] = [];
    const editor = setup({
      saveModifierGroup: (_businessId, _productId, draft) => of({ ...draft, id: 'new-group' }),
      saveModifierOption: (_businessId, groupId, draft) => {
        groupIds.push(groupId);
        return of({ ...draft, id: 'new-option', modifier_group_id: groupId });
      },
    });
    editor.addGroup();
    const draft = editor.groups[1];
    draft.name = 'Sauces';
    editor.addOption(draft);
    draft.options[0].name = 'Hot sauce';
    editor.saveAll();
    expect(groupIds).toEqual(['new-group']);
    expect(draft.id).toBe('new-group');
    expect(draft.options[0].id).toBe('new-option');
    expect(editor.hasChanges()).toBe(false);
    expect(editor.busy).toBe(false);
    expect(editor.message).toContain('Todos los cambios');
  });

  it('preserves partially saved drafts and retries without duplicating successful options', () => {
    const calls: string[] = [];
    let fail = true;
    const editor = setup({
      saveModifierOption: (_businessId, groupId, draft) => {
        calls.push(draft.name);
        if (draft.name === 'Avocado' && fail) return throwError(() => new Error('offline'));
        return of({ ...draft, id: draft.name, modifier_group_id: groupId });
      },
    });
    const draft = editor.groups[0];
    editor.addOption(draft);
    draft.options[0].name = 'Cheese';
    editor.addOption(draft);
    draft.options[1].name = 'Avocado';
    editor.saveAll();
    expect(editor.error).toContain('Tu borrador se conserva');
    expect(editor.hasChanges()).toBe(true);
    expect(draft.options[0].id).toBe('Cheese');
    expect(draft.options[1].id).toBe('');
    fail = false;
    editor.saveAll();
    expect(calls).toEqual(['Cheese', 'Avocado', 'Avocado']);
    expect(editor.hasChanges()).toBe(false);
    expect(editor.error).toBe('');
  });

  it('does not save a required group with too few available options', () => {
    const editor = setup({});
    editor.groups[0].is_required = true;
    editor.groups[0].min_selection = 1;
    editor.saveAll();
    expect(editor.error).toContain('opciones disponibles');
    expect(editor.busy).toBe(false);
  });
});
