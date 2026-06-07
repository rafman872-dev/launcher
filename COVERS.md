Добавление обложек (covers)

Этот проект - статический сайт на GitHub Pages. Чтобы не хранить API-ключи в клиенте, рекомендую скачивать обложки локально и добавлять их в репозиторий.

Скрипт: scripts/fetch_covers.js

Поддерживает провайдеры:
- steam (по умолчанию, не требует ключа)
- rawg (требует RAWG_KEY в окружении)
- igdb (требует IGDB_CLIENT_ID и IGDB_CLIENT_SECRET в окружении)

Примеры:

1) Steam (быстро, без ключей):
   PROVIDER=steam node scripts/fetch_covers.js

2) RAWG (нужен API-ключ):
   PROVIDER=rawg RAWG_KEY=your_key node scripts/fetch_covers.js

3) IGDB (нужны креденшелы Twitch):
   PROVIDER=igdb IGDB_CLIENT_ID=... IGDB_CLIENT_SECRET=... node scripts/fetch_covers.js

Опции:
  --dry-run  : не скачивает файлы, но покажет, что будет сделано
  --force    : перезаписать существующие cover поля

После выполнения скрипта в games.json появится поле "cover": "covers/slug.jpg" и в репозитории появится папка covers/ с изображениями. Закоммитьте эти изменения, чтобы картинки стали доступны на GitHub Pages.

Если нужно, могу настроить GitHub Action, который будет обновлять обложки автоматически (требует хранение секретов в GitHub Secrets).