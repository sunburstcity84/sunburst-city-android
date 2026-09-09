/**
 * Mika portrait avatar — idle breathe/sway + stronger talk motion.
 * Uses Chris’s art (icons/mika-portrait.jpg).
 */

const DEFAULT_PORTRAIT = "icons/mika-portrait.jpg";

/**
 * Mount portrait markup into a container.
 * @param {HTMLElement} el
 * @param {{ name?: string, portrait?: string }} [opts]
 */
export function mountAvatar(el, opts = {}) {
  if (!el) return null;
  const src = opts.portrait || DEFAULT_PORTRAIT;
  const name = opts.name || "Mika";
  el.classList.add("avatar-stage");
  el.innerHTML = `
    <div class="avatar-frame" data-state="idle">
      <div class="portrait-wrap">
        <img class="portrait-img" src="${src}" alt="${name}" draggable="false" />
      </div>
      <div class="avatar-caption">${name}</div>
    </div>
  `;
  return el.querySelector(".avatar-frame");
}

/**
 * Set animation state: idle | typing | talking
 * @param {HTMLElement|null} root — stage or frame
 * @param {"idle"|"typing"|"talking"} state
 */
export function setAvatarState(root, state) {
  if (!root) return;
  const frame = root.classList.contains("avatar-frame")
    ? root
    : root.querySelector(".avatar-frame");
  if (!frame) return;
  frame.dataset.state = state || "idle";
}
