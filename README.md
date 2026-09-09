# Sunburst City — Android AI Chat

Portrait-only phone chat with **Lila Solano** in Sunburst City.

- Progressive Web App (Add to Home Screen)
- GitHub Pages hosting
- GitHub Actions builds a sideloadable debug APK via Capacitor

Repo: https://github.com/sunburstcity84/sunburst-city-android

## Open on Android (PWA)

1. Open `https://sunburstcity84.github.io/sunburst-city-android/` in Chrome for Android
2. Menu (three dots) → Install app / Add to Home screen
3. Launch from the home screen (standalone, portrait)

If Pages is not live: Settings → Pages → Source: GitHub Actions, then re-run **Deploy GitHub Pages** (or push to main).

## Sideload APK

1. Actions → **Build Android APK** → Run workflow
2. Download the `sunburst-city-debug-apk` artifact
3. Install the APK on your phone (allow unknown sources for that file)

## Chat and AI

Default: free local in-character mock (no paid API).

To plug a free Gemini or OpenAI key later, in the browser console:

```
localStorage.setItem("sc_ai_provider", "gemini");
localStorage.setItem("sc_ai_api_key", "YOUR_KEY");
location.reload();
```

Provider can be `mock`, `gemini`, or `openai`. Keys stay on-device. Never commit keys.

## Add characters

Edit `data/character-pack.json` using the same fields as Lila. v1 loads `lila_solano`.

## Local preview

```
npx --yes serve -l 4173 .
```

## Brand

Electric blue #0070FF, gold accents, deep blue splash. Logo used as icon and splash mark.

## Live URL

https://sunburstcity84.github.io/sunburst-city-android/

## Enable APK CI

Copy files from docs/ci/ into the GitHub Actions workflows directory (needs a token with workflow scope), then run Build Android APK.
