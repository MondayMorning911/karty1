from pydantic import BaseModel, Field
from typing import Optional


class ListingRequest(BaseModel):
    """Объявление для публикации на сайтах недвижимости."""

    deal: str = Field(
        ...,
        description="Тип сделки: 'sale' (продажа) или 'rent' (аренда)",
        examples=["sale", "rent"],
    )
    type: str = Field(
        ...,
        description="Тип недвижимости: 'apartment', 'house', 'land', 'commercial'",
        examples=["apartment", "house", "land", "commercial"],
    )
    price: int = Field(..., gt=0, description="Цена объявления (целое число)")
    currency: str = Field(
        default="USD", description="Валюта цены: 'USD' или 'GEL'"
    )
    area: int = Field(..., gt=0, description="Общая площадь в м²")
    rooms: Optional[int] = Field(
        default=None,
        description="Количество комнат (обязательно для apartment и commercial на korter.ge)",
    )
    bedrooms: Optional[int] = Field(default=None, description="Количество спален")
    floor: Optional[int] = Field(
        default=None,
        description="Этаж (обязательно для apartment, house на myhome.ge)",
    )
    floors_total: Optional[int] = Field(
        default=None,
        description="Общее количество этажей (обязательно для apartment)",
    )
    yard_area: Optional[int] = Field(
        default=None,
        description="Площадь двора в м² (обязательно для house на ss.ge)",
    )
    address: str = Field(
        ...,
        description="Адрес: 'Город, улица номер'. Пример: 'Тбилиси, ул. Костави 12'",
    )
    city: str = Field(default="Тбилиси", description="Город")
    district: Optional[str] = Field(default=None, description="Район")
    description: str = Field(..., min_length=10, description="Описание объявления")
    photo_urls: list[str] = Field(
        default_factory=list,
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


class SiteResult(BaseModel):
    status: str = "pending"
    url: Optional[str] = None
    error: Optional[str] = None


class PublishResponse(BaseModel):
    task_id: str
    status: str = "processing"


class TaskStatus(BaseModel):
    task_id: str
    status: str
    results: dict[str, SiteResult]


# Parser schemas

class ParseRequest(BaseModel):
    """Запуск парсинга риэлторов."""
    mode: str = Field(
        default="daily",
        description="Режим: 'full' (все объявления, max_per_site) или 'daily' (только новые)",
    )
    sites: list[str] = Field(
        default=["korter", "ssge"],
        description="Сайты для парсинга: 'korter', 'ssge'",
    )
    max_per_site: int = Field(
        default=50,
        ge=1,
        le=5000,
        description="Макс. объявлений на сайт (для full режима)",
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
