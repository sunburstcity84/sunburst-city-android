import { loadCharacterPack, getCharacter, initials } from "./characters.js";
import { generateReply, getAiStatus } from "./ai.js";

const SPLASH_MS = 1100;

const $ = (id) => document.getElementById(id);

const screens = {
  splash: $("screen-splash"),
  intro: $("screen-intro"),
  chat: $("screen-chat"),
};

let character = null;
let chatHistory = [];
let busy = false;

function navShow(name) {
  Object.entries(screens).forEach(([k, el]) => {
    el.classList.toggle("hidden", k !== name);
  });
  try {
    window.history.replaceState({ screen: name }, "");
  } catch (_) {}
}

function setAvatarText(el, name) {
  if (el) el.textContent = initials(name);
}

function fillIntro() {
  $("intro-name").textContent = character.display_name;
  $("intro-role").textContent = character.role_tag || "";
  $("intro-one-liner").textContent = character.one_liner || "";
  setAvatarText($("intro-avatar"), character.display_name);
  setAvatarText($("empty-avatar"), character.display_name);
  $("chat-name").textContent = character.display_name;
  $("typing-label").textContent = `${character.display_name.split(" ")[0]} is typing…`;
  $("composer-input").placeholder = `Message ${character.display_name.split(" ")[0]}…`;
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
    const av = document.createElement("div");
    av.className = "msg-avatar";
    av.textContent = initials(character.display_name);
    av.setAttribute("aria-hidden", "true");
    row.appendChild(av);
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
  if (on) {
    $("chat-status").textContent = "Typing…";
  } else {
    $("chat-status").textContent = `Online · ${getAiStatus()}`;
  }
}

function autoGrow(ta) {
  ta.style.height = "auto";
  ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
}

async function sendMessage(text) {
  const cleaned = text.trim();
  if (!cleaned || busy) return;
  busy = true;
  $("btn-send").disabled = true;

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
  } catch (err) {
    setTyping(false);
    appendMessage("char", "Whoa, glitchy moment. Try me again?");
    console.error(err);
  } finally {
    busy = false;
    $("btn-send").disabled = !$("composer-input").value.trim();
  }
}

function bindUI() {
  $("btn-start").addEventListener("click", () => {
    navShow("chat");
    $("composer-input").focus();
  });

  $("intro-back").addEventListener("click", () => {
    navShow("splash");
    setTimeout(() => navShow("intro"), 400);
  });

  $("chat-back").addEventListener("click", () => navShow("intro"));

  window.addEventListener("popstate", () => {
    if (!screens.chat.classList.contains("hidden")) navShow("intro");
  });

  const input = $("composer-input");
  const sendBtn = $("btn-send");

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
  bindUI();
  try {
    const pack = await loadCharacterPack();
    character = getCharacter(pack, "lila_solano");
    if (!character) throw new Error("No character");
    fillIntro();
    $("chat-status").textContent = `Online · ${getAiStatus()}`;
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
