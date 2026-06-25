// Jest config for the pure-TypeScript domain + data layers.
// These layers import no React Native / Expo modules (SPEC §2.2), so we run them
// in a plain Node environment with ts-jest — far faster than the jest-expo preset.
// jest-expo is reserved for any future UI component tests (a second project).
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        // Use a dedicated, self-contained tsconfig so the Node test run is fully
        // isolated from the app-facing tsconfig (which extends expo/tsconfig.base —
        // moduleResolution 'bundler', incompatible with the CommonJS module ts-jest
        // needs here).
        tsconfig: '<rootDir>/tsconfig.jest.json',
      },
    ],
  },
};
