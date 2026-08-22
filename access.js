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
      .guest-mode-hint {
        flex: 0 0 auto;
        padding: 7px 10px;
        border: 1px solid var(--line, #304938);
        border-radius: 10px;
        color: var(--muted, #a7b5aa);
        background: rgba(20,34,25,.72);
        font-size: 10px;
        white-space: nowrap;
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

    const actions = document.querySelector(".action-scroll");
    let hint = document.querySelector("#guestModeHint");

    if (!registered) {
      if (!hint && actions) {
        hint = document.createElement("span");
        hint.id = "guestModeHint";
        hint.className = "guest-mode-hint";
        actions.insertBefore(hint, actions.firstChild);
      }
      if (hint) hint.textContent = "👤 Gast · Lesen erlaubt · Schreiben nur nach Anmeldung";
    } else {
      hint?.remove();
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
