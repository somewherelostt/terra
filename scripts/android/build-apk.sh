#!/usr/bin/env bash
# Build Terra's signed Android release APK.
#   scripts/android/build-apk.sh            -> android/app/build/outputs/apk/release/terra-<version>.apk
# Needs JDK 21 and the Android SDK (ANDROID_HOME). Signing reads TERRA_KEYSTORE_PROPERTIES
# (default: the private keystore folder outside the repo). Set TERRA_WEB_HOST to the public web
# host so https invite links open the app.
set -euo pipefail
cd "$(dirname "$0")/../.."

pnpm build
npx cap sync android
(cd android && ./gradlew --no-daemon clean assembleRelease)

out=android/app/build/outputs/apk/release
version=$(grep -m1 'versionName' android/app/build.gradle | sed -E 's/.*"(.*)".*/\1/')
src=$(ls "$out"/*-release.apk | head -1)
cp "$src" "$out/terra-$version.apk"
echo "APK: $out/terra-$version.apk"
shasum -a 256 "$out/terra-$version.apk"
