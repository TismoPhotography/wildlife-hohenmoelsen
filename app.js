const STORAGE_KEY = "wildlife-hohenmoelsen-v1";

const seed = {
  spots: [
    {
      id: "WHM-001",
      name: "Hochsitz westlich Mondsee",
      type: "Hochsitz",
      lat: 51.130541,
      lng: 12.120998,
      habitat: "Wald-Feld-Kante / Sukzessionslandschaft",
      mammals: ["Reh"],
      birds: [],
      notes: "Bestätigter Wildlife-Spot. Rehwild mehrfach beobachtet.",
      status: "bestätigt"
    }
  ],
  sightings: [
    {
      id: "S-0001",
      spotId: "WHM-001",
      group: "mammal",
      species: "Reh",
      count: 4,
      date: "2026-08-16",
      time: "19:45–20:15",
      behavior: "Äsen / Fressen",
      notes: "Vier Rehe innerhalb von 20 Minuten. Ein Reh kam bis ca. 3 m an den Hochsitz."
    }
  ]
};

function loadData(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(!raw){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    return structuredClone(seed);
  }
  try { return JSON.parse(raw); } catch { return structuredClone(seed); }
}
function saveData(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }

let data = loadData();
let currentFilter = "all";
let markerRecords = [];

const map = L.map("map", {zoomControl:true}).setView([51.130541,12.120998], 15);

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors',
  updateWhenIdle: false,
  keepBuffer: 6,
  crossOrigin: true
}).addTo(map);

function refreshMapSize(){
  requestAnimationFrame(() => map.invalidateSize({pan:false, debounceMoveend:true}));
}
window.addEventListener("load", ()=>{
  refreshMapSize();
  setTimeout(refreshMapSize, 250);
  setTimeout(refreshMapSize, 1000);
});
window.addEventListener("resize", refreshMapSize);
window.addEventListener("orientationchange", ()=>{
  setTimeout(refreshMapSize, 250);
  setTimeout(refreshMapSize, 800);
});
document.addEventListener("visibilitychange", ()=>{
  if(!document.hidden) setTimeout(refreshMapSize, 150);
});

function iconFor(kind){
  const emoji = kind === "mammal" ? "🐾" : kind === "bird" ? "🐦" : "📍";
  return L.divIcon({
    className:"",
    html:`<div class="pin ${kind}"><span>${emoji}</span></div>`,
    iconSize:[34,34], iconAnchor:[17,32], popupAnchor:[0,-28]
  });
}

function popupForSpot(spot){
  const last = data.sightings.filter(s=>s.spotId===spot.id).sort((a,b)=>(b.date||"").localeCompare(a.date||""))[0];
  return `
    <div class="popup">
      <h3>${escapeHtml(spot.name)}</h3>
      <p><span class="badge">${escapeHtml(spot.id)}</span><span class="badge">${escapeHtml(spot.type)}</span></p>
      <p><b>Habitat:</b> ${escapeHtml(spot.habitat || "—")}</p>
      <p><b>Säugetiere:</b> ${escapeHtml((spot.mammals||[]).join(", ") || "—")}</p>
      <p><b>Brutvögel:</b> ${escapeHtml((spot.birds||[]).join(", ") || "—")}</p>
      ${last ? `<p><b>Letzte Sichtung:</b> ${escapeHtml(last.species)} · ${escapeHtml(last.date || "")} ${escapeHtml(last.time || "")}</p>` : ""}
      <p>${escapeHtml(spot.notes || "")}</p>
    </div>`;
}

function renderMarkers(){
  markerRecords.forEach(r => map.removeLayer(r.marker));
  markerRecords = [];

  for(const spot of data.spots){
    const show = currentFilter === "all" || currentFilter === "spot" ||
      (currentFilter === "mammal" && (spot.mammals||[]).length) ||
      (currentFilter === "bird" && (spot.birds||[]).length);
    if(!show) continue;
    const marker = L.marker([spot.lat, spot.lng], {icon:iconFor("spot")})
      .addTo(map).bindPopup(popupForSpot(spot));
    markerRecords.push({marker, type:"spot"});
  }

  for(const s of data.sightings){
    const spot = data.spots.find(p=>p.id===s.spotId);
    if(!spot) continue;
    if(currentFilter !== "all" && currentFilter !== s.group) continue;
    const jitter = stableJitter(s.id);
    const marker = L.marker([spot.lat + jitter[0], spot.lng + jitter[1]], {icon:iconFor(s.group)})
      .addTo(map)
      .bindPopup(`
        <div class="popup">
          <h3>${escapeHtml(s.species)}</h3>
          <p><span class="badge">${s.group === "mammal" ? "Säugetier" : "Brutvogel"}</span></p>
          <p><b>Anzahl:</b> ${Number(s.count)||1}</p>
          <p><b>Datum:</b> ${escapeHtml(s.date||"—")} ${escapeHtml(s.time||"")}</p>
          <p><b>Verhalten:</b> ${escapeHtml(s.behavior||"—")}</p>
          <p>${escapeHtml(s.notes||"")}</p>
        </div>`);
    markerRecords.push({marker, type:s.group});
  }
  renderStats();
  renderActivity();
}

function stableJitter(id){
  let h=0; for(const c of id) h=(h*31 + c.charCodeAt(0))>>>0;
  return [((h%11)-5)*0.000012, (((h>>4)%11)-5)*0.000018];
}

function renderStats(){
  document.querySelector("#spotCount").textContent = data.spots.length;
  document.querySelector("#sightingCount").textContent = data.sightings.length;
  const species = new Set(data.sightings.map(s=>s.species.trim()).filter(Boolean));
  document.querySelector("#speciesCount").textContent = species.size;
}

function renderActivity(){
  const list = document.querySelector("#activityList");
  list.innerHTML = "";
  const tpl = document.querySelector("#activityItemTemplate");

  const sorted = [...data.sightings].sort((a,b)=>(b.date||"").localeCompare(a.date||"")).slice(0,6);
  if(!sorted.length){
    list.innerHTML = '<div class="activity-meta">Noch keine Sichtungen eingetragen.</div>';
    return;
  }
  for(const s of sorted){
    const node = tpl.content.cloneNode(true);
    node.querySelector(".activity-icon").textContent = s.group === "mammal" ? "🐾" : "🐦";
    node.querySelector(".activity-title").textContent = `${s.count || 1}× ${s.species}`;
    const spot = data.spots.find(p=>p.id===s.spotId);
    node.querySelector(".activity-meta").textContent =
      `${spot?.name || s.spotId} · ${s.date || "ohne Datum"} ${s.time || ""} · ${s.behavior || ""}`.trim();
    list.appendChild(node);
  }
}

function updateSpotSelect(){
  const select = document.querySelector("#sightingSpotSelect");
  select.innerHTML = data.spots.map(s=>`<option value="${escapeHtml(s.id)}">${escapeHtml(s.id)} · ${escapeHtml(s.name)}</option>`).join("");
}

function nextSpotId(){
  const nums = data.spots.map(s=>Number(String(s.id).match(/(\d+)$/)?.[1] || 0));
  return `WHM-${String(Math.max(0,...nums)+1).padStart(3,"0")}`;
}
function nextSightingId(){
  const nums = data.sightings.map(s=>Number(String(s.id).match(/(\d+)$/)?.[1] || 0));
  return `S-${String(Math.max(0,...nums)+1).padStart(4,"0")}`;
}

document.querySelectorAll(".filter").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    document.querySelectorAll(".filter").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    renderMarkers();
  });
});

const spotDialog = document.querySelector("#spotDialog");
const sightingDialog = document.querySelector("#sightingDialog");
document.querySelector("#addSpotBtn").addEventListener("click", ()=>{
  const c = map.getCenter();
  const form = document.querySelector("#spotForm");
  form.reset();
  form.elements.lat.value = c.lat.toFixed(6);
  form.elements.lng.value = c.lng.toFixed(6);
  spotDialog.showModal();
});
document.querySelector("#addSightingBtn").addEventListener("click", ()=>{
  updateSpotSelect();
  const form = document.querySelector("#sightingForm");
  form.reset();
  form.elements.date.value = new Date().toISOString().slice(0,10);
  sightingDialog.showModal();
});
document.querySelector("#useMapCenterBtn").addEventListener("click", ()=>{
  const c = map.getCenter();
  const form = document.querySelector("#spotForm");
  form.elements.lat.value = c.lat.toFixed(6);
  form.elements.lng.value = c.lng.toFixed(6);
});

document.querySelector("#spotForm").addEventListener("submit", e=>{
  if(e.submitter?.value === "cancel") return;
  e.preventDefault();
  const f = new FormData(e.currentTarget);
  data.spots.push({
    id: nextSpotId(),
    name: f.get("name").trim(),
    type: f.get("type"),
    lat: Number(String(f.get("lat")).replace(",",".")),
    lng: Number(String(f.get("lng")).replace(",",".")),
    habitat: f.get("habitat").trim(),
    mammals: splitList(f.get("mammals")),
    birds: splitList(f.get("birds")),
    notes: f.get("notes").trim(),
    status: "potenziell"
  });
  saveData(); renderMarkers(); updateSpotSelect(); spotDialog.close();
});

document.querySelector("#sightingForm").addEventListener("submit", e=>{
  if(e.submitter?.value === "cancel") return;
  e.preventDefault();
  const f = new FormData(e.currentTarget);
  const spotId = f.get("spotId");
  const group = f.get("group");
  const species = f.get("species").trim();

  data.sightings.push({
    id: nextSightingId(),
    spotId,
    group,
    species,
    count: Number(f.get("count")) || 1,
    date: f.get("date"),
    time: f.get("time"),
    behavior: f.get("behavior"),
    notes: f.get("notes").trim()
  });

  const spot = data.spots.find(s=>s.id===spotId);
  if(spot){
    const key = group === "mammal" ? "mammals" : "birds";
    spot[key] = Array.from(new Set([...(spot[key]||[]), species]));
    spot.status = "bestätigt";
  }

  saveData(); renderMarkers(); sightingDialog.close();
});

document.querySelector("#locateBtn").addEventListener("click", ()=>{
  map.locate({setView:true, maxZoom:16, enableHighAccuracy:true});
});
map.on("locationfound", e=>{
  L.circleMarker(e.latlng,{radius:8}).addTo(map).bindPopup("Dein Standort").openPopup();
});
map.on("locationerror", ()=> alert("Standort konnte nicht ermittelt werden. Bitte Browser-Berechtigung prüfen."));

document.querySelector("#exportBtn").addEventListener("click", ()=>{
  const blob = new Blob([JSON.stringify(data,null,2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `wildlife-hohenmoelsen-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

document.querySelector("#importInput").addEventListener("change", async e=>{
  const file = e.target.files[0];
  if(!file) return;
  try{
    const parsed = JSON.parse(await file.text());
    if(!Array.isArray(parsed.spots) || !Array.isArray(parsed.sightings)) throw new Error();
    data = parsed; saveData(); renderMarkers(); updateSpotSelect();
    alert("Import erfolgreich.");
  }catch{
    alert("Die Datei konnte nicht importiert werden.");
  }finally{
    e.target.value = "";
  }
});

function splitList(v){
  return String(v||"").split(/[,;\n]/).map(x=>x.trim()).filter(Boolean);
}
function escapeHtml(v){
  return String(v ?? "").replace(/[&<>"']/g, c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

if("serviceWorker" in navigator){
  navigator.serviceWorker.register("sw.js?v=2").catch(()=>{});
}

updateSpotSelect();
renderMarkers();
setTimeout(refreshMapSize, 50);
