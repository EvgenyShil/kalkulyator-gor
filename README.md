# Калькулятор Шерегеша

Калькулятор бюджета горнолыжной поездки Москва → Новокузнецк → Шерегеш.
Прод: https://kalkulyator-sheregesha.vercel.app (Vercel, проект `kalkulyator-sheregesha`).

## Структура
- `index.html` — вся страница (HTML + CSS + JS, без сборки).
- `api/prices.js` — Vercel Function. Прокси к ленте цен Aviasales
  (`tickets-api.aviasales.ru/search/prices/ribbon`): прямые рейсы SU и S7,
  туда-обратно 7–10 дней, окна 20.11–31.12 и 25.01–28.02, 1 взрослый, тариф без багажа.
  Ответ: `{ prices: [{group, depart, ret, days, su, s7}], fetchedAt }`. Без кэша.
- `api/saves.js` — Vercel Function. Общие сохранённые расчёты в Vercel Blob
  (`saves/*.json`, public). GET — список, POST — сохранить, DELETE `?id=` — удалить.
- `vercel.json`, `package.json` — конфиг; зависимость `@vercel/blob@2.8.0`.

## Окружение
Нужна переменная `BLOB_READ_WRITE_TOKEN` (уже подключена к проекту через
Blob store `kalkulyator-sheregesha-blob`). Для локального запуска:
```
npm i
vercel link && vercel env pull
vercel dev
```

## Деплой
```
vercel --prod
```

## Логика расчёта (в index.html)
- Доплата за багаж: Аэрофлот Оптимум +7 650, S7 Стандарт +11 360 (или лыжи отдельно 2×4 550).
- В таблице цен крупно — цена с багажом, мелко — без багажа.
- «Проверить цены» подставляет самый дешёвый вариант с багажом (авиакомпания, цена,
  ночи, дни катания = дней − 1, дни еды).
- Фрирайд: акция «каждый 4-й день бесплатно».
- Отель вводится суммой за весь срок (не за ночь).
