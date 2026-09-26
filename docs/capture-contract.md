# Контракт снимка SVG Modifier v2

Снимок описывает одно завершённое обновление панели: индикаторы, связанные
видимые подписи, результаты расчёта, tooltip, ссылки и диагностику. Полное SVG
и исходные временные ряды не передаются. v2 заменяет прежний формат целиком;
плагин и получатель нужно обновлять согласованно.

## Источники контракта

- [JSON Schema](svgmodifier-snapshot-v2.schema.json) — структура ответа.
- [Сгенерированные типы](../src/components/capture/modelsV2.ts).
- [Browser protocol](../src/components/capture/protocol.ts).
- [Пример](examples/capture-v2.json).
- [Каталог проверок](test-cases.md). Новый сценарий или изменение поведения
  требует изменения этого каталога в том же коммите.

После изменения schema: `npm run capture:types`, `npm run test:ci`,
`npm run typecheck`, `npm run lint`. Генератор/Ajv не входят в runtime UI.

## Состав ответа

| Поле | Содержание |
| --- | --- |
| producer, panel, observed | Версия сборки, панель, поколение и фактическое окно расчёта |
| evaluationStatus, configurationStatus | Технический итог и статусы YAML/SVG, не здоровье сервисов |
| objects | Видимые подписи, карточки, группы и статические аннотации |
| indicators | SVG targets, привязки к objects, фактическое оформление, назначения результатов, tooltip |
| metrics | Доступные результаты и неудачные попытки; raw/display значения, происхождение |
| rules | Подсказки исходных правил: selectors/title/queries/ссылки/source |
| expressions | Формулы плагина, использованные скалярные входы, результат и ошибки |
| links | URL и разобранное назначение доказанных ссылок текущей Grafana |
| diagnostics | Все проблемы, независимо от того, видны ли они в tooltip |

Обязательные массивы присутствуют всегда. Неизвестное обязательное значение —
`null`, необязательные поля происхождения могут отсутствовать. Ноль не означает
отсутствие. Числа конечны, время — epoch milliseconds, индексы с нуля, кроме
query.counter, generation и line/column исходного текста (с единицы).
ID уникальны внутри коллекции и одного снимка; их стабильность после изменения
конфига не обещается. indicator.id — исходный ID SVG target.

### Результаты и причины цвета

Recorder работает в существующем evaluator. Builder не вызывает повторно
формулы, reducers, условия, фильтры или выбор winner. Эквивалентные результаты
повторных применений одного правила разделяются несколькими индикаторами.
Разные queries и отдельные выборки refId/legend не объединяются из-за равных чисел.

`state` хранит решение evaluator; `appearance` — фактические цвета отдельных
частей target после SVG-операций. Они могут различаться, например при
`filling:none`. Цвет передаётся как `{kind, css, rgba}`: solid имеет четыре
числа RGB 0…255 и alpha 0…1; none/other имеют `rgba:null`. Gradient не становится
чёрным или зелёным. Цветовые семейства и пользовательские фильтры определяет клиент.
Группам не присваивается искусственный общий цвет дочерних сервисов.

У scalar и табличной строки сохраняются raw value, displayValue, level, color
и только применённый порог с его operator/condition/скалярными inputs.
Истории всех порогов и полных settings нет; ошибки отвергнутых порогов не теряются.
Источники сохраняют refId/legend/field/frame, labels, публичные datasource
uid/type/name, count и временные границы входов, результат reducer. Новых
запросов metadata нет. Непривязанное правило сохраняет подсказки и ссылки,
но не получает вымышленный результат или сервис.

### Tooltip и таблицы

`tooltip.metricIds` и `tables[].rowIndices` описывают реальный порядок после
UI hideZeros/sort; одинаковые labels и значения не заменяют идентичность результата.
`status`: available/empty/disabled/not_rendered. Полные metrics/diagnostics
сохраняются и для выключенного или пустого tooltip.

Табличные raw values не округляются, displayValues хранятся отдельно.
`sourceIndex` — номер строки до фильтра, `winningRowIndex` — индекс в rows
ответа; порядок tooltip задаётся отдельно. Read-only таблица не имеет winner.
Непредставимая JSON-ячейка становится null с cellIssues, исходный null — без
такой ошибки. При раннем отказе известные строки остаются с rowFilterStatus.

### Видимые объекты и навигация

Сбор ограничен live root текущей панели. Используются текстовые DOM Range и
границы нарисованных фигур, а не растянутые технические g/foreignObject.
Собственная подпись даёт direct/own_text; единственный подходящий контейнер
или строка — inferred/containment либо inferred/row_alignment.
Несколько кандидатов дают ambiguous, отсутствие — unresolved. Проблемы с
именем не удаляют метрики, tooltip и ссылки. Динамически заменённый текст
не объявляется названием сервиса. Статические подписи остаются аннотациями.
Автоматический перенос одного текста не создаёт несколько имён; отдельные
tspan targets сохраняют собственные связи и цвета. Прозрачный текст не считается
видимым. Clip-path/mask не анализируются попиксельно: недостоверные подписи
пропускаются с CAPTURE_VISIBILITY_UNCERTAIN; при неопределимой видимости target
visible=null. Paint внутреннего shadow tree use не угадывается по стилю экземпляра.
У SVG-таблицы невидимая служебная рамка подписи может задать область строки,
только если в ней есть несколько отдельных видимых ячеек на одной строке.
Такая родительская связь помечается inferred; одной невидимой фигуры недостаточно.
При `label: replace` или пустом значении принадлежность строке определяется по
видимым неперекрывающимся прямоугольным ячейкам, а не по числовым подписям.
Индикатор без собственного статического имени получает inferred/row_alignment
к подписи строки; конкурирующие подписи остаются ambiguous. Продолжение подписи
внутри подтверждённой строки таблицы во вложенном HTML-блоке может составлять одно имя; отдельные соседние блоки
не объединяются только из-за близкого расположения.

Геометрия нужна только collector и не передаётся по API. Декоративные линии
не экспортируются; линия с правилом остаётся indicator без выдуманных концов.
XML metadata, OCR и реконструкция сетевой топологии не выполняются.

Navigation различает declared/prepared/applied ссылки. URL сохраняется без
переписывания и никогда не открывается. Назначение разбирается только для
HTTP(S) текущей Grafana с её subpath: dashboard UID, panel ID и пары query
параметров, включая повторы. Внешняя/небезопасная ссылка остаётся непрозрачной;
повтор panelId не выбирается произвольно. Формулы/текст/URL — недоверенные данные.
Declared без ruleId обозначает исходную SVG-ссылку, в том числе сохранённую
updater при override; declared с ruleId — декларацию YAML. Некорректные типы
полей не отменяют весь снимок: поле опускается/null и добавляется
CAPTURE_INVALID_VALUE. Числовой текст tooltip сохраняется строкой, как в UI.

## Подключение и ограничения

Receiver устанавливает `window.__SVG_MODIFIER_CAPTURE_V2__` до навигации.
`connect({producerId,producerVersion,panelId,instanceId})` возвращает null
для невыбранной панели или handle:

- `protocolVersion:2`, `maxPayloadBytes` — лимит UTF-8 JSON панели;
- `begin({generation,effectiveFromMs,effectiveToMs})` инвалидирует прошлый снимок;
- `publish(generation,build)` синхронно вызывает builder только текущего run;
- `fail(generation,{code,message})` завершает capture технической ошибкой;
- `close()` завершает конкретное монтирование.

Публикация идёт после UI-операций и готовности шрифтов. Resize переизмеряет
рисунок без повторной формулы. Loading/NotStarted и новый run отменяют старые
результаты; Streaming не поддержан. Ошибки данных/YAML — завершённый снимок с
диагностикой. Режимы отображения grid/table возвращают CAPTURE_MODE_UNSUPPORTED:
скрытый исходный SVG не выдаётся за текущий UI. SVG с нарисованной таблицей
и табличные метрики поддерживаются.

Без принятой session нет загрузки capture chunk, recorder, DOM-измерений или
сериализации. Ошибки hook/recorder/import изолированы от UI. Плагин не создаёт
hook, endpoint, polling или новый сетевой канал. Hook предыдущей версии игнорируется.

Лимит ответа задаёт receiver (рекомендуемый старт: 4 МиБ на панель). Превышение
даёт CAPTURE_PAYLOAD_TOO_LARGE без успешного усечения. Отдельные safety bounds
collector: 50 000 DOM nodes, глубина 256, 1 000 000 символов измеряемого текста.
Это пределы обхода, не скрытая квота сериализованного SVG.
Они возвращают CAPTURE_SVG_COMPLEXITY_LIMIT/CAPTURE_SVG_TEXT_LIMIT;
неконечная геометрия — CAPTURE_SVG_INVALID_GEOMETRY.

Receiver должен проверить JSON Schema, ссылочную целостность и winners,
panel identity, актуальные instance/generation и byte limit. Повторы одного
panel ID — ошибка неоднозначности. Batch registry, layout reveal, общий deadline
и внешняя HTTP-оболочка принадлежат renderer, не плагину.

## Проверки

`node tests/capture/map-objects.browser.cjs` проверяет настоящий Chromium layout
на нейтральном SVG с запрещённой сетью. React/session и bounded reference receiver
покрыты Jest. [Test-only validator](../src/components/capture/testing/validateSnapshotV2.ts)
проверяет schema и ссылки, но не заменяет lifecycle/bounded-copy проверки receiver.

`GRAFANA_URL=http://localhost:PORT npm run test:capture:plugin` — отдельная
browser-проба настоящего frontend и операций панели. Тестовый receiver не входит
в production bundle и не доказывает работу Grafana → renderer HTTP transport.
Harness создаёт/удаляет только собственные синтетические dashboard/datasource.
`PLUGIN_BUNDLE_DIR=/absolute/build/path` позволяет подменить JS только в тестовом
браузере, не заменяя установленный bundle.
