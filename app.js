const STORAGE_KEY="wildlife-hohenmoelsen-v1",SCHEMA_VERSION=7;

const seed={schemaVersion:7,spots:[],sightings:[]};

function migrateData(raw){
  const base=raw&&typeof raw==="object"?raw:{...seed};
  base.schemaVersion=SCHEMA_VERSION;
  base.spots=Array.isArray(base.spots)?base.spots:[];
  base.sightings=Array.isArray(base.sightings)?base.sightings:[];

  base.spots=base.spots.map((s,i)=>({
    id:s.id||`WHM-${String(i+1).padStart(3,"0")}`,name:s.name||"Unbenannter Spot",
    type:s.type||"Beobachtungspunkt",status:s.status||"potenziell",
    lat:Number(s.lat),lng:Number(s.lng),habitatCode:s.habitatCode||"",
    vegetation:s.vegetation||s.habitat||"",waterSource:s.waterSource||"",
    waterDistance:s.waterDistance??null,mammals:Array.isArray(s.mammals)?s.mammals:[],
    birds:Array.isArray(s.birds)?s.birds:[],mammalScore:Number(s.mammalScore||3),
    birdScore:Number(s.birdScore||3),bestTime:s.bestTime||"",bestSeason:s.bestSeason||"",
    accessNotes:s.accessNotes||"",photoNotes:s.photoNotes||"",notes:s.notes||""
  }));

  base.sightings=base.sightings.map((s,i)=>{
    const linked=base.spots.find(p=>p.id===s.spotId);
    return {
      id:s.id||`S-${String(i+1).padStart(4,"0")}`,spotId:s.spotId||"",
      group:s.group||"mammal",species:s.species||"Unbekannt",count:Number(s.count||1),
      lat:Number.isFinite(Number(s.lat))?Number(s.lat):(linked?linked.lat:null),
      lng:Number.isFinite(Number(s.lng))?Number(s.lng):(linked?linked.lng:null),
      date:s.date||"",time:s.time||"",behavior:s.behavior||"",
      distance:s.distance??null,direction:s.direction||"",notes:s.notes||""
    };
  });
  return base;
}

function loadData(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    const parsed=raw?JSON.parse(raw):structuredClone(seed);
    const migrated=migrateData(parsed);
    localStorage.setItem(STORAGE_KEY,JSON.stringify(migrated));
    return migrated;
  }catch{return structuredClone(seed)}
}
function saveData(){data.schemaVersion=SCHEMA_VERSION;localStorage.setItem(STORAGE_KEY,JSON.stringify(data))}
let data=loadData(),currentFilter="all",markerRecords=[],pickerMode=null,pickPreview=null;

const map=L.map("map",{zoomControl:true,preferCanvas:true,fadeAnimation:false}).setView([51.135,12.125],14);

const street=L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",{
  subdomains:"abcd",maxZoom:20,detectRetina:true,updateWhenIdle:false,keepBuffer:8,
  attribution:'&copy; OpenStreetMap contributors &copy; CARTO'
}).addTo(map);

const satellite=L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{
  maxZoom:19,updateWhenIdle:false,keepBuffer:8,
  attribution:'Tiles &copy; Esri — Sources: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
});

L.control.layers({"Karte":street,"Satellit":satellite},null,{position:"topright",collapsed:false}).addTo(map);

function refreshMapSize(){requestAnimationFrame(()=>map.invalidateSize({pan:false,debounceMoveend:true}))}
window.addEventListener("load",()=>{refreshMapSize();setTimeout(refreshMapSize,250);setTimeout(refreshMapSize,800)});
window.addEventListener("resize",refreshMapSize);
window.addEventListener("orientationchange",()=>setTimeout(refreshMapSize,300));

function iconFor(kind,spot=null){
  let emoji="📍",cls=kind;
  if(kind==="mammal")emoji="🐾"; if(kind==="bird")emoji="🐦";
  if(kind==="confirmed")emoji="✓"; if(kind==="potential")emoji="◇";
  if(spot?.type==="Hochsitz"){emoji="🪵";cls+=" highseat"}
  else if(spot?.type==="Wasserstelle"){emoji="💧";cls="water"}
  return L.divIcon({className:"",html:`<div class="marker-pin ${cls}"><span>${emoji}</span></div>`,iconSize:[34,34],iconAnchor:[17,32],popupAnchor:[0,-29]})
}
function previewIcon(){return L.divIcon({className:"pick-preview",html:'<div class="marker-pin confirmed"><span>✚</span></div>',iconSize:[34,34],iconAnchor:[17,32]})}
function spotHasWater(s){return Boolean(s.waterSource)||s.type==="Wasserstelle"}
function filterSpot(s){
  if(currentFilter==="confirmed")return s.status==="bestätigt";
  if(currentFilter==="potential")return s.status!=="bestätigt";
  if(currentFilter==="mammal")return(s.mammals||[]).length>0;
  if(currentFilter==="bird")return(s.birds||[]).length>0;
  if(currentFilter==="water")return spotHasWater(s);
  if(currentFilter==="highseat")return s.type==="Hochsitz";
  return true;
}
function filterSighting(s){
  if(currentFilter==="mammal")return s.group==="mammal";
  if(currentFilter==="bird")return s.group==="bird";
  return currentFilter==="all"||currentFilter==="confirmed";
}
function renderMarkers(){
  markerRecords.forEach(r=>map.removeLayer(r.marker));markerRecords=[];
  for(const spot of data.spots){
    if(!filterSpot(spot)||!Number.isFinite(spot.lat)||!Number.isFinite(spot.lng))continue;
    const kind=spot.status==="bestätigt"?"confirmed":"potential";
    const marker=L.marker([spot.lat,spot.lng],{icon:iconFor(kind,spot)}).addTo(map).bindPopup(
      `<div class="popup"><h3>${esc(spot.name)}</h3><p><b>${esc(spot.id)}</b> · ${esc(spot.type)}</p><p>${spot.status==="bestätigt"?"✓ Bestätigt":"◇ Potenziell"}</p><button onclick="openSpotPanel('${esc(spot.id)}')">Details öffnen</button></div>`
    );
    markerRecords.push({marker,type:"spot"});
  }
  for(const s of data.sightings){
    if(!filterSighting(s)||!Number.isFinite(s.lat)||!Number.isFinite(s.lng))continue;
    const marker=L.marker([s.lat,s.lng],{icon:iconFor(s.group)}).addTo(map).bindPopup(
      `<div class="popup"><h3>${esc(s.species)}</h3><p>${s.group==="mammal"?"🐾 Säugetier":"🐦 Brutvogel"} · ${Number(s.count)||1}×</p><p>${esc(s.date||"")} ${esc(s.time||"")}</p><p>${esc(s.behavior||"")}</p></div>`
    );
    markerRecords.push({marker,type:s.group});
  }
  renderStats();renderActivity();
}
function renderStats(){
  qs("#spotCount").textContent=data.spots.length;
  qs("#confirmedCount").textContent=data.spots.filter(s=>s.status==="bestätigt").length;
  qs("#sightingCount").textContent=data.sightings.length;
  qs("#speciesCount").textContent=new Set(data.sightings.map(s=>s.species.trim()).filter(Boolean)).size;
}
function renderActivity(){
  const list=qs("#activityList");list.innerHTML="";
  const sorted=[...data.sightings].sort((a,b)=>`${b.date||""} ${b.time||""}`.localeCompare(`${a.date||""} ${a.time||""}`)).slice(0,5);
  if(!sorted.length){list.innerHTML='<div class="activity-meta">Noch keine Sichtungen eingetragen.</div>';return}
  const tpl=qs("#activityItemTemplate");
  for(const s of sorted){
    const node=tpl.content.cloneNode(true),spot=data.spots.find(p=>p.id===s.spotId);
    node.querySelector(".activity-icon").textContent=s.group==="mammal"?"🐾":"🐦";
    node.querySelector(".activity-title").textContent=`${s.count||1}× ${s.species}`;
    node.querySelector(".activity-meta").textContent=`${spot?.name||"freier Kartenpunkt"} · ${s.date||"ohne Datum"} ${s.time||""} · ${s.behavior||""}`.trim();
    list.appendChild(node)
  }
}
function stars(n){n=Math.max(1,Math.min(5,Number(n)||1));return"★".repeat(n)+"☆".repeat(5-n)}
function detail(a,b){return`<div class="detail-row"><span>${esc(a)}</span><span>${b}</span></div>`}
function val(v){return v!==null&&v!==undefined&&String(v).trim()!==""?String(v):"—"}
function listv(a){return Array.isArray(a)&&a.length?a.join(", "):"—"}
window.openSpotPanel=function(id){
  const s=data.spots.find(x=>x.id===id);if(!s)return;
  qs("#panelSpotId").textContent=s.id;qs("#panelTitle").textContent=s.name;
  qs("#panelBadges").innerHTML=`<span class="badge ${s.status==="bestätigt"?"confirmed":"potential"}">${s.status==="bestätigt"?"✓ bestätigt":"◇ potenziell"}</span><span class="badge">${esc(s.type)}</span>${s.habitatCode?`<span class="badge">${esc(s.habitatCode)}</span>`:""}`;
  const water=s.waterSource?`${s.waterSource}${s.waterDistance!==null&&s.waterDistance!==""?` · ca. ${s.waterDistance} m`:""}`:"—";
  qs("#panelContent").innerHTML=detail("Vegetation",val(s.vegetation))+detail("Wasser",water)+detail("Säugetiere",listv(s.mammals))+detail("Säugetier-Potenzial",`<span class="score">${stars(s.mammalScore)}</span>`)+detail("Brutvögel",listv(s.birds))+detail("Brutvogel-Potenzial",`<span class="score">${stars(s.birdScore)}</span>`)+detail("Beste Zeit",val(s.bestTime))+detail("Jahreszeit",val(s.bestSeason))+detail("Zugang",val(s.accessNotes))+detail("Fotografie",val(s.photoNotes))+detail("Notizen",val(s.notes));
  qs("#spotPanel").classList.remove("hidden")
};
qs("#closePanelBtn").addEventListener("click",()=>qs("#spotPanel").classList.add("hidden"));

document.querySelectorAll(".filter").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll(".filter").forEach(b=>b.classList.remove("active"));btn.classList.add("active");currentFilter=btn.dataset.filter;renderMarkers()
}));

function updateSpotSelect(){
  const select=qs("#sightingSpotSelect"),current=select.value;
  select.innerHTML='<option value="">Keinem Spot zuordnen</option>'+[...data.spots].sort((a,b)=>a.id.localeCompare(b.id)).map(s=>`<option value="${esc(s.id)}">${esc(s.id)} · ${esc(s.name)}</option>`).join("");
  if([...select.options].some(o=>o.value===current))select.value=current
}
function nextSpotId(){return`WHM-${String(Math.max(0,...data.spots.map(s=>Number(String(s.id).match(/(\d+)$/)?.[1]||0)))+1).padStart(3,"0")}`}
function nextSightingId(){return`S-${String(Math.max(0,...data.sightings.map(s=>Number(String(s.id).match(/(\d+)$/)?.[1]||0)))+1).padStart(4,"0")}`}

const spotDialog=qs("#spotDialog"),sightingDialog=qs("#sightingDialog");

function beginPick(mode){
  pickerMode=mode;
  const banner=qs("#pickBanner");
  qs("#pickBannerTitle").textContent=mode==="spot"?"Spot-Punkt auswählen":"Sichtungspunkt auswählen";
  qs("#pickBannerText").textContent="Tippe auf die genaue Stelle in der Karte.";
  banner.classList.remove("hidden");
  if(mode==="spot")spotDialog.close();else sightingDialog.close();
}
function cancelPick(){
  pickerMode=null;qs("#pickBanner").classList.add("hidden");
  if(pickPreview){map.removeLayer(pickPreview);pickPreview=null}
}
qs("#cancelPickBtn").addEventListener("click",cancelPick);

map.on("click",e=>{
  if(!pickerMode)return;
  if(pickPreview)map.removeLayer(pickPreview);
  pickPreview=L.marker(e.latlng,{icon:previewIcon(),zIndexOffset:2000}).addTo(map);
  const lat=e.latlng.lat.toFixed(6),lng=e.latlng.lng.toFixed(6),mode=pickerMode;
  pickerMode=null;qs("#pickBanner").classList.add("hidden");

  if(mode==="spot"){
    const f=qs("#spotForm");f.elements.lat.value=lat;f.elements.lng.value=lng;
    qs("#spotCoordStatus").textContent=`Ausgewählt: ${lat}, ${lng}`;qs("#spotCoordStatus").classList.add("ok");
    spotDialog.showModal()
  }else{
    const f=qs("#sightingForm");f.elements.lat.value=lat;f.elements.lng.value=lng;
    qs("#sightingCoordStatus").textContent=`Ausgewählt: ${lat}, ${lng}`;qs("#sightingCoordStatus").classList.add("ok");
    sightingDialog.showModal()
  }
});

qs("#addSpotBtn").addEventListener("click",()=>{
  const f=qs("#spotForm"),c=map.getCenter();f.reset();f.elements.lat.value=c.lat.toFixed(6);f.elements.lng.value=c.lng.toFixed(6);
  qs("#spotCoordStatus").textContent="Du kannst die Kartenmitte verwenden oder einen Punkt antippen.";qs("#spotCoordStatus").classList.remove("ok");spotDialog.showModal()
});
qs("#pickSpotOnMapBtn").addEventListener("click",()=>beginPick("spot"));

qs("#addSightingBtn").addEventListener("click",()=>{
  updateSpotSelect();const f=qs("#sightingForm"),c=map.getCenter();f.reset();f.elements.date.value=new Date().toISOString().slice(0,10);f.elements.lat.value="";f.elements.lng.value="";
  qs("#sightingCoordStatus").textContent="Wähle am besten den exakten Punkt auf der Karte.";qs("#sightingCoordStatus").classList.remove("ok");sightingDialog.showModal()
});
qs("#pickSightingOnMapBtn").addEventListener("click",()=>beginPick("sighting"));

qs("#sightingSpotSelect").addEventListener("change",e=>{
  const s=data.spots.find(x=>x.id===e.target.value);if(!s)return;
  const f=qs("#sightingForm");
  if(!f.elements.lat.value&&!f.elements.lng.value){f.elements.lat.value=s.lat.toFixed(6);f.elements.lng.value=s.lng.toFixed(6);qs("#sightingCoordStatus").textContent="Vorbelegt mit dem Spot-Punkt; für exakte Sichtung Karte antippen."}
});

qs("#spotForm").addEventListener("submit",e=>{
  if(e.submitter?.value==="cancel")return;e.preventDefault();const f=new FormData(e.currentTarget);
  data.spots.push({id:nextSpotId(),name:f.get("name").trim(),type:f.get("type"),status:f.get("status"),lat:Number(String(f.get("lat")).replace(",",".")),lng:Number(String(f.get("lng")).replace(",",".")),habitatCode:f.get("habitatCode"),vegetation:f.get("vegetation").trim(),waterSource:f.get("waterSource"),waterDistance:f.get("waterDistance")===""?null:Number(f.get("waterDistance")),mammals:split(f.get("mammals")),birds:split(f.get("birds")),mammalScore:Number(f.get("mammalScore")),birdScore:Number(f.get("birdScore")),bestTime:f.get("bestTime").trim(),bestSeason:f.get("bestSeason").trim(),accessNotes:f.get("accessNotes").trim(),photoNotes:f.get("photoNotes").trim(),notes:f.get("notes").trim()});
  saveData();renderMarkers();updateSpotSelect();spotDialog.close();if(pickPreview){map.removeLayer(pickPreview);pickPreview=null}
});

qs("#sightingForm").addEventListener("submit",e=>{
  if(e.submitter?.value==="cancel")return;e.preventDefault();const f=new FormData(e.currentTarget),spotId=f.get("spotId"),linked=data.spots.find(s=>s.id===spotId);
  let lat=Number(String(f.get("lat")||"").replace(",",".")),lng=Number(String(f.get("lng")||"").replace(",","."));
  if(!Number.isFinite(lat)||!Number.isFinite(lng)){if(linked){lat=linked.lat;lng=linked.lng}else{alert("Bitte einen Punkt auf der Karte auswählen oder einen Spot zuordnen.");return}}
  const group=f.get("group"),species=f.get("species").trim();
  data.sightings.push({id:nextSightingId(),spotId,group,species,count:Number(f.get("count"))||1,lat,lng,date:f.get("date"),time:f.get("time"),behavior:f.get("behavior"),distance:f.get("distance")===""?null:Number(f.get("distance")),direction:f.get("direction").trim(),notes:f.get("notes").trim()});
  if(linked){const key=group==="mammal"?"mammals":"birds";linked[key]=Array.from(new Set([...(linked[key]||[]),species]));linked.status="bestätigt"}
  saveData();renderMarkers();sightingDialog.close();if(pickPreview){map.removeLayer(pickPreview);pickPreview=null}
});

qs("#locateBtn").addEventListener("click",()=>map.locate({setView:true,maxZoom:16,enableHighAccuracy:true}));
map.on("locationfound",e=>L.circleMarker(e.latlng,{radius:7,weight:3,color:"#fff",fillColor:"#3d80c1",fillOpacity:1}).addTo(map).bindPopup("Dein Standort").openPopup());
map.on("locationerror",()=>alert("Standort konnte nicht ermittelt werden. Bitte Browser-Berechtigung prüfen."));

qs("#exportBtn").addEventListener("click",()=>{const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`wildlife-hohenmoelsen-v7-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href)});
qs("#importInput").addEventListener("change",async e=>{const file=e.target.files[0];if(!file)return;try{const parsed=JSON.parse(await file.text());if(!Array.isArray(parsed.spots)||!Array.isArray(parsed.sightings))throw new Error();data=migrateData(parsed);saveData();renderMarkers();updateSpotSelect();alert("Import erfolgreich.")}catch{alert("Die Datei konnte nicht importiert werden.")}finally{e.target.value=""}});

function split(v){return String(v||"").split(/[,;\n]/).map(x=>x.trim()).filter(Boolean)}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function qs(s){return document.querySelector(s)}

updateSpotSelect();renderMarkers();setTimeout(refreshMapSize,80);
