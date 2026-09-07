/**
 * Two test seams (issue #2 "Testing Decisions"):
 *   1. domain pure functions — `src/domain/*.test.ts`
 *   2. hooks + in-memory repository — `src/hooks/*.test.ts` via `renderHook`
 * There are deliberately no component render tests.
 */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.test.tsx'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg))',
  ],
};
