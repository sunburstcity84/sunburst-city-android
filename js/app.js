import { loadCharacterPack, getCharacter } from "./characters.js";
import {
  generateReply,
  hasGeminiKey,
  isBannerDismissed,
  dismissBanner,
  saveGeminiKey,
  clearGeminiKey,
  getAiStatus,
  getMaskedKeyHint,
} from "./ai.js";
import { mountAvatar, setAvatarState } from "./avatar.js";
import {
  initVoice,
  speak,
  stopSpeaking,
  getAutoSpeak,
  setAutoSpeak,
  isTtsSupported,
} from "./voice.js";

const SPLASH_MS = 1100;
const DEFAULT_AVATAR = "icons/mika-avatar.jpg";
const DEFAULT_PORTRAIT = "icons/mika-portrait.jpg";

const $ = (id) => document.getElementById(id);

const screens = {
  splash: $("screen-splash"),
  intro: $("screen-intro"),
  chat: $("screen-chat"),
};

let character = null;
let chatHistory = [];
let busy = false;
let chatAvatarFrame = null;
let introAvatarFrame = null;
let speechUnlocked = false;

function navShow(name) {
  Object.entries(screens).forEach(([k, el]) => {
    el.classList.toggle("hidden", k !== name);
  });
  try {
    window.history.replaceState({ screen: name }, "");
  } catch (_) {}
}

function faceSrc() {
  return character?.avatar || DEFAULT_AVATAR;
}

function portraitSrc() {
  return character?.portrait || DEFAULT_PORTRAIT;
}

function faceImg(className) {
  const img = document.createElement("img");
  img.src = faceSrc();
  img.alt = "";
  img.className = className;
  img.setAttribute("aria-hidden", "true");
  return img;
}

function mountPresence() {
  const first = (character?.display_name || "Mika").split(" ")[0];
  const portrait = portraitSrc();
  const introStage = $("intro-avatar-stage");
  const chatStage = $("chat-avatar-stage");
  if (introStage) {
    introAvatarFrame = mountAvatar(introStage, { name: first, portrait });
    setAvatarState(introAvatarFrame, "idle");
  }
  if (chatStage) {
    chatStage.classList.remove("hidden");
    chatAvatarFrame = mountAvatar(chatStage, { name: first, portrait });
    setAvatarState(chatAvatarFrame, "idle");
  }
}

function refreshStatusLine() {
  const status = $("chat-status");
  if (!status || busy) return;
  if (speechSynthesis?.speaking) return;
  const ai = getAiStatus();
  status.textContent = ai.startsWith("gemini") ? "Online · Gemini" : "Online";
  status.title = ai;
}

function fillIntro() {
  const first = character.display_name.split(" ")[0];
  $("intro-name").textContent = character.display_name;
  $("intro-role").textContent = character.role_tag || "";
  $("intro-one-liner").textContent = character.one_liner || "";
  const bioEl = $("intro-bio");
  if (bioEl) bioEl.textContent = character.bio || "";
  $("chat-name").textContent = character.display_name;
  $("typing-label").textContent = `${first} is typing…`;
  $("composer-input").placeholder = `Message ${first}…`;
  refreshStatusLine();
  mountPresence();
}

function hideEmpty() {
  const e = $("empty-state");
  if (e) e.classList.add("hidden");
}

function appendMessage(role, text) {
  hideEmpty();
  const row = document.createElement("div");
  row.className = `msg-row msg-row--${role === "user" ? "user" : "char"}`;

  if (role !== "user") {
    row.appendChild(faceImg("mika-face mika-face--sm"));
  }

  const bubble = document.createElement("div");
  bubble.className = `bubble bubble--${role === "user" ? "user" : "char"}`;
  bubble.textContent = text;
  row.appendChild(bubble);

  $("chat-messages").appendChild(row);
  row.scrollIntoView({ behavior: "smooth", block: "end" });
}

function setTyping(on) {
  $("typing-bar").classList.toggle("hidden", !on);
  $("typing-bar").setAttribute("aria-hidden", on ? "false" : "true");
  $("chat-status").textContent = on ? "Typing…" : "Online";
  if (!on) refreshStatusLine();
  if (on) {
    setAvatarState(chatAvatarFrame, "typing");
  } else if (!busy) {
    setAvatarState(chatAvatarFrame, "idle");
  }
}

function autoGrow(ta) {
  ta.style.height = "auto";
  ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
}

/** One user gesture unlocks speechSynthesis on Android Chrome. */
function unlockSpeech() {
  if (speechUnlocked || !isTtsSupported()) {
    speechUnlocked = true;
    return;
  }
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    speechSynthesis.speak(u);
    speechSynthesis.cancel();
  } catch (_) {}
  speechUnlocked = true;
}

async function speakReply(text) {
  if (!getAutoSpeak() || !isTtsSupported()) return;
  setAvatarState(chatAvatarFrame, "talking");
  $("chat-status").textContent = "Speaking…";
  await speak(text, {
    onEnd: () => {
      setAvatarState(chatAvatarFrame, "idle");
      if (!busy) refreshStatusLine();
    },
  });
}

function syncGeminiBanner() {
  const banner = $("gemini-banner");
  if (!banner) return;
  const show = !hasGeminiKey() && !isBannerDismissed();
  banner.classList.toggle("hidden", !show);
}

function openSettings() {
  const overlay = $("settings-overlay");
  const input = $("settings-key");
  const status = $("settings-status");
  if (!overlay) return;
  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden", "false");
  if (input) {
    input.value = "";
    input.placeholder = hasGeminiKey() ? getMaskedKeyHint() || "Key saved — paste to replace" : "AIza…";
  }
  if (status) {
    status.textContent = hasGeminiKey()
      ? `Saved on this device · ${getAiStatus()}`
      : "No key yet — chat uses the local engine until you add one.";
  }
  setTimeout(() => input?.focus(), 50);
}

function closeSettings() {
  const overlay = $("settings-overlay");
  if (!overlay) return;
  overlay.classList.add("hidden");
  overlay.setAttribute("aria-hidden", "true");
  const input = $("settings-key");
  if (input) input.value = "";
}

function bindSettings() {
  $("btn-settings")?.addEventListener("click", openSettings);
  $("settings-close")?.addEventListener("click", closeSettings);
  $("settings-overlay")?.addEventListener("click", (e) => {
    if (e.target === $("settings-overlay")) closeSettings();
  });

  $("settings-save")?.addEventListener("click", () => {
    const raw = $("settings-key")?.value || "";
    if (!raw.trim()) {
      if ($("settings-status")) {
        $("settings-status").textContent = "Paste a key first, or tap Clear.";
      }
      return;
    }
    saveGeminiKey(raw);
    dismissBanner();
    syncGeminiBanner();
    refreshStatusLine();
    if ($("settings-status")) {
      $("settings-status").textContent = "Saved. Mika will use Gemini for replies.";
    }
    if ($("settings-key")) $("settings-key").value = "";
    setTimeout(closeSettings, 450);
  });

  $("settings-clear")?.addEventListener("click", () => {
    clearGeminiKey();
    syncGeminiBanner();
    refreshStatusLine();
    if ($("settings-status")) {
      $("settings-status").textContent = "Cleared. Using local chat engine.";
    }
    if ($("settings-key")) {
      $("settings-key").value = "";
      $("settings-key").placeholder = "AIza…";
    }
  });

  $("banner-add-key")?.addEventListener("click", () => {
    openSettings();
  });
  $("banner-dismiss")?.addEventListener("click", () => {
    dismissBanner();
    syncGeminiBanner();
  });
}

async function sendMessage(text) {
  const cleaned = text.trim();
  if (!cleaned || busy) return;
  busy = true;
  $("btn-send").disabled = true;
  stopSpeaking();
  setAvatarState(chatAvatarFrame, "idle");

  appendMessage("user", cleaned);
  chatHistory.push({ role: "user", text: cleaned });

  const input = $("composer-input");
  input.value = "";
  autoGrow(input);

  setTyping(true);
  try {
    const reply = await generateReply(character, cleaned, chatHistory);
    setTyping(false);
    const finalText = reply || "Hey — signal got fuzzy. Say that again?";
    appendMessage("char", finalText);
    chatHistory.push({ role: "assistant", text: finalText });
    await speakReply(finalText);
  } catch (err) {
    setTyping(false);
    appendMessage("char", "Whoa, glitchy moment. Try me again?");
    console.error(err);
  } finally {
    busy = false;
    $("btn-send").disabled = !$("composer-input").value.trim();
    if (!isTtsSupported() || !getAutoSpeak() || !speechSynthesis.speaking) {
      setAvatarState(chatAvatarFrame, "idle");
      refreshStatusLine();
    }
  }
}

/**
 * Intro ← : confirm then end the PWA session with an explicit left screen.
 * Never rely on history.back() alone — installed PWAs often have nowhere
 * to go, which made Back look like a no-op after OK.
 */
function showLeftScreen() {
  document.body.innerHTML =
    '<main style="min-height:100dvh;display:grid;place-items:center;background:#001a4d;color:#f2f6ff;font:600 1.05rem system-ui;text-align:center;padding:24px;gap:10px">' +
    "<div>You\u2019ve left Sunburst City.</div>" +
    '<div style="font-weight:500;font-size:0.92rem;opacity:0.85">Close this tab or swipe the app away.</div>' +
    "</main>";
}

function exitApp(ev) {
  if (ev) {
    ev.preventDefault();
    ev.stopPropagation();
  }
  const ok = window.confirm("Leave Sunburst City?");
  if (!ok) return;
  try {
    stopSpeaking();
  } catch (_) {}
  try {
    window.close();
  } catch (_) {}
  showLeftScreen();
}

function bindUI() {
  bindSettings();

  $("btn-start").addEventListener("click", () => {
    unlockSpeech();
    mountPresence();
    navShow("chat");
    const stage = $("chat-avatar-stage");
    if (stage) stage.classList.remove("hidden");
    setAvatarState(chatAvatarFrame, "idle");
    syncGeminiBanner();
    refreshStatusLine();
    $("composer-input").focus();
  });

  const introBack = $("intro-back");
  if (!introBack) {
    console.error("intro-back button missing from Mika intro DOM");
  } else {
    introBack.addEventListener("click", exitApp);
  }

  $("chat-back").addEventListener("click", () => {
    stopSpeaking();
    setAvatarState(chatAvatarFrame, "idle");
    closeSettings();
    navShow("intro");
    setAvatarState(introAvatarFrame, "idle");
  });

  window.addEventListener("popstate", () => {
    if (!screens.chat.classList.contains("hidden")) {
      stopSpeaking();
      closeSettings();
      navShow("intro");
    }
  });

  const input = $("composer-input");
  const sendBtn = $("btn-send");
  const tts = $("tts-auto");

  if (tts) {
    tts.checked = getAutoSpeak();
    if (!isTtsSupported()) {
      tts.checked = false;
      tts.disabled = true;
      tts.parentElement.title = "Speech not supported on this browser";
    }
    tts.addEventListener("change", () => {
      setAutoSpeak(tts.checked);
      if (!tts.checked) {
        stopSpeaking();
        setAvatarState(chatAvatarFrame, "idle");
        refreshStatusLine();
      }
    });
  }

  input.addEventListener("input", () => {
    sendBtn.disabled = !input.value.trim() || busy;
    autoGrow(input);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      $("composer").requestSubmit();
    }
  });

  $("composer").addEventListener("submit", (e) => {
    e.preventDefault();
    sendMessage(input.value);
  });

  if (window.visualViewport) {
    const vv = window.visualViewport;
    const sync = () => {
      const box = $("chat-messages");
      if (box) box.scrollTop = box.scrollHeight;
    };
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
  }
}

async function boot() {
  initVoice();
  bindUI();
  try {
    const pack = await loadCharacterPack();
    character = getCharacter(pack, "mika");
    if (!character) throw new Error("No character");
    fillIntro();
  } catch (err) {
    console.error(err);
    character = {
      id: "mika",
      display_name: "Mika",
      role_tag: "Sunburst local",
      one_liner:
        "The person you talk to in Sunburst City — calm, grounded, always around when you need a real conversation.",
      starter_greetings: ["Hey. It’s Mika. Got a minute — or a longer one?"],
      system_prompt: "You are Mika in Sunburst City.",
      bio: "Mika lives in the easy rhythm of Sunburst City.",
      portrait: DEFAULT_PORTRAIT,
      avatar: DEFAULT_AVATAR,
    };
    fillIntro();
  }

  setTimeout(() => navShow("intro"), SPLASH_MS);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

boot();
