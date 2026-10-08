"""Administration endpoints for modifier groups and options."""
from uuid import UUID
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, model_validator
from app.database import supabase
from app import schemas

router = APIRouter(prefix="/api", tags=["CRUD Modificadores"])


class GroupData(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    is_required: bool = False
    min_selection: int = Field(default=0, ge=0)
    max_selection: int = Field(default=1, ge=1)
    sort_order: int = Field(default=0, ge=0)

    @model_validator(mode="after")
    def valid_selection(self):
        self.name = self.name.strip()
        if not self.name:
            raise ValueError("El nombre es obligatorio")
        if self.min_selection > self.max_selection:
            raise ValueError("El minimo no puede superar el maximo")
        if self.is_required and self.min_selection < 1:
            raise ValueError("Un grupo obligatorio requiere al menos una seleccion")
        return self


class GroupCreate(GroupData):
    product_id: UUID


class OptionData(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    price_extra: float = Field(default=0, ge=0, allow_inf_nan=False)
    is_available: bool = True
    sort_order: int = Field(default=0, ge=0)

    @model_validator(mode="after")
    def valid_name(self):
        self.name = self.name.strip()
        if not self.name:
            raise ValueError("El nombre es obligatorio")
        return self


class OptionCreate(OptionData):
    modifier_group_id: UUID


def write_record(table, payload, record_id=None):
    try:
        query = supabase.table(table)
        data = payload.model_dump(mode="json")
        response = (query.update(data).eq("id", str(record_id)) if record_id
                    else query.insert(data)).execute()
        if not response.data:
            raise HTTPException(status_code=404 if record_id else 400,
                                detail="No se pudo guardar el modificador")
        return response.data[0]
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="No se pudo guardar el modificador")


def delete_record(table, record_id):
    try:
        response = supabase.table(table).delete().eq("id", str(record_id)).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Modificador no encontrado")
        return {"id": str(record_id)}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="No se pudo eliminar el modificador")


@router.post("/modifier-groups", response_model=schemas.ModifierGroup)
def create_group(group: GroupCreate):
    return write_record("modifier_groups", group)


@router.put("/modifier-groups/{group_id}", response_model=schemas.ModifierGroup)
def update_group(group_id: UUID, group: GroupData):
    return write_record("modifier_groups", group, group_id)


@router.delete("/modifier-groups/{group_id}")
def delete_group(group_id: UUID):
    return delete_record("modifier_groups", group_id)


@router.post("/modifier-options", response_model=schemas.ModifierOption)
def create_option(option: OptionCreate):
    return write_record("modifier_options", option)


@router.put("/modifier-options/{option_id}", response_model=schemas.ModifierOption)
def update_option(option_id: UUID, option: OptionData):
    return write_record("modifier_options", option, option_id)


@router.delete("/modifier-options/{option_id}")
def delete_option(option_id: UUID):
    return delete_record("modifier_options", option_id)
