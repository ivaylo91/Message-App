module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // Compiles the functions Reanimated runs on the UI thread. Must stay
  // the last plugin in this list.
  plugins: ['react-native-worklets/plugin'],
};
