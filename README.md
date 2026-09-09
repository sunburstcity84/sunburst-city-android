# Sunburst City — Android AI Chat

Portrait phone chat with **Mika**: animated character + text chat + spoken replies (free Web Speech).

Repo: https://github.com/sunburstcity84/sunburst-city-android

Live: https://sunburstcity84.github.io/sunburst-city-android/

## What you get

1. **Character** — Mika from `data/character-pack.json` (Chris’s portrait art)
2. **Conversation** — portrait text chat
3. **Animated person** — idle breathe/sway on her portrait; stronger motion while she speaks after you tap **Start chatting**

Mute via the **Speak** checkbox in the chat top bar if needed.

## Open on Android (Add to Home Screen)

1. Open the live URL in Chrome for Android
2. Menu → **Install app** / **Add to Home screen**
3. Launch from the home screen (standalone, portrait)

## Try animate + speak

1. Open the app → wait for splash → meet Mika
2. Tap **Start chatting** (unlocks device speech)
3. Type a message → she replies in text, speaks aloud, and the portrait switches to talking motion

On the intro screen, **←** asks to leave (confirm exit). From chat, **←** returns to intro.

Voice quality depends on the Android/Chrome built-in voices (no paid TTS API). Some devices have better female voices than others. If Speak is muted or speech is unsupported, chat still works.

## Chat engine

Default: free local in-character mock (no paid API). Optional Gemini/OpenAI key stays on-device only:

```
localStorage.setItem("sc_ai_provider", "gemini");
localStorage.setItem("sc_ai_api_key", "YOUR_KEY");
location.reload();
```

Never commit keys.

## Local preview

```
npx --yes serve -l 4173 .
```

## Sideload APK

Actions → **Build Android APK** (after CI workflows are enabled) → download debug APK artifact.

To enable APK CI: copy files from `docs/ci/` into `.github/workflows/` (needs a token with `workflow` scope).

## Brand

Electric blue `#0070FF`, gold accents, deep blue splash.
