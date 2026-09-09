#!/usr/bin/env bash
set -euo pipefail
if [ ! -d android ]; then
  npx cap add android
fi
npx cap sync android
MANIFEST="android/app/src/main/AndroidManifest.xml"
if [ -f "$MANIFEST" ]; then
  if grep -q 'android:screenOrientation' "$MANIFEST"; then
    sed -i 's/android:screenOrientation="[^"]*"/android:screenOrientation="portrait"/g' "$MANIFEST"
  else
    sed -i 's/<activity/<activity android:screenOrientation="portrait"/' "$MANIFEST"
  fi
fi
echo "Capacitor sync done (portrait)."
