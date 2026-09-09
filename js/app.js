import { loadCharacterPack, getCharacter } from "./characters.js";
import { generateReply } from "./ai.js";
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
const LILA_FACE = "icons/lila-avatar.svg";

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

function faceImg(className) {
  const img = document.createElement("img");
  img.src = LILA_FACE;
  img.alt = "";
  img.className = className;
  img.setAttribute("aria-hidden", "true");
  return img;
}

function fillIntro() {
  const first = character.display_name.split(" ")[0];
  $("intro-name").textContent = character.display_name;
  $("intro-role").textContent = character.role_tag || "";
  $("intro-one-liner").textContent = character.one_liner || "";
  $("chat-name").textContent = character.display_name;
  $("typing-label").textContent = `${first} is typing…`;
  $("composer-input").placeholder = `Message ${first}…`;
  $("chat-status").textContent = "Online";

  introAvatarFrame = mountAvatar($("intro-avatar-stage"), {
    name: first,
  });
  chatAvatarFrame = mountAvatar($("chat-avatar-stage"), {
    name: first,
  });
  setAvatarState(introAvatarFrame, "idle");
  setAvatarState(chatAvatarFrame, "idle");
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
    row.appendChild(faceImg("lila-face lila-face--sm"));
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
      if (!busy) $("chat-status").textContent = "Online";
    },
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
      $("chat-status").textContent = "Online";
    }
  }
}

function exitApp() {
  const ok = window.confirm("Leave Sunburst City?");
  if (!ok) return;
  stopSpeaking();
  try {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
  } catch (_) {}
  try {
    window.close();
  } catch (_) {}
  // PWA / tab often can't close — show a calm end state instead of splash loop
  document.body.innerHTML =
    '<div style="min-height:100dvh;display:grid;place-items:center;background:#001a4d;color:#f2f6ff;font:600 1.05rem system-ui;text-align:center;padding:24px">You can close this tab or swipe the app away.</div>';
}

function bindUI() {
  $("btn-start").addEventListener("click", () => {
    unlockSpeech();
    navShow("chat");
    setAvatarState(chatAvatarFrame, "idle");
    $("composer-input").focus();
  });

  $("intro-back").addEventListener("click", exitApp);

  $("chat-back").addEventListener("click", () => {
    stopSpeaking();
    setAvatarState(chatAvatarFrame, "idle");
    navShow("intro");
    setAvatarState(introAvatarFrame, "idle");
  });

  window.addEventListener("popstate", () => {
    if (!screens.chat.classList.contains("hidden")) {
      stopSpeaking();
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
        $("chat-status").textContent = "Online";
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
    character = getCharacter(pack, "lila_solano");
    if (!character) throw new Error("No character");
    fillIntro();
  } catch (err) {
    console.error(err);
    character = {
      id: "lila_solano",
      display_name: "Lila Solano",
      role_tag: "Local · photographer",
      one_liner: "Sunburst local. Start chatting anytime.",
      starter_greetings: ["Hey — Lila here. You free for a bit?"],
      system_prompt: "You are Lila Solano in Sunburst City.",
      bio: "A friendly Sunburst City photographer.",
    };
    fillIntro();
  }

  setTimeout(() => navShow("intro"), SPLASH_MS);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

boot();
