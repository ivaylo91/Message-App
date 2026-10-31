module.exports = {
  preset: '@react-native/jest-preset',
  // The preset's list, plus Sentry, which also ships untranspiled.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@sentry)/)',
  ],
};
