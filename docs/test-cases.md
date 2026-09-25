# Каталог сценариев поведения

## Компактный capture v2

| ID | Вход | Ожидаемое поведение | Проверка |
| --- | --- | --- | --- |
| V01 | HEX, RGB/RGBA, CSS names, transparent | Точные каналы и alpha; none/gradient/invalid не становятся чёрным | [colors.test.ts](../src/components/capture/colors.test.ts) |
| V02 | Relative/base/subpath, public origin, duplicate query parameters | Разбирается только доказанное назначение этой Grafana, URL не переписывается и не открывается | [links.test.ts](../src/components/capture/links.test.ts) |
| V03 | Чужой origin, unsafe scheme, credentials, malformed UID, duplicate panelId | Сохраняется непрозрачное назначение либо неопределённый panelId; нет произвольного выбора | [links.test.ts](../src/components/capture/links.test.ts) |
| V04 | Compact payload с precision/zero/missing и static objects | Schema v2 принимает факты, не требует legacy diagram/config | [contractV2.test.ts](../src/components/capture/contractV2.test.ts) |
| V05 | Dangling/duplicate IDs, invalid winner, cycles, conflicting availability | Нарушение ссылочной целостности или состояния отклоняется | [contractV2.test.ts](../src/components/capture/contractV2.test.ts) |
| V06 | NaN/Infinity/undefined, wrong version, legacy fields, invalid RGBA | Ответ не проходит JSON/schema/state validation | [contractV2.test.ts](../src/components/capture/contractV2.test.ts) |
| V07 | UTF-8 exact byte boundary и другой panel ID | Равенство лимиту допустимо, превышение и чужая identity отклоняются | [contractV2.test.ts](../src/components/capture/contractV2.test.ts) |

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
| C28 | В `autoConfig` полностью исчезает многорядный query | Оставшиеся результаты уплотняются с первого индикатора, прежние позиции не резервируются | [dataHandler.test.ts](../src/components/domain/services/dataHandler.test.ts) |
| C29 | Сломанный XML или корень не является SVG | Документ не передаётся в DOM; `initSVG` возвращает `null`, hook добавляет `INVALID_SVG` | [updater.test.ts](../src/components/infrastructure/svg/updater.test.ts) |
| C30 | Первый query `autoConfig` отсутствует либо его поле пустое/непригодное; следующие дают 95 и 10 | Результаты занимают первые два индикатора (красный, зелёный), третий серый. Причина отсутствия остаётся общей, не приписывается соседней метрике | [autoConfig.test.ts](../src/components/domain/services/autoConfig.test.ts) |
| C31 | В `autoConfig` нет доступных результатов, есть ошибки запроса/расчёта | Все индикаторы серые с разрешённым tooltip «Нет данных»; полные причины сохраняются в общей диагностике без выдуманной привязки | [autoConfig.test.ts](../src/components/domain/services/autoConfig.test.ts) |
| C32 | Число доступно, но условие порога ошибочно | Результат занимает обычное место в `autoConfig`; ошибка условия относится к этому индикатору, а не к соседним | [autoConfig.test.ts](../src/components/domain/services/autoConfig.test.ts) |
| C33 | Явный `@1` рядом с `autoConfig`, первый query отсутствует | Явно привязанный элемент серый с причиной; остальные индикаторы заполняются доступными результатами по порядку | [autoConfig.test.ts](../src/components/domain/services/autoConfig.test.ts) |
| C34 | Четыре доступных результата на два индикатора `autoConfig` | Первый получает один результат, последний — остальные три, их общий tooltip и цвет победителя; соседний статический элемент не меняется | [autoConfig.test.ts](../src/components/domain/services/autoConfig.test.ts) |
| C35 | Один query содержит `refid`, `legend`, `sum`; выборки дают 10+20 и 3+7 | Два результата 30 и 10 с общей подписью sum и номером query, обе строки в tooltip; порог 35 не срабатывает на выдуманную общую сумму 40 | [querySelections.test.ts](../src/components/domain/services/querySelections.test.ts) |
| C36 | `refid` и `legend` выбирают одни и те же ряды с суммой 30 | Сохраняются две независимые суммы 30 и 30, а не единый результат 60 | [querySelections.test.ts](../src/components/domain/services/querySelections.test.ts) |
| C37 | `refid` и `legend` записаны в отдельных queries, у каждого свой sum | Сохраняются отдельные суммы, подписи и номера queries | [querySelections.test.ts](../src/components/domain/services/querySelections.test.ts) |
| C38 | Оба ключа в одном query без sum | Ряды остаются отдельными результатами в прежнем порядке: сначала refid, затем legend | [querySelections.test.ts](../src/components/domain/services/querySelections.test.ts) |
| C39 | Две суммы одного query используются с selector или autoConfig | Selector выбирает обе суммы по общему номеру query; autoConfig раскладывает их как два доступных результата | [querySelections.test.ts](../src/components/domain/services/querySelections.test.ts) |

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
| D13 | Первый query `autoConfig` не дал метрики, второй дал | Доступная метрика занимает первый индикатор; пропуск не резервирует место | [dataHandler.test.ts](../src/components/domain/services/dataHandler.test.ts) |
| D14 | Sum включает пустое поле | Неполная сумма не выдаётся за полную | [dataHandler.test.ts](../src/components/domain/services/dataHandler.test.ts) |
| D15 | Метрика получает datasource metadata | Имя datasource сохраняется в результате, конфигурация не мутируется | [dataHandler.test.ts](../src/components/domain/services/dataHandler.test.ts) |
| D16 | Read-only таблица и отсутствующий числовой индикатор в обоих порядках правил | Таблица остаётся читаемой, отсутствие числового winner явно отражено | [softPresentation.test.ts](../src/components/application/adapters/softPresentation.test.ts) |
| D17 | В одной из двух выборок query с refid/legend/sum есть пустое поле | Неполная сумма исключается целиком, доступная соседняя сохраняется; источник ошибки указывает конкретные refid и поле | [querySelections.test.ts](../src/components/domain/services/querySelections.test.ts) |
| D18 | В query с refid/legend/sum отсутствует refid, но есть совпадения legend | Сумма legend сохраняется, отсутствующий refid возвращает MISSING_INPUT вместо нуля | [querySelections.test.ts](../src/components/domain/services/querySelections.test.ts) |
| D19 | В query с refid/legend/sum нет совпадений legend, но refid доступен | Сумма refid сохраняется; пустая выборка legend возвращает EMPTY_INPUT и не создаёт ноль | [querySelections.test.ts](../src/components/domain/services/querySelections.test.ts) |
| D20 | Первая из двух сумм переполняет конечное число | Некорректный результат исключается с NON_FINITE_VALUE, вторая сумма остаётся доступной | [querySelections.test.ts](../src/components/domain/services/querySelections.test.ts) |

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
| E05 | Две выборки дают 0.004+0.005 и настоящий ноль | Raw-суммы сохраняют 0.009 и 0; округление первой до 0.01 применяется только к display value | [querySelections.test.ts](../src/components/domain/services/querySelections.test.ts) |

## Предупреждения об отсутствии данных

[Настройка и примеры YAML](no-data-warnings.md). Флаг влияет только на tooltip;
числа, winner, цвет и полный JSON не фильтруются. Actual null теперь даёт no-data
вместо ошибки нечислового результата; алгоритмы агрегирования сохранены.

| ID | Вход | Ожидаемое поведение | Проверка |
| --- | --- | --- | --- |
| N01 | `[10, null]` и `[10, undefined]` для total/min/max/last/delta | Нет частичного результата; `MISSING_VALUE`, warning | [noDataInputs.test.ts](../src/components/domain/services/noDataInputs.test.ts) |
| N02 | Строки `null`, пустая, `abc`, числа NaN/±Infinity | `NON_FINITE_VALUE`, не заглушаемый no-data | [noDataInputs.test.ts](../src/components/domain/services/noDataInputs.test.ts) |
| N03 | Null и NaN среди нужных точек total/min/max | Ошибка числа важнее пропуска | [noDataInputs.test.ts](../src/components/domain/services/noDataInputs.test.ts) |
| N04 | Last `[null,10]`, delta `[10,null,20]`, count `[null,null]`, last `[0]` | Результаты 10, 10, 2, 0; нет ложных предупреждений | [noDataInputs.test.ts](../src/components/domain/services/noDataInputs.test.ts) |
| N05 | Переполнение суммы и пустой ряд | Переполнение — ошибка; пустой ряд — `EMPTY_INPUT` | [noDataInputs.test.ts](../src/components/domain/services/noDataInputs.test.ts) |
| N06 | Table: null, строка `null`, 10 | Пропуск и ошибка различаются; строки читаемы, winner=10 | [noDataInputs.test.ts](../src/components/domain/services/noDataInputs.test.ts) |
| N07 | Временной срез оставляет только null | Нет подмены предыдущей точкой; `MISSING_VALUE` | [noDataInputs.test.ts](../src/components/domain/services/noDataInputs.test.ts) |
| N08 | Корректная формула/условие без нужного входа | No-data warning, ноль не подставляется | [noDataInputs.test.ts](../src/components/domain/services/noDataInputs.test.ts) |
| N09 | `$MISSING +`, `$MISSING >`, strict-invalid `$MISSING + 010` | Отсутствие входа не скрывает синтаксическую ошибку; режим проверки совпадает с выполнением | [noDataInputs.test.ts](../src/components/domain/services/noDataInputs.test.ts) |
| N10 | Все запросы отсутствуют; flag отсутствует/false/true | Серый и общий no-data остаются всегда; true скрывает детали только в UI | [noDataWarnings.test.ts](../src/components/application/adapters/noDataWarnings.test.ts) |
| N11 | A=95, B=null, C=`abc`, flag=true | Красный по A; B скрыт, ошибка C остаётся; API сохраняет обе причины | [noDataWarnings.test.ts](../src/components/application/adapters/noDataWarnings.test.ts) |
| N12 | Два правила одного элемента, разные flag | Скрываются только предупреждения своего правила | [noDataWarnings.test.ts](../src/components/application/adapters/noDataWarnings.test.ts) |
| N13 | Flag — строки `true`/`false` или число 1 | Предупреждения не скрываются; есть `INVALID_TOOLTIP_SETTING` | [noDataWarnings.test.ts](../src/components/application/adapters/noDataWarnings.test.ts) |
| N14 | Query timeout и отсутствие результата | Один timeout в tooltip при обоих flag; обе записи в полном результате | [noDataWarnings.test.ts](../src/components/application/adapters/noDataWarnings.test.ts) |
| N15 | G → F → A, у A timeout | В tooltip первичная ошибка A, не каскад производных no-data | [noDataWarnings.test.ts](../src/components/application/adapters/noDataWarnings.test.ts) |
| N16 | Корректная и сломанная формулы без входов, flag=true | No-data скрыт; синтаксическая ошибка видна | [noDataWarnings.test.ts](../src/components/application/adapters/noDataWarnings.test.ts) |
| N17 | Один отказ используется повторно | Tooltip не дублирует одно и то же сообщение | [noDataWarnings.test.ts](../src/components/application/adapters/noDataWarnings.test.ts) |
| N18 | Неверный filter и неизвестный calculation | Ошибки настроек не заглушаются | [noDataWarnings.test.ts](../src/components/application/adapters/noDataWarnings.test.ts) |
| N19 | AutoConfig: A пропал, B занял его индикатор | Ошибка A остаётся общей, не приписывается B | [noDataWarnings.test.ts](../src/components/application/adapters/noDataWarnings.test.ts) |
| N20 | No-data, ошибка, метрика и авторский текст; hover/pinned | Сообщения 12px; метрика и авторский текст 13px | [tooltip.test.tsx](../src/components/presentation/tooltips/svgTooltip/tooltip.test.tsx) |
| N21 | Те же данные с flag=true/false и цепочкой ошибок | JSON diagnostics/metrics/elements одинаковы; authored flag сохранён; schema v1 валидна | [snapshot.test.ts](../src/components/capture/snapshot.test.ts) |
| N22 | Доступное число и `condition: 42` | `INVALID_CONDITION`; число и базовый цвет не пропадают | [noDataInputs.test.ts](../src/components/domain/services/noDataInputs.test.ts) |
| N23 | Явный show=false при ошибках/no-data | Tooltip не включается; диагностика остаётся | [noDataWarnings.test.ts](../src/components/application/adapters/noDataWarnings.test.ts) |
| N24 | Ошибка datasource без refId, зависимый запрос пуст | Известная ошибка не скрывается флагом | [noDataWarnings.test.ts](../src/components/application/adapters/noDataWarnings.test.ts) |
| N25 | Видимое и отключённое правила одного элемента | Ошибки отключённого правила не попадают в соседний tooltip | [noDataWarnings.test.ts](../src/components/application/adapters/noDataWarnings.test.ts) |
| N26 | `$MISSING + $B` и обратный порядок, B нечисловой | Проверяются оба входа; ошибка видна, пропуск сохранён в API | [noDataWarnings.test.ts](../src/components/application/adapters/noDataWarnings.test.ts) |
| N27 | Missing перед входом с timeout в формуле/условии | Timeout не скрывается порядком входов | [noDataWarnings.test.ts](../src/components/application/adapters/noDataWarnings.test.ts) |
| N28 | Неиспользуемая формула с двумя отказавшими входами | Оба источника есть в валидном snapshot; ссылки diagnosticIds уникальны | [snapshot.test.ts](../src/components/capture/snapshot.test.ts) |
| N29 | Table: все строки null/нечисловые | Нет winner; tooltip показывает причины без сводного повтора, ошибка не скрывается | [noDataWarnings.test.ts](../src/components/application/adapters/noDataWarnings.test.ts) |
| N30 | Browser: серый сервис, flag=false | Hover показывает общий no-data и обе причины; CSS 12px/13px, полный snapshot | [plugin-capture.browser.cjs](../tests/capture/plugin-capture.browser.cjs) |
| N31 | Browser: тот же серый сервис, flag=true | Только общий no-data и авторский текст; обе причины остаются в snapshot | [plugin-capture.browser.cjs](../tests/capture/plugin-capture.browser.cjs) |
| N32 | Browser: красный + missing + ошибка; refresh → null → 10 | Ошибка остаётся; закреплённый tooltip и цвет обновляются без навигации; JSON сохраняет причины | [plugin-capture.browser.cjs](../tests/capture/plugin-capture.browser.cjs) |
| N33 | Доступное число одновременно с ошибкой datasource, обычный query и sum | Число 95 и красный цвет сохраняются; ошибка источника не исчезает из tooltip | [noDataWarnings.test.ts](../src/components/application/adapters/noDataWarnings.test.ts) |

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
| U13 | Статическое правило и динамическая подпись одного элемента; данные сменились на no-data | Исходный текст восстанавливается, но динамический цвет текста становится серым, а не исходным зелёным | [softPresentation.test.ts](../src/components/application/adapters/softPresentation.test.ts) |
| U14 | Два SVG-элемента внутри общей исходной ссылки; правило меняет ссылку только первого | Ссылка соседа не меняется; повторное обновление и снятие правила сохраняют исходную ссылку и порядок элементов | [operations.test.ts](../src/components/infrastructure/svg/operations.test.ts) |
| G01 | Старый запрос завершился после нового | Запоздалый результат отвергается | [usePanelData.test.ts](../src/components/application/hooks/usePanelData.test.ts) |
| G02 | Успех → loading → ошибка | Старый успех не публикуется как актуальный | [usePanelData.test.ts](../src/components/application/hooks/usePanelData.test.ts) |
| G03 | Конфиг/диапазон меняется во время обработки | Публикуется только актуальное обновление | [usePanelData.test.ts](../src/components/application/hooks/usePanelData.test.ts) |

## Контракт JSON-снимка

[Формат и примеры](capture-contract.md). Эти проверки относятся к форме данных и
согласованности ссылок. Они не означают, что producer, browser lifecycle или
извлечение SVG уже реализованы: для них потребуются отдельные тесты.

Все строки ниже покрыты [contract.test.ts](../src/components/capture/contract.test.ts);
проверяется реальная JSON Schema и отдельные межобъектные инварианты, без mock
валидатора. «Принимается» здесь означает валидность примера, не проверку exporter.

| ID | Вход | Ожидаемое поведение |
| --- | --- | --- |
| J01 | Полный пример: scalar, table, expression, missing input, статическая фигура и частичная связь | Все обязательные разделы проходят структурную и ссылочную проверку |
| J02 | Ошибка конфигурации; пустые результаты | Завершённый снимок с диагностикой принимается, результат расчёта не придумывается |
| J03 | Неизвестные kind/schemaVersion/producer, лишнее поле, другая запрошенная panel ID | Снимок отклоняется; panel identity проверяется отдельно от schema |
| J04 | Пропущенная коллекция, unsafe/fractional timestamp, Loading, нулевая generation/counter, отрицательный индекс | Нарушение обязательной структуры/диапазона отклоняется |
| J05 | NaN, Infinity, undefined, Date, Map, функция, bigint, цикл или дырка в массиве | Отклоняются до JSON.stringify, а не молча превращаются в null/потерянное поле |
| J06 | Число 12.3456789012 с displayValue 12.35; настоящий 0/null/boolean/object в ячейке | Тип и точность raw value сохраняются отдельно от отображения |
| J07 | Неверный порог как строка в settings | Декларативная ошибка остаётся допустимыми данными; schema не требует «исправить» конфиг ради передачи |
| J08 | Error от запросов, доступный красный результат и missing input, отключённый tooltip | Снимок сохраняет результат и полную диагностику независимо от tooltip |
| J09 | Неудачная выборка без назначения элементу | Пустые elementIds допустимы; соседний индикатор не требуется |
| J10 | Дубликаты внутренних ID, неизвестные rule/metric/diagnostic/diagram refs, отсутствующая обратная привязка rule/metric к element, индекс за пределами известного metrics/queries | Неоднозначные и несогласованные связи/индексы отклоняются |
| J11 | Winner недоступен, относится к другому элементу/правилу, конфликтует с noData/row index или потерян при сохранённом winner выбранного правила | Снимок отклоняется; scalar winner не получает индекс строки |
| J12 | Table: повторяющиеся имена колонок, неверная ширина строки/display, неверный индекс колонки/строки/cell issue | Одинаковые имена допустимы; индексы и размеры обязаны соответствовать массивам |
| J13 | Read-only table без threshold column | Строки доступны без выдуманных row decisions и winner |
| J14 | Ошибка расчёта table, известные строки и испорченная ячейка; cell issue на ненулевой ячейке | Строки/cell issue сохраняются, недоступная таблица не становится winner; причина замены на null требует null в этой ячейке |
| J15 | Недоступный scalar/expression/input с числом, доступный scalar без результата; неправильный selected threshold; входы condition | Противоречивые state/trace отвергаются; скалярные входы condition сохраняются отдельно, их доступность и diagnostic refs проверяются |
| J16 | Исходный legend, display label и изменённый SVG-текст; статическая зелёная фигура | Имена/тексты остаются раздельными, статической фигуре не приписывается метрика |
| J17 | Решение красное, но наблюдаемый fill none или gradient; неверный RGBA/negative bounds | Разные decision/paint допустимы без выдуманного RGB; диапазоны чисел проверяются |
| J18 | Grid без измеренного SVG; исходный legacy mode table; rendered без viewport; неотрисованный SVG с измерениями | Допустимые режимы сохраняются, выдуманная измеренная геометрия отклоняется |
| J19 | Неизвестный/циклический parent, частичная draw.io связь, чужой resolved endpoint, неверный ruleId ссылки, SVG markers без embedded model | Явная неразрешённая внешняя ссылка допустима; внутренние ссылки/endpoints проверяются; SVG markers сохраняются без выдуманной draw.io связи |
| J20 | JSON с не-ASCII текстом ровно на лимите и на байт больше | Считаются UTF-8 bytes полного payload; превышение отклоняется без усечения |

## Capture-only факты расчёта

Проверки [snapshot.test.ts](../src/components/capture/snapshot.test.ts) используют
настоящие parser → preparation → extraction → expressions → evaluator →
presentation. Каждый обычный сценарий сравнивает **весь** результат расчёта и
представления capture-off/on, затем проверяет снимок schema/reference validator.
Факты SVG и browser session проверяются отдельно ниже.

| ID | Вход | Ожидаемое поведение |
| --- | --- | --- |
| X01 | Число до округления, переименованный label, отсутствующий query, tooltip выключен | Raw value/имена/ошибка сохраняются, цвет и UI не меняются |
| X02 | Один query с refid/legend/sum | Две суммы с отдельными слагаемыми и общим queryCounter |
| X03 | Один вход суммы пуст | Нет неполного числового результата; известные слагаемые и причины доступны |
| X04 | Table с числом, 0, boolean и null | Raw типы и победившая строка сохранены, её level/color/threshold относятся к одному результату |
| X05 | Table без thresholdKey | Строки читаются без числового winner |
| X06 | Пороговая колонка NaN/Infinity/null | Недоступная таблица сохраняет строки; непредставимые числа отличаются от обычного null через cellIssues |
| X07 | Condition false и condition с отсутствующим входом | Успешный false отличим от error, число и базовый цвет сохраняются |
| X08 | Formula/condition со ссылкой на 0.004 | Сохраняются точный вход, результат 4 и авторский lvl=0 |
| X09 | AutoConfig при missing input | Успехи назначаются как раньше; ошибки не приклеиваются к соседнему индикатору |
| X10 | Синтаксически неверный YAML | Есть invalid_configuration и YAML_PARSE_ERROR, без фиктивных метрик |
| X11 | Изменение результата/карты данных после buildSnapshot | Уже построенный JSON не изменяется |
| X12 | Настоящий 0/95 и полное отсутствие данных | Число доступно, отсутствие отдельно обозначено noData |
| X13 | Одно правило с двумя ссылками для двух элементов | У каждого варианта своя применённая ссылка, авторский массив ссылок сохранён отдельно |
| X14 | Selector не находит SVG ID | Правило/ошибка остаются без фиктивного элемента и дополнительных вычислений |
| X15 | Фильтр оставляет вторую исходную строку | sourceIndex=1, winningRowIndex=0 относительно массива ответа |
| X16 | Пороговая колонка не найдена до обработки строк | Raw строки остаются, фильтрация не выдаётся за выполненную |
| X17 | Формула с наблюдаемым побочным эффектом | Один вызов на каждый run; сериализация не исполняет формулу снова |
| X18 | RefId формулы уже занят входным query | Входное число сохраняется, невыполненная формула имеет unavailable/null с отдельной причиной |
| X19 | Некорректный числовой title | Декларация остаётся в settings, тип title результата string/null не нарушается |
| X20 | Мутация values/timestamps между расчётом и сериализацией | Source count и временные границы относятся к расчёту |
| X21 | Condition с наблюдаемым побочным эффектом и повторная сборка | Повторные snapshots не исполняют condition |
| X22 | Вложенный объект/массив raw-ячейки меняется до сериализации | Экспорт сохраняет JSON-значение, наблюдавшееся при расчёте |
| X23 | Неизвестный calculation | В settings остаётся ошибочная декларация, в source — реально выполненный last |
| X24 | Query без refid/legend | Selection none, unavailable/unresolved; выдуманного поиска legend нет |
| X25 | Технический failed после частичного trace | Известные результаты остаются без висячих ссылок на отсутствующие evaluation elements |
| X26 | Ошибка второго query | Source содержит известные metricsIndex/queryIndex, metricIds не включает успешного соседа |
| X27 | Разные explicit selectors для двух значков | У каждого сохранено фактическое назначение и winner своего query |
| X28 | Regex совпадает с двумя SVG IDs | Возвращаются оба реальных ID и исходный selector, без догадок о группе |
| X29 | Два независимых autoConfig-правила на общих значках, первый query одного пропал | Сдвиг меняет только реальные назначения своего правила; разные серии не объединяются |
| X30 | Пустая table или неоднозначная threshold column | Есть точная причина отсутствия результата; известные строки сохраняются при раннем отказе |
| X31 | Две метрики с равным lvl; два совпавших порога внутри одной | Между метриками остаётся первый winner; внутри метрики выбран последний порог, включая lvl=0 |

[dataExtractor.capture.test.ts](../src/components/infrastructure/data/dataExtractor.capture.test.ts)
отдельно проверяет происхождение полей:

| ID | Вход | Ожидаемое поведение |
| --- | --- | --- |
| XF01 | Таблица с исходными именами/types/labels/metadata | Типы сохранены, rawValues — ссылка только внутри trace, без изменения рабочего DataFrameMap |
| XF02 | Два одинаковых display name и custom time range | Исходные field/frame indices и имена различимы; graph raw history не копируется |
| XF03 | Capture отсутствует | Дополнительные metadata/request getters не читаются, результат extraction идентичен |
| XF04 | Один прямой request target, explicit frame metadata, неоднозначные/proxy/null targets | Сохраняются доступные uid/type; неизвестный исходный datasource остаётся null, без сети |

## Факты SVG и отображённое оформление

Unit-проверки находятся в [diagram.test.ts](../src/components/capture/diagram.test.ts),
реальные layout/CSS — в [diagram.browser.cjs](../tests/capture/diagram.browser.cjs).
Последние запускаются через `npm run test:capture:diagram`, отдельно от Jest.
Используются настоящий initSVG и операции замены подписи/ссылки.
Сборщик не меняет DOM; полученный полный снимок проходит schema/reference validator.

| ID | Вход | Ожидаемое поведение |
| --- | --- | --- |
| V01 | Grid с исходным рисунком | ID, authoredText и связи сохраняются; live-текст, layout и paint не выдумываются |
| V02 | Пустой, сломанный или не-SVG документ | missing/invalid различимы; invalid сопровождается диагностикой |
| V03 | defs, use, изображение и линия без metadata | Ресурс не превращается в видимый объект, изображение — в OCR-текст, линия — в бизнес-связь |
| V04 | Авторская ссылка и ссылки двух правил на один объект | Все декларации с происхождением сохранены; в grid applied=null |
| V05 | Повторяющийся SVG ID | Нет привязки к произвольному первому объекту, есть диагностика |
| V06 | ViewBox, transform и смещение SVG на странице | Bounds в CSS pixels относительно SVG; снимок валиден, DOM не изменён |
| V07 | CSS/static fill, stroke, alpha, HTML color, gradient, разноцветная группа, marker | Каналы и фигуры раздельны; gradient без ложного RGBA; статическому цвету не приписана метрика |
| V08 | Текст без ID, tspan/HTML строки, скрытый текст, use/image | Строки сохранены отдельно; скрытый текст не виден; use имеет bounds и явное ограничение paint |
| V09 | Явная draw.io связь и тот же SVG без metadata | Только подтверждённые endpoints; ID линии не используется для догадки |
| V10 | Плагин заменяет подпись и ссылку, winner красный при filling:none | Исходные текст/ссылка не потеряны, live label/href обновлены, наблюдаемый зелёный fill остаётся зелёным |
| V11 | Resize и новый transform | Координаты измерены заново, старые bounds не переиспользуются |
| V12 | Нативная raw-DEFLATE metadata и отсутствующий target | Поддержанный формат прочитан; неизвестный cellId сохранён, ссылка null с диагностикой |
| V13 | В исходном XML есть внешний DTD, script, image, href | Документ не вставляется в UI, выполнение и сеть отсутствуют |
| V14 | Ссылка вокруг всего SVG в HTML страницы | Внешний UI href не приписывается фигурам |
| V15 | Лимит числа узлов или глубины | Весь capture завершается явной ошибкой без успешного усечения |
| V16 | Повреждённая metadata, затем корректный повторный capture | SVG доступен; устаревшая диагностика заменена, исходный snapshot не изменён |
| V17 | Два одинаковых data-cell-id | Metadata-конец не разрешён; причина доступна и через связанные evaluation elements |
| V18 | Слишком большой source или внутренние XML-сущности | Лимит/невалидный SVG отмечены до извлечения фактов |
| V19 | RGB/RGBA, проценты, none, gradient, неизвестная цветовая функция | CSS сохраняется; RGBA только при известном представлении |
| V20 | Автоматический HTML wrap, switch fallback, opacity:0/visibility:hidden | Три настоящие строки с разными координатами; скрытый/fallback текст не выдаётся за видимый |
| V21 | Link updater добавляет обёртку вокруг текста без ID | Authored/live текст сопоставлен корректно, исходный документ остаётся отдельным |
| V22 | Прозрачность задана на обёртке-ссылке, а не на фигуре | Обёртка и её opacity сохранены в родительской цепочке |
| V23 | Live data-cell-id переставлены относительно исходного SVG | Metadata не подтверждает неверные концы; исходные ссылки и диагностика остаются |
| V24 | Длинная подпись внутри множества групп | Общий бюджет authoredText ограничивает повторение у предков |
| V25 | Вложенный SVG внутри ссылки | Ссылка наследуется внутри рисунка, но обход не выходит за его корень |

## Ограниченное чтение metadata

[diagramMetadata.test.ts](../src/components/capture/diagramMetadata.test.ts)
проверяет XML отдельно от геометрии. Сжатие и распаковка настоящие, не mock.
Новые/изменённые сценарии V/M требуют изменения этих таблиц в том же коммите.

| ID | Вход | Ожидаемое поведение |
| --- | --- | --- |
| M01 | Отсутствующий/пустой content | Нет выдуманной ошибки или требования новой разметки |
| M02 | ID, parent, типы, endpoints и посторонние свойства | Возвращаются только разрешённые исходные поля, не labels/style/XML |
| M03 | object/UserObject wrapper | ID wrapper используется только при отсутствии собственного mxCell ID |
| M04 | Одна diagram с XML, escaped XML или CDATA | Одна и та же модель прочитана |
| M05 | Повторный arrow style и явное none | Последнее заданное значение сохранено, default не выдуман |
| M06 | Невалидный XML, root, ID, вложенность, конфликт vertex/edge | invalid с диагностикой, без частичного списка cells |
| M07 | Несколько diagram/model или смешанные payload | unsupported, нет произвольного выбора первой страницы |
| M08 | DTD/ENTITY | Отказ до XML-парсинга и без исходного содержимого в сообщении |
| M09 | DTD скрыт XML entity encoding | Повторный уровень тоже проверяется |
| M10 | Unicode на точной границе UTF-8 бюджета и сверх неё | Считаются байты, лимит проверяется до DOMParser |
| M11 | Cells сверх лимита, включая wrapper | Нет успешного допустимого префикса |
| M12 | Отрицательный/NaN/Infinity/дробный лимит | Некорректный лимит не отключает защиту |
| M13 | Реальные base64/DEFLATE/URL encoding, Unicode | Точные ID/концы восстановлены |
| M14 | Нет нативного декодера | unsupported с отдельной причиной, без fallback-зависимости |
| M15 | Ошибка base64, DEFLATE, URL encoding или UTF-8 | invalid без копии исходного payload в ошибке |
| M16 | Малый compressed input с большим распакованным потоком | Распаковка остановлена до второго XML parse |
| M17 | Точная граница распакованных байтов и один лишний байт | Граница принимается; превышение отклоняется |
| M18 | DTD после распаковки | Запрещён до XML-парсинга модели |
| M19 | Слишком много cells после распаковки | limited без частичных отношений |

## Session и публикация после обновления UI

[session.test.ts](../src/components/capture/session.test.ts) проверяет границу hook,
[useCaptureSession.test.tsx](../src/components/capture/useCaptureSession.test.tsx) —
настоящие hooks, расчёт, snapshot и SVG-операции. Layout/замену SVG-текста
подтверждают браузерные B-проверки: jsdom для этого недостаточно.

| ID | Вход | Ожидаемое поведение |
| --- | --- | --- |
| S01 | Hook отсутствует или отказывает | Нет загрузки runtime |
| S02 | Новое begin до окончания старого run | Старый ticket не загружает runtime и не вызывает фабрику; времена/поколения раздельны |
| S03 | Unmount во время import и новый instance | Старый результат не оживает, close однократен, instance ID новый |
| S04 | Getter/connect, неверный протокол, лимит или метод | Подключение изолировано, тяжёлый runtime не загружается |
| S05 | Исключение begin/publish/fail/close | Ошибка не выходит в UI, приватный текст не передаётся |
| S06 | Ошибка lazy import | CAPTURE_EXPORT_FAILED, без невалидного результата |
| S07 | Receiver сохраняет factory и вызывает позже | Асинхронный вызов после возврата publish не выполняет exporter |
| S08 | Обычные данные и принятие session | Полный валидный snapshot того же расчёта, исходное имя поля и применённый цвет |
| S09 | Done → Loading/NotStarted → новый Done | Старый terminal сразу инвалидирован, старые frames не публикуются |
| S10 | Grid, сломанный YAML/SVG, datasource Error | Диагностический terminal без ожидания SVG; status и полезные факты сохранены |
| S11 | Streaming | CAPTURE_DATA_STATE_UNSUPPORTED, UI продолжает обновляться |
| S12 | Новый YAML после переноса SVG в DOM | Новая конфигурация использует существующие элементы, цвет обновляется |
| S13 | StrictMode и unmount/remount | SVG монтируется повторно, старый handle закрывается |
| S14 | Resize со строгим receiver | Новое поколение принято, формула исполнялась один раз |
| S15 | Getter принятого handle бросает исключение | Handle закрыт; следующее подключение не становится ambiguous |
| S16 | Меняется только panel ID | Новый instance начинает run даже при тех же объектах входных данных |
| S17 | Recorder бросает в recordField/beginRule | Capture завершается ошибкой, UI сохраняет значение и цвет |
| S18 | Ошибочный getter дополнительных request metadata | Ошибка экспорта не отменяет успешную метрику |
| S19 | SVG меняется в grid | Новое поколение содержит новые authored-подписи, не старый рисунок |

## Защита вычислений от ошибок recorder

[guardTrace.test.ts](../src/components/capture/guardTrace.test.ts) сравнивает
настоящие extraction/evaluator/presentation с capture-off и считает исполнения
формул/условий. Guard находится в lazy chunk, не в обычном UI.

| ID | Вход | Ожидаемое поведение |
| --- | --- | --- |
| TG01 | Сбои recorder-методов, включая вложенный getOrigin | Данные, решения, presentation и число вычислений совпадают с baseline |
| TG02 | Настоящие recorder и отделённые методы | Identity данных и правильный this сохранены |
| TG03 | Первый сбой и исключение callback | Callback однократен; все recorder далее возвращают undefined |
| TG04 | Повторно возвращённый дочерний recorder | Однократное оборачивание, обычные данные не меняются |

## Ограниченный тестовый browser receiver

[receiver.test.ts](../src/components/capture/testing/receiver.test.ts)
проверяет протокол и отделённую копию payload. Это не production renderer.

| ID | Вход | Ожидаемое поведение |
| --- | --- | --- |
| R01 | Валидный снимок, последующая мутация источника | Immutable-копия с согласованными identity/generation |
| R02 | Чужая панель, неверная identity, getter | Подключение отклонено без чтения getter |
| R03 | Новое поколение, поздний publish, close/dispose | Старый результат очищен, устаревшая фабрика не вызывается |
| R04 | Два живых instance, включая одинаковый ID | AMBIGUOUS; восстановление только после нового begin |
| R05 | begin/close внутри фабрики | Старый publish не изменяет новое состояние |
| R06 | Исключение фабрики, устаревший fail, Streaming fail | Безопасный код только текущего run |
| R07 | Подмена kind/version/producer/panel/observed | PAYLOAD_INVALID без снимка |
| R08 | Неразрешимая ссылка при schema/reference validation | PAYLOAD_INVALID |
| R09 | Не-JSON значения, нестандартные объекты, циклы | Отказ без преобразования или пропуска данных |
| R10 | Getter или функция toJSON в payload | Отказ без их выполнения |
| R11 | UTF-8, escapes, пары и одиночные surrogates | Точный байтовый лимит, без усечения |
| R12 | Огромная строка | Ранний отказ до сериализации и валидации |
| R13 | Глубокий или широкий компактный JSON | Ограничение глубины и обхода |
| R14 | null-prototype, __proto__, общие ссылки | Значения сохранены без prototype pollution |
| R15 | Две установки receiver | Изоляция состояния; dispose удаляет собственный hook |
| R16 | Неверное generation до begin | Фабрика не вызывается |
| R17 | Новый begin внутри validator | Новое pending-состояние сохраняется |
| R18 | fail после успеха текущего run | Успех заменён безопасной ошибкой |
| R19 | fail внутри фабрики того же run | Возвращённый payload не перезаписывает ошибку |
| R20 | Исключение validator, getter сообщения fail | Getter не читается, исходная ошибка не раскрывается |
| R21 | Большой массив с ловушкой ownKeys | TOO_LARGE по длине до перечисления ключей |
| R22 | Обычное JSON-поле toJSON | Имя поля не меняет и не удаляет авторские данные |

## Browser acceptance плагина в Grafana

[plugin-capture.browser.cjs](../tests/capture/plugin-capture.browser.cjs),
`GRAFANA_URL=… npm run test:capture:plugin`. Требует отдельный тестовый экземпляр
Grafana с собранным плагином. Создаёт и удаляет собственные синтетические ресурсы;
запросы данных получают фиксированные ответы. Протокол renderer здесь не участвует.

| ID | Вход | Ожидаемое поведение |
| --- | --- | --- |
| B01 | Обычный просмотр без hook | Правильные live подпись/цвет, нет загрузки capture chunk |
| B02 | Принятый hook | Полный валидный снимок после SVG update: raw имена, authored/live текст и фактический fill |
| B03 | Resize с формулой | Новые bounds/generation, число исполнений формулы не изменилось |
| B04 | Grid | Terminal snapshot без скрытого SVG-render |
| B05 | Сломанный YAML | invalid_configuration и диагностика вместо таймаута |
| B06 | Сломанный SVG | invalid_configuration и invalid diagram |
| B07 | Ошибка запроса | Error/unavailable и причина, не старое успешное число |
| B08 | Метрика отсутствует | noData/диагностика и серый UI |
| B09 | Hook отказал | UI работает, тяжёлый chunk не загружается |
| B10 | Getter hook бросает | UI работает без page errors |
| B11 | Connect бросает | UI работает без page errors |
| B12 | Publish бросает | UI сохраняет подпись/цвет, есть вызов fail |
| B13 | Capture chunk не загрузился | UI работает, CAPTURE_EXPORT_FAILED |
| B14 | Снимок больше лимита receiver | TOO_LARGE, без частичного payload, UI продолжает работать |

## Распределение autoConfig

`autoConfig` — набор заполняемых индикаторов, не постоянная привязка series к SVG ID. Доступные fields и tables распределяются по позициям независимо друг от друга; последний индикатор получает остаток каждого типа. Неудачный расчёт не занимает место, его диагностика сохраняется на уровне панели. Ошибка условия при доступном числе остаётся у назначенного результата. Явные selectors имеют приоритет и выбирают query по его позиции в конфиге. C28/D13 фиксируют намеренное уплотнение, а не ограничение, которое нужно устранять хранением предыдущей раскладки.
