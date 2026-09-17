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

## Распределение autoConfig

`autoConfig` — набор заполняемых индикаторов, не постоянная привязка series к SVG ID. Доступные fields и tables распределяются по позициям независимо друг от друга; последний индикатор получает остаток каждого типа. Неудачный расчёт не занимает место, его диагностика сохраняется на уровне панели. Ошибка условия при доступном числе остаётся у назначенного результата. Явные selectors имеют приоритет и выбирают query по его позиции в конфиге. C28/D13 фиксируют намеренное уплотнение, а не ограничение, которое нужно устранять хранением предыдущей раскладки.
