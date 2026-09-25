# Svg modifier for Grafana

![image](https://github.com/oxeizd/svgmodifier-panel/blob/main/src/img/example.png)

## Getting Started

Follow the plugin [Getting Started](./src/README.md) guide to understand the target audience, feature set and how to use.

## Проверяемое поведение

Постоянный каталог сценариев и автоматических проверок: [docs/test-cases.md](./docs/test-cases.md). Правила его сопровождения — в [CONTRIBUTING.md](./CONTRIBUTING.md).

Настройка подсказок: [предупреждения об отсутствии данных](./docs/no-data-warnings.md).

Для интеграций доступен opt-in [контракт снимка v2](./docs/capture-contract.md):
результаты, tooltip, навигация и связи с видимыми подписями без полного SVG.
Получатель должен поддерживать v2; обычный просмотр панели не включает сбор снимка.
