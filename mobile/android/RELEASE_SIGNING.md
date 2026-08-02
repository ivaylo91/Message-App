# Release signing

Release builds are signed with `app/hearth-release.keystore`, configured via
`android/keystore.properties`. Neither file is committed to git (see
`.gitignore`) - `keystore.properties` holds the store/key passwords in
plaintext, and the keystore itself is the actual signing key.

`keystore.properties` format:

```
storeFile=hearth-release.keystore
storePassword=...
keyAlias=hearth-release-key
keyPassword=...
```

`storeFile` is resolved relative to `android/app/` (the same as the existing
`debug.keystore` reference), not the `android/` directory `keystore.properties`
itself lives in.

If `keystore.properties` is missing, `build.gradle` falls back to signing
release builds with the debug keystore instead of failing outright (useful
for locally testing the release build type), but prints a warning - a
release built that way must never be published.

## Back this up now, not later

**If the keystore or its password is lost, this app can never be updated
again under its current identity** - Google Play requires every update to
be signed with the same key as the original upload, and there is no
recovery or reset process for a lost signing key. A leaked keystore is just
as bad in the other direction: whoever has it can sign and distribute
updates that Android will accept as genuinely coming from this app.

Copy both `android/app/hearth-release.keystore` and
`android/keystore.properties` somewhere durable and private - a password
manager attachment, an encrypted backup, etc. - before relying on this
setup for a real release. This sandbox's filesystem is not that place.

## Producing a signed release build

```
cd android
./gradlew :app:bundleRelease   # AAB, for Play Store upload
./gradlew :app:assembleRelease # APK
```

Output lands under `app/build/outputs/bundle/release/` or
`app/build/outputs/apk/release/`. Confirm it's actually signed with the
release key (not a silent debug-keystore fallback) with:

```
keytool -list -v -keystore app/hearth-release.keystore -storepass <storePassword> | grep SHA256
apksigner verify --print-certs app/build/outputs/apk/release/app-release.apk
```

The SHA256 fingerprints should match.
