// Tiny helpers for building HTML overlay UIs on top of the Phaser canvas.
// Used by the menu / lobby / result screens. Real DOM elements make these
// screens trivial to drive from Playwright via data-testid selectors.

let styleInjected = false;

function injectStyles() {
  if (styleInjected) return;
  styleInjected = true;
  const css = `
  .ui-overlay {
    position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
    z-index: 10; pointer-events: none;
  }
  .ui-panel {
    pointer-events: auto;
    width: min(420px, 90vw);
    background: rgba(24,27,34,0.96);
    border: 1px solid #3a4150;
    border-radius: 14px;
    padding: 28px 26px;
    color: #e8ecf2;
    box-shadow: 0 18px 50px rgba(0,0,0,0.5);
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  .ui-panel h1 { margin: 0 0 4px; font-size: 26px; }
  .ui-panel h2 { margin: 0 0 18px; font-size: 16px; font-weight: 500; color: #9aa6b8; }
  .ui-panel label { display:block; font-size: 13px; color:#9aa6b8; margin: 14px 0 6px; }
  .ui-panel input {
    width: 100%; box-sizing: border-box; padding: 11px 12px; font-size: 16px;
    background:#10131a; border:1px solid #3a4150; border-radius: 8px; color:#fff;
  }
  .ui-panel input:focus { outline: none; border-color:#4aa8ff; }
  .ui-btn {
    display:block; width:100%; box-sizing:border-box; margin-top:14px; padding: 12px;
    font-size: 16px; font-weight: 600; border:none; border-radius: 8px; cursor:pointer;
    background:#4aa8ff; color:#06121f; transition: filter .1s;
  }
  .ui-btn:hover { filter: brightness(1.08); }
  .ui-btn.secondary { background:#2b313d; color:#cfd6e2; }
  .ui-btn:disabled { opacity:.5; cursor:not-allowed; }
  .ui-row { display:flex; gap:10px; }
  .ui-row .ui-btn { margin-top:0; }
  .ui-error { color:#ff7b7b; font-size:13px; min-height:18px; margin-top:10px; }
  .ui-code {
    font-size: 38px; letter-spacing: 8px; font-weight: 700; text-align:center;
    background:#10131a; border:1px dashed #4aa8ff; border-radius:10px; padding:14px; margin:6px 0 4px;
  }
  .ui-players { list-style:none; padding:0; margin:8px 0 0; }
  .ui-players li {
    padding:10px 12px; background:#10131a; border-radius:8px; margin-bottom:6px;
    display:flex; justify-content:space-between; align-items:center;
  }
  .ui-host-badge { font-size:11px; background:#4aa8ff; color:#06121f; padding:2px 8px; border-radius:10px; }
  .ui-result-row { display:flex; justify-content:space-between; padding:10px 12px; background:#10131a; border-radius:8px; margin-bottom:6px; }
  .ui-result-row.win { background:#173a28; border:1px solid #36d17a; }
  .ui-place { font-weight:700; width:28px; }
  `;
  const el = document.createElement('style');
  el.textContent = css;
  document.head.appendChild(el);
}

// Create an overlay attached to <body>. Returns { root, destroy }.
export function createOverlay(innerHTML) {
  injectStyles();
  const overlay = document.createElement('div');
  overlay.className = 'ui-overlay';
  overlay.innerHTML = `<div class="ui-panel">${innerHTML}</div>`;
  document.body.appendChild(overlay);
  return {
    root: overlay,
    panel: overlay.querySelector('.ui-panel'),
    q: (sel) => overlay.querySelector(sel),
    destroy: () => overlay.remove(),
  };
}
