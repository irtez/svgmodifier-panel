const assert = require('node:assert/strict');
const { readFileSync, mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const webpack = require('webpack');
const { chromium } = require('playwright');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs' } });
const { validateSnapshot } = require('../../src/components/capture/testing/validateSnapshot');

const root = path.resolve(__dirname, '../..');
const output = mkdtempSync(path.join(tmpdir(), 'svgmodifier-diagram-browser-'));
const xml =
  '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>' +
  '<mxCell id="alpha" vertex="1" parent="1"/><mxCell id="beta" vertex="1" parent="1"/>' +
  '<mxCell id="edge-alpha" edge="1" source="alpha" target="beta" parent="1" style="endArrow=classic;startArrow=none;"/>' +
  '</root></mxGraphModel>';
const svg = readFileSync(path.join(__dirname, 'diagram.svg'), 'utf8');
const base = JSON.parse(readFileSync(path.join(root, 'docs/examples/capture-v1.json'), 'utf8'));
const escaped = (text) =>
  text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const withMetadata = (content) => svg.replace('<svg ', '<svg content="' + escaped(content) + '" ');
const compressed =
  '<mxfile><diagram>' +
  zlib.deflateRawSync(Buffer.from(encodeURIComponent(xml))).toString('base64') +
  '</diagram></mxfile>';

function compile() {
  return new Promise((resolve, reject) => {
    const compiler = webpack({
      mode: 'development',
      devtool: false,
      target: 'web',
      entry: path.join(__dirname, 'diagram-entry.ts'),
      output: { path: output, filename: 'diagram.js', library: { name: 'DiagramTest', type: 'var' } },
      resolve: { extensions: ['.ts', '.js'], modules: [path.join(root, 'src'), 'node_modules'] },
      module: {
        rules: [
          {
            test: /\.ts$/,
            exclude: /node_modules/,
            use: { loader: 'swc-loader', options: { jsc: { parser: { syntax: 'typescript' }, target: 'es2020' } } },
          },
        ],
      },
    });
    compiler.run((error, stats) =>
      compiler.close(() => {
        if (error) {
          reject(error);
        } else if (stats.hasErrors()) {
          reject(new Error(stats.toString({ all: false, errors: true })));
        } else {
          resolve();
        }
      })
    );
  });
}

async function main() {
  await compile();
  const browser = await chromium.launch({ headless: true });
  const failures = [];
  let passed = 0;
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 700 }, locale: 'ru-RU' });
    const requests = [];
    page.on('request', (request) => requests.push(request.url()));
    await page.route('**/*', (route) => route.abort());
    await page.setContent(
      '<style>body { margin:0; } #host { margin:50px 0 0 30px; width:800px; height:400px; }</style><div id="host"></div>'
    );
    await page.addScriptTag({ path: path.join(output, 'diagram.js') });
    await page.evaluate(
      async ({ svg, base }) => {
        const host = document.getElementById('host');
        const doc = DiagramTest.initSVG(svg);
        const live = doc.documentElement;
        host.appendChild(live);
        const source = await DiagramTest.prepareDiagram(svg);
        const before = live.outerHTML;
        const capture = DiagramTest.collectDiagram({
          source,
          root: live,
          mode: 'svg',
          rules: base.configuration.rules,
        });
        window.testState = { host, live, source, base };
        window.initial = DiagramTest.attachDiagram(base, capture);
        window.captureMutated = before !== live.outerHTML;
      },
      { svg: withMetadata(xml), base }
    );

    async function check(name, action) {
      try {
        await action();
        passed++;
        process.stdout.write('PASS ' + name + '\n');
      } catch (error) {
        failures.push(name + ': ' + error.message);
        process.stdout.write('FAIL ' + name + ': ' + error.message + '\n');
      }
    }
    const initial = await page.evaluate(() => window.initial);
    const item = (value, id) => value.diagram.items.find((entry) => entry.svgId === id);
    const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.1, actual + ' != ' + expected);

    await check('V06: real viewBox/transform bounds and valid full snapshot', async () => {
      assert.deepEqual(validateSnapshot(initial, { panelId: 7, maxPayloadBytes: 4 * 1024 * 1024 }), []);
      assert.equal(initial.diagram.status, 'rendered');
      assert.deepEqual(initial.diagram.viewport, { x: 0, y: 0, width: 800, height: 400 });
      const bounds = item(initial, 'alpha-shape').bounds;
      close(bounds.x, 40);
      close(bounds.y, 90);
      close(bounds.width, 160);
      close(bounds.height, 60);
      assert.equal(await page.evaluate(() => window.captureMutated), false);
    });

    await check('V07: static CSS, inherited HTML color, gradient, mixed paint and markers', async () => {
      const shape = item(initial, 'alpha-shape').paints[0];
      assert.deepEqual(shape.fill.rgba, [34, 197, 94, 1]);
      assert.deepEqual(shape.stroke.rgba, [3, 4, 5, 1]);
      close(shape.fillOpacity, 0.8);
      close(shape.strokeOpacity, 0.6);
      assert.equal(item(initial, 'cell-table').paints[0].fill.rgba, null);
      assert.match(item(initial, 'cell-table').paints[0].fill.css, /url\(/);
      assert.ok(
        item(initial, 'html-label').paints.some((paint) => JSON.stringify(paint.textColor?.rgba) === '[0,0,255,1]')
      );
      assert.deepEqual(item(initial, 'mixed').paints, []);
      const children = initial.diagram.items.filter((entry) => entry.parentId === item(initial, 'mixed').id);
      assert.deepEqual(
        children.map((entry) => entry.paints[0].fill.rgba),
        [
          [255, 0, 0, 1],
          [0, 0, 255, 1],
        ]
      );
      assert.match(item(initial, 'cell-link-alpha-beta').paints[0].markers.end, /arrowhead/);
      assert.equal(
        initial.elements.some((entry) => entry.id === 'static-green'),
        false
      );
    });

    await check('V08: text without IDs, multiline text/HTML, hidden nodes and use/image', async () => {
      const all = initial.diagram.items.flatMap((entry) => entry.textFragments.map((fragment) => fragment.text));
      assert.ok(all.includes('Unbound caption'));
      assert.ok(all.includes('Service'));
      assert.ok(all.includes('Beta'));
      assert.ok(all.includes('second line'));
      assert.equal(all.includes('Not displayed'), false);
      assert.equal(item(initial, 'hidden').bounds, null);
      assert.equal(item(initial, 'image-heading').authoredText, null);
      assert.equal(item(initial, 'resource-icon'), undefined);
      assert.equal(item(initial, 'icon-instance').tag, 'use');
      assert.ok(item(initial, 'icon-instance').bounds.width > 0);
      assert.equal(item(initial, 'icon-instance').paints.length, 0);
      assert.ok(initial.diagnostics.some((entry) => entry.code === 'CAPTURE_USE_PAINT_UNAVAILABLE'));
    });

    await check('V09: explicit metadata relationships, no endpoints guessed from ID', async () => {
      assert.equal(initial.diagram.connections.length, 1);
      const edge = initial.diagram.connections[0];
      assert.deepEqual(edge.source, { cellId: 'alpha', svgId: 'cell-alpha', itemId: item(initial, 'cell-alpha').id });
      assert.deepEqual(edge.target, { cellId: 'beta', svgId: 'cell-beta', itemId: item(initial, 'cell-beta').id });
      assert.equal(edge.itemId, item(initial, 'cell-link-alpha-beta').id);
      assert.equal(edge.markers.end, 'classic');
      const without = await page.evaluate(async (svg) => {
        const { live, base } = window.testState;
        return DiagramTest.collectDiagram({
          source: await DiagramTest.prepareDiagram(svg),
          root: live,
          mode: 'svg',
          rules: base.configuration.rules,
        }).diagram;
      }, svg);
      assert.deepEqual(without.connections, []);
    });

    await check('V10: actual plugin label/link operations preserve authored values and none paint', async () => {
      const updated = await page.evaluate(() => {
        const { live, source, base } = window.testState;
        DiagramTest.createSvgUpdateOperation(
          live.querySelector('#cell-alpha'),
          { label: 'replace', link: '/d/new?from=now-3h&var-node=alpha' },
          {
            counter: 1,
            label: 'Reading',
            metricValue: 12.34567,
            displayValue: '12.35',
            lvl: 2,
            color: 'red',
            filling: 'none',
          }
        )();
        const before = live.outerHTML;
        const result = DiagramTest.attachDiagram(
          base,
          DiagramTest.collectDiagram({ source, root: live, mode: 'svg', rules: base.configuration.rules })
        );
        if (before !== live.outerHTML) {
          throw new Error('Capture changed SVG');
        }
        return result;
      });
      assert.equal(updated.elements[0].label, '12.35');
      assert.match(item(updated, 'cell-alpha').authoredText, /Service Alpha/);
      assert.equal(item(updated, 'cell-alpha').links.applied, '/d/new?from=now-3h&var-node=alpha');
      assert.ok(
        item(updated, 'cell-alpha').links.declarations.some(
          (link) => link.origin === 'svg' && link.value.includes('/d/original')
        )
      );
      assert.equal(updated.metrics[0].scalar.color, '#ef4444');
      assert.deepEqual(item(updated, 'alpha-shape').paints[0].fill.rgba, [34, 197, 94, 1]);
    });

    await check('V11: resize/transform are measured again, never cached as old coordinates', async () => {
      const resized = await page.evaluate(() => {
        const { host, live, source, base } = window.testState;
        host.style.width = '400px';
        host.style.height = '200px';
        live.querySelector('#layer').setAttribute('transform', 'translate(20 10)');
        return DiagramTest.collectDiagram({ source, root: live, mode: 'svg', rules: base.configuration.rules }).diagram;
      });
      const bounds = resized.items.find((entry) => entry.svgId === 'alpha-shape').bounds;
      close(bounds.x, 30);
      close(bounds.y, 35);
      close(bounds.width, 80);
      close(bounds.height, 30);
    });

    await check('V12: native compressed draw.io metadata and unresolved target', async () => {
      const result = await page.evaluate(
        async ({ compressed, partial }) => {
          const { live, base } = window.testState;
          const read = async (svg) =>
            DiagramTest.collectDiagram({
              source: await DiagramTest.prepareDiagram(svg),
              root: live,
              mode: 'svg',
              rules: base.configuration.rules,
            });
          const a = await read(compressed);
          const b = await read(partial);
          return { compressed: a.diagram, partial: b.diagram, diagnostics: b.diagnostics };
        },
        { compressed: withMetadata(compressed), partial: withMetadata(xml.replace('target="beta"', 'target="absent"')) }
      );
      assert.equal(result.compressed.connections.length, 1);
      assert.deepEqual(result.partial.connections[0].target, { cellId: 'absent', svgId: null, itemId: null });
      assert.ok(result.diagnostics.some((entry) => entry.code === 'CAPTURE_METADATA_TARGET_UNRESOLVED'));
    });

    await check('V13: source parsing does not load images, links, scripts or DTD', async () => {
      const before = requests.length;
      const result = await page.evaluate(async () => {
        const text =
          '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">' +
          '<svg xmlns="http://www.w3.org/2000/svg"><script>globalThis.captureExecuted=true</script>' +
          '<image href="https://example.invalid/image.png"/><a href="https://example.invalid/link"><text>Label</text></a></svg>';
        const source = await DiagramTest.prepareDiagram(text);
        return {
          capture: DiagramTest.collectDiagram({ source, root: null, mode: 'grid', rules: [] }).diagram,
          executed: globalThis.captureExecuted === true,
        };
      });
      assert.equal(result.executed, false);
      assert.equal(requests.length, before);
      assert.equal(result.capture.status, 'not_rendered');
    });
    await check('V20: wrapped HTML lines, switch fallback and inherited hidden state', async () => {
      const result = await page.evaluate(async () => {
        const source =
          '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200">' +
          '<switch><foreignObject id="wrapped" width="60" height="150">' +
          '<div xmlns="http://www.w3.org/1999/xhtml" style="font:16px monospace;width:60px">Alpha Beta Gamma</div>' +
          '</foreignObject><text x="5" y="15">Fallback label</text></switch>' +
          '<g style="opacity:0"><text x="5" y="150">Transparent label</text></g>' +
          '<g visibility="hidden"><text x="5" y="175">Hidden label</text></g></svg>';
        const { host } = window.testState;
        const doc = DiagramTest.initSVG(source);
        const live = doc.documentElement;
        host.replaceChildren(live);
        return DiagramTest.collectDiagram({
          source: await DiagramTest.prepareDiagram(source),
          root: live,
          mode: 'svg',
          rules: [],
        }).diagram;
      });
      const fragments = result.items.flatMap((entry) => entry.textFragments);
      assert.deepEqual(
        fragments.map((entry) => entry.text),
        ['Alpha', 'Beta', 'Gamma']
      );
      assert.ok(fragments[0].bounds.y < fragments[1].bounds.y && fragments[1].bounds.y < fragments[2].bounds.y);
    });

    await check('V21: authored anonymous text survives new link wrappers and source stays detached', async () => {
      const result = await page.evaluate(async () => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg"><g id="a"><text x="5" y="20">Original</text></g></svg>';
        const source = await DiagramTest.prepareDiagram(svg);
        const live = DiagramTest.initSVG(svg).documentElement;
        window.testState.host.replaceChildren(live);
        DiagramTest.createSvgUpdateOperation(
          live.querySelector('#a'),
          { label: 'replace', link: '/d/new' },
          { counter: 1, label: 'Reading', metricValue: 7, displayValue: '7', lvl: 0, color: 'green', filling: 'none' }
        )();
        const capture = DiagramTest.collectDiagram({ source, root: live, mode: 'svg', rules: [] });
        return {
          diagram: capture.diagram,
          sourceConnected: source.root.isConnected && source.root.ownerDocument === document,
        };
      });
      const text = result.diagram.items.find((entry) => entry.tag === 'text');
      assert.equal(text.authoredText, 'Original');
      assert.equal(text.textFragments[0].text, '7');
      assert.equal(text.links.applied, '/d/new');
      assert.equal(result.sourceConnected, false);
    });
    await check('V22: link wrapper opacity is preserved as structural visibility', async () => {
      const result = await page.evaluate(async () => {
        const svg =
          '<svg xmlns="http://www.w3.org/2000/svg"><a href="/target" opacity="0"><rect id="shape" width="20" height="20" fill="green"/></a></svg>';
        const live = DiagramTest.initSVG(svg).documentElement;
        window.testState.host.replaceChildren(live);
        return DiagramTest.collectDiagram({
          source: await DiagramTest.prepareDiagram(svg),
          root: live,
          mode: 'svg',
          rules: [],
        }).diagram;
      });
      const shape = result.items.find((entry) => entry.svgId === 'shape');
      const parent = result.items.find((entry) => entry.id === shape.parentId);
      assert.equal(parent.tag, 'a');
      assert.equal(parent.visibility.opacity, 0);
    });

    await check('V23: mismatched source/live cell IDs never confirm metadata endpoints', async () => {
      const result = await page.evaluate(async (svg) => {
        const source = await DiagramTest.prepareDiagram(svg);
        const live = DiagramTest.initSVG(svg).documentElement;
        window.testState.host.replaceChildren(live);
        live.querySelector('#cell-alpha').setAttribute('data-cell-id', 'beta');
        live.querySelector('#cell-beta').setAttribute('data-cell-id', 'alpha');
        return DiagramTest.collectDiagram({ source, root: live, mode: 'svg', rules: [] });
      }, withMetadata(xml));
      const edge = result.diagram.connections[0];
      assert.deepEqual(edge.source, { cellId: 'alpha', svgId: null, itemId: null });
      assert.deepEqual(edge.target, { cellId: 'beta', svgId: null, itemId: null });
      assert.ok(result.diagnostics.some((entry) => entry.code === 'CAPTURE_METADATA_SOURCE_UNRESOLVED'));
      assert.ok(result.diagnostics.some((entry) => entry.code === 'CAPTURE_METADATA_TARGET_UNRESOLVED'));
    });
    process.stdout.write(
      JSON.stringify(
        { browser: browser.version(), passed, failures, requests: requests.length, bundle: output },
        null,
        2
      ) + '\n'
    );
    if (failures.length) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
