/**
 * Suite progress helpers: busy (indeterminate) + percent (determinate).
 * Expects markup:
 *   <div class="progress-row" id="progressRow" hidden>
 *     <span id="progressLabel" class="progress-label"></span>
 *     <div class="progress" id="progress"><i id="progressBar"></i></div>
 *   </div>
 *
 * Auto-wires: when #status text looks like a loading message, show busy bar.
 */
(() => {
  "use strict";

  const BUSY_RE =
    /(chargement|loading|actualisation|refresh|scan|analys|hachage|hash|working|suppression|delete|vidage|empty|application|applying|reconstruction|rebuild|calcul|g[eé]ocod)/i;
  const IDLE_RE = /^(pr[eê]t|ready|échec|failed|ok|copié|copied|enregistr|saved|termin[eé]|done)?$/i;

  const SuiteProgress = {
    _row: null,
    _bar: null,
    _wrap: null,
    _label: null,
    _depth: 0,
    _manual: false,

    mount(root) {
      const scope = root || document;
      this._row = scope.getElementById("progressRow") || scope.querySelector(".progress-row");
      this._wrap = scope.getElementById("progress") || (this._row && this._row.querySelector(".progress"));
      this._bar = scope.getElementById("progressBar") || (this._wrap && this._wrap.querySelector("i"));
      this._label = scope.getElementById("progressLabel") || (this._row && this._row.querySelector(".progress-label"));
      this._wireStatusAuto();
      return this;
    },

    _ensure() {
      if (!this._row) this.mount();
      return !!(this._row && this._wrap && this._bar);
    },

    setBusy(label) {
      if (!this._ensure()) return;
      this._manual = true;
      this._depth++;
      this._row.hidden = false;
      this._wrap.classList.add("busy");
      this._wrap.classList.remove("determinate");
      this._bar.style.width = "";
      if (this._label) this._label.textContent = label || "…";
    },

    setPercent(n, label) {
      if (!this._ensure()) return;
      this._manual = true;
      const pct = Math.max(0, Math.min(100, Number(n) || 0));
      const pctText = pct + "%";
      this._row.hidden = false;
      this._wrap.classList.remove("busy");
      this._wrap.classList.add("determinate");
      this._bar.style.width = pctText;
      if (this._label) {
        let text = pctText;
        if (label != null && label !== "") {
          const raw = String(label).trim();
          // Avoid "45% · Scanning 45%" — strip trailing/embedded percent from phase text
          const phase = raw
            .replace(/^\d{1,3}\s*%\s*[·\-–—:]?\s*/u, "")
            .replace(/\s+\d{1,3}\s*%\s*$/u, "")
            .replace(/\b\d{1,3}\s*%\b/gu, "")
            .replace(/\s{2,}/g, " ")
            .trim();
          text = phase ? pctText + " · " + phase : pctText;
        }
        this._label.textContent = text;
      }
    },

    clear() {
      if (!this._ensure()) return;
      this._depth = Math.max(0, this._depth - 1);
      if (this._depth > 0) return;
      this._manual = false;
      this._wrap.classList.remove("busy", "determinate");
      this._bar.style.width = "0%";
      if (this._label) this._label.textContent = "";
      this._row.hidden = true;
    },

    forceClear() {
      this._depth = 0;
      this._manual = false;
      if (!this._ensure()) return;
      this._wrap.classList.remove("busy", "determinate");
      this._bar.style.width = "0%";
      if (this._label) this._label.textContent = "";
      this._row.hidden = true;
    },

    async run(label, asyncFn) {
      this.setBusy(label);
      try {
        return await asyncFn();
      } finally {
        this.clear();
      }
    },

    _wireStatusAuto() {
      const status = document.getElementById("status");
      if (!status || status.dataset.suiteProgressWired) return;
      status.dataset.suiteProgressWired = "1";
      const apply = () => {
        if (this._manual) return;
        const text = (status.textContent || "").trim();
        if (!text) {
          this.forceClear();
          return;
        }
        if (BUSY_RE.test(text)) {
          if (!this._ensure()) return;
          this._row.hidden = false;
          this._wrap.classList.add("busy");
          this._wrap.classList.remove("determinate");
          this._bar.style.width = "";
          if (this._label) this._label.textContent = "…";
        } else if (IDLE_RE.test(text) || !BUSY_RE.test(text)) {
          // Clear when status leaves loading-like wording
          if (this._depth === 0 && !this._manual) {
            if (!this._ensure()) return;
            this._wrap.classList.remove("busy", "determinate");
            this._bar.style.width = "0%";
            if (this._label) this._label.textContent = "";
            this._row.hidden = true;
          }
        }
      };
      const mo = new MutationObserver(apply);
      mo.observe(status, { childList: true, characterData: true, subtree: true });
    },
  };

  window.SuiteProgress = SuiteProgress;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => SuiteProgress.mount());
  } else {
    SuiteProgress.mount();
  }
})();
