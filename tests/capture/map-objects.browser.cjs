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
 <g data-cell-id="table-row"><rect x="5" y="290" width="250" height="50" fill="none" stroke="none"/><text x="10" y="320">Row name</text></g>
 <g id="cell-number-a"><rect x="100" y="300" width="50" height="30" fill="gray"/><text x="110" y="320">0</text></g>
 <g id="cell-number-b"><rect x="160" y="300" width="50" height="30" fill="gray"/><text x="170" y="320">1</text></g>
 <g data-cell-id="wrapped"><rect x="520" y="150" width="130" height="80" fill="gray"/><foreignObject x="525" y="155" width="90" height="60"><div xmlns="http://www.w3.org/1999/xhtml" style="font:16px Arial">Gateway service</div></foreignObject></g>
 <circle id="cell-wrapped" cx="635" cy="175" r="5" fill="red"/>
 <text y="235"><tspan id="cell-span-a" fill="red">Alpha</tspan><tspan id="cell-span-b" x="160" fill="blue">Beta</tspan></text>
 <text id="cell-mixed" y="265"><tspan fill="red">Red </tspan><tspan fill="blue">Blue</tspan></text>
 <g data-cell-id="transparent"><rect x="300" y="250" width="150" height="40" fill="gray"/><text x="310" y="275" fill-opacity="0">Hidden fallback</text></g>
 <circle id="cell-transparent" cx="435" cy="270" r="5" fill="green"/>
 <g data-cell-id="not-drawn"><rect x="520" y="270" width="200" height="40" fill="none" stroke="none"/><text x="530" y="295">No enclosure</text></g>
 <circle id="cell-not-drawn" cx="705" cy="290" r="5" fill="green"/>
 <defs><symbol id="icon"><circle cx="5" cy="5" r="5" fill="green"/></symbol></defs><use id="cell-use" href="#icon" x="5" y="320" fill="red"/>
 <defs><clipPath id="clip"><rect width="1" height="1"/></clipPath></defs><g id="cell-clipped"><rect x="300" y="320" width="170" height="50" fill="gray"/><text x="310" y="345" clip-path="url(#clip)">Clipped label</text></g>
 <a href="/d/original/view"><g id="cell-linked"><circle cx="540" cy="350" r="5" fill="green"/></g></a>
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
      MapTest.updateLinkForElement(document.querySelector('#host #cell-linked'), '/d/override/view');
      window.collect = (dynamicIds = ['cell-dynamic']) => {
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
          dynamicText: new Set(dynamicIds.map((id) => targets.get(id)).filter(Boolean)),
          indicators,
          navigation: (url, use = 'applied') => [{ linkId: url, use }],
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
    await check('V30 automatic wrap stays one logical label', () =>
      assert.deepEqual(names('cell-wrapped'), ['Gateway service'])
    );
    await check('V31 separate tspan targets and mixed text paints retain ownership', () => {
      assert.deepEqual(names('cell-span-a'), ['Alpha']);
      assert.deepEqual(names('cell-span-b'), ['Beta']);
      assert.equal(indicator('cell-span-b').visible, true);
      const fills = indicator('cell-mixed').appearance.map((p) => JSON.stringify(p.fill?.rgba));
      assert.ok(fills.includes('[255,0,0,1]') && fills.includes('[0,0,255,1]'));
    });
    await check('V32 transparent label or unpainted enclosure is not visual evidence', () => {
      assert.equal(
        data.objects.some((o) => o.name?.text === 'Hidden fallback'),
        false
      );
      assert.deepEqual(names('cell-transparent'), []);
      assert.deepEqual(names('cell-not-drawn'), []);
    });
    await check('V33 use shadow paint is not guessed from the instance style', () => {
      assert.equal(indicator('cell-use').visible, true);
      assert.deepEqual(indicator('cell-use').appearance, []);
    });
    await check('V35 unsupported clipping does not produce a visible name', () => {
      assert.equal(
        data.objects.some((o) => o.name?.text === 'Clipped label'),
        false
      );
      assert.deepEqual(names('cell-clipped'), []);
    });
    await check('V36 original SVG and overridden applied links remain separate', () => {
      assert.ok(
        indicator('cell-linked').navigation.some((n) => n.linkId === '/d/original/view' && n.use === 'declared')
      );
      assert.ok(
        indicator('cell-linked').navigation.some((n) => n.linkId === '/d/override/view' && n.use === 'applied')
      );
    });
    await check('V37 table row needs repeated visible cells, not only an invisible box', () => {
      const objects = ['cell-number-a', 'cell-number-b'].map((id) =>
        data.objects.find((o) => o.id === indicator(id).objectIds[0])
      );
      assert.ok(objects[0].parentId);
      assert.equal(objects[0].parentId, objects[1].parentId);
      assert.equal(data.objects.find((o) => o.id === objects[0].parentId).name.text, 'Row name');
      assert.deepEqual(names('cell-not-drawn'), []);
    });
    // Independent row labels and literal coordinates: calculated values must not
    // become object names or erase the visual relationship to their row.
    const table = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="220" viewBox="0 0 600 220">
      <g data-cell-id="row-a"><rect x="0" y="10" width="500" height="60" fill="none" stroke="none"/><text x="10" y="45">Queue</text></g>
      <g data-cell-id="row-b"><rect x="0" y="90" width="500" height="60" fill="none" stroke="none"/><text x="10" y="125">Worker</text></g>
      <g id="cell-a1"><rect x="220" y="20" width="80" height="40" fill="green"/><text x="240" y="45">17</text></g>
      <g id="cell-a2"><rect x="330" y="20" width="80" height="40" fill="red"/><text x="350" y="45">23</text></g>
      <g id="cell-b1"><rect x="220" y="100" width="80" height="40" fill="gray"/><text x="240" y="125">0</text></g>
      <g id="cell-b2"><rect x="330" y="100" width="80" height="40" fill="gray"/><text x="350" y="125">0</text></g>
    </svg>`;
    const dynamicIds = ['cell-a1', 'cell-a2', 'cell-b1', 'cell-b2'];
    const resetTable = () => page.evaluate((svg) => (document.querySelector('#host').innerHTML = svg), table);
    const readTable = async () => (data = await page.evaluate((ids) => collect(ids), dynamicIds));
    await resetTable();
    await readTable();
    await check('V38 dynamic table cells retain their row label, never their numeric text', () => {
      assert.deepEqual(names('cell-a1'), ['Queue']);
      assert.deepEqual(names('cell-a2'), ['Queue']);
      assert.deepEqual(names('cell-b1'), ['Worker']);
      assert.deepEqual(names('cell-b2'), ['Worker']);
      assert.equal(indicator('cell-a1').binding.status, 'inferred');
      assert.equal(indicator('cell-a1').binding.basis, 'row_alignment');
      assert.ok(data.objects.every((o) => !['17', '23', '0'].includes(o.name?.text)));
      assert.equal(data.mutated, false);
      assert.deepEqual(indicator('cell-a2').appearance[0].fill.rgba, [255, 0, 0, 1]);
    });
    await check('V39 empty or changed values and resize do not break table ownership', async () => {
      await page.evaluate(() => {
        document.querySelector('#host #cell-a1 text').textContent = '';
        document.querySelector('#host #cell-a2 text').textContent = '999';
        document.querySelector('#host svg').style.width = '300px';
      });
      await readTable();
      assert.deepEqual(names('cell-a1'), ['Queue']);
      assert.deepEqual(names('cell-a2'), ['Queue']);
      assert.deepEqual(names('cell-b1'), ['Worker']);
      assert.equal(data.mutated, false);
    });
    await check('V40 a hidden second cell or overlapping rectangles do not prove a table row', async () => {
      for (const variant of ['hidden', 'overlap', 'unpainted', 'clipped', 'zero-width', 'zero-height']) {
        await resetTable();
        await page.evaluate((variant) => {
          const cell = document.querySelector('#host #cell-a2');
          if (variant === 'hidden') cell.style.display = 'none';
          if (variant === 'overlap') cell.querySelector('rect').setAttribute('x', '220');
          if (variant === 'unpainted') cell.querySelector('rect').setAttribute('fill', 'none');
          if (variant === 'clipped') cell.style.clipPath = 'inset(0)';
          if (variant === 'zero-width') cell.querySelector('rect').setAttribute('width', '0');
          if (variant === 'zero-height') cell.querySelector('rect').setAttribute('height', '0');
        }, variant);
        await readTable();
        assert.deepEqual(names('cell-a1'), [], variant);
        assert.equal(indicator('cell-a1').binding.status, 'unresolved', variant);
      }
    });
    await check('V41 competing table row labels remain ambiguous', async () => {
      await resetTable();
      await page.evaluate(() => {
        const other = document.querySelector('#host [data-cell-id="row-a"]').cloneNode(true);
        other.setAttribute('data-cell-id', 'row-alternative');
        other.querySelector('text').textContent = 'Alternative';
        document.querySelector('#host svg').append(other);
      });
      await readTable();
      assert.deepEqual(names('cell-a1'), []);
      assert.equal(indicator('cell-a1').binding.status, 'ambiguous');
      const candidates = indicator('cell-a1').binding.candidateObjectIds.map(
        (id) => data.objects.find((o) => o.id === id).name.text
      );
      assert.deepEqual(candidates.sort(), ['Alternative', 'Queue']);
    });
    await check('V42 a multiline HTML row caption stays one name, sibling labels stay separate', async () => {
      await resetTable();
      await page.evaluate(() => {
        document.querySelector('#host [data-cell-id="row-b"] text').remove();
        document
          .querySelector('#host [data-cell-id="row-b"]')
          .insertAdjacentHTML(
            'beforeend',
            '<foreignObject x="10" y="95" width="150" height="50"><div xmlns="http://www.w3.org/1999/xhtml" style="font:16px Arial">Batch-<div>worker</div></div></foreignObject>'
          );
      });
      await readTable();
      assert.deepEqual(names('cell-b1'), ['Batch-worker']);
      assert.deepEqual(names('cell-b2'), ['Batch-worker']);
      await page.evaluate(() => {
        document.querySelector('#host foreignObject').innerHTML =
          '<div xmlns="http://www.w3.org/1999/xhtml" style="font:16px Arial"><div>First</div><div>Second</div></div>';
      });
      await readTable();
      assert.deepEqual(names('cell-b1'), []);
      assert.ok(data.objects.some((o) => o.name?.text === 'First'));
      assert.ok(data.objects.some((o) => o.name?.text === 'Second'));
      await page.evaluate(() => {
        document.querySelector('#host foreignObject').innerHTML =
          '<div xmlns="http://www.w3.org/1999/xhtml" style="font:16px Arial">Batch-<div>worker</div><div>Other service</div></div>';
      });
      await readTable();
      assert.ok(data.objects.some((o) => o.name?.text === 'Batch-worker'));
      assert.ok(data.objects.some((o) => o.name?.text === 'Other service'));
      assert.deepEqual(names('cell-b1'), []);
      await page.evaluate(() => {
        document.querySelector('#host foreignObject').innerHTML =
          '<div xmlns="http://www.w3.org/1999/xhtml" style="font:16px Arial">Scheduled<div>worker</div></div>';
      });
      await readTable();
      assert.deepEqual(names('cell-b1'), ['Scheduled worker']);
    });
    await check('V43 nested HTML service labels outside a table remain separate', async () => {
      await page.evaluate(() => {
        document.querySelector('#host').innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="160">
          <g data-cell-id="services"><rect width="400" height="80" fill="gray"/>
            <foreignObject x="10" y="10" width="180" height="60"><div xmlns="http://www.w3.org/1999/xhtml" style="font:16px/20px Arial">Gateway<div>Worker</div></div></foreignObject></g>
          <circle id="cell-a1" cx="350" cy="20" r="4" fill="green"/>
          <circle id="cell-a2" cx="350" cy="40" r="4" fill="red"/>
        </svg>`;
      });
      await readTable();
      assert.deepEqual(names('cell-a1'), ['Gateway']);
      assert.deepEqual(names('cell-a2'), ['Worker']);
    });
    await check('V44 table evidence in a shared data-cell does not merge labels outside its bounds', async () => {
      await page.evaluate(() => {
        document
          .querySelector('#host [data-cell-id="services"]')
          .insertAdjacentHTML(
            'beforeend',
            '<rect x="0" y="90" width="400" height="70" fill="none" stroke="none"/><rect x="220" y="100" width="50" height="40" fill="green"/><rect x="300" y="100" width="50" height="40" fill="green"/>'
          );
      });
      await readTable();
      assert.deepEqual(names('cell-a1'), ['Gateway']);
      assert.deepEqual(names('cell-a2'), ['Worker']);
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
