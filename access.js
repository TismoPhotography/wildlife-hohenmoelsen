(() => {
  "use strict";

  const WRITE_CONTROLS = ["#addSpotBtn", "#addSightingBtn"];

  function authUser() {
    try {
      return window.firebase?.auth?.().currentUser || null;
    } catch {
      return null;
    }
  }

  function isRegisteredUser() {
    const user = authUser();
    return Boolean(user && !user.isAnonymous);
  }

  function openLogin(message = "Bitte melde dich an, um Spots oder Sichtungen einzutragen.") {
    const dialog = document.querySelector("#authDialog");
    const msg = document.querySelector("#authMessage");

    if (msg) {
      msg.textContent = message;
      msg.className = "auth-message";
    }

    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }

  function protectButton(selector) {
    const el = document.querySelector(selector);
    if (!el || el.dataset.guestGuardInstalled === "yes") return;

    el.dataset.guestGuardInstalled = "yes";
    el.addEventListener("click", event => {
      if (isRegisteredUser()) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      openLogin();
    }, true);
  }

  function protectForm(selector) {
    const form = document.querySelector(selector);
    if (!form || form.dataset.guestGuardInstalled === "yes") return;

    form.dataset.guestGuardInstalled = "yes";
    form.addEventListener("submit", event => {
      if (isRegisteredUser()) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      try {
        form.closest("dialog")?.close();
      } catch {}

      openLogin("Zum Speichern musst du mit einem Konto angemeldet sein.");
    }, true);
  }

  function protectImport() {
    const input = document.querySelector("#importInput");
    if (!input || input.dataset.guestGuardInstalled === "yes") return;

    input.dataset.guestGuardInstalled = "yes";
    input.addEventListener("change", event => {
      if (isRegisteredUser()) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      input.value = "";
      openLogin("Der Datenimport ist nur für angemeldete Nutzer verfügbar.");
    }, true);
  }

  function injectStyles() {
    if (document.querySelector("#guest-write-guard-style")) return;

    const style = document.createElement("style");
    style.id = "guest-write-guard-style";
    style.textContent = `
      .guest-write-locked {
        opacity: .62 !important;
        border-style: dashed !important;
      }
      .guest-write-locked::after {
        content: " 🔒";
        font-size: .85em;
      }
      .guest-bottom-bar {
        position: fixed;
        z-index: 1450;
        left: 0;
        right: 0;
        bottom: 0;
        min-height: calc(52px + env(safe-area-inset-bottom));
        padding: 8px 12px calc(8px + env(safe-area-inset-bottom));
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        background: rgba(12,18,14,.97);
        border-top: 1px solid var(--line, #304938);
        box-shadow: 0 -8px 24px rgba(0,0,0,.26);
        color: var(--text, #f3f7f4);
      }
      .guest-bottom-copy {
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 7px;
        font-size: 11px;
        line-height: 1.25;
        color: var(--muted, #a7b5aa);
      }
      .guest-bottom-copy strong {
        color: var(--text, #f3f7f4);
        font-weight: 800;
      }
      .guest-bottom-login {
        flex: 0 0 auto;
        border: 0;
        background: transparent;
        color: var(--accent, #8ed098);
        font-weight: 900;
        font-size: 12px;
        padding: 8px 2px 8px 8px;
      }
      body.guest-readonly-active .bottom-sheet {
        bottom: calc(64px + env(safe-area-inset-bottom)) !important;
      }
      body.guest-readonly-active .leaflet-bottom.leaflet-left {
        bottom: calc(31vh + 74px) !important;
      }
      @media(max-width:420px){
        .guest-bottom-copy{font-size:10px}
        .guest-bottom-login{font-size:11px}
      }
    `;
    document.head.appendChild(style);
  }

  function updateWriteUi() {
    injectStyles();

    const registered = isRegisteredUser();

    for (const selector of WRITE_CONTROLS) {
      const el = document.querySelector(selector);
      if (!el) continue;

      el.classList.toggle("guest-write-locked", !registered);
      el.setAttribute("aria-disabled", registered ? "false" : "true");
      el.title = registered
        ? ""
        : "Zum Erstellen bitte anmelden";
    }

    const importLabel = document.querySelector("#importInput")?.closest(".file-btn");
    if (importLabel) {
      importLabel.classList.toggle("guest-write-locked", !registered);
      importLabel.title = registered
        ? ""
        : "Zum Importieren bitte anmelden";
    }

    let bar = document.querySelector("#guestBottomBar");

    if (!registered) {
      document.body.classList.add("guest-readonly-active");

      if (!bar) {
        bar = document.createElement("div");
        bar.id = "guestBottomBar";
        bar.className = "guest-bottom-bar";
        bar.innerHTML = `
          <div class="guest-bottom-copy">
            <span>🔒</span>
            <span><strong>Gastmodus</strong> · Lesen erlaubt. Zum Erstellen bitte anmelden.</span>
          </div>
          <button type="button" class="guest-bottom-login" id="guestBottomLogin">Anmelden →</button>
        `;
        document.body.appendChild(bar);

        bar.querySelector("#guestBottomLogin")?.addEventListener("click", () => {
          openLogin("Melde dich an, um Spots oder Sichtungen zu erstellen.");
        });
      }
    } else {
      document.body.classList.remove("guest-readonly-active");
      bar?.remove();
    }
  }

  function boot() {
    protectButton("#addSpotBtn");
    protectButton("#addSightingBtn");
    protectForm("#spotForm");
    protectForm("#sightingForm");
    protectImport();
    updateWriteUi();

    const waitForFirebase = () => {
      if (!window.firebase?.auth) {
        setTimeout(waitForFirebase, 250);
        return;
      }

      firebase.auth().onAuthStateChanged(() => {
        setTimeout(updateWriteUi, 50);
      });
    };

    waitForFirebase();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
