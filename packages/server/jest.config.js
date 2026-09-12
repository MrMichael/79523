export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  // The websocket integration tests use real timers/sockets; running suites in parallel
  // starves them and produces spurious timeouts, so keep the workers serial.
  maxWorkers: 1,
  setupFiles: ['<rootDir>/jest.setup.cjs'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: { rootDir: '../../../' }, diagnostics: false }],
  },
}
