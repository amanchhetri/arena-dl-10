module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/features/(.*)$': '<rootDir>/src/features/$1',
    '^@/ui/(.*)$': '<rootDir>/src/ui/$1',
    '^@/lib/(.*)$': '<rootDir>/src/lib/$1',
    '^@/theme/(.*)$': '<rootDir>/src/theme/$1',
    '^@/types/(.*)$': '<rootDir>/src/types/$1',
    '^@/app/(.*)$': '<rootDir>/app/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(jest-)?react-native|@react-native|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-clone-referenced-element|@react-navigation|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|nativewind)',
  ],
};
