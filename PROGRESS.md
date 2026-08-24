# Karty Lab Progress Report
**Date:** 2026-07-02

## Статус: ВСЕ САЙТЫ И КАТЕГОРИИ РАБОТАЮТ

### Публикация — 100% покрытие

| Сайт | Квартира | Дом | Участок | Коммерция |
|------|----------|-----|---------|-----------|
| **ss.ge** | прод+арен ✅ | прод+арен ✅ | прод ✅ | прод+арен ✅ |
| **myhome.ge** | прод+арен ✅ | прод+арен ✅ | прод ✅ | прод+арен ✅ |
| **korter.ge** | прод+арен ✅ | прод+арен ✅ | прод ✅ | прод+арен ✅ |

### API микросервис

FastAPI сервис на порту 8000 для интеграции с Telegram мини-аппом.

**Запуск:**
```bash
cd /root/karty-lab
source venv/bin/activate
xvfb-run --auto-servernum --server-args="-screen 0 1280x900x24" python3 run_api.py
```

**Документация:** `http://localhost:8000/docs`

### Ключевые исправления

1. **ss.ge cookies** — конвертация формата (expires, httpOnly, sameSite)
2. **ss.ge auth check** — проверка кнопки "Авторизация", не URL
3. **ss.ge yard_area** — Playwright fill для домов
4. **ss.ge price modal** — "Оставить как есть" для нестандартных цен
5. **ss.ge description** — запрет внешних ссылок в описании
6. **myhome.ge floors_total** — работает для всех типов
7. **myhome.ge commercial rooms** — обязательное поле
8. **korter.ge street** — ArrowDown+Enter для автокомплита
9. **korter.ge photos** — минимум 3 фото

### Структура для интеграции

```
api/              — FastAPI ( main.py, publisher.py, schemas.py, cookie_manager.py )
sites/            — Playwright логика ( ss_ge.py, myhome_ge.py, korter_ge.py )
cookies/          — Cookies по пользователям
run_api.py        — Запуск сервера
test_api_publish.py — Тест через API
README.md         — Документация
API_REFERENCE.txt — Справочник API
systemd/          — Автозапуск
```

### Бекапы

- `/root/karty-lab-backup-20260702_1853/` — полный бекап
- `/root/karty-lab/backup_20260702/` — бекап кодов
