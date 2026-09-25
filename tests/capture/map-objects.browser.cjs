const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const webpack = require('webpack');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const output = mkdtempSync(path.join(tmpdir(), 'svg-map-objects-'));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400">
 <defs><linearGradient id="g"><stop stop-color="red"/></linearGradient></defs>
 <g data-cell-id="own" id="cell-own"><rect width="110" height="30" fill="red"/><text x="5" y="20">Own name</text></g>
 <g data-cell-id="frame"><rect x="150" width="120" height="80" fill="#eee"/><text x="155" y="20">Alpha</text><text x="155" y="55">Beta</text></g>
 <a href="/d/details/view"><g opacity="0.5"><g id="cell-alpha"><circle cx="255" cy="15" r="5" fill="green"/></g></g></a>
 <g id="cell-beta"><circle cx="255" cy="50" r="5" fill="yellow"/></g>
 <g data-cell-id="amb"><rect x="300" width="200" height="40" fill="#eee"/><text x="310" y="23">Left</text><text x="430" y="23">Right</text></g>
 <g id="cell-amb"><circle cx="400" cy="18" r="5"/></g>
 <g id="cell-dynamic"><text x="5" y="110">42</text></g>
 <g style="display:none"><text x="100" y="110">Hidden</text><circle id="cell-hidden" r="5"/></g>
 <g id="cell-edge"><path d="M 0 150 L 100 150" stroke="url(#g)" fill="none"/></g>
 <g data-cell-id="stretched"><rect x="520" width="100" height="35" fill="gray"/><foreignObject x="520" width="260" height="35"><div xmlns="http://www.w3.org/1999/xhtml" style="width:max-content">Small card</div></foreignObject></g>
 <g id="cell-outside"><circle cx="740" cy="15" r="5"/></g>
 <text x="5" y="190">Static caption</text>
 </svg>`;

async function compile() {
  await new Promise((resolve, reject) => {
    const compiler = webpack({
      mode: 'development',
      devtool: false,
      target: 'web',
      entry: path.join(__dirname, 'map-objects-entry.ts'),
      output: { path: output, filename: 'map.js', library: { name: 'MapTest', type: 'var' } },
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
      compiler.close(() =>
        error || stats.hasErrors() ? reject(error || Error(stats.toString({ all: false, errors: true }))) : resolve()
      )
    );
  });
}

async function main() {
  await compile();
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    const page = await browser.newPage();
    await page.route('**/*', (route) => route.abort());
    await page.setContent('<div id="host"></div><div id="other"></div>');
    await page.addScriptTag({ path: path.join(output, 'map.js') });
    await page.evaluate((svg) => {
      document.getElementById('host').innerHTML = svg;
      document.getElementById('other').innerHTML = svg.replace('Own name', 'Other panel');
      window.collect = () => {
        const root = document.querySelector('#host svg');
        const targets = new Map([...root.querySelectorAll('[id^="cell-"]')].map((n) => [n.id, n]));
        const indicators = [...targets.keys()].map((id) => ({
          id,
          objectIds: [],
          binding: { status: 'unresolved', basis: 'none', candidateObjectIds: [] },
          visible: null,
          appearance: [],
          navigation: [],
          tooltip: { status: 'available' },
        }));
        const before = root.outerHTML;
        const objects = MapTest.collectMapObjects({
          root,
          targets,
          dynamicText: new Set([targets.get('cell-dynamic')]),
          indicators,
          navigation: (url) => [{ linkId: url, use: 'applied' }],
        });
        return { objects, indicators, mutated: before !== root.outerHTML };
      };
    }, svg);
    const check = async (name, fn) => {
      try {
        await fn();
        results.push({ name, ok: true });
      } catch (e) {
        results.push({ name, ok: false, error: e.message });
      }
    };
    let data = await page.evaluate(() => collect());
    const indicator = (id) => data.indicators.find((i) => i.id === id);
    const names = (id) => indicator(id).objectIds.map((id) => data.objects.find((o) => o.id === id).name?.text);
    await check('V18 own label and root isolation', () => {
      assert.deepEqual(names('cell-own'), ['Own name']);
      assert.equal(indicator('cell-own').binding.status, 'direct');
      assert.equal(
        data.objects.some((o) => o.name?.text === 'Other panel'),
        false
      );
    });
    await check('V19 separate rows in one drawn frame', () => {
      assert.deepEqual(names('cell-alpha'), ['Alpha']);
      assert.deepEqual(names('cell-beta'), ['Beta']);
      assert.equal(indicator('cell-alpha').binding.basis, 'row_alignment');
    });
    await check('V20 no arbitrary choice on ambiguous row', () => {
      assert.equal(indicator('cell-amb').binding.status, 'ambiguous');
      assert.deepEqual(indicator('cell-amb').objectIds, []);
      assert.equal(indicator('cell-amb').binding.candidateObjectIds.length, 2);
    });
    await check('V21 hidden and dynamically replaced text are not names', () => {
      assert.equal(
        data.objects.some((o) => ['Hidden', '42'].includes(o.name?.text)),
        false
      );
      assert.equal(indicator('cell-hidden').visible, false);
      assert.equal(indicator('cell-hidden').tooltip.status, 'not_rendered');
      assert.equal(indicator('cell-dynamic').visible, true);
      assert.ok(indicator('cell-dynamic').appearance.length);
    });
    await check('V22 actual paints, opacity and applied link', () => {
      assert.deepEqual(indicator('cell-alpha').appearance[0].fill.rgba, [0, 128, 0, 1]);
      assert.equal(indicator('cell-alpha').appearance[0].effectiveOpacity, 0.5);
      assert.equal(indicator('cell-alpha').navigation[0].linkId, '/d/details/view');
      assert.equal(indicator('cell-edge').appearance[0].stroke.kind, 'other');
    });
    await check('V23 no stretched foreignObject enclosure or invented edge', () => {
      assert.deepEqual(names('cell-outside'), []);
      assert.deepEqual(names('cell-edge'), []);
      assert.equal(
        data.objects.some((o) => o.name?.text === 'Static caption'),
        true
      );
      assert.equal(data.mutated, false);
    });
    await check('V24 group records do not acquire their children colors', () => {
      const alpha = data.objects.find((o) => o.name?.text === 'Alpha'),
        beta = data.objects.find((o) => o.name?.text === 'Beta');
      assert.ok(alpha.parentId);
      assert.equal(alpha.parentId, beta.parentId);
      const parent = data.objects.find((o) => o.id === alpha.parentId);
      assert.equal(parent.kind, 'group');
      assert.deepEqual(parent.indicatorIds, []);
      assert.equal('color' in parent, false);
    });
    await check('V25 updated label and resize preserve binding', async () => {
      await page.evaluate(() => {
        document.querySelector('#host [data-cell-id="frame"] text').textContent = 'Renamed';
        document.querySelector('#host svg').style.width = '400px';
      });
      data = await page.evaluate(() => collect());
      assert.deepEqual(names('cell-alpha'), ['Renamed']);
      assert.deepEqual(names('cell-beta'), ['Beta']);
    });
    for (const result of results) process.stdout.write(JSON.stringify(result) + '\n');
    assert.equal(results.filter((r) => !r.ok).length, 0);
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  process.stderr.write(error.stack + '\n');
  process.exitCode = 1;
});
