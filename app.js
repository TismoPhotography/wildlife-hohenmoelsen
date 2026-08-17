const STORAGE_KEY = "wildlife-hohenmoelsen-v1";
const SCHEMA_VERSION = 5;

const seed = {
  schemaVersion: SCHEMA_VERSION,
  spots: [{
    id: "WHM-001",
    name: "Hochsitz westlich Mondsee",
    type: "Hochsitz",
    status: "bestätigt",
    lat: 51.130541,
    lng: 12.120998,
    habitatCode: "WFK",
    vegetation: "Wald-Feld-Kante / Sukzessionslandschaft",
    waterSource: "",
    waterDistance: null,
    mammals: ["Reh"],
    birds: [],
    mammalScore: 5,
    birdScore: 3,
    bestTime: "Abenddämmerung",
    bestSeason: "Frühling–Herbst",
    accessNotes: "Zugang nur legal und rücksichtsvoll; jagdliche Einrichtungen nur mit Erlaubnis nutzen.",
    photoNotes: "Feld-/Waldkante beobachten; ruhige Position und Wind beachten.",
    notes: "Bestätigter Wildlife-Spot. Rehwild mehrfach beobachtet."
  }],
  sightings: [{
    id: "S-0001",
    spotId: "WHM-001",
    group: "mammal",
    species: "Reh",
    count: 4,
    date: "2026-08-16",
    time: "19:45",
    behavior: "Äsen / Fressen",
    distance: null,
    direction: "Waldrand → Feld",
    notes: "Vier Rehe innerhalb von etwa 20 Minuten. Ein Reh kam bis ca. 3 m an den Hochsitz."
  }]
};

function migrateData(raw){
  const base = raw && typeof raw === "object" ? raw : structuredClone(seed);
  base.schemaVersion = SCHEMA_VERSION;
  base.spots = Array.isArray(base.spots) ? base.spots : [];
  base.sightings = Array.isArray(base.sightings) ? base.sightings : [];

  base.spots = base.spots.map((s, i) => ({
    id: s.id || `WHM-${String(i+1).padStart(3,"0")}`,
    name: s.name || "Unbenannter Spot",
    type: s.type || "Beobachtungspunkt",
    status: s.status || "potenziell",
    lat: Number(s.lat),
    lng: Number(s.lng),
    habitatCode: s.habitatCode || "",
    vegetation: s.vegetation || s.habitat || "",
    waterSource: s.waterSource || "",
    waterDistance: s.waterDistance ?? null,
    mammals: Array.isArray(s.mammals) ? s.mammals : [],
    birds: Array.isArray(s.birds) ? s.birds : [],
    mammalScore: Number(s.mammalScore || (s.status === "bestätigt" ? 5 : 3)),
    birdScore: Number(s.birdScore || 3),
    bestTime: s.bestTime || "",
    bestSeason: s.bestSeason || "",
    accessNotes: s.accessNotes || "",
    photoNotes: s.photoNotes || "",
    notes: s.notes || ""
  }));

  base.sightings = base.sightings.map((s, i) => ({
    id: s.id || `S-${String(i+1).padStart(4,"0")}`,
    spotId: s.spotId,
    group: s.group || "mammal",
    species: s.species || "Unbekannt",
    count: Number(s.count || 1),
    date: s.date || "",
    time: s.time || "",
    behavior: s.behavior || "",
    distance: s.distance ?? null,
    direction: s.direction || "",
    notes: s.notes || ""
  }));
  return base;
}

function loadData(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : structuredClone(seed);
    const migrated = migrateData(parsed);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    return migrated;
  }catch{
    return structuredClone(seed);
  }
}
function saveData(){
  data.schemaVersion = SCHEMA_VERSION;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

let data = loadData();
let currentFilter = "all";
let markerRecords = [];

const map = L.map("map", {
  zoomControl:true,
  preferCanvas:true,
  fadeAnimation:false
}).setView([51.130541,12.120998], 15);

const carto = L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
  {
    subdomains:"abcd",
    maxZoom:20,
    detectRetina:true,
    updateWhenIdle:false,
    keepBuffer:8,
    attribution:'&copy; OpenStreetMap contributors &copy; CARTO'
  }
).addTo(map);

function refreshMapSize(){
  requestAnimationFrame(()=>map.invalidateSize({pan:false,debounceMoveend:true}));
}
window.addEventListener("load",()=>{refreshMapSize();setTimeout(refreshMapSize,250);setTimeout(refreshMapSize,800)});
window.addEventListener("resize",refreshMapSize);
window.addEventListener("orientationchange",()=>setTimeout(refreshMapSize,300));

function iconFor(kind, spot=null){
  let emoji = "📍";
  let cls = kind;

  if(kind === "mammal") emoji = "🐾";
  if(kind === "bird") emoji = "🐦";
  if(kind === "water") emoji = "💧";
  if(kind === "confirmed") emoji = "✓";
  if(kind === "potential") emoji = "◇";

  if(spot?.type === "Hochsitz"){
    emoji = "🪵";
    cls += " highseat";
  }else if(spot?.type === "Wasserstelle"){
    emoji = "💧";
    cls = "water";
  }

  return L.divIcon({
    className:"",
    html:`<div class="marker-pin ${cls}"><span>${emoji}</span></div>`,
    iconSize:[34,34],iconAnchor:[17,32],popupAnchor:[0,-29]
  });
}

function spotHasWater(spot){
  return Boolean(spot.waterSource) || spot.type === "Wasserstelle";
}
function filterSpot(spot){
  switch(currentFilter){
    case "confirmed": return spot.status === "bestätigt";
    case "potential": return spot.status !== "bestätigt";
    case "mammal": return (spot.mammals||[]).length > 0;
    case "bird": return (spot.birds||[]).length > 0;
    case "water": return spotHasWater(spot);
    case "highseat": return spot.type === "Hochsitz";
    default: return true;
  }
}
function filterSighting(s){
  if(currentFilter === "mammal") return s.group === "mammal";
  if(currentFilter === "bird") return s.group === "bird";
  return currentFilter === "all" || currentFilter === "confirmed";
}

function renderMarkers(){
  markerRecords.forEach(r=>map.removeLayer(r.marker));
  markerRecords=[];

  for(const spot of data.spots){
    if(!filterSpot(spot)) continue;
    const kind = spot.status === "bestätigt" ? "confirmed" : "potential";
    const marker = L.marker([spot.lat,spot.lng],{icon:iconFor(kind,spot)})
      .addTo(map)
      .bindPopup(`
        <div class="popup">
          <h3>${escapeHtml(spot.name)}</h3>
          <p><b>${escapeHtml(spot.id)}</b> · ${escapeHtml(spot.type)}</p>
          <p>${spot.status === "bestätigt" ? "✓ Bestätigt" : "◇ Potenziell"}</p>
          <button onclick="openSpotPanel('${escapeHtml(spot.id)}')">Details öffnen</button>
        </div>`);
    markerRecords.push({marker,type:"spot"});
  }

  for(const s of data.sightings){
    if(!filterSighting(s)) continue;
    const spot=data.spots.find(p=>p.id===s.spotId);
    if(!spot) continue;
    const j=stableJitter(s.id);
    const marker=L.marker([spot.lat+j[0],spot.lng+j[1]],{icon:iconFor(s.group)})
      .addTo(map)
      .bindPopup(`
        <div class="popup">
          <h3>${escapeHtml(s.species)}</h3>
          <p>${s.group==="mammal"?"🐾 Säugetier":"🐦 Brutvogel"} · ${Number(s.count)||1}×</p>
          <p>${escapeHtml(s.date||"")} ${escapeHtml(s.time||"")}</p>
          <p>${escapeHtml(s.behavior||"")}</p>
        </div>`);
    markerRecords.push({marker,type:s.group});
  }

  renderStats();
  renderActivity();
}

function stableJitter(id){
  let h=0;for(const c of String(id))h=(h*31+c.charCodeAt(0))>>>0;
  return [((h%11)-5)*0.000012,(((h>>4)%11)-5)*0.000018];
}

function renderStats(){
  document.querySelector("#spotCount").textContent=data.spots.length;
  document.querySelector("#confirmedCount").textContent=data.spots.filter(s=>s.status==="bestätigt").length;
  document.querySelector("#sightingCount").textContent=data.sightings.length;
  document.querySelector("#speciesCount").textContent=new Set(data.sightings.map(s=>s.species.trim()).filter(Boolean)).size;
}

function renderActivity(){
  const list=document.querySelector("#activityList");
  list.innerHTML="";
  const sorted=[...data.sightings].sort((a,b)=>{
    const aa=`${a.date||""} ${a.time||""}`,bb=`${b.date||""} ${b.time||""}`;
    return bb.localeCompare(aa);
  }).slice(0,5);

  if(!sorted.length){
    list.innerHTML='<div class="activity-meta">Noch keine Sichtungen eingetragen.</div>';
    return;
  }

  const tpl=document.querySelector("#activityItemTemplate");
  for(const s of sorted){
    const node=tpl.content.cloneNode(true);
    node.querySelector(".activity-icon").textContent=s.group==="mammal"?"🐾":"🐦";
    node.querySelector(".activity-title").textContent=`${s.count||1}× ${s.species}`;
    const spot=data.spots.find(p=>p.id===s.spotId);
    node.querySelector(".activity-meta").textContent=
      `${spot?.name||s.spotId} · ${s.date||"ohne Datum"} ${s.time||""} · ${s.behavior||""}`.trim();
    list.appendChild(node);
  }
}

function scoreStars(n){
  n=Math.max(1,Math.min(5,Number(n)||1));
  return "★".repeat(n)+"☆".repeat(5-n);
}
function valueOrDash(v){return (v!==null&&v!==undefined&&String(v).trim()!=="")?String(v):"—";}
function listOrDash(a){return Array.isArray(a)&&a.length?a.join(", "):"—";}

window.openSpotPanel=function(id){
  const spot=data.spots.find(s=>s.id===id);
  if(!spot)return;

  document.querySelector("#panelSpotId").textContent=spot.id;
  document.querySelector("#panelTitle").textContent=spot.name;
  document.querySelector("#panelBadges").innerHTML=`
    <span class="badge ${spot.status==="bestätigt"?"confirmed":"potential"}">${spot.status==="bestätigt"?"✓ bestätigt":"◇ potenziell"}</span>
    <span class="badge">${escapeHtml(spot.type)}</span>
    ${spot.habitatCode?`<span class="badge">${escapeHtml(spot.habitatCode)}</span>`:""}
  `;
  const water=spot.waterSource
    ? `${spot.waterSource}${spot.waterDistance!==null&&spot.waterDistance!==""?` · ca. ${spot.waterDistance} m`:""}`
    : "—";

  document.querySelector("#panelContent").innerHTML=`
    ${detail("Vegetation",valueOrDash(spot.vegetation))}
    ${detail("Wasser",water)}
    ${detail("Säugetiere",listOrDash(spot.mammals))}
    ${detail("Säugetier-Potenzial",`<span class="score">${scoreStars(spot.mammalScore)}</span>`)}
    ${detail("Brutvögel",listOrDash(spot.birds))}
    ${detail("Brutvogel-Potenzial",`<span class="score">${scoreStars(spot.birdScore)}</span>`)}
    ${detail("Beste Zeit",valueOrDash(spot.bestTime))}
    ${detail("Jahreszeit",valueOrDash(spot.bestSeason))}
    ${detail("Zugang",valueOrDash(spot.accessNotes))}
    ${detail("Fotografie",valueOrDash(spot.photoNotes))}
    ${detail("Notizen",valueOrDash(spot.notes))}
  `;
  document.querySelector("#spotPanel").classList.remove("hidden");
};
function detail(label,value){
  return `<div class="detail-row"><span>${escapeHtml(label)}</span><span>${value}</span></div>`;
}
document.querySelector("#closePanelBtn").addEventListener("click",()=>{
  document.querySelector("#spotPanel").classList.add("hidden");
});

document.querySelectorAll(".filter").forEach(btn=>{
  btn.addEventListener("click",()=>{
    document.querySelectorAll(".filter").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter=btn.dataset.filter;
    renderMarkers();
  });
});

function updateSpotSelect(){
  const select=document.querySelector("#sightingSpotSelect");
  select.innerHTML=data.spots
    .sort((a,b)=>a.id.localeCompare(b.id))
    .map(s=>`<option value="${escapeHtml(s.id)}">${escapeHtml(s.id)} · ${escapeHtml(s.name)}</option>`).join("");
}
function nextSpotId(){
  const nums=data.spots.map(s=>Number(String(s.id).match(/(\d+)$/)?.[1]||0));
  return `WHM-${String(Math.max(0,...nums)+1).padStart(3,"0")}`;
}
function nextSightingId(){
  const nums=data.sightings.map(s=>Number(String(s.id).match(/(\d+)$/)?.[1]||0));
  return `S-${String(Math.max(0,...nums)+1).padStart(4,"0")}`;
}

const spotDialog=document.querySelector("#spotDialog");
const sightingDialog=document.querySelector("#sightingDialog");

document.querySelector("#addSpotBtn").addEventListener("click",()=>{
  const c=map.getCenter();
  const form=document.querySelector("#spotForm");
  form.reset();
  form.elements.lat.value=c.lat.toFixed(6);
  form.elements.lng.value=c.lng.toFixed(6);
  form.elements.mammalScore.value="3";
  form.elements.birdScore.value="3";
  spotDialog.showModal();
});
document.querySelector("#useMapCenterBtn").addEventListener("click",()=>{
  const c=map.getCenter();
  const form=document.querySelector("#spotForm");
  form.elements.lat.value=c.lat.toFixed(6);
  form.elements.lng.value=c.lng.toFixed(6);
});

document.querySelector("#spotForm").addEventListener("submit",e=>{
  if(e.submitter?.value==="cancel")return;
  e.preventDefault();
  const f=new FormData(e.currentTarget);
  data.spots.push({
    id:nextSpotId(),
    name:f.get("name").trim(),
    type:f.get("type"),
    status:f.get("status"),
    lat:Number(String(f.get("lat")).replace(",",".")),
    lng:Number(String(f.get("lng")).replace(",",".")),
    habitatCode:f.get("habitatCode"),
    vegetation:f.get("vegetation").trim(),
    waterSource:f.get("waterSource"),
    waterDistance:f.get("waterDistance")===""?null:Number(f.get("waterDistance")),
    mammals:splitList(f.get("mammals")),
    birds:splitList(f.get("birds")),
    mammalScore:Number(f.get("mammalScore")),
    birdScore:Number(f.get("birdScore")),
    bestTime:f.get("bestTime").trim(),
    bestSeason:f.get("bestSeason").trim(),
    accessNotes:f.get("accessNotes").trim(),
    photoNotes:f.get("photoNotes").trim(),
    notes:f.get("notes").trim()
  });
  saveData();renderMarkers();updateSpotSelect();spotDialog.close();
});

document.querySelector("#addSightingBtn").addEventListener("click",()=>{
  updateSpotSelect();
  const form=document.querySelector("#sightingForm");
  form.reset();
  form.elements.date.value=new Date().toISOString().slice(0,10);
  sightingDialog.showModal();
});

document.querySelector("#sightingForm").addEventListener("submit",e=>{
  if(e.submitter?.value==="cancel")return;
  e.preventDefault();
  const f=new FormData(e.currentTarget);
  const spotId=f.get("spotId");
  const group=f.get("group");
  const species=f.get("species").trim();

  data.sightings.push({
    id:nextSightingId(),
    spotId,
    group,
    species,
    count:Number(f.get("count"))||1,
    date:f.get("date"),
    time:f.get("time"),
    behavior:f.get("behavior"),
    distance:f.get("distance")===""?null:Number(f.get("distance")),
    direction:f.get("direction").trim(),
    notes:f.get("notes").trim()
  });

  const spot=data.spots.find(s=>s.id===spotId);
  if(spot){
    const key=group==="mammal"?"mammals":"birds";
    spot[key]=Array.from(new Set([...(spot[key]||[]),species]));
    spot.status="bestätigt";
  }

  saveData();renderMarkers();sightingDialog.close();
});

document.querySelector("#locateBtn").addEventListener("click",()=>{
  map.locate({setView:true,maxZoom:16,enableHighAccuracy:true});
});
map.on("locationfound",e=>{
  L.circleMarker(e.latlng,{radius:7,weight:3,color:"#fff",fillColor:"#3d80c1",fillOpacity:1})
    .addTo(map).bindPopup("Dein Standort").openPopup();
});
map.on("locationerror",()=>alert("Standort konnte nicht ermittelt werden. Bitte Browser-Berechtigung prüfen."));

document.querySelector("#exportBtn").addEventListener("click",()=>{
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=`wildlife-hohenmoelsen-v5-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

document.querySelector("#importInput").addEventListener("change",async e=>{
  const file=e.target.files[0];
  if(!file)return;
  try{
    const parsed=JSON.parse(await file.text());
    if(!Array.isArray(parsed.spots)||!Array.isArray(parsed.sightings))throw new Error();
    data=migrateData(parsed);
    saveData();renderMarkers();updateSpotSelect();
    alert("Import erfolgreich.");
  }catch{
    alert("Die Datei konnte nicht importiert werden.");
  }finally{e.target.value="";}
});

function splitList(v){
  return String(v||"").split(/[,;\n]/).map(x=>x.trim()).filter(Boolean);
}
function escapeHtml(v){
  return String(v??"").replace(/[&<>"']/g,c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

updateSpotSelect();
renderMarkers();
setTimeout(refreshMapSize,80);
