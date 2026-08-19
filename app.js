const STORAGE_KEY="wildlife-hohenmoelsen-v1",SCHEMA_VERSION=14;

const seed={schemaVersion:14,spots:[],sightings:[]};

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
    accessNotes:s.accessNotes||"",photoNotes:s.photoNotes||"",notes:s.notes||"",coordConfidence:s.coordConfidence||(s.id==="WHM-001"?"confirmed":"approx"),sourceType:s.sourceType||(s.id==="WHM-001"?"own":"habitat")
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

const firebaseConfig={
  apiKey:"AIzaSyBalKleJYqQhXEE2U_JHPSencqNEwDOCzA",
  authDomain:"wildlife-hohenmoelsen.firebaseapp.com",
  projectId:"wildlife-hohenmoelsen",
  storageBucket:"wildlife-hohenmoelsen.firebasestorage.app",
  messagingSenderId:"268245805881",
  appId:"1:268245805881:web:7971ef9a2330b3859c16e8",
  measurementId:"G-5ENY9YR282"
};

let db=null,currentUser=null,currentUserRole="user",currentUserName="",cloudReady=false,cloudApplying=false;

async function loadUserRole(){
  currentUserRole="user";
  currentUserName="";

  if(!db||!currentUser||currentUser.isAnonymous){
    updateAuthUI();
    return;
  }

  try{
    const doc=await db.collection("users").doc(currentUser.uid).get();

    if(doc.exists){
      const userData=doc.data();

      currentUserName=
        userData.displayName||
        currentUser.displayName||
        currentUser.email||
        "";

      if(userData.active!==false && userData.role==="admin"){
        currentUserRole="admin";
      }
    }

    updateAuthUI();

  }catch(err){
    console.error("Benutzerrolle konnte nicht geladen werden:",err);
    currentUserRole="user";
    currentUserName="";
    updateAuthUI();
  }
}
function setCloudStatus(state,text){
  const el=document.querySelector("#cloudStatus"); if(!el)return;
  el.className=`cloud-status ${state}`; el.textContent=text;
}
function cleanForFirestore(obj){
  return JSON.parse(JSON.stringify(obj,(k,v)=>v===undefined?null:v));
}
async function logActivity(action,entityType,entityId,details={}){
  if(!db||!currentUser||currentUser.isAnonymous)return;

  try{
    await db.collection("activity").add(cleanForFirestore({
      action,
      entityType,
      entityId:entityId||null,
      details,
      userId:currentUser.uid,
      userName:currentUserName||currentUser.displayName||currentUser.email||"",
      userEmail:currentUser.email||"",
      createdAt:firebase.firestore.FieldValue.serverTimestamp()
    }));
  }catch(err){
    console.error("Aktivität konnte nicht protokolliert werden:",err);
  }
}
async function putSpotCloud(spot){
  if(!cloudReady||!db)return;
  await db.collection("spots").doc(String(spot.id)).set(cleanForFirestore({...spot,updatedBy:currentUser.uid,updatedAt:firebase.firestore.FieldValue.serverTimestamp()}),{merge:true});
}
async function putSightingCloud(sighting){
  if(!cloudReady||!db)return;
  await db.collection("sightings").doc(String(sighting.id)).set(cleanForFirestore({...sighting,createdBy:sighting.createdBy||currentUser.uid,updatedBy:currentUser.uid,updatedAt:firebase.firestore.FieldValue.serverTimestamp()}),{merge:true});
}
async function uploadAllToCloud(){
  if(!cloudReady||!db)return;
  const batchLimit=400;
  const docs=[
    ...data.spots.map(x=>["spots",x]),
    ...data.sightings.map(x=>["sightings",x])
  ];
  for(let i=0;i<docs.length;i+=batchLimit){
    const batch=db.batch();
    for(const [col,obj] of docs.slice(i,i+batchLimit)){
      const ref=db.collection(col).doc(String(obj.id));
      batch.set(ref,cleanForFirestore({...obj,updatedBy:currentUser.uid,updatedAt:firebase.firestore.FieldValue.serverTimestamp()}),{merge:true});
    }
    await batch.commit();
  }
}
function subscribeCloud(){
  let cloudSpots=[],cloudSightings=[];
  const apply=()=>{
    if(!cloudReady)return;
    cloudApplying=true;
    data=migrateData({schemaVersion:SCHEMA_VERSION,spots:cloudSpots,sightings:cloudSightings});
    ensureRegionalBigGameZones();
    localStorage.setItem(STORAGE_KEY,JSON.stringify(data));
    renderMarkers();updateSpotSelect();
    cloudApplying=false;
    setCloudStatus("online","☁ Synchronisiert");
  };
  db.collection("spots").onSnapshot(s=>{
    cloudSpots=s.docs.map(d=>d.data()).filter(x=>x&&x.id);
    apply();
  },err=>{console.error(err);setCloudStatus("offline","☁ Sync-Fehler")});
  db.collection("sightings").onSnapshot(s=>{
    cloudSightings=s.docs.map(d=>d.data()).filter(x=>x&&x.id);
    apply();
  },err=>{console.error(err);setCloudStatus("offline","☁ Sync-Fehler")});
}
async function initFirebase(){
  try{
    if(!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    db=firebase.firestore();
    setCloudStatus("syncing","☁ Anmeldung…");

    // Keep an existing Google/E-mail session. Only create an anonymous
    // account when there is no persisted user at all.
 currentUser=firebase.auth().currentUser;
if(!currentUser){
  await firebase.auth().signInAnonymously();
  currentUser=firebase.auth().currentUser;
}
if(!currentUser)throw new Error("Keine Firebase-Benutzer-ID");

await loadUserRole();
cloudReady=true;
    setCloudStatus("syncing","☁ Erster Sync…");

    try{
      await syncRegionalBigGameZonesToCloud();
    }catch(err){
      console.error("Regionale Großwild-Zonen konnten nicht in die Cloud geschrieben werden:",err);
    }

    const migrationKey="wildlife-v11-cloud-migrated";
    if(localStorage.getItem(migrationKey)!=="yes"){
      await uploadAllToCloud();
      localStorage.setItem(migrationKey,"yes");
    }
    subscribeCloud();

        // Keep UI/state current after login changes.
    firebase.auth().onAuthStateChanged(async user=>{
      if(!user){
        currentUser=null;
        currentUserRole="user";
        cloudReady=false;
        updateAuthUI();
        return;
      }

      currentUser=user;
      cloudReady=true;
      await loadUserRole();
    });

  }catch(err){
    console.error("Firebase init failed",err);
    cloudReady=false;
    setCloudStatus("offline","☁ Offline – lokal");
  }
}



function displayUserLabel(user){
  if(!user)return"👤 Offline";
  if(user.isAnonymous)return"👤 Gast";

  const name=user.displayName||user.email||"Konto";

  if(currentUserRole==="admin"){
    return `👑 ${name}`;
  }

  return `👤 ${name}`;
}
function updateAuthUI(){
  const user=(window.firebase&&firebase.auth)?firebase.auth().currentUser:currentUser;
  const btn=document.querySelector("#accountBtn");
  if(btn){btn.textContent=displayUserLabel(user);btn.title=user?.email||user?.displayName||"Benutzerkonto"}
  const current=document.querySelector("#authCurrent"),logout=document.querySelector("#logoutBtn");
  if(current){
    if(!user)current.textContent="Nicht angemeldet.";
    else if(user.isAnonymous)current.textContent="Du verwendest die App aktuell als Gast.";
    else current.textContent=`Angemeldet als ${user.displayName||user.email||user.uid}`;
  }
  if(logout)logout.classList.toggle("hidden",!user||user.isAnonymous);
}
function authMsg(text,type=""){
  const el=document.querySelector("#authMessage");if(!el)return;
  el.textContent=text||"";el.className=`auth-message ${type}`;
}
function friendlyAuthError(err){
  const m={
    "auth/email-already-in-use":"Diese E-Mail-Adresse wird bereits verwendet.",
    "auth/invalid-email":"Die E-Mail-Adresse ist ungültig.",
    "auth/weak-password":"Das Passwort ist zu schwach. Mindestens 6 Zeichen verwenden.",
    "auth/invalid-credential":"E-Mail oder Passwort ist falsch.",
    "auth/wrong-password":"E-Mail oder Passwort ist falsch.",
    "auth/user-not-found":"Für diese E-Mail wurde kein Konto gefunden.",
    "auth/popup-closed-by-user":"Google-Anmeldung wurde abgebrochen.",
    "auth/popup-blocked":"Das Google-Anmeldefenster wurde vom Browser blockiert. Bitte Pop-ups für diese Seite erlauben.",
    "auth/account-exists-with-different-credential":"Für diese E-Mail existiert bereits eine andere Anmeldemethode.",
    "auth/credential-already-in-use":"Dieses Konto ist bereits mit einem anderen Benutzer verknüpft."
  };
  return m[err?.code]||err?.message||"Anmeldung fehlgeschlagen.";
}
async function registerEmail(){
  const email=document.querySelector("#authEmail").value.trim(),password=document.querySelector("#authPassword").value;
  if(!email||!password){authMsg("Bitte E-Mail und Passwort eingeben.","error");return}
  authMsg("Konto wird erstellt…");
  try{
    const auth=firebase.auth(),user=auth.currentUser;
    if(user?.isAnonymous){
      await user.linkWithCredential(firebase.auth.EmailAuthProvider.credential(email,password));
    }else if(!user){
      await auth.createUserWithEmailAndPassword(email,password);
    }else{
      authMsg("Du bist bereits mit einem Konto angemeldet.","error");return;
    }
    currentUser=auth.currentUser;updateAuthUI();authMsg("Konto erstellt und angemeldet.","ok");
  }catch(err){console.error(err);authMsg(friendlyAuthError(err),"error")}
}
async function loginEmail(){
  const email=document.querySelector("#authEmail").value.trim(),password=document.querySelector("#authPassword").value;
  if(!email||!password){authMsg("Bitte E-Mail und Passwort eingeben.","error");return}
  authMsg("Anmeldung läuft…");
  try{
    await firebase.auth().signInWithEmailAndPassword(email,password);
    currentUser=firebase.auth().currentUser;updateAuthUI();authMsg("Erfolgreich angemeldet.","ok");
  }catch(err){console.error(err);authMsg(friendlyAuthError(err),"error")}
}
async function googleLogin(){
  authMsg("Google-Anmeldung wird geöffnet…");

  try{
    const nativeAuth=window.Capacitor?.Plugins?.FirebaseAuthentication;

    // Android-App: nativen Google-Login verwenden
    if(nativeAuth){
      const result=await nativeAuth.signInWithGoogle({
        skipNativeAuth:true
      });

      const idToken=result?.credential?.idToken;

      if(!idToken){
        throw new Error("Kein Google-ID-Token erhalten.");
      }

      const credential=firebase.auth.GoogleAuthProvider.credential(idToken);
      const auth=firebase.auth();
      const user=auth.currentUser;

      if(user?.isAnonymous){
        try{
          const linked=await user.linkWithCredential(credential);
          currentUser=linked.user;
          authMsg("Google-Konto erfolgreich verknüpft.","ok");
        }catch(linkErr){
          if(
            linkErr?.code==="auth/credential-already-in-use" ||
            linkErr?.code==="auth/email-already-in-use"
          ){
            const signed=await auth.signInWithCredential(credential);
            currentUser=signed.user;
            authMsg("Mit Google angemeldet.","ok");
          }else{
            throw linkErr;
          }
        }
      }else{
        const signed=await auth.signInWithCredential(credential);
        currentUser=signed.user;
        authMsg("Mit Google angemeldet.","ok");
      }
    }

    // Browser-Version: bisherigen Popup-Login verwenden
    else{
      const auth=firebase.auth();
      const provider=new firebase.auth.GoogleAuthProvider();

      provider.setCustomParameters({
        prompt:"select_account"
      });

      const user=auth.currentUser;
      let result;

      if(user?.isAnonymous){
        result=await user.linkWithPopup(provider);
        currentUser=result.user;
        authMsg("Google-Konto erfolgreich verknüpft.","ok");
      }else{
        result=await auth.signInWithPopup(provider);
        currentUser=result.user;
        authMsg("Mit Google angemeldet.","ok");
      }
    }

    cloudReady=true;
    updateAuthUI();
    setCloudStatus("online","☁ Synchronisiert");

  }catch(err){
    console.error("Google Login Fehler:",err);
    authMsg(friendlyAuthError(err),"error");
  }
}
async function logoutUser(){
  authMsg("Abmeldung…");
  try{
    await firebase.auth().signOut();
    currentUser=null;cloudReady=false;
    await firebase.auth().signInAnonymously();
    currentUser=firebase.auth().currentUser;cloudReady=true;updateAuthUI();
    setCloudStatus("online","☁ Synchronisiert");
    authMsg("Abgemeldet. Du nutzt die App wieder als Gast.","ok");
  }catch(err){console.error(err);authMsg(friendlyAuthError(err),"error")}
}
function initAuthUiHandlers(){
  const dialog=document.querySelector("#authDialog");
  document.querySelector("#accountBtn")?.addEventListener("click",()=>{authMsg("");updateAuthUI();dialog.showModal()});
  document.querySelector("#closeAuthBtn")?.addEventListener("click",()=>dialog.close());
  document.querySelector("#emailRegisterBtn")?.addEventListener("click",registerEmail);
  document.querySelector("#emailLoginBtn")?.addEventListener("click",loginEmail);
  document.querySelector("#googleAuthBtn")?.addEventListener("click",googleLogin);
  document.querySelector("#logoutBtn")?.addEventListener("click",logoutUser);
}

const map=L.map("map",{zoomControl:true,preferCanvas:true,fadeAnimation:false}).setView([51.135,12.125],14);

const street=L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",{
  subdomains:"abcd",maxZoom:20,detectRetina:true,updateWhenIdle:false,keepBuffer:8,
  attribution:'&copy; OpenStreetMap contributors &copy; CARTO'
}).addTo(map);

const satellite=L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{
  maxZoom:19,updateWhenIdle:false,keepBuffer:8,
  attribution:'Tiles &copy; Esri — Sources: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
});

L.control.layers({"Karte":street,"Satellit":satellite},null,{position:"bottomleft",collapsed:true}).addTo(map);
map.on("baselayerchange",()=>setTimeout(refreshMapSize,60));

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

const SPECIES_FILTERS={
  roe:["reh","rehwild"],
  reddeer:["rotwild","rothirsch"],
  fallowdeer:["damwild","damhirsch"],
  hare:["feldhase","hase"],
  fox:["fuchs","rotfuchs"]
};

function normalizedSpeciesName(v){
  return String(v||"").trim().toLowerCase();
}
function matchesSpeciesFilter(value,filter){
  const name=normalizedSpeciesName(value);
  const aliases=SPECIES_FILTERS[filter]||[];
  return aliases.some(alias=>name===alias||name.includes(alias));
}
function spotMatchesSpeciesFilter(spot,filter){
  return (spot.mammals||[]).some(name=>matchesSpeciesFilter(name,filter));
}
function sightingMatchesSpeciesFilter(sighting,filter){
  return sighting.group==="mammal"&&matchesSpeciesFilter(sighting.species,filter);
}

function installSpeciesFilters(){
  const scroller=document.querySelector(".filter-scroll");
  if(!scroller||scroller.dataset.speciesFiltersInstalled==="yes")return;

  const mammalBtn=scroller.querySelector('[data-filter="mammal"]');
  const birdBtn=scroller.querySelector('[data-filter="bird"]');

  const buttons=[
    ["roe","🦌 Rehwild"],
    ["reddeer","🦌 Rotwild"],
    ["fallowdeer","🦌 Damwild"],
    ["hare","🐇 Feldhase"],
    ["fox","🦊 Fuchs"]
  ];

  if(mammalBtn){
    for(const [filter,label] of buttons){
      const btn=document.createElement("button");
      btn.className="filter";
      btn.dataset.filter=filter;
      btn.textContent=label;
      scroller.insertBefore(btn,mammalBtn);
    }
    mammalBtn.remove();
  }

  if(birdBtn){
    birdBtn.textContent="🐦 Vögel";
  }

  scroller.dataset.speciesFiltersInstalled="yes";
}

function filterSpot(s){
  if(currentFilter==="confirmed")return s.status==="bestätigt";
  if(currentFilter==="potential")return s.status!=="bestätigt";
  if(SPECIES_FILTERS[currentFilter])return spotMatchesSpeciesFilter(s,currentFilter);
  if(currentFilter==="bird")return(s.birds||[]).length>0;
  if(currentFilter==="water")return spotHasWater(s);
  if(currentFilter==="highseat")return s.type==="Hochsitz";
  return true;
}
function filterSighting(s){
  if(SPECIES_FILTERS[currentFilter])return sightingMatchesSpeciesFilter(s,currentFilter);
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
  qs("#panelContent").innerHTML=detail("Vegetation",val(s.vegetation))+detail("Wasser",water)+detail("Säugetiere",listv(s.mammals))+detail("Säugetier-Potenzial",`<span class="score">${stars(s.mammalScore)}</span>`)+detail("Brutvögel",listv(s.birds))+detail("Brutvogel-Potenzial",`<span class="score">${stars(s.birdScore)}</span>`)+detail("Beste Zeit",val(s.bestTime))+detail("Jahreszeit",val(s.bestSeason))+detail("Zugang",val(s.accessNotes))+detail("Fotografie",val(s.photoNotes))+detail("Koordinaten",qualityLabel(s.coordConfidence))+detail("Datenbasis",sourceLabel(s.sourceType))+detail("Notizen",val(s.notes));
  qs("#spotPanel").classList.remove("hidden")
};
qs("#closePanelBtn").addEventListener("click",()=>qs("#spotPanel").classList.add("hidden"));

installSpeciesFilters();

document.querySelectorAll(".filter").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll(".filter").forEach(b=>b.classList.remove("active"));btn.classList.add("active");currentFilter=btn.dataset.filter;renderMarkers()
}));

function updateSpotSelect(){
  const select=qs("#sightingSpotSelect"),current=select.value;
  select.innerHTML='<option value="">Keinem Spot zuordnen</option>'+[...data.spots].sort((a,b)=>a.id.localeCompare(b.id)).map(s=>`<option value="${esc(s.id)}">${esc(s.id)} · ${esc(s.name)}</option>`).join("");
  if([...select.options].some(o=>o.value===current))select.value=current
}
function nextSpotId(){const u=(currentUser?.uid||"local").slice(0,4).toUpperCase();return`WHM-${Date.now().toString(36).toUpperCase()}-${u}`}
function nextSightingId(){const u=(currentUser?.uid||"local").slice(0,4).toUpperCase();return`S-${Date.now().toString(36).toUpperCase()}-${u}`}

const spotDialog=qs("#spotDialog"),sightingDialog=qs("#sightingDialog");

function closeDialogClean(dialog){
  if(!dialog || !dialog.open) return;
  dialog.close("cancel");
  pickerMode=null;
  qs("#pickBanner").classList.add("hidden");
  if(pickPreview){map.removeLayer(pickPreview);pickPreview=null}
  setTimeout(refreshMapSize,50);
}

document.querySelectorAll(".dialog-cancel").forEach(btn=>{
  btn.addEventListener("click",()=>{
    const dialog=btn.closest("dialog");
    closeDialogClean(dialog);
  });
});

// Also support the Android/browser back/cancel event cleanly.
[spotDialog,sightingDialog].forEach(dialog=>{
  dialog.addEventListener("cancel",e=>{
    e.preventDefault();
    closeDialogClean(dialog);
  });
});


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

qs("#spotForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const f=new FormData(e.currentTarget);

  const spot={
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
    mammals:split(f.get("mammals")),
    birds:split(f.get("birds")),
    mammalScore:Number(f.get("mammalScore")),
    birdScore:Number(f.get("birdScore")),
    bestTime:f.get("bestTime").trim(),
    bestSeason:f.get("bestSeason").trim(),
    accessNotes:f.get("accessNotes").trim(),
    photoNotes:f.get("photoNotes").trim(),
    notes:f.get("notes").trim(),
    coordConfidence:f.get("coordConfidence"),
    sourceType:f.get("sourceType"),
    createdBy:currentUser?.uid||"local"
  };

  data.spots.push(spot);
  saveData();
  renderMarkers();
  updateSpotSelect();
  spotDialog.close();

  if(pickPreview){
    map.removeLayer(pickPreview);
    pickPreview=null;
  }

  if(cloudReady){
    try{
      setCloudStatus("syncing","☁ Speichern…");

      await putSpotCloud(spot);

      await logActivity(
        "create",
        "spot",
        spot.id,
        {
          name:spot.name,
          type:spot.type,
          status:spot.status
        }
      );

    }catch(err){
      console.error(err);
      setCloudStatus("offline","☁ Sync-Fehler");
    }
  }
});

qs("#sightingForm").addEventListener("submit",async e=>{
  e.preventDefault();

  const f=new FormData(e.currentTarget);
  const spotId=f.get("spotId");
  const linked=data.spots.find(s=>s.id===spotId);

  let lat=Number(String(f.get("lat")||"").replace(",","."));
  let lng=Number(String(f.get("lng")||"").replace(",","."));

  if(!Number.isFinite(lat)||!Number.isFinite(lng)){
    if(linked){
      lat=linked.lat;
      lng=linked.lng;
    }else{
      alert("Bitte einen Punkt auf der Karte auswählen oder einen Spot zuordnen.");
      return;
    }
  }

  const group=f.get("group");
  const species=f.get("species").trim();

  const sighting={
    id:nextSightingId(),
    spotId,
    group,
    species,
    count:Number(f.get("count"))||1,
    lat,
    lng,
    date:f.get("date"),
    time:f.get("time"),
    behavior:f.get("behavior"),
    distance:f.get("distance")===""?null:Number(f.get("distance")),
    direction:f.get("direction").trim(),
    notes:f.get("notes").trim(),
    createdBy:currentUser?.uid||"local"
  };

  data.sightings.push(sighting);

  if(linked){
    const key=group==="mammal"?"mammals":"birds";
    linked[key]=Array.from(new Set([...(linked[key]||[]),species]));
    linked.status="bestätigt";
  }

  saveData();
  renderMarkers();
  sightingDialog.close();

  if(pickPreview){
    map.removeLayer(pickPreview);
    pickPreview=null;
  }

  if(cloudReady){
    try{
      setCloudStatus("syncing","☁ Speichern…");

      await putSightingCloud(sighting);

      if(linked){
        await putSpotCloud(linked);
      }

      await logActivity(
        "create",
        "sighting",
        sighting.id,
        {
          species:sighting.species,
          group:sighting.group,
          count:sighting.count,
          spotId:sighting.spotId||null
        }
      );

    }catch(err){
      console.error(err);
      setCloudStatus("offline","☁ Sync-Fehler");
    }
  }
});

qs("#locateBtn").addEventListener("click",()=>map.locate({setView:true,maxZoom:16,enableHighAccuracy:true}));
map.on("locationfound",e=>L.circleMarker(e.latlng,{radius:7,weight:3,color:"#fff",fillColor:"#3d80c1",fillOpacity:1}).addTo(map).bindPopup("Dein Standort").openPopup());
map.on("locationerror",()=>alert("Standort konnte nicht ermittelt werden. Bitte Browser-Berechtigung prüfen."));

qs("#exportBtn").addEventListener("click",()=>{const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`wildlife-hohenmoelsen-v12-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href)});
qs("#importInput").addEventListener("change",async e=>{const file=e.target.files[0];if(!file)return;try{const parsed=JSON.parse(await file.text());if(!Array.isArray(parsed.spots)||!Array.isArray(parsed.sightings))throw new Error();data=migrateData(parsed);saveData();renderMarkers();updateSpotSelect();if(cloudReady){setCloudStatus("syncing","☁ Import-Sync…");await uploadAllToCloud()}alert("Import erfolgreich – Daten wurden mit der Cloud zusammengeführt.")}catch(err){console.error(err);alert("Die Datei konnte nicht importiert werden.")}finally{e.target.value=""}});

function split(v){return String(v||"").split(/[,;\n]/).map(x=>x.trim()).filter(Boolean)}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function qs(s){return document.querySelector(s)}


const SPECIES_PROFILES=[
  {name:"Rotwild",icon:"🦌",group:"mammal",hours:[[4,9],[17,24]],habitats:["WFK","DW","BR","WI"],water:true,season:"Ganzjährig; besonders gut im Herbst",food:"Gräser, Kräuter, Blätter, Triebe, Rinde, Feldfrüchte",note:"Große, störungsarme Wald-Offenland-Komplexe sind besonders interessant. Punkte in der App sind Beobachtungs-/Potenzialzonen, keine veröffentlichten Einstände."},
  {name:"Damwild",icon:"🦌",group:"mammal",hours:[[4,10],[16,24]],habitats:["WFK","DW","BR","WI","AF"],water:true,season:"Ganzjährig; Brunft im Herbst",food:"Gräser, Kräuter, Blätter, Knospen, Früchte und Feldfrüchte",note:"Bevorzugt strukturreiche Wald-Offenland-Landschaften. Die App zeigt keine sensiblen Ruhe- oder Einstandsorte."},
  {name:"Reh",icon:"🦌",group:"mammal",hours:[[4,8],[18,24]],habitats:["WFK","WI","HG","BR"],water:false,season:"Ganzjährig",food:"Gräser, Kräuter, Knospen, Blätter, Feldfrüchte",note:"Schwerpunkt meist Dämmerung; Störung und Jahreszeit verschieben Aktivität."},
  {name:"Wildschwein",icon:"🐗",group:"mammal",hours:[[19,24],[0,6]],habitats:["DW","BR","GW","AF"],water:true,season:"Ganzjährig",food:"Wurzeln, Früchte, Eicheln, Feldfrüchte, Wirbellose",note:"Überwiegend dämmerungs-/nachtaktiv; Suhlen und Deckung sind relevant."},
  {name:"Fuchs",icon:"🦊",group:"mammal",hours:[[19,24],[0,7]],habitats:["WFK","HG","AF","BR"],water:false,season:"Ganzjährig",food:"Kleinsäuger, Vögel, Wirbellose, Früchte",note:"Oft in Dämmerung und Nacht; auch tagsüber möglich."},
  {name:"Feldhase",icon:"🐇",group:"mammal",hours:[[5,9],[17,23]],habitats:["AF","WI","HG"],water:false,season:"Ganzjährig",food:"Gräser, Kräuter, Feldfrüchte",note:"Offenland; Aktivität häufig morgens und abends."},
  {name:"Rotmilan",icon:"🦅",group:"bird",hours:[[8,18]],habitats:["AF","WI","HG","WFK"],water:false,season:"Frühjahr–Herbst",food:"Kleinsäuger, Aas, andere leicht erreichbare Beute",note:"Tagsüber; offene Nahrungsflächen und Thermik günstig."},
  {name:"Mäusebussard",icon:"🦅",group:"bird",hours:[[8,18]],habitats:["AF","WI","WFK","HG"],water:false,season:"Ganzjährig",food:"Vor allem Kleinsäuger",note:"Tagsüber; Ansitze und Offenland absuchen."},
  {name:"Neuntöter",icon:"🐦",group:"bird",hours:[[6,18]],habitats:["HG","BR","WFK"],water:false,season:"Spätfrühling–Sommer",food:"Große Insekten, kleine Wirbeltiere",note:"Strukturreiche Hecken und Gebüsche; Brutplätze nicht annähern."},
  {name:"Wasservögel",icon:"🦆",group:"bird",hours:[[5,20]],habitats:["GW"],water:true,season:"Ganzjährig",food:"Je nach Art Wasserpflanzen, Wirbellose, Fische",note:"Gewässer vom öffentlichen Ufer/Weg beobachten."}
];


// Regionale Großwild-Hinweiszonen für den Burgenlandkreis.
// WICHTIG: Diese Datensätze sind bewusst grob zentrierte Beobachtungs-/Habitat-Zonen.
// Sie stellen KEINE exakten Wildstandorte, Einstände, Fütterungen oder garantierten Sichtungen dar.
const REGIONAL_BIG_GAME_ZONES=[
  {
    id:"BLK-RW-ZIEGELRODA",
    name:"Ziegelrodaer Forst – Rotwildgebiet",
    type:"Beobachtungszone",status:"potenziell",
    lat:51.335,lng:11.585,habitatCode:"WFK",
    vegetation:"Großer zusammenhängender Waldkomplex mit Wald-Offenland-Übergängen.",
    waterSource:"Waldgewässer / Gräben im Großraum",waterDistance:null,
    mammals:["Rotwild"],birds:[],mammalScore:5,birdScore:2,
    bestTime:"Dämmerung; nur von öffentlichen Wegen und mit großem Abstand",
    bestSeason:"Ganzjährig; erhöhte Aktivität im Herbst",
    accessNotes:"Nur öffentliche Wege nutzen; Ruhebereiche nicht betreten.",
    photoNotes:"Teleobjektiv verwenden und Distanz halten.",
    notes:"Quellenbasiertes Vorkommensgebiet. Marker ist eine grobe Gebietszentrierung und ausdrücklich keine exakte Sichtungs- oder Einstandskoordinate.",
    coordConfidence:"approx",sourceType:"official",createdBy:"regional-dataset"
  },
  {
    id:"BLK-RW-NEBRA",
    name:"Nebra / Unstruttal – Rotwild-Potenzial",
    type:"Beobachtungszone",status:"potenziell",
    lat:51.275,lng:11.575,habitatCode:"WFK",
    vegetation:"Wald-Offenland-Mosaik am südlichen Rand größerer Waldkomplexe.",
    waterSource:"Unstruttal im weiteren Umfeld",waterDistance:null,
    mammals:["Rotwild"],birds:[],mammalScore:4,birdScore:2,
    bestTime:"Frühe Morgen- und Abenddämmerung",
    bestSeason:"Ganzjährig",
    accessNotes:"Beobachtung nur von öffentlichen Wegen / Waldrändern.",
    photoNotes:"Keine Annäherung an Wild oder Ruhebereiche.",
    notes:"Habitat-/Beobachtungspotenzial im Umfeld des belegten Rotwild-Großraums; keine bestätigte Einzelsichtung an diesem Marker.",
    coordConfidence:"approx",sourceType:"habitat",createdBy:"regional-dataset"
  },
  {
    id:"BLK-DW-FINNE",
    name:"Finne – Damwildgebiet",
    type:"Beobachtungszone",status:"potenziell",
    lat:51.235,lng:11.565,habitatCode:"WFK",
    vegetation:"Wald-Offenland-Komplex der Finne.",
    waterSource:"Bäche / Kleingewässer im Großraum",waterDistance:null,
    mammals:["Damwild"],birds:[],mammalScore:5,birdScore:2,
    bestTime:"Morgen- und Abenddämmerung",
    bestSeason:"Ganzjährig; Herbst besonders interessant",
    accessNotes:"Öffentliche Wege nutzen; Wild nicht verfolgen.",
    photoNotes:"Aus Distanz beobachten.",
    notes:"Quellenbasiertes regionales Damwild-Vorkommensgebiet; grobe Beobachtungszone, kein Einstand.",
    coordConfidence:"approx",sourceType:"official",createdBy:"regional-dataset"
  },
  {
    id:"BLK-DW-FREYBURG",
    name:"Freyburg / Möllern – Damwild-Großraum",
    type:"Beobachtungszone",status:"potenziell",
    lat:51.215,lng:11.735,habitatCode:"WFK",
    vegetation:"Strukturreiche Wald-, Hang- und Offenlandbereiche.",
    waterSource:"Saale/Unstrut im weiteren Umfeld",waterDistance:null,
    mammals:["Damwild"],birds:[],mammalScore:5,birdScore:2,
    bestTime:"Dämmerung",
    bestSeason:"Ganzjährig",
    accessNotes:"Nur öffentlich zugängliche Wege und Aussichtspunkte verwenden.",
    photoNotes:"Große Distanz einhalten.",
    notes:"Regional belegter Damwild-Großraum; Marker dient der Orientierung und ist keine exakte Tierkoordinate.",
    coordConfidence:"approx",sourceType:"official",createdBy:"regional-dataset"
  },
  {
    id:"BLK-DW-STEINBURG",
    name:"Steinburg / Eckartsberga – Damwild-Großraum",
    type:"Beobachtungszone",status:"potenziell",
    lat:51.145,lng:11.555,habitatCode:"WFK",
    vegetation:"Wald-Offenland-Landschaft im nordwestlichen Burgenlandkreis.",
    waterSource:"lokale Bäche / Kleingewässer",waterDistance:null,
    mammals:["Damwild"],birds:[],mammalScore:5,birdScore:2,
    bestTime:"Morgen- und Abenddämmerung",
    bestSeason:"Ganzjährig",
    accessNotes:"Öffentliche Wege nutzen.",
    photoNotes:"Nicht in Deckungsbereiche hineinlaufen.",
    notes:"Regional belegter Damwild-Großraum; bewusst grob gesetzter Marker.",
    coordConfidence:"approx",sourceType:"official",createdBy:"regional-dataset"
  },
  {
    id:"BLK-DW-BILLRODA",
    name:"Billroda – Damwild-Großraum",
    type:"Beobachtungszone",status:"potenziell",
    lat:51.205,lng:11.455,habitatCode:"WFK",
    vegetation:"Wald- und Offenlandmosaik der Finne-Region.",
    waterSource:"lokale Gewässer",waterDistance:null,
    mammals:["Damwild"],birds:[],mammalScore:5,birdScore:2,
    bestTime:"Dämmerung",
    bestSeason:"Ganzjährig",
    accessNotes:"Nur öffentliche Wege; sensible Bereiche meiden.",
    photoNotes:"Distanz halten.",
    notes:"Regional belegter Damwild-Großraum; keine exakte Sichtungskoordinate.",
    coordConfidence:"approx",sourceType:"official",createdBy:"regional-dataset"
  },
  {
    id:"BLK-DW-LOSSA",
    name:"Lossa / Finne – Damwild-Potenzial",
    type:"Beobachtungszone",status:"potenziell",
    lat:51.220,lng:11.420,habitatCode:"WFK",
    vegetation:"Waldreiche Finne-Landschaft mit Offenlandübergängen.",
    waterSource:"lokale Bäche",waterDistance:null,
    mammals:["Damwild"],birds:[],mammalScore:4,birdScore:2,
    bestTime:"Dämmerung",
    bestSeason:"Ganzjährig",
    accessNotes:"Öffentliche Wege nutzen.",
    photoNotes:"Wild nicht bedrängen.",
    notes:"Regionaler Hinweis-/Potenzialraum; keine bestätigte Einzelsichtung am Marker.",
    coordConfidence:"approx",sourceType:"habitat",createdBy:"regional-dataset"
  },
  {
    id:"BLK-DW-PRIESSNITZ",
    name:"Prießnitz / Saale-Unstrut – Damwild-Potenzial",
    type:"Beobachtungszone",status:"potenziell",
    lat:51.115,lng:11.780,habitatCode:"WFK",
    vegetation:"Waldinseln, Feldgehölze und Offenlandkanten.",
    waterSource:"Bäche / Saale-Unstrut-Großraum",waterDistance:null,
    mammals:["Damwild"],birds:[],mammalScore:4,birdScore:2,
    bestTime:"Frühmorgens und abends",
    bestSeason:"Ganzjährig",
    accessNotes:"Von öffentlichen Wegen beobachten.",
    photoNotes:"Keine Annäherung.",
    notes:"Regionaler Hinweis-/Habitatraum; keine exakte Sichtungskoordinate.",
    coordConfidence:"approx",sourceType:"habitat",createdBy:"regional-dataset"
  },
  {
    id:"BLK-RW-ZEITZER",
    name:"Zeitzer Forst – Rotwild-Habitatpotenzial",
    type:"Beobachtungszone",status:"potenziell",
    lat:50.980,lng:12.085,habitatCode:"WFK",
    vegetation:"Großer Waldkomplex mit störungsarmen Teilbereichen und Wald-Offenland-Kanten.",
    waterSource:"Waldgewässer / Bäche",waterDistance:null,
    mammals:["Rotwild"],birds:[],mammalScore:3,birdScore:2,
    bestTime:"Dämmerung",
    bestSeason:"Ganzjährig",
    accessNotes:"Nur freigegebene öffentliche Wege nutzen.",
    photoNotes:"Keine Suche nach Einständen.",
    notes:"Habitat-Prognose. Für diesen Marker wird keine konkrete Rotwildsichtung behauptet.",
    coordConfidence:"review",sourceType:"habitat",createdBy:"regional-dataset"
  }
];

function ensureRegionalBigGameZones(){
  if(!Array.isArray(data.spots))data.spots=[];
  let changed=false;
  for(const zone of REGIONAL_BIG_GAME_ZONES){
    if(!data.spots.some(s=>s.id===zone.id)){
      data.spots.push({...zone});
      changed=true;
    }
  }
  if(changed)saveData();
}

async function syncRegionalBigGameZonesToCloud(){
  if(!cloudReady||!db||!currentUser)return;
  const batch=db.batch();
  for(const zone of REGIONAL_BIG_GAME_ZONES){
    const ref=db.collection("spots").doc(String(zone.id));
    batch.set(
      ref,
      cleanForFirestore({
        ...zone,
        updatedBy:currentUser.uid,
        updatedAt:firebase.firestore.FieldValue.serverTimestamp()
      }),
      {merge:true}
    );
  }
  await batch.commit();
}

const AUDIT={
  "WHM-001":{level:"confirmed",text:"Exakte Nutzerkoordinate; bestätigte Rehsichtung."},
  "WHM-002":{level:"approx",text:"Mondsee-West als grobe Habitat-/Nasswiesenzone plausibel; kein Tierstandort."},
  "WHM-003":{level:"approx",text:"Mondsee-Uferzone plausibel; Punkt ist nur Beobachtungszone."},
  "WHM-004":{level:"approx",text:"Nordfeld Jaucha fachlich als Natur-/Landschaftsbereich belegt; Koordinate bleibt grobe Gebietszentrierung."},
  "WHM-005":{level:"approx",text:"Korrigiert nach Werschen/Rippachtal. Werschen liegt ca. 3 km südwestlich von Hohenmölsen; Punkt bleibt grobe Zone."},
  "WHM-006":{level:"review",text:"Rekultivierungs-/Sukzessionslandschaft im Profen-Umfeld fachlich plausibel; exakter Beobachtungspunkt sollte vor Ort bzw. anhand öffentlicher Wege verfeinert werden."},
  "WHM-007":{level:"review",text:"Sternentor-Artenschutzbezug ist belegt; bisherige Punktkoordinate ist nicht als exakte Lage aus der Fachunterlage verifiziert und sollte als grobe Zone behandelt werden."}
};

function qualityLabel(v){
  if(v==="confirmed")return'<span class="quality-ok">✓ exakt/bestätigt</span>';
  if(v==="review")return'<span class="quality-review">! noch prüfen</span>';
  return'<span class="quality-warn">≈ grobe Zone</span>';
}
function sourceLabel(v){
  return v==="own"?"Eigene Beobachtung":v==="official"?"Quellenbasiertes Vorkommensgebiet":"Habitat-/Potenzialprognose";
}
function timeMatches(profile,hour){return profile.hours.some(([a,b])=>hour>=a&&hour<b)}
function spotSpecies(spot){
  const names=[...(spot.mammals||[]),...(spot.birds||[])].map(x=>x.toLowerCase());
  return SPECIES_PROFILES.filter(p=>names.some(n=>n.includes(p.name.toLowerCase())||p.name.toLowerCase().includes(n)));
}
function profileScore(spot,p,hour){
  let score=20;
  if(p.habitats.includes(spot.habitatCode))score+=25;
  if(timeMatches(p,hour))score+=25;
  if(p.water&&spotHasWater(spot))score+=15;
  if(spot.status==="bestätigt")score+=10;
  const observed=data.sightings.some(s=>s.spotId===spot.id&&s.species.toLowerCase().includes(p.name.toLowerCase()));
  if(observed)score+=20;
  const listed=[...(spot.mammals||[]),...(spot.birds||[])].some(n=>n.toLowerCase().includes(p.name.toLowerCase())||p.name.toLowerCase().includes(n.toLowerCase()));
  if(listed)score+=10;
  return Math.min(95,score);
}
function showPlanner(kind){
  const panel=qs("#plannerPanel"),content=qs("#plannerContent");
  qs("#spotPanel").classList.add("hidden");
  panel.classList.remove("hidden");
  if(kind==="species"){
    qs("#plannerKicker").textContent="Artenwissen";
    qs("#plannerTitle").textContent="Aktivitäts- & Habitatprofile";
    content.innerHTML='<div class="species-grid">'+SPECIES_PROFILES.map(p=>`<div class="species-card"><h3>${p.icon} ${p.name}</h3><p><b>Aktiv:</b> ${p.hours.map(h=>`${String(h[0]).padStart(2,"0")}:00–${String(h[1]).padStart(2,"0")}:00`).join(", ")}</p><p><b>Nahrung:</b> ${p.food}</p><p><b>Saison:</b> ${p.season}</p><p>${p.note}</p></div>`).join("")+'</div>';
    return;
  }
  if(kind==="audit"){
    qs("#plannerKicker").textContent="Datenprüfung";
    qs("#plannerTitle").textContent="WHM-001 bis WHM-007";
    content.innerHTML=data.spots.slice().sort((a,b)=>a.id.localeCompare(b.id)).map(s=>{
      const a=AUDIT[s.id]||{level:s.coordConfidence||"review",text:"Noch nicht separat geprüft."};
      const cls=a.level==="confirmed"?"quality-ok":a.level==="approx"?"quality-warn":"quality-review";
      return `<div class="plan-card"><div class="plan-head"><strong>${esc(s.id)} · ${esc(s.name)}</strong><span class="${cls}">${a.level==="confirmed"?"✓":a.level==="approx"?"≈":"!"}</span></div><div class="plan-meta">${esc(a.text)}</div></div>`;
    }).join("");
    return;
  }
  const hour=new Date().getHours();
  qs("#plannerKicker").textContent=`Wildlife-Planer · ${String(hour).padStart(2,"0")}:00`;
  qs("#plannerTitle").textContent="Was lohnt sich jetzt?";
  let rows=[];
  for(const s of data.spots){
    const profiles=spotSpecies(s);
    const candidates=(profiles.length?profiles:SPECIES_PROFILES.filter(p=>p.habitats.includes(s.habitatCode)))
      .map(p=>({p,score:profileScore(s,p,hour)})).sort((a,b)=>b.score-a.score).slice(0,3);
    if(candidates.length){
      const best=candidates[0].score;
      rows.push({s,best,candidates});
    }
  }
  rows.sort((a,b)=>b.best-a.best);
  content.innerHTML=rows.slice(0,6).map(r=>`<div class="plan-card"><div class="plan-head"><strong>${esc(r.s.id)} · ${esc(r.s.name)}</strong><span class="plan-score">${r.best}%</span></div><div class="plan-species">${r.candidates.map(x=>`${x.p.icon} ${x.p.name} ${x.score}%`).join(" · ")}</div><div class="plan-meta">${esc(r.s.bestTime||"Habitat-/Zeitmodell")} · ${qualityLabel(r.s.coordConfidence||"approx")}</div></div>`).join("")||'<div class="plan-meta">Noch nicht genug Habitatdaten für eine Empfehlung.</div>';
}
qs("#nowBtn").addEventListener("click",()=>showPlanner("now"));
qs("#speciesBtn").addEventListener("click",()=>showPlanner("species"));
qs("#auditBtn").addEventListener("click",()=>showPlanner("audit"));
qs("#closePlannerBtn").addEventListener("click",()=>qs("#plannerPanel").classList.add("hidden"));


let liveConditions=null;
let lastUserLocation=null;

function degToCompass(deg){
  const dirs=["N","NO","O","SO","S","SW","W","NW"];
  return dirs[Math.round((Number(deg)||0)/45)%8];
}
function haversineKm(aLat,aLng,bLat,bLng){
  const R=6371,toRad=x=>x*Math.PI/180;
  const dLat=toRad(bLat-aLat),dLng=toRad(bLng-aLng);
  const x=Math.sin(dLat/2)**2+Math.cos(toRad(aLat))*Math.cos(toRad(bLat))*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(x));
}
function fmtDistance(km){
  if(!Number.isFinite(km))return"";
  return km<1?`${Math.round(km*1000)} m`:`${km.toFixed(1)} km`;
}
function sunPhase(nowIso,sunriseIso,sunsetIso){
  if(!sunriseIso||!sunsetIso)return"unbekannt";
  const now=new Date(nowIso),rise=new Date(sunriseIso),set=new Date(sunsetIso);
  const dawnStart=new Date(rise.getTime()-45*60000),duskEnd=new Date(set.getTime()+45*60000);
  if(now>=dawnStart&&now<=new Date(rise.getTime()+60*60000))return"Morgendämmerung";
  if(now>=new Date(set.getTime()-60*60000)&&now<=duskEnd)return"Abenddämmerung";
  if(now>rise&&now<set)return"Tag";
  return"Nacht";
}
async function fetchLiveConditions(lat,lng){
  const url=`https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day&daily=sunrise,sunset&timezone=auto&forecast_days=1`;
  const res=await fetch(url,{cache:"no-store"});
  if(!res.ok)throw new Error("Wetterdaten nicht verfügbar");
  const j=await res.json();
  return {
    lat,lng,
    time:j.current?.time||new Date().toISOString(),
    temperature:j.current?.temperature_2m,
    humidity:j.current?.relative_humidity_2m,
    precipitation:j.current?.precipitation,
    cloudCover:j.current?.cloud_cover,
    windSpeed:j.current?.wind_speed_10m,
    windDirection:j.current?.wind_direction_10m,
    windGusts:j.current?.wind_gusts_10m,
    weatherCode:j.current?.weather_code,
    isDay:j.current?.is_day,
    sunrise:j.daily?.sunrise?.[0]||"",
    sunset:j.daily?.sunset?.[0]||"",
    timezone:j.timezone||""
  };
}
function weatherInfluence(profile,cond){
  let delta=0,notes=[];
  const wind=Number(cond.windSpeed||0),gust=Number(cond.windGusts||0),rain=Number(cond.precipitation||0),cloud=Number(cond.cloudCover||0);
  if(profile.group==="mammal"){
    if(wind<=15){delta+=6;notes.push("ruhiger Wind")}
    else if(wind>30){delta-=12;notes.push("starker Wind")}
    if(rain>2){delta-=12;notes.push("stärkerer Niederschlag")}
    else if(rain>0){delta-=3;notes.push("leichter Niederschlag")}
    if(cloud>=50&&cloud<=95){delta+=3}
  }else{
    if(profile.name==="Rotmilan"||profile.name==="Mäusebussard"){
      if(wind>=8&&wind<=25){delta+=6;notes.push("brauchbarer Wind/Thermik")}
      if(rain>1){delta-=14;notes.push("Regen ungünstig")}
      if(gust>45){delta-=8;notes.push("starke Böen")}
    }else{
      if(rain>2){delta-=8;notes.push("stärkerer Niederschlag")}
      if(wind>30){delta-=7;notes.push("starker Wind")}
    }
  }
  return {delta,notes};
}
function timeInfluence(profile,cond){
  const phase=sunPhase(cond.time,cond.sunrise,cond.sunset);
  let delta=0;
  if(profile.group==="mammal"){
    if(phase==="Abenddämmerung"||phase==="Morgendämmerung")delta+=14;
    else if(phase==="Nacht"&&(profile.name==="Fuchs"||profile.name==="Wildschwein"))delta+=10;
    else if(phase==="Tag")delta-=4;
  }else{
    if(phase==="Tag")delta+=8;
    if(phase==="Nacht")delta-=18;
  }
  return {delta,phase};
}
function enhancedProfileScore(spot,p,cond){
  const hour=new Date(cond.time).getHours();
  let base=profileScore(spot,p,hour);
  const w=weatherInfluence(p,cond),t=timeInfluence(p,cond);
  base=Math.max(5,Math.min(98,base+w.delta+t.delta));
  return {score:base,weatherNotes:w.notes,phase:t.phase};
}
async function getConditionsForPlanner(){
  if(lastUserLocation){
    liveConditions=await fetchLiveConditions(lastUserLocation.lat,lastUserLocation.lng);
    return liveConditions;
  }
  const c=map.getCenter();
  liveConditions=await fetchLiveConditions(c.lat,c.lng);
  return liveConditions;
}
function conditionClass(score){return score>=75?"condition-good":score>=55?"condition-mid":"condition-poor"}
async function showWeatherPanel(){
  const panel=qs("#weatherPanel"),content=qs("#weatherContent");
  qs("#plannerPanel")?.classList.add("hidden");qs("#spotPanel").classList.add("hidden");
  panel.classList.remove("hidden");
  qs("#weatherTitle").textContent="Wetter & Sonnenstand";
  content.innerHTML='<div class="plan-meta">Live-Daten werden geladen…</div>';
  try{
    const c=await getConditionsForPlanner(),phase=sunPhase(c.time,c.sunrise,c.sunset);
    content.innerHTML=`
      <div class="weather-strip">
        <div class="weather-chip"><strong>${Math.round(c.temperature)}°C</strong><span>Temperatur</span></div>
        <div class="weather-chip"><strong>${Math.round(c.windSpeed)} km/h</strong><span>Wind ${degToCompass(c.windDirection)}</span></div>
        <div class="weather-chip"><strong>${Number(c.precipitation||0).toFixed(1)} mm</strong><span>Niederschlag</span></div>
        <div class="weather-chip"><strong>${Math.round(c.cloudCover||0)}%</strong><span>Bewölkung</span></div>
      </div>
      <div class="sun-card">
        <b>${phase}</b><br>
        Sonnenaufgang: ${new Date(c.sunrise).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"})}<br>
        Sonnenuntergang: ${new Date(c.sunset).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"})}<br>
        Luftfeuchte: ${Math.round(c.humidity||0)}% · Böen: ${Math.round(c.windGusts||0)} km/h
      </div>
      <div class="weather-note">Wetterdaten: Open-Meteo. Die Wildlife-Bewertung ist ein heuristischer Planungsscore, keine garantierte Sichtungswahrscheinlichkeit.</div>`;
  }catch(err){
    content.innerHTML=`<div class="plan-card"><span class="condition-poor">Wetterdaten konnten nicht geladen werden.</span><div class="plan-meta">${esc(err.message)}</div></div>`;
  }
}
async function showBestNow(){
  const panel=qs("#plannerPanel"),content=qs("#plannerContent");
  qs("#weatherPanel").classList.add("hidden");qs("#spotPanel").classList.add("hidden");
  panel.classList.remove("hidden");
  qs("#plannerKicker").textContent="Live-Wildlife-Planer";
  qs("#plannerTitle").textContent="Beste Spots jetzt";
  content.innerHTML='<div class="plan-meta">Wetter, Sonnenstand und Entfernungen werden berechnet…</div>';
  try{
    const cond=await getConditionsForPlanner();
    const origin=lastUserLocation||{lat:map.getCenter().lat,lng:map.getCenter().lng};
    let rows=[];
    for(const s of data.spots){
      const profiles=spotSpecies(s);
      const pool=(profiles.length?profiles:SPECIES_PROFILES.filter(p=>p.habitats.includes(s.habitatCode)));
      if(!pool.length)continue;
      const scored=pool.map(p=>({p,...enhancedProfileScore(s,p,cond)})).sort((a,b)=>b.score-a.score).slice(0,3);
      const dist=haversineKm(origin.lat,origin.lng,s.lat,s.lng);
      const distancePenalty=Math.min(12,dist*1.5);
      const best=Math.max(5,Math.round(scored[0].score-distancePenalty));
      rows.push({s,scored,best,dist});
    }
    rows.sort((a,b)=>b.best-a.best||a.dist-b.dist);
    content.innerHTML=rows.slice(0,8).map(r=>{
      const best=r.scored[0],cls=conditionClass(r.best);
      const note=[best.phase,...best.weatherNotes].filter(Boolean).join(" · ");
      return `<div class="plan-card">
        <div class="plan-head"><strong>${esc(r.s.id)} · ${esc(r.s.name)}</strong><span class="plan-score ${cls}">${r.best}%</span></div>
        <div class="plan-species">${r.scored.map(x=>`${x.p.icon} ${x.p.name} ${Math.round(x.score)}%`).join(" · ")}</div>
        <div class="plan-meta">${esc(note||"Habitat-/Zeitmodell")} <span class="distance-badge">${fmtDistance(r.dist)}</span></div>
      </div>`;
    }).join("")||'<div class="plan-meta">Noch nicht genug Daten für eine Bewertung.</div>';
  }catch(err){
    content.innerHTML=`<div class="plan-card"><span class="condition-poor">Live-Bewertung nicht verfügbar.</span><div class="plan-meta">${esc(err.message)}</div></div>`;
  }
}
qs("#bestNowBtn").addEventListener("click",showBestNow);
qs("#weatherBtn").addEventListener("click",showWeatherPanel);
qs("#closeWeatherBtn").addEventListener("click",()=>qs("#weatherPanel").classList.add("hidden"));

// Remember user location for distance calculations and live local weather.
map.on("locationfound",e=>{
  lastUserLocation={lat:e.latlng.lat,lng:e.latlng.lng};
});

ensureRegionalBigGameZones();
updateSpotSelect();renderMarkers();setTimeout(refreshMapSize,80);
initAuthUiHandlers();
initFirebase();
