#!/usr/bin/env bash
set -euo pipefail
chmod +x android/gradlew
cd android
./gradlew assembleDebug --no-daemon
cd ..
APK=$(find android/app/build/outputs/apk -name "*.apk" | head -n 1)
echo "APK_PATH=$APK" >> "$GITHUB_OUTPUT"
ls -la "$APK"
