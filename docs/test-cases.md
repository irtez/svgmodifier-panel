# Каталог сценариев поведения

Это постоянный каталог проверяемого поведения плагина. ID стабилен: он нужен для связи обсуждения, теста и изменения поведения. «Покрыт» означает ссылку на автоматический тест; «ожидает» означает, что сценарий принят в контракт, но тест ещё должен быть добавлен.

При изменении, добавлении, переносе или удалении сценария обновляйте эту запись и ссылку на тест в том же коммите. Не заменяйте фактическое ожидание ссылкой на реализацию: здесь описан вход и наблюдаемый результат.

## Конфигурация и SVG

| ID | Вход | Ожидаемое поведение | Проверка |
| --- | --- | --- | --- |
| C01 | Пустой текст; затем YAML с незакрытым массивом | Пустой конфиг имеет статус `empty`; синтаксическая ошибка — `invalid` с диагностикой | [parsers.test.ts](../src/components/infrastructure/config/parsers.test.ts) |
| C02 | `metrics` как объект и как массив | Обе формы принимаются и сохраняют query | [parsers.test.ts](../src/components/infrastructure/config/parsers.test.ts) |
| C03 | Значения query, metrics и defaults, включая `0` и `thresholds: []` | Приоритет: query → metrics → defaults; пустое и нулевое значение не заменяется truthy-fallback | [softPresentation.test.ts](../src/components/application/adapters/softPresentation.test.ts) |
| C04 | Несколько YAML-страниц, anchors до `changes` и aliases | Правила объединяются, aliases работают, source указывает страницу и правило | [parsers.test.ts](../src/components/infrastructure/config/parsers.test.ts) |
| C05 | Правило для отсутствующего точного SVG ID | `MISSING_ELEMENT` с source и без списка связанных IDs | [configSetup.test.ts](../src/components/infrastructure/config/configSetup.test.ts) |
| C06 | Корректный regex без совпадений | `UNMATCHED_PATTERN`; независимые правила сохраняются | [configSetup.test.ts](../src/components/infrastructure/config/configSetup.test.ts) |
| C07 | Синтаксически неверный regex | `INVALID_PATTERN`; подготовка соседних правил не падает | [configSetup.test.ts](../src/components/infrastructure/config/configSetup.test.ts) |
| C08 | Режим grid без SVG и неизвестный ID | Правило готовится, ошибки отсутствующего SVG нет | [configSetup.test.ts](../src/components/infrastructure/config/configSetup.test.ts) |
| C09 | Один query отсутствует для правила с несколькими SVG IDs | Структурированная диагностика содержит `source` (включая `refId`) и все известные `elementIds` | [softPresentation.test.ts](../src/components/application/adapters/softPresentation.test.ts) |
| C10 | Ошибка одной панели и успешное обновление другой | Диагностики обновляются и изолированы по панели | [usePanelData.test.ts](../src/components/application/hooks/usePanelData.test.ts) |

### Дополнительная форма конфигурации

| ID | Вход | Ожидаемое поведение | Проверка |
| --- | --- | --- | --- |
| C11 | `changes: []` | Валидный пустой набор правил без ошибки | [parsers.test.ts](../src/components/infrastructure/config/parsers.test.ts) |
| C12 | Одно malformed правило рядом с валидными | Есть warning; валидные правила остаются | [parsers.test.ts](../src/components/infrastructure/config/parsers.test.ts) |
| C13 | Неизвестный `calculation` | Есть warning, правило использует совместимый fallback | [parsers.test.ts](../src/components/infrastructure/config/parsers.test.ts) |
| C14 | Неизвестный оператор порога | Есть warning, остальные настройки правила доступны | [parsers.test.ts](../src/components/infrastructure/config/parsers.test.ts) |
| C15 | Незнакомый верхнеуровневый ключ | Объявление не делает документ невалидным | [parsers.test.ts](../src/components/infrastructure/config/parsers.test.ts) |
| C16 | Совместимый `parseYamlConfig` | Валидный YAML возвращает правила, пустой/сломанный — `null` | [parsers.test.ts](../src/components/infrastructure/config/parsers.test.ts) |
| C17 | Alias раскрывается чрезмерно | Возвращается `YAML_RESOLUTION_ERROR`, исключение не выходит наружу | [parsers.test.ts](../src/components/infrastructure/config/parsers.test.ts) |
| C18 | `null`/объект вместо массива в metric fragments | Warning локализуется; соседнее правило остаётся | [parsers.test.ts](../src/components/infrastructure/config/parsers.test.ts) |
| C19 | Непустой YAML без `changes` | `MISSING_CHANGES`; anchors-only страница допустима, если `changes` есть в другой | [parsers.test.ts](../src/components/infrastructure/config/parsers.test.ts) |
| C20 | Прямой `initializeConfig` с null query/threshold fragment | Некорректный fragment отбрасывается с diagnostic, валидные query остаются | [configSetup.test.ts](../src/components/infrastructure/config/configSetup.test.ts) |
| C21 | Selector `Infinity`, дробный, пустая граница или слишком большой диапазон | `INVALID_SELECTOR`; правило не раскрывается | [configSetup.test.ts](../src/components/infrastructure/config/configSetup.test.ts) |
| C22 | Filter с `$date` и `$date-1` | Парсер хранит токены до получения правой границы времени | [parsers.test.ts](../src/components/infrastructure/config/parsers.test.ts) |
| C23 | Схемы `table`, `stroke`, `strokeBase`, `text`, `basic` | Схема сохраняет своё оформление; tooltip отключается только там, где это предписано | [softPresentation.test.ts](../src/components/application/adapters/softPresentation.test.ts) |
| C24 | Некорректный filter у одного query и исправный соседний query | `INVALID_FILTER` локализуется, исправная метрика продолжает участвовать | [softPresentation.test.ts](../src/components/application/adapters/softPresentation.test.ts) |
| C25 | `@1`/`@2` selectors и отсутствующий первый query | Причина отсутствия привязана только к затронутому SVG-элементу | [softPresentation.test.ts](../src/components/application/adapters/softPresentation.test.ts) |
| C26 | Нестрочный `filling` и соседнее исправное правило | Есть `INVALID_FILLING`; DOM-операции не падают и соседнее оформление применяется | [softPresentation.test.ts](../src/components/application/adapters/softPresentation.test.ts) |
| C27 | Смешанные fields и tables в `autoConfig` | Сохраняется совместимое раздельное позиционное распределение fields и tables | [dataHandler.test.ts](../src/components/domain/services/dataHandler.test.ts) |
| C28 | В `autoConfig` полностью исчезает query | См. ограничение ниже: прежние тип и количество рядов не сохраняются, последующие позиции могут сдвинуться | [dataHandler.test.ts](../src/components/domain/services/dataHandler.test.ts) |
| C29 | Сломанный XML или корень не является SVG | Документ не передаётся в DOM; `initSVG` возвращает `null`, hook добавляет `INVALID_SVG` | [updater.test.ts](../src/components/infrastructure/svg/updater.test.ts) |

## Данные, расчёты и выбор winner

| ID | Вход | Ожидаемое поведение | Проверка |
| --- | --- | --- | --- |
| D01 | Конечное значение `0` | Ноль — полноценное числовое значение | [calculations.test.ts](../src/components/domain/utils/calculations.test.ts) |
| D02 | Пустой выбранный ряд | Нет выдуманного нуля; есть причина отсутствия | [calculations.test.ts](../src/components/domain/utils/calculations.test.ts) |
| D03 | Прямой `refid` отсутствует | Candidate не считается успешным, причина диагностируется | [dataHandler.test.ts](../src/components/domain/services/dataHandler.test.ts) |
| D04 | В формуле нет зависимости | Формула не подставляет `0`, сообщает зависимость | [calculations.test.ts](../src/components/domain/utils/calculations.test.ts) |
| D05 | `NaN`, Infinity или пропуск в ряду | Непригодное число не участвует в выборе | [calculations.test.ts](../src/components/domain/utils/calculations.test.ts) |
| D06 | `last([10, null])` | Последняя некорректная точка не заменяется предыдущей | [calculations.test.ts](../src/components/domain/utils/calculations.test.ts) |
| D07 | Доступная зелёная метрика и отсутствующая | Зелёный результат сохраняется, причина неполноты видна | [softPresentation.test.ts](../src/components/application/adapters/softPresentation.test.ts) |
| D08 | Доступная красная метрика и отсутствующая | Красный результат сохраняется, причина неполноты видна | [softPresentation.test.ts](../src/components/application/adapters/softPresentation.test.ts) |
| D09 | Все динамические расчёты недоступны | Серый no-data индикатор и объясняющий tooltip | [softPresentation.test.ts](../src/components/application/adapters/softPresentation.test.ts) |
| D10 | Только статическое правило | Нет искусственного no-data или серого цвета | [softPresentation.test.ts](../src/components/application/adapters/softPresentation.test.ts) |
| D11 | Число валидно, условие порога ошибочно | Число сохраняется; ошибочный порог не применяется | [calculations.test.ts](../src/components/domain/utils/calculations.test.ts) |
| D12 | Условие корректно возвращает `false` | Это не ошибка и не no-data | [calculations.test.ts](../src/components/domain/utils/calculations.test.ts) |
| D13 | Первый slot `autoConfig` не дал метрики, второй дал | Второй slot не сдвигается на первый элемент | [dataHandler.test.ts](../src/components/domain/services/dataHandler.test.ts) |
| D14 | Sum включает пустое поле | Неполная сумма не выдаётся за полную | [dataHandler.test.ts](../src/components/domain/services/dataHandler.test.ts) |
| D15 | Метрика получает datasource metadata | Имя datasource сохраняется в результате, конфигурация не мутируется | [dataHandler.test.ts](../src/components/domain/services/dataHandler.test.ts) |
| D16 | Read-only таблица и отсутствующий числовой индикатор в обоих порядках правил | Таблица остаётся читаемой, отсутствие числового winner явно отражено | [softPresentation.test.ts](../src/components/application/adapters/softPresentation.test.ts) |

| ID | Вход | Ожидаемое поведение | Проверка |
| --- | --- | --- | --- |
| L01 | Несколько совпавших порогов | Побеждает последний совпавший порог | [calculations.test.ts](../src/components/domain/utils/calculations.test.ts) |
| L02 | Нормальные диапазоны с разными границами | Корректно выбирается ожидаемый диапазон на каждой границе | [calculations.test.ts](../src/components/domain/utils/calculations.test.ts) |
| L03 | Порог с `lvl: 0` | Сохраняются авторский нулевой уровень и его цвет | [calculations.test.ts](../src/components/domain/utils/calculations.test.ts) |
| L04 | Порог без `lvl` | Используется уровень `index + 1` | [calculations.test.ts](../src/components/domain/utils/calculations.test.ts) |
| L05 | Равные уровни, разные значения и единицы | Первый candidate в порядке конфигурации стабильно выигрывает | [dataHandler.test.ts](../src/components/domain/services/dataHandler.test.ts) |
| L06 | Field/table с равным уровнем и значением `0`/`1` | Ноль не получает особого truthy-приоритета | [dataHandler.test.ts](../src/components/domain/services/dataHandler.test.ts) |
| L07 | Несколько правил одного элемента | Сначала уровень, затем стабильный порядок правил | [softPresentation.test.ts](../src/components/application/adapters/softPresentation.test.ts) |
| L08 | Зелёный результат с положительным уровнем | Авторский уровень не заменяется по цвету | [visibilityContract.test.ts](../src/components/application/adapters/visibilityContract.test.ts) |
| L09 | Порог с `lvl: 0` в grid/notify и таблица с более высоким уровнем | Отбор сохраняет уровни порогов; таблица видна в grid, но не включается в notify | [visibilityContract.test.ts](../src/components/application/adapters/visibilityContract.test.ts) |

## Таблицы и выражения

| ID | Вход | Ожидаемое поведение | Проверка |
| --- | --- | --- | --- |
| B01 | Критическая строка до нормальной | Уровень, цвет и число берутся из одной критической строки | [dataHandler.test.ts](../src/components/domain/services/dataHandler.test.ts) |
| B02 | Строки с равным уровнем | Выбирается первая строка | [dataHandler.test.ts](../src/components/domain/services/dataHandler.test.ts) |
| B03 | Две колонки без времени | Результат остаётся таблицей | [dataExtractor.test.ts](../src/components/infrastructure/data/dataExtractor.test.ts) |
| B04 | Временной ряд с несколькими числовыми полями | Сохраняются все выбранные числовые поля | [dataExtractor.test.ts](../src/components/infrastructure/data/dataExtractor.test.ts) |
| B05 | `errors_old` перед точным `errors` | Точное имя имеет приоритет | [dataHandler.test.ts](../src/components/domain/services/dataHandler.test.ts) |
| B06 | Нет точного имени, один префикс | Используется единственный префикс | [dataHandler.test.ts](../src/components/domain/services/dataHandler.test.ts) |
| B07 | Нет точного имени, несколько префиксов | Нет произвольного выбора; есть неоднозначность | [dataHandler.test.ts](../src/components/domain/services/dataHandler.test.ts) |
| B08 | Нет колонки или после фильтра нет строк | Есть диагностика, numeric winner не выдумывается | [dataHandler.test.ts](../src/components/domain/services/dataHandler.test.ts) |
| B09 | Table value mapping и форматирование | Raw number отделён от display value | [dataHandler.test.ts](../src/components/domain/services/dataHandler.test.ts) |
| B10 | Read-only таблица без `thresholdKey` | Не появляется фиктивный нулевой winner | [dataHandler.test.ts](../src/components/domain/services/dataHandler.test.ts) |
| E01 | Формула `0.004 * 1000` | Результат `4`; округление только для UI | [calculations.test.ts](../src/components/domain/utils/calculations.test.ts) |
| E02 | Формула с отсутствующей зависимостью | Причина диагностируется, ноль не подставляется | [calculations.test.ts](../src/components/domain/utils/calculations.test.ts) |
| E03 | Условие возвращает функцию, строку или число | Возвращается ошибка типа результата | [calculations.test.ts](../src/components/domain/utils/calculations.test.ts) |
| E04 | Необычное, но корректное сравнение | Вычисляется как написано, намерение не угадывается | [calculations.test.ts](../src/components/domain/utils/calculations.test.ts) |

## Время, tooltip, SVG и обновления

| ID | Вход | Ожидаемое поведение | Проверка |
| --- | --- | --- | --- |
| T01 | Исторический просмотр | Условие использует правую границу панели | [calculations.test.ts](../src/components/domain/utils/calculations.test.ts) |
| T02 | UTC и timezone дают разные календарные дни | Час и день вычисляются в одном смещении | [calculations.test.ts](../src/components/domain/utils/calculations.test.ts) |
| T03 | Обычный диапазон `now-3h → now` | Условие порога вычисляется по фиксированной правой границе | [calculations.test.ts](../src/components/domain/utils/calculations.test.ts) |
| T04 | Правая граница сдвинута на `now-3h` | Условие порога использует сдвинутую границу ровно один раз | [calculations.test.ts](../src/components/domain/utils/calculations.test.ts) |
| T05 | `$date` в live-диапазоне | Берётся UTC-день правой границы | [timeContract.test.ts](../src/components/domain/services/timeContract.test.ts) |
| T06 | Live-диапазон пересекает UTC-полночь | Берётся день правой границы, не весь диапазон | [parsers.test.ts](../src/components/infrastructure/config/parsers.test.ts) |
| T07 | `$date`/`$date-1` в истории | Отсчёт идёт от UTC-дня правой границы | [parsers.test.ts](../src/components/infrastructure/config/parsers.test.ts) |
| T08 | Два обновления по разные стороны полуночи | Дата разрешается заново без изменения YAML | [parsers.test.ts](../src/components/infrastructure/config/parsers.test.ts) |
| T09 | Исторический диапазон при изменении реальных часов | Фильтр неизменен для фиксированной правой границы | [timeContract.test.ts](../src/components/domain/services/timeContract.test.ts) |
| T10 | `$date-1` на границе месяца/года | UTC-календарь одинаков для timezone браузера | [parsers.test.ts](../src/components/infrastructure/config/parsers.test.ts) |
| U01 | Все метрики отсутствуют, tooltip разрешён | Tooltip показывает объяснение и причины | [softPresentation.test.ts](../src/components/application/adapters/softPresentation.test.ts) |
| U02 | Tooltip отключён явно или схемой | Tooltip не включается автоматически | [softPresentation.test.ts](../src/components/application/adapters/softPresentation.test.ts) |
| U03 | No-data при `textAbove`/`textBelow` | Авторский текст остаётся, добавляется пояснение | [softPresentation.test.ts](../src/components/application/adapters/softPresentation.test.ts) |
| U04 | `hideZeros`, нулевая строка и диагностическое сообщение | Ноль скрывается только в представлении; сообщение остаётся, исходный результат не мутирует | [tooltip.test.tsx](../src/components/presentation/tooltips/svgTooltip/tooltip.test.tsx) |
| U05 | Tooltip: данные → пусто → данные | Hover и закреплённая подсказка всегда показывают актуальное содержимое | [tooltip.test.tsx](../src/components/presentation/tooltips/svgTooltip/tooltip.test.tsx) |
| U06 | `stroke`, `strokeBase`, `none`, `:table` | Значение каждого режима оформления сохраняется | [updater.test.ts](../src/components/infrastructure/svg/updater.test.ts) |
| U07 | Fill/stroke включён, затем снят | Старое динамическое оформление восстанавливается | [updater.test.ts](../src/components/infrastructure/svg/updater.test.ts) |
| U08 | Inline style и изначально отсутствующий атрибут | Несвязанный style и исходное отсутствие сохраняются | [updater.test.ts](../src/components/infrastructure/svg/updater.test.ts) |
| U09 | Подпись или ссылка изменена/удалена | Текущее значение обновляется либо восстанавливается | [operations.test.ts](../src/components/infrastructure/svg/operations.test.ts) |
| U10 | Позднее правило победило в grid | Grid получает цвет окончательного winner | [panelPresentation.test.ts](../src/components/application/adapters/panelPresentation.test.ts) |
| U11 | Таблица или diagnostic перед числовым правилом | Числовое правило остаётся видимым в tooltip | [softPresentation.test.ts](../src/components/application/adapters/softPresentation.test.ts) |
| U12 | Очищается неактивный вложенный SVG ID | Очистка не отменяет текущую окраску родительской группы | [softPresentation.test.ts](../src/components/application/adapters/softPresentation.test.ts) |
| G01 | Старый запрос завершился после нового | Запоздалый результат отвергается | [usePanelData.test.ts](../src/components/application/hooks/usePanelData.test.ts) |
| G02 | Успех → loading → ошибка | Старый успех не публикуется как актуальный | [usePanelData.test.ts](../src/components/application/hooks/usePanelData.test.ts) |
| G03 | Конфиг/диапазон меняется во время обработки | Публикуется только актуальное обновление | [usePanelData.test.ts](../src/components/application/hooks/usePanelData.test.ts) |

## Известное ограничение C28

`autoConfig` распределяет fields и tables по позициям независимо друг от друга, как и раньше. Если query исчезает целиком, обработка не хранит прежние тип и количество его рядов: последующие назначения могут сдвинуться. Это возможно как для многорядного query, так и для одного поля среди смешанных fields/tables. Если поле остаётся в ответе, но его значения пусты или ошибочны, его место сохраняется. Явные selectors привязываются к текущему порядку query и не являются постоянными идентификаторами series. C28 — тест известного ограничения, а не утверждение, что проблема исправлена. Сохранение распределения между обновлениями требует отдельного решения.
