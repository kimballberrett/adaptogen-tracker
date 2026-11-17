// Line icons (24px grid, 1.8 stroke) in the same style as the reference, plus two
// flat illustrations with dark outlines that stand in for its bell and calendar art.

const line = (body) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icon = {
  close: line('<path d="M6 6l12 12M18 6 6 18"/>'),
  plus: line('<path d="M12 5v14M5 12h14"/>'),
  check: line('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  left: line('<path d="m15 6-6 6 6 6"/>'),
  right: line('<path d="m9 6 6 6-6 6"/>'),
  chart: line('<path d="M5 20V11M12 20V5M19 20v-6"/>'),
  trash: line('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>'),
  download: line('<path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14"/>'),
  shuffle: line('<path d="M4 7h3.5c4 0 5 10 9 10H20m0 0-2.5-2.5M20 17l-2.5 2.5M4 17h3.5c1.4 0 2.4-1.2 3.3-2.8M20 7h-3.5c-1.4 0-2.4 1.2-3.3 2.8M20 7l-2.5-2.5M20 7l-2.5 2.5"/>'),
  lock: line('<rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  // Filled clock-style badge, like the reference's duration marker, but a smile for "how it felt"
  smile: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M8.5 13.5c.9 1.4 2.1 2 3.5 2s2.6-.6 3.5-2" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><circle cx="9" cy="9.6" r="1.2" fill="#fff"/><circle cx="15" cy="9.6" r="1.2" fill="#fff"/></svg>',
  pending: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M12 7v5l3 2" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  // Drink tiles: four cup shapes so each code reads differently at a glance
  cup: [
    line('<path d="M7 8h10l-1.2 11a2 2 0 0 1-2 1.8h-3.6a2 2 0 0 1-2-1.8z"/><path d="M8 4h8M12.5 8l1.5-4"/><path d="M7.6 13h8.8"/>'),
    line('<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M9 3.5c-.8 1 .8 2 0 3M12.5 3.5c-.8 1 .8 2 0 3"/>'),
    line('<path d="M10 3h4v3.5l2 3V19a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V9.5l2-3z"/><path d="M8 13h8"/>'),
    line('<path d="M6 5h12l-2 7a4 4 0 0 1-4 3 4 4 0 0 1-4-3z"/><path d="M12 15v5M8.5 20.5h7"/>'),
  ],
};

// Hero card art: a tumbler with a straw and sound-line sparkles (the reference's bell slot)
export const heroArt = `
<svg class="art" viewBox="0 0 120 120" aria-hidden="true">
  <g fill="none" stroke="#93AE3E" stroke-width="3.5" stroke-linecap="round">
    <g class="ring"><path d="M22 44c-4 7-4 15 0 22"/><path d="M13 39c-6 11-6 23 0 33"/></g>
    <g class="ring ring-r"><path d="M98 44c4 7 4 15 0 22"/><path d="M107 39c6 11 6 23 0 33"/></g>
  </g>
  <g class="float">
  <path d="M64 34 72 12h10" fill="none" stroke="#3A1426" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M36 38h48l-5.5 54a7 7 0 0 1-7 6.3H48.5a7 7 0 0 1-7-6.3z" fill="#B57BD0" stroke="#3A1426" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M38.2 58h43.6" stroke="#3A1426" stroke-width="3" stroke-linecap="round"/>
  <path d="M38.6 58h42.8l-1.7 17.5H40.4z" fill="#8C1D4B" opacity=".9"/>
  <rect x="32" y="31" width="56" height="10" rx="5" fill="#7A1C45" stroke="#3A1426" stroke-width="3.5"/>
  <path d="M50 84c2.5-6 9-9 15-7-1.5 6-8 9.5-15 7z" fill="#93AE3E" stroke="#3A1426" stroke-width="2.5" stroke-linejoin="round"/>
  </g>
  <g stroke="#3A1426" stroke-width="3" stroke-linecap="round">
    <path d="M44 112l6-5M76 112l-6-5M60 114v-6"/>
  </g>
</svg>`;

// Log screen art: a mug with a five-dot rating label, steam and sparkles
// (the reference's calendar slot, same lime + dark outline treatment)
export const logArt = `
<svg class="illustration" viewBox="0 0 190 160" aria-hidden="true">
  <g class="steam" fill="none" stroke="#8C1D4B" stroke-width="5" stroke-linecap="round">
    <path d="M62 30c-6-6 6-11 0-18"/><path d="M78 30c-6-6 6-11 0-18"/>
  </g>
  <g class="twinkle" stroke="#D58BD8" stroke-width="5" stroke-linecap="round">
    <path d="M146 22l7-12M154 34l12-5M150 46h10"/>
  </g>
  <path d="M132 64h10a18 18 0 0 1 0 36h-10" fill="none" stroke="#3A1426" stroke-width="6"/>
  <path d="M38 44h98v66a26 26 0 0 1-26 26H64a26 26 0 0 1-26-26z" fill="#A9C64A" stroke="#3A1426" stroke-width="6" stroke-linejoin="round"/>
  <rect x="38" y="44" width="98" height="14" fill="#3A1426"/>
  <rect x="50" y="72" width="74" height="40" rx="12" fill="#fff" stroke="#3A1426" stroke-width="4"/>
  <g fill="none" stroke="#3A1426" stroke-width="3.5">
    <circle cx="63" cy="92" r="5"/><circle cx="75" cy="92" r="5"/><circle cx="87" cy="92" r="5"/>
    <circle cx="111" cy="92" r="5"/>
  </g>
  <circle cx="99" cy="92" r="6.5" fill="#93AE3E"/>
</svg>`;
