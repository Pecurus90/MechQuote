from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "MechQuote"
    company_name: str = "Fratelli Dalla Via"
    database_url: str = "sqlite:///./mechquote.db"
    secret_key: str = "change-me-in-production-use-a-real-secret-key"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440

    class Config:
        env_file = ".env"


settings = Settings()
