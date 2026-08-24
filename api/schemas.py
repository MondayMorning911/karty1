from pydantic import BaseModel, Field
from typing import Literal, Optional


class ListingRequest(BaseModel):
    """Объявление для публикации на сайтах недвижимости."""

    deal: Literal["sale", "rent"] = Field(
        ...,
        description="Тип сделки: 'sale' (продажа) или 'rent' (аренда)",
        examples=["sale", "rent"],
    )
    type: Literal["apartment", "house", "land", "commercial"] = Field(
        ...,
        description="Тип недвижимости: 'apartment', 'house', 'land', 'commercial'",
        examples=["apartment", "house", "land", "commercial"],
    )
    price: int = Field(..., gt=0, description="Цена объявления (целое число)")
    currency: Literal["USD", "GEL"] = Field(
        default="USD", description="Валюта цены: 'USD' или 'GEL'"
    )
    area: float = Field(..., gt=0, description="Общая площадь в м²")
    rooms: Optional[int] = Field(
        default=None,
        ge=0,
        description="Количество комнат (обязательно для apartment и commercial на korter.ge)",
    )
    bedrooms: Optional[int] = Field(default=None, ge=0, description="Количество спален")
    floor: Optional[int] = Field(
        default=None,
        ge=0,
        description="Этаж (обязательно для apartment, house на myhome.ge)",
    )
    floors_total: Optional[int] = Field(
        default=None,
        gt=0,
        description="Общее количество этажей (обязательно для apartment)",
    )
    yard_area: Optional[int] = Field(
        default=None,
        gt=0,
        description="Площадь двора в м² (обязательно для house на ss.ge)",
    )
    address: str = Field(
        ...,
        description="Адрес: 'Город, улица номер'. Пример: 'Тбилиси, ул. Костави 12'",
    )
    city: str = Field(..., min_length=1, description="Город")
    district: Optional[str] = Field(default=None, description="Район")
    description: str = Field(..., min_length=10, description="Описание объявления")
    photo_urls: list[str] = Field(
        default_factory=list,
        min_length=1,
        description="URL или локальные пути к фото. Минимум 1 фото.",
    )
    contact_name: str = Field(
        default="Даниэль", description="Имя контакта для объявления"
    )
    contact_phone: Optional[str] = Field(
        default=None, description="Телефон контакта (автозаполняется из cookies)"
    )


class PublishRequest(BaseModel):
    """Запрос на публикацию объявления."""

    user_id: str = Field(..., description="ID пользователя Telegram")
    sites: list[str] = Field(
        ...,
        description="Список сайтов для публикации: 'ss_ge', 'myhome_ge', 'korter_ge'",
    )
    listing: ListingRequest
    telegram_chat_id: Optional[str] = None
    telegram_username: Optional[str] = None
    listing_id: Optional[str] = Field(default=None, description="Supabase listing ID")
    idempotency_key: Optional[str] = Field(default=None, description="Stable key preventing duplicate publish tasks")


class SiteResult(BaseModel):
    status: str = "pending"
    url: Optional[str] = None
    error: Optional[str] = None
    error_code: Optional[str] = None
    user_action: Optional[str] = None
    user_message: Optional[str] = None
    screenshot_error: Optional[str] = None
    stage: Optional[str] = None
    alive_after_publish: Optional[bool] = None
    fallback_eligible: Optional[bool] = None


class PublishResponse(BaseModel):
    task_id: str
    status: str = "processing"


class TaskStatus(BaseModel):
    task_id: str
    status: str
    user_id: Optional[str] = None
    results: dict[str, SiteResult]


# Parser schemas

class ParseRequest(BaseModel):
    """Запуск парсинга риэлторов."""
    mode: str = Field(
        default="daily",
        description="Режим: 'full' (все объявления, max_per_site) или 'daily' (только новые)",
    )
    sites: list[str] = Field(
        default=["korter", "myhome", "ssge"],
        description="Сайты для парсинга: 'korter', 'myhome', 'ssge'",
    )
    max_per_site: int = Field(
        default=2000,
        ge=1,
        le=50000,
        description="Макс. объявлений на сайт (для full режима)",
    )
    skip_categories: list[str] = Field(
        default_factory=list,
        description="Категории, которые нужно одноразово пропустить",
    )


class ParseResponse(BaseModel):
    task_id: str
    status: str = "processing"


class RealtorResult(BaseModel):
    phone: str
    name: str
    source: str
    listing_url: str
    profile_url: str
    listings_count: int
    verified: bool


class ParseStatus(BaseModel):
    task_id: str
    status: str
    realtors_found: int = 0
    total_in_db: int = 0
    by_source: dict[str, int] = {}
    error: str = ""
    current_site: str = ""
    current_category: str = ""
    current_url: str = ""
    current_date: str = ""
    processed_count: int = 0
    total_urls: int = 0
    status_text: str = ""
