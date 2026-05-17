// ================================================================
// 상태
// ================================================================
const S={
  user:null,role:null,
  mainMap:null,rdMap:null,monMap:null,
  mainLayers:[],rdLayers:[],rdRteLayers:[],monMarkers:{},
  drawMode:false,drawPts:[],drawMk:[],drawLine:null,drawPoly:null,
  rteDraw:false,rteColor:'#378ADD',rteTeam:'경로',rtePts:[],rteLine:null,rteMk:[],
  rteLines:[],
  gpsMk:null,gpsCircle:null,gpsWatch:null,gpsPulse:null,
  mainGpsMk:null,mainGpsCircle:null,homeGpsMk:null,
  rdGpsWatch:null,rdGpsOn:false,
  monInterval:null,
  monFocus:null,monLastActive:{},monSimTimer:null,monSimOn:false,
  mapFilter:'all',
  curZone:null,
  panelZone:null,
  homeSelectedZone:null,
  startPinEdit:false,
  routeMode:'2',
  showTbl:false,
  nextId:0,

  volunteers:['김철수','이영희','박민준','최수진','정지훈','한은정','오세훈','류미나'],
  contacts:{
    '김철수':{phone:'010-1234-5678',kakao:''},'이영희':{phone:'010-2345-6789',kakao:''},
    '박민준':{phone:'010-3456-7890',kakao:''},'최수진':{phone:'010-4567-8901',kakao:''},
    '정지훈':{phone:'010-5678-9012',kakao:''},'한은정':{phone:'010-6789-0123',kakao:''},
    '오세훈':{phone:'010-7890-1234',kakao:''},'류미나':{phone:'010-8901-2345',kakao:''},
  },
  leaders:[
    {name:'김인도',color:'#D85A30'},
    {name:'이인도',color:'#7F3FBF'},
  ],
  volColors:['#378ADD','#3B6D11','#D85A30','#7F3FBF','#C0392B','#E67E22','#1ABC9C','#E91E63'],

  pendingResume:false,
  leaderMode:'guide', // 'both'=함께봉사, 'guide'=인도만
  routeDirection:null,
  pendingNoteZoneId:null,
  // 봉사 세션 상태
  session:{
    active:false,       // 봉사 진행중
    zoneId:null,        // 현재 구역
    startTime:null,     // 시작 시간
    companions:[],      // 함께하는 봉사자들
    progressPts:[],     // 마지막으로 저장한 위치 포인트
    progressLayer:null, // 이전 버전 진행 라인 정리용
    progressMarker:null,
    gpsWatch:null,      // 세션 GPS
  },

  zones:[],
  records:[],
};

// 유틸
function isDone(id){
  const now=new Date();
  const ym=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  // completed===true 인 기록만 완료로 인정 (미완료/진행중 제외)
  return S.records.some(r=>r.zoneId===id&&r.date.startsWith(ym)&&r.completed===true);
}
function isInProgress(id){
  // 현재 진행중이거나 미완료 기록이 있는지
  return S.records.some(r=>r.zoneId===id&&r.completed===false);
}
function getZoneById(id){return S.zones.find(z=>String(z.id)===String(id));}
function isResetZone(id){
  const z=getZoneById(id);
  return !!(z&&z.resetAt)&&!isDone(id)&&!isInProgress(id);
}
function getZoneState(id){
  if(isDone(id))return 'done';
  if(isInProgress(id))return 'progress';
  return 'standby';
}
function getZoneStatusMeta(id){
  const state=getZoneState(id);
  if(state==='done')return {state,text:'완료',cls:'done',icon:'✓',color:'#3B6D11'};
  if(state==='progress')return {state,text:'미완료',cls:'progress',icon:'!',color:'#D85A30'};
  return {state,text:'봉사대기',cls:'reset',icon:'○',color:'#185FA5'};
}
function canStartZone(id){
  return getZoneState(id)==='standby';
}
function guardStartableZone(id){
  if(canStartZone(id))return true;
  if(isDone(id))toast('완료된 구역입니다. 관리자가 초기화해 봉사대기로 바꾼 뒤 다시 시작할 수 있습니다.');
  else toast('미완료 구역입니다. 이어하기로 계속하거나 관리자가 초기화해야 새로 시작할 수 있습니다.');
  return false;
}
function markZoneReset(id){
  const z=getZoneById(id);
  if(z)z.resetAt=new Date().toISOString();
}
function clearZoneReset(id){
  const z=getZoneById(id);
  if(z&&z.resetAt)delete z.resetAt;
}
function zoneCenter(z){
  const pts=z.polygon||[];
  if(!pts.length)return [38.20138,128.59350];
  const lats=pts.map(p=>p[0]),lngs=pts.map(p=>p[1]);
  const bboxCtr=[(Math.min(...lats)+Math.max(...lats))/2,(Math.min(...lngs)+Math.max(...lngs))/2];
  let area=0,cx=0,cy=0;
  for(let i=0;i<pts.length;i++){
    const [y1,x1]=pts[i], [y2,x2]=pts[(i+1)%pts.length];
    const f=x1*y2-x2*y1;
    area+=f; cx+=(x1+x2)*f; cy+=(y1+y2)*f;
  }
  const centroid=Math.abs(area)>1e-12?[cy/(3*area),cx/(3*area)]:bboxCtr;
  if(pointInsidePolyStrict(centroid,pts))return centroid;
  if(pointInsidePolyStrict(bboxCtr,pts))return bboxCtr;
  let best=pts[0],bestD=Infinity;
  const minLat=Math.min(...lats),maxLat=Math.max(...lats),minLng=Math.min(...lngs),maxLng=Math.max(...lngs);
  for(let i=1;i<=7;i++){
    for(let j=1;j<=7;j++){
      const p=[minLat+(maxLat-minLat)*i/8,minLng+(maxLng-minLng)*j/8];
      if(!pointInsidePolyStrict(p,pts))continue;
      const d=(p[0]-centroid[0])**2+(p[1]-centroid[1])**2;
      if(d<bestD){best=p;bestD=d;}
    }
  }
  return best;
}
function validMapPoint(pt){
  const p=routePointPair(pt);
  return p&&Number.isFinite(p[0])&&Number.isFinite(p[1])?p:null;
}
function hasCustomStartPoint(z){
  return !!(z&&validMapPoint(z.startPoint));
}
function zoneEntryCorner(z){
  const pts=(z&&Array.isArray(z.polygon))?z.polygon:[];
  for(const pt of pts){
    const p=validMapPoint(pt);
    if(p)return p;
  }
  return null;
}
function zoneStartPoint(z,mode){
  if(!z)return [38.20138,128.59350];
  const custom=validMapPoint(z.startPoint);
  if(custom)return custom;
  if(isInProgress(z.id)){
    const saved=z.progress&&Array.isArray(z.progress.pts)?z.progress.pts:[];
    const resumePt=saved.length&&validMapPoint(saved[saved.length-1]);
    if(resumePt)return resumePt;
  }
  const route=serviceGuideRoutesFor(z.id,mode||S.routeMode)[0];
  const routePt=route&&route.pts&&validMapPoint(route.pts[0]);
  const corner=zoneEntryCorner(z);
  return routePt||corner||zoneCenter(z);
}
function zoneStartName(z){
  return isInProgress(z.id)?'이어하기':'첫집';
}
function kakaoStartUrlForZone(z){
  const pt=zoneStartPoint(z);
  return `https://map.kakao.com/link/to/${encodeURIComponent(zoneStartName(z))},${pt[0]},${pt[1]}`;
}
function kakaoPointUrlForZone(z){
  const pt=zoneStartPoint(z);
  return `https://map.kakao.com/link/map/${pt[0]},${pt[1]}`;
}
function kakaoStartAppUrlForZone(z){
  const pt=zoneStartPoint(z);
  return `kakaomap://route?ep=${pt[0]},${pt[1]}&by=FOOT`;
}
function openZoneKakaoStart(zoneId){
  const z=S.zones.find(z=>String(z.id)===String(zoneId));
  if(!z){toast('구역을 먼저 선택하세요.');return;}
  const fallback=kakaoStartUrlForZone(z);
  openExternalApp(kakaoStartAppUrlForZone(z),fallback,'카카오맵');
}
function startPinIcon(label='출발지'){
  return L.divIcon({
    html:`<div class="zone-start-pin"><span>📍</span>${esc(label)}</div>`,
    className:'',
    iconAnchor:[18,34]
  });
}
function addStartPinMarker(map,z,layers=[],opts={}){
  if(!map||!z||!hasCustomStartPoint(z))return null;
  const mk=L.marker(zoneStartPoint(z),{
    icon:startPinIcon(opts.label||'출발지'),
    zIndexOffset:opts.zIndexOffset||850,
    draggable:!!opts.draggable
  }).addTo(map);
  if(opts.draggable){
    mk.on('dragend',()=>{
      const ll=mk.getLatLng();
      saveZoneStartPin(z.id,ll.lat,ll.lng,{silent:true});
      toast('시작핀 위치를 수정했습니다.');
    });
  }
  layers.push(mk);
  return mk;
}
function saveZoneStartPin(zoneId,lat,lng,opts={}){
  const z=S.zones.find(z=>String(z.id)===String(zoneId));
  if(!z)return;
  z.startPoint=[Number(lat),Number(lng)];
  persistZones();
  drawAllZones(S.panelZone||null);
  if(homeMapInst)drawHomeZones(S.homeSelectedZone||null);
  if(S.curZone&&String(S.curZone)===String(zoneId)){
    drawRdZone(z);
    drawRoute();
    drawSavedRteLines();
    renderRteLines();
  }
  renderSideList(document.getElementById('zone-search')?.value||'');
  renderRouteGrid(document.getElementById('rte-search')?.value||'');
  if(S.role==='admin')renderAdmin();
  if(!opts.silent)toast('시작핀이 저장되었습니다.');
}
function clearZoneStartPin(zoneId){
  const z=S.zones.find(z=>String(z.id)===String(zoneId));
  if(!z||!hasCustomStartPoint(z)){toast('저장된 시작핀이 없습니다.');return;}
  if(!confirm('이 구역의 시작핀을 삭제할까요?'))return;
  delete z.startPoint;
  persistZones();
  drawAllZones(S.panelZone||null);
  if(homeMapInst)drawHomeZones(S.homeSelectedZone||null);
  if(S.curZone&&String(S.curZone)===String(zoneId)){drawRdZone(z);drawRoute();drawSavedRteLines();}
  renderSideList(document.getElementById('zone-search')?.value||'');
  renderRouteGrid(document.getElementById('rte-search')?.value||'');
  if(S.role==='admin')renderAdmin();
  toast('시작핀을 삭제했습니다.');
}
function toggleStartPinEdit(){
  if(S.role!=='admin'){toast('관리자만 시작핀을 설정할 수 있습니다.');return;}
  if(!S.curZone){toast('구역을 먼저 선택하세요.');return;}
  S.startPinEdit=!S.startPinEdit;
  updateStartPinEditButton();
  toast(S.startPinEdit?'지도에서 첫 집 위치를 찍으세요.':'시작핀 설정을 취소했습니다.');
}
function updateStartPinEditButton(){
  const btn=document.getElementById('rd-start-pin-btn');
  if(btn){
    btn.classList.toggle('on',!!S.startPinEdit);
    btn.textContent=S.startPinEdit?'📍 찍는 중':'📍 시작핀 설정';
  }
}
function getVolColor(name){const i=S.volunteers.indexOf(name);return S.volColors[i%S.volColors.length]||'#378ADD';}
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('on');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('on'),2600);}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function jsq(s){return String(s??'').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\r?\n/g,' ');}
function activeZoneId(){
  return S.panelZone||S.homeSelectedZone||S.curZone||null;
}
function markSelectedCards(id=activeZoneId()){
  document.querySelectorAll('.side-zone-item.selected,.home-zone-row.selected,.zc.selected,.admin-zone-row.selected').forEach(el=>el.classList.remove('selected'));
  if(!id)return;
  ['side-zone-item-','home-zone-item-','rte-zone-item-','admin-zone-item-'].forEach(prefix=>{
    const el=document.getElementById(prefix+id);
    if(el)el.classList.add('selected');
  });
}
function syncRoleUi(){
  const isAdmin=S.role==='admin';
  const isLeader=S.role==='leader';
  const canUseExternal=S.role==='admin'||S.role==='leader';
  const app=document.getElementById('scr-app');
  if(app)app.classList.toggle('no-side-tabs',false);
  if(app)app.classList.toggle('admin-floating-tabs',isAdmin);
  if(app)app.classList.toggle('bottom-tabs',S.role==='leader'||S.role==='volunteer');
  document.querySelectorAll('.admin-service-action').forEach(el=>el.classList.toggle('hide',isAdmin));
  document.querySelectorAll('.admin-pin-action').forEach(el=>el.classList.toggle('hide',!isAdmin));
  document.querySelectorAll('.leader-zone-action').forEach(el=>el.classList.toggle('hide',!isLeader));
  document.querySelectorAll('.route-home-action').forEach(el=>el.classList.toggle('hide',isAdmin));
  document.querySelectorAll('.monitor-home-action').forEach(el=>el.classList.toggle('hide',isAdmin));
  const exit=document.getElementById('t-exit');
  if(exit)exit.classList.toggle('hide',!S.role);
  const adminTools=document.getElementById('admin-zone-tools');
  if(adminTools)adminTools.classList.toggle('hide',!isAdmin);
  const monitorTitle=document.getElementById('monitor-title');
  if(monitorTitle)monitorTitle.textContent=isLeader?'👁 봉사자 관리':'👁 실시간 현황';
  ['t-phone','t-kakao'].forEach(id=>{
    const el=document.getElementById(id);
    if(el)el.classList.toggle('hide',!canUseExternal);
  });
}
function onlyDigits(v,len){return new RegExp(`^\\d{${len}}$`).test(String(v||''));}
function getAdminPin(){return localStorage.getItem('sokcho_admin_pin')||'123456';}
function setAdminPin(pin){localStorage.setItem('sokcho_admin_pin',pin);}
function getAdminRecoveryEmail(){return localStorage.getItem('sokcho_admin_recovery_email')||'';}
function setAdminRecoveryEmail(email){localStorage.setItem('sokcho_admin_recovery_email',email.trim().toLowerCase());}
function getLeaderPin(){return localStorage.getItem('sokcho_leader_pin')||'0000';}
function setLeaderPin(pin){localStorage.setItem('sokcho_leader_pin',pin);}
function getLeaderLock(){
  try{return JSON.parse(localStorage.getItem('sokcho_active_leader')||'null');}catch(e){return null;}
}
function setLeaderLock(name){
  localStorage.setItem('sokcho_active_leader',JSON.stringify({name,ts:Date.now()}));
}
function clearLeaderLock(name){
  const lock=getLeaderLock();
  if(!lock)return;
  if(!name||lock.name===name)localStorage.removeItem('sokcho_active_leader');
}
function isLeaderLockedFor(name){
  const lock=getLeaderLock();
  if(!lock||!lock.name)return false;
  if(Date.now()-(lock.ts||0)>8*60*60*1000){clearLeaderLock();return false;}
  return lock.name!==name;
}
function loadLeaders(){
  if(S._leadersLoaded)return;
  try{
    const saved=JSON.parse(localStorage.getItem('sokcho_leaders')||'[]');
    if(Array.isArray(saved)&&saved.length)S.leaders=saved;
  }catch(e){}
  S.leaders=S.leaders.map(({name,color})=>({name,color:color||'#D85A30'}));
  S._leadersLoaded=true;
}
function persistLeaders(){
  localStorage.setItem('sokcho_leaders',JSON.stringify(S.leaders.map(({name,color})=>({name,color}))));
}
function loadVolunteers(){
  if(S._volunteersLoaded)return;
  try{
    const saved=JSON.parse(localStorage.getItem('sokcho_volunteers')||'[]');
    if(Array.isArray(saved)&&saved.length)S.volunteers=saved;
  }catch(e){}
  S._volunteersLoaded=true;
}
function persistVolunteers(){localStorage.setItem('sokcho_volunteers',JSON.stringify(S.volunteers));}
function loadContacts(){
  if(S._contactsLoaded)return;
  try{
    const saved=JSON.parse(localStorage.getItem('sokcho_contacts')||'{}');
    if(saved&&typeof saved==='object')S.contacts={...S.contacts,...saved};
  }catch(e){}
  S._contactsLoaded=true;
}
function persistContacts(){localStorage.setItem('sokcho_contacts',JSON.stringify(S.contacts));}
function cleanupBuiltInSamples(){
  const sampleZoneNames=new Set(['아바이마을 1구역','아바이마을 2구역']);
  const sampleRouteIds=new Set(['abai-z1-2-sample','abai-z1-4-sample','abai-z2-2-sample','abai-z2-4-sample']);
  const sampleRouteNames=new Set(['아바이 1구역 2인1조 예시','아바이 1구역 4인2조 예시','아바이 2구역 2인1조 예시','아바이 2구역 4인2조 예시']);
  const sampleZoneIds=new Set(S.zones.filter(z=>sampleZoneNames.has(z.name)).map(z=>z.id));
  const zoneBefore=S.zones.length;
  const routeBefore=S.rteLines.length;
  S.rteLines=S.rteLines.filter(l=>{
    const name=String(l.name||'');
    return !sampleRouteIds.has(l.id)&&!sampleRouteNames.has(name)&&!name.includes('예시')&&!sampleZoneIds.has(l.zoneId);
  });
  if(localStorage.getItem('sokcho_builtin_samples_removed')!=='1'){
    S.zones=S.zones.filter(z=>!sampleZoneNames.has(z.name));
  }
  if(S.zones.length!==zoneBefore)persistZones();
  if(S.rteLines.length!==routeBefore)persistRteLines();
  localStorage.setItem('sokcho_builtin_samples_removed','1');
}

function loadCoreData(){
  try{
    const zones=JSON.parse(localStorage.getItem('sokcho_zones')||'[]');
    S.zones=Array.isArray(zones)?zones:[];
  }catch(e){S.zones=[];}
  if(Array.isArray(window.SOKCHO_ZONES_SEED)&&window.SOKCHO_ZONES_SEED.length){
    const zoneKey=z=>{
      const src=z&&z.source;
      if(src&&src.system==='icevening'&&src.originalId)return 'ice:'+String(src.originalId);
      return String(z&&z.name||'')+'|'+String(z&&z.type||'')+'|'+String((z&&z.polygon&&z.polygon[0]&&z.polygon[0][0])||'');
    };
    const existingKeys=new Set(S.zones.map(zoneKey));
    const seedZones=window.SOKCHO_ZONES_SEED
      .filter(z=>!existingKeys.has(zoneKey(z)))
      .map(z=>({...z,polygon:Array.isArray(z.polygon)?z.polygon:[],streets:Array.isArray(z.streets)?z.streets:[]}));
    if(seedZones.length){
      S.zones=S.zones.concat(seedZones);
      try{
        localStorage.setItem('sokcho_zones',JSON.stringify(S.zones));
        localStorage.setItem('sokcho_builtin_samples_removed','1');
      }catch(e){}
    }
  }
  try{
    const records=JSON.parse(localStorage.getItem('sokcho_records')||'[]');
    S.records=Array.isArray(records)?records:[];
  }catch(e){S.records=[];}
  try{
    const progress=JSON.parse(localStorage.getItem('sokcho_progress')||'{}');
    S.zones.forEach(z=>{
      if(progress&&progress[z.id])z.progress=progress[z.id];
    });
  }catch(e){}
  let changed=false;
  S.zones.forEach((z,i)=>{
    if(!z.color){z.color=zoneAutoColor(i);changed=true;}
  });
  if(changed)persistZones();
  S.nextId=Math.max(0,...S.zones.map(z=>Number(z.id)||0));
}
function persistZones(){localStorage.setItem('sokcho_zones',JSON.stringify(S.zones));}
function persistRecords(){localStorage.setItem('sokcho_records',JSON.stringify(S.records));}
function persistAllData(){persistZones();persistRecords();persistRteLines();persistLeaders();persistVolunteers();persistContacts();}
function refreshAllViews(){
  drawAllZones(null);renderSideList();renderRouteGrid();renderRecords();
  renderHomeZoneList(document.getElementById('home-zone-search')?.value||'');
  if(S.role==='admin')renderAdmin();
  if(homeMapInst)drawHomeZones(null);
}
function zoneAutoColor(index){
  const palette=[
    '#1267C6','#D97706','#7C3AED','#0F766E','#BE123C','#4D7C0F',
    '#C2410C','#0369A1','#A21CAF','#15803D','#B45309','#4338CA'
  ];
  return palette[Math.abs(index)%palette.length];
}
function zoneStrokeColor(z){
  if(!z.color)z.color=zoneAutoColor(S.zones.findIndex(x=>x===z));
  return z.color;
}
function zoneFillColor(z){
  const c=zoneStrokeColor(z);
  return c+'16';
}
function zoneMapLabel(z){
  return String(z?.name||'')
    .replace(/^\s*\d{1,3}-\d{1,3}(?:-\d+)?\s+/, '')
    .trim() || String(z?.name||'');
}
function zoneLabelsVisible(map){
  const z=map&&typeof map.getZoom==='function'?map.getZoom():MAP_MIN_ZOOM;
  return z>=17&&z<=19;
}
function resetAdminPinByEmail(){
  const entered=(document.getElementById('admin-reset-email')?.value||'').trim().toLowerCase();
  const saved=getAdminRecoveryEmail();
  if(!saved){toast('관리자 화면에서 복구용 Gmail을 먼저 등록하세요.');return;}
  if(!entered||entered!==saved){toast('등록된 Gmail 주소와 일치하지 않습니다.');return;}
  setAdminPin('123456');
  const pin=document.getElementById('l-admin-pin');if(pin)pin.value='123456';
  toast('관리자 PIN이 123456으로 초기화되었습니다.');
}

// 직접 그린 봉사 경로 저장/복원
function loadRteLines(){
  try{
    const raw=JSON.parse(localStorage.getItem('sokcho_routes')||'[]');
    S.rteLines=Array.isArray(raw)?raw.filter(l=>l&&l.zoneId&&Array.isArray(l.pts)&&l.pts.length>=2).map(l=>({
      id:l.id||Date.now()+Math.random(),
      zoneId:l.zoneId,
      mode:l.mode||'2',
      name:l.name||'저장 경로',
      color:l.color||'#378ADD',
      pts:l.pts,
      visible:l.visible!==false,
      createdAt:l.createdAt||new Date().toISOString(),
    })):[];
  }catch(e){S.rteLines=[];}
}
function persistRteLines(){
  const data=S.rteLines.map(({id,zoneId,mode,name,color,pts,visible,createdAt})=>({id,zoneId,mode,name,color,pts,visible,createdAt}));
  localStorage.setItem('sokcho_routes',JSON.stringify(data));
}
function currentRteLines(){
  return S.rteLines.filter(l=>l.zoneId===S.curZone&&(l.mode||'2')===S.routeMode);
}
function routeScreenLines(){
  const lines=currentRteLines().filter(l=>l.visible!==false);
  if(S.role==='admin'||S.routeMode!=='4'||!S.routeDirection)return lines;
  const picked=lines.filter((route,index)=>routeTeamNo(route,index)===S.routeDirection);
  return picked.length?picked:lines.slice(0,1);
}
function sortedVisibleRoutes(zoneId,mode){
  return S.rteLines
    .filter(l=>l.zoneId===zoneId&&(l.mode||'2')===(mode||S.routeMode)&&l.visible!==false)
    .sort((a,b)=>String(a.createdAt||a.id).localeCompare(String(b.createdAt||b.id)));
}
function routeTeamNo(route,index){
  const match=String(route.name||'').match(/([12])\s*조/);
  return match?match[1]:String(index+1);
}
function serviceRoutesFor(zoneId,mode){
  const routeMode=mode||S.routeMode;
  const routes=sortedVisibleRoutes(zoneId,routeMode);
  if(routeMode==='4'){
    const dir=(S.session&&S.session.routeDirection)||S.routeDirection;
    if(dir){
      const matched=routes.filter((route,index)=>routeTeamNo(route,index)===dir);
      return matched.length?[matched[0]]:[];
    }
    return routes.slice(0,1);
  }
  return routes.slice(0,1);
}
function generatedGuideRoutesFor(zoneId,mode){
  const z=S.zones.find(z=>z.id===zoneId);
  const pts=normalizeRoutePts(z&&z.polygon);
  if(!z||pts.length<2)return [];
  const routeMode=mode||S.routeMode;
  if(routeMode==='4'){
    const h=Math.ceil(pts.length/2);
    const team1Pts=pts.slice(0,h+1);
    const team2Pts=[pts[0],...pts.slice(h).reverse()];
    const dir=(S.session&&S.session.routeDirection)||S.routeDirection;
    const routes=[
      {id:`auto-${zoneId}-team1`,zoneId,mode:'4',name:'1조 자동 경로',color:'#378ADD',pts:team1Pts,visible:true},
      {id:`auto-${zoneId}-team2`,zoneId,mode:'4',name:'2조 자동 경로',color:'#3B6D11',pts:team2Pts,visible:true},
    ];
    return dir?routes.filter((_,idx)=>String(idx+1)===dir):routes;
  }
  return [{id:`auto-${zoneId}-team`,zoneId,mode:'2',name:'자동 경로',color:'#378ADD',pts:[...pts,pts[0]],visible:true}];
}
function serviceGuideRoutesFor(zoneId,mode){
  const saved=serviceRoutesFor(zoneId,mode);
  return saved.length?saved:generatedGuideRoutesFor(zoneId,mode);
}
function clearRteDisplayLayers(){
  S.rdRteLayers.forEach(l=>S.rdMap&&S.rdMap.removeLayer(l));
  S.rdRteLayers=[];
}
function routeVizScale(map){
  const w=map&&map.getContainer?map.getContainer().clientWidth:720;
  const z=map&&typeof map.getZoom==='function'?map.getZoom():18;
  const widthScale=Math.max(.58,Math.min(1,w/720));
  const zoomScale=Math.pow(1.18,z-18);
  return Math.max(.48,Math.min(1.45,widthScale*zoomScale));
}
function routeChoiceIcon(dir,color,map){
  const on=S.routeDirection===dir?' on':'';
  const s=routeVizScale(map);
  const w=Math.round(88*s),h=Math.round(30*s);
  return L.divIcon({
    html:`<div class="route-choice-label${on}" style="color:${on?'#fff':color};font-size:${Math.round(12*s)}px;padding:${Math.round(6*s)}px ${Math.round(9*s)}px;">${dir}조 선택</div>`,
    className:'',
    iconSize:[w,h],
    iconAnchor:[Math.round(w/2),Math.round(h/2)]
  });
}
function routeChoiceLabelPoint(map,pts){
  if(!map||!pts||!pts.length)return pts&&pts[0];
  return pts.reduce((best,pt)=>{
    const bp=map.latLngToContainerPoint(best);
    const cp=map.latLngToContainerPoint(pt);
    return cp.y<bp.y?pt:best;
  },pts[0]);
}
function selectRouteDirectionFromMap(dir){
  if(!(S.role!=='admin'&&S.routeMode==='4'))return;
  setRouteDirection(dir);
}
function routeArrowAngle(map,a,b){
  if(map&&map.latLngToContainerPoint){
    const p1=map.latLngToContainerPoint(a);
    const p2=map.latLngToContainerPoint(b);
    return Math.atan2(p2.y-p1.y,p2.x-p1.x)*180/Math.PI;
  }
  const dy=b[0]-a[0],dx=b[1]-a[1];
  return Math.atan2(dy,dx)*180/Math.PI;
}
function routeArrowAngleFromPoints(p1,p2){
  return Math.atan2(p2.y-p1.y,p2.x-p1.x)*180/Math.PI;
}
function routePointPair(pt){
  if(Array.isArray(pt))return [Number(pt[0]),Number(pt[1])];
  if(pt&&typeof pt.lat==='number'&&typeof pt.lng==='number')return [pt.lat,pt.lng];
  return null;
}
function normalizeRoutePts(pts){
  return (Array.isArray(pts)?pts:[])
    .map(routePointPair)
    .filter(pt=>pt&&Number.isFinite(pt[0])&&Number.isFinite(pt[1]));
}
function routeArrowPoints(map,pts){
  const arrows=[];
  if(!Array.isArray(pts)||pts.length<2)return arrows;
  if(map&&map.latLngToLayerPoint&&map.layerPointToLatLng){
    const px=pts.map(pt=>map.latLngToLayerPoint(pt));
    const segs=[];
    let total=0;
    for(let i=0;i<px.length-1;i++){
      const a=px[i],b=px[i+1];
      const len=a.distanceTo?a.distanceTo(b):Math.hypot(b.x-a.x,b.y-a.y);
      if(len<18)continue;
      segs.push({a,b,len,total,srcA:pts[i],srcB:pts[i+1]});
      total+=len;
    }
    if(total>0){
      const count=Math.min(8,Math.max(1,Math.floor(total/150)));
      for(let i=1;i<=count;i++){
        const target=total*(i/(count+1));
        const seg=segs.find(s=>target>=s.total&&target<=s.total+s.len)||segs[segs.length-1];
        if(!seg)continue;
        const t=Math.max(0,Math.min(1,(target-seg.total)/seg.len));
        const mid=L.point(seg.a.x+(seg.b.x-seg.a.x)*t,seg.a.y+(seg.b.y-seg.a.y)*t);
        arrows.push({
          a:seg.srcA,
          b:seg.srcB,
          mid:map.layerPointToLatLng(mid),
          angle:routeArrowAngleFromPoints(seg.a,seg.b)
        });
      }
      return arrows;
    }
  }
  const maxArrows=Math.min(8,Math.max(1,pts.length-1));
  const step=Math.max(1,Math.floor((pts.length-1)/maxArrows));
  for(let i=0;i<pts.length-1&&arrows.length<maxArrows;i+=step){
    const a=pts[i],b=pts[i+1];
    if(map&&map.latLngToContainerPoint){
      const p1=map.latLngToContainerPoint(a);
      const p2=map.latLngToContainerPoint(b);
      if(p1.distanceTo&&p1.distanceTo(p2)<28)continue;
    }
    arrows.push({a,b,mid:[(a[0]+b[0])/2,(a[1]+b[1])/2]});
  }
  return arrows;
}
function addRouteArrowMarkers(map,pts,color,zIndexOffset=710,onClick=null){
  const layers=[];
  const cleanPts=normalizeRoutePts(pts);
  if(!map||cleanPts.length<2)return layers;
  const s=routeVizScale(map);
  routeArrowPoints(map,cleanPts).forEach(({a,b,mid,angle:fixedAngle})=>{
    const size=Math.max(24,Math.round(30*s));
    const angle=Number.isFinite(fixedAngle)?fixedAngle:routeArrowAngle(map,a,b);
    const icon=L.divIcon({
      html:`<div class="route-arrow-label" style="color:${color};transform:rotate(${angle}deg);"></div>`,
      className:'',
      iconSize:[size,size],
      iconAnchor:[Math.round(size/2),Math.round(size/2)]
    });
    const arrow=L.marker(mid,{icon,zIndexOffset,interactive:!!onClick}).addTo(map);
    if(onClick)arrow.on('click',onClick);
    layers.push(arrow);
  });
  return layers;
}
function drawRouteLineSet(map,routes,zIndexOffset=700,selectable=false){
  const layers=[];
  const s=routeVizScale(map);
  const pointH=Math.round(22*s);
  const pointMinW=Math.round(22*s);
  const pointRadius=Math.round(12*s);
  const pointFont=Math.max(8,Math.round(10*s));
  const pointPad=Math.max(3,Math.round(5*s));
  const lineWeight=selectable?(S.routeDirection?Math.max(4,Math.round(6*s)):Math.max(3,Math.round(5*s))):Math.max(3,Math.round(4*s));
  const selectedWeight=Math.max(lineWeight+1,Math.round(7*s));
  const hitWeight=Math.max(18,Math.round(24*s));
  routes.forEach((l,index)=>{
    const pts=normalizeRoutePts(l.pts);
    if(pts.length<2)return;
    const team=routeTeamNo(l,index)==='2'?'2':'1';
    const isSelected=selectable&&S.routeDirection===team;
    const line=L.polyline(pts,{color:l.color,weight:selectable?(isSelected?selectedWeight:lineWeight):lineWeight,opacity:selectable?(isSelected?1:.92):.9,interactive:!!selectable}).addTo(map);
    if(selectable){
      line.on('click',()=>selectRouteDirectionFromMap(team));
      const hit=L.polyline(pts,{color:l.color,weight:hitWeight,opacity:.001,interactive:true}).addTo(map);
      hit.on('click',()=>selectRouteDirectionFromMap(team));
      layers.push(hit);
    }
    layers.push(line);
    layers.push(...addRouteArrowMarkers(map,pts,l.color,zIndexOffset+10,selectable?()=>selectRouteDirectionFromMap(team):null));
    pts.forEach((pt,ptIdx)=>{
      const label=ptIdx===0?'시작':ptIdx===pts.length-1?'끝':String(ptIdx+1);
      const bg=ptIdx===pts.length-1?'#D85A30':l.color;
      const icon=L.divIcon({
        html:`<div style="min-width:${pointMinW}px;height:${pointH}px;border-radius:${pointRadius}px;background:${bg};color:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-size:${pointFont}px;font-weight:800;padding:0 ${pointPad}px;white-space:nowrap;">${label}</div>`,
        className:'',
        iconSize:[pointMinW,pointH],
        iconAnchor:[Math.round(pointMinW/2),Math.round(pointH/2)]
      });
      const marker=L.marker(pt,{icon,zIndexOffset,interactive:!!selectable}).addTo(map);
      if(selectable)marker.on('click',()=>selectRouteDirectionFromMap(team));
      layers.push(marker);
    });
    if(selectable&&pts.length){
      const labelPt=routeChoiceLabelPoint(map,pts);
      const labelMarker=L.marker(labelPt,{icon:routeChoiceIcon(team,l.color,map),zIndexOffset:zIndexOffset+20}).addTo(map);
      labelMarker.on('click',()=>selectRouteDirectionFromMap(team));
      layers.push(labelMarker);
    }
  });
  return layers;
}
function drawSavedRteLines(){
  if(!S.rdMap)return;
  clearRteDisplayLayers();
  S.rdRteLayers=drawRouteLineSet(S.rdMap,routeScreenLines(),600,S.role!=='admin'&&S.routeMode==='4'&&!S.routeDirection);
}
function addSavedRoutesToMap(map,zoneId,mode){
  return drawRouteLineSet(map,sortedVisibleRoutes(zoneId,mode),700);
}
function addServiceRoutesToMap(map,zoneId,mode){
  return drawRouteLineSet(map,serviceGuideRoutesFor(zoneId,mode),800);
}
// 카카오 지도 인스턴스 저장
const _kakaoInstances = {};
const MAP_MIN_ZOOM=11;
const MAP_MAX_ZOOM=19;

function stableMapOptions(opts){
  return Object.assign({
    zoomAnimation:false,
    fadeAnimation:false,
    markerZoomAnimation:false,
    dragging:true,
    tap:true,
    inertia:false,
    touchZoom:false,
    doubleClickZoom:false,
    scrollWheelZoom:false,
    boxZoom:false,
    minZoom:MAP_MIN_ZOOM,
    maxZoom:MAP_MAX_ZOOM,
    worldCopyJump:false
  },opts||{});
}

function clampMapZoom(map,z){
  const min=typeof map?.getMinZoom==='function'?map.getMinZoom():MAP_MIN_ZOOM;
  const max=typeof map?.getMaxZoom==='function'?map.getMaxZoom():MAP_MAX_ZOOM;
  return Math.max(min,Math.min(max,z));
}

function zoomMapBy(map,d){
  if(!map)return;
  keepMapDraggable(map);
  map.invalidateSize();
  map.setZoom(clampMapZoom(map,map.getZoom()+d),{animate:false});
}

function keepMapDraggable(map){
  if(!map)return;
  const el=map.getContainer?.();
  if(el)el.style.pointerEvents='auto';
  if(map.dragging)map.dragging.enable();
  if(map.tap)map.tap.enable();
  if(map.touchZoom)map.touchZoom.disable();
  if(map.doubleClickZoom)map.doubleClickZoom.disable();
  if(map.scrollWheelZoom)map.scrollWheelZoom.disable();
  if(map.boxZoom)map.boxZoom.disable();
}

function centerRouteMapOnZone(z,zoom=18){
  if(!S.rdMap||!z)return;
  keepMapDraggable(S.rdMap);
  const center=zoneStartPoint(z,S.routeMode);
  S.rdMap.setView(center,clampMapZoom(S.rdMap,Math.max(S.rdMap.getZoom()||zoom,zoom)),{animate:false});
}

function extendBoundsWithPoint(bounds,pt){
  if(!pt||!Number.isFinite(Number(pt[0]))||!Number.isFinite(Number(pt[1])))return bounds;
  return bounds?bounds.extend(pt):L.latLngBounds([pt]);
}

function boundsForZoneSet(zones){
  let bounds=null;
  (zones||[]).forEach(z=>{
    (z.polygon||[]).forEach(pt=>{bounds=extendBoundsWithPoint(bounds,pt);});
    if(z.startPoint)bounds=extendBoundsWithPoint(bounds,z.startPoint);
    if(z.progress?.pts?.length)bounds=extendBoundsWithPoint(bounds,z.progress.pts[z.progress.pts.length-1]);
  });
  return bounds&&bounds.isValid()?bounds:null;
}

function fitMapBounds(map,bounds,opts={}){
  if(!map||!bounds||!bounds.isValid())return;
  keepMapDraggable(map);
  map.invalidateSize();
  map.fitBounds(bounds,{
    padding:opts.padding||[42,42],
    maxZoom:opts.maxZoom||16,
    animate:false
  });
}

function addFallbackTiles(map){
  if(map._fallbackTiles)return;
  map._fallbackTiles=true;
  map.getContainer().classList.add('kakao-layer','kakao-ready');
}

function whenKakaoReady(onReady,onFail,tries=0){
  if(window.kakao&&kakao.maps&&kakao.maps.Map){
    if(typeof kakao.maps.load==='function'){
      kakao.maps.load(onReady);
    }else{
      onReady();
    }
    return;
  }
  if(tries>80){
    onFail&&onFail();
    return;
  }
  setTimeout(()=>whenKakaoReady(onReady,onFail,tries+1),100);
}

function addBaseTiles(map){
  map.whenReady(function(){
    const containerId = map.getContainer().id;
    const kakaoBgId = containerId + '-kakao-bg';
    const kakaoBgEl = document.getElementById(kakaoBgId);
    if(!kakaoBgEl){addFallbackTiles(map);return;}
    if(_kakaoInstances[containerId])return;

    whenKakaoReady(()=>{
      const c = map.getCenter();
      const z = map.getZoom();
      const kakaoLevel = Math.max(1, Math.min(14, 20 - z));

      const kakaoInst = new kakao.maps.Map(kakaoBgEl, {
        center: new kakao.maps.LatLng(c.lat, c.lng),
        level: kakaoLevel,
        draggable: false,
        scrollwheel: false,
        disableDoubleClickZoom: true
      });

      _kakaoInstances[containerId] = kakaoInst;
      map.getContainer().classList.add('kakao-layer');

      let kakaoSyncPending=false;
      const markKakaoReady=()=>{
        if(kakaoBgEl.children.length>0){
          map.getContainer().classList.add('kakao-ready');
        }
      };
      const syncKakao=()=>{
        if(kakaoSyncPending)return;
        kakaoSyncPending=true;
        requestAnimationFrame(()=>{
          kakaoSyncPending=false;
        const c2 = map.getCenter();
        const z2 = map.getZoom();
        kakaoInst.relayout();
        kakaoInst.setCenter(new kakao.maps.LatLng(c2.lat, c2.lng));
        kakaoInst.setLevel(Math.max(1, Math.min(14, 20 - z2)));
        markKakaoReady();
        });
      };

      syncKakao();
      map.on('move zoom resize', syncKakao);
      [120,300,650,1200].forEach(ms=>setTimeout(syncKakao,ms));
      setTimeout(()=>map.getContainer().classList.add('kakao-ready'),1600);
    },()=>{
      map.getContainer().classList.add('kakao-layer','kakao-ready');
      console.warn('Kakao map SDK is not ready. OSM fallback is disabled.');
    });
  });
}
function stabilizeZoneLabelsOnMove(map){
  if(!map||map._zoneLabelStabilized)return;
  map._zoneLabelStabilized=true;
  const el=map.getContainer();
  let showTimer=null;
  const hide=()=>el.classList.add('zone-moving');
  const show=()=>{
    clearTimeout(showTimer);
    showTimer=setTimeout(()=>el.classList.remove('zone-moving'),120);
  };
  const hideNow=()=>{
    clearTimeout(showTimer);
    hide();
  };
  map.on('movestart move dragstart drag zoomstart',hideNow);
  map.on('moveend dragend zoomend',show);
  ['pointerdown','touchstart','mousedown'].forEach(ev=>el.addEventListener(ev,hideNow,{passive:true}));
  ['pointerup','pointercancel','touchend','touchcancel','mouseup','mouseleave'].forEach(ev=>el.addEventListener(ev,show,{passive:true}));
  ['pointerup','touchend','mouseup'].forEach(ev=>document.addEventListener(ev,show,{passive:true}));
}

// ================================================================
// 로그인
// ================================================================
let currentRole=null;

let currentLeaderMode='guide';

function selectLeaderMode(mode){
  currentLeaderMode=mode;
  const bothBtn=document.getElementById('leader-mode-both');
  const guideBtn=document.getElementById('leader-mode-guide');
  const desc=document.getElementById('leader-mode-desc');
  if(bothBtn) bothBtn.style.opacity=mode==='both'?'1':'0.45';
  if(guideBtn) guideBtn.style.opacity=mode==='guide'?'1':'0.45';
  if(desc) desc.textContent=mode==='both'
    ?'본인도 봉사자 현황에 포함됩니다.'
    :'인도 역할만 합니다. 봉사자 현황에 포함되지 않습니다.';
}

function selectRole(role){
  currentRole=role;
  // 버튼 활성화
  ['vol','leader','admin'].forEach(r=>{
    const btn=document.getElementById('role-btn-'+r);
    if(btn) btn.style.opacity=r===role.replace('volunteer','vol')?'1':'0.45';
  });
  const rkey=role==='volunteer'?'vol':role;
  document.getElementById('role-btn-'+rkey).style.opacity='1';
  // 패널 표시
  ['volunteer','leader','admin'].forEach(r=>{
    const p=document.getElementById('panel-'+r);
    if(p) p.style.display=r===role?'block':'none';
  });
  fillSelForRole(role);
}

function fillSelForRole(role){
  loadVolunteers();loadContacts();
  loadLeaders();
  if(role==='volunteer'){
    const sel=document.getElementById('l-vol-name');
    sel.innerHTML='<option value="">-- 이름을 선택하세요 --</option>'+S.volunteers.map(v=>`<option value="${v}">${v}</option>`).join('');
  } else if(role==='leader'){
    const sel=document.getElementById('l-leader-name');
    sel.innerHTML='<option value="">-- 이름을 선택하세요 --</option>'+S.leaders.map(l=>`<option value="${l.name}">${l.name}</option>`).join('');
  }
}

function fillSel(){
  fillSelForRole('volunteer');
  fillSelForRole('leader');
}

function saveAutoLogin(){
  if(!S.role||!S.user)return;
  localStorage.setItem('sokcho_auto_login',JSON.stringify({
    role:S.role,
    user:S.user,
    leaderMode:S.leaderMode||'guide',
    savedAt:Date.now()
  }));
}

function readAutoLogin(){
  try{
    const saved=JSON.parse(localStorage.getItem('sokcho_auto_login')||'null');
    return saved&&saved.role&&saved.user?saved:null;
  }catch(e){return null;}
}

function clearAutoLogin(){
  localStorage.removeItem('sokcho_auto_login');
}

function isAutoLoginValid(saved){
  if(!saved)return false;
  loadVolunteers();loadLeaders();
  if(saved.role==='admin')return saved.user==='관리자';
  if(saved.role==='leader')return S.leaders.some(l=>l.name===saved.user);
  if(saved.role==='volunteer')return S.volunteers.includes(saved.user);
  return false;
}

function finishLogin(opts={}){
  if(S.role==='leader')setLeaderLock(S.user);
  if(!opts.auto)saveAutoLogin();
  document.getElementById('scr-login').classList.remove('active');
  document.getElementById('scr-app').classList.add('active');
  // 역할별 탭/기능 설정
  if(S.role==='admin'){
    clearLeaderLock();
    document.getElementById('t-map').classList.remove('hide');
    document.getElementById('t-admin').classList.remove('hide');
    document.getElementById('t-monitor').classList.remove('hide');
    document.getElementById('t-record').classList.remove('hide');
    document.getElementById('t-route').classList.remove('hide'); // 관리자만
    document.getElementById('t-exit').classList.remove('hide');
    document.getElementById('draw-toggle-btn').style.display='flex';
    document.getElementById('side-draw-panel').style.display='block';
    const sd=document.getElementById('seg-draw-btn');if(sd)sd.style.display='none';
  } else if(S.role==='leader'){
    document.getElementById('t-map').classList.add('hide');
    document.getElementById('t-home').classList.toggle('hide',S.leaderMode!=='both');
    document.getElementById('t-route').classList.remove('hide');
    document.getElementById('t-monitor').classList.remove('hide');
    document.getElementById('t-record').classList.add('hide');
    // 함께봉사 모드면 위치공유 시작 (봉사자 현황에 포함)
    if(S.leaderMode==='both'){
      setTimeout(()=>startLocShare(),500);
    }
  } else {
    // 봉사자: 홈 탭만 표시
    document.getElementById('t-home').classList.remove('hide');
    document.getElementById('t-map').classList.add('hide');
    // 봉사자: 경로 탭 없음 - 홈/구역지도에서 바로 진입
  }
  syncRoleUi();
  const routeLabel=document.getElementById('t-route-label');
  if(routeLabel)routeLabel.textContent='목록';
  const monLabel=document.getElementById('t-monitor-label');
  if(monLabel)monLabel.textContent=S.role==='leader'?'관리':'실시간';
  document.getElementById('rte-user').textContent=S.user;
  initApp();
  requestLoginGps();
  if(S.role==='leader'&&S.leaderMode==='guide'){
    setTimeout(()=>goTab('monitor'),300);
  } else if(S.role==='volunteer'||S.role==='leader'){
    setTimeout(()=>goTab('home'),300);
  }
  if(opts.auto)toast(`${S.user}님 자동 로그인되었습니다.`);
}

function doLogin(){
  if(!currentRole){toast('역할을 선택하세요.');return;}
  if(currentRole==='admin'){
    const pin=document.getElementById('l-admin-pin').value.trim();
    if(!onlyDigits(pin,6)){toast('관리자 비밀번호 6자리를 입력하세요.');return;}
    if(pin!==getAdminPin()){toast('관리자 PIN이 맞지 않습니다. 변경한 PIN 또는 Gmail 초기화를 사용하세요.');return;}
    S.user='관리자';S.role='admin';
  } else if(currentRole==='leader'){
    const nm=document.getElementById('l-leader-name').value;
    if(!nm){toast('인도자 이름을 선택하세요.');return;}
    loadLeaders();
    const leader=S.leaders.find(l=>l.name===nm);
    if(!leader){toast('등록된 인도자가 아닙니다.');return;}
    const pin=document.getElementById('l-leader-pin').value.trim();
    if(!onlyDigits(pin,4)){toast('인도자 비밀번호 4자리를 입력하세요.');return;}
    if(pin!==getLeaderPin()){toast('인도자 대표 PIN이 맞지 않습니다.');return;}
    if(!currentLeaderMode){toast('함께 봉사 또는 인도만 하기를 선택하세요.');return;}
    if(isLeaderLockedFor(nm)){toast('다른 인도자가 인도중입니다.');return;}
    S.user=nm;S.role='leader';S.leaderMode=currentLeaderMode;
    setLeaderLock(nm);
  } else {
    const nm=document.getElementById('l-vol-name').value;
    if(!nm){toast('이름을 선택하세요.');return;}
    if(!S.volunteers.includes(nm)){toast('등록된 봉사자가 아닙니다.');return;}
    S.user=nm;S.role='volunteer';
  }
  finishLogin();
}

function requestLoginGps(){
  if(S.role==='admin')return;
  if(!navigator.geolocation){toast('이 기기는 GPS를 지원하지 않습니다.');return;}
  toast('📍 GPS 위치를 준비하는 중입니다.');
  navigator.geolocation.getCurrentPosition(pos=>{
    const loc={
      lat:pos.coords.latitude,
      lng:pos.coords.longitude,
      acc:Math.round(pos.coords.accuracy||0),
      ts:Date.now()
    };
    localStorage.setItem('sokcho_last_login_gps',JSON.stringify(loc));
    toast(`📍 GPS 연결됨${loc.acc?` · 정확도 ${loc.acc}m`:''}`);
    if(S.role==='volunteer'||(S.role==='leader'&&S.leaderMode==='both'))startLocShare();
  },err=>{
    const denied=err&&err.code===1;
    toast(denied?'위치 권한을 허용해야 GPS를 사용할 수 있습니다.':'GPS 위치를 아직 확인하지 못했습니다.');
  },{enableHighAccuracy:true,maximumAge:3000,timeout:12000});
}

function doLogout(){
  const logoutRole=S.role, logoutUser=S.user;
  clearAutoLogin();
  // 진행 중 세션 미완료 처리
  if(S.session.active){endSession(false);}
  stopLocShare();
  if(logoutRole==='leader')clearLeaderLock(logoutUser);
  if(S.monInterval){clearInterval(S.monInterval);S.monInterval=null;}
  if(S.monSimTimer){clearInterval(S.monSimTimer);S.monSimTimer=null;S.monSimOn=false;clearMonitorSimData();}
  // 탭 숨기기
  ['t-admin','t-monitor','t-home','t-record','t-route','t-phone','t-kakao','t-exit'].forEach(id=>document.getElementById(id).classList.add('hide'));
  document.getElementById('share-fab').style.display='none';
  document.getElementById('draw-toggle-btn').style.display='none';
  document.getElementById('side-draw-panel').style.display='none';
  // 화면 전환
  document.getElementById('scr-app').classList.remove('active');
  document.getElementById('scr-app').classList.remove('admin-floating-tabs');
  document.getElementById('scr-app').classList.remove('bottom-tabs');
  const monLabel=document.getElementById('t-monitor-label');
  if(monLabel)monLabel.textContent='실시간';
  document.getElementById('scr-login').classList.add('active');
  // 패널 초기화
  ['volunteer','leader','admin'].forEach(r=>{const p=document.getElementById('panel-'+r);if(p)p.style.display='none';});
  ['role-btn-vol','role-btn-leader','role-btn-admin'].forEach(id=>{const b=document.getElementById(id);if(b)b.style.opacity='0.45';});
  ['l-admin-pin','l-leader-pin'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  // 첫 탭으로 이동
  goTab('map');
  S.user=null;S.role=null;currentRole=null;
  fillSel();
  toast('로그아웃되었습니다.');
}

function tryAutoLogin(){
  loadVolunteers();loadLeaders();loadContacts();
  fillSel();
  selectLeaderMode(currentLeaderMode);
  const saved=readAutoLogin();
  if(!isAutoLoginValid(saved))return;
  S.user=saved.user;
  S.role=saved.role;
  S.leaderMode=saved.role==='leader'?(saved.leaderMode||'guide'):null;
  if(S.role==='leader'&&isLeaderLockedFor(S.user)){clearAutoLogin();toast('다른 인도자가 인도중입니다.');return;}
  currentRole=saved.role;
  currentLeaderMode=S.leaderMode||currentLeaderMode;
  finishLogin({auto:true});
}

// ================================================================
// 탭 전환
// ================================================================
function goTab(name){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('on'));
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('on'));
  document.getElementById('p-'+name).classList.add('on');
  document.getElementById('t-'+name).classList.add('on');
  if(name==='record') renderRecords();
  if(name==='admin') renderAdmin();
  if(name==='route'){showRouteList();renderRouteGrid();}
  if(name==='monitor') initMonitor();
  if(name==='home') renderHome();
  if(name==='map'&&S.mainMap) setTimeout(()=>{S.mainMap.invalidateSize();},300);
  if(name==='route'&&S.rdMap) refreshMapAfterLayout(S.rdMap);
  if(name==='home'&&homeMapInst) refreshMapAfterLayout(homeMapInst);
  if(name==='monitor'&&S.monMap) refreshMapAfterLayout(S.monMap);
}

function refreshMapAfterLayout(map, after){
  const run=()=>{
    if(!map)return;
    map.invalidateSize();
    if(after)after();
    keepMapDraggable(map);
  };
  if(window.requestAnimationFrame){
    requestAnimationFrame(()=>requestAnimationFrame(run));
  }
  [80,220,520,900].forEach(ms=>setTimeout(run,ms));
}

function showRouteList(){
  const rd=document.getElementById('rd-view');
  const zl=document.getElementById('zl-view');
  if(rd)rd.style.display='none';
  if(zl)zl.style.display='';
  if(S.rdMap)clearRdLayers();
}

function goAdminZoneDraw(){
  if(S.role!=='admin')return;
  goTab('map');
  setTimeout(()=>{
    if(S.mainMap)S.mainMap.invalidateSize();
    if(!S.drawMode)startDraw();
  },350);
}

// ================================================================
// 초기화
// ================================================================
function initApp(){
  loadCoreData();
  loadRteLines();
  cleanupBuiltInSamples();
  loadLeaders();loadVolunteers();loadContacts();
  if(S.mainMap){S.mainMap.remove();S.mainMap=null;S.mainLayers=[];}
  if(S.rdMap){S.rdMap.remove();S.rdMap=null;S.rdLayers=[];S.rdRteLayers=[];}
  // 메인 지도
  S.mainMap=L.map('main-map',stableMapOptions({center:[38.20138,128.59350],zoom:18,zoomControl:false,attributionControl:true}));
  addBaseTiles(S.mainMap);
  stabilizeZoneLabelsOnMove(S.mainMap);
  S.mainMap.on('click',onMapClick);
  S.mainMap.on('zoomend',()=>drawAllZones(S.panelZone||null));
  // 지도 크기 강제 갱신 (탭 전환 후 타일 로딩 보장)
  setTimeout(()=>{S.mainMap.invalidateSize();drawAllZones(null);renderSideList();},300);
  // 경로 지도
  S.rdMap=L.map('rd-map',stableMapOptions({center:[38.20138,128.59350],zoom:18,zoomControl:false,attributionControl:false}));
  keepMapDraggable(S.rdMap);
  addBaseTiles(S.rdMap);
  stabilizeZoneLabelsOnMove(S.rdMap);
  S.rdMap.on('click',onRdMapClick);
  S.rdMap.on('zoomend',()=>{drawRoute();drawSavedRteLines();});
  renderRouteGrid();
  renderRecords();
  if(S.role==='admin') renderAdmin();
}

// ================================================================
// 구역 폴리곤
// ================================================================
function drawAllZones(activeId){
  S.mainLayers.forEach(l=>S.mainMap.removeLayer(l));
  S.mainLayers=[];
  const showLabels=zoneLabelsVisible(S.mainMap);
  S.zones.forEach(z=>{
    const show=S.mapFilter==='all'||(S.mapFilter==='residential'&&z.type==='residential')||(S.mapFilter==='commercial'&&z.type==='commercial')||(S.mapFilter==='undone'&&isInProgress(z.id))||(S.mapFilter==='standby'&&getZoneState(z.id)==='standby');
    if(!show)return;
    const done=isDone(z.id);
    const inProg=isInProgress(z.id);
    const meta=getZoneStatusMeta(z.id);
    const isRes=z.type==='residential';
    const isActive=activeId===z.id;
    const dimmed=activeId!==null&&!isActive;
    const sc=zoneStrokeColor(z);
    const fillC=zoneFillColor(z);
    const poly=L.polygon(z.polygon,{color:sc,weight:isActive?5:3.5,fillColor:fillC,fillOpacity:dimmed?.01:.05,opacity:dimmed?.35:1,className:'zone-boundary-line'}).addTo(S.mainMap);
    poly.on('click',()=>openSheet(z.id));
    S.mainLayers.push(poly);
    if(isActive)addStartPinMarker(S.mainMap,z,S.mainLayers,{label:'시작점'});
    if(!showLabels)return;
    const ctr=zoneCenter(z);
    const op=dimmed?.3:1;
    const labelColor='#111827';
    const labelPrefix=done?'✅ ':inProg?'⏸ ':meta.state==='standby'?'○ ':'';
    const mk=L.marker(ctr,{icon:L.divIcon({html:`<div class="zone-map-label" onclick="openSheet(${z.id})" style="opacity:${op};border:${isActive?'2px':'1.5px'} solid ${sc};color:${labelColor};">${labelPrefix}${zoneMapLabel(z)}</div>`,className:'zone-label-anchor',iconAnchor:[0,0],iconSize:[1,1]})}).addTo(S.mainMap);
    mk.on('click',()=>openSheet(z.id));
    S.mainLayers.push(mk);
  });
}

// ================================================================
// 구역 시트
// ================================================================
function openSheet(id){
  const z=S.zones.find(z=>z.id===id);
  if(!z)return;
  S.panelZone=id;
  S.homeSelectedZone=id;
  drawAllZones(id);
  markSelectedCards(id);
  S.mainMap.fitBounds(L.latLngBounds(z.polygon),{padding:[40,40]});
  const done=isDone(id);
  const isRes=z.type==='residential';
  const cnt=S.records.filter(r=>r.zoneId===id).length;
  const inProg=isInProgress(id);
  const meta=getZoneStatusMeta(id);
  const bh=`<span class="badge ${isRes?'badge-res':'badge-com'}">${isRes?'주택구역':'상가구역'}</span><span class="badge" style="background:${done?'var(--okbg)':inProg?'#FCEAEA':'#EAF4FF'};color:${meta.color};">${done?'✅ 완료':inProg?'⏸ 미완료':'○ 봉사대기'}</span>`;
  const ih=`거리: ${z.streets.join(' · ')}<br>총 봉사: <strong>${cnt}회</strong>`;
  // 봉사자/인도자는 구역 클릭 시 바로 경로로 진입
  if(S.role==='volunteer'||S.role==='leader'){
    if(isDone(id)){
      toast('완료된 구역입니다. 관리자가 초기화한 뒤 다시 봉사할 수 있습니다.');
      return;
    }
    closeSheet();closeSideDetail();
    goTab('route');
    setTimeout(()=>openRd(id),250);
    return;
  }
  if(window.innerWidth<768){
    document.getElementById('sh-name').textContent=z.name;
    document.getElementById('sh-badges').innerHTML=bh;
    document.getElementById('sh-info').innerHTML=ih;
    const sh=document.getElementById('zsheet');
    sh.style.display='block';
    setTimeout(()=>sh.classList.add('open'),10);
  } else {
    document.getElementById('side-zone-list').style.display='none';
    document.getElementById('side-zone-detail').style.display='block';
    document.getElementById('side-detail-name').textContent=z.name;
    document.getElementById('side-detail-badges').innerHTML=bh;
    document.getElementById('side-detail-info').innerHTML=ih;
  }
  syncRoleUi();
}
function closeSheet(){const s=document.getElementById('zsheet');s.classList.remove('open');setTimeout(()=>s.style.display='none',280);drawAllZones(null);S.panelZone=null;markSelectedCards(S.homeSelectedZone||S.curZone);}
function closeSideDetail(){document.getElementById('side-zone-list').style.display='block';document.getElementById('side-zone-detail').style.display='none';S.panelZone=null;drawAllZones(null);markSelectedCards(S.homeSelectedZone||S.curZone);}
function gotoRoute(){if(!S.panelZone)return;const id=S.panelZone;closeSheet();closeSideDetail();goTab('route');setTimeout(()=>openRd(id),250);}
function startFromSheet(){gotoRoute();}

function renderSideList(keyword){
  let zones=S.zones;
  if(S.mapFilter==='residential')zones=zones.filter(z=>z.type==='residential');
  else if(S.mapFilter==='commercial')zones=zones.filter(z=>z.type==='commercial');
  else if(S.mapFilter==='undone')zones=zones.filter(z=>isInProgress(z.id));
  else if(S.mapFilter==='standby')zones=zones.filter(z=>getZoneState(z.id)==='standby');
  // 키워드 필터
  if(keyword&&keyword.trim()){
    const kw=keyword.trim().toLowerCase();
    zones=zones.filter(z=>
      z.name.toLowerCase().includes(kw)||
      String(z.id).includes(kw)||
      z.streets.some(s=>s.toLowerCase().includes(kw))
    );
  }
  const wrap=document.getElementById('side-zone-list');
  if(!wrap)return;
  if(zones.length===0){
    wrap.innerHTML='<p style="font-size:12px;color:var(--txm);padding:12px 0;text-align:center;">검색 결과가 없습니다.</p>';
    return;
  }
  wrap.innerHTML=zones.map(z=>{
    const done=isDone(z.id);
    const meta=getZoneStatusMeta(z.id);
    const isRes=z.type==='residential';
    const cnt=S.records.filter(r=>r.zoneId===z.id).length;
    const selected=String(activeZoneId())===String(z.id);
    return `<div id="side-zone-item-${z.id}" class="side-zone-item ${isRes?'res':'com'} ${selected?'selected':''}" onclick="openSheet(${z.id})">
      <div>
        <div style="font-size:13px;font-weight:600;"><span style="color:var(--txm);font-size:11px;">#${z.id} </span>${z.name}</div>
        <div style="font-size:11px;color:var(--txm);">${z.streets.join(', ').slice(0,30)} · ${cnt}회</div>
      </div>
      <div style="width:9px;height:9px;border-radius:50%;background:${meta.color};flex-shrink:0;margin-left:8px;"></div>
    </div>`;
  }).join('');
}

// PC 사이드 검색
function searchZones(kw){
  const clearBtn=document.getElementById('search-clear-btn');
  if(clearBtn)clearBtn.style.display=kw?'block':'none';
  renderSideList(kw);
}
function clearSearch(){
  const inp=document.getElementById('zone-search');
  if(inp){inp.value='';inp.focus();}
  const clearBtn=document.getElementById('search-clear-btn');
  if(clearBtn)clearBtn.style.display='none';
  renderSideList('');
}

// 모바일 검색
function toggleMobileSearch(){
  const wrap=document.getElementById('mobile-search-wrap');
  const isOpen=wrap.style.display!=='none';
  if(isOpen){closeMobileSearch();}
  else{
    wrap.style.display='block';
    setTimeout(()=>document.getElementById('mobile-zone-search').focus(),100);
  }
}
function closeMobileSearch(){
  document.getElementById('mobile-search-wrap').style.display='none';
  const inp=document.getElementById('mobile-zone-search');
  if(inp)inp.value='';
  const res=document.getElementById('mobile-search-results');
  if(res)res.innerHTML='';
}
function searchZonesMobile(kw){
  const res=document.getElementById('mobile-search-results');
  if(!kw.trim()){res.innerHTML='';return;}
  const kwl=kw.trim().toLowerCase();
  const found=S.zones.filter(z=>
    z.name.toLowerCase().includes(kwl)||
    String(z.id).includes(kwl)||
    z.streets.some(s=>s.toLowerCase().includes(kwl))
  );
  if(found.length===0){
    res.innerHTML='<div style="padding:14px;font-size:13px;color:var(--txm);text-align:center;">검색 결과가 없습니다.</div>';
    return;
  }
  res.innerHTML=found.map(z=>{
    const done=isDone(z.id);
    const isRes=z.type==='residential';
    return `<div onclick="selectSearchResult(${z.id})" style="padding:11px 14px;border-bottom:1px solid var(--bd);cursor:pointer;display:flex;align-items:center;justify-content:space-between;">
      <div>
        <div style="font-size:13px;font-weight:600;"><span style="color:var(--txm);font-size:11px;">#${z.id} </span>${z.name}</div>
        <div style="font-size:11px;color:var(--txm);margin-top:2px;">${isRes?'주택구역':'상가구역'} · ${z.streets.join(', ').slice(0,25)}</div>
      </div>
      <div style="width:9px;height:9px;border-radius:50%;background:${done?'#3B6D11':'#d1d5db'};flex-shrink:0;margin-left:8px;"></div>
    </div>`;
  }).join('');
}
function selectSearchResult(id){
  closeMobileSearch();
  openSheet(id);
}

// ================================================================
// 지도 컨트롤
// ================================================================
function zoomMap(d){zoomMapBy(S.mainMap,d);}
function zoomRouteMap(d){zoomMapBy(S.rdMap,d);}
function zoomHomeMap(d){zoomMapBy(homeMapInst,d);}
function zoomSvcMap(d){zoomMapBy(svcMapInst,d);}
function locationIcon(){
  return L.divIcon({
    html:'<div style="width:17px;height:17px;border-radius:50%;background:#EC4899;border:3px solid #fff;box-shadow:0 0 0 4px rgba(236,72,153,.25);"></div>',
    className:'',
    iconAnchor:[8,8]
  });
}
function locateOnMap(map,opts={}){
  if(!map||!navigator.geolocation){toast('위치를 사용할 수 없습니다.');return;}
  navigator.geolocation.getCurrentPosition(pos=>{
    const ll=[pos.coords.latitude,pos.coords.longitude];
    const acc=Math.max(8,Math.round(pos.coords.accuracy||20));
    map.setView(ll,opts.zoom||18);
    if(opts.markerKey&&S[opts.markerKey]){
      try{map.removeLayer(S[opts.markerKey]);}catch(e){}
      S[opts.markerKey]=null;
    }
    if(opts.circleKey&&S[opts.circleKey]){
      try{map.removeLayer(S[opts.circleKey]);}catch(e){}
      S[opts.circleKey]=null;
    }
    const marker=L.marker(ll,{icon:locationIcon(),zIndexOffset:1200}).addTo(map);
    if(opts.markerKey)S[opts.markerKey]=marker;
    if(opts.circleKey){
      S[opts.circleKey]=L.circle(ll,{radius:acc,color:'#EC4899',weight:1.5,fillColor:'#EC4899',fillOpacity:.08}).addTo(map);
    }
    toast('현재 위치로 이동했습니다.');
  },()=>toast('위치 권한을 허용해주세요.'),{enableHighAccuracy:true,maximumAge:3000,timeout:10000});
}
function centerMap(){locateOnMap(S.mainMap,{markerKey:'mainGpsMk',circleKey:'mainGpsCircle',zoom:18});}
function filterMap(type,el){document.querySelectorAll('.chip').forEach(c=>c.classList.remove('on'));el.classList.add('on');S.mapFilter=type;drawAllZones(null);const kw=document.getElementById('zone-search');renderSideList(kw?kw.value:'');}

// ================================================================
// 구역 그리기
// ================================================================
function toggleDraw(){S.drawMode?cancelDraw():startDraw();}
function startDraw(){
  S.drawMode=true;S.drawPts=[];
  document.getElementById('draw-bar').classList.add('on');
  document.getElementById('draw-ind').classList.add('on');
  document.getElementById('draw-toggle-btn').style.background='#D85A30';
  document.getElementById('draw-toggle-btn').style.color='#fff';
  document.getElementById('side-draw-hint').style.display='block';
  document.getElementById('side-draw-start-btn').textContent='🛑 찍기 중지';
  closeSheet();toast('지도를 클릭해 꼭짓점을 찍으세요');
}
function cancelDraw(){
  S.drawMode=false;S.drawPts=[];clearDrawTmp();
  document.getElementById('draw-bar').classList.remove('on');
  document.getElementById('draw-ind').classList.remove('on');
  document.getElementById('draw-toggle-btn').style.background='var(--pbg)';
  document.getElementById('draw-toggle-btn').style.color='var(--p)';
  document.getElementById('side-draw-hint').style.display='none';
  document.getElementById('side-draw-start-btn').textContent='🖊 꼭짓점 찍기 시작';
  ['draw-name','draw-name2','draw-streets','draw-streets2'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  updatePtCnt(0);
}
function toggleSideDraw(){S.drawMode?cancelDraw():startDraw();}
function clearDrawTmp(){
  S.drawMk.forEach(m=>S.mainMap.removeLayer(m));S.drawMk=[];
  if(S.drawLine){S.mainMap.removeLayer(S.drawLine);S.drawLine=null;}
  if(S.drawPoly){S.mainMap.removeLayer(S.drawPoly);S.drawPoly=null;}
}
function onMapClick(e){
  if(!S.drawMode)return;
  S.drawPts.push([e.latlng.lat,e.latlng.lng]);
  updateDrawViz();
}
function updatePtCnt(n){
  ['pt-cnt','pt-cnt2','pt-cnt2b'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=n;});
  ['save-btn','save-btn2'].forEach(id=>{const el=document.getElementById(id);if(el)el.disabled=n<3;});
}
function updateDrawViz(){
  clearDrawTmp();
  const pts=S.drawPts,n=pts.length;
  updatePtCnt(n);
  pts.forEach((p,i)=>{
    const icon=L.divIcon({html:`<div style="width:22px;height:22px;border-radius:50%;background:#D85A30;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3);">${i+1}</div>`,className:'',iconAnchor:[11,11]});
    S.drawMk.push(L.marker(p,{icon}).addTo(S.mainMap));
  });
  if(n>=3)S.drawPoly=L.polygon(pts,{color:'#D85A30',weight:2,fillColor:'#D85A30',fillOpacity:.12}).addTo(S.mainMap);
  else if(n>=2)S.drawLine=L.polyline(pts,{color:'#D85A30',weight:2}).addTo(S.mainMap);
}
function undoPt(){if(!S.drawPts.length)return;S.drawPts.pop();updateDrawViz();}
function clearDraw(){S.drawPts=[];updateDrawViz();}
function pointOnSegment(p,a,b){
  const cross=(p[1]-a[1])*(b[0]-a[0])-(p[0]-a[0])*(b[1]-a[1]);
  if(Math.abs(cross)>1e-10)return false;
  const dot=(p[0]-a[0])*(b[0]-a[0])+(p[1]-a[1])*(b[1]-a[1]);
  if(dot<-1e-10)return false;
  const lenSq=(b[0]-a[0])**2+(b[1]-a[1])**2;
  return dot-lenSq<=1e-10;
}
function pointInsidePolyStrict(p,poly){
  if(poly.some((a,i)=>pointOnSegment(p,a,poly[(i+1)%poly.length])))return false;
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const xi=poly[i][1],yi=poly[i][0],xj=poly[j][1],yj=poly[j][0];
    const intersect=((yi>p[0])!==(yj>p[0]))&&(p[1]<(xj-xi)*(p[0]-yi)/(yj-yi)+xi);
    if(intersect)inside=!inside;
  }
  return inside;
}
function orient(a,b,c){
  return (b[1]-a[1])*(c[0]-a[0])-(b[0]-a[0])*(c[1]-a[1]);
}
function segmentsProperlyCross(a,b,c,d){
  if(pointOnSegment(a,c,d)||pointOnSegment(b,c,d)||pointOnSegment(c,a,b)||pointOnSegment(d,a,b))return false;
  const o1=orient(a,b,c),o2=orient(a,b,d),o3=orient(c,d,a),o4=orient(c,d,b);
  return (o1>1e-10&&o2<-1e-10||o1<-1e-10&&o2>1e-10)&&(o3>1e-10&&o4<-1e-10||o3<-1e-10&&o4>1e-10);
}
function polygonsOverlapArea(polyA,polyB){
  if(polyA.some(p=>pointInsidePolyStrict(p,polyB)))return true;
  if(polyB.some(p=>pointInsidePolyStrict(p,polyA)))return true;
  for(let i=0;i<polyA.length;i++){
    const a1=polyA[i],a2=polyA[(i+1)%polyA.length];
    for(let j=0;j<polyB.length;j++){
      if(segmentsProperlyCross(a1,a2,polyB[j],polyB[(j+1)%polyB.length]))return true;
    }
  }
  return false;
}
function findOverlappingZone(poly){
  return S.zones.find(z=>z.polygon&&z.polygon.length>=3&&polygonsOverlapArea(poly,z.polygon));
}
function saveZone(){
  const name=document.getElementById('draw-name').value.trim();
  const type=document.getElementById('draw-type').value;
  const sr=document.getElementById('draw-streets').value.trim();
  if(!name){toast('구역 이름을 입력하세요.');return;}
  if(S.drawPts.length<3){toast('꼭짓점 3개 이상 필요합니다.');return;}
  _doSaveZone(name,type,sr);
}
function saveZone2(){
  const name=document.getElementById('draw-name2').value.trim();
  const type=document.getElementById('draw-type2').value;
  const sr=document.getElementById('draw-streets2').value.trim();
  if(!name){toast('구역 이름을 입력하세요.');return;}
  if(S.drawPts.length<3){toast('꼭짓점 3개 이상 필요합니다.');return;}
  _doSaveZone(name,type,sr);
}
function _doSaveZone(name,type,sr){
  const overlap=findOverlappingZone(S.drawPts);
  if(overlap){
    drawAllZones(overlap.id);
    toast(`"${overlap.name}" 구역과 겹칩니다. 경계가 겹치지 않게 다시 그려주세요.`);
    return;
  }
  const streets=sr?sr.split(',').map(s=>s.trim()).filter(Boolean):['거리 미지정'];
  S.nextId++;
  S.zones.push({id:S.nextId,name,type,polygon:[...S.drawPts],streets,color:zoneAutoColor(S.zones.length)});
  persistZones();
  toast(`✅ "${name}" 구역 저장 완료!`);
  cancelDraw();drawAllZones(null);renderSideList();renderRouteGrid();if(S.role==='admin')renderAdmin();
}

// ================================================================
// 경로 탭
// ================================================================
let routeListFilter='all';
function setRouteListFilter(filter,el){
  routeListFilter=filter;
  document.querySelectorAll('[id^="rte-filter-"]').forEach(b=>b.classList.remove('on'));
  if(el)el.classList.add('on');
  renderRouteGrid(document.getElementById('rte-search')?.value||'');
}
function renderRouteGrid(keyword){
  let zones=[...S.zones];
  if(routeListFilter==='done')zones=zones.filter(z=>isDone(z.id));
  if(routeListFilter==='undone')zones=zones.filter(z=>isInProgress(z.id));
  if(routeListFilter==='standby')zones=zones.filter(z=>getZoneState(z.id)==='standby');
  if(keyword&&keyword.trim()){
    const kw=keyword.trim().toLowerCase();
    zones=zones.filter(z=>
      z.name.toLowerCase().includes(kw)||
      String(z.id).includes(kw)||
      z.streets.some(s=>s.toLowerCase().includes(kw))
    );
  }
  zones.sort((a,b)=>(Number(a.id)||0)-(Number(b.id)||0)||a.name.localeCompare(b.name,'ko',{numeric:true}));
  const grid=document.getElementById('rte-grid');
  if(!grid)return;
  if(zones.length===0){grid.innerHTML='<p style="font-size:12px;color:var(--txm);padding:20px 0;text-align:center;grid-column:1/-1;">검색 결과가 없습니다.</p>';return;}
  grid.innerHTML=zones.map(z=>{
    const done=isDone(z.id);const inProg=isInProgress(z.id);const meta=getZoneStatusMeta(z.id);const isRes=z.type==='residential';const cnt=S.records.filter(r=>r.zoneId===z.id).length;
    const routeCnt=S.rteLines.filter(l=>l.zoneId===z.id).length;
    const statusClass=meta.cls;
    const statusText=meta.text;
    const statusIcon=meta.icon;
    const click=S.role==='admin'||!done?`openRd(${z.id})`:`toast('완료된 구역입니다. 관리자가 초기화한 뒤 다시 봉사할 수 있습니다.')`;
    const selected=String(activeZoneId())===String(z.id);
    return `<div id="rte-zone-item-${z.id}" class="zc ${isRes?'res':'com'} ${selected?'selected':''}" onclick="${click}">
      <div class="zc-dot" style="background:${done?'#3B6D11':inProg?'#D85A30':'#d1d5db'};"></div>
      <div class="zc-badge"><span class="badge ${isRes?'badge-res':'badge-com'}">${isRes?'주택':'상가'}</span></div>
      <div class="zc-name"><span style="color:var(--txm);font-size:10px;">#${z.id} </span>${z.name}</div>
      <div class="zc-meta">${z.streets.length}개 거리 · ${cnt}회${routeCnt?` · 경로 ${routeCnt}개`:''}</div>
      <div class="zc-status-row">
        <span class="zc-status ${statusClass}">${statusIcon} ${statusText}</span>
      </div>
      ${S.role==='admin'?`<div class="zc-admin-row"><button class="zc-edit-id" onclick="event.stopPropagation();editZoneNumber(${z.id})">번호 수정</button></div>`:''}
    </div>`;
  }).join('');
}
function searchRteZones(kw){
  const clr=document.getElementById('rte-search-clear');
  if(clr)clr.style.display=kw?'block':'none';
  renderRouteGrid(kw);
}
function clearRteSearch(){
  const inp=document.getElementById('rte-search');if(inp){inp.value='';inp.focus();}
  const clr=document.getElementById('rte-search-clear');if(clr)clr.style.display='none';
  renderRouteGrid('');
}
let zoneNumberEditId=null;
function editZoneNumber(oldId){
  if(S.role!=='admin')return;
  const z=S.zones.find(z=>z.id===oldId);
  if(!z)return;
  zoneNumberEditId=oldId;
  const nameEl=document.getElementById('zone-number-name');
  const input=document.getElementById('zone-number-input');
  if(nameEl)nameEl.textContent=`${z.name}의 카드 번호를 수정합니다.`;
  if(input){
    input.value=String(oldId);
    input.onkeydown=e=>{if(e.key==='Enter')applyZoneNumberEdit();};
  }
  document.getElementById('zone-number-modal')?.classList.add('on');
  setTimeout(()=>{input?.focus();input?.select();},80);
}
function closeZoneNumberModal(){
  zoneNumberEditId=null;
  document.getElementById('zone-number-modal')?.classList.remove('on');
}
function applyZoneNumberEdit(){
  const oldId=zoneNumberEditId;
  const input=document.getElementById('zone-number-input');
  const raw=input?input.value:'';
  const newId=Number(raw.trim());
  if(!Number.isInteger(newId)||newId<=0){toast('번호는 1 이상의 숫자로 입력해주세요.');return;}
  if(newId===oldId){closeZoneNumberModal();return;}
  if(S.zones.some(zone=>zone.id===newId)){toast('이미 사용 중인 번호입니다.');return;}
  const z=S.zones.find(z=>z.id===oldId);
  if(!z){closeZoneNumberModal();return;}
  z.id=newId;
  S.records.forEach(r=>{if(r.zoneId===oldId)r.zoneId=newId;});
  S.rteLines.forEach(r=>{if(r.zoneId===oldId)r.zoneId=newId;});
  if(S.curZone===oldId)S.curZone=newId;
  if(S.panelZone===oldId)S.panelZone=newId;
  S.nextId=Math.max(S.nextId,...S.zones.map(zone=>zone.id));
  persistZones();persistRecords();persistRteLines();
  renderRouteGrid();
  renderSideList();
  drawAllZones(null);
  closeZoneNumberModal();
  toast('카드 번호를 수정했습니다.');
}
function openRd(id){
  S.curZone=id;
  S.startPinEdit=false;
  updateStartPinEditButton();
  S.homeSelectedZone=id;
  markSelectedCards(id);
  const z=S.zones.find(z=>z.id===id);
  if(!z)return;
  exitRteEditMode();
  document.getElementById('rd-title').textContent=z.name;
  updateRouteStartButton(id);
  document.getElementById('zl-view').style.display='none';
  document.getElementById('rd-view').style.display='flex';
  const activeSession=S.session.active&&String(S.session.zoneId)===String(id);
  const preferredMode=(activeSession&&S.session.routeMode)||z.progress?.routeMode||'2';
  const preferredDirection=(activeSession&&S.session.routeDirection)||z.progress?.direction||null;
  S.routeDirection=preferredMode==='4'?preferredDirection:null;
  const modeBtns=document.querySelectorAll('.seg-b');
  const modeBtn=preferredMode==='4'?modeBtns[1]:preferredMode==='draw'?modeBtns[2]:modeBtns[0];
  setMode(preferredMode,modeBtn);
  keepMapDraggable(S.rdMap);
  refreshMapAfterLayout(S.rdMap,()=>{
    drawRdZone(z);
    drawRoute();
    restoreProgressLine(id);
    centerRouteMapOnZone(z,18);
  });
}
function updateRouteStartButton(zoneId){
  const btn=document.querySelector('.route-start-fixed');
  if(!btn)return;
  const done=isDone(zoneId);
  const inProg=isInProgress(zoneId);
  btn.disabled=done;
  btn.textContent=done?'완료됨 - 관리자 초기화 필요':inProg?'미완료 시작하기 →':'이 구역 봉사 시작 →';
  btn.classList.toggle('disabled',done);
  btn.classList.toggle('resume',!done&&inProg);
}
function backList(){
  document.getElementById('rd-view').style.display='none';
  clearRdLayers();
  // 봉사자는 홈으로, 관리자는 구역 목록으로. 인도자가 구역 목록에서 들어온 경우 목록으로 복귀.
  if(S.role==='volunteer'||(S.role==='leader'&&!S.leaderRouteListOpen)){
    goTab('home');
    renderHome();
  } else {
    document.getElementById('zl-view').style.display='';
  }
}
function setMode(m,el){
  S.routeMode=m;
  document.querySelectorAll('.seg-b').forEach(b=>b.classList.remove('on'));
  if(el)el.classList.add('on');
  stopRteDraw();stopGPS();clearRteCurrent();
  document.getElementById('rd-auto-info').style.display='block';
  document.getElementById('rd-draw-panel').style.display='block';
  const drawBar=document.getElementById('rte-draw-bar');
  if(drawBar)drawBar.style.display=S.role==='admin'?'block':'none';
  const clearAll=document.getElementById('rte-clear-all-btn');
  if(clearAll)clearAll.style.display=S.role==='admin'?'inline-flex':'none';
  const ttl=document.getElementById('rte-draw-title');if(ttl)ttl.textContent='🖊 그리기 대기';
  if(m!=='4')S.routeDirection=null;
  const z=S.zones.find(z=>z.id===S.curZone);if(z)drawRdZone(z);
  drawRoute();drawSavedRteLines();renderRteLines();
  updateRouteDirectionPanel();
  if(m==='4'&&S.role!=='admin'&&!S.routeDirection)openRouteDirectionPrompt();
}

function setRouteDirection(dir){
  S.routeDirection=dir;
  ['dir-team1','dir-team2'].forEach(id=>document.getElementById(id)?.classList.remove('on'));
  document.getElementById(dir==='1'?'dir-team1':'dir-team2')?.classList.add('on');
  const panel=document.getElementById('rd-side-panel');
  if(panel){
    panel.classList.remove('show-dir');
    updateMobileRouteTools();
  }
  if(S.rdMap){
    drawRoute();
    drawSavedRteLines();
  }
  toast(`${dir}조 방향을 선택했습니다.`);
}

function openRouteDirectionPrompt(){
  const panel=document.getElementById('rd-side-panel');
  updateRouteDirectionPanel();
  if(panel){
    panel.classList.add('show-dir');
    panel.classList.remove('show-draw','show-routes');
  }
  updateMobileRouteTools();
}

function updateMobileRouteTools(){
  const panel=document.getElementById('rd-side-panel');
  const mapBox=document.getElementById('rd-map-box');
  const drawBtn=document.getElementById('rd-draw-toggle-btn');
  const routesBtn=document.getElementById('rd-route-toggle-btn');
  const dirBtn=document.getElementById('rd-dir-toggle-btn');
  if(!panel)return;
  drawBtn?.classList.toggle('on',panel.classList.contains('show-draw'));
  drawBtn?.classList.toggle('hide',S.role!=='admin');
  routesBtn?.classList.toggle('on',panel.classList.contains('show-routes'));
  dirBtn?.classList.toggle('on',panel.classList.contains('show-dir'));
  dirBtn?.classList.toggle('hide',!(S.role!=='admin'&&S.routeMode==='4'));
  mapBox?.classList.toggle('dir-pending',S.role!=='admin'&&S.routeMode==='4'&&!S.routeDirection&&panel.classList.contains('show-dir'));
}
function toggleMobileDraw(){
  const panel=document.getElementById('rd-side-panel');if(!panel)return;
  if(S.role!=='admin'){toast('경로 그리기는 관리자만 사용할 수 있습니다.');return;}
  const on=!panel.classList.contains('show-draw');
  panel.classList.toggle('show-draw',on);
  panel.classList.remove('show-routes','show-dir');
  updateMobileRouteTools();
}
function toggleMobileRoutes(){
  const panel=document.getElementById('rd-side-panel');if(!panel)return;
  const on=!panel.classList.contains('show-routes');
  panel.classList.toggle('show-routes',on);
  panel.classList.remove('show-draw','show-dir');
  updateMobileRouteTools();
}
function toggleMobileDirection(){
  const panel=document.getElementById('rd-side-panel');if(!panel)return;
  if(!(S.role!=='admin'&&S.routeMode==='4')){toast('4인 2조 경로에서 방향을 선택할 수 있습니다.');return;}
  const on=!panel.classList.contains('show-dir');
  panel.classList.toggle('show-dir',on);
  panel.classList.remove('show-draw','show-routes');
  updateMobileRouteTools();
}

function updateRouteDirectionPanel(){
  const panel=document.getElementById('route-dir-panel');
  if(!panel)return;
  const show=S.role!=='admin'&&S.routeMode==='4';
  panel.classList.toggle('on',show);
  if(show){
    ['dir-team1','dir-team2'].forEach(id=>document.getElementById(id)?.classList.remove('on'));
    if(S.routeDirection)document.getElementById(S.routeDirection==='1'?'dir-team1':'dir-team2')?.classList.add('on');
  }
  updateMobileRouteTools();
}
function clearRdLayers(){
  S.rdLayers.forEach(l=>S.rdMap.removeLayer(l));
  S.rdLayers=[];
  if(S.session.progressLayer){S.rdMap.removeLayer(S.session.progressLayer);S.session.progressLayer=null;}
  if(S.session.progressMarker){S.rdMap.removeLayer(S.session.progressMarker);S.session.progressMarker=null;}
}
function drawRdZone(z){
  clearRdLayers();
  keepMapDraggable(S.rdMap);
  const poly=L.polygon(z.polygon,{color:zoneStrokeColor(z),weight:3.8,fillColor:zoneFillColor(z),fillOpacity:.05,opacity:1,interactive:false,className:'zone-boundary-line'}).addTo(S.rdMap);
  S.rdLayers.push(poly);
  addStartPinMarker(S.rdMap,z,S.rdLayers,{label:'시작점',draggable:S.role==='admin'});
  centerRouteMapOnZone(z,18);
  setTimeout(()=>{S.rdMap.invalidateSize();centerRouteMapOnZone(z,18);},80);
}
function drawRoute(){
  const z=S.zones.find(z=>z.id===S.curZone);if(!z)return;
  // 기존 경로선 제거 (폴리곤 유지)
  S.rdLayers.filter((l,i)=>i>0).forEach(l=>S.rdMap.removeLayer(l));
  S.rdLayers=S.rdLayers.slice(0,1);
  const box=document.getElementById('rd-info');
  const saved=currentRteLines();
  if(S.role==='admin'||saved.length){
    const modeTxt=S.routeMode==='4'?'4인 2조':'2인 1조';
    const guide=S.role==='admin'
      ? `${modeTxt}용 경로를 지도에서 직접 만드세요. ${S.routeMode==='4'?'1조와 2조 경로를 각각 저장하면 봉사자가 두 경로를 함께 확인할 수 있습니다.':'시작점부터 끝점까지 한 팀이 지나갈 순서대로 찍으면 됩니다.'}`
      : `${modeTxt} 저장 경로입니다. 지도 위 번호 포인트를 순서대로 지나가며 확인하세요.`;
    box.innerHTML=`<h4>${modeTxt} 경로</h4><p style="font-size:12px;color:var(--txm);line-height:1.6;">${guide}</p>`;
    return;
  }
  const si=0;
  const n=z.polygon.length;
  const pts=[];for(let i=0;i<n;i++)pts.push(z.polygon[(si+i)%n]);
  const st=z.streets,sn=st.length;
  if(S.routeMode==='2'){
    const autoPts=[...pts,pts[0]];
    const line=L.polyline(autoPts,{color:'#378ADD',weight:4,opacity:.88,interactive:false}).addTo(S.rdMap);
    S.rdLayers.push(line);
    S.rdLayers.push(...addRouteArrowMarkers(S.rdMap,autoPts,'#378ADD',720));
    const spI=L.divIcon({html:'<div class="route-start-marker">🚩 시작</div>',className:'',iconAnchor:[30,14]});
    S.rdLayers.push(L.marker(pts[0],{icon:spI,interactive:false}).addTo(S.rdMap));
    let steps=st.map((_,i)=>`<div class="step-row"><div class="sn b">${i+1}</div><div class="st">${st[(si+i)%sn]}${i<sn-1?' → '+st[(si+i+1)%sn]:' → 시작점 복귀 ✓'}</div></div>`).join('');
    box.innerHTML=`<h4>🔵 2인 1조 경로</h4><p style="font-size:12px;color:var(--txm);margin-bottom:9px;">예상: 약 ${sn*20}분</p>${steps}`;
  } else if(S.routeMode==='4'){
    const h=Math.ceil(n/2);
    const canPick=S.role!=='admin';
    const pts1=pts.slice(0,h+1);
    const pts2=[pts[0],...pts.slice(h).reverse()];
    const routeDefs=[
      {team:'1',pts:pts1,color:'#378ADD'},
      {team:'2',pts:pts2,color:'#3B6D11'},
    ].filter(r=>!canPick||!S.routeDirection||S.routeDirection===r.team);
    routeDefs.forEach(r=>{
      const line=L.polyline(r.pts,{color:r.color,weight:canPick&&S.routeDirection===r.team?7:4,opacity:.88,interactive:canPick&&!S.routeDirection}).addTo(S.rdMap);
      if(canPick&&!S.routeDirection)line.on('click',()=>selectRouteDirectionFromMap(r.team));
      S.rdLayers.push(line);
      S.rdLayers.push(...addRouteArrowMarkers(S.rdMap,r.pts,r.color,720,canPick&&!S.routeDirection?()=>selectRouteDirectionFromMap(r.team):null));
    });
    const mp=pts[h%n];
    const mi=L.divIcon({html:'<div style="background:#D85A30;color:#fff;padding:4px 9px;border-radius:10px;font-size:11px;font-weight:700;">만남</div>',className:'',iconAnchor:[20,12]});
    S.rdLayers.push(L.marker(mp,{icon:mi,interactive:false}).addTo(S.rdMap));
    if(canPick&&!S.routeDirection){
      const p1=routeChoiceLabelPoint(S.rdMap,pts1);
      const p2=routeChoiceLabelPoint(S.rdMap,pts2);
      const m1=L.marker(p1,{icon:routeChoiceIcon('1','#378ADD',S.rdMap),zIndexOffset:730}).addTo(S.rdMap).on('click',()=>selectRouteDirectionFromMap('1'));
      const m2=L.marker(p2,{icon:routeChoiceIcon('2','#3B6D11',S.rdMap),zIndexOffset:730}).addTo(S.rdMap).on('click',()=>selectRouteDirectionFromMap('2'));
      S.rdLayers.push(m1,m2);
    }
    const sh=Math.ceil(sn/2);let s1='',s2='';
    for(let i=0;i<sh;i++)s1+=`<div class="step-row"><div class="sn b">${i+1}</div><div class="st">${st[(si+i)%sn]}</div></div>`;
    for(let i=sh;i<sn;i++)s2+=`<div class="step-row"><div class="sn g">${i-sh+1}</div><div class="st">${st[(si+i)%sn]}</div></div>`;
    box.innerHTML=`<h4>4인 2조</h4><p style="font-size:12px;color:var(--txm);margin-bottom:8px;">예상: 약 ${sh*15}분</p><div style="font-size:12px;font-weight:700;color:#185FA5;margin-bottom:5px;">🔵 1조</div>${s1}<div style="font-size:12px;font-weight:700;color:#27500A;margin:8px 0 5px;">🟢 2조(반대방향)</div>${s2}<div class="step-row"><div class="sn r">✓</div><div class="st">중간 합류 → 시작점 복귀</div></div>`;
  }
}

// ================================================================
// 경로 직접 그리기
// ================================================================
function onRdMapClick(e){
  if(S.startPinEdit&&S.role==='admin'&&S.curZone){
    S.startPinEdit=false;
    updateStartPinEditButton();
    saveZoneStartPin(S.curZone,e.latlng.lat,e.latlng.lng);
    return;
  }
  if(!S.rteDraw)return;
  S.rtePts.push([e.latlng.lat,e.latlng.lng]);
  updateRteViz();
}
function setRteColor(c,el){S.rteColor=c;document.querySelectorAll('.cdot').forEach(d=>d.classList.remove('on'));el.classList.add('on');if(S.rteLine)S.rteLine.setStyle({color:c});}
function enterRteEditMode(){
  document.body.classList.add('route-editing');
  const tools=document.getElementById('rd-edit-tools');if(tools)tools.classList.add('on');
  const box=document.getElementById('rd-map-box');if(box)box.classList.add('fs');
  if(S.rdMap){
    keepMapDraggable(S.rdMap);
    setTimeout(()=>S.rdMap.invalidateSize(),80);
    setTimeout(()=>S.rdMap.invalidateSize(),260);
  }
}
function exitRteEditMode(){
  document.body.classList.remove('route-editing');
  const tools=document.getElementById('rd-edit-tools');if(tools)tools.classList.remove('on');
  const box=document.getElementById('rd-map-box');if(box)box.classList.remove('fs');
  const fsBtn=document.getElementById('rd-fs-btn');if(fsBtn)fsBtn.textContent='⛶ 전체 지도';
  if(S.rdMap)setTimeout(()=>S.rdMap.invalidateSize(),120);
}
function startRteDraw(){
  clearRteCurrent();S.rteDraw=true;S.rtePts=[];
  const name=document.getElementById('rte-name');
  if(name&&!name.value.trim()){
    const n=currentRteLines().length+1;
    name.value=S.routeMode==='4'?`${n}조 경로`:`한 팀 경로 ${n}`;
  }
  document.getElementById('rd-draw-btn').style.display='none';
  document.getElementById('rd-stop-btn').style.display='block';
  document.getElementById('rte-draw-title').textContent='🖊 그리는 중... (지도 클릭으로 포인트 추가)';
  enterRteEditMode();
  toast('지도를 클릭해 경로를 그리세요 👆');
}
function stopRteDraw(){
  S.rteDraw=false;
  const b=document.getElementById('rd-draw-btn');if(b)b.style.display='block';
  const s=document.getElementById('rd-stop-btn');if(s)s.style.display='none';
  const ttl=document.getElementById('rte-draw-title');if(ttl)ttl.textContent='🖊 그리기 대기';
  exitRteEditMode();
}
function clearRteCurrent(){
  S.rtePts=[];
  if(S.rteLine){S.rdMap.removeLayer(S.rteLine);S.rteLine=null;}
  S.rteMk.forEach(m=>S.rdMap.removeLayer(m));S.rteMk=[];
  updateRtePtCnt(0);
}
function updateRtePtCnt(n){
  const el=document.getElementById('rte-pt-cnt');if(el)el.textContent=n+'개';
  const fl=document.getElementById('rte-pt-cnt-float');if(fl)fl.textContent=n+'개';
  const sb=document.getElementById('rd-save-btn');if(sb)sb.style.display=n>=2?'block':'none';
}
function updateRteViz(){
  if(S.rteLine){S.rdMap.removeLayer(S.rteLine);S.rteLine=null;}
  S.rteMk.forEach(m=>S.rdMap.removeLayer(m));S.rteMk=[];
  const pts=S.rtePts,n=pts.length;
  updateRtePtCnt(n);
  if(!n)return;
  pts.forEach((p,i)=>{
    const icon=L.divIcon({html:`<div style="width:14px;height:14px;border-radius:50%;background:${S.rteColor};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-size:8px;color:#fff;font-weight:700;">${i+1}</div>`,className:'',iconAnchor:[7,7]});
    S.rteMk.push(L.marker(p,{icon,zIndexOffset:500}).addTo(S.rdMap));
  });
  if(n>=2)S.rteLine=L.polyline(pts,{color:S.rteColor,weight:4,opacity:.9}).addTo(S.rdMap);
  if(n>0){
    const si=L.divIcon({html:'<div class="route-start-marker">🚩 시작</div>',className:'',iconAnchor:[30,14]});
    S.rteMk.push(L.marker(pts[0],{icon:si,zIndexOffset:600}).addTo(S.rdMap));
  }
}
function undoRtePt(){if(!S.rtePts.length)return;S.rtePts.pop();updateRteViz();}
function saveRteLine(){
  if(S.rtePts.length<2){toast('포인트 2개 이상 필요합니다.');return;}
  const nameEl=document.getElementById('rte-name');
  const name=(nameEl?.value.trim())||(S.routeMode==='4'?`${currentRteLines().length+1}조 경로`:`한 팀 경로 ${currentRteLines().length+1}`);
  S.rteLines.push({id:Date.now(),mode:S.routeMode,name,color:S.rteColor,pts:[...S.rtePts],zoneId:S.curZone,visible:true,createdAt:new Date().toISOString()});
  persistRteLines();
  clearRteCurrent();stopRteDraw();if(nameEl)nameEl.value='';
  const ttl=document.getElementById('rte-draw-title');if(ttl)ttl.textContent='✅ 완료된 경로로 저장됨';
  drawRoute();drawSavedRteLines();renderRteLines();renderRouteGrid();toast('✅ 완료된 경로로 저장했습니다.');
}
function renderRteLines(){
  const my=currentRteLines();
  const canEdit=S.role==='admin';
  document.getElementById('rte-lines-wrap').innerHTML=my.length===0
    ?`<p style="font-size:12px;color:var(--txm);padding:8px 0;">아직 ${S.routeMode==='4'?'4인 2조':'2인 1조'} 완료된 경로가 없습니다.${canEdit?'<br>지도에서 경로를 그려 저장하세요.':''}</p>`
    :my.map((l,i)=>`<div class="rte-item">
      <div class="rte-dot" style="background:${l.color};"></div>
      <div style="min-width:0;">
        <div class="rte-line-head">
          <span class="rte-status">완료된 경로</span>
          <div class="rte-line-name">${esc(l.name||`경로 ${i+1}`)}</div>
        </div>
        <div class="rte-line-meta">${l.pts.length}개 포인트 · ${l.visible!==false?'지도 표시':'숨김'}</div>
      </div>
      <div class="rte-actions">
        <button class="btn btn-sm btn-out" onclick="toggleRteLine(${i})">${l.visible!==false?'숨김':'보기'}</button>
        ${canEdit?`<button class="btn btn-sm btn-out" onclick="editRteLine(${i})">수정하기</button><button class="btn btn-sm btn-dk" onclick="delRteLine(${i})">삭제</button>`:''}
      </div>
    </div>`).join('');
}
function toggleRteLine(idx){
  const my=currentRteLines();
  const line=my[idx];if(!line)return;
  line.visible=line.visible===false;
  persistRteLines();drawRoute();drawSavedRteLines();renderRteLines();renderRouteGrid();
}
function editRteLine(idx){
  const my=currentRteLines();
  const line=my[idx];if(!line)return;
  S.rteLines=S.rteLines.filter(l=>l!==line);
  S.rteColor=line.color||S.rteColor;
  S.rtePts=[...line.pts];
  const nameEl=document.getElementById('rte-name');if(nameEl)nameEl.value=line.name||'';
  persistRteLines();drawRoute();drawSavedRteLines();renderRteLines();renderRouteGrid();startRteDraw();S.rtePts=[...line.pts];updateRteViz();
  toast('기존 경로를 이어서 수정하세요.');
}
function delRteLine(idx){
  const my=currentRteLines();
  const line=my[idx];if(!line)return;
  S.rteLines=S.rteLines.filter(l=>l!==line);
  persistRteLines();drawRoute();drawSavedRteLines();renderRteLines();renderRouteGrid();toast('경로 삭제됨');
}
function clearAllRte(){
  const my=currentRteLines();
  if(my.length&&!confirm('이 구역의 저장된 경로를 모두 삭제하시겠습니까?'))return;
  S.rteLines=S.rteLines.filter(l=>!(l.zoneId===S.curZone&&(l.mode||'2')===S.routeMode));
  persistRteLines();drawRoute();drawSavedRteLines();renderRteLines();renderRouteGrid();toast('전체 삭제');
}
function addGPSPt(){
  if(!S.gpsMk||!S.rteDraw){toast('GPS를 켜고 그리기 시작 후 사용하세요.');return;}
  const ll=S.gpsMk.getLatLng();
  S.rtePts.push([ll.lat,ll.lng]);updateRteViz();toast('📍 현재 위치 추가');
}
function fitRouteMapToCurrent(){
  if(!S.rdMap||!S.curZone)return;
  const z=S.zones.find(z=>z.id===S.curZone);
  if(!z)return;
  let bounds=boundsForZoneSet([z]);
  routeScreenLines().forEach(line=>{
    (line.pts||[]).forEach(pt=>{bounds=extendBoundsWithPoint(bounds,pt);});
  });
  fitMapBounds(S.rdMap,bounds,{padding:[52,52],maxZoom:18});
}
function toggleRdFs(){
  const box=document.getElementById('rd-map-box');const btn=document.getElementById('rd-fs-btn');
  const fs=box.classList.toggle('fs');btn.textContent=fs?'✕ 지도 닫기':'⛶ 전체 지도';
  setTimeout(()=>{S.rdMap.invalidateSize();if(fs)fitRouteMapToCurrent();},100);
  setTimeout(()=>{if(fs)fitRouteMapToCurrent();},320);
}
function toggleGPS(){S.rdGpsOn?stopGPS():startGPS();}
function startGPS(){
  if(!navigator.geolocation){toast('GPS 미지원 기기입니다.');return;}
  S.rdGpsOn=true;
  const btn=document.getElementById('rd-gps-btn');const st=document.getElementById('gps-status');
  btn.textContent='📍 위치 켜짐';btn.style.background='#185FA5';btn.style.color='#fff';
  st.style.display='block';st.textContent='📡 GPS 신호 찾는 중...';
  S.rdGpsWatch=navigator.geolocation.watchPosition(pos=>{
    const lat=pos.coords.latitude,lng=pos.coords.longitude,acc=Math.round(pos.coords.accuracy);
    if(S.gpsMk)S.rdMap.removeLayer(S.gpsMk);if(S.gpsCircle)S.rdMap.removeLayer(S.gpsCircle);
    const icon=L.divIcon({html:'<div style="width:16px;height:16px;border-radius:50%;background:#1B5299;border:3px solid #fff;box-shadow:0 0 0 3px rgba(27,82,153,.4);"></div>',className:'',iconAnchor:[8,8]});
    S.gpsMk=L.marker([lat,lng],{icon,zIndexOffset:1000}).addTo(S.rdMap);
    S.gpsCircle=L.circle([lat,lng],{radius:acc,color:'#1B5299',fillColor:'#1B5299',fillOpacity:.1,weight:1}).addTo(S.rdMap);
    S.rdMap.panTo([lat,lng]);
    st.textContent=`📍 현재위치 (정확도:${acc}m)`;
  },err=>{st.textContent='⚠️ GPS 오류';stopGPS();},{enableHighAccuracy:true,maximumAge:3000,timeout:10000});
}
function stopGPS(){
  S.rdGpsOn=false;
  if(S.rdGpsWatch)navigator.geolocation.clearWatch(S.rdGpsWatch);
  if(S.gpsMk){S.rdMap.removeLayer(S.gpsMk);S.gpsMk=null;}
  if(S.gpsCircle){S.rdMap.removeLayer(S.gpsCircle);S.gpsCircle=null;}
  const btn=document.getElementById('rd-gps-btn');const st=document.getElementById('gps-status');
  if(btn){btn.textContent='📍 내 위치 보기';btn.style.background='';btn.style.color='';}
  if(st)st.style.display='none';
}
// ================================================================
// 봉사자 홈
// ================================================================
let homeMapInst=null;
let homeMapLayers=[];
let homeMapFilter='all';

function homeVisibleZones(){
  return S.zones.filter(z=>homeMapFilter==='all'||
    (homeMapFilter==='residential'&&z.type==='residential')||
    (homeMapFilter==='commercial'&&z.type==='commercial')||
    (homeMapFilter==='undone'&&isInProgress(z.id))||
    (homeMapFilter==='standby'&&getZoneState(z.id)==='standby'));
}

function fitHomeMapToVisible(){
  if(!homeMapInst)return;
  const bounds=boundsForZoneSet(homeVisibleZones());
  fitMapBounds(homeMapInst,bounds,{padding:[44,44],maxZoom:16});
}

function renderHome(){
  document.getElementById('home-username').textContent=S.user+'님';
  const roleLabel=document.getElementById('home-role-label');
  if(roleLabel)roleLabel.textContent=S.role==='leader'?'인도자':'봉사자';
  renderHomeZoneList(document.getElementById('home-zone-search')?.value||'');
  // 홈 지도 초기화 (약간 딜레이)
  setTimeout(initHomeMap, 150);
}

function initHomeMap(){
  if(!window.L)return;
  if(!homeMapInst){
    homeMapInst=L.map('home-map',stableMapOptions({center:[38.20138,128.59350],zoom:18,zoomControl:false,attributionControl:false}));
    addBaseTiles(homeMapInst);
    stabilizeZoneLabelsOnMove(homeMapInst);
    homeMapInst.on('zoomend',()=>drawHomeZones(null));
  }
  homeMapInst.invalidateSize();
  drawHomeZones(null);
}

function drawHomeZones(activeId){
  if(!homeMapInst)return;
  homeMapLayers.forEach(l=>homeMapInst.removeLayer(l));
  homeMapLayers=[];
  const showLabels=zoneLabelsVisible(homeMapInst);
  S.zones.forEach(z=>{
    const show=homeMapFilter==='all'||
      (homeMapFilter==='residential'&&z.type==='residential')||
      (homeMapFilter==='commercial'&&z.type==='commercial')||
      (homeMapFilter==='undone'&&isInProgress(z.id))||
      (homeMapFilter==='standby'&&getZoneState(z.id)==='standby');
    if(!show)return;
    const done=isDone(z.id);
    const isRes=z.type==='residential';
    const isActive=activeId===z.id;
    const dimmed=activeId!==null&&!isActive;
    const inProg=isInProgress(z.id);
    const sc=zoneStrokeColor(z);
    const fillColor=zoneFillColor(z);
    const poly=L.polygon(z.polygon,{
      color:sc,weight:isActive?5:3.5,
      fillColor,
      fillOpacity:dimmed?.01:.05,opacity:dimmed?.35:1,
      className:'zone-boundary-line'
    }).addTo(homeMapInst);
    poly.on('click',()=>selectHomeZone(z.id));
    homeMapLayers.push(poly);
    if(isActive)addStartPinMarker(homeMapInst,z,homeMapLayers,{label:'시작점'});
    if(!showLabels)return;
    const ctr=zoneCenter(z);
    const labelColor2='#111827';
    const labelPre=done?'✅ ':inProg?'⏸ ':'○ ';
    const mk=L.marker(ctr,{icon:L.divIcon({
        html:`<div class="zone-map-label" onclick="selectHomeZone(${z.id})" style="opacity:${dimmed?.3:1};border:${isActive?'2px':'1.5px'} solid ${sc};color:${labelColor2};">${labelPre}${zoneMapLabel(z)}</div>`,
      className:'zone-label-anchor',iconAnchor:[0,0],iconSize:[1,1]
    })}).addTo(homeMapInst);
    mk.on('click',()=>selectHomeZone(z.id));
    homeMapLayers.push(mk);
  });
}

function filterHomeMap(type,el){
  document.querySelectorAll('#p-home .chip').forEach(c=>c.classList.remove('on'));
  el.classList.add('on');
  homeMapFilter=type;
  drawHomeZones(null);
  renderHomeZoneList('');
  if(document.getElementById('p-home')?.classList.contains('home-wide')){
    setTimeout(fitHomeMapToVisible,80);
  }
}

function selectHomeZone(id){
  // 지도에서 구역 선택 시 목록에서 하이라이트 + 스크롤
  S.homeSelectedZone=id;
  drawHomeZones(id);
  markSelectedCards(id);
  const z=S.zones.find(z=>z.id===id);
  if(z){
    homeMapInst.fitBounds(L.latLngBounds(z.polygon),{padding:[30,30]});
  }
  // 목록에서 해당 구역 스크롤
  const el=document.getElementById('home-zone-item-'+id);
  if(el)el.scrollIntoView({behavior:'smooth',block:'nearest'});
}

function renderHomeZoneList(kw){
  let zones=[...S.zones].sort((a,b)=>(Number(a.id)||0)-(Number(b.id)||0)||a.name.localeCompare(b.name,'ko',{numeric:true}));
  zones=zones.filter(z=>homeMapFilter==='all'||
    (homeMapFilter==='residential'&&z.type==='residential')||
    (homeMapFilter==='commercial'&&z.type==='commercial')||
    (homeMapFilter==='undone'&&isInProgress(z.id))||
    (homeMapFilter==='standby'&&getZoneState(z.id)==='standby'));
  if(kw&&kw.trim()){
    const k=kw.trim().toLowerCase();
    zones=zones.filter(z=>z.name.toLowerCase().includes(k)||String(z.id).includes(k)||z.streets.some(s=>s.toLowerCase().includes(k)));
  }
  const wrap=document.getElementById('home-zone-list');
  if(!wrap)return;
  if(zones.length===0){
    wrap.innerHTML='<p style="font-size:13px;color:var(--txm);text-align:center;padding:20px 0;">검색 결과가 없습니다.</p>';
    return;
  }
  wrap.innerHTML=zones.map(z=>{
    const done=isDone(z.id);
    const isRes=z.type==='residential';
    const hasProg=isInProgress(z.id)||(z.progress&&z.progress.pts&&z.progress.pts.length>0);
    const meta=getZoneStatusMeta(z.id);
    const status=meta.text;
    const statusClass=meta.cls;
    const selected=String(activeZoneId())===String(z.id);
    const action=done
      ?`<span class="home-zone-action" style="font-size:12px;color:#3B6D11;font-weight:800;">완료 잠김</span>`
      :hasProg
        ?`<button onclick="event.stopPropagation();startSessionAndRoute(${z.id},true)" class="btn btn-sm home-zone-action" style="background:#FAEEDA;color:var(--warn);border:1px solid #FAC775;">이어하기</button>`
        :`<button onclick="event.stopPropagation();startSessionAndRoute(${z.id},false)" class="btn btn-sm btn-p home-zone-action">봉사 시작</button>`;
    return `<div id="home-zone-item-${z.id}" class="home-zone-row ${isRes?'res':'com'} ${selected?'selected':''}" onclick="selectHomeZone(${z.id})">
      <div style="min-width:0;">
        <div class="home-zone-title"><span>#${z.id} </span>${z.name}</div>
        <div class="home-zone-meta">${isRes?'주택':'상가'} · ${z.streets.length}개 거리</div>
      </div>
      <span class="zc-status ${statusClass}">${status}</span>
      ${action}
    </div>`;
  }).join('');
}

function searchHomeZones(kw){renderHomeZoneList(kw);}

function setLeaderZoneView(on){
  const page=document.getElementById('p-home');
  if(page)page.classList.toggle('home-wide',!!on);
  const wideBtn=document.getElementById('home-wide-btn');
  if(wideBtn)wideBtn.textContent=on?'▣ 기본 보기':'⛶ 크게 보기';
  const leaderBtn=document.getElementById('leader-zone-btn');
  if(leaderBtn)leaderBtn.classList.toggle('on',!!on);
  setTimeout(()=>{if(homeMapInst){homeMapInst.invalidateSize();if(on)fitHomeMapToVisible();}},150);
  setTimeout(()=>{if(on)fitHomeMapToVisible();},320);
}

function showHomeNormal(){
  S.leaderRouteListOpen=false;
  setLeaderZoneView(false);
  goTab('home');
}

function showLeaderZonesOnly(){
  if(S.role!=='leader')return;
  S.leaderRouteListOpen=true;
  setLeaderZoneView(false);
  document.getElementById('rd-view').style.display='none';
  document.getElementById('zl-view').style.display='';
  goTab('route');
  renderRouteGrid();
  setTimeout(()=>{const inp=document.getElementById('rte-search');if(inp)inp.focus();},100);
}

function toggleHomeWide(){
  const page=document.getElementById('p-home');
  const wide=page.classList.toggle('home-wide');
  const btn=document.getElementById('home-wide-btn');
  if(btn)btn.textContent=wide?'▣ 기본 보기':'⛶ 크게 보기';
  const leaderBtn=document.getElementById('leader-zone-btn');
  if(leaderBtn)leaderBtn.classList.toggle('on',wide);
  setTimeout(()=>{if(homeMapInst){homeMapInst.invalidateSize();if(wide)fitHomeMapToVisible();}},120);
  setTimeout(()=>{if(wide)fitHomeMapToVisible();},320);
}

function locateHomeMap(){
  locateOnMap(homeMapInst,{markerKey:'homeGpsMk',zoom:18});
}

function updateHomeSessionUI(){
  // 전체화면 모드로 대체됨
}

// ================================================================
// 봉사 세션
// ================================================================
// 봉사자/인도자: 구역 선택 → 경로 화면으로 이동 (세션은 "봉사 시작" 버튼에서)
function startSessionAndRoute(zoneId, resume){
  if(isDone(zoneId)){
    toast('완료된 구역입니다. 관리자가 초기화한 뒤 다시 봉사할 수 있습니다.');
    return;
  }
  if(!resume&&!guardStartableZone(zoneId))return;
  S.pendingResume=!!resume; // 이어하기 여부 저장
  goTab('route');
  setTimeout(()=>openRd(zoneId),180);
}

function startSession(zoneId, resume, opts={}){
  const z=S.zones.find(z=>z.id===zoneId);
  if(!z)return;
  if(isDone(zoneId)){
    toast('완료된 구역입니다. 관리자가 초기화한 뒤 다시 봉사할 수 있습니다.');
    return;
  }
  if(!resume&&!guardStartableZone(zoneId))return;
  // 이미 진행중이면 확인
  if(S.session.active){
    if(!confirm(`현재 진행중인 "${S.zones.find(z=>z.id===S.session.zoneId)?.name}" 봉사를 중단하고 "${z.name}"으로 변경하시겠습니까?`))return;
    endSession(false);
  }
  clearZoneReset(zoneId);
  S.session.active=true;
  S.session.zoneId=zoneId;
  S.session.startTime=Date.now();
  S.session.companions=[];
  S.session.routeMode=S.routeMode;
  S.session.routeDirection=S.routeDirection;
  const savedPts=resume&&Array.isArray(z.progress?.pts)?z.progress.pts:[];
  S.session.progressPts=savedPts.length?[savedPts[savedPts.length-1]]:[];
  // 봉사 시작 기록 (미완료 상태)
  S.records.push({
    id:S.records.length+1,
    zoneId:z.id,zoneName:z.name,
    volunteer:S.user,
    date:new Date().toISOString().split('T')[0],
    mode:'진행중',
    routeMode:S.routeMode,
    direction:S.routeMode==='4'?S.routeDirection:null,
    completed:false,
    sessionId:Date.now(),
  });
  persistRecords();
  persistZones();
  // 공유 스토리지에 세션 정보 저장 (함께하는 봉사자 인식용)
  updateSessionStorage();
  toast(`🟢 ${z.name} 봉사를 ${resume?'이어서 ':''}시작합니다!`);
  updateHomeSessionUI();
  if(opts.openRoute!==false){
    // 경로 탭으로 이동
    goTab('route');
    setTimeout(()=>openRd(zoneId),300);
  }
}

function startSessionGPS(zoneId){
  // 봉사 중 이동 경로 자동 기록은 사용하지 않습니다. 미완료를 누른 순간의 위치만 저장합니다.
}

function updateProgressLine(zoneId){
  // 미완료 위치 저장 방식에서는 진행 선을 그리지 않습니다.
}

function saveProgressToStorage(zoneId){
  const z=S.zones.find(z=>z.id===zoneId);
  if(!z)return;
  const existing=z.progress||{};
  z.progress={
    pts:S.session.progressPts.length?[S.session.progressPts[S.session.progressPts.length-1]]:[],
    savedAt:new Date().toISOString(),
    volunteer:S.user,
    note:existing.note||'',
    routeMode:S.session.routeMode||S.routeMode,
    direction:S.session.routeDirection||S.routeDirection||null,
  };
  // localStorage에도 저장
  try{
    const data=JSON.parse(localStorage.getItem('sokcho_progress')||'{}');
    data[zoneId]=z.progress;
    localStorage.setItem('sokcho_progress',JSON.stringify(data));
  }catch(e){}
}

function updateSessionStorage(){
  try{
    const data=JSON.parse(localStorage.getItem('sokcho_live')||'{}');
    if(data[S.user]){
      data[S.user].sessionZone=S.session.zoneId;
      data[S.user].sessionStart=S.session.startTime;
      localStorage.setItem('sokcho_live',JSON.stringify(data));
    }
  }catch(e){}
}

function resumeMarkerIcon(){
  return L.divIcon({
    html:'<div class="resume-marker-label">📍 이어하기</div>',
    className:'',
    iconAnchor:[46,14]
  });
}

function addResumeMarkerToMap(map,pt,layers){
  if(!map||!pt)return null;
  const marker=L.marker(pt,{icon:resumeMarkerIcon(),zIndexOffset:980}).addTo(map);
  if(Array.isArray(layers))layers.push(marker);
  return marker;
}

function saveResumePinPoint(lat,lng,opts={}){
  const pt=[Number(lat),Number(lng)];
  if(!Number.isFinite(pt[0])||!Number.isFinite(pt[1]))return false;
  S.session.progressPts=[pt];
  if(S.session.zoneId)saveProgressToStorage(S.session.zoneId);
  if(svcMapInst){
    if(svcResumeMarker){
      svcMapInst.removeLayer(svcResumeMarker);
      svcLayers=svcLayers.filter(l=>l!==svcResumeMarker);
      svcResumeMarker=null;
    }
    svcResumeMarker=addResumeMarkerToMap(svcMapInst,pt,svcLayers);
    svcMapInst.setView(pt,18,{animate:true});
  }
  if(!opts.silent)toast('📍 이어하기 핀을 저장했습니다.');
  return true;
}

function pinResumePoint(){
  if(!S.session.active||!S.session.zoneId){
    toast('봉사 진행 중에 사용할 수 있습니다.');
    return;
  }
  if(svcGpsMarker){
    const ll=svcGpsMarker.getLatLng();
    saveResumePinPoint(ll.lat,ll.lng);
    return;
  }
  if(!navigator.geolocation){
    toast('현재 위치를 사용할 수 없습니다.');
    return;
  }
  toast('현재 위치를 확인하는 중입니다.');
  navigator.geolocation.getCurrentPosition(pos=>{
    saveResumePinPoint(pos.coords.latitude,pos.coords.longitude);
  },()=>{
    toast('현재 위치를 가져오지 못했습니다. 잠시 후 다시 눌러주세요.');
  },{enableHighAccuracy:true,maximumAge:3000,timeout:10000});
}

// 미완료 버튼: 현재 위치를 저장하고 미완료 기록으로 남김
function pauseSession(){
  if(!S.session.active)return;
  const z=S.zones.find(z=>z.id===S.session.zoneId);
  if(S.session.progressPts.length===0&&svcGpsMarker){
    const ll=svcGpsMarker.getLatLng();
    S.session.progressPts=[[ll.lat,ll.lng]];
  }
  if(S.session.progressPts.length===0&&z){
    S.session.progressPts=[zoneCenter(z)];
  }
  saveProgressToStorage(S.session.zoneId);
  // 기록을 미완료로 남김
  const rec=S.records.filter(r=>r.completed===false&&r.zoneId===S.session.zoneId).pop();
  if(rec)rec.mode='미완료(일시중단)';
  persistRecords();
  // GPS 중지
  if(S.session.gpsWatch){navigator.geolocation.clearWatch(S.session.gpsWatch);S.session.gpsWatch=null;}
  if(S.session.progressLayer&&S.rdMap){
    S.rdMap.removeLayer(S.session.progressLayer);
    S.session.progressLayer=null;
  }
  if(S.session.progressMarker&&S.rdMap){
    S.rdMap.removeLayer(S.session.progressMarker);
    S.session.progressMarker=null;
  }
  if(S.rdMap&&S.session.progressPts.length>0){
    const lastPt=S.session.progressPts[S.session.progressPts.length-1];
    S.session.progressMarker=addResumeMarkerToMap(S.rdMap,lastPt);
  }
  S.session.active=false;
  closeSvcFullscreen();
  hideReturnBanner();
  toast(`📍 미완료로 저장했습니다. 현재 위치에서 이어서 할 수 있습니다.`);
  renderHomeZoneList(document.getElementById('home-zone-search')?.value||'');
  goTab('home');
  openPauseNote(z?.id);
}

function openPauseNote(zoneId){
  if(!zoneId)return;
  S.pendingNoteZoneId=zoneId;
  const z=S.zones.find(z=>z.id===zoneId);
  const txt=document.getElementById('pause-note-text');
  if(txt)txt.value=z?.progress?.note||'';
  document.getElementById('pause-note-modal')?.classList.add('on');
}

function closePauseNote(){
  document.getElementById('pause-note-modal')?.classList.remove('on');
  S.pendingNoteZoneId=null;
}

function savePauseNote(){
  const zoneId=S.pendingNoteZoneId;
  const z=S.zones.find(z=>z.id===zoneId);
  if(!z)return closePauseNote();
  z.progress=z.progress||{pts:[],savedAt:new Date().toISOString(),volunteer:S.user};
  z.progress.note=(document.getElementById('pause-note-text')?.value||'').trim();
  z.progress.savedAt=new Date().toISOString();
  try{
    const data=JSON.parse(localStorage.getItem('sokcho_progress')||'{}');
    data[zoneId]=z.progress;
    localStorage.setItem('sokcho_progress',JSON.stringify(data));
  }catch(e){}
  renderHomeZoneList(document.getElementById('home-zone-search')?.value||'');
  closePauseNote();
  toast('메모가 저장되었습니다.');
}

function deletePauseNote(){
  const zoneId=S.pendingNoteZoneId;
  const z=S.zones.find(z=>z.id===zoneId);
  if(z?.progress){
    z.progress.note='';
    try{
      const data=JSON.parse(localStorage.getItem('sokcho_progress')||'{}');
      if(data[zoneId])data[zoneId].note='';
      localStorage.setItem('sokcho_progress',JSON.stringify(data));
    }catch(e){}
  }
  const txt=document.getElementById('pause-note-text');if(txt)txt.value='';
  renderHomeZoneList(document.getElementById('home-zone-search')?.value||'');
  toast('메모를 삭제했습니다.');
}

// 완료 버튼
function completeSession(){
  if(!S.session.active){
    // 직접 그리기 경로로 완료
    startSvcDirect();return;
  }
  const z=S.zones.find(z=>z.id===S.session.zoneId);
  if(!confirm(`"${z?.name}" 봉사를 완료 처리하시겠습니까?`))return;
  endSession(true);
  closeSvcFullscreen();
  hideReturnBanner();
  toast(`✅ ${z?.name} 봉사 완료! 기록이 저장되었습니다.`);
  goTab('home');
}

function endSession(completed){
  if(!S.session.active)return;
  const zoneId=S.session.zoneId;
  // 기록 완료 처리
  const rec=S.records.filter(r=>r.completed===false&&r.zoneId===zoneId).pop();
  if(rec){
    rec.completed=completed;
    rec.mode=completed?'완료':'미완료';
    rec.endTime=new Date().toISOString();
  }
  persistRecords();
  // GPS 중지
  if(S.session.gpsWatch){navigator.geolocation.clearWatch(S.session.gpsWatch);S.session.gpsWatch=null;}
  if(completed){
    // 완료 시 진행 데이터 초기화
    const z=S.zones.find(z=>z.id===zoneId);
    if(z)z.progress=null;
    clearZoneReset(zoneId);
    try{
      const data=JSON.parse(localStorage.getItem('sokcho_progress')||'{}');
      delete data[zoneId];
      localStorage.setItem('sokcho_progress',JSON.stringify(data));
    }catch(e){}
    if(S.session.progressLayer&&S.rdMap){S.rdMap.removeLayer(S.session.progressLayer);S.session.progressLayer=null;}
    persistZones();
  }
  S.session.active=false;
  S.session.zoneId=null;
  S.session.progressPts=[];
  updateHomeSessionUI();
  drawAllZones(null);
  renderRecords();
}

// 기존 openRd에서 저장 위치 복원
function restoreProgressLine(zoneId){
  const z=S.zones.find(z=>z.id===zoneId);
  if(isDone(zoneId))return;
  if(!z||!z.progress||!Array.isArray(z.progress.pts)||z.progress.pts.length<1)return;
  if(S.session.progressLayer){S.rdMap.removeLayer(S.session.progressLayer);S.session.progressLayer=null;}
  const lastPt=z.progress.pts[z.progress.pts.length-1];
  if(S.session.progressMarker){S.rdMap.removeLayer(S.session.progressMarker);}
  S.session.progressMarker=addResumeMarkerToMap(S.rdMap,lastPt);
  toast('📍 마지막 저장 위치에서 이어서 봉사하세요.');
}

// 봉사 시작 버튼 클릭 → 세션 생성 + 전체화면 GPS
function startSvcAndGo(){
  if(!S.curZone){toast('구역을 선택해주세요.');return;}
  if(isDone(S.curZone)){
    toast('완료된 구역입니다. 관리자가 초기화한 뒤 다시 봉사할 수 있습니다.');
    return;
  }
  const resume=S.pendingResume||isInProgress(S.curZone);
  if(!resume&&!canStartZone(S.curZone)){
    toast('미완료 구역입니다. 목록의 이어하기로 계속하거나 관리자가 초기화해야 새로 시작할 수 있습니다.');
    return;
  }
  if(S.routeMode==='4'&&!S.routeDirection){
    toast('4인 2조는 1조 방향 또는 2조 방향을 먼저 선택하세요.');
    openRouteDirectionPrompt();
    return;
  }
  S.pendingResume=false;
  // 봉사자/인도자는 전체화면 GPS 모드
  if(S.role==='volunteer'||S.role==='leader'){
    // 세션 시작
    if(!S.session.active){
      startSession(S.curZone, resume,{openRoute:false});
    }
    openSvcFullscreen(S.curZone);
  } else {
    // 관리자는 기존 방식
    startSvcDirect();
  }
}

let svcMapInst=null;
let svcGpsMarker=null;
let svcGpsCircle=null;
let svcTimerInterval=null;
let svcProgressLayer=null;
let svcGpsWatch=null;
let svcLayers=[];
let svcRouteLayers=[];
let svcResumeMarker=null;

function clearSvcRouteLayers(){
  svcRouteLayers.forEach(l=>svcMapInst&&svcMapInst.removeLayer(l));
  svcRouteLayers=[];
}

function svcLocationIcon(){
  return L.divIcon({
    html:'<div style="width:20px;height:20px;border-radius:50%;background:#1B5299;border:3px solid #fff;box-shadow:0 0 0 4px rgba(27,82,153,.35);"></div>',
    className:'',iconAnchor:[10,10]
  });
}
function setSvcGpsMarker(lat,lng,acc){
  if(!svcMapInst)return;
  const ll=[lat,lng];
  if(svcGpsMarker)svcGpsMarker.setLatLng(ll);
  else svcGpsMarker=L.marker(ll,{icon:svcLocationIcon(),zIndexOffset:1000}).addTo(svcMapInst);
  if(acc){
    if(svcGpsCircle)svcGpsCircle.setLatLng(ll).setRadius(acc);
    else svcGpsCircle=L.circle(ll,{radius:acc,color:'#1B5299',weight:1,fillColor:'#1B5299',fillOpacity:.08}).addTo(svcMapInst);
  }
}

function renderSvcRouteLayers(zoneId){
  if(!svcMapInst||!zoneId)return;
  clearSvcRouteLayers();
  svcRouteLayers.push(...addServiceRoutesToMap(svcMapInst,zoneId,S.routeMode));
}

function focusSvcMapOnZone(z){
  if(!svcMapInst||!z)return;
  svcMapInst.setView(zoneStartPoint(z,S.routeMode),18,{animate:false});
}

function openSvcFullscreen(zoneId){
  const z=S.zones.find(z=>z.id===zoneId);
  if(!z)return;
  const fs=document.getElementById('svc-fullscreen');
  fs.style.display='flex';
  document.getElementById('svc-zone-name').textContent=z.name;
  document.getElementById('svc-companions').textContent='내 위치를 확인하며 봉사중';
  // 지도 초기화
  if(!svcMapInst){
    svcMapInst=L.map('svc-map',stableMapOptions({center:[38.20138,128.59350],zoom:18,zoomControl:true,attributionControl:false}));
    addBaseTiles(svcMapInst);
    stabilizeZoneLabelsOnMove(svcMapInst);
    svcMapInst.on('zoomend',()=>renderSvcRouteLayers(S.session.zoneId));
  }
  refreshMapAfterLayout(svcMapInst,()=>focusSvcMapOnZone(z));
  clearSvcRouteLayers();
  svcLayers.forEach(l=>svcMapInst.removeLayer(l));svcLayers=[];
  svcResumeMarker=null;
  // 구역 폴리곤 표시
  if(svcProgressLayer){svcMapInst.removeLayer(svcProgressLayer);}
  svcLayers.push(L.polygon(z.polygon,{color:zoneStrokeColor(z),weight:3.5,fillColor:zoneFillColor(z),fillOpacity:.05,opacity:1,interactive:false,className:'zone-boundary-line'}).addTo(svcMapInst));
  addStartPinMarker(svcMapInst,z,svcLayers,{label:'시작점'});
  focusSvcMapOnZone(z);
  renderSvcRouteLayers(z.id);
  // 마지막 저장 위치 복원
  if(!isDone(z.id)&&z.progress&&Array.isArray(z.progress.pts)&&z.progress.pts.length>=1){
    const lastPt=z.progress.pts[z.progress.pts.length-1];
    svcResumeMarker=addResumeMarkerToMap(svcMapInst,lastPt,svcLayers);
    svcMapInst.setView(lastPt,18);
  }
  // GPS 내 위치 추적
  startSvcGPS();
  // 타이머 시작
  startSvcTimer();
  refreshMapAfterLayout(svcMapInst,()=>renderSvcRouteLayers(z.id));
}

function startSvcGPS(){
  if(!navigator.geolocation)return;
  if(svcGpsWatch)navigator.geolocation.clearWatch(svcGpsWatch);
  const onPos=pos=>{
    const lat=pos.coords.latitude,lng=pos.coords.longitude;
    setSvcGpsMarker(lat,lng,pos.coords.accuracy);
    svcMapInst.panTo([lat,lng]);
  };
  const onErr=err=>console.warn('GPS 위치 표시 오류',err);
  const opt={enableHighAccuracy:true,maximumAge:3000,timeout:10000};
  try{
    svcGpsWatch=navigator.geolocation.watchPosition(onPos,onErr,opt);
  }catch(e){
    console.warn('GPS 위치 추적을 시작할 수 없습니다.',e);
    navigator.geolocation.getCurrentPosition(onPos,onErr,opt);
  }
}

function centerSvcOnMe(){
  if(!svcMapInst){toast('지도를 준비하는 중입니다.');return;}
  if(svcGpsMarker){
    svcMapInst.setView(svcGpsMarker.getLatLng(),18);
    return;
  }
  if(!navigator.geolocation){toast('위치를 사용할 수 없습니다.');return;}
  navigator.geolocation.getCurrentPosition(pos=>{
    const ll=[pos.coords.latitude,pos.coords.longitude];
    svcMapInst.setView(ll,18);
    setSvcGpsMarker(ll[0],ll[1],pos.coords.accuracy);
  },()=>toast('위치 권한을 허용해주세요.'),{enableHighAccuracy:true,maximumAge:3000,timeout:10000});
}

function startSvcTimer(){
  if(svcTimerInterval)clearInterval(svcTimerInterval);
  svcTimerInterval=setInterval(()=>{
    if(!S.session.active)return;
    const elapsed=Math.floor((Date.now()-S.session.startTime)/1000);
    const m=String(Math.floor(elapsed/60)).padStart(2,'0');
    const s=String(elapsed%60).padStart(2,'0');
    const el=document.getElementById('svc-timer');
    if(el)el.textContent=`${m}:${s}`;
  },1000);
}

function closeSvcFullscreen(){
  document.getElementById('svc-fullscreen').style.display='none';
  if(svcTimerInterval){clearInterval(svcTimerInterval);svcTimerInterval=null;}
  if(svcGpsWatch){navigator.geolocation.clearWatch(svcGpsWatch);svcGpsWatch=null;}
  if(svcGpsMarker&&svcMapInst){svcMapInst.removeLayer(svcGpsMarker);svcGpsMarker=null;}
  if(svcGpsCircle&&svcMapInst){svcMapInst.removeLayer(svcGpsCircle);svcGpsCircle=null;}
  clearSvcRouteLayers();
}

let appConfirmOk=null;
function showAppConfirm(title,message,okLabel,onOk){
  document.getElementById('app-confirm-title').textContent=title;
  document.getElementById('app-confirm-message').textContent=message;
  document.querySelector('#app-confirm-modal .confirm-ok').textContent=okLabel||'확인';
  appConfirmOk=onOk;
  document.getElementById('app-confirm-modal').classList.add('on');
}
function closeAppConfirm(ok){
  const cb=appConfirmOk;
  appConfirmOk=null;
  document.getElementById('app-confirm-modal').classList.remove('on');
  if(ok&&typeof cb==='function')cb();
}

// 구역 변경
function svcChangeZone(){
  const elapsed=Math.floor((Date.now()-S.session.startTime)/60000); // 경과 분
  const within20=elapsed<20;
  const message=within20
    ? '구역을 변경하시겠습니까? 20분 이내라 현재 진행 기록은 저장하지 않고 구역 선택 화면으로 돌아갑니다.'
    : '구역을 변경하시겠습니까? 현재까지 진행 내용이 미완료 기록으로 저장됩니다.';
  showAppConfirm('구역을 변경할까요?',message,'변경하기',()=>svcChangeZoneConfirmed(within20));
}
function svcChangeZoneConfirmed(within20){
  if(!within20){
    // 20분 이상 - 저장 여부 확인
    saveProgressToStorage(S.session.zoneId);
    const rec=S.records.filter(r=>r.completed===false&&r.zoneId===S.session.zoneId).pop();
    if(rec)rec.mode='미완료(구역변경)';
    persistRecords();
  } else {
    // 20분 이내 - 저장 없이 바로 변경
    // 기록 삭제 (20분 이내이므로)
    S.records=S.records.filter(r=>!(r.completed===false&&r.zoneId===S.session.zoneId));
    persistRecords();
  }
  if(S.session.gpsWatch){navigator.geolocation.clearWatch(S.session.gpsWatch);S.session.gpsWatch=null;}
  S.session.active=false;
  S.session.progressPts=[];
  if(svcProgressLayer){svcMapInst.removeLayer(svcProgressLayer);svcProgressLayer=null;}
  closeSvcFullscreen();
  hideReturnBanner();
  goTab('home');
  renderHome();
  toast('구역을 다시 선택해주세요.');
}

// 잠시 나가기 (전체화면 닫고 앱 화면으로)
function svcTempLeave(){
  closeSvcFullscreen();
  goTab('home');
  renderHome();
  showReturnBanner();
  // 토스트 없음 - 배너가 충분히 안내함
}

// 구역으로 돌아가기 (잠시 나갔다가 복귀)
function svcReturnZone(){
  if(!S.session.active||!S.session.zoneId){
    hideReturnBanner();return;
  }
  hideReturnBanner();
  openSvcFullscreen(S.session.zoneId);
}

// 복귀 배너 - 현재 봉사중 구역 표시
function showReturnBanner(){
  let banner=document.getElementById('svc-return-banner');
  if(!banner){
    banner=document.createElement('div');
    banner.id='svc-return-banner';
    banner.style.cssText='position:fixed;top:0;left:0;right:0;z-index:7000;background:linear-gradient(135deg,#16a34a,#22C55E);color:#fff;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 3px 12px rgba(0,0,0,.25);';
    banner.innerHTML=`
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
          <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#fff;animation:livepulse 1.5s infinite;flex-shrink:0;"></span>
          <span style="font-size:11px;opacity:.85;font-weight:600;">봉사 진행중</span>
          <span style="font-size:11px;opacity:.75;" id="banner-timer-txt"></span>
        </div>
        <div style="font-size:17px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" id="banner-zone-name"></div>
      </div>
      <button onclick="svcReturnZone()" style="flex-shrink:0;margin-left:12px;background:rgba(255,255,255,.22);border:1.5px solid rgba(255,255,255,.5);color:#fff;padding:10px 14px;border-radius:var(--r);cursor:pointer;font-size:13px;font-weight:700;white-space:nowrap;">📍 구역으로</button>`;
    document.body.appendChild(banner);
  }
  banner.style.display='flex';
  const z=S.zones.find(z=>z.id===S.session.zoneId);
  const el=document.getElementById('banner-zone-name');
  if(el&&z)el.textContent=z.name;
  // 배너 타이머 업데이트
  updateBannerTimer();
  if(!banner._timerInt){
    banner._timerInt=setInterval(updateBannerTimer,30000);
  }
}

function updateBannerTimer(){
  if(!S.session.active)return;
  const el=document.getElementById('banner-timer-txt');
  if(!el)return;
  const elapsed=Math.floor((Date.now()-S.session.startTime)/60000);
  el.textContent=`· ${elapsed}분 경과`;
}

function hideReturnBanner(){
  const b=document.getElementById('svc-return-banner');
  if(b){
    b.style.display='none';
    if(b._timerInt){clearInterval(b._timerInt);b._timerInt=null;}
  }
}

function startSvc(){
  if(S.role==='volunteer'&&!S.session.active){
    if(S.curZone){
      if(S.routeMode==='4'&&!S.routeDirection){toast('4인 2조는 진행 방향을 먼저 선택하세요.');return;}
      startSession(S.curZone,false);
    }
    else{toast('구역을 선택하고 봉사를 시작하세요.');goTab('home');}
    return;
  }
  startSvcDirect();
}
function startSvcDirect(){
  const z=S.zones.find(z=>z.id===S.curZone);if(!z)return;
  if(isDone(z.id)){toast('완료된 구역은 초기화 후 다시 시작할 수 있습니다.');return;}
  const today=new Date().toISOString().split('T')[0];
  const ml=S.routeMode==='2'?'2인1조':S.routeMode==='4'?'4인2조':'직접그리기';
  clearZoneReset(z.id);
  S.records.push({id:S.records.length+1,zoneId:z.id,zoneName:z.name,volunteer:S.user,date:today,mode:ml,completed:true});
  persistRecords();
  persistZones();
  toast(`✅ ${z.name} 봉사 기록 저장!`);drawAllZones(null);renderRouteGrid();
}

// ================================================================
// 기록 탭
// ================================================================
function renderRecords(){
  const my=S.records.filter(r=>r.volunteer===S.user).reverse();
  const now=new Date();const ym=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const mon=my.filter(r=>r.date.startsWith(ym));
  document.getElementById('r-tot').textContent=my.length;
  document.getElementById('r-mon').textContent=mon.length;
  document.getElementById('rec-list').innerHTML=my.length===0
    ?'<p style="text-align:center;color:var(--txm);padding:30px 0;">봉사 기록이 없습니다.</p>'
    :my.map(r=>{
      const isDone=r.completed!==false;
      const statusColor=isDone?'#3B6D11':'#D85A30';
      const statusTxt=isDone?'완료':'미완료';
      const modeText=String(r.mode||'').replace(/미완료[()가-힣\s]*/g,'').trim()||'봉사';
      return `<div class="rc" style="border-left:${isDone?'4':'7'}px solid ${statusColor};">
        <div class="rec-line">
          <div class="rec-zone">${r.zoneName}</div>
          <div class="rec-date">${r.date}</div>
          <div class="rec-status" style="color:${statusColor};">${statusTxt}</div>
          <div class="rec-mode">${modeText}</div>
        </div>
      </div>`;
    }).join('');
}

// ================================================================
// 관리자 탭
// ================================================================
function renderAdmin(){
  loadLeaders();
  const recEmail=document.getElementById('admin-recovery-email');
  if(recEmail)recEmail.value=getAdminRecoveryEmail();
  document.getElementById('a-tot').textContent=S.records.length;
  document.getElementById('a-vol').textContent=S.volunteers.length;
  renderMonChart();renderZoneChart();renderVolList();renderAdmGrid();renderLeaderList();
}
function renderMonChart(){
  const c=new Array(12).fill(0);S.records.forEach(r=>{c[parseInt(r.date.split('-')[1])-1]++;});
  document.getElementById('mon-chart').innerHTML='<div class="compact-counts">'+Array.from({length:12},(_,i)=>`<span class="count-chip">${i+1}월 <b>${c[i]}</b></span>`).join('')+'</div>';
}
function renderZoneChart(){
  const d=S.zones.map(z=>({n:z.name,c:S.records.filter(r=>r.zoneId===z.id).length})).sort((a,b)=>b.c-a.c||a.n.localeCompare(b.n,'ko'));
  document.getElementById('zone-chart').innerHTML='<div class="compact-counts">'+d.map(x=>`<span class="count-chip">${esc(x.n).slice(0,8)} <b>${x.c}</b></span>`).join('')+'</div>';
}
function renderVolList(){
  document.getElementById('vol-list').innerHTML=S.volunteers.map(v=>{
    const c=S.records.filter(r=>r.volunteer===v).length;
    return `<div class="vol-row">
      <div><div style="font-size:13px;font-weight:700;">${esc(v)}</div><div style="font-size:12px;color:var(--txm);">총 ${c}회</div></div>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-sm btn-dk" onclick="rmVol('${jsq(v)}')">삭제</button>
      </div>
    </div>`;
  }).join('');
}
let adminZoneFilter='all';
let adminZoneKeyword='';
function setAdminZoneFilter(filter,el){
  adminZoneFilter=filter;
  document.querySelectorAll('[id^="adm-filter-"]').forEach(b=>b.classList.remove('on'));
  if(el)el.classList.add('on');
  renderAdmGrid();
}
function searchAdminZones(kw){
  adminZoneKeyword=kw||'';
  const clr=document.getElementById('adm-zone-search-clear');
  if(clr)clr.style.display=adminZoneKeyword?'block':'none';
  renderAdmGrid();
}
function clearAdminZoneSearch(){
  adminZoneKeyword='';
  const inp=document.getElementById('adm-zone-search');if(inp){inp.value='';inp.focus();}
  const clr=document.getElementById('adm-zone-search-clear');if(clr)clr.style.display='none';
  renderAdmGrid();
}
function renderAdmGrid(){
  let zones=[...S.zones];
  if(adminZoneFilter==='done')zones=zones.filter(z=>isDone(z.id));
  if(adminZoneFilter==='undone')zones=zones.filter(z=>isInProgress(z.id));
  if(adminZoneFilter==='standby')zones=zones.filter(z=>getZoneState(z.id)==='standby');
  if(adminZoneKeyword.trim()){
    const kw=adminZoneKeyword.trim().toLowerCase();
    zones=zones.filter(z=>z.name.toLowerCase().includes(kw)||String(z.id).includes(kw)||z.streets.some(s=>s.toLowerCase().includes(kw)));
  }
  zones.sort((a,b)=>(Number(a.id)||0)-(Number(b.id)||0)||a.name.localeCompare(b.name,'ko',{numeric:true}));
  const grid=document.getElementById('adm-grid');
  grid.innerHTML=zones.length?zones.map(z=>{
    const isRes=z.type==='residential';
    const done=isDone(z.id);
    const inProg=isInProgress(z.id);
    const meta=getZoneStatusMeta(z.id);
    const c=S.records.filter(r=>r.zoneId===z.id).length;
    const routeCnt=S.rteLines.filter(r=>r.zoneId===z.id).length;
    const status=meta.text;
    const statusClass=meta.cls;
    const statusColor=meta.color;
    const selected=String(activeZoneId())===String(z.id);
    return `<div id="admin-zone-item-${z.id}" class="admin-zone-row ${isRes?'res':'com'} ${selected?'selected':''}">
      <div class="admin-zone-no">#${z.id}</div>
      <div style="min-width:0;">
        <div class="admin-zone-name">${esc(z.name)}</div>
        <div class="admin-zone-meta">${isRes?'주택':'상가'} · ${c}회 · 경로 ${routeCnt}개</div>
      </div>
      <div class="admin-zone-status-box">
        <span class="admin-zone-box-label">상태</span>
        <button class="btn btn-sm ${done?'btn-ok':'btn-out'}" onclick="setZoneStatus(${z.id},'done')">완료</button>
        <button class="btn btn-sm ${inProg?'btn-dk':'btn-out'}" onclick="setZoneStatus(${z.id},'progress')">미완료</button>
      </div>
      <div class="admin-zone-manage-box">
        <span class="admin-zone-box-label">관리</span>
        <button class="btn btn-sm ${meta.state==='standby'?'btn-p':'btn-out'}" onclick="setZoneStatus(${z.id},'standby')">초기화</button>
        <button class="btn btn-sm btn-out" onclick="editZoneNumber(${z.id})">번호수정</button>
        <button class="btn btn-sm btn-dk" onclick="delZone(${z.id})">삭제</button>
      </div>
    </div>`;
  }).join(''):'<p style="font-size:12px;color:var(--txm);padding:12px;text-align:center;">표시할 구역이 없습니다.</p>';
}
function addVol(){const nm=document.getElementById('nv-inp').value.trim();if(!nm){toast('이름 입력');return;}if(S.volunteers.includes(nm)){toast('이미 있음');return;}S.volunteers.push(nm);persistVolunteers();document.getElementById('nv-inp').value='';renderVolList();fillSel();toast(`${nm} 추가`);}
function rmVol(nm){S.volunteers=S.volunteers.filter(v=>v!==nm);persistVolunteers();renderVolList();fillSel();toast(`${nm} 삭제`);}
function delZone(id){if(!confirm('삭제하시겠습니까?'))return;S.zones=S.zones.filter(z=>z.id!==id);S.rteLines=S.rteLines.filter(l=>l.zoneId!==id);persistZones();persistRteLines();drawAllZones(null);renderSideList();renderRouteGrid();renderAdmin();toast('구역 삭제됨');}
function currentYm(){
  const now=new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
}
function clearZoneServiceState(id){
  const ym=currentYm();
  S.records=S.records.filter(r=>{
    if(r.zoneId!==id)return true;
    if(r.completed===false)return false;
    if(r.completed===true&&String(r.date||'').startsWith(ym))return false;
    return true;
  });
  const z=getZoneById(id);
  if(z)z.progress=null;
  try{
    const data=JSON.parse(localStorage.getItem('sokcho_progress')||'{}');
    delete data[id];
    localStorage.setItem('sokcho_progress',JSON.stringify(data));
  }catch(e){}
}
function setZoneStatus(id,status){
  const z=getZoneById(id);
  if(!z)return;
  clearZoneServiceState(id);
  clearZoneReset(id);
  const today=new Date().toISOString().split('T')[0];
  if(status==='done'){
    S.records.push({id:S.records.length+1,zoneId:z.id,zoneName:z.name,volunteer:S.user||'관리자',date:today,mode:'완료(관리자수정)',completed:true});
  }else if(status==='progress'){
    S.records.push({id:S.records.length+1,zoneId:z.id,zoneName:z.name,volunteer:S.user||'관리자',date:today,mode:'미완료(관리자수정)',completed:false});
  }else{
    markZoneReset(id);
  }
  persistRecords();
  persistZones();
  refreshAllViews();
  toast(`${z.name} 상태를 ${status==='done'?'완료':status==='progress'?'미완료':'봉사대기'}로 변경했습니다.`);
}
function resetDoneZones(){
  if(!confirm('완료된 구역의 이번 달 완료 기록을 지우고 봉사대기로 바꿀까요?'))return;
  const ym=currentYm();
  const doneIds=new Set(S.zones.filter(z=>isDone(z.id)).map(z=>z.id));
  const before=S.records.length;
  S.records=S.records.filter(r=>!(doneIds.has(r.zoneId)&&r.completed===true&&String(r.date||'').startsWith(ym)));
  doneIds.forEach(id=>{
    markZoneReset(id);
    const z=getZoneById(id);
    if(z)z.progress=null;
  });
  persistRecords();
  persistZones();
  refreshAllViews();
  toast(`${before-S.records.length}개 완료 기록을 봉사대기 상태로 바꿨습니다.`);
}
function resetZoneDone(id){
  const z=getZoneById(id);
  if(!z)return;
  if(!isDone(id)){toast('완료된 카드만 초기화할 수 있습니다.');return;}
  if(!confirm(`"${z.name}" 완료 기록을 초기화하고 봉사대기 상태로 바꿀까요?`))return;
  const ym=currentYm();
  const before=S.records.length;
  S.records=S.records.filter(r=>!(r.zoneId===id&&r.completed===true&&String(r.date||'').startsWith(ym)));
  markZoneReset(id);
  z.progress=null;
  persistRecords();
  persistZones();
  refreshAllViews();
  toast(`${z.name} 카드가 봉사대기 상태가 되었습니다.`);
}
function toggleTbl(){S.showTbl=!S.showTbl;document.getElementById('all-tbl').style.display=S.showTbl?'block':'none';if(S.showTbl)document.getElementById('all-tbody').innerHTML=S.records.slice().reverse().map(r=>`<tr><td>${r.date}</td><td>${r.zoneName.slice(0,8)}</td><td>${r.volunteer}</td><td>${r.mode}</td></tr>`).join('');}
function exportCSV(){const bom='\uFEFF';const h='날짜,구역,봉사자,방식\n';const rows=S.records.map(r=>`${r.date},${r.zoneName},${r.volunteer},${r.mode}`).join('\n');const a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(bom+h+rows);a.download='속초봉사기록.csv';a.click();toast('CSV 다운로드');}
function makeBackupData(){
  let progress={};
  try{progress=JSON.parse(localStorage.getItem('sokcho_progress')||'{}')||{};}catch(e){}
  return {
    app:'sokcho-service-area',
    version:2,
    savedAt:new Date().toISOString(),
    zones:S.zones,
    records:S.records,
    routes:S.rteLines.map(({id,zoneId,mode,name,color,pts,visible,createdAt})=>({id,zoneId,mode,name,color,pts,visible,createdAt})),
    volunteers:S.volunteers,
    leaders:S.leaders,
    contacts:S.contacts,
    progress,
    settings:{
      adminPin:getAdminPin(),
      leaderPin:getLeaderPin(),
      recoveryEmail:getAdminRecoveryEmail(),
    }
  };
}
function exportBackup(){
  persistAllData();
  const data=JSON.stringify(makeBackupData(),null,2);
  const a=document.createElement('a');
  a.href='data:application/json;charset=utf-8,'+encodeURIComponent(data);
  a.download='속초봉사구역_백업_'+new Date().toISOString().slice(0,10)+'.json';
  a.click();
  toast('백업 파일을 저장했습니다.');
}
function importBackup(input){
  const file=input.files&&input.files[0];
  if(!file)return;
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const data=JSON.parse(reader.result);
      if(!data||!Array.isArray(data.zones)){toast('백업 파일 형식이 올바르지 않습니다.');return;}
      if(!confirm('현재 앱 데이터를 백업 파일 내용으로 교체하시겠습니까?'))return;
      S.zones=Array.isArray(data.zones)?data.zones:[];
      S.records=Array.isArray(data.records)?data.records:[];
      S.rteLines=Array.isArray(data.routes)?data.routes:[];
      S.volunteers=Array.isArray(data.volunteers)?data.volunteers:S.volunteers;
      S.leaders=Array.isArray(data.leaders)?data.leaders:S.leaders;
      if(data.contacts&&typeof data.contacts==='object')S.contacts=data.contacts;
      S.nextId=Math.max(0,...S.zones.map(z=>Number(z.id)||0));
      if(data.progress&&typeof data.progress==='object')localStorage.setItem('sokcho_progress',JSON.stringify(data.progress));
      if(data.settings){
        if(onlyDigits(data.settings.adminPin,6))setAdminPin(data.settings.adminPin);
        if(onlyDigits(data.settings.leaderPin,4))setLeaderPin(data.settings.leaderPin);
        if(data.settings.recoveryEmail)setAdminRecoveryEmail(data.settings.recoveryEmail);
      }
      persistAllData();
      refreshAllViews();
      fillSel();
      toast('백업 데이터를 불러왔습니다.');
    }catch(e){toast('백업 파일을 읽을 수 없습니다.');}
    input.value='';
  };
  reader.readAsText(file,'utf-8');
}

// ================================================================
// 인도자
// ================================================================
function addLeader(){
  const name=document.getElementById('nl-name').value.trim();
  if(!name){toast('이름 입력');return;}
  if(S.leaders.some(l=>l.name===name)){toast('이미 등록된 인도자입니다.');return;}
  const colors=['#D85A30','#7F3FBF','#C0392B','#1ABC9C','#E91E63','#F39C12'];
  S.leaders.push({name,color:colors[S.leaders.length%colors.length]});
  persistLeaders();
  document.getElementById('nl-name').value='';
  renderLeaderList();
  fillSelForRole('leader');  // 인도자 로그인 셀렉트 갱신
  toast(`${name} 인도자 추가`);
}
function renderLeaderList(){
  const wrap=document.getElementById('leader-list');if(!wrap)return;
  wrap.innerHTML=S.leaders.map((l,i)=>`<div class="leader-card">
    <div style="width:12px;height:12px;border-radius:50%;background:${l.color};flex-shrink:0;"></div>
    <div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:700;">${esc(l.name)}</div>
    </div>
    <div style="display:flex;gap:6px;">
      <button class="btn btn-sm btn-dk" onclick="delLeader(${i})">삭제</button>
    </div>
  </div>`).join('');
}
function delLeader(i){S.leaders.splice(i,1);persistLeaders();renderLeaderList();fillSelForRole('leader');toast('인도자 삭제됨');}
function changeLeaderCommonPin(){
  const pin=document.getElementById('leader-pin-new').value.trim();
  if(!onlyDigits(pin,4)){toast('인도자 대표 PIN은 숫자 4자리여야 합니다.');return;}
  setLeaderPin(pin);
  document.getElementById('leader-pin-new').value='';
  toast('인도자 대표 PIN이 변경되었습니다.');
}
function changeAdminPin(){
  const pin=document.getElementById('admin-pin-new').value.trim();
  if(!onlyDigits(pin,6)){toast('관리자 PIN은 숫자 6자리여야 합니다.');return;}
  setAdminPin(pin);
  document.getElementById('admin-pin-new').value='';
  toast('관리자 PIN이 변경되었습니다.');
}
function saveAdminRecoveryEmail(){
  const email=document.getElementById('admin-recovery-email').value.trim().toLowerCase();
  if(!/^[^@\s]+@gmail\.com$/.test(email)){toast('Gmail 주소를 입력하세요.');return;}
  setAdminRecoveryEmail(email);
  toast('복구용 Gmail이 저장되었습니다.');
}
// ================================================================
// 실시간 모니터
// ================================================================
function writeMonitorSimData(){
  const names=S.volunteers.slice(0,Math.min(4,S.volunteers.length));
  if(!names.length)return;
  const now=Date.now();
  const bases=[
    [38.20172,128.59310],[38.20158,128.59358],[38.20120,128.59338],[38.20102,128.59376]
  ];
  const data=JSON.parse(localStorage.getItem('sokcho_live')||'{}');
  names.forEach((name,i)=>{
    const t=now/2400+i*1.7;
    const b=bases[i%bases.length];
    data[name]={
      lat:b[0]+Math.sin(t)*0.00010,
      lng:b[1]+Math.cos(t*0.8)*0.00012,
      acc:8,
      name,
      color:getVolColor(name),
      zone:'시뮬레이션 이동중',
      time:new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}),
      ts:now,
      _sim:true
    };
  });
  localStorage.setItem('sokcho_live',JSON.stringify(data));
}
function clearMonitorSimData(){
  const data=JSON.parse(localStorage.getItem('sokcho_live')||'{}');
  Object.keys(data).forEach(k=>{if(data[k]?._sim)delete data[k];});
  localStorage.setItem('sokcho_live',JSON.stringify(data));
}
function toggleMonitorSim(){
  S.monSimOn=!S.monSimOn;
  const btn=document.getElementById('monitor-sim-btn');
  if(S.monSimOn){
    writeMonitorSimData();
    if(S.monSimTimer)clearInterval(S.monSimTimer);
    S.monSimTimer=setInterval(()=>{writeMonitorSimData();refreshMonitor();},1600);
    if(btn){btn.classList.remove('btn-out');btn.classList.add('btn-p');}
    toast('봉사자 이동 시뮬레이션을 시작합니다.');
  }else{
    if(S.monSimTimer){clearInterval(S.monSimTimer);S.monSimTimer=null;}
    clearMonitorSimData();
    if(btn){btn.classList.remove('btn-p');btn.classList.add('btn-out');}
    toast('시뮬레이션을 종료했습니다.');
  }
  refreshMonitor();
}
function initMonitor(){
  if(!S.monMap){
    S.monMap=L.map('monitor-map',stableMapOptions({center:[38.20138,128.59350],zoom:18,zoomControl:false,attributionControl:false}));
    addBaseTiles(S.monMap);
    stabilizeZoneLabelsOnMove(S.monMap);
    S.zones.forEach(z=>{L.polygon(z.polygon,{color:zoneStrokeColor(z),weight:3.2,fillColor:zoneFillColor(z),fillOpacity:.05,opacity:.98,interactive:false,className:'zone-boundary-line'}).addTo(S.monMap);});
  }
  setTimeout(()=>S.monMap.invalidateSize(),100);
  refreshMonitor();
  if(S.monInterval)clearInterval(S.monInterval);
  S.monInterval=setInterval(refreshMonitor,5000);
}
function refreshMonitor(){
  const data=JSON.parse(localStorage.getItem('sokcho_live')||'{}');
  const now=Date.now();
  const active={};Object.entries(data).forEach(([n,l])=>{if(now-l.ts<300000)active[n]=l;});
  S.monLastActive=active;
  Object.values(S.monMarkers).forEach(m=>{if(m.mk)S.monMap.removeLayer(m.mk);if(m.ci)S.monMap.removeLayer(m.ci);});
  S.monMarkers={};
  const leg=document.getElementById('monitor-legend');leg.innerHTML='';
  const visibleEntries=Object.entries(active).filter(([name])=>!S.monFocus||S.monFocus===name);
  visibleEntries.forEach(([name,loc])=>{
    const color=loc.color||getVolColor(name);
    const icon=L.divIcon({html:`<div style="position:relative;"><div style="width:20px;height:20px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3);"></div><div style="position:absolute;top:-22px;left:50%;transform:translateX(-50%);background:${color};color:#fff;padding:2px 7px;border-radius:8px;font-size:10px;font-weight:700;white-space:nowrap;">${esc(name)}</div></div>`,className:'',iconAnchor:[10,10]});
    const mk=L.marker([loc.lat,loc.lng],{icon,zIndexOffset:500}).addTo(S.monMap);
    mk.bindPopup(`<b>${esc(name)}</b><br>${esc(loc.zone||'이동중')}<br>${esc(loc.time||'현재')} 기준`);
    const ci=L.circle([loc.lat,loc.lng],{radius:loc.acc||20,color,fillColor:color,fillOpacity:.1,weight:1}).addTo(S.monMap);
    S.monMarkers[name]={mk,ci};
    leg.innerHTML+=`<div style="display:flex;align-items:center;gap:5px;margin-top:3px;"><div style="width:10px;height:10px;border-radius:50%;background:${color};"></div><span style="font-size:11px;">${esc(name)}</span></div>`;
  });
  if(!visibleEntries.length)leg.innerHTML=`<span style="color:var(--txm);">${S.monFocus?'선택한 봉사자가 오프라인입니다.':'온라인 없음'}</span>`;
  renderMonList(active);
}
function renderMonList(active){
  const wrap=document.getElementById('monitor-vol-list');
  wrap.innerHTML=S.volunteers.map(name=>{
    const loc=active[name];const color=getVolColor(name);const isOn=!!loc;
    return `<div class="vol-live-card">
      <div class="live-dot ${isOn?'pulse':''}" style="background:${isOn?color:'#d1d5db'};"></div>
      <div class="live-info"><div class="live-name">${esc(name)}</div><div class="live-sub">${isOn?`🟢 ${esc(loc.zone||'이동중')} · ${esc(loc.time||'현재')}`:'⚫ 오프라인'}</div></div>
      <div class="live-btns">
        ${isOn?`<button class="live-btn locate ${S.monFocus===name?'on':''}" onclick="focusVol('${name}')">${S.monFocus===name?'전체보기':'위치확인'}</button>`:''}
      </div>
    </div>`;
  }).join('')
;
}
function openExternalApp(url, fallbackUrl, label){
  const a=document.createElement('a');
  a.href=url;
  a.style.display='none';
  a.target='_self';
  document.body.appendChild(a);
  const started=Date.now();
  try{a.click();}catch(e){try{window.location.href=url;}catch(_){}}
  setTimeout(()=>{a.remove();},300);
  if(fallbackUrl){
    setTimeout(()=>{
      if(Date.now()-started<1400){
        try{window.open(fallbackUrl,'_blank','noopener');}catch(e){}
      }
    },900);
  }
  toast(`${label} 앱을 여는 중입니다.`);
}

function openPhoneApp(){
  const ua=navigator.userAgent.toLowerCase();
  if(/android/.test(ua)){
    openExternalApp('tel:',null,'전화');
  }else if(/iphone|ipad|ipod/.test(ua)){
    openExternalApp('tel:',null,'전화');
  }else{
    openExternalApp('tel:',null,'전화');
  }
}

// 💬 카카오톡 앱 실행
function openKakaoApp(){
  const ua=navigator.userAgent.toLowerCase();
  if(/android/.test(ua)){
    openExternalApp('intent://launch#Intent;scheme=kakaotalk;package=com.kakao.talk;end','https://play.google.com/store/apps/details?id=com.kakao.talk','카카오톡');
  }else if(/iphone|ipad|ipod/.test(ua)){
    openExternalApp('kakaotalk://launch','https://apps.apple.com/kr/app/kakaotalk/id362057947','카카오톡');
  }else{
    openExternalApp('kakaotalk://launch','https://www.kakaocorp.com/page/service/service/KakaoTalk','카카오톡');
  }
}

function zoomMonitorMap(d){zoomMapBy(S.monMap,d);}
function centerMonitorOnMe(){
  if(!navigator.geolocation){toast('GPS를 지원하지 않는 기기입니다.');return;}
  navigator.geolocation.getCurrentPosition(pos=>{
    if(S.monMap)S.monMap.setView([pos.coords.latitude,pos.coords.longitude],18);
  },()=>toast('내 위치 권한이 필요합니다.'),{enableHighAccuracy:true,maximumAge:5000,timeout:10000});
}
function fitMonitorActive(){
  if(!S.monMap)return;
  const pts=Object.values(S.monLastActive||{}).map(l=>[l.lat,l.lng]).filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1]));
  if(pts.length>=2)S.monMap.fitBounds(pts,{padding:[40,40],maxZoom:17});
  else if(pts.length===1)S.monMap.setView(pts[0],18);
  else fitMapBounds(S.monMap,boundsForZoneSet(S.zones),{padding:[42,42],maxZoom:14});
}
function showAllVols(){
  S.monFocus=null;
  refreshMonitor();
  toggleMonitorSheet(false);
  setTimeout(()=>{if(S.monMap)S.monMap.invalidateSize();fitMonitorActive();},120);
  setTimeout(fitMonitorActive,320);
}
function toggleMonitorSheet(force){
  const sheet=document.getElementById('monitor-sheet');
  const btn=document.getElementById('monitor-toggle-btn');
  if(!sheet||!btn)return;
  const open=typeof force==='boolean'?force:!sheet.classList.contains('open');
  sheet.classList.toggle('open',open);
  btn.classList.toggle('open',open);
  btn.textContent=open?'봉사자 현황 내리기':'봉사자 현황 보기';
  setTimeout(()=>{if(S.monMap)S.monMap.invalidateSize();},260);
}
function focusVol(name){
  const data=JSON.parse(localStorage.getItem('sokcho_live')||'{}');
  const loc=data[name];
  if(!loc){toast('현재 온라인 위치가 없습니다.');return;}
  if(S.monFocus===name){showAllVols();return;}
  S.monFocus=name;
  refreshMonitor();
  if(S.monMap){
    S.monMap.setView([loc.lat,loc.lng],18);
    if(S.monMarkers[name]?.mk)S.monMarkers[name].mk.openPopup();
  }
}

// ================================================================
// 위치 공유 (봉사자)
// ================================================================
function startLocShare(){
  if(!navigator.geolocation){toast('GPS를 지원하지 않는 기기입니다.');return;}
  if(S.gpsWatch){return;} // 이미 공유 중
  // 인도자가 인도만 모드면 위치공유 안 함
  if(S.role==='leader'&&S.leaderMode==='guide')return;
  S.gpsWatch=navigator.geolocation.watchPosition(pos=>{
    const isLeaderBoth=S.role==='leader'&&S.leaderMode==='both';
    const loc={
      lat:pos.coords.latitude,lng:pos.coords.longitude,
      acc:Math.round(pos.coords.accuracy),
      name:S.user+(isLeaderBoth?' (인도자)':''),
      color:isLeaderBoth?'#7F3FBF':getVolColor(S.user),
      zone:S.curZone?S.zones.find(z=>z.id===S.curZone)?.name||'이동중':'이동중',
      time:new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}),
      ts:Date.now()
    };
    const data=JSON.parse(localStorage.getItem('sokcho_live')||'{}');
    data[S.user]=loc;
    localStorage.setItem('sokcho_live',JSON.stringify(data));
  },
  err=>{
    if(err.code===1){toast('위치 권한을 허용해야 관리자가 위치를 확인할 수 있습니다.');}
    S.gpsWatch=null;
  },
  {enableHighAccuracy:true,maximumAge:5000,timeout:15000});
  toast('📍 위치 공유가 시작되었습니다. 관리자가 실시간으로 확인합니다.');
}

function stopLocShare(){
  if(S.gpsWatch){navigator.geolocation.clearWatch(S.gpsWatch);S.gpsWatch=null;}
  // 위치공유 중지 (백그라운드)
  const data=JSON.parse(localStorage.getItem('sokcho_live')||'{}');
  delete data[S.user];
  localStorage.setItem('sokcho_live',JSON.stringify(data));
}

function toggleLocShare(){
  // 사용하지 않음 (자동실행)
}
tryAutoLogin();
