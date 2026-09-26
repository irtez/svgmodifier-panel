// Проверки настоящего frontend Grafana с одноразовыми синтетическими ресурсами.
// GRAFANA_URL обязателен; GRAFANA_AUTH_TOKEN при необходимости авторизует запросы.
const assert = require('node:assert/strict');
const { readFileSync, mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const webpack = require('webpack');
const { chromium } = require('playwright');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs' } });
const { validateSnapshotV2 } = require('../../src/components/capture/testing/validateSnapshotV2');

const root = path.resolve(__dirname, '../..');
const panelId = 7;
const maxPayloadBytes = 1024 * 1024;
const fromMs = 1700000000000;
const toMs = fromMs + 3600000;
const pluginId = JSON.parse(readFileSync(path.join(root, 'src/plugin.json'), 'utf8')).id;
const captureChunk = /\/svg-capture(?:\.[^/]*)?\.js(?:\?|$)/;
const fixtureSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">' +
  '<g id="cell-a"><rect width="50" height="30" fill="green"/>' +
  '<text x="5" y="20">Service Alpha</text></g></svg>';
const fixtureYaml =
  'changes:\n  - id: a\n    attributes:\n      label: replace\n      tooltip: {show: true}\n' +
  '      metrics:\n        queries: [{refid: A}]\n        baseColor: green\n' +
  '        thresholds: [{value: 80, color: red, lvl: 2}]';
const tableRowSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 100">
  <g data-cell-id="row"><rect x="0" y="0" width="400" height="70" fill="none" stroke="none"/><text x="10" y="40">Service Alpha</text></g>
  <g id="cell-a"><rect x="180" y="10" width="70" height="50" fill="green"/><text x="190" y="40">0</text></g>
  <g id="cell-b"><rect x="280" y="10" width="70" height="50" fill="green"/><text x="290" y="40">0</text></g>
</svg>`;

function options(kind) {
  const warnings = kind.startsWith('warnings-');
  const warningYaml = JSON.stringify({
    changes: [
      {
        id: 'a',
        attributes: {
          label: 'replace',
          tooltip: { show: true, hideNoDataWarnings: kind !== 'warnings-visible', textAbove: 'Synthetic note' },
          metrics: {
            queries:
              kind === 'warnings-mixed'
                ? [{ refid: 'A' }, { refid: 'MISSING' }, { refid: 'F' }]
                : [{ refid: 'MISSING' }, { refid: 'B' }],
            baseColor: 'green',
            thresholds: [{ value: 80, color: 'red', lvl: 2 }],
          },
        },
      },
    ],
  });
  return {
    displayMode: kind === 'grid' ? 'grid' : 'svg',
    grid: { columnMode: 'auto' },
    table: { rows: 1, columns: 1 },
    jsonData: {
      svgCode: kind === 'svg' ? '<svg>' : kind === 'table-row' ? tableRowSvg : fixtureSvg,
      metricsMapping: [
        {
          page: 'Synthetic',
          code: warnings
            ? warningYaml
            : kind === 'yaml'
            ? 'changes: ['
            : kind === 'missing'
            ? fixtureYaml.replace('refid: A', 'refid: MISSING')
            : kind === 'table-row'
            ? fixtureYaml.replace('id: a', 'id: [a, b]')
            : fixtureYaml,
        },
      ],
      svgAspectRatio: 'disable',
      customRelativeTime: '',
      fieldsCustomRelativeTime: '',
    },
    transformations: {
      expressions:
        kind === 'warnings-mixed'
          ? [{ refId: 'F', expression: '1 / 0' }]
          : kind === 'resize'
          ? [{ refId: 'CALC', expression: '((globalThis.__captureTestFormulaCount += 1), $A:last)' }]
          : [],
      RelativeTime: '',
      fieldsRelativeTime: '',
    },
    tooltip: { sort: 'none', hideZeros: false, maxWidth: 400, maxHeight: 400, valuePosition: 'standard' },
    notifyTooltip: { show: false, offsetX: 0, offsetY: 0, hideInEditMode: true },
    debug: { loggingEnabled: false, logLevel: 'warn', showErrorBanner: false, enableNotifyTooltip: false },
  };
}

function queryResult(kind) {
  if (kind === 'error') {
    return { results: { A: { status: 500, error: 'Synthetic query failure', errorSource: 'downstream', frames: [] } } };
  }
  const result = {
    results: {
      A: {
        status: 200,
        frames: [
          {
            schema: {
              refId: 'A',
              name: 'Synthetic source',
              meta: { preferredVisualisationType: 'graph' },
              fields: [
                { name: 'time', type: 'time', typeInfo: { frame: 'time.Time' }, config: {} },
                { name: 'raw_alpha_metric', type: 'number', typeInfo: { frame: 'float64' }, config: {} },
              ],
            },
            data: { values: [[toMs], [95]] },
          },
        ],
      },
    },
  };
  if (kind.startsWith('warnings-')) {
    const frame = JSON.parse(JSON.stringify(result.results.A.frames[0]));
    frame.schema.refId = 'B';
    frame.data.values[1] = [null];
    result.results.B = { status: 200, frames: [frame] };
  }
  return result;
}

function compileReceiver(output) {
  return new Promise((resolve, reject) => {
    const compiler = webpack({
      mode: 'development',
      devtool: false,
      target: 'web',
      entry: path.join(__dirname, 'receiver-entry.ts'),
      output: { path: output, filename: 'receiver.js', library: { name: 'CaptureTest', type: 'var' } },
      resolve: { extensions: ['.ts', '.js'], modules: [path.join(root, 'src'), 'node_modules'] },
      module: {
        rules: [
          {
            test: /\.ts$/,
            exclude: /node_modules/,
            use: {
              loader: 'swc-loader',
              options: { jsc: { parser: { syntax: 'typescript' }, target: 'es2020' } },
            },
          },
        ],
      },
    });
    compiler.run((error, stats) =>
      compiler.close(() => {
        if (error) {
          reject(error);
        } else if (!stats || stats.hasErrors()) {
          reject(new Error(stats?.toString({ all: false, errors: true }) ?? 'Receiver build failed'));
        } else {
          resolve(readFileSync(path.join(output, 'receiver.js'), 'utf8'));
        }
      })
    );
  });
}

async function main() {
  if (!process.env.GRAFANA_URL) {
    throw new Error('Set GRAFANA_URL to the disposable Grafana instance hosting the built plugin.');
  }
  const base = new URL(process.env.GRAFANA_URL);
  assert.ok(['http:', 'https:'].includes(base.protocol), 'GRAFANA_URL must use HTTP(S)');
  const headers = process.env.GRAFANA_AUTH_TOKEN ? { Authorization: 'Bearer ' + process.env.GRAFANA_AUTH_TOKEN } : {};
  const apiUrl = (pathname) => new URL(base.pathname.replace(/\/$/, '') + pathname, base.origin).href;
  async function api(method, pathname, body) {
    const response = await fetch(apiUrl(pathname), {
      method,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.ok(response.ok, method + ' ' + pathname + ': HTTP ' + response.status);
    return response.status === 204 ? null : response.json();
  }

  const health = await api('GET', '/api/health');
  const plugin = await api('GET', '/api/plugins/' + pluginId + '/settings');
  assert.equal(plugin.id, pluginId);
  process.stdout.write('Grafana ' + health.version + '; plugin ' + pluginId + '\n');

  const output = mkdtempSync(path.join(tmpdir(), 'svgmodifier-plugin-browser-'));
  const suffix = randomBytes(6).toString('hex');
  const datasourceUid = 'capture-' + suffix;
  const dashboards = [];
  let datasourceCreated = false;
  let browser;
  const failures = [];
  let passed = 0;
  try {
    const receiverScript = await compileReceiver(output);
    const datasource = await api('POST', '/api/datasources', {
      uid: datasourceUid,
      name: 'Synthetic capture ' + suffix,
      type: 'grafana-testdata-datasource',
      access: 'proxy',
      jsonData: {},
    });
    datasourceCreated = true;
    const datasourceType = datasource.datasource?.type ?? 'grafana-testdata-datasource';
    browser = await chromium.launch({ headless: true });

    async function scenario(
      id,
      name,
      {
        kind = 'svg-normal',
        hook = 'accepted',
        blockChunk = false,
        receiverLimit = maxPayloadBytes,
        pair = false,
      } = {},
      check
    ) {
      let context;
      let page;
      const pageErrors = [];
      const requests = [];
      try {
        const uid = 'capture-' + suffix + '-' + id.toLowerCase();
        const saved = await api('POST', '/api/dashboards/db', {
          dashboard: {
            uid,
            title: 'Synthetic capture ' + id + ' ' + suffix,
            schemaVersion: 40,
            version: 0,
            timezone: 'utc',
            refresh: kind === 'warnings-mixed' ? '5s' : '',
            time: { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString() },
            panels: [
              {
                id: panelId,
                title: 'Service Alpha',
                type: pluginId,
                gridPos: { x: 0, y: 0, w: 24, h: 12 },
                datasource: { uid: datasourceUid, type: datasourceType },
                targets: [
                  { refId: 'A', datasource: { uid: datasourceUid, type: datasourceType }, scenarioId: 'random_walk' },
                  ...(kind.startsWith('warnings-')
                    ? [
                        {
                          refId: 'B',
                          datasource: { uid: datasourceUid, type: datasourceType },
                          scenarioId: 'random_walk',
                        },
                      ]
                    : []),
                ],
                fieldConfig: { defaults: {}, overrides: [] },
                options: options(kind),
              },
            ],
          },
          overwrite: false,
        });
        dashboards.push(uid);
        if (pair) {
          const copy = (await api('GET', '/api/dashboards/uid/' + uid)).dashboard;
          copy.panels[0].gridPos.h = 6;
          const second = structuredClone(copy.panels[0]);
          second.id = 8;
          second.gridPos.y = 6;
          second.options.jsonData.metricsMapping[0].code = fixtureYaml.replace('color: red', 'color: yellow');
          copy.panels.push(second);
          await api('POST', '/api/dashboards/db', { dashboard: copy, overwrite: true });
        }
        context = await browser.newContext({ viewport: { width: 1000, height: 700 }, locale: 'en-US' });
        if (headers.Authorization) {
          await context.route('**/*', (route) =>
            route.continue({
              headers:
                new URL(route.request().url()).origin === base.origin
                  ? { ...route.request().headers(), ...headers }
                  : route.request().headers(),
            })
          );
        }
        page = await context.newPage();
        page.setDefaultTimeout(20000);
        page.on('pageerror', (error) => pageErrors.push(error.message));
        page.on('request', (request) => requests.push(request.url()));
        await page.route('**/api/ds/query*', (route) =>
          route.fulfill({
            status: kind === 'error' ? 400 : 200,
            contentType: 'application/json',
            body: JSON.stringify(queryResult(kind)),
          })
        );
        if (process.env.PLUGIN_BUNDLE_DIR) {
          const bundle = path.resolve(process.env.PLUGIN_BUNDLE_DIR);
          await page.route('**/public/plugins/' + pluginId + '/**/*.js*', (route) => {
            const name = path.basename(new URL(route.request().url()).pathname);
            return route.fulfill({
              contentType: 'application/javascript',
              body: readFileSync(path.join(bundle, name)),
            });
          });
        }
        if (blockChunk) {
          await page.route(captureChunk, (route) => route.abort('failed'));
        }
        if (hook === 'accepted') {
          await page.addInitScript({
            content:
              receiverScript +
              '\nwindow.__captureTestFormulaCount = 0;' +
              '\nwindow.__captureTestReceiver = CaptureTest.installReceiver({panelId: 7, maxPayloadBytes: ' +
              receiverLimit +
              '});' +
              (pair
                ? `
              const firstHook=window.__SVG_MODIFIER_CAPTURE_V2__;
              window.__secondReceiver=CaptureTest.installReceiver({panelId:8,maxPayloadBytes:${receiverLimit}});
              const secondHook=window.__SVG_MODIFIER_CAPTURE_V2__;
              window.__SVG_MODIFIER_CAPTURE_V2__={connect(identity){return (identity.panelId===7?firstHook:secondHook).connect(identity);}};
              `
                : ''),
          });
        } else if (hook !== 'absent') {
          await page.addInitScript((mode) => {
            window.__captureTestCalls = [];
            const record = (name) => window.__captureTestCalls.push(name);
            if (mode === 'getter') {
              Object.defineProperty(window, '__SVG_MODIFIER_CAPTURE_V2__', {
                get() {
                  record('getter');
                  throw new Error('Synthetic hook getter failure');
                },
              });
              return;
            }
            window.__SVG_MODIFIER_CAPTURE_V2__ = {
              connect() {
                record('connect');
                if (mode === 'connect') {
                  throw new Error('Synthetic connect failure');
                }
                if (mode === 'declined') {
                  return null;
                }
                return {
                  protocolVersion: 2,
                  maxPayloadBytes: 1048576,
                  begin() {
                    record('begin');
                  },
                  publish() {
                    record('publish');
                    throw new Error('Synthetic publish failure');
                  },
                  fail() {
                    record('fail');
                  },
                  close() {
                    record('close');
                  },
                };
              },
            };
          }, hook);
        }
        const dashboardUrl = new URL(saved.url, base);
        if (!pair) {
          dashboardUrl.pathname = dashboardUrl.pathname.replace('/d/', '/d-solo/');
        }
        dashboardUrl.search = new URLSearchParams({
          ...(!pair ? { panelId: String(panelId) } : {}),
          from: String(fromMs),
          to: String(toMs),
          timezone: 'utc',
        }).toString();
        await page.goto(dashboardUrl.href, { waitUntil: 'domcontentloaded' });
        await check({ page, requests });
        assert.deepEqual(pageErrors, [], 'Unexpected browser page errors');
        passed++;
        process.stdout.write('PASS ' + id + ': ' + name + '\n');
      } catch (error) {
        const state = page ? await page.evaluate(() => window.__captureTestReceiver?.read()).catch(() => null) : null;
        const detail = {
          status: state?.status,
          generation: state?.generation,
          error: state?.error,
          evaluationStatus: state?.snapshot?.evaluationStatus,
          pageErrors,
          body: page
            ? (
                await page
                  .locator('body')
                  .innerText()
                  .catch(() => '')
              ).slice(0, 500)
            : undefined,
        };
        failures.push(id + ': ' + error.message);
        process.stdout.write('FAIL ' + id + ': ' + name + ': ' + error.stack + '\n' + JSON.stringify(detail) + '\n');
        // Если обычная страница не работает, дальнейшие проверки producer неинформативны.
        if (id === 'B01') {
          throw error;
        }
      } finally {
        await context?.close();
      }
    }

    async function visibleValue(page) {
      await page.waitForFunction(() => {
        const element = document.querySelector('#cell-a');
        const rect = element?.querySelector('rect');
        return (
          element?.querySelector('text')?.textContent === '95' &&
          rect &&
          getComputedStyle(rect).fill === 'rgb(255, 0, 0)'
        );
      });
    }
    async function snapshot(page) {
      await page.waitForFunction(() => window.__captureTestReceiver?.read().status.startsWith('terminal-'));
      const state = await page.evaluate(() => window.__captureTestReceiver.read());
      assert.equal(state.status, 'terminal-ok', JSON.stringify(state.error));
      assert.deepEqual(validateSnapshotV2(state.snapshot, { panelId, maxPayloadBytes }), []);
      assert.equal(state.payloadBytes, Buffer.byteLength(JSON.stringify(state.snapshot), 'utf8'));
      return state.snapshot;
    }
    const loadedCapture = (requests) => requests.some((url) => captureChunk.test(url));

    await scenario(
      'B01',
      'ordinary UI does not load capture chunk or install a hook',
      { hook: 'absent' },
      async ({ page, requests }) => {
        await visibleValue(page);
        assert.equal(await page.evaluate(() => '__SVG_MODIFIER_CAPTURE_V2__' in window), false);
        assert.equal(loadedCapture(requests), false);
      }
    );
    await scenario(
      'B02',
      'accepted receiver gets valid snapshot and actual applied DOM facts',
      {},
      async ({ page, requests }) => {
        await visibleValue(page);
        const value = await snapshot(page);
        assert.equal(loadedCapture(requests), true);
        assert.equal(value.evaluationStatus, 'evaluated');
        assert.equal(value.observed.dataState, 'Done');
        assert.equal(value.observed.effectiveFromMs, fromMs);
        assert.equal(value.observed.effectiveToMs, toMs);
        assert.equal(value.metrics[0].scalar.value, 95);
        assert.equal(value.metrics[0].scalar.level, 2);
        assert.equal(value.metrics[0].sources[0].fieldName, 'raw_alpha_metric');
        assert.equal(value.metrics[0].sources[0].frameName, 'Synthetic source');
        assert.equal(value.schemaVersion, 2);
        assert.equal('diagram' in value, false);
        assert.equal(
          value.objects.some((o) => o.name?.text === '95'),
          false
        );
        assert.ok(value.indicators[0].appearance.some((p) => JSON.stringify(p.fill?.rgba) === '[255,0,0,1]'));
      }
    );
    await scenario(
      'B03',
      'resize refreshes measured bounds and generation without repeating formula',
      { kind: 'resize' },
      async ({ page }) => {
        await visibleValue(page);
        const first = await snapshot(page);
        const firstWidth = await page.locator('#cell-a').evaluate((n) => n.getBoundingClientRect().width);
        const count = await page.evaluate(() => window.__captureTestFormulaCount);
        assert.ok(count > 0);
        await page.setViewportSize({ width: 700, height: 450 });
        await page.waitForFunction((generation) => {
          const state = window.__captureTestReceiver.read();
          return state.status === 'terminal-ok' && state.generation > generation;
        }, first.observed.generation);
        const resized = await snapshot(page);
        assert.notEqual(await page.locator('#cell-a').evaluate((n) => n.getBoundingClientRect().width), firstWidth);
        assert.equal(await page.evaluate(() => window.__captureTestFormulaCount), count);
        assert.equal(resized.metrics[0].scalar.value, 95);
      }
    );
    await scenario(
      'B04',
      'grid reports unsupported mode without hidden SVG DOM',
      { kind: 'grid' },
      async ({ page }) => {
        await page.waitForFunction(() => window.__captureTestReceiver.read().status === 'terminal-error');
        assert.equal(
          (await page.evaluate(() => window.__captureTestReceiver.read())).error.code,
          'CAPTURE_MODE_UNSUPPORTED'
        );
        assert.equal(await page.locator('#cell-a').count(), 0);
      }
    );
    await scenario(
      'B16',
      'label replacement preserves table row ownership',
      { kind: 'table-row' },
      async ({ page }) => {
        await visibleValue(page);
        const value = await snapshot(page);
        assert.equal(value.indicators.length, 2);
        for (const indicator of value.indicators) {
          assert.equal(indicator.binding.status, 'inferred');
          assert.equal(indicator.binding.basis, 'row_alignment');
          assert.deepEqual(
            indicator.objectIds.map((id) => value.objects.find((o) => o.id === id).name?.text),
            ['Service Alpha']
          );
          assert.equal(value.metrics.find((m) => m.id === indicator.state.winnerMetricId).scalar.value, 95);
          assert.deepEqual(indicator.state.color.rgba, [255, 0, 0, 1]);
          assert.ok(indicator.appearance.some((p) => JSON.stringify(p.fill?.rgba) === '[255,0,0,1]'));
          assert.equal(await page.locator('#' + indicator.id + ' text').textContent(), '95');
          assert.equal(
            await page.locator('#' + indicator.id + ' rect').evaluate((n) => getComputedStyle(n).fill),
            'rgb(255, 0, 0)'
          );
        }
        assert.ok(value.objects.every((o) => !['0', '95'].includes(o.name?.text)));
      }
    );

    for (const [id, kind] of [
      ['B05', 'yaml'],
      ['B06', 'svg'],
    ]) {
      await scenario(id, 'invalid ' + kind + ' produces a terminal diagnostic snapshot', { kind }, async ({ page }) => {
        const value = await snapshot(page);
        assert.equal(value.evaluationStatus, 'invalid_configuration');
        assert.equal(value.configurationStatus[kind], 'invalid');
        assert.ok(value.diagnostics.length > 0);
      });
    }
    await scenario(
      'B07',
      'query error produces an Error-state terminal snapshot',
      { kind: 'error' },
      async ({ page }) => {
        const value = await snapshot(page);
        assert.equal(value.observed.dataState, 'Error');
        assert.ok(value.diagnostics.length > 0);
      }
    );
    await scenario(
      'B08',
      'missing query remains unavailable with linked diagnostics',
      { kind: 'missing' },
      async ({ page }) => {
        const value = await snapshot(page);
        const missing = value.metrics.find((metric) => metric.query.refId === 'MISSING');
        assert.ok(missing);
        assert.equal(missing.availability, 'unavailable');
        assert.equal(missing.scalar, null);
        assert.ok(missing.diagnosticIds.length > 0);
        assert.equal(value.indicators[0].state.winnerMetricId, null);
      }
    );
    for (const [id, hook] of [
      ['B09', 'declined'],
      ['B10', 'getter'],
      ['B11', 'connect'],
    ]) {
      await scenario(
        id,
        hook + ' hook preserves ordinary UI and skips capture loading',
        { hook },
        async ({ page, requests }) => {
          await visibleValue(page);
          assert.ok((await page.evaluate(() => window.__captureTestCalls)).length > 0);
          assert.equal(loadedCapture(requests), false);
        }
      );
    }
    await scenario(
      'B12',
      'throwing publish callback preserves UI without an unhandled rejection',
      { hook: 'publish' },
      async ({ page, requests }) => {
        await visibleValue(page);
        await page.waitForFunction(() => window.__captureTestCalls.includes('fail'));
        assert.ok((await page.evaluate(() => window.__captureTestCalls)).includes('publish'));
        assert.equal(loadedCapture(requests), true);
      }
    );
    await scenario(
      'B13',
      'capture chunk rejection reports CAPTURE_EXPORT_FAILED while UI works',
      { blockChunk: true },
      async ({ page, requests }) => {
        await visibleValue(page);
        await page.waitForFunction(() => window.__captureTestReceiver.read().status === 'terminal-error');
        const state = await page.evaluate(() => window.__captureTestReceiver.read());
        assert.equal(state.error.code, 'CAPTURE_EXPORT_FAILED');
        assert.equal(loadedCapture(requests), true);
      }
    );
    await scenario(
      'B14',
      'receiver byte limit rejects the complete payload while UI keeps working',
      { receiverLimit: 1024 },
      async ({ page }) => {
        await visibleValue(page);
        await page.waitForFunction(() => window.__captureTestReceiver.read().status === 'terminal-error');
        const state = await page.evaluate(() => window.__captureTestReceiver.read());
        assert.equal(state.error.code, 'CAPTURE_PAYLOAD_TOO_LARGE');
        assert.equal(Object.hasOwn(state, 'snapshot'), false);
        assert.equal(Object.hasOwn(state, 'payloadBytes'), false);
      }
    );

    await scenario(
      'B15',
      'two panel roots with identical SVG IDs remain isolated',
      { pair: true },
      async ({ page }) => {
        const first = await snapshot(page);
        await page.waitForFunction(() => window.__secondReceiver.read().status === 'terminal-ok');
        const second = await page.evaluate(() => window.__secondReceiver.read().snapshot);
        assert.deepEqual(validateSnapshotV2(second, { panelId: 8, maxPayloadBytes }), []);
        assert.equal(first.indicators[0].id, second.indicators[0].id);
        assert.deepEqual(first.indicators[0].state.color.rgba, [255, 0, 0, 1]);
        assert.deepEqual(second.indicators[0].state.color.rgba, [255, 255, 0, 1]);
        assert.ok(first.indicators[0].appearance.some((p) => JSON.stringify(p.fill?.rgba) === '[255,0,0,1]'));
        assert.ok(second.indicators[0].appearance.some((p) => JSON.stringify(p.fill?.rgba) === '[255,255,0,1]'));
      }
    );

    for (const [id, kind] of [
      ['N30', 'warnings-visible'],
      ['N31', 'warnings-muted'],
    ]) {
      await scenario(id, 'gray tooltip: missing input, null and rule-level muting', { kind }, async ({ page }) => {
        const value = await snapshot(page);
        assert.ok(value.diagnostics.some((d) => d.code === 'MISSING_INPUT'));
        assert.ok(value.diagnostics.some((d) => d.code === 'MISSING_VALUE'));
        assert.ok(value.indicators[0].state.noData);
        assert.equal(
          await page.locator('#cell-a rect').evaluate((el) => getComputedStyle(el).fill),
          'rgb(142, 142, 142)'
        );
        await page.locator('#cell-a').hover();
        const tooltip = page.locator('[data-tooltip-id="cell-a"]');
        await tooltip.waitFor();
        const general = tooltip.getByText('Нет данных для определения состояния', { exact: true });
        assert.equal(await general.evaluate((el) => getComputedStyle(el).fontSize), '12px');
        assert.equal(await tooltip.getByText('Synthetic note').evaluate((el) => getComputedStyle(el).fontSize), '13px');
        assert.equal(await tooltip.locator('li').count(), kind === 'warnings-muted' ? 0 : 2);
        if (kind === 'warnings-visible') {
          assert.equal(
            await tooltip
              .locator('li')
              .first()
              .evaluate((el) => getComputedStyle(el).fontSize),
            '12px'
          );
        }
      });
    }
    await scenario(
      'N32',
      'real error remains; pinned tooltip follows data loss and recovery',
      { kind: 'warnings-mixed' },
      async ({ page }) => {
        await visibleValue(page);
        const value = await snapshot(page);
        assert.ok(value.diagnostics.some((d) => d.code === 'MISSING_INPUT'));
        assert.ok(value.diagnostics.some((d) => d.code === 'NON_FINITE_VALUE'));
        await page.locator('#cell-a rect').hover();
        const tooltip = page.locator('[data-tooltip-id="cell-a"]');
        await tooltip.waitFor();
        assert.equal(await tooltip.locator('li').count(), 1);
        assert.match(await tooltip.locator('li').innerText(), /Формула не вернула конечное число/);
        assert.equal(await tooltip.locator('li').evaluate((el) => getComputedStyle(el).fontSize), '12px');
        assert.equal(
          await tooltip.getByText('95', { exact: true }).evaluate((el) => getComputedStyle(el).fontSize),
          '13px'
        );
        await page.locator('#cell-a rect').click({ button: 'right' });
        await page.mouse.move(900, 600);
        const pinned = page.locator('[data-tooltip-id$="-cell-a"]');
        await pinned.waitFor();
        let current = null;
        await page.route('**/api/ds/query*', (route) => {
          const result = queryResult('warnings-mixed');
          result.results.A.frames[0].data.values[1] = [current];
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
        });
        // Настоящее dashboard refresh обновляет закреплённый tooltip без новой навигации.
        await pinned.getByText('Нет данных для определения состояния', { exact: true }).waitFor();
        assert.equal(await pinned.locator('li').count(), 1);
        current = 10;
        await pinned.getByText('10', { exact: true }).waitFor();
        assert.equal(await pinned.getByText('Нет данных для определения состояния', { exact: true }).count(), 0);
        assert.equal(await page.locator('#cell-a rect').evaluate((el) => getComputedStyle(el).fill), 'rgb(0, 128, 0)');
        assert.equal((await snapshot(page)).metrics.find((metric) => metric.query.refId === 'A').scalar.value, 10);
      }
    );
  } finally {
    try {
      await browser?.close();
    } catch (error) {
      failures.push('Browser cleanup: ' + error.message);
    }
    for (const uid of dashboards.reverse()) {
      try {
        await api('DELETE', '/api/dashboards/uid/' + uid);
      } catch (error) {
        failures.push('Dashboard cleanup: ' + error.message);
      }
    }
    if (datasourceCreated) {
      try {
        await api('DELETE', '/api/datasources/uid/' + datasourceUid);
      } catch (error) {
        failures.push('Datasource cleanup: ' + error.message);
      }
    }
    rmSync(output, { recursive: true, force: true });
  }
  process.stdout.write('Browser acceptance: ' + passed + ' passed, ' + failures.length + ' failed.\n');
  if (failures.length) {
    throw new Error(failures.join('\n'));
  }
}

main().catch((error) => {
  process.stderr.write(error.stack + '\n');
  process.exitCode = 1;
});
