(() => {
  "use strict";

  const ADMIN_STYLE_ID = "wildlife-admin-styles";
  const ADMIN_PANEL_ID = "adminPanel";
  const ADMIN_BUTTON_ID = "adminBtn";

  let adminUsers = [];
  let adminActivity = [];
  let activeTab = "activity";

  function isAdmin() {
    try {
      return typeof currentUserRole !== "undefined" && currentUserRole === "admin";
    } catch {
      return false;
    }
  }

  function getDb() {
    try {
      return typeof db !== "undefined" ? db : null;
    } catch {
      return null;
    }
  }

  function getUser() {
    try {
      return typeof currentUser !== "undefined" ? currentUser : null;
    } catch {
      return null;
    }
  }

  function escapeHtml(v) {
    return String(v ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[c]));
  }

  function formatTimestamp(value) {
    if (!value) return "—";
    try {
      const d = typeof value.toDate === "function" ? value.toDate() : new Date(value);
      if (Number.isNaN(d.getTime())) return "—";
      return d.toLocaleString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return "—";
    }
  }

  function injectStyles() {
    if (document.getElementById(ADMIN_STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = ADMIN_STYLE_ID;
    style.textContent = `
      #${ADMIN_BUTTON_ID}{
        border-color:#8ed098!important;
        color:#d9f4df!important;
        font-weight:900!important;
      }
      .admin-panel{
        position:fixed;
        z-index:1500;
        inset:calc(8px + env(safe-area-inset-top)) 8px calc(8px + env(safe-area-inset-bottom));
        background:rgba(14,23,17,.99);
        border:1px solid var(--line,#304938);
        border-radius:20px;
        box-shadow:0 16px 60px rgba(0,0,0,.5);
        color:var(--text,#f3f7f4);
        display:flex;
        flex-direction:column;
        overflow:hidden;
      }
      .admin-panel.hidden{display:none!important}
      .admin-head{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:10px;
        padding:15px 15px 10px;
        border-bottom:1px solid var(--line,#304938);
      }
      .admin-head h2{margin:2px 0 0;font-size:21px}
      .admin-kicker{
        font-size:10px;
        color:var(--accent,#8ed098);
        font-weight:900;
        text-transform:uppercase;
        letter-spacing:.09em;
      }
      .admin-close{
        border:0;
        background:transparent;
        color:var(--muted,#a7b5aa);
        font-size:30px;
        line-height:1;
        padding:0 5px;
      }
      .admin-tabs{
        display:flex;
        gap:6px;
        overflow-x:auto;
        padding:9px 10px;
        border-bottom:1px solid var(--line,#304938);
        scrollbar-width:none;
      }
      .admin-tabs::-webkit-scrollbar{display:none}
      .admin-tab{
        flex:0 0 auto;
        border:1px solid var(--line,#304938);
        background:var(--panel2,#1d2f23);
        color:var(--text,#f3f7f4);
        border-radius:999px;
        padding:8px 11px;
        font-size:11px;
        font-weight:800;
      }
      .admin-tab.active{
        background:var(--accent,#8ed098);
        color:#102015;
        border-color:transparent;
      }
      .admin-toolbar{
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:8px;
        padding:8px 12px;
        border-bottom:1px solid var(--line,#304938);
      }
      .admin-status{font-size:11px;color:var(--muted,#a7b5aa)}
      .admin-refresh{
        border:1px solid var(--line,#304938);
        background:var(--panel2,#1d2f23);
        color:var(--text,#f3f7f4);
        border-radius:10px;
        padding:7px 10px;
        font-size:11px;
      }
      .admin-content{
        flex:1;
        overflow:auto;
        padding:10px;
      }
      .admin-list{display:grid;gap:8px}
      .admin-card{
        background:var(--panel2,#1d2f23);
        border:1px solid var(--line,#304938);
        border-radius:14px;
        padding:10px;
      }
      .admin-card-head{
        display:flex;
        justify-content:space-between;
        gap:8px;
        align-items:flex-start;
      }
      .admin-title{font-size:13px;font-weight:900}
      .admin-meta{
        margin-top:5px;
        color:var(--muted,#a7b5aa);
        font-size:10px;
        line-height:1.45;
        overflow-wrap:anywhere;
      }
      .admin-badge{
        display:inline-flex;
        align-items:center;
        padding:3px 7px;
        border-radius:999px;
        background:#294332;
        color:#d9eadc;
        font-size:9px;
        font-weight:900;
        white-space:nowrap;
      }
      .admin-badge.admin{background:#4b3f20;color:#ffe7a0}
      .admin-badge.inactive{background:#4b2828;color:#ffdede}
      .admin-actions{
        display:flex;
        flex-wrap:wrap;
        gap:6px;
        margin-top:9px;
      }
      .admin-actions button,.admin-actions select{
        width:auto;
        margin:0;
        border:1px solid var(--line,#304938);
        background:#0f1a13;
        color:var(--text,#f3f7f4);
        border-radius:9px;
        padding:7px 9px;
        font-size:10px;
      }
      .admin-actions .admin-danger{
        background:#4b2828;
        border-color:#704040;
        color:#ffdede;
        font-weight:900;
      }
      .admin-actions button:disabled{
        opacity:.4;
        cursor:not-allowed;
      }
      .admin-empty{
        padding:24px 12px;
        text-align:center;
        color:var(--muted,#a7b5aa);
        font-size:12px;
      }
      .admin-error{
        background:#4b2828;
        color:#ffdede;
        border:1px solid #704040;
        border-radius:12px;
        padding:10px;
        font-size:11px;
      }
      .admin-summary{
        display:grid;
        grid-template-columns:repeat(4,1fr);
        gap:6px;
        margin-bottom:10px;
      }
      .admin-summary div{
        background:var(--panel2,#1d2f23);
        border:1px solid var(--line,#304938);
        border-radius:12px;
        padding:9px 5px;
        text-align:center;
      }
      .admin-summary strong{display:block;font-size:16px}
      .admin-summary span{display:block;font-size:9px;color:var(--muted,#a7b5aa);margin-top:2px}
      @media(min-width:850px){
        .admin-panel{
          width:min(760px,94vw);
          left:50%;
          right:auto;
          transform:translateX(-50%);
        }
      }
    `;
    document.head.appendChild(style);
  }

  function injectUi() {
    injectStyles();

    if (!document.getElementById(ADMIN_BUTTON_ID)) {
      const target = document.querySelector(".action-scroll");
      if (target) {
        const button = document.createElement("button");
        button.id = ADMIN_BUTTON_ID;
        button.type = "button";
        button.textContent = "👑 Admin";
        button.classList.add("hidden");
        button.addEventListener("click", openAdmin);
        target.appendChild(button);
      }
    }

    if (!document.getElementById(ADMIN_PANEL_ID)) {
      const panel = document.createElement("section");
      panel.id = ADMIN_PANEL_ID;
      panel.className = "admin-panel hidden";
      panel.innerHTML = `
        <div class="admin-head">
          <div>
            <div class="admin-kicker">👑 Administration</div>
            <h2>SichtungsApp verwalten</h2>
          </div>
          <button type="button" class="admin-close" id="adminCloseBtn" aria-label="Schließen">×</button>
        </div>
        <div class="admin-tabs">
          <button class="admin-tab active" data-admin-tab="activity">📋 Aktivitäten</button>
          <button class="admin-tab" data-admin-tab="users">👥 Nutzer</button>
          <button class="admin-tab" data-admin-tab="spots">📍 Spots</button>
          <button class="admin-tab" data-admin-tab="sightings">🦌 Sichtungen</button>
        </div>
        <div class="admin-toolbar">
          <span class="admin-status" id="adminStatus">Bereit</span>
          <button type="button" class="admin-refresh" id="adminRefreshBtn">↻ Aktualisieren</button>
        </div>
        <div class="admin-content" id="adminContent"></div>
      `;
      document.body.appendChild(panel);

      panel.querySelector("#adminCloseBtn").addEventListener("click", closeAdmin);
      panel.querySelector("#adminRefreshBtn").addEventListener("click", () => loadAdminData(true));
      panel.querySelectorAll("[data-admin-tab]").forEach(btn => {
        btn.addEventListener("click", () => {
          activeTab = btn.dataset.adminTab;
          panel.querySelectorAll("[data-admin-tab]").forEach(x => x.classList.toggle("active", x === btn));
          renderActiveTab();
        });
      });
    }
  }

  function syncVisibility() {
    injectUi();
    const btn = document.getElementById(ADMIN_BUTTON_ID);
    if (btn) btn.classList.toggle("hidden", !isAdmin());

    if (!isAdmin()) {
      closeAdmin();
    }
  }

  async function ensureOwnUserProfile() {
    const database = getDb();
    const user = getUser();
    if (!database || !user || user.isAnonymous) return;

    try {
      const ref = database.collection("users").doc(user.uid);
      const snap = await ref.get();

      if (!snap.exists) {
        await ref.set({
          displayName: user.displayName || user.email || "Nutzer",
          email: user.email || "",
          role: "user",
          active: true,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
    } catch (err) {
      console.warn("Benutzerprofil konnte nicht angelegt werden:", err);
    }
  }

  async function openAdmin() {
    syncVisibility();
    if (!isAdmin()) {
      alert("Dieser Bereich ist nur für Administratoren verfügbar.");
      return;
    }

    document.querySelector("#spotPanel")?.classList.add("hidden");
    document.querySelector("#plannerPanel")?.classList.add("hidden");
    document.querySelector("#weatherPanel")?.classList.add("hidden");

    document.getElementById(ADMIN_PANEL_ID)?.classList.remove("hidden");
    await loadAdminData(false);
  }

  function closeAdmin() {
    document.getElementById(ADMIN_PANEL_ID)?.classList.add("hidden");
  }

  function setAdminStatus(text) {
    const el = document.getElementById("adminStatus");
    if (el) el.textContent = text;
  }

  async function loadAdminData(force = false) {
    if (!isAdmin()) return;

    const database = getDb();
    if (!database) {
      renderError("Cloud-Datenbank ist noch nicht verbunden.");
      return;
    }

    setAdminStatus("Lade Daten…");

    try {
      const [usersSnap, activitySnap] = await Promise.all([
        database.collection("users").get(),
        database.collection("activity").orderBy("createdAt", "desc").limit(250).get()
      ]);

      adminUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      adminActivity = activitySnap.docs.map(d => ({ id: d.id, ...d.data() }));

      setAdminStatus(
        `${adminUsers.length} Nutzer · ${adminActivity.length} Aktivitäten geladen`
      );
      renderActiveTab();
    } catch (err) {
      console.error("Admin-Daten konnten nicht geladen werden:", err);
      setAdminStatus("Fehler beim Laden");
      renderError(err?.message || "Admin-Daten konnten nicht geladen werden.");
    }
  }

  function renderError(message) {
    const content = document.getElementById("adminContent");
    if (content) content.innerHTML = `<div class="admin-error">${escapeHtml(message)}</div>`;
  }

  function getLastActivityForUser(uid) {
    return adminActivity.find(a => a.userId === uid) || null;
  }

  function actionLabel(item) {
    const action = item.action === "create" ? "erstellt"
      : item.action === "delete" ? "gelöscht"
      : item.action === "update" ? "geändert"
      : item.action || "Aktion";

    const entity = item.entityType === "spot" ? "Spot"
      : item.entityType === "sighting" ? "Sichtung"
      : item.entityType || "Datensatz";

    return `${entity} ${action}`;
  }

  function activityDetails(item) {
    const d = item.details || {};
    if (item.entityType === "spot") {
      return [d.name, d.type, d.status].filter(Boolean).join(" · ");
    }
    if (item.entityType === "sighting") {
      return [
        d.species,
        d.count ? `${d.count}×` : "",
        d.spotId ? `Spot ${d.spotId}` : ""
      ].filter(Boolean).join(" · ");
    }
    return "";
  }

  function summaryHtml() {
    let spots = 0, sightings = 0;
    try {
      spots = Array.isArray(data?.spots) ? data.spots.length : 0;
      sightings = Array.isArray(data?.sightings) ? data.sightings.length : 0;
    } catch {}

    const admins = adminUsers.filter(u => u.role === "admin" && u.active !== false).length;
    return `
      <div class="admin-summary">
        <div><strong>${adminUsers.length}</strong><span>Nutzer</span></div>
        <div><strong>${admins}</strong><span>Admins</span></div>
        <div><strong>${spots}</strong><span>Spots</span></div>
        <div><strong>${sightings}</strong><span>Sichtungen</span></div>
      </div>
    `;
  }

  function renderActiveTab() {
    const content = document.getElementById("adminContent");
    if (!content || !isAdmin()) return;

    if (activeTab === "users") renderUsers(content);
    else if (activeTab === "spots") renderSpots(content);
    else if (activeTab === "sightings") renderSightings(content);
    else renderActivityLog(content);
  }

  function renderActivityLog(content) {
    const rows = adminActivity.map(item => {
      const name = item.userName || item.userEmail || item.userId || "Unbekannt";
      return `
        <article class="admin-card">
          <div class="admin-card-head">
            <div>
              <div class="admin-title">${escapeHtml(actionLabel(item))}</div>
              <div class="admin-meta">${escapeHtml(name)}</div>
            </div>
            <span class="admin-badge">${escapeHtml(formatTimestamp(item.createdAt))}</span>
          </div>
          <div class="admin-meta">
            ${escapeHtml(activityDetails(item) || item.entityId || "")}
            ${item.entityId ? `<br>ID: ${escapeHtml(item.entityId)}` : ""}
            ${item.userId ? `<br>UID: ${escapeHtml(item.userId)}` : ""}
          </div>
        </article>
      `;
    }).join("");

    content.innerHTML = summaryHtml() + (
      rows ? `<div class="admin-list">${rows}</div>`
           : `<div class="admin-empty">Noch keine protokollierten Aktivitäten vorhanden.</div>`
    );
  }

  function renderUsers(content) {
    const users = [...adminUsers].sort((a, b) =>
      String(a.displayName || a.email || a.id).localeCompare(String(b.displayName || b.email || b.id), "de")
    );

    content.innerHTML = summaryHtml() + `
      <div class="admin-list">
        ${users.map(user => {
          const last = getLastActivityForUser(user.id);
          const role = user.role === "admin" ? "admin" : "user";
          const active = user.active !== false;

          return `
            <article class="admin-card">
              <div class="admin-card-head">
                <div>
                  <div class="admin-title">${escapeHtml(user.displayName || user.email || "Nutzer")}</div>
                  <div class="admin-meta">${escapeHtml(user.email || "")}<br>UID: ${escapeHtml(user.id)}</div>
                </div>
                <span class="admin-badge ${role === "admin" ? "admin" : ""} ${!active ? "inactive" : ""}">
                  ${!active ? "gesperrt" : role}
                </span>
              </div>
              <div class="admin-meta">
                Letzte protokollierte Aktion: ${last ? escapeHtml(formatTimestamp(last.createdAt)) : "—"}
              </div>
              <div class="admin-actions">
                <select data-role-select="${escapeHtml(user.id)}">
                  <option value="user" ${role === "user" ? "selected" : ""}>Nutzer</option>
                  <option value="admin" ${role === "admin" ? "selected" : ""}>Admin</option>
                </select>
                <button type="button" data-save-role="${escapeHtml(user.id)}">Rolle speichern</button>
                <button type="button" data-toggle-active="${escapeHtml(user.id)}">
                  ${active ? "Nutzer sperren" : "Nutzer aktivieren"}
                </button>
              </div>
            </article>
          `;
        }).join("") || `<div class="admin-empty">Keine Nutzerprofile vorhanden.</div>`}
      </div>
    `;

    content.querySelectorAll("[data-save-role]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const uid = btn.dataset.saveRole;
        const select = content.querySelector(`[data-role-select="${CSS.escape(uid)}"]`);
        await updateUser(uid, { role: select?.value === "admin" ? "admin" : "user" });
      });
    });

    content.querySelectorAll("[data-toggle-active]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const uid = btn.dataset.toggleActive;
        const user = adminUsers.find(u => u.id === uid);
        if (!user) return;

        if (uid === getUser()?.uid && user.active !== false) {
          alert("Dein eigenes Admin-Konto solltest du hier nicht sperren.");
          return;
        }

        await updateUser(uid, { active: user.active === false });
      });
    });
  }

  async function updateUser(uid, changes) {
    if (!isAdmin()) return;

    try {
      setAdminStatus("Nutzer wird aktualisiert…");
      await getDb().collection("users").doc(uid).set(changes, { merge: true });

      if (typeof logActivity === "function") {
        await logActivity("update", "user", uid, changes);
      }

      await loadAdminData(true);
    } catch (err) {
      console.error(err);
      alert(`Nutzer konnte nicht aktualisiert werden: ${err.message || err}`);
      setAdminStatus("Fehler");
    }
  }

  function renderSpots(content) {
    let spots = [];
    try { spots = [...(data?.spots || [])]; } catch {}

    spots.sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), "de"));

    content.innerHTML = `
      <div class="admin-list">
        ${spots.map(spot => {
          const protectedRegional = spot.createdBy === "regional-dataset" || String(spot.id || "").startsWith("BLK-");
          return `
            <article class="admin-card">
              <div class="admin-card-head">
                <div>
                  <div class="admin-title">${escapeHtml(spot.name || "Unbenannter Spot")}</div>
                  <div class="admin-meta">${escapeHtml(spot.id)} · ${escapeHtml(spot.type || "")}</div>
                </div>
                <span class="admin-badge">${escapeHtml(spot.status || "")}</span>
              </div>
              <div class="admin-meta">
                Erstellt von: ${escapeHtml(spot.createdBy || "unbekannt")}
                ${protectedRegional ? "<br>System-/Regionaldatensatz – vor versehentlichem Löschen geschützt." : ""}
              </div>
              <div class="admin-actions">
                <button
                  type="button"
                  class="admin-danger"
                  data-delete-spot="${escapeHtml(spot.id)}"
                  ${protectedRegional ? "disabled" : ""}
                >Spot löschen</button>
              </div>
            </article>
          `;
        }).join("") || `<div class="admin-empty">Keine Spots vorhanden.</div>`}
      </div>
    `;

    content.querySelectorAll("[data-delete-spot]").forEach(btn => {
      btn.addEventListener("click", () => deleteSpot(btn.dataset.deleteSpot));
    });
  }

  function renderSightings(content) {
    let sightings = [];
    try { sightings = [...(data?.sightings || [])]; } catch {}

    sightings.sort((a, b) =>
      `${b.date || ""} ${b.time || ""}`.localeCompare(`${a.date || ""} ${a.time || ""}`)
    );

    content.innerHTML = `
      <div class="admin-list">
        ${sightings.map(s => `
          <article class="admin-card">
            <div class="admin-card-head">
              <div>
                <div class="admin-title">${escapeHtml(s.species || "Unbekannte Art")} · ${Number(s.count) || 1}×</div>
                <div class="admin-meta">${escapeHtml(s.id)}${s.spotId ? ` · Spot ${escapeHtml(s.spotId)}` : ""}</div>
              </div>
              <span class="admin-badge">${escapeHtml([s.date, s.time].filter(Boolean).join(" ") || "ohne Datum")}</span>
            </div>
            <div class="admin-meta">
              ${escapeHtml(s.behavior || "")}
              ${s.createdBy ? `<br>Erstellt von: ${escapeHtml(s.createdBy)}` : ""}
            </div>
            <div class="admin-actions">
              <button type="button" class="admin-danger" data-delete-sighting="${escapeHtml(s.id)}">Sichtung löschen</button>
            </div>
          </article>
        `).join("") || `<div class="admin-empty">Keine Sichtungen vorhanden.</div>`}
      </div>
    `;

    content.querySelectorAll("[data-delete-sighting]").forEach(btn => {
      btn.addEventListener("click", () => deleteSighting(btn.dataset.deleteSighting));
    });
  }

  async function deleteSpot(id) {
    if (!isAdmin()) return;

    let spot = null;
    try { spot = data.spots.find(s => s.id === id); } catch {}
    if (!spot) return;

    if (spot.createdBy === "regional-dataset" || String(id).startsWith("BLK-")) {
      alert("Dieser regionale Systemdatensatz ist gegen versehentliches Löschen geschützt.");
      return;
    }

    if (!confirm(`Spot "${spot.name || id}" wirklich löschen?\n\nDer Vorgang kann nicht rückgängig gemacht werden.`)) return;

    try {
      setAdminStatus("Spot wird gelöscht…");
      await getDb().collection("spots").doc(String(id)).delete();

      try {
        data.spots = data.spots.filter(s => s.id !== id);
        saveData();
        renderMarkers();
        updateSpotSelect();
      } catch {}

      if (typeof logActivity === "function") {
        await logActivity("delete", "spot", id, {
          name: spot.name || "",
          type: spot.type || "",
          status: spot.status || ""
        });
      }

      setAdminStatus("Spot gelöscht");
      renderSpots(document.getElementById("adminContent"));
      await loadAdminData(true);
    } catch (err) {
      console.error(err);
      alert(`Spot konnte nicht gelöscht werden: ${err.message || err}`);
      setAdminStatus("Löschen fehlgeschlagen");
    }
  }

  async function deleteSighting(id) {
    if (!isAdmin()) return;

    let sighting = null;
    try { sighting = data.sightings.find(s => s.id === id); } catch {}
    if (!sighting) return;

    if (!confirm(`Sichtung "${sighting.species || id}" wirklich löschen?\n\nDer Vorgang kann nicht rückgängig gemacht werden.`)) return;

    try {
      setAdminStatus("Sichtung wird gelöscht…");
      await getDb().collection("sightings").doc(String(id)).delete();

      try {
        data.sightings = data.sightings.filter(s => s.id !== id);
        saveData();
        renderMarkers();
      } catch {}

      if (typeof logActivity === "function") {
        await logActivity("delete", "sighting", id, {
          species: sighting.species || "",
          count: sighting.count || 1,
          spotId: sighting.spotId || null
        });
      }

      setAdminStatus("Sichtung gelöscht");
      renderSightings(document.getElementById("adminContent"));
      await loadAdminData(true);
    } catch (err) {
      console.error(err);
      alert(`Sichtung konnte nicht gelöscht werden: ${err.message || err}`);
      setAdminStatus("Löschen fehlgeschlagen");
    }
  }

  function installAuthWatcher() {
    const tryInstall = () => {
      if (!window.firebase?.auth) {
        setTimeout(tryInstall, 300);
        return;
      }

      firebase.auth().onAuthStateChanged(async user => {
        setTimeout(syncVisibility, 250);

        if (user && !user.isAnonymous) {
          await ensureOwnUserProfile();
          setTimeout(syncVisibility, 250);
        }
      });
    };

    tryInstall();
  }

  function boot() {
    injectUi();
    syncVisibility();
    installAuthWatcher();

    // loadUserRole() is asynchronous. Re-check briefly after startup/login.
    [400, 1000, 2000, 4000].forEach(ms => setTimeout(syncVisibility, ms));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
