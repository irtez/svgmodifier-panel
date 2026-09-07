# Каталог сценариев поведения

Новый сценарий, изменение, перенос или удаление теста требуют обновления этой таблицы в том же коммите. Все данные тестов синтетические.

| ID | Вход | Ожидаемое поведение | Проверка |
| --- | --- | --- | --- |
| C29 | Сломанный XML или корень не является SVG | `initSVG` возвращает `null` вместо неверного документа | [updater.test.ts](../src/components/infrastructure/svg/updater.test.ts) |
| U06 | `stroke`, `strokeBase`, `none`, `:table` | Значение каждого режима оформления сохраняется | [updater.test.ts](../src/components/infrastructure/svg/updater.test.ts) |
| U07 | Fill/stroke включён, затем снят | Старое динамическое оформление восстанавливается | [updater.test.ts](../src/components/infrastructure/svg/updater.test.ts) |
| U08 | Inline style и изначально отсутствующий атрибут | Несвязанный style и исходное отсутствие сохраняются | [updater.test.ts](../src/components/infrastructure/svg/updater.test.ts) |
| U09 | Подпись или ссылка изменена/удалена | Текущее значение обновляется либо восстанавливается | [operations.test.ts](../src/components/infrastructure/svg/operations.test.ts) |
