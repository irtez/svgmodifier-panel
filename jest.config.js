// force timezone to UTC to allow tests to work regardless of local timezone
// generally used by snapshots, but can affect specific tests
process.env.TZ = 'UTC';

const base = require('./.config/jest.config');

module.exports = {
  // Jest configuration provided by Grafana scaffolding
  ...base,
  moduleNameMapper: {
    ...base.moduleNameMapper,
    // jsdom выбирает browser ESM export; Jest использует тот же реальный parser в CJS.
    '^yaml$': '<rootDir>/node_modules/yaml/dist/index.js',
  },
};
