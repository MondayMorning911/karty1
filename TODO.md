# Тестирование публикации объявлений

Тестовый пользователь: `test_user`.

По коду `sites/*.py` поле сделки для коммерции не объединено: используются
отдельные значения `sale` и `rent` (`korter_ge.py:143-145`,
`myhome_ge.py:183-188`, `ss_ge.py:227-228`). Поэтому коммерция проверяется
отдельно для аренды и продажи.

Статусы:

- Публикация: `не начато`, `в работе`, `успех подтверждён`, `ложный успех`, `ошибка`, `пропущено: куки протухли`
- Верификация: `не проверено`, `подтверждено`, `не подтверждено`
- Удаление: `не начато`, `успех подтверждён`, `ошибка`, `баг API удаления`, `не применимо`

## Матрица

| Сайт | Категория | Сделка | Статус публикации | Ссылка на объявление | Скриншот | Статус верификации | Статус удаления | Примечание |
|---|---|---|---|---|---|---|---|---|
| korter.ge | квартира | аренда | успех подтверждён | [812893](https://korter.ge/ru/аренда-квартир-тбилиси/812893) | `screenshots/test-publication/korter_apartment_rent_verify.png` | подтверждено | успех подтверждён вручную | API удаления вернул внутренний `success:false`; маркер нормализован сайтом, карточка/сделка/категория совпали |
| korter.ge | квартира | продажа | успех подтверждён | [799761](https://korter.ge/ru/продажа-квартир-тбилиси/799761) | `screenshots/test-publication/korter_retry6_listing.png` | подтверждено | успех подтверждён вручную | API удаления не удалил; после ручного удаления URL вернул HTTP 410 |
| korter.ge | дом | аренда | успех подтверждён | [812899](https://korter.ge/ru/аренда-домов-тбилиси/812899) | `screenshots/test-publication/korter_house_rent_verify.png` | подтверждено | успех подтверждён вручную | API удаления не удалил |
| korter.ge | дом | продажа | успех подтверждён | [812906](https://korter.ge/ru/продажа-домов-тбилиси/812906) | `screenshots/test-publication/korter_house_sale_verify.png` | подтверждено | успех подтверждён вручную | API удаления не удалил |
| korter.ge | земля | аренда | ошибка | — | `screenshots/korter_ge_1785647493.png` | не подтверждено | не применимо | В форме korter нет варианта «Участок» после выбора долгосрочной аренды; publisher получил `Option 'Участок' not found` и не получил URL |
| korter.ge | земля | продажа | успех подтверждён | [812913](https://korter.ge/ru/продажа-участков-тбилиси/812913) | `screenshots/test-publication/korter_land_sale_verify.png` | подтверждено | успех подтверждён вручную | API удаления не удалил |
| korter.ge | коммерция | аренда | успех подтверждён | [812921](https://korter.ge/ru/аренда-коммерческой-недвижимости-тбилиси/812921) | `screenshots/test-publication/korter_commercial_rent_verify.png` | подтверждено | успех подтверждён вручную | API вернул общий success, но карточка была удалена вручную |
| korter.ge | коммерция | продажа | успех подтверждён | [812926](https://korter.ge/ru/продажа-коммерческой-недвижимости-тбилиси/812926) | `screenshots/test-publication/korter_commercial_sale_verify.png` | подтверждено | успех подтверждён вручную | API удаления не удалил |
| myhome.ge | квартира | аренда | успех подтверждён | [25642232](https://www.myhome.ge/pr/25642232/sdaetsia-2-komnatnaia-kvartira-v-sof-digomi) | `screenshots/test-publication/myhome_apartment_rent_direct_verify.png` | баг API удаления | Direct URL HTTP 200, ID/карточка подтверждены; после удаления из dashboard публичная страница всё ещё доступна |
| myhome.ge | квартира | продажа | успех подтверждён | [25642292](https://www.myhome.ge/pr/25642292/prodaetsia-2-komnatnaia-kvartira-v-sof-digomi) | `screenshots/test-publication/myhome_25642292_direct_verify.png` | подтверждено | не подтверждено: Cloudflare | Direct URL HTTP 200 и ID карточки подтверждены до последующего Cloudflare challenge |
| myhome.ge | дом | аренда | успех подтверждён | [25642234](https://www.myhome.ge/pr/25642234/sdaetsia-4-komnatnaia-castnyi-dom-v-sof-digomi) | `screenshots/test-publication/myhome_house_rent_direct_verify.png` | подтверждено | баг API удаления | Direct URL HTTP 200, ID/карточка подтверждены; публичная страница осталась после удаления из dashboard |
| myhome.ge | дом | продажа | успех подтверждён | [25642236](https://www.myhome.ge/pr/25642236/prodaetsia-5-komnatnaia-castnyi-dom-v-sof-digomi) | `screenshots/test-publication/myhome_house_sale_direct_verify.png` | подтверждено | баг API удаления | Direct URL HTTP 200, ID/карточка подтверждены; публичная страница осталась после удаления из dashboard |
| myhome.ge | земля | аренда | успех подтверждён | [25642241](https://www.myhome.ge/pr/25642241/v-arendu-selskoxoziaistvenn-zemelnyi-ucastok-v-sof-digomi) | `screenshots/test-publication/myhome_land_rent_direct_verify.png` | подтверждено | баг API удаления | Direct URL HTTP 200, ID/карточка подтверждены; публичная страница осталась после удаления из dashboard |
| myhome.ge | земля | продажа | успех подтверждён | [25642245](https://www.myhome.ge/pr/25642245/prodaetsia-selskoxoziaistvenn-zemelnyi-ucastok-v-sof-digomi) | `screenshots/test-publication/myhome_land_sale_direct_verify.png` | подтверждено | баг API удаления | Direct URL HTTP 200, ID/карточка подтверждены; публичная страница осталась после удаления из dashboard |
| myhome.ge | коммерция | аренда | успех подтверждён | [25642248](https://www.myhome.ge/pr/25642248/sdaetsia-specialnoe-kommerceskaia-ploshhad-v-sof-digomi) | `screenshots/test-publication/myhome_commercial_rent_direct_verify.png` | подтверждено | баг API удаления | Direct URL HTTP 200, ID/карточка подтверждены; публичная страница осталась после удаления из dashboard |
| myhome.ge | коммерция | продажа | успех подтверждён | [25642295](https://www.myhome.ge/pr/25642295/prodaetsia-specialnoe-kommerceskaia-ploshhad-v-sof-digomi) | `screenshots/test-publication/myhome_25642295_direct_verify.png` | подтверждено | не подтверждено: Cloudflare | Direct URL HTTP 200 и ID карточки подтверждены до последующего Cloudflare challenge |
| ss.ge | квартира | продажа | успех подтверждён | [36327664](https://home.ss.ge/ru/недвижимость/36327664) | — | подтверждено | успех подтверждён | Публикация прошла, дашборд подтвердил активность, удаление через API + верификация: страница показывает "заявка устарела" |
| ss.ge | квартира | аренда | ложный успех → архив | [36327684](https://home.ss.ge/ru/недвижимость/36327684) | — | архив | не применимо | API вернул success, но "номер телефона уже используется" → мгновенный архив |
| ss.ge | дом | продажа | ложный успех → архив | [36327697](https://home.ss.ge/ru/недвижимость/36327697) | — | архив | не применимо | API вернул success, но "номер телефона уже используется" → мгновенный архив |
| ss.ge | дом | аренда | ложный успех → архив | [36327710](https://home.ss.ge/ru/недвижимость/36327710) | — | архив | не применимо | API вернул success, но "номер телефона уже используется" → мгновенный архив |
| ss.ge | земля | продажа | ложный успех → архив | [36327721](https://home.ss.ge/ru/недвижимость/36327721) | — | архив | не применимо | API вернул success, но "номер телефона уже используется" → мгновенный архив |
| ss.ge | земля | аренда | ложный успех → архив | [36327734](https://home.ss.ge/ru/недвижимость/36327734) | — | архив | не применимо | API вернул success, но "номер телефона уже используется" → мгновенный архив |
| ss.ge | коммерция | продажа | ошибка | — | — | не проверено | не применимо | Publisher не нашёл кнопку публикации в форме коммерции |
| ss.ge | коммерция | аренда | ошибка | — | — | не проверено | не применимо | Publisher не нашёл кнопку публикации в форме коммерции |

## Свежие cookies

Проверять перед запуском каждого сайта. Использовать только самый новый файл
сессии по времени изменения. Для `korter.ge` приоритетен самый новый
`*_state.json`, затем обычный cookie-файл как fallback.

| Сайт | Выбранный файл | Время изменения | Состояние |
|---|---|---|---|
| korter.ge | `cookies/test_user/korter_ge_state.json` | `2026-07-26 13:51:18` | auth подтверждён, HTTP 200 |
| myhome.ge | `cookies/test_user/myhome_ge_state.json` | текущий запуск | login прошёл, затем сайт включил HTTP 403 Cloudflare challenge |
| ss.ge | `cookies/test_user/ss_ge_state.json` | текущий запуск | login прошёл (558388481 / BadAss911), авторизация подтверждена, публикация создала объявление но оно сразу в архиве |

## Требуют свежих cookies

Для `ss.ge` нужны корректные credentials или свежие cookies. Для `myhome.ge` cookies были обновлены login-flow, но сайт временно заблокировал автоматические запросы Cloudflare.

## Ложные успехи

`korter.ge`: publisher/API вернули успешный результат с URL dashboard, а не прямой URL объекта. Фактическая карточка и прямой URL были найдены отдельно через dashboard; это зафиксировано как дефект контракта publisher, не как подтверждённый успех API.

## Баги удаления

`korter.ge`: `/api/listings/delete` возвращает HTTP 200 и общий `success:true`, но внутренний результат `success:false`; до ручного удаления объявление оставалось доступно. В `api/main.py` исправлена передача `listing_url`, но `_delete_listing` korter всё равно не находит кнопку удаления на публичном URL.

`myhome.ge`: API удаления возвращал success, карточки исчезли из dashboard, но публичные URLs шести тестовых объявлений продолжают возвращать HTTP 200 и содержат IDs. Требуется ручная проверка/удаление владельцем.

После исправления перехода с `Unpaid` на `Active` API удаления вернул success для новых карточек `25642292` и `25642295`; dashboard после headed-проверки показал `Active 0`. Публичную проверку старых URLs в момент автоматического запроса блокировал Cloudflare.

## Итог

`korter.ge` завершён: 7 подтверждённых публикаций, 1 ошибка из-за отсутствия аренды земли в форме. Все карточки убраны из dashboard и проверены после ручного удаления HTTP 410.

`myhome.ge`: все 8 публикаций были подтверждены через реальные карточки и direct URLs. Для первых шести удаление не подтверждено публичным URL; для двух последних финальная проверка заблокирована Cloudflare.

`ss.ge`: login работает с credentials `558388481` / `BadAss911`. Авторизация подтверждена — на странице создания отображается имя "Даниэль", PIN 9458836.

**Ограничение аккаунта**: ss.ge разрешает только **одно активное объявление** на номер телефона. Первая публикация (apartment sale, 36327664) прошла успешно — дашборд подтвердил активность, удаление через API подтверждено (страница показывает "заявка устарела"). Все последующие публикации (7 шт) создают черновик, но сайт возвращает ошибку "номер телефона уже используется" и мгновенно архивирует объявление. Объявления не отображаются ни на одной вкладке дашборда.

**Коммерция**: publisher не находит кнопку публикации для типа "commercial" — форма отличается от apartment/house.

**Исправления**: `api/main.py` endpoint удаления теперь использует `headless=False`, `locale="ru-RU"`, chrome-флаги идентичные publisher.

Для полноценного тестирования 8 категорий на ss.ge нужен аккаунт без ограничения на количество активных объявлений, либо разные номера телефонов.

После повторной авторизации myhome два ранее пропущенных теста (`25642292`, `25642295`) подтверждены через direct URLs.

Первичная попытка `republish` myhome создала форму без direct URL и оставила карточку в `Unpaid` (`25642328`); карточка удалена вручную. После исправлений mapping и publisher выполнена успешная повторная попытка ниже.

После исправления publisher повторный republish прошёл с direct URLs:

- исходный объект: [25642347](https://www.myhome.ge/pr/25642347/prodaetsia-2-komnatnaia-kvartira-v-sof-digomi)
- republished объект: [25642353](https://www.myhome.ge/pr/25642353/prodaetsia-2-komnatnaia-kvartira-v-sof-digomi)

Оба direct URL были подтверждены HTTP 200 и ID карточки. Dashboard после cleanup не содержит эти IDs, но публичная проверка после удаления получила HTTP 403 Cloudflare, поэтому окончательное удаление по публичному URL не подтверждено.

Исправления во время теста:

- `sites/korter_ge.py`: точный выбор города, устойчивый клик очистки/city input.
- `sites/base.py`: подключён существующий `_handle_map_pin()` для korter.
- `api/publisher.py`: задана локаль `ru-RU` для API-контекстов.
- `api/main.py`: endpoint удаления теперь передаёт `listing_url` в `_delete_listing`.
- `sites/myhome_ge.py`: удаление больше не переключается принудительно на вкладку `Unpaid`; тестовые объявления ищутся в `Active`.
- `sites/myhome_ge.py`: после `status/success`/оплаты direct URL извлекается из dashboard, вместо возврата ложного status URL.
- `api/main.py`: `republish` теперь передаёт платформу в формате publisher (`myhome_ge`) и возвращает фактический результат сайта.
- `api/main.py`: endpoint удаления исправлен — `headless=False`, `locale="ru-RU"`, chrome-флаги как в publisher.
- ss.ge login: credentials `558388481` / `BadAss911` работают; авторизация подтверждена.
