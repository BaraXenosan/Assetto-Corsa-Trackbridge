# TrackWriter — проверка записи существующего уровня

Использует UAssetAPI 1.1.0 и runtime-схему текущей F1 Manager 2024 (UE5.1). Вход — legacy `.umap` и соседний `.uexp`, извлечённые retoc. Исходные файлы не перезаписываются.

```powershell
dotnet build .\TrackWriter.csproj
dotnet .\bin\Debug\net10.0\TrackWriter.dll INPUT.umap MAPPINGS.usmap NEW_OUTPUT_DIRECTORY
```

Перед записью требуется успешная побайтовая проверка `VerifyBinaryEquality()`. Существующий выходной каталог отвергается. Результат — `.umap`, `.uexp`, `writer-report.json`; после записи файл повторно читается.

Флаг `--probe-speed` создаёт **только исследовательскую копию**: уменьшает `m_trackNodes[0].m_maxSpeed` на единицу. Он нужен для независимого подтверждения цепочки UAssetAPI → retoc → CUE4Parse. Это не адаптер Kalinago и не готовый мод.

Для `retoc to-zen` сохраните виртуальную структуру `F1Manager24/Content/Circuits/Bahrain/Lvl_Bahrain.umap` и `scriptobjects.bin`, полученный при `to-legacy`. Затем читайте контейнер через TrackProbe с `--overlay` вместе с оригинальными зависимостями. Отдельный контейнер без зависимостей не доказывает корректность чтения.

Новые модели/коллизии не cook-ятся этим инструментом. Успешная запись и чтение не заменяют запуск игры. `installable: false`.
