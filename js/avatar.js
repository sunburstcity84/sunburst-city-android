/**
 * Simple stylized SVG avatar for Lila — idle breathe/blink + talking motion.
 * Pure CSS/SVG, no paid assets.
 */

const SVG = `
<svg class="lila-svg" viewBox="0 0 200 240" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="skinGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f5c9a8"/>
      <stop offset="100%" stop-color="#e8a87c"/>
    </linearGradient>
    <linearGradient id="hairGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3d2314"/>
      <stop offset="55%" stop-color="#1a0f08"/>
      <stop offset="100%" stop-color="#5c3a1e"/>
    </linearGradient>
    <linearGradient id="shirtGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#3d9fff"/>
      <stop offset="100%" stop-color="#0070ff"/>
    </linearGradient>
    <radialGradient id="cheekGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ff8fab" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#ff8fab" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- soft stage glow -->
  <ellipse class="stage-glow" cx="100" cy="220" rx="70" ry="12" fill="rgba(0,112,255,0.35)"/>

  <g class="lila-body">
    <!-- shoulders / top -->
    <path class="shirt" d="M40 210 Q50 155 100 150 Q150 155 160 210 Z" fill="url(#shirtGrad)"/>
    <ellipse cx="100" cy="158" rx="28" ry="10" fill="#ffc933" opacity="0.85"/>

    <!-- neck -->
    <rect x="88" y="118" width="24" height="36" rx="8" fill="url(#skinGrad)"/>

    <!-- head -->
    <g class="lila-head">
      <!-- hair back -->
      <ellipse cx="100" cy="78" rx="58" ry="64" fill="url(#hairGrad)"/>
      <path d="M42 90 Q35 140 48 175 Q55 150 58 120 Z" fill="url(#hairGrad)"/>
      <path d="M158 90 Q165 140 152 175 Q145 150 142 120 Z" fill="url(#hairGrad)"/>

      <!-- face -->
      <ellipse class="face" cx="100" cy="88" rx="46" ry="52" fill="url(#skinGrad)"/>

      <!-- bangs -->
      <path d="M55 55 Q100 20 145 55 Q130 70 100 62 Q70 70 55 55 Z" fill="url(#hairGrad)"/>
      <path d="M60 48 Q78 72 72 88 Q65 70 58 55 Z" fill="url(#hairGrad)" opacity="0.9"/>
      <path d="M140 48 Q122 72 128 88 Q135 70 142 55 Z" fill="url(#hairGrad)" opacity="0.9"/>

      <!-- cheeks -->
      <circle cx="68" cy="100" r="10" fill="url(#cheekGlow)"/>
      <circle cx="132" cy="100" r="10" fill="url(#cheekGlow)"/>

      <!-- eyes -->
      <g class="eyes">
        <ellipse class="eye eye-l" cx="80" cy="88" rx="8" ry="9" fill="#1a2748"/>
        <ellipse class="eye eye-r" cx="120" cy="88" rx="8" ry="9" fill="#1a2748"/>
        <circle class="shine" cx="77" cy="84" r="2.5" fill="#fff"/>
        <circle class="shine" cx="117" cy="84" r="2.5" fill="#fff"/>
      </g>

      <!-- brows -->
      <path d="M70 74 Q80 70 90 74" stroke="#2a1810" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <path d="M110 74 Q120 70 130 74" stroke="#2a1810" stroke-width="2.5" fill="none" stroke-linecap="round"/>

      <!-- nose hint -->
      <path d="M100 92 Q102 102 98 104" stroke="#d4926a" stroke-width="2" fill="none" stroke-linecap="round"/>

      <!-- mouth -->
      <g class="mouth">
        <path class="mouth-idle" d="M88 118 Q100 126 112 118" stroke="#c45c6a" stroke-width="2.8" fill="none" stroke-linecap="round"/>
        <ellipse class="mouth-talk" cx="100" cy="120" rx="9" ry="6" fill="#8b3a48" opacity="0"/>
      </g>
    </g>
  </g>
</svg>
`;

/**
 * Mount avatar markup into a container.
 * @param {HTMLElement} el
 * @param {{ name?: string }} [opts]
 */
export function mountAvatar(el, opts = {}) {
  if (!el) return null;
  el.classList.add("avatar-stage");
  el.innerHTML = `
    <div class="avatar-frame" data-state="idle">
      ${SVG}
      <div class="avatar-caption">${opts.name || "Lila"}</div>
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
