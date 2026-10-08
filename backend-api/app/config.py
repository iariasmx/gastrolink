import os
from pathlib import Path
from typing import List, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    SUPABASE_URL: str = "https://your-supabase-project.supabase.co"
    SUPABASE_SECRET_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    SUPABASE_KEY: str = "your-supabase-anon-key"
    CORS_ORIGINS: Union[str, List[str]] = ["http://localhost:4200", "http://127.0.0.1:4200"]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",") if i.strip()]
        elif isinstance(v, list):
            return v
        return ["http://localhost:4200", "http://127.0.0.1:4200"]

    model_config = SettingsConfigDict(
        # Project .env takes precedence over legacy app/.env, independent of cwd.
        env_file=(Path(__file__).resolve().parent / '.env', Path(__file__).resolve().parent.parent / '.env'),
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()
