// Fonts bundled with the app. Onest (Cyrillic included) is the app's
// typeface, in five static weights cut from the variable font; licence in
// licenses/Onest-OFL.txt.
//
// iOS: linked into the Xcode project and Info.plist by
// `npx react-native-asset`, and picked by family name plus fontWeight.
// Android: not linked here - the same files live in res/font with an XML
// font family (res/font/onest.xml), registered in MainApplication, because
// that is the only way Android maps fontWeight 500/600/800 to a file.
module.exports = {
  iosAssets: ['./src/assets/fonts'],
  androidAssets: [],
};
