// ================================================================
// 상태
// ================================================================
const S={
  user:null,role:null,
  mainMap:null,rdMap:null,monMap:null,
  mainLayers:[],rdLayers:[],rdRteLayers:[],monMarkers:{},
  drawMode:false,drawPts:[],drawMk:[],drawLine:null,drawPoly:null,drawEditId:null,
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
  // 아파트 카드 봉사 세션 (V2 F4, 주택 session과 완전히 분리)
  aptSession:{
    active:false,       // 체크리스트 진행중
    cardId:null,        // 현재 아파트 카드
    startTime:null,     // 시작 시간
  },
  homeSelectedAptCard:null,
  aptBuildingPinEdit:null, // 지도 클릭으로 동 좌표 찍는 중이면 {complexId,bIdx} (V2 H4, H3의 단지단위 좌표찍기를 동단위로 이동)

  zones:[],
  records:[],
  apartmentComplexes:[],
  apartmentCards:[],
};

// ================================================================
// V2 H69: 저장소 추상화(읽기/쓰기 래퍼 함수만 도입). localStorage를
// 직접 호출하던 77곳(getItem 35 / setItem 40 / removeItem 2)을 전부
// 이 세 함수로 통일했다. H105 이전까지는 내부 동작이 localStorage
// 그대로였다(동기 방식, 데이터 형태 무변경).
//
// V2 H105: 이 세 함수의 "내부"만 메모리 캐시 + Firestore 백그라운드
// 동기화 구조로 교체한다. 77곳 호출부는 함수 이름/인자/반환값(동기,
// 즉시 반환)이 전부 기존과 100% 동일해서 단 한 줄도 안 바뀐다.
//
// 구조:
//   1) _storageCacheH105 — 메모리 캐시. storageGet은 항상 이 캐시에서
//      "즉시" 동기로 읽는다(네트워크 대기 없음, 기존 체감 속도 그대로).
//      부팅 시 localStorage 전체를 그대로 복사해 초기값으로 삼는다.
//   2) storageSet — 캐시+localStorage를 즉시 갱신(기존과 동일)하고,
//      Firestore에는 키별로 1.5초 디바운스를 걸어 백그라운드로
//      저장한다(실패해도 로컬 동작은 절대 안 막힘 — 콘솔 경고만).
//      디바운스를 둔 이유: sokcho_live(실시간 위치공유)처럼 초 단위로
//      자주 바뀌는 키가 있어서, 값이 바뀔 때마다 매번 바로 쓰면
//      Firestore 쓰기 횟수가 과도해질 수 있다(비용/쿼터 문제).
//   3) storageRemove — 캐시+localStorage에서 즉시 삭제하고, Firestore
//      문서도 백그라운드로 삭제한다.
//   4) initFirestoreSyncH105() — db가 연결돼 있으면(Firebase 설정 완료
//      + 익명 로그인 성공) 알려진 모든 key마다 Firestore 문서에
//      onSnapshot 리스너를 건다. 다른 기기가 저장한 변경이 들어오면
//      캐시+localStorage를 갱신하고, 그 key에 해당하는 화면을 다시
//      그리는 기존 render 함수들을 호출한다(_reloadAfterRemoteChangeH105).
//
// Firestore 컬렉션 구조(최종안): 컬렉션 'app_data', 문서 id = localStorage
// key 그대로(예: app_data/sokcho_zones), 문서 내용 {value:<문자열>,
// updatedAt:<ms>}. localStorage가 원래 저장하던 문자열(JSON이든 순수
// 문자열이든)을 그대로 value에 넣어서 값의 형태를 전혀 바꾸지 않는다
// (변환/파싱 로직을 추가로 만들지 않아 오류 위험을 최소화).
//
// 문서 크기 확인(1MB 제한 대비, 2026-08-31 기준 실측):
//   sokcho_zones ~216KB(구역 418개) / sokcho_apartment_registry_v1
//   ~48KB / sokcho_apartment_cards_v1 ~356KB(카드 110개, 가장 큰 편—
//   앞으로 단지가 크게 늘면 이 키가 제일 먼저 한도에 가까워질 수
//   있어 주시 필요) / 그 외 키는 전부 수 KB 이하. sokcho_records는
//   봉사 기록이 해마다 누적되는 구조라 장기적으로 계속 커짐(현재는
//   작지만 수년 뒤 재확인 권장). 지금 시점에는 전부 1MB에 한참
//   못 미친다.
//
// 동기화 제외 키(의도적): sokcho_auto_login, sokcho_last_login_gps —
// "이 기기 고유의 로그인 세션/마지막 위치" 개념이라 다른 기기로
// 넘어가면 오히려 보안/혼란 문제가 생긴다(다른 기기의 자동로그인
// 정보가 내 기기에 나타나는 등). 이 두 키만 순수 localStorage로 남긴다.
// ================================================================
const FIRESTORE_SYNC_EXCLUDED_KEYS_H105=new Set(['sokcho_auto_login','sokcho_last_login_gps']);
const FIRESTORE_SYNC_KEYS_H105=['sokcho_zones','sokcho_records','sokcho_progress','sokcho_apartment_registry_v1','sokcho_apartment_cards_v1','sokcho_volunteers','sokcho_leaders','sokcho_contacts','sokcho_routes','sokcho_research_links','sokcho_live','sokcho_s13_v1','sokcho_s13_congregation','sokcho_admin_pin','sokcho_leader_pin','sokcho_admin_recovery_email','sokcho_active_leader','sokcho_h63_import_done','sokcho_builtin_samples_removed','sokcho_deleted_zone_ids','sokcho_deleted_apartment_card_ids'];
const FIRESTORE_WRITE_DEBOUNCE_MS_H105=1500;
let _storageCacheH105={};
let _firestoreWriteTimersH105={};
let _firestoreListenersAttachedH105=false;
let _firestoreSeenRealValueH105=new Set(); // H112: 서버에서 실제 값(exists:true)을 한 번이라도 받은 적 있는 key만 기록 — "문서 없음"이 최초상태인지 진짜삭제인지 구분용
(function _storageCacheInitH105(){
  // 부팅 시 localStorage에 이미 있는 값을 캐시에 그대로 복사(동기,
  // 네트워크 대기 없음) — Firestore 리스너가 아직 안 붙었거나 응답이
  // 오기 전에도 storageGet이 기존과 동일하게 즉시 값을 반환하게 한다.
  try{
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      _storageCacheH105[k]=localStorage.getItem(k);
    }
  }catch(e){}
})();
function storageGet(key){
  return key in _storageCacheH105?_storageCacheH105[key]:localStorage.getItem(key);
}
function storageSet(key,value){
  _storageCacheH105[key]=value;
  localStorage.setItem(key,value);
  _scheduleFirestoreWriteH105(key,value);
}
function storageRemove(key){
  delete _storageCacheH105[key];
  localStorage.removeItem(key);
  _scheduleFirestoreDeleteH105(key);
}
function _scheduleFirestoreWriteH105(key,value){
  if(typeof db==='undefined'||!db||FIRESTORE_SYNC_EXCLUDED_KEYS_H105.has(key))return;
  clearTimeout(_firestoreWriteTimersH105[key]);
  _firestoreWriteTimersH105[key]=setTimeout(()=>{_writeToFirestoreNowH105(key);},FIRESTORE_WRITE_DEBOUNCE_MS_H105);
}
// H117: 로그인 직후 익명 인증이 아직 안 끝난 순간에 첫 저장이 시도되면
// permission-denied로 조용히 실패한다(콘솔 경고는 있었지만 재시도가
// 실제로 안 됨 — 그 key를 다시 storageSet하기 전까지는 Firestore에
// 영영 안 올라갈 수 있었음). initFirestoreSyncH105()의 리스너 등록과
// 동일하게, 인증이 실제로 끝나면 그 값 그대로 한 번 더 자동 재시도한다.
function _writeToFirestoreNowH105(key){
  if(typeof db==='undefined'||!db)return;
  const value=_storageCacheH105[key];
  if(value==null)return; // 그 사이 삭제됐으면 쓸 값이 없음(삭제는 _scheduleFirestoreDeleteH105가 담당)
  db.collection('app_data').doc(key).set({value,updatedAt:Date.now()}).catch(err=>{
    console.warn('[Firestore sync] 저장 실패(로컬에는 정상 저장됨, 다음 저장 시 재시도):',key,err);
    if(typeof firebase!=='undefined'&&firebase.auth&&!firebase.auth().currentUser){
      firebase.auth().onAuthStateChanged(user=>{if(user)_writeToFirestoreNowH105(key);});
    }
  });
}
function _scheduleFirestoreDeleteH105(key){
  if(typeof db==='undefined'||!db||FIRESTORE_SYNC_EXCLUDED_KEYS_H105.has(key))return;
  clearTimeout(_firestoreWriteTimersH105[key]);
  _deleteFromFirestoreNowH105(key);
}
function _deleteFromFirestoreNowH105(key){
  if(typeof db==='undefined'||!db)return;
  db.collection('app_data').doc(key).delete().catch(err=>{
    console.warn('[Firestore sync] 삭제 실패(로컬에는 정상 삭제됨):',key,err);
    if(typeof firebase!=='undefined'&&firebase.auth&&!firebase.auth().currentUser){
      firebase.auth().onAuthStateChanged(user=>{if(user)_deleteFromFirestoreNowH105(key);});
    }
  });
}
// 원격 변경 수신 시 "해당 key를 쓰는 기존 S state를 다시 로드 + 관련
// render 함수 재호출"까지 담당. 새 파싱 로직을 만들지 않고 최대한
// 기존 함수를 재사용(가드 플래그가 있는 것들은 잠깐 풀었다 다시 로드).
// S 캐시가 없거나(예: sokcho_live, sokcho_s13_v1, PIN류) 매번
// storageGet()을 직접 호출해 읽는 값들은 캐시만 갱신되면 다음 조회
// 시 자동으로 최신값이라 여기서 별도 처리가 필요 없다.
function _reloadAfterRemoteChangeH105(key){
  try{
    if(key==='sokcho_zones'){
      try{const z=JSON.parse(storageGet('sokcho_zones')||'[]');S.zones=Array.isArray(z)?z:[];}catch(e){}
      if(typeof drawAllZones==='function')drawAllZones(null);
      if(typeof renderSideList==='function')renderSideList();
      if(typeof renderRouteGrid==='function')renderRouteGrid();
      if(typeof renderHomeZoneList==='function')renderHomeZoneList(document.getElementById('home-zone-search')?.value||'');
      if(typeof renderAdmGrid==='function')renderAdmGrid();
      if(typeof renderZoneChart==='function')renderZoneChart();
    }else if(key==='sokcho_records'){
      try{const r=JSON.parse(storageGet('sokcho_records')||'[]');S.records=Array.isArray(r)?r:[];}catch(e){}
      if(typeof renderRecords==='function')renderRecords();
      if(typeof renderMonChart==='function')renderMonChart();
      if(typeof renderZoneChart==='function')renderZoneChart();
      if(typeof renderAdmGrid==='function')renderAdmGrid();
      if(typeof renderRouteGrid==='function')renderRouteGrid();
      if(typeof renderHomeZoneList==='function')renderHomeZoneList(document.getElementById('home-zone-search')?.value||'');
      if(typeof drawAllZones==='function')drawAllZones(null);
    }else if(key==='sokcho_progress'){
      try{
        const progress=JSON.parse(storageGet('sokcho_progress')||'{}');
        S.zones.forEach(z=>{if(progress&&progress[z.id])z.progress=progress[z.id];});
      }catch(e){}
      if(typeof drawAllZones==='function')drawAllZones(null);
      if(typeof renderRouteGrid==='function')renderRouteGrid();
      if(typeof renderHomeZoneList==='function')renderHomeZoneList(document.getElementById('home-zone-search')?.value||'');
    }else if(key==='sokcho_apartment_registry_v1'){
      S._apartmentRegistryLoaded=false;loadApartmentRegistry();
      if(typeof renderApartmentComplexList==='function')renderApartmentComplexList();
      if(typeof renderCardBuilder==='function')renderCardBuilder();
    }else if(key==='sokcho_apartment_cards_v1'){
      S._apartmentCardsLoaded=false;loadApartmentCards();
      if(typeof renderApartmentCardList==='function')renderApartmentCardList();
      if(typeof renderHomeApartmentCardList==='function')renderHomeApartmentCardList();
      if(typeof renderRouteGrid==='function')renderRouteGrid();
      if(typeof renderSideList==='function')renderSideList();
    }else if(key==='sokcho_volunteers'){
      S._volunteersLoaded=false;loadVolunteers();
      if(typeof renderVolList==='function')renderVolList();
      if(typeof fillSel==='function')fillSel();
    }else if(key==='sokcho_leaders'){
      S._leadersLoaded=false;loadLeaders();
      if(typeof renderLeaderList==='function')renderLeaderList();
    }else if(key==='sokcho_contacts'){
      S._contactsLoaded=false;loadContacts();
    }else if(key==='sokcho_routes'){
      loadRteLines(); // 가드 플래그 없음 — 매번 다시 불러도 안전
      if(typeof drawSavedRteLines==='function')drawSavedRteLines();
      if(typeof renderRouteGrid==='function')renderRouteGrid();
    }else if(key==='sokcho_research_links'){
      S._researchLinksLoaded=false;
      if(typeof renderResearchList==='function')renderResearchList();
    }
    // sokcho_live/sokcho_s13_v1/sokcho_s13_congregation/PIN류/
    // sokcho_active_leader/sokcho_h63_import_done/
    // sokcho_builtin_samples_removed/sokcho_deleted_zone_ids/
    // sokcho_deleted_apartment_card_ids는 위 캐시 갱신만으로 충분
    // (전부 매번 storageGet()을 직접 호출해서 읽는 구조라 별도
    // 재로딩/재렌더 없이도 다음 조회부터 자동으로 최신값을 씀).
  }catch(e){console.warn('[Firestore sync] 화면 갱신 중 오류(데이터 자체는 정상 반영됨):',key,e);}
}
// db가 연결돼 있으면 알려진 모든 key에 onSnapshot 리스너를 건다.
// 실패해도(권한/네트워크 등) 콘솔 경고만 남기고 로컬 동작은 그대로.
function initFirestoreSyncH105(){
  if(typeof db==='undefined'||!db||_firestoreListenersAttachedH105)return;
  // H105 버그수정: initApp()은 로그인 즉시(익명 로그인이 끝나기 전에도)
  // 호출되는데, 그 시점에 바로 리스너를 걸면 Firestore 보안규칙이
  // "인증된 요청만 허용"이라 전부 permission-denied로 죽는다(재시도도
  // 안 됨 — onSnapshot은 한 번 에러가 나면 스스로 다시 안 붙는다).
  // 그래서 로그인이 실제로 끝났는지 firebase.auth().currentUser로
  // 먼저 확인하고, 아직이면 onAuthStateChanged로 로그인 완료 시 한
  // 번만 다시 이 함수를 호출하게 등록만 해두고 조용히 리턴한다(이때는
  // _firestoreListenersAttachedH105를 세우지 않아 재시도가 막히지 않음).
  if(typeof firebase!=='undefined'&&firebase.auth&&!firebase.auth().currentUser){
    firebase.auth().onAuthStateChanged(user=>{if(user)initFirestoreSyncH105();});
    return;
  }
  _firestoreListenersAttachedH105=true;
  FIRESTORE_SYNC_KEYS_H105.forEach(key=>{
    try{
      db.collection('app_data').doc(key).onSnapshot(snap=>{
        if(snap.exists){
          // H112 버그수정: 서버에 실제 값이 있으면 그게 항상 로컬보다
          // 우선(서버→로컬 방향으로만 덮어씀).
          _firestoreSeenRealValueH105.add(key);
          const newValue=snap.data().value;
          if(_storageCacheH105[key]===newValue)return; // 실제 변경 없음(내가 방금 쓴 게 그대로 돌아온 경우 포함) — 건너뜀
          _storageCacheH105[key]=newValue;
          localStorage.setItem(key,newValue);
          _reloadAfterRemoteChangeH105(key);
        }else{
          // H112 버그수정: "문서가 없음"을 예전엔 "서버가 값을 비웠다"로
          // 잘못 해석해서 로컬 캐시/localStorage를 그 자리에서 지워버렸다
          // (기기가 처음 열려서 서버에 아직 아무도 쓴 적이 없는 정상적인
          // 초기 상태에서도 이 경로를 타서, 이미 있던 로컬 데이터가
          // 리스너가 붙는 순간 사라지는 심각한 버그였음). 이제는 "이 key로
          // 서버에서 실제 값을 한 번이라도 받아본 적이 있을 때만"(즉
          // 있다가 나중에 정말로 삭제된 경우만) 로컬도 따라서 비우고,
          // 애초에 서버에 아직 아무 값도 없던 최초 상태에서는 로컬을
          // 절대 건드리지 않는다(로컬이 곧 유일한 데이터이므로 그대로 둠).
          if(!_firestoreSeenRealValueH105.has(key))return;
          if(_storageCacheH105[key]==null)return; // 이미 로컬도 없음 — 더 할 일 없음
          delete _storageCacheH105[key];
          localStorage.removeItem(key);
          _reloadAfterRemoteChangeH105(key);
        }
      },err=>{
        console.warn('[Firestore sync] 실시간 감지 실패(로컬 데이터로 계속 동작):',key,err);
      });
    }catch(e){console.warn('[Firestore sync] 리스너 등록 실패:',key,e);}
  });
}

// V2 H69-B: Firebase 연결 준비(스캐폴딩만). firebase_config.js에 값이
// 채워지고 실제 SDK 스크립트 태그(index.html에 주석으로 미리 자리만
// 잡아둠)의 주석이 풀리기 전까지는 아무 동작도 하지 않는다. 실제로
// storageGet/storageSet의 내부를 Firebase 호출로 바꾸는 작업은 이
// 함수가 하는 일이 아니라 다음 단계(딘이 콘솔에서 프로젝트를 만든
// 뒤)에서 별도로 진행한다 — 지금은 "연결 안 됨" 상태를 정상적으로
// 감지하고 조용히 넘어가는 안전한 자리表시일 뿐이다.
function initFirebaseIfConfigured(){
  if(typeof FIREBASE_CONFIG==='undefined'||typeof isFirebaseConfigReady!=='function'||!isFirebaseConfigReady()){
    return false;
  }
  if(typeof firebase==='undefined'){
    console.log('[Firebase] config는 채워졌지만 SDK 스크립트가 아직 로드되지 않았습니다(index.html 주석 해제 필요).');
    return false;
  }
  // TODO(딘 준비 완료 후 다음 단계에서 구현): firebase.initializeApp(FIREBASE_CONFIG) 등
  console.log('[Firebase] config 준비됨 — 실제 연동은 다음 단계 작업에서 진행합니다.');
  return false;
}

// 유틸
function isDone(id){
  const now=new Date();
  const ym=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  // completed===true 인 기록만 완료로 인정 (미완료/진행중 제외)
  return S.records.some(r=>r.zoneId===id&&r.date.startsWith(ym)&&r.completed===true);
}
function isInProgress(id){
  // 해당 구역의 가장 최근 기록 기준으로 판단(과거에 완료 안 된 채
  // 남은 기록이 있어도, 그 뒤에 완료 처리가 새로 됐다면 진행중이 아님)
  const recs=S.records.filter(r=>r.zoneId===id);
  if(recs.length===0)return false;
  return recs[recs.length-1].completed===false;
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
function kakaoStartUrlForZone(z){
  const pt=zoneStartPoint(z);
  return `https://map.kakao.com/link/map/${pt[0]},${pt[1]}`;
}
function kakaoPointUrlForZone(z){
  const pt=zoneStartPoint(z);
  return `https://map.kakao.com/link/map/${pt[0]},${pt[1]}`;
}
function kakaoStartAppUrlForZone(z){
  const pt=zoneStartPoint(z);
  // V2 H24: 카카오맵 공식 딥링크 스킴(kakaomap://route?sp=&ep=위도,경도&by=이동수단).
  // sp를 비워두면 현재 위치가 출발지로 채워진다. by는 기존 FOOT을 그대로 유지.
  return `kakaomap://route?sp=&ep=${pt[0]},${pt[1]}&by=FOOT`;
}
function openZoneKakaoStart(zoneId){
  const z=S.zones.find(z=>String(z.id)===String(zoneId));
  if(!z){toast('구역을 먼저 선택하세요.');return;}
  const notice=hasCustomStartPoint(z)?null:'📍 저장된 시작핀이 없어 근처 위치로 안내합니다';
  openExternalApp(kakaoStartAppUrlForZone(z),kakaoPointUrlForZone(z),'카카오맵',{notice});
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
  const research=document.getElementById('t-research'); // V2 H44: 인도자 전용 탭(봉사자는 안 보임). 관리자는 관리자 탭 안의 별도 섹션에서 관리
  if(research)research.classList.toggle('hide',!isLeader);
  const adminTools=document.getElementById('admin-zone-tools');
  if(adminTools)adminTools.classList.toggle('hide',!isAdmin);
  const monitorTitle=document.getElementById('monitor-title');
  if(monitorTitle)monitorTitle.textContent=isLeader?'👁 봉사자 관리':'👁 실시간 현황';
  ['t-phone','t-kakao'].forEach(id=>{
    const el=document.getElementById(id);
    if(el)el.classList.toggle('hide',!canUseExternal);
  });
  const s13Btn=document.getElementById('s13-open-btn'); // V2 H32-3: 관리자 페이지로 이동, 관리자 전용으로 노출
  if(s13Btn)s13Btn.classList.toggle('hide',!isAdmin);
}
function onlyDigits(v,len){return new RegExp(`^\\d{${len}}$`).test(String(v||''));}
function getAdminPin(){return storageGet('sokcho_admin_pin')||'123456';}
function setAdminPin(pin){storageSet('sokcho_admin_pin',pin);}
function getAdminRecoveryEmail(){return storageGet('sokcho_admin_recovery_email')||'';}
function setAdminRecoveryEmail(email){storageSet('sokcho_admin_recovery_email',email.trim().toLowerCase());}
function getLeaderPin(){return storageGet('sokcho_leader_pin')||'0000';}
function setLeaderPin(pin){storageSet('sokcho_leader_pin',pin);}
function getLeaderLock(){
  try{return JSON.parse(storageGet('sokcho_active_leader')||'null');}catch(e){return null;}
}
function setLeaderLock(name){
  storageSet('sokcho_active_leader',JSON.stringify({name,ts:Date.now()}));
}
function clearLeaderLock(name){
  const lock=getLeaderLock();
  if(!lock)return;
  if(!name||lock.name===name)storageRemove('sokcho_active_leader');
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
    const saved=JSON.parse(storageGet('sokcho_leaders')||'[]');
    if(Array.isArray(saved)&&saved.length)S.leaders=saved;
  }catch(e){}
  S.leaders=S.leaders.map(({name,color})=>({name,color:color||'#D85A30'}));
  S._leadersLoaded=true;
}
function persistLeaders(){
  storageSet('sokcho_leaders',JSON.stringify(S.leaders.map(({name,color})=>({name,color}))));
}
// V2 H58: 봉사자 명단에 추가할 이름 목록(기존 이름 유지, 없는 이름만 추가).
// 실제 데이터가 기기별 localStorage(sokcho_volunteers)에 있으므로,
// loadVolunteers() 최초 로드 시 1회 기존 addVol()과 동일한 중복검사
// 로직으로 병합한다(각 기기에서 처음 새로고침될 때 자동 반영).
const PUBLISHER_SEED_H58=['강경필','강인경','김강용','김구산','김금영','김미영','김상철','김선길','김선민',
  '김성주','김애경','김영화','김유훈','김일자','김춘자','나양숙','류춘한','문정란',
  '박경옥','박금주','박수찬','박순자','박정남','사재천','서봉배','설양','성정단',
  '신서영','신순식','안동주','오민진','오수연','오애숙','오제윤','우순월','유경숙',
  '유인환','유재호','윤미선','이건우','이건희','이광자','이근숙','이기남','이문자',
  '이삼룡','이상호','이선희','이순의','이실로','이여리','이영애','이옥자','이윤정',
  '이정순','이준영','이해영','이향숙','이현준','이희원','장미자','장인규','전경남',
  '정기훈','정득자','정성숙','정순덕','정영철','조경미','조경자','조동진','조미연',
  '조선애','조회림','지영숙','차혜원','최경환','최규석','최옥희','최진원','최철영',
  '한정희','홍문자','홍용희','홍정애','황신애','황운성','황재영','황희숙'];
function mergePublisherSeedH58(){
  let added=0;
  PUBLISHER_SEED_H58.forEach(nm=>{
    if(!S.volunteers.includes(nm)){S.volunteers.push(nm);added++;}
  });
  if(added>0)persistVolunteers();
}
function loadVolunteers(){
  if(S._volunteersLoaded)return;
  try{
    const saved=JSON.parse(storageGet('sokcho_volunteers')||'[]');
    if(Array.isArray(saved)&&saved.length)S.volunteers=saved;
  }catch(e){}
  mergePublisherSeedH58();
  S._volunteersLoaded=true;
}
function persistVolunteers(){storageSet('sokcho_volunteers',JSON.stringify(S.volunteers));}
function loadContacts(){
  if(S._contactsLoaded)return;
  try{
    const saved=JSON.parse(storageGet('sokcho_contacts')||'{}');
    if(saved&&typeof saved==='object')S.contacts={...S.contacts,...saved};
  }catch(e){}
  S._contactsLoaded=true;
}
function persistContacts(){storageSet('sokcho_contacts',JSON.stringify(S.contacts));}

// ================================================================
// 아파트 단지 레지스트리 (V2 STEP1: 등록/조회/수정/삭제만. 구역 카드 연결은 STEP2)
// ================================================================
function loadApartmentRegistry(){
  if(S._apartmentRegistryLoaded)return;
  const raw=storageGet('sokcho_apartment_registry_v1');
  try{
    const saved=JSON.parse(raw||'null');
    if(saved&&Array.isArray(saved.complexes))S.apartmentComplexes=saved.complexes;
  }catch(e){}
  // H97: 이 저장키 자체가 한 번도 쓰인 적 없는 기기(완전히 새 브라우저)만
  // 정적 최종 데이터(apartment_import_h63_data.js, H63 등록+H80/81/82 좌표
  // 확정까지 반영된 완성본)로 즉시 채운다. raw가 null이 아니라 "빈 배열이
  // 저장된 상태"(관리자가 실제로 전부 삭제한 기기)는 건드리지 않는다.
  if(raw==null&&Array.isArray(window.SOKCHO_APARTMENT_COMPLEXES_SEED)&&window.SOKCHO_APARTMENT_COMPLEXES_SEED.length){
    S.apartmentComplexes=JSON.parse(JSON.stringify(window.SOKCHO_APARTMENT_COMPLEXES_SEED));
    persistApartmentRegistry();
  }
  S._apartmentRegistryLoaded=true;
}
function persistApartmentRegistry(){
  storageSet('sokcho_apartment_registry_v1',JSON.stringify({schemaVersion:1,complexes:S.apartmentComplexes}));
}
function nextApartmentComplexId(){
  return Math.max(0,...S.apartmentComplexes.map(c=>Number(c.id)||0))+1;
}
function addApartmentComplex(){
  const inp=document.getElementById('apt-complex-name');
  const name=(inp?.value||'').trim();
  if(!name){toast('단지 이름을 입력하세요.');return;}
  if(S.apartmentComplexes.some(c=>c.name===name)){toast('이미 등록된 단지입니다.');return;}
  S.apartmentComplexes.push({id:nextApartmentComplexId(),name,buildings:[]});
  persistApartmentRegistry();
  if(inp)inp.value='';
  renderApartmentComplexList();
  toast(`"${name}" 단지 추가됨`);
}
function deleteApartmentComplex(id){
  const c=S.apartmentComplexes.find(c=>c.id===id);
  if(!c)return;
  if(!confirm(`"${c.name}" 단지를 삭제하시겠습니까? (동/호수 정보가 모두 삭제됩니다)`))return;
  S.apartmentComplexes=S.apartmentComplexes.filter(c=>c.id!==id);
  persistApartmentRegistry();
  if(apartmentComplexOpenId===id)apartmentComplexOpenId=null;
  renderApartmentComplexList();
  toast('단지 삭제됨');
}
function hasApartmentComplexCoord(c){
  return !!c&&typeof c.lat==='number'&&typeof c.lng==='number'&&Number.isFinite(c.lat)&&Number.isFinite(c.lng);
}
function setApartmentComplexCoord(complexId){
  const c=S.apartmentComplexes.find(c=>c.id===complexId);
  if(!c)return;
  const latInp=document.getElementById('apt-complex-lat-'+complexId);
  const lngInp=document.getElementById('apt-complex-lng-'+complexId);
  const lat=parseFloat(latInp?.value);
  const lng=parseFloat(lngInp?.value);
  if(!Number.isFinite(lat)||!Number.isFinite(lng)){toast('위도/경도를 숫자로 입력하세요.');return;}
  c.lat=lat;c.lng=lng;
  persistApartmentRegistry();
  renderApartmentComplexList(complexId);
  toast('단지 좌표 저장됨');
}
function hasApartmentBuildingCoord(b){
  return !!b&&typeof b.lat==='number'&&typeof b.lng==='number'&&Number.isFinite(b.lat)&&Number.isFinite(b.lng);
}
function setApartmentBuildingCoord(complexId,bIdx){
  const c=S.apartmentComplexes.find(c=>c.id===complexId);
  const b=c&&c.buildings[bIdx];
  if(!b)return;
  const latInp=document.getElementById(`apt-building-lat-${complexId}-${bIdx}`);
  const lngInp=document.getElementById(`apt-building-lng-${complexId}-${bIdx}`);
  const lat=parseFloat(latInp?.value);
  const lng=parseFloat(lngInp?.value);
  if(!Number.isFinite(lat)||!Number.isFinite(lng)){toast('위도/경도를 숫자로 입력하세요.');return;}
  b.lat=lat;b.lng=lng;
  persistApartmentRegistry();
  renderApartmentComplexList(complexId);
  toast('동 좌표 저장됨');
}
function goApartmentBuildingPin(complexId,bIdx){
  if(S.role!=='admin')return;
  const c=S.apartmentComplexes.find(c=>c.id===complexId);
  const b=c&&c.buildings[bIdx];
  if(!b)return;
  S.aptBuildingPinEdit={complexId,bIdx};
  goTab('map');
  toast('지도에서 동 위치를 탭하세요. (다른 탭으로 이동하면 취소됩니다)');
}
function saveApartmentBuildingPin(complexId,bIdx,lat,lng){
  const c=S.apartmentComplexes.find(c=>c.id===complexId);
  const b=c&&c.buildings[bIdx];
  if(!b)return;
  b.lat=Number(lat);b.lng=Number(lng);
  persistApartmentRegistry();
  goTab('admin');
  renderApartmentComplexList(complexId);
  toast('지도에서 동 좌표를 저장했습니다.');
}
// ================================================================
// V2 H62: 동 좌표 카카오 키워드검색 자동찾기. 완전자동확정이 아니라
// 후보를 보여주고 관리자가 고른 것만 저장(주소검색이 틀릴 수 있어서).
// kakao.maps.services는 index.html의 SDK 로드 URL에 &libraries=services가
// 있어야 존재함(H62에서 추가). 좌표 저장 자체는 기존 saveApartmentBuildingPin
// 을 그대로 재사용 — 지도클릭으로 찍는 것과 결과적으로 동일한 저장 경로.
// ================================================================
let apartmentGeoSearchState={}; // `${complexId}-${bIdx}` -> {query,loading,results:[{name,addr,lat,lng}]}
function searchApartmentBuildingCoord(complexId,bIdx){
  const c=S.apartmentComplexes.find(c=>c.id===complexId);
  const b=c&&c.buildings[bIdx];
  if(!b)return;
  if(typeof kakao==='undefined'||!kakao.maps.services){
    toast('카카오 지도 검색 기능을 불러오지 못했습니다. 잠시 후 다시 시도하거나 "지도에서 찍기"를 이용하세요.');
    return;
  }
  const key=complexId+'-'+bIdx;
  const query=`속초 ${c.name} ${b.dong}`.trim();
  apartmentGeoSearchState[key]={query,loading:true,results:null};
  renderApartmentComplexList(complexId);
  const places=new kakao.maps.services.Places();
  places.keywordSearch(query,(data,status)=>{
    if(status!==kakao.maps.services.Status.OK||!data||!data.length){
      apartmentGeoSearchState[key]={query,loading:false,results:[]};
      renderApartmentComplexList(complexId);
      toast(`"${query}" 검색 결과가 없습니다. "지도에서 찍기"로 직접 지정해주세요.`);
      return;
    }
    apartmentGeoSearchState[key]={
      query,loading:false,
      results:data.slice(0,5).map(d=>({
        name:d.place_name,
        addr:d.road_address_name||d.address_name||'',
        lat:parseFloat(d.y),
        lng:parseFloat(d.x),
      })),
    };
    renderApartmentComplexList(complexId);
    setTimeout(()=>renderApartmentGeoPreviewMap(complexId,bIdx),50);
  });
}
function confirmApartmentGeoCandidate(complexId,bIdx,idx){
  const key=complexId+'-'+bIdx;
  const state=apartmentGeoSearchState[key];
  const cand=state&&state.results&&state.results[idx];
  if(!cand)return;
  saveApartmentBuildingPin(complexId,bIdx,cand.lat,cand.lng); // 기존 지도클릭 저장 로직 그대로 재사용
  delete apartmentGeoSearchState[key];
  toast(`"${cand.name}" 위치로 좌표를 저장했습니다.`);
}
function cancelApartmentGeoSearch(complexId,bIdx){
  delete apartmentGeoSearchState[complexId+'-'+bIdx];
  renderApartmentComplexList(complexId);
}
function renderApartmentGeoResultsHtml(complexId,bIdx){
  const state=apartmentGeoSearchState[complexId+'-'+bIdx];
  if(!state)return '';
  if(state.loading)return `<div style="font-size:12px;color:var(--txm);padding:6px 0;">"${esc(state.query)}" 검색 중...</div>`;
  if(!state.results||!state.results.length)return '';
  return `<div class="apt-geo-results" style="border:1px solid var(--bd);border-radius:8px;padding:8px;margin:-2px 0 8px;">
    <div style="font-size:11px;color:var(--txm);margin-bottom:6px;">"${esc(state.query)}" 검색 결과 — 아래 목록/지도에서 정확한 위치를 골라 확정하세요.</div>
    <div id="apt-geo-preview-map-${complexId}-${bIdx}" style="height:200px;border-radius:6px;margin-bottom:8px;"></div>
    ${state.results.map((r,i)=>`<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;padding:6px 0;border-top:1px solid #EEF2F7;">
      <div style="min-width:0;">
        <div style="font-size:12px;font-weight:700;">${i+1}. ${esc(r.name)}</div>
        <div style="font-size:11px;color:var(--txm);">${esc(r.addr)}</div>
      </div>
      <button class="btn btn-sm btn-p" style="flex-shrink:0;" onclick="confirmApartmentGeoCandidate(${complexId},${bIdx},${i})">이 위치 확정</button>
    </div>`).join('')}
    <button class="btn btn-sm btn-out" style="width:100%;margin-top:8px;" onclick="cancelApartmentGeoSearch(${complexId},${bIdx})">검색결과 닫기</button>
  </div>`;
}
function renderApartmentGeoPreviewMap(complexId,bIdx){
  const state=apartmentGeoSearchState[complexId+'-'+bIdx];
  const container=document.getElementById(`apt-geo-preview-map-${complexId}-${bIdx}`);
  if(!container||!state||!state.results||!state.results.length||typeof kakao==='undefined')return;
  const first=state.results[0];
  const map=new kakao.maps.Map(container,{center:new kakao.maps.LatLng(first.lat,first.lng),level:4});
  const bounds=new kakao.maps.LatLngBounds();
  state.results.forEach((r,i)=>{
    const pos=new kakao.maps.LatLng(r.lat,r.lng);
    bounds.extend(pos);
    const marker=new kakao.maps.Marker({position:pos,map});
    kakao.maps.event.addListener(marker,'click',()=>confirmApartmentGeoCandidate(complexId,bIdx,i));
    const overlay=new kakao.maps.CustomOverlay({
      position:pos,yAnchor:2.2,
      content:`<div style="background:#378ADD;color:#fff;border-radius:4px;padding:1px 6px;font-size:11px;font-weight:700;white-space:nowrap;">${i+1}</div>`,
    });
    overlay.setMap(map);
  });
  if(state.results.length>1)map.setBounds(bounds);
}
function addApartmentBuilding(complexId){
  const c=S.apartmentComplexes.find(c=>c.id===complexId);
  if(!c)return;
  const inp=document.getElementById('apt-dong-name-'+complexId);
  const dong=(inp?.value||'').trim();
  if(!dong){toast('동 이름을 입력하세요.');return;}
  if(c.buildings.some(b=>b.dong===dong)){toast('이미 등록된 동입니다.');return;}
  c.buildings.push({dong,units:[]});
  persistApartmentRegistry();
  if(inp)inp.value='';
  renderApartmentComplexList(complexId);
  toast(`"${dong}" 추가됨`);
}
function deleteApartmentBuilding(complexId,bIdx){
  const c=S.apartmentComplexes.find(c=>c.id===complexId);
  if(!c||!c.buildings[bIdx])return;
  if(!confirm(`"${c.buildings[bIdx].dong}"을 삭제하시겠습니까?`))return;
  c.buildings.splice(bIdx,1);
  persistApartmentRegistry();
  renderApartmentComplexList(complexId);
  toast('동 삭제됨');
}
function genApartmentBuildings(complexId){
  const c=S.apartmentComplexes.find(c=>c.id===complexId);
  if(!c)return;
  const startInp=document.getElementById('apt-dong-start-'+complexId);
  const endInp=document.getElementById('apt-dong-end-'+complexId);
  const start=parseInt(startInp?.value,10);
  const end=parseInt(endInp?.value,10);
  if(!Number.isFinite(start)||!Number.isFinite(end)||start>end){toast('시작동-끝동을 올바르게 입력하세요.');return;}
  const existing=new Set(c.buildings.map(b=>b.dong));
  let added=0;
  for(let n=start;n<=end;n++){
    const dong=n+'동';
    if(!existing.has(dong)){c.buildings.push({dong,units:[]});existing.add(dong);added++;}
  }
  c.buildings.sort((a,b)=>(parseInt(a.dong,10)||0)-(parseInt(b.dong,10)||0)||a.dong.localeCompare(b.dong,'ko'));
  persistApartmentRegistry();
  if(startInp)startInp.value='';
  if(endInp)endInp.value='';
  renderApartmentComplexList(complexId);
  toast(`${added}개 동 생성됨`);
}
// V2 H5: 동 이름 자동생성에 한글/영문 순서 방식 추가 (숫자 범위인 genApartmentBuildings는 무수정 유지)
const APARTMENT_DONG_KOREAN_SEQUENCE='가나다라마바사아자차카타파하';
let apartmentDongGenMode={};
function setApartmentDongGenMode(complexId,mode){
  apartmentDongGenMode[complexId]=mode;
  renderApartmentComplexList(complexId);
}
function genApartmentBuildingsByMode(complexId){
  const mode=apartmentDongGenMode[complexId]||'num';
  if(mode==='kr'){genApartmentBuildingsKorean(complexId);return;}
  if(mode==='en'){genApartmentBuildingsAlpha(complexId);return;}
  genApartmentBuildings(complexId);
}
function koreanDongIndex(ch){
  return APARTMENT_DONG_KOREAN_SEQUENCE.indexOf((ch||'').trim());
}
function genApartmentBuildingsKorean(complexId){
  const c=S.apartmentComplexes.find(c=>c.id===complexId);
  if(!c)return;
  const startInp=document.getElementById('apt-dong-alpha-start-'+complexId);
  const endInp=document.getElementById('apt-dong-alpha-end-'+complexId);
  const startIdx=koreanDongIndex(startInp?.value);
  const endIdx=koreanDongIndex(endInp?.value);
  if(startIdx<0||endIdx<0||startIdx>endIdx){toast('한글 순서는 "가"~"하"(최대 14개) 중에서 시작-끝 글자를 올바르게 입력하세요. 그 밖의 이름은 개별 동 추가를 이용하세요.');return;}
  const existing=new Set(c.buildings.map(b=>b.dong));
  let added=0;
  for(let i=startIdx;i<=endIdx;i++){
    const dong=APARTMENT_DONG_KOREAN_SEQUENCE[i]+'동';
    if(!existing.has(dong)){c.buildings.push({dong,units:[]});existing.add(dong);added++;}
  }
  c.buildings.sort((a,b)=>(parseInt(a.dong,10)||0)-(parseInt(b.dong,10)||0)||a.dong.localeCompare(b.dong,'ko'));
  persistApartmentRegistry();
  if(startInp)startInp.value='';
  if(endInp)endInp.value='';
  renderApartmentComplexList(complexId);
  toast(`${added}개 동 생성됨`);
}
function alphaDongToIndex(s){
  s=(s||'').trim().toUpperCase();
  if(!/^[A-Z]+$/.test(s))return -1;
  let n=0;
  for(let i=0;i<s.length;i++)n=n*26+(s.charCodeAt(i)-64);
  return n; // A=1, Z=26, AA=27...
}
function indexToAlphaDong(n){
  let s='';
  while(n>0){
    n--;
    s=String.fromCharCode(65+(n%26))+s;
    n=Math.floor(n/26);
  }
  return s;
}
// V2 H8: 동 이름 자연 정렬(숫자/한글/영문 공통 비교자). 방식이 섞여 있어도
// 죽지 않도록 숫자→한글→영문→그 외 순으로 그룹핑한 뒤 각 그룹 안에서 정렬.
function apartmentDongSortKey(dong){
  const name=String(dong||'');
  const numMatch=name.match(/^(\d+)/);
  if(numMatch)return{type:0,rank:parseInt(numMatch[1],10)};
  const krIdx=APARTMENT_DONG_KOREAN_SEQUENCE.indexOf(name.charAt(0));
  if(krIdx>=0)return{type:1,rank:krIdx};
  const enMatch=name.match(/^([A-Za-z]+)/);
  if(enMatch)return{type:2,rank:alphaDongToIndex(enMatch[1])};
  return{type:3,rank:0};
}
function compareApartmentDong(a,b){
  const ka=apartmentDongSortKey(a.dong),kb=apartmentDongSortKey(b.dong);
  if(ka.type!==kb.type)return ka.type-kb.type;
  if(ka.rank!==kb.rank)return ka.rank-kb.rank;
  return String(a.dong).localeCompare(String(b.dong),'ko');
}
// 동 배열을 실제로(참조 그대로) 정렬. 정렬로 순서가 실제 바뀐 경우에만
// persistApartmentRegistry()를 호출해 화면 표시 순서와 저장된 데이터 순서가
// 항상 같도록 유지한다(렌더링/카드생성 양쪽에서 이 함수 하나만 재사용).
function sortApartmentBuildingsInPlace(c){
  if(!c||!Array.isArray(c.buildings)||c.buildings.length<2)return;
  const before=c.buildings.map(b=>b.dong).join('');
  c.buildings.sort(compareApartmentDong);
  const after=c.buildings.map(b=>b.dong).join('');
  if(before!==after)persistApartmentRegistry();
}
function genApartmentBuildingsAlpha(complexId){
  const c=S.apartmentComplexes.find(c=>c.id===complexId);
  if(!c)return;
  const startInp=document.getElementById('apt-dong-alpha-start-'+complexId);
  const endInp=document.getElementById('apt-dong-alpha-end-'+complexId);
  const startIdx=alphaDongToIndex(startInp?.value);
  const endIdx=alphaDongToIndex(endInp?.value);
  if(startIdx<0||endIdx<0||startIdx>endIdx){toast('영문 순서는 A,B,C...(Z 다음은 AA) 형식으로 시작-끝을 올바르게 입력하세요.');return;}
  const existing=new Set(c.buildings.map(b=>b.dong));
  let added=0;
  for(let i=startIdx;i<=endIdx;i++){
    const dong=indexToAlphaDong(i)+'동';
    if(!existing.has(dong)){c.buildings.push({dong,units:[]});existing.add(dong);added++;}
  }
  c.buildings.sort((a,b)=>(parseInt(a.dong,10)||0)-(parseInt(b.dong,10)||0)||a.dong.localeCompare(b.dong,'ko'));
  persistApartmentRegistry();
  if(startInp)startInp.value='';
  if(endInp)endInp.value='';
  renderApartmentComplexList(complexId);
  toast(`${added}개 동 생성됨`);
}
function genApartmentUnits(complexId,bIdx,mode){
  const c=S.apartmentComplexes.find(c=>c.id===complexId);
  const b=c&&c.buildings[bIdx];
  if(!b)return;
  const startInp=document.getElementById(`apt-unit-start-${complexId}-${bIdx}`);
  const endInp=document.getElementById(`apt-unit-end-${complexId}-${bIdx}`);
  const start=parseInt(startInp?.value,10);
  const end=parseInt(endInp?.value,10);
  if(!Number.isFinite(start)||!Number.isFinite(end)||start>end){toast('시작호-끝호를 올바르게 입력하세요.');return;}
  const existing=new Set(b.units);
  for(let n=start;n<=end;n++){
    if(mode==='odd'&&n%2===0)continue;
    if(mode==='even'&&n%2!==0)continue;
    const ho=n+'호';
    if(!existing.has(ho)){b.units.push(ho);existing.add(ho);}
  }
  b.units.sort((a,b2)=>(parseInt(a,10)||0)-(parseInt(b2,10)||0));
  persistApartmentRegistry();
  renderApartmentComplexList(complexId);
  toast('호수 생성됨');
}
// V2 H13: 시작층/끝층/세대수 입력값을 여기 보관해 재렌더링(=input 재생성)
// 후에도 화면에 남아있게 한다. 이전에는 생성 후 renderApartmentComplexList가
// 입력창을 통째로 새로 그리면서(템플릿에 value=가 없어) 값이 사라졌고,
// "홀수만"으로 한 번 생성한 뒤 재입력 없이 "짝수만"을 누르면 빈 값 때문에
// 유효성 검사에서 막혀 아무것도 생성되지 않는 버그가 있었다(홀짝 필터
// 로직 자체는 정상이었음 — 재현 테스트로 확인).
let apartmentFloorGenInput={};
function genApartmentUnitsByFloor(complexId,bIdx,mode){
  const c=S.apartmentComplexes.find(c=>c.id===complexId);
  const b=c&&c.buildings[bIdx];
  if(!b)return;
  const floorStartInp=document.getElementById(`apt-unit-floor-start-${complexId}-${bIdx}`);
  const floorEndInp=document.getElementById(`apt-unit-floor-end-${complexId}-${bIdx}`);
  const perFloorInp=document.getElementById(`apt-unit-floor-count-${complexId}-${bIdx}`);
  apartmentFloorGenInput[complexId+'-'+bIdx]={start:floorStartInp?.value||'',end:floorEndInp?.value||'',perFloor:perFloorInp?.value||''};
  const floorStart=parseInt(floorStartInp?.value,10);
  const floorEnd=parseInt(floorEndInp?.value,10);
  const perFloor=parseInt(perFloorInp?.value,10);
  if(!Number.isFinite(floorStart)||!Number.isFinite(floorEnd)||floorStart>floorEnd){toast('시작층-끝층을 올바르게 입력하세요.');return;}
  if(!Number.isFinite(perFloor)||perFloor<1){toast('층당 세대수를 올바르게 입력하세요.');return;}
  const existing=new Set(b.units);
  for(let f=floorStart;f<=floorEnd;f++){
    for(let n=1;n<=perFloor;n++){
      // V2 H10: 층 내 순번(n)의 홀짝 = 최종 호수(f*100+n, f는 항상 짝수배)의 홀짝과 같으므로
      // genApartmentUnits와 동일한 기준(n%2)으로 필터링하면 된다.
      if(mode==='odd'&&n%2===0)continue;
      if(mode==='even'&&n%2!==0)continue;
      const ho=`${f}${String(n).padStart(2,'0')}호`;
      if(!existing.has(ho)){b.units.push(ho);existing.add(ho);}
    }
  }
  b.units.sort((a,b2)=>(parseInt(a,10)||0)-(parseInt(b2,10)||0));
  persistApartmentRegistry();
  renderApartmentComplexList(complexId);
  toast('층/세대수로 호수 생성됨');
}
function addApartmentUnitManual(complexId,bIdx){
  const c=S.apartmentComplexes.find(c=>c.id===complexId);
  const b=c&&c.buildings[bIdx];
  if(!b)return;
  const inp=document.getElementById(`apt-unit-manual-${complexId}-${bIdx}`);
  const ho=(inp?.value||'').trim();
  if(!ho){toast('호수를 입력하세요.');return;}
  if(b.units.includes(ho)){toast('이미 있는 호수입니다.');return;}
  b.units.push(ho);
  persistApartmentRegistry();
  if(inp)inp.value='';
  renderApartmentComplexList(complexId);
}
function deleteApartmentUnit(complexId,bIdx,ho){
  const c=S.apartmentComplexes.find(c=>c.id===complexId);
  const b=c&&c.buildings[bIdx];
  if(!b)return;
  b.units=b.units.filter(u=>u!==ho);
  persistApartmentRegistry();
  renderApartmentComplexList(complexId);
}
let apartmentComplexOpenId=null;
function toggleApartmentComplex(id){
  apartmentComplexOpenId=apartmentComplexOpenId===id?null:id;
  renderApartmentComplexList();
}
function renderApartmentComplexList(keepOpenId){
  if(keepOpenId!=null)apartmentComplexOpenId=keepOpenId;
  const wrap=document.getElementById('apt-complex-list');
  if(!wrap)return;
  wrap.innerHTML=S.apartmentComplexes.length?S.apartmentComplexes.map(c=>{
    sortApartmentBuildingsInPlace(c); // V2 H8: 표시 직전에 항상 정렬(데이터 자체도 함께 정렬됨)
    const totalUnits=c.buildings.reduce((sum,b)=>sum+b.units.length,0);
    const open=apartmentComplexOpenId===c.id;
    return `<div class="apt-complex-row" id="apt-complex-${c.id}">
      <div class="apt-complex-head" onclick="toggleApartmentComplex(${c.id})">
        <div style="min-width:0;">
          <div style="font-size:13px;font-weight:700;">${hasApartmentComplexCoord(c)?'📍 ':''}${esc(c.name)}</div>
          <div style="font-size:12px;color:var(--txm);">${c.buildings.length}개 동 · 총 ${totalUnits}호${hasApartmentComplexCoord(c)?'':' · 좌표 미등록'}</div>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-sm btn-dk" onclick="event.stopPropagation();deleteApartmentComplex(${c.id})">삭제</button>
        </div>
      </div>
      ${open?`<div class="apt-complex-body">
        <div class="add-row">
          <input type="number" id="apt-complex-lat-${c.id}" placeholder="위도 (예: 38.2013)" step="any" value="${hasApartmentComplexCoord(c)?c.lat:''}">
          <input type="number" id="apt-complex-lng-${c.id}" placeholder="경도 (예: 128.5935)" step="any" value="${hasApartmentComplexCoord(c)?c.lng:''}">
          <button class="btn btn-sm btn-p" onclick="setApartmentComplexCoord(${c.id})">좌표 저장</button>
        </div>
        <div style="font-size:11px;color:var(--txm);margin:-4px 0 10px;">
          (참고용/구버전 호환) 개별 동에 좌표가 없을 때만 대신 사용됩니다. 실제 지도 이동·길찾기는 아래 각 동의 좌표를 우선 사용합니다.
        </div>
        <div style="display:flex;gap:6px;margin-bottom:8px;">
          <button class="btn btn-sm ${(apartmentDongGenMode[c.id]||'num')==='num'?'btn-p':'btn-out'}" onclick="setApartmentDongGenMode(${c.id},'num')">숫자 범위</button>
          <button class="btn btn-sm ${apartmentDongGenMode[c.id]==='kr'?'btn-p':'btn-out'}" onclick="setApartmentDongGenMode(${c.id},'kr')">한글 순서</button>
          <button class="btn btn-sm ${apartmentDongGenMode[c.id]==='en'?'btn-p':'btn-out'}" onclick="setApartmentDongGenMode(${c.id},'en')">영문 순서</button>
        </div>
        ${(apartmentDongGenMode[c.id]||'num')==='num'?`<div class="add-row">
          <input type="number" id="apt-dong-start-${c.id}" placeholder="시작동 (예: 101)">
          <input type="number" id="apt-dong-end-${c.id}" placeholder="끝동 (예: 110)">
        </div>`:`<div class="add-row">
          <input type="text" id="apt-dong-alpha-start-${c.id}" placeholder="${apartmentDongGenMode[c.id]==='kr'?'시작 (예: 가)':'시작 (예: A)'}">
          <input type="text" id="apt-dong-alpha-end-${c.id}" placeholder="${apartmentDongGenMode[c.id]==='kr'?'끝 (예: 마)':'끝 (예: E)'}">
        </div>`}
        <div class="add-row">
          <button class="btn btn-sm btn-p" style="flex:1;" onclick="genApartmentBuildingsByMode(${c.id})">동 일괄생성</button>
        </div>
        <div class="add-row">
          <input type="text" id="apt-dong-name-${c.id}" placeholder="개별 동 이름 (예: 101동)">
          <button class="btn btn-sm btn-out" onclick="addApartmentBuilding(${c.id})">개별 동 추가</button>
        </div>
        ${c.buildings.map((b,bIdx)=>`<div class="apt-building-row">
          <div class="apt-building-head">
            <div style="font-size:13px;font-weight:700;">${hasApartmentBuildingCoord(b)?'📍 ':''}${esc(b.dong)} <span style="font-weight:400;color:var(--txm);">${b.units.length}호${hasApartmentBuildingCoord(b)?'':' · 좌표 미등록'}</span></div>
            <button class="btn btn-sm btn-dk" onclick="deleteApartmentBuilding(${c.id},${bIdx})">동 삭제</button>
          </div>
          <div class="add-row">
            <input type="number" id="apt-building-lat-${c.id}-${bIdx}" placeholder="위도 (예: 38.2013)" step="any" value="${hasApartmentBuildingCoord(b)?b.lat:''}">
            <input type="number" id="apt-building-lng-${c.id}-${bIdx}" placeholder="경도 (예: 128.5935)" step="any" value="${hasApartmentBuildingCoord(b)?b.lng:''}">
          </div>
          <div class="add-row">
            <button class="btn btn-sm btn-p" onclick="setApartmentBuildingCoord(${c.id},${bIdx})">좌표 저장</button>
            <button class="btn btn-sm btn-out" onclick="goApartmentBuildingPin(${c.id},${bIdx})">🗺 지도에서 찍기</button>
          </div>
          <div class="add-row">
            <button class="btn btn-sm btn-out" style="flex:1;" onclick="searchApartmentBuildingCoord(${c.id},${bIdx})">🔍 자동으로 찾기</button>
          </div>
          ${renderApartmentGeoResultsHtml(c.id,bIdx)}
          <div class="add-row">
            <input type="number" id="apt-unit-start-${c.id}-${bIdx}" placeholder="시작호">
            <input type="number" id="apt-unit-end-${c.id}-${bIdx}" placeholder="끝호">
          </div>
          <div style="display:flex;gap:6px;margin-bottom:8px;">
            <button class="btn btn-sm btn-out" onclick="genApartmentUnits(${c.id},${bIdx},'all')">전체</button>
            <button class="btn btn-sm btn-out" onclick="genApartmentUnits(${c.id},${bIdx},'odd')">홀수만</button>
            <button class="btn btn-sm btn-out" onclick="genApartmentUnits(${c.id},${bIdx},'even')">짝수만</button>
          </div>
          <div style="font-size:11px;color:var(--txm);margin:-2px 0 4px;">또는 층수·세대수로 자동생성 (예: 1~15층, 층당 4세대 → 101~104···1501~1504):</div>
          <div class="add-row">
            <input type="number" id="apt-unit-floor-start-${c.id}-${bIdx}" placeholder="시작층 (예: 1)" value="${(apartmentFloorGenInput[c.id+'-'+bIdx]&&apartmentFloorGenInput[c.id+'-'+bIdx].start)||''}">
            <input type="number" id="apt-unit-floor-end-${c.id}-${bIdx}" placeholder="끝층 (예: 15)" value="${(apartmentFloorGenInput[c.id+'-'+bIdx]&&apartmentFloorGenInput[c.id+'-'+bIdx].end)||''}">
          </div>
          <div class="add-row">
            <input type="number" id="apt-unit-floor-count-${c.id}-${bIdx}" placeholder="층당 세대수 (예: 4)" value="${(apartmentFloorGenInput[c.id+'-'+bIdx]&&apartmentFloorGenInput[c.id+'-'+bIdx].perFloor)||''}">
          </div>
          <div style="display:flex;gap:6px;margin-bottom:8px;">
            <button class="btn btn-sm btn-out" onclick="genApartmentUnitsByFloor(${c.id},${bIdx},'all')">전체</button>
            <button class="btn btn-sm btn-out" onclick="genApartmentUnitsByFloor(${c.id},${bIdx},'odd')">홀수만</button>
            <button class="btn btn-sm btn-out" onclick="genApartmentUnitsByFloor(${c.id},${bIdx},'even')">짝수만</button>
          </div>
          <div class="add-row">
            <input type="text" id="apt-unit-manual-${c.id}-${bIdx}" placeholder="개별 호수 추가 (예: 201호)">
            <button class="btn btn-sm btn-p" onclick="addApartmentUnitManual(${c.id},${bIdx})">추가</button>
          </div>
          <div class="apt-unit-chips">
            ${b.units.map(u=>`<span class="apt-unit-chip">${esc(u)}<button onclick="deleteApartmentUnit(${c.id},${bIdx},'${jsq(u)}')">✕</button></span>`).join('')}
          </div>
        </div>`).join('')}
      </div>`:''}
    </div>`;
  }).join(''):'<div style="font-size:12px;color:var(--txm);padding:8px 0;">등록된 단지가 없습니다.</div>';
}

// ================================================================
// 아파트 구역카드 자동생성 (V2 STEP2). F1 레지스트리(S.apartmentComplexes)를
// 읽기 전용으로 사용하며 확장/수정하지 않는다. 카드 데이터는 별도 저장소.
// ================================================================
const APARTMENT_CARD_TARGET_SIZE=60; // V2 H3: 라운드로빈 알고리즘으로 재설계하며 50→60으로 변경
const APARTMENT_CARD_REMAINDER_MERGE_MAX=10; // "마지막 자투리" 병합 기준: 10호 이하면 직전 카드에 병합 (F2와 동일 기준 유지)
// V2 H14: 삭제된 아파트 카드 id 영구 제외 목록. H7이 S.zones(sokcho_deleted_zone_ids)에
// 적용한 것과 같은 원칙이지만, 완전히 별도 key로 분리해 zones용과 혼용하지 않는다.
// S.apartmentCards는 페이지당 1회만 메모리에 로드되므로(탭을 여러 개 열어두는 등으로)
// 삭제 시점 이후의 오래된 메모리 상태가 나중에 다시 저장되며 삭제된 카드를 되살릴 수
// 있다 — persistApartmentCards() 자체에서 항상 걸러내 어떤 저장 경로로도 부활하지 않게 한다.
function loadDeletedApartmentCardIds(){
  try{
    const ids=JSON.parse(storageGet('sokcho_deleted_apartment_card_ids')||'[]');
    return Array.isArray(ids)?ids.map(String):[];
  }catch(e){return [];}
}
function addDeletedApartmentCardId(id){
  try{
    const ids=new Set(loadDeletedApartmentCardIds());
    ids.add(String(id));
    storageSet('sokcho_deleted_apartment_card_ids',JSON.stringify([...ids]));
  }catch(e){}
}
function loadApartmentCards(){
  if(S._apartmentCardsLoaded)return;
  const raw=storageGet('sokcho_apartment_cards_v1');
  try{
    const saved=JSON.parse(raw||'null');
    if(saved&&Array.isArray(saved.cards)){
      const deletedIds=new Set(loadDeletedApartmentCardIds());
      S.apartmentCards=deletedIds.size?saved.cards.filter(c=>!deletedIds.has(String(c&&c.id))):saved.cards;
    }
  }catch(e){}
  // H97: loadApartmentRegistry()와 동일한 조건(저장키 자체가 없는 완전히
  // 새 브라우저)에서만 최종 카드 데이터를 즉시 채운다. sokcho_h63_import_done
  // 플래그도 함께 세워서, 기존 "가져오기" 버튼을 실수로 다시 누르더라도
  // (관리자 전용) 원래부터 있던 "이미 실행됨, 다시 등록하시겠습니까?"
  // 확인창이 그대로 뜨게 한다(카드 중복 생성 방지, 기존 안전장치 그대로 재사용).
  if(raw==null&&Array.isArray(window.SOKCHO_APARTMENT_CARDS_SEED)&&window.SOKCHO_APARTMENT_CARDS_SEED.length){
    const deletedIds=new Set(loadDeletedApartmentCardIds());
    const seedCards=window.SOKCHO_APARTMENT_CARDS_SEED.filter(c=>!deletedIds.has(String(c&&c.id)));
    if(seedCards.length){
      S.apartmentCards=JSON.parse(JSON.stringify(seedCards));
      persistApartmentCards();
      storageSet('sokcho_h63_import_done','1');
    }
  }
  S._apartmentCardsLoaded=true;
}
function persistApartmentCards(){
  const deletedIds=new Set(loadDeletedApartmentCardIds());
  if(deletedIds.size)S.apartmentCards=S.apartmentCards.filter(c=>!deletedIds.has(String(c&&c.id)));
  storageSet('sokcho_apartment_cards_v1',JSON.stringify({schemaVersion:1,cards:S.apartmentCards}));
}
function nextApartmentCardId(){
  // V2 H43/PARTB: 딘 확정 — 아파트구역카드는 500번대(5001~). 기존 카드가
  // 하나도 없어(딘 확인) 마이그레이션 불필요, 앞으로 만들 카드부터 적용.
  return Math.max(5000,...S.apartmentCards.map(c=>Number(c.id)||0))+1;
}
function unitNumber(ho){
  const m=String(ho||'').match(/\d+/);
  return m?parseInt(m[0],10):null;
}
function filterUnitsByMode(units,mode){
  if(mode==='odd')return units.filter(u=>{const n=unitNumber(u);return n!=null&&n%2===1;});
  if(mode==='even')return units.filter(u=>{const n=unitNumber(u);return n!=null&&n%2===0;});
  return units.slice();
}
// V2 H3: 체크된 단지들을 라운드로빈으로 순회. 매 라운드마다 각 단지의 다음
// 동 하나씩(등록 순서대로) 꺼내 필터 적용 후 통째로 한 point로 만들어 현재
// 카드에 추가한다(동 내부 분할 없음). 누적 호수가 목표(60)에 도달하면 카드를
// 확정하고 새 카드를 시작한다. 특정 단지의 동이 모두 소진되면 그 단지는
// 순환에서 빠지고 나머지 단지로 라운드로빈을 계속한다.
function generateApartmentCardPlan(complexIds,buildingSelMap,filterMode){
  const queues=complexIds.map(cid=>{
    const complex=S.apartmentComplexes.find(c=>c.id===cid);
    if(!complex)return null;
    sortApartmentBuildingsInPlace(complex); // V2 H8: 라운드로빈이 소비하는 순서도 항상 정렬된 순서를 따르게 함
    const bSel=buildingSelMap[cid];
    const buildings=complex.buildings.filter((b,bIdx)=>!bSel||bSel.has(bIdx));
    return {complex,buildings,cursor:0};
  }).filter(Boolean);

  const cards=[];
  let acc=null;
  const startAcc=()=>{acc={points:[],count:0};};
  const finalizeAcc=()=>{if(acc&&acc.points.length)cards.push(acc);acc=null;};

  let active=queues.filter(q=>q.cursor<q.buildings.length);
  while(active.length>0){
    for(const q of active){
      const building=q.buildings[q.cursor];
      q.cursor++;
      const units=filterUnitsByMode(building.units,filterMode);
      if(units.length){
        if(!acc)startAcc();
        // V2 H4: point 좌표는 단지가 아니라 해당 동(building) 좌표에서 가져온다. 없으면 null(카드 생성 시 경고 표시).
        const hasCoord=hasApartmentBuildingCoord(building);
        acc.points.push({complexId:q.complex.id,complexName:q.complex.name,dong:building.dong,lat:hasCoord?building.lat:null,lng:hasCoord?building.lng:null,units:units.slice()});
        acc.count+=units.length;
        if(acc.count>=APARTMENT_CARD_TARGET_SIZE)finalizeAcc();
      }
    }
    active=active.filter(q=>q.cursor<q.buildings.length);
  }
  finalizeAcc();

  // 마지막 카드가 너무 적으면(10호 이하) 직전 카드에 병합
  if(cards.length>1&&cards[cards.length-1].count<=APARTMENT_CARD_REMAINDER_MERGE_MAX){
    const last=cards.pop();
    const prev=cards[cards.length-1];
    last.points.forEach(pt=>{
      const lastPt=prev.points[prev.points.length-1];
      if(lastPt&&lastPt.complexId===pt.complexId&&lastPt.dong===pt.dong){
        lastPt.units=lastPt.units.concat(pt.units);
      }else{
        prev.points.push(pt);
      }
    });
    prev.count+=last.count;
  }
  return cards;
}

let apartmentCardGenSel={complexIds:new Set(),buildingSel:{},filter:'all'};
let apartmentCardGenPreview=null;
function toggleApartmentCardGenComplex(complexId){
  if(apartmentCardGenSel.complexIds.has(complexId)){
    apartmentCardGenSel.complexIds.delete(complexId);
    delete apartmentCardGenSel.buildingSel[complexId];
  }else{
    apartmentCardGenSel.complexIds.add(complexId);
    apartmentCardGenSel.buildingSel[complexId]=null; // null = 전체 동 선택
  }
  apartmentCardGenPreview=null;
  renderApartmentCardGenPanel();
}
function toggleApartmentCardGenBuilding(complexId,bIdx){
  const complex=S.apartmentComplexes.find(c=>c.id===complexId);
  if(!complex)return;
  let sel=apartmentCardGenSel.buildingSel[complexId];
  if(sel==null)sel=new Set(complex.buildings.map((_,i)=>i));
  if(sel.has(bIdx))sel.delete(bIdx);else sel.add(bIdx);
  apartmentCardGenSel.buildingSel[complexId]=sel;
  apartmentCardGenPreview=null;
  renderApartmentCardGenPanel();
}
function setApartmentCardGenFilter(mode){
  apartmentCardGenSel.filter=mode;
  apartmentCardGenPreview=null;
  renderApartmentCardGenPanel();
}
function renderApartmentCardGenPanel(){
  loadApartmentCards();
  const wrap=document.getElementById('apt-card-gen-complexes');
  if(wrap){
    wrap.innerHTML=S.apartmentComplexes.length?S.apartmentComplexes.map(c=>{
      const checked=apartmentCardGenSel.complexIds.has(c.id);
      const totalUnits=c.buildings.reduce((s,b)=>s+b.units.length,0);
      const bSel=apartmentCardGenSel.buildingSel[c.id];
      return `<div class="apt-gen-complex-row">
        <label class="apt-check-row">
          <input type="checkbox" ${checked?'checked':''} onchange="toggleApartmentCardGenComplex(${c.id})">
          <span>${esc(c.name)} <span style="color:var(--txm);">(${c.buildings.length}개 동 · ${totalUnits}호)</span></span>
        </label>
        ${checked?c.buildings.map((b,bIdx)=>{
          const bChecked=bSel==null||bSel.has(bIdx);
          return `<label class="apt-check-row apt-check-sub">
            <input type="checkbox" ${bChecked?'checked':''} onchange="toggleApartmentCardGenBuilding(${c.id},${bIdx})">
            <span>${esc(b.dong)} <span style="color:var(--txm);">(${b.units.length}호)</span></span>
          </label>`;
        }).join(''):''}
      </div>`;
    }).join(''):'<div style="font-size:12px;color:var(--txm);padding:8px 0;">먼저 단지를 등록하세요.</div>';
  }
  const filterWrap=document.getElementById('apt-card-gen-filter');
  if(filterWrap){
    filterWrap.innerHTML=['all','odd','even'].map(m=>{
      const label=m==='all'?'전체':m==='odd'?'홀수만':'짝수만';
      return `<button class="btn btn-sm ${apartmentCardGenSel.filter===m?'btn-p':'btn-out'}" onclick="setApartmentCardGenFilter('${m}')">${label}</button>`;
    }).join('');
  }
  renderApartmentCardGenPreview();
}
function previewApartmentCardGen(){
  const complexIds=Array.from(apartmentCardGenSel.complexIds);
  if(!complexIds.length){toast('단지를 하나 이상 선택하세요.');return;}
  const plan=generateApartmentCardPlan(complexIds,apartmentCardGenSel.buildingSel,apartmentCardGenSel.filter);
  if(!plan.length){toast('선택한 조건에 맞는 호수가 없습니다.');return;}
  apartmentCardGenPreview=plan;
  renderApartmentCardGenPreview();
}
function cancelApartmentCardGenPreview(){
  apartmentCardGenPreview=null;
  renderApartmentCardGenPreview();
}
function renderApartmentCardGenPreview(){
  const wrap=document.getElementById('apt-card-gen-preview');
  if(!wrap)return;
  if(!apartmentCardGenPreview||!apartmentCardGenPreview.length){wrap.innerHTML='';return;}
  wrap.innerHTML=`<div style="margin-top:10px;">
    ${apartmentCardGenPreview.map((card,i)=>`<div class="apt-building-row">
      <div style="font-size:13px;font-weight:700;">${i+1}번 카드 · 총 ${card.count}호</div>
      <div style="font-size:12px;color:var(--txm);">${card.points.map(p=>`${esc(p.complexName)} ${esc(p.dong)}(${p.units.length}호)${(p.lat==null||p.lng==null)?'<span style="color:var(--warn);font-weight:700;"> ⚠좌표없음</span>':''}`).join(', ')}</div>
    </div>`).join('')}
    ${apartmentCardGenPreview.some(card=>card.points.some(p=>p.lat==null||p.lng==null))?'<div style="font-size:11px;color:var(--warn);margin:6px 0;">⚠ 좌표가 없는 동이 포함되어 있습니다. 저장은 되지만 해당 지점은 지도 이동·카카오맵 길찾기가 동작하지 않을 수 있습니다. 관리자 화면에서 동 좌표를 먼저 등록하는 것을 권장합니다.</div>':''}
    <div style="font-size:12px;color:var(--txm);margin:8px 0;">총 ${apartmentCardGenPreview.length}개 카드 생성 예정</div>
    <div style="display:flex;gap:8px;">
      <button class="btn btn-sm btn-p" onclick="confirmApartmentCardGen()" style="flex:1;">확정 저장</button>
      <button class="btn btn-sm btn-out" onclick="cancelApartmentCardGenPreview()" style="flex:1;">취소</button>
    </div>
  </div>`;
}
function confirmApartmentCardGen(){
  if(!apartmentCardGenPreview||!apartmentCardGenPreview.length){toast('먼저 미리보기를 생성하세요.');return;}
  const createdCount=apartmentCardGenPreview.length;
  apartmentCardGenPreview.forEach(plan=>{
    const id=nextApartmentCardId();
    const baseName=plan.points[0]?.complexName||'아파트';
    const name=plan.points.length>1?`${baseName} 외 ${plan.points.length-1}곳`:baseName;
    S.apartmentCards.push({
      id,number:id,name,
      points:plan.points.map(p=>({complexId:p.complexId,complexName:p.complexName,dong:p.dong,lat:p.lat,lng:p.lng,units:p.units.map(ho=>({ho,completed:false,forbidden:false}))})),
      status:'미시작',
      createdAt:new Date().toISOString(),
    });
  });
  persistApartmentCards();
  apartmentCardGenPreview=null;
  renderApartmentCardGenPreview();
  renderApartmentCardList();
  renderHomeApartmentCardList(); // V2 H9: 홈 화면 카드 목록도 새로고침 없이 즉시 반영되도록
  toast(`${createdCount}개 카드 생성됨`);
}

// ================================================================
// V2 H63: 과거 실전에서 쓰인 KCC/부영/진덕 등 아파트 카드 데이터
// (KCC-부영6단지까지_실전.xlsx, 진덕에서주공4차2단지.xlsx) 일괄 등록.
// 데이터 자체는 apartment_import_h63_data.js(APARTMENT_IMPORT_H63_DATA,
// zones_seed.js와 동일한 "큰 정적 데이터는 별도 파일" 패턴)에서 가져오고,
// 여기서는 기존 레지스트리(addApartmentComplex/addApartmentBuilding과
// 동일한 데이터 구조)와 카드(confirmApartmentCardGen과 동일한 데이터
// 구조) 형식 그대로 등록만 한다. 기존 단지/카드는 이름이 같으면 재사용
// (중복 생성 안 함), 좌표는 비워둠(추후 H62 도구로 채움).
// ================================================================
function runApartmentImportH63(){
  if(S.role!=='admin')return;
  if(typeof APARTMENT_IMPORT_H63_DATA==='undefined'){toast('가져오기 데이터 파일(apartment_import_h63_data.js)이 로드되지 않았습니다.');return;}
  const data=APARTMENT_IMPORT_H63_DATA;
  if(storageGet('sokcho_h63_import_done')==='1'){
    if(!confirm('이미 이 기기에서 KCC/진덕 카드 일괄등록을 실행한 기록이 있습니다. 다시 실행하면 카드가 중복 생성될 수 있습니다. 정말 다시 실행하시겠습니까?'))return;
  }
  if(!confirm(`KCC/진덕 실전 카드 데이터를 등록합니다.\n- 단지/동 ${data.complexes.length}개\n- 카드 ${data.cards.length}개\n기존 단지/카드 데이터는 삭제하지 않고 그대로 두고 추가만 합니다(같은 이름 단지는 재사용). 진행할까요?`))return;
  exportBackup(); // 대규모 데이터 등록 전 자동 백업(구역번호 재정리 때와 동일한 안전 절차)

  // PART2: 단지/동/호수 레지스트리 등록
  let newComplexCount=0,newBuildingCount=0,newUnitCount=0;
  const complexIdByName={};
  data.complexes.forEach(cx=>{
    let complex=S.apartmentComplexes.find(c=>c.name===cx.name);
    if(!complex){
      complex={id:nextApartmentComplexId(),name:cx.name,buildings:[]};
      S.apartmentComplexes.push(complex);
      newComplexCount++;
    }
    complexIdByName[cx.name]=complex.id;
    cx.buildings.forEach(b=>{
      let building=complex.buildings.find(bb=>bb.dong===b.dong);
      if(!building){
        building={dong:b.dong,units:[]};
        complex.buildings.push(building);
        newBuildingCount++;
      }
      const existingUnits=new Set(building.units);
      b.units.forEach(u=>{if(!existingUnits.has(u)){building.units.push(u);existingUnits.add(u);newUnitCount++;}});
    });
    sortApartmentBuildingsInPlace(complex);
  });
  persistApartmentRegistry();

  // PART3: 카드 생성 (카드번호는 새로 순번 부여, 이름에 원본 참조 남김)
  let newCardCount=0;
  data.cards.forEach(card=>{
    const points=card.buildings.map(b=>({
      complexId:complexIdByName[b.complex],
      complexName:b.complex,
      dong:b.dong,
      lat:null,lng:null,
      units:b.units.map(ho=>({ho,completed:false,forbidden:false})),
    }));
    // 진덕(홀수/짝수)은 시트 이름 자체를 카드이름으로(예: "진덕홀수 (구#1)"),
    // KCC는 기존 카드생성과 같은 방식으로 첫 지점 단지명+"외 N곳"(예: "KCC 외 4곳 (구#350)")
    let nameCore;
    if(card.source==='KCC'){
      const baseName=points[0]?.complexName||'아파트';
      nameCore=points.length>1?`${baseName} 외 ${points.length-1}곳`:baseName;
    }else{
      nameCore=card.source;
    }
    const name=`${nameCore} (${card.ref})`;
    const id=nextApartmentCardId();
    S.apartmentCards.push({id,number:id,name,points,status:'미시작',createdAt:new Date().toISOString()});
    newCardCount++;
  });
  persistApartmentCards();
  storageSet('sokcho_h63_import_done','1');

  renderApartmentComplexList();
  renderApartmentCardList();
  renderHomeApartmentCardList();
  toast(`가져오기 완료: 단지 ${newComplexCount}개 추가(총 ${S.apartmentComplexes.length}개), 동 ${newBuildingCount}개, 호수 ${newUnitCount}개, 카드 ${newCardCount}개 생성됨`);
}

// ================================================================
// V2 H10 PART1: 아파트 카드 수동 만들기. H3 PART3의 라운드로빈 자동생성을
// 대체하지 않고 별도 옵션으로 추가한다. 단지/동을 직접 체크하고, 체크된
// 동마다 개별적으로 홀수/짝수/전체 필터를 지정해 카드를 만든다.
// ================================================================
// V2 H11 PART1: 단지→동→층→호수 단위 카드 빌더. H10 PART1의 단순 UI를
// 대체한다. 동을 체크하는 대신, 동을 펼쳐 층별로 그룹핑된 개별 호수를
// 직접 체크한다(층 체크박스=일괄, 개별 호수=부분선택, 중간상태 지원).
// 각 동이 "처음 체크된" 순서가 그대로 카드의 point(봉사 루트) 순서가 된다.
let cardBuilderSel={}; // key `${complexId}:${bIdx}` -> {order:N, checkedUnits:Set<ho>} (체크된 호수가 0개면 키 자체가 사라짐 = 순서도 반납)
let cardBuilderOrderCounter=0;
let cardBuilderOpenComplex={}; // {complexId:true}
let cardBuilderOpenBuilding={}; // {`${complexId}:${bIdx}`:true}
let cardBuilderFilterMode={}; // {`${complexId}:${bIdx}`:'all'|'odd'|'even'}, 선택 여부와 무관하게 유지
function unitFloorOf(ho){
  const n=unitNumber(ho);
  return n==null?null:Math.floor(n/100);
}
function groupApartmentUnitsByFloor(units){
  const groups={};
  units.forEach(ho=>{
    const f=unitFloorOf(ho);
    const key=f==null?'?':String(f);
    if(!groups[key])groups[key]=[];
    groups[key].push(ho);
  });
  return Object.keys(groups).sort((a,b)=>{
    if(a==='?')return 1;
    if(b==='?')return -1;
    return Number(a)-Number(b);
  }).map(key=>({floor:key==='?'?null:Number(key),units:groups[key]}));
}
function toggleCardBuilderComplex(complexId){
  cardBuilderOpenComplex[complexId]=!cardBuilderOpenComplex[complexId];
  renderCardBuilder();
}
function toggleAllCardBuilderComplexes(){
  const allOpen=S.apartmentComplexes.length>0&&S.apartmentComplexes.every(c=>cardBuilderOpenComplex[c.id]);
  cardBuilderOpenComplex=allOpen?{}:Object.fromEntries(S.apartmentComplexes.map(c=>[c.id,true]));
  renderCardBuilder();
}
function toggleCardBuilderBuilding(complexId,bIdx){
  const key=complexId+':'+bIdx;
  cardBuilderOpenBuilding[key]=!cardBuilderOpenBuilding[key];
  renderCardBuilder();
}
function setCardBuilderFilter(complexId,bIdx,mode){
  cardBuilderFilterMode[complexId+':'+bIdx]=mode;
  renderCardBuilder();
}
function toggleCardBuilderUnit(complexId,bIdx,ho){
  const key=complexId+':'+bIdx;
  let entry=cardBuilderSel[key];
  if(!entry){cardBuilderOrderCounter++;entry=cardBuilderSel[key]={order:cardBuilderOrderCounter,checkedUnits:new Set()};}
  if(entry.checkedUnits.has(ho))entry.checkedUnits.delete(ho);
  else entry.checkedUnits.add(ho);
  if(entry.checkedUnits.size===0)delete cardBuilderSel[key];
  renderCardBuilder();
}
function toggleCardBuilderFloor(complexId,bIdx,floor){
  const c=S.apartmentComplexes.find(c=>c.id===complexId);
  const b=c&&c.buildings[bIdx];
  if(!b)return;
  const key=complexId+':'+bIdx;
  const mode=cardBuilderFilterMode[key]||'all';
  const floorUnits=filterUnitsByMode(b.units,mode).filter(ho=>unitFloorOf(ho)===floor);
  if(!floorUnits.length)return;
  let entry=cardBuilderSel[key];
  const allChecked=!!entry&&floorUnits.every(ho=>entry.checkedUnits.has(ho));
  if(allChecked){
    floorUnits.forEach(ho=>entry.checkedUnits.delete(ho));
    if(entry.checkedUnits.size===0)delete cardBuilderSel[key];
  }else{
    if(!entry){cardBuilderOrderCounter++;entry=cardBuilderSel[key]={order:cardBuilderOrderCounter,checkedUnits:new Set()};}
    floorUnits.forEach(ho=>entry.checkedUnits.add(ho));
  }
  renderCardBuilder();
}
// V2 H12: 층 번호의 홀짝(개별 호수 홀짝과는 별개)으로 층 체크박스를 일괄
// on/off. 새 선택 로직을 만들지 않고, 목표 상태와 다른 층에 한해 기존
// toggleCardBuilderFloor(H11 PART1)를 그대로 호출하는 방식으로 구현한다.
function quickSelectCardBuilderFloors(complexId,bIdx,parityMode){
  const c=S.apartmentComplexes.find(c=>c.id===complexId);
  const b=c&&c.buildings[bIdx];
  if(!b)return;
  const key=complexId+':'+bIdx;
  const mode=cardBuilderFilterMode[key]||'all';
  const floorGroups=groupApartmentUnitsByFloor(filterUnitsByMode(b.units,mode));
  floorGroups.forEach(g=>{
    const shouldBeOn=parityMode==='all'?true:(g.floor!=null&&(parityMode==='odd'?g.floor%2===1:g.floor%2===0));
    const entry=cardBuilderSel[key];
    const isCurrentlyAllOn=!!entry&&g.units.every(ho=>entry.checkedUnits.has(ho));
    if(shouldBeOn!==isCurrentlyAllOn)toggleCardBuilderFloor(complexId,bIdx,g.floor);
  });
}
function cardBuilderSelectedPoints(){
  return Object.keys(cardBuilderSel).map(key=>{
    const sep=key.indexOf(':');
    const complexId=Number(key.slice(0,sep)),bIdx=Number(key.slice(sep+1));
    const complex=S.apartmentComplexes.find(c=>c.id===complexId);
    const building=complex&&complex.buildings[bIdx];
    if(!complex||!building)return null;
    const entry=cardBuilderSel[key];
    const hasCoord=hasApartmentBuildingCoord(building);
    // 등록된 원래 순서 그대로(체크한 클릭 순서가 아니라 동 안의 호수 순서) 표시
    const units=building.units.filter(ho=>entry.checkedUnits.has(ho));
    return{complexId,complexName:complex.name,dong:building.dong,order:entry.order,lat:hasCoord?building.lat:null,lng:hasCoord?building.lng:null,units};
  }).filter(Boolean).sort((a,b)=>a.order-b.order);
}
function renderCardBuilder(){
  const wrap=document.getElementById('apt-cardbuilder-complexes');
  if(wrap){
    const allOpen=S.apartmentComplexes.length>0&&S.apartmentComplexes.every(c=>cardBuilderOpenComplex[c.id]);
    const toggleAllBtn=S.apartmentComplexes.length?`<div style="margin-bottom:8px;"><button class="btn btn-sm btn-out" onclick="toggleAllCardBuilderComplexes()">${allOpen?'전체 접기':'전체 펼치기'}</button></div>`:'';
    wrap.innerHTML=toggleAllBtn+(S.apartmentComplexes.length?S.apartmentComplexes.map(c=>{
      const open=!!cardBuilderOpenComplex[c.id];
      return `<div class="apt-gen-complex-row">
        <div class="apt-check-row" style="cursor:pointer;font-weight:700;" onclick="toggleCardBuilderComplex(${c.id})">
          <span>${open?'▾':'▸'} ${esc(c.name)} <span style="color:var(--txm);font-weight:400;">(${c.buildings.length}개 동)</span></span>
        </div>
        ${open?c.buildings.map((b,bIdx)=>{
          const key=c.id+':'+bIdx;
          const bOpen=!!cardBuilderOpenBuilding[key];
          const mode=cardBuilderFilterMode[key]||'all';
          const sel=cardBuilderSel[key];
          const selCount=sel?sel.checkedUnits.size:0;
          const filtered=bOpen?filterUnitsByMode(b.units,mode):[];
          const floorGroups=bOpen?groupApartmentUnitsByFloor(filtered):[];
          return `<div class="apt-building-row">
            <div class="apt-building-head" style="cursor:pointer;" onclick="toggleCardBuilderBuilding(${c.id},${bIdx})">
              <div style="font-size:13px;font-weight:700;">${bOpen?'▾':'▸'} ${esc(b.dong)} <span style="font-weight:400;color:var(--txm);">${b.units.length}호${selCount?` · ${selCount}호 선택됨`:''}</span></div>
            </div>
            ${bOpen?`<div style="padding:4px 0 4px 10px;">
              <div style="display:flex;gap:6px;margin-bottom:8px;">
                <button class="btn btn-sm ${mode==='all'?'btn-p':'btn-out'}" onclick="event.stopPropagation();setCardBuilderFilter(${c.id},${bIdx},'all')">전체</button>
                <button class="btn btn-sm ${mode==='odd'?'btn-p':'btn-out'}" onclick="event.stopPropagation();setCardBuilderFilter(${c.id},${bIdx},'odd')">홀수만</button>
                <button class="btn btn-sm ${mode==='even'?'btn-p':'btn-out'}" onclick="event.stopPropagation();setCardBuilderFilter(${c.id},${bIdx},'even')">짝수만</button>
              </div>
              <div style="font-size:11px;color:var(--txm);margin:-2px 0 4px;">층 단위 일괄 선택(층 번호 기준):</div>
              <div style="display:flex;gap:6px;margin-bottom:8px;">
                <button class="btn btn-sm btn-out" onclick="event.stopPropagation();quickSelectCardBuilderFloors(${c.id},${bIdx},'odd')">홀수층만</button>
                <button class="btn btn-sm btn-out" onclick="event.stopPropagation();quickSelectCardBuilderFloors(${c.id},${bIdx},'even')">짝수층만</button>
                <button class="btn btn-sm btn-out" onclick="event.stopPropagation();quickSelectCardBuilderFloors(${c.id},${bIdx},'all')">전체층</button>
              </div>
              ${floorGroups.map(g=>{
                const floorLabel=g.floor==null?'기타 호수':`${g.floor}층`;
                const checkedInFloor=g.units.filter(ho=>sel&&sel.checkedUnits.has(ho));
                const allChecked=checkedInFloor.length===g.units.length;
                const partial=checkedInFloor.length>0&&!allChecked;
                return `<div class="apt-check-row" style="align-items:center;gap:8px;">
                  <input type="checkbox" ${allChecked?'checked':''} ${partial?'data-indeterminate="1"':''} onclick="event.stopPropagation();toggleCardBuilderFloor(${c.id},${bIdx},${g.floor==null?'null':g.floor})">
                  <span style="font-weight:700;">${floorLabel}</span>
                  <span style="color:var(--txm);font-size:12px;">(${checkedInFloor.length}/${g.units.length})</span>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;margin:2px 0 10px 26px;">
                  ${g.units.map(ho=>{
                    const isChecked=!!sel&&sel.checkedUnits.has(ho);
                    return `<label class="apt-unit-chip" style="cursor:pointer;opacity:${isChecked?'.45':'1'};font-weight:${isChecked?'400':'700'};">
                      <input type="checkbox" ${isChecked?'checked':''} onclick="event.stopPropagation();toggleCardBuilderUnit(${c.id},${bIdx},'${jsq(ho)}')" style="margin-right:4px;">${esc(ho)}
                    </label>`;
                  }).join('')}
                </div>`;
              }).join('')}
            </div>`:''}
          </div>`;
        }).join(''):''}
      </div>`;
    }).join(''):'<div style="font-size:12px;color:var(--txm);padding:8px 0;">먼저 단지를 등록하세요.</div>');
    wrap.querySelectorAll('[data-indeterminate="1"]').forEach(el=>{el.indeterminate=true;});
  }
  renderCardBuilderPreview();
}
function renderCardBuilderPreview(){
  const wrap=document.getElementById('apt-cardbuilder-preview');
  const btn=document.getElementById('apt-cardbuilder-create-btn');
  if(!wrap)return;
  const points=cardBuilderSelectedPoints();
  if(!points.length){
    wrap.innerHTML='<div style="font-size:12px;color:var(--txm);padding:6px 0;">아직 선택된 호수가 없습니다.</div>';
  }else{
    const totalUnits=points.reduce((s,p)=>s+p.units.length,0);
    wrap.innerHTML=`<div style="font-size:12px;color:var(--txm);margin:4px 0;">지점 ${points.length}개 · 총 ${totalUnits}호 (진행 순서대로)</div>`+
      points.map((p,i)=>`<div class="apt-building-row">
        <div style="font-size:13px;font-weight:700;">${i+1}. ${esc(p.complexName)} ${esc(p.dong)} <span style="font-weight:400;color:var(--txm);">${p.units.length}호${(p.lat==null||p.lng==null)?' <span style="color:var(--warn);">⚠좌표없음</span>':''}</span></div>
        <div style="font-size:12px;color:var(--txm);">${p.units.map(u=>esc(u)).join(', ')}</div>
      </div>`).join('');
  }
  if(btn)btn.disabled=points.length===0;
}
function createCardBuilderCard(){
  const points=cardBuilderSelectedPoints();
  if(!points.length){toast('호수를 하나 이상 선택하세요.');return;}
  const numInp=document.getElementById('apt-cardbuilder-number');
  const nameInp=document.getElementById('apt-cardbuilder-name');
  const typedNumber=parseInt(numInp?.value,10);
  const id=nextApartmentCardId();
  const number=Number.isFinite(typedNumber)?typedNumber:id;
  const typedName=(nameInp?.value||'').trim();
  const baseName=points[0].complexName;
  const name=typedName||(points.length>1?`${baseName} 외 ${points.length-1}곳(수동)`:`${baseName}(수동)`);
  S.apartmentCards.push({
    id,number,name,
    points:points.map(p=>({complexId:p.complexId,complexName:p.complexName,dong:p.dong,lat:p.lat,lng:p.lng,units:p.units.map(ho=>({ho,completed:false,forbidden:false}))})),
    status:'미시작',
    createdAt:new Date().toISOString(),
  });
  persistApartmentCards();
  cardBuilderSel={};
  cardBuilderOrderCounter=0;
  if(numInp)numInp.value='';
  if(nameInp)nameInp.value='';
  renderCardBuilder();
  renderApartmentCardList();
  renderHomeApartmentCardList();
  toast(`"${name}" 카드 생성됨`);
}

// ================================================================
// V2 H10 PART2: 카드의 전체 point를 전체지도(main-map)에 순서대로 표시하고
// line으로 연결. 기존 주택 경로선 UX(L.polyline + addRouteArrowMarkers,
// 파란색 route 색상)를 그대로 재사용하고 새 스타일을 만들지 않는다.
// ================================================================
let cardLineLayers=[];
function clearApartmentCardLine(){
  if(S.mainMap)cardLineLayers.forEach(l=>S.mainMap.removeLayer(l));
  cardLineLayers=[];
}
function showApartmentCardLine(cardId){
  const card=S.apartmentCards.find(c=>c.id===cardId);
  if(!card){toast('카드를 먼저 선택하세요.');return;}
  const pts=card.points.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)).map(p=>[p.lat,p.lng]);
  if(!pts.length){toast('이 카드에는 좌표가 등록된 지점이 없습니다. 관리자 화면에서 동 좌표를 먼저 등록하세요.');return;}
  goTab('map');
  setTimeout(()=>{
    if(!S.mainMap)return;
    clearApartmentCardLine();
    pts.forEach((p,i)=>{
      const icon=L.divIcon({
        html:`<div style="width:24px;height:24px;border-radius:50%;background:#378ADD;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3);">${i+1}</div>`,
        className:'',iconAnchor:[12,12]
      });
      cardLineLayers.push(L.marker(p,{icon,zIndexOffset:730}).addTo(S.mainMap));
    });
    if(pts.length>=2){
      cardLineLayers.push(L.polyline(pts,{color:'#378ADD',weight:4,opacity:.88}).addTo(S.mainMap));
      cardLineLayers.push(...addRouteArrowMarkers(S.mainMap,pts,'#378ADD',720));
    }
    fitMapBounds(S.mainMap,L.latLngBounds(pts),{padding:[52,52],maxZoom:18});
    toast(`"${card.name}" 카드의 ${pts.length}개 지점을 지도에 표시했습니다.`);
  },350);
}
let apartmentCardOpenId=null;
function toggleApartmentCardOpen(id){
  apartmentCardOpenId=apartmentCardOpenId===id?null:id;
  renderApartmentCardList();
}
function renameApartmentCard(cardId){
  const card=S.apartmentCards.find(c=>c.id===cardId);
  if(!card)return;
  const inp=document.getElementById('apt-card-name-'+cardId);
  const name=(inp?.value||'').trim();
  if(!name){toast('카드 이름을 입력하세요.');return;}
  card.name=name;
  persistApartmentCards();
  renderApartmentCardList(cardId);
  toast('카드 이름 저장됨');
}
function deleteApartmentCard(cardId){
  const card=S.apartmentCards.find(c=>c.id===cardId);
  if(!card)return;
  if(!confirm(`"${card.name}" 카드를 삭제하시겠습니까?`))return;
  S.apartmentCards=S.apartmentCards.filter(c=>c.id!==cardId);
  addDeletedApartmentCardId(cardId); // V2 H14: 영구 제외 목록에 기록(어떤 저장 경로로도 재발 방지)
  persistApartmentCards();
  if(apartmentCardOpenId===cardId)apartmentCardOpenId=null;
  renderApartmentCardList();
  toast('카드 삭제됨');
}
function moveApartmentCardPoint(cardId,pIdx,dir){
  const card=S.apartmentCards.find(c=>c.id===cardId);
  if(!card)return;
  const newIdx=pIdx+dir;
  if(newIdx<0||newIdx>=card.points.length)return;
  const [pt]=card.points.splice(pIdx,1);
  card.points.splice(newIdx,0,pt);
  persistApartmentCards();
  renderApartmentCardList(cardId);
}
function deleteApartmentCardPoint(cardId,pIdx){
  const card=S.apartmentCards.find(c=>c.id===cardId);
  if(!card||!card.points[pIdx])return;
  if(!confirm(`"${card.points[pIdx].complexName} ${card.points[pIdx].dong}" 지점을 삭제하시겠습니까?`))return;
  card.points.splice(pIdx,1);
  persistApartmentCards();
  renderApartmentCardList(cardId);
  toast('지점 삭제됨');
}
function deleteApartmentCardPointUnit(cardId,pIdx,ho){
  const card=S.apartmentCards.find(c=>c.id===cardId);
  const pt=card&&card.points[pIdx];
  if(!pt)return;
  pt.units=pt.units.filter(u=>u.ho!==ho);
  persistApartmentCards();
  renderApartmentCardList(cardId);
}
function toggleApartmentCardPointUnitForbidden(cardId,pIdx,ho){
  const card=S.apartmentCards.find(c=>c.id===cardId);
  const pt=card&&card.points[pIdx];
  const u=pt&&pt.units.find(u=>u.ho===ho);
  if(!u)return;
  u.forbidden=!u.forbidden;
  persistApartmentCards();
  renderApartmentCardList(cardId);
}
function addApartmentCardPointUnitManual(cardId,pIdx){
  const card=S.apartmentCards.find(c=>c.id===cardId);
  const pt=card&&card.points[pIdx];
  if(!pt)return;
  const inp=document.getElementById(`apt-card-unit-manual-${cardId}-${pIdx}`);
  const ho=(inp?.value||'').trim();
  if(!ho){toast('호수를 입력하세요.');return;}
  if(pt.units.some(u=>u.ho===ho)){toast('이미 있는 호수입니다.');return;}
  pt.units.push({ho,completed:false,forbidden:false});
  persistApartmentCards();
  if(inp)inp.value='';
  renderApartmentCardList(cardId);
}
function apartmentCardPointAddOptions(){
  const opts=[];
  S.apartmentComplexes.forEach(c=>{
    c.buildings.forEach(b=>{
      if(!b.units.length)return;
      opts.push(`<option value="${c.id}::${esc(b.dong)}">${esc(c.name)} / ${esc(b.dong)}</option>`);
    });
  });
  return opts.length?opts.join(''):'<option value="">등록된 동이 없습니다</option>';
}
function addApartmentCardPoint(cardId){
  const card=S.apartmentCards.find(c=>c.id===cardId);
  if(!card)return;
  const sel=document.getElementById('apt-card-point-add-'+cardId);
  const val=sel?.value||'';
  const sep=val.indexOf('::');
  if(sep<0){toast('추가할 동을 선택하세요.');return;}
  const complexId=Number(val.slice(0,sep));
  const dong=val.slice(sep+2);
  const complex=S.apartmentComplexes.find(c=>c.id===complexId);
  const building=complex&&complex.buildings.find(b=>b.dong===dong);
  if(!building){toast('선택한 동을 찾을 수 없습니다.');return;}
  const filterSel=document.getElementById('apt-card-point-filter-'+cardId);
  const mode=filterSel?.value||'all';
  const units=filterUnitsByMode(building.units,mode);
  if(!units.length){toast('선택한 조건에 맞는 호수가 없습니다.');return;}
  const existing=card.points.find(p=>p.complexId===complexId&&p.dong===dong);
  if(existing){
    const have=new Set(existing.units.map(u=>u.ho));
    units.forEach(ho=>{if(!have.has(ho)){existing.units.push({ho,completed:false,forbidden:false});have.add(ho);}});
  }else{
    card.points.push({complexId,complexName:complex.name,dong,units:units.map(ho=>({ho,completed:false,forbidden:false}))});
  }
  persistApartmentCards();
  renderApartmentCardList(cardId);
  toast('지점 추가됨');
}
function renderApartmentCardList(keepOpenId){
  loadApartmentCards();
  if(keepOpenId!=null)apartmentCardOpenId=keepOpenId;
  const countEl=document.getElementById('adm-aptcards-count');
  if(countEl)countEl.textContent=S.apartmentCards.length;
  const wrap=document.getElementById('apt-card-list');
  if(!wrap)return;
  wrap.innerHTML=S.apartmentCards.length?S.apartmentCards.map(card=>{
    const totalUnits=card.points.reduce((s,p)=>s+p.units.length,0);
    const open=apartmentCardOpenId===card.id;
    return `<div class="apt-complex-row" id="apt-card-${card.id}">
      <div class="apt-complex-head" onclick="toggleApartmentCardOpen(${card.id})">
        <div style="min-width:0;">
          <div style="font-size:13px;font-weight:700;">#${card.number} ${esc(card.name)}</div>
          <div style="font-size:12px;color:var(--txm);display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <span>${card.points.length}개 지점 · 총 ${totalUnits}호</span>
            <span class="zc-status ${card.status==='완료'?'done':card.status==='미완료'||card.status==='진행중'?'progress':'reset'}">${esc(card.status)}</span>
          </div>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-sm btn-out" onclick="event.stopPropagation();showApartmentCardLine(${card.id})">라인 연결 보기</button>
          <button class="btn btn-sm btn-dk" onclick="event.stopPropagation();deleteApartmentCard(${card.id})">삭제</button>
        </div>
      </div>
      ${open?`<div class="apt-complex-body">
        <div class="add-row">
          <input type="text" id="apt-card-name-${card.id}" placeholder="카드 이름" value="${esc(card.name)}">
          <button class="btn btn-sm btn-p" onclick="renameApartmentCard(${card.id})">이름 저장</button>
        </div>
        ${card.points.map((p,pIdx)=>`<div class="apt-building-row">
          <div class="apt-building-head">
            <div style="font-size:13px;font-weight:700;">${pIdx+1}. ${esc(p.complexName)} ${esc(p.dong)} <span style="font-weight:400;color:var(--txm);">${p.units.length}호</span></div>
            <div style="display:flex;gap:4px;">
              <button class="btn btn-sm btn-out" onclick="moveApartmentCardPoint(${card.id},${pIdx},-1)" ${pIdx===0?'disabled':''}>▲</button>
              <button class="btn btn-sm btn-out" onclick="moveApartmentCardPoint(${card.id},${pIdx},1)" ${pIdx===card.points.length-1?'disabled':''}>▼</button>
              <button class="btn btn-sm btn-dk" onclick="deleteApartmentCardPoint(${card.id},${pIdx})">지점 삭제</button>
            </div>
          </div>
          <div class="add-row">
            <input type="text" id="apt-card-unit-manual-${card.id}-${pIdx}" placeholder="개별 호수 추가 (예: 201호)">
            <button class="btn btn-sm btn-p" onclick="addApartmentCardPointUnitManual(${card.id},${pIdx})">추가</button>
          </div>
          <div class="apt-unit-chips">
            ${p.units.map(u=>`<span class="apt-unit-chip${u.forbidden?' forbidden':''}">${esc(u.ho)}<button onclick="toggleApartmentCardPointUnitForbidden(${card.id},${pIdx},'${jsq(u.ho)}')">${u.forbidden?'해제':'금지'}</button><button onclick="deleteApartmentCardPointUnit(${card.id},${pIdx},'${jsq(u.ho)}')">✕</button></span>`).join('')}
          </div>
        </div>`).join('')}
        <div class="add-row">
          <select id="apt-card-point-add-${card.id}">${apartmentCardPointAddOptions()}</select>
          <select id="apt-card-point-filter-${card.id}"><option value="all">전체</option><option value="odd">홀수만</option><option value="even">짝수만</option></select>
          <button class="btn btn-sm btn-p" onclick="addApartmentCardPoint(${card.id})">지점 추가</button>
        </div>
      </div>`:''}
    </div>`;
  }).join(''):'<div style="font-size:12px;color:var(--txm);padding:8px 0;">생성된 카드가 없습니다.</div>';
}

// ================================================================
// 아파트 카드 봉사 흐름 (V2 STEP4/F4). 기존 주택구역 봉사 시작/이어하기/완료
// 패턴(startSession/openSvcFullscreen/svcChangeZone/svcTempLeave/
// completeSession/endSession)의 함수명·구조를 그대로 따르되, 완전히 별도의
// 상태(S.aptSession)와 완전히 별도의 화면(#apt-svc-fullscreen)을 사용한다.
// 기존 S.session/svc-fullscreen 관련 함수는 호출도 하지 않고 전혀 수정하지
// 않는다 (openExternalApp만 공용 유틸로 재사용).
// ================================================================
function apartmentCardTotalUnits(card){return card.points.reduce((s,p)=>s+p.units.length,0);}
function apartmentCardCompletedUnits(card){return card.points.reduce((s,p)=>s+p.units.filter(u=>u.completed).length,0);}
function apartmentCardCheckableUnits(card){return card.points.reduce((s,p)=>s+p.units.filter(u=>!u.forbidden).length,0);}
// H86: 기존 apartmentCardFirstPointCoord(card)를 임의 지점 index를
// 받는 형태로 일반화(호출부가 1곳뿐이라 별도 wrapper 없이 이름 자체를
// 변경). 좌표 조회 로직(포인트 자체 → H84가 추가한 동 레지스트리 →
// 단지)은 그대로, "어느 지점을 볼지"만 인자로 분리했다.
function apartmentCardPointCoord(card,idx){
  const pt=card&&card.points[idx];
  if(!pt)return null;
  // V2 H4: 동(building) 좌표 우선 사용. 동 좌표가 없는 구버전 카드는 단지 좌표로 하위호환.
  if(Number.isFinite(pt.lat)&&Number.isFinite(pt.lng)){
    return[pt.lat,pt.lng];
  }
  // H92: 값은 같아 보여도 타입이 다르면(문자열 "2" vs 숫자 2) ===는
  // 항상 false다. 저장 이력이 서로 다른 시점의 코드로 만들어진
  // 기기에서는 complex.id/point.complexId 중 어느 한쪽만 문자열로
  // 남아있을 수 있어, 여기서는 항상 String()으로 변환해 비교한다
  // (데이터 자체의 타입을 강제로 통일하지 않음 — 다른 20여 곳의
  // 관리자 화면 조회 코드는 지금까지 문제 보고가 없어 그대로 둠,
  // 이 함수만 타입에 안전하게).
  let complex=S.apartmentComplexes.find(c=>String(c.id)===String(pt.complexId));
  // H91: point.complexId가 (구버전 데이터 등의 이유로) 실제 레지스트리
  // id와 어긋나 있을 경우를 대비한 방어적 fallback — id로 못 찾으면
  // 카드가 이미 들고 있는 complexName으로 한 번 더 시도한다. 정상
  // 데이터에서는 이 fallback이 아예 실행되지 않는다(id로 바로 찾음).
  // 근본 수정(카드의 잘못된 complexId 자체를 고치는 것)은
  // repairApartmentCardComplexId()가 담당(runDeviceSyncAll에 연결).
  if(!complex&&pt.complexName){
    complex=S.apartmentComplexes.find(c=>c.name===pt.complexName);
  }
  // H84: H63으로 생성된 카드는 point.lat/lng가 항상 null이라 위 조건을
  // 절대 못 만족한다. H62/H80~82로 등록한 동(building) 좌표는
  // S.apartmentComplexes[].buildings[]에 저장되는데, 이 함수가 그
  // 레지스트리를 조회하는 단계 자체가 빠져있어서 등록된 좌표가 카드에
  // 전혀 연결되지 않았던 것이 원인(이름/키 불일치 문제 아님 —
  // complexId+dong 매칭은 정상 동작함, 조회 코드가 없었을 뿐).
  const building=complex&&complex.buildings.find(b=>b.dong===pt.dong);
  if(hasApartmentBuildingCoord(building)){
    return[building.lat,building.lng];
  }
  const complexCoordOk=hasApartmentComplexCoord(complex);
  return complexCoordOk?[complex.lat,complex.lng]:null;
}
function openApartmentCardKakaoStart(cardId){
  const card=S.apartmentCards.find(c=>c.id===cardId);
  if(!card){toast('카드를 먼저 선택하세요.');return;}
  // H86: 진행 중인 세션이 이 카드와 같으면(=진행화면에서 누른 경우)
  // 지금 보고 있는 지점(S.aptSession.currentPointIdx) 좌표로 안내한다.
  // 아직 시작 전 목록에서 누른 경우(DO_NOT_TOUCH 대상)는 기존과 동일하게
  // 항상 첫 지점(0)을 사용 — S.aptSession이 이 카드로 활성화되어 있지
  // 않으므로 아래 조건이 자연히 false가 되어 그대로 유지된다.
  const idx=(S.aptSession.active&&S.aptSession.cardId===cardId)?(S.aptSession.currentPointIdx||0):0;
  const pt=apartmentCardPointCoord(card,idx);
  if(!pt){
    toast('이 지점에 좌표가 없습니다. 관리자 화면에서 동(또는 단지) 좌표를 먼저 등록하세요.');return;
  }
  const appUrl=`kakaomap://route?sp=&ep=${pt[0]},${pt[1]}&by=FOOT`; // V2 H24: 공식 딥링크 형식(sp= 명시)
  const webUrl=`https://map.kakao.com/link/map/${pt[0]},${pt[1]}`;
  openExternalApp(appUrl,webUrl,'카카오맵');
}

// ---- PART 1: 홈 화면 카드 목록 / 선택 / 지도 이동 ----
let homeAptFilter='all';
function toggleHomeApartmentSection(){
  const body=document.getElementById('home-apt-body');
  const icon=document.getElementById('home-apt-toggle-icon');
  if(!body)return;
  const willShow=body.classList.contains('hide');
  body.classList.toggle('hide',!willShow);
  if(icon)icon.textContent=willShow?'▾':'▸';
  if(willShow)renderHomeApartmentCardList();
}
function setHomeAptFilter(mode,el){
  homeAptFilter=mode;
  document.querySelectorAll('#home-apt-section .chip').forEach(c=>c.classList.remove('on'));
  if(el)el.classList.add('on');
  renderHomeApartmentCardList();
}
function markSelectedApartmentCardRow(id){
  document.querySelectorAll('.home-apt-card-row.selected').forEach(el=>el.classList.remove('selected'));
  const el=document.getElementById('home-apt-card-item-'+id);
  if(el)el.classList.add('selected');
}
// V2 K2: 아파트 카드는 경계 Polygon이 없는 "진행 루트형" 구역카드라, 주택/상가처럼
// 폴리곤을 강조하는 대신 카드를 누르면 다른 구역은 전부 비활성화(흐리게)하고
// 지도에는 카드의 지점들을 순서대로 잇는 굵은 경로선 + 번호 마커만 표시한다.
// 스타일은 기존 showApartmentCardLine(main-map용, H10)과 완전히 동일하게 재사용.
const HOME_APT_ROUTE_ACTIVE='__apt_card_route__'; // 실제 zone id와 절대 겹치지 않는 sentinel
function selectHomeApartmentCard(cardId){
  S.homeSelectedAptCard=cardId;
  S.homeSelectedZone=null; // 구역 강조 상태와 상호 배타적으로 유지
  markSelectedCards(null); // 구역 목록에 남아있을 수 있는 잔여 강조 제거
  markSelectedApartmentCardRow(cardId);
  const card=S.apartmentCards.find(c=>c.id===cardId);
  drawHomeZones(HOME_APT_ROUTE_ACTIVE); // 모든 구역 Polygon을 비활성화(흐리게) 처리
  if(card){
    const pts=card.points.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)).map(p=>[p.lat,p.lng]);
    if(!pts.length){
      toast('이 카드에는 좌표가 등록된 지점이 없어 지도에 경로를 표시하지 못했습니다.');
    }else{
      pts.forEach((p,i)=>{
        const icon=L.divIcon({
          html:`<div style="width:24px;height:24px;border-radius:50%;background:#378ADD;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3);">${i+1}</div>`,
          className:'',iconAnchor:[12,12]
        });
        homeMapLayers.push(L.marker(p,{icon,zIndexOffset:730}).addTo(homeMapInst));
      });
      if(pts.length>=2){
        homeMapLayers.push(L.polyline(pts,{color:'#378ADD',weight:4,opacity:.88}).addTo(homeMapInst));
        homeMapLayers.push(...addRouteArrowMarkers(homeMapInst,pts,'#378ADD',720));
      }
      if(homeMapInst)fitMapBounds(homeMapInst,L.latLngBounds(pts),{padding:[52,52],maxZoom:18});
    }
  }
  const el=document.getElementById('home-apt-card-item-'+cardId);
  if(el)el.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function renderHomeApartmentCardList(){
  loadApartmentCards();
  const wrap=document.getElementById('home-apt-card-list');
  if(!wrap)return;
  const countEl=document.getElementById('home-apt-count');
  if(countEl)countEl.textContent=S.apartmentCards.length;
  // V2 H67: 미완료(진행중/미완료 포함) 우선, 완료는 뒤로(구역/상가와 동일 규칙)
  let cards=[...S.apartmentCards].sort((a,b)=>(a.status==='완료'?1:0)-(b.status==='완료'?1:0)||(Number(a.number)||0)-(Number(b.number)||0)||a.name.localeCompare(b.name,'ko',{numeric:true}));
  cards=cards.filter(c=>homeAptFilter==='all'||(homeAptFilter==='undone'&&c.status!=='완료')||(homeAptFilter==='done'&&c.status==='완료'));
  if(!cards.length){
    wrap.innerHTML='<p style="font-size:13px;color:var(--txm);text-align:center;padding:14px 0;">아파트 카드가 없습니다.</p>';
    return;
  }
  wrap.innerHTML=cards.map(card=>{
    const done=card.status==='완료';
    const inProg=card.status==='진행중'||card.status==='미완료';
    const total=apartmentCardCheckableUnits(card);
    const doneCnt=apartmentCardCompletedUnits(card);
    const selected=S.homeSelectedAptCard===card.id;
    const action=done
      ?`<span class="home-zone-action" style="font-size:12px;color:#3B6D11;font-weight:800;">완료 잠김</span>`
      :inProg
        ?`<button onclick="event.stopPropagation();startApartmentCardAndGo(${card.id},true)" class="btn btn-sm home-zone-action" style="background:#FAEEDA;color:var(--warn);border:1px solid #FAC775;">이어하기</button>`
        :`<button onclick="event.stopPropagation();startApartmentCardAndGo(${card.id},false)" class="btn btn-sm btn-p home-zone-action">봉사 시작</button>`;
    return `<div id="home-apt-card-item-${card.id}" class="home-zone-row home-apt-card-row ${selected?'selected':''}" onclick="selectHomeApartmentCard(${card.id})">
      <div style="min-width:0;">
        <div class="home-zone-title"><span>#${card.number} </span>${esc(card.name)}</div>
        <div class="home-zone-meta">${card.points.length}개 지점 · ${doneCnt}/${total}호</div>
      </div>
      <span class="zc-status ${done?'done':inProg?'progress':'reset'}">${esc(card.status)}</span>
      <button class="btn btn-sm btn-out home-zone-action" onclick="event.stopPropagation();openApartmentCardKakaoStart(${card.id})" style="flex-shrink:0;">카카오맵</button>
      ${action}
    </div>`;
  }).join('');
}

// ---- PART 2: 봉사시작 → 체크리스트 → 이어하기/구역변경/잠시나가기/완료 ----
function startAptSvcSession(cardId,resume){
  const card=S.apartmentCards.find(c=>c.id===cardId);
  if(!card)return;
  if(card.status==='완료'){toast('완료된 카드입니다. 관리자가 초기화해야 다시 시작할 수 있습니다.');return;}
  if(!card.assignedPublisher){
    card.assignedPublisher=S.user;
    card.assignedAt=Date.now();
  }
  card.status='진행중';
  S.aptSession.active=true;
  S.aptSession.cardId=cardId;
  S.aptSession.startTime=Date.now();
  recordS13AssignmentStart(s13TerritoryIdForAptCard(cardId),'apartment',card.number,S.user,S.aptSession.startTime); // V2 J1: S-13 배정 기록
  persistApartmentCards();
}
function startApartmentCardAndGo(cardId,resume){
  startAptSvcSession(cardId,resume);
  openAptSvcFullscreen(cardId);
}
let aptSvcTimerInterval=null;
function startAptSvcTimer(){
  if(aptSvcTimerInterval)clearInterval(aptSvcTimerInterval);
  aptSvcTimerInterval=setInterval(()=>{
    if(!S.aptSession.active)return;
    const elapsed=Math.floor((Date.now()-S.aptSession.startTime)/1000);
    const m=String(Math.floor(elapsed/60)).padStart(2,'0');
    const s=String(elapsed%60).padStart(2,'0');
    const el=document.getElementById('apt-svc-timer');
    if(el)el.textContent=`${m}:${s}`;
  },1000);
}
function scrollToAptSvcLastChecked(){
  const card=S.apartmentCards.find(c=>c.id===S.aptSession.cardId);
  if(!card||card.lastCheckedPoint==null||card.lastCheckedUnit==null)return;
  const el=document.getElementById(`apt-svc-unit-${card.lastCheckedPoint}-${card.lastCheckedUnit}`);
  if(el)el.scrollIntoView({behavior:'smooth',block:'center'});
}
// V2 H11 PART2: 진행화면을 "현재 지점 1개 중심"으로 확장. 지점 이동은
// 완료 여부와 무관하게 언제든 가능(미완료 지점은 상태 유지된 채 나중에
// 다시 방문 가능), 층별 그룹핑은 PART1의 groupApartmentUnitsByFloor를
// 그대로 재사용한다.
function initAptSvcCurrentPointIdx(card){
  // V2 H65: "오늘봉사 여기까지" 마커가 있으면 그 지점을 최우선으로 연다
  // (스크롤 대상 층이 화면에 렌더링되어 있어야 자동이동이 가능하므로).
  // 마커가 없으면 기존 lastCheckedPoint 로직 그대로.
  if(card.lastWorkedPoint!=null&&card.points[card.lastWorkedPoint])return card.lastWorkedPoint;
  if(card.lastCheckedPoint!=null&&card.points[card.lastCheckedPoint])return card.lastCheckedPoint;
  const firstIncomplete=card.points.findIndex(p=>{
    const checkable=p.units.filter(u=>!u.forbidden);
    return checkable.length===0||!checkable.every(u=>u.completed);
  });
  return firstIncomplete===-1?0:firstIncomplete;
}
function openAptSvcFullscreen(cardId){
  const card=S.apartmentCards.find(c=>c.id===cardId);
  const fs=document.getElementById('apt-svc-fullscreen');
  if(!card||!fs)return;
  fs.style.display='flex';
  const nameEl=document.getElementById('apt-svc-card-name');
  if(nameEl)nameEl.textContent=card.name;
  const assignee=document.getElementById('apt-svc-assignee');
  if(assignee)assignee.textContent=card.assignedPublisher?`담당: ${card.assignedPublisher}`:'';
  S.aptSession.currentPointIdx=initAptSvcCurrentPointIdx(card);
  renderAptSvcChecklist();
  startAptSvcTimer();
  scrollToAptSvcWorkMarker();
}
function closeAptSvcFullscreen(){
  const fs=document.getElementById('apt-svc-fullscreen');
  if(fs)fs.style.display='none';
  if(aptSvcTimerInterval){clearInterval(aptSvcTimerInterval);aptSvcTimerInterval=null;}
}
function goToAptSvcPoint(pIdx){
  const card=S.apartmentCards.find(c=>c.id===S.aptSession.cardId);
  if(!card||!card.points[pIdx])return;
  S.aptSession.currentPointIdx=pIdx;
  renderAptSvcChecklist();
}
function goToNextAptSvcPoint(){
  const card=S.apartmentCards.find(c=>c.id===S.aptSession.cardId);
  if(!card)return;
  const cur=S.aptSession.currentPointIdx||0;
  if(cur+1<card.points.length){
    S.aptSession.currentPointIdx=cur+1;
    renderAptSvcChecklist();
  }else{
    toast('마지막 지점입니다.');
  }
}
function openAptCardPointMapView(lat,lng){
  if(!Number.isFinite(lat)||!Number.isFinite(lng)){toast('다음 지점의 좌표가 없습니다.');return;}
  // H117: 예전엔 url/fallbackUrl을 똑같은 웹 링크로 넘겨서 openExternalApp()이
  // 그걸 "앱 딥링크"로 취급해 a.click()+target='_self'로 지금 보고 있는
  // 속초맵 앱 화면 자체를 카카오맵 웹페이지로 통째로 이동시켜버렸다(안드로이드에서
  // "카카오맵 연결이 항상 실패한다"고 느껴진 원인 — 실제로는 실패가 아니라
  // 앱 화면이 사라지고 카카오 웹사이트로 넘어가버린 것). 바로 아래
  // openAptCardPointNavi()(카카오네비 연결, 정상 동작)와 달리 이 버튼은
  // 애초에 네이티브 앱을 열려는 의도가 아니라 "새 탭에서 위치만 잠깐
  // 확인"하는 용도이므로, openExternalApp()을 거치지 않고 새 탭으로만 연다.
  const url=`https://map.kakao.com/link/map/${lat},${lng}`;
  try{window.open(url,'_blank','noopener');}catch(e){}
  toast('카카오맵으로 위치를 확인합니다.');
}
function openAptCardPointNavi(lat,lng){
  if(!Number.isFinite(lat)||!Number.isFinite(lng)){toast('다음 지점의 좌표가 없습니다.');return;}
  openExternalApp(`kakaomap://route?sp=&ep=${lat},${lng}&by=FOOT`,`https://map.kakao.com/link/map/${lat},${lng}`,'카카오맵'); // V2 H24: 공식 딥링크 형식(sp= 명시)
}
function renderAptSvcChecklist(){
  const card=S.apartmentCards.find(c=>c.id===S.aptSession.cardId);
  const wrap=document.getElementById('apt-svc-checklist');
  if(!wrap||!card)return;
  if(S.aptSession.currentPointIdx==null||!card.points[S.aptSession.currentPointIdx]){
    S.aptSession.currentPointIdx=initAptSvcCurrentPointIdx(card);
  }
  const pIdx=S.aptSession.currentPointIdx;
  const p=card.points[pIdx];
  if(!p){wrap.innerHTML='';return;}
  const checkableUnits=p.units.filter(u=>!u.forbidden);
  const doneCnt=checkableUnits.filter(u=>u.completed).length;
  const allDone=checkableUnits.length>0&&doneCnt===checkableUnits.length;
  const nextPt=card.points[pIdx+1];
  // H118: nextPt는 카드 자체가 들고 있는 "원본" point 객체라 pt.lat/pt.lng는
  // H63으로 만들어진 카드에서 항상 null이다(H86 조사 당시와 동일한 이유 —
  // 실제 좌표는 동/단지 레지스트리에서 apartmentCardPointCoord()로 조회해야
  // 나온다). 아래 배너가 nextPt.lat/nextPt.lng를 직접 읽어서 매 지점마다
  // 예외 없이 "좌표가 없습니다"가 떴던 것이 원인 — nextCoord로 실제 좌표를
  // 조회해서 그 값을 버튼에 넘긴다.
  const nextCoord=nextPt?apartmentCardPointCoord(card,pIdx+1):null;

  const pointNav=`<div class="apt-svc-point-nav">
    ${card.points.map((pp,i)=>{
      const ppCheckable=pp.units.filter(u=>!u.forbidden);
      const ppDone=ppCheckable.length>0&&ppCheckable.every(u=>u.completed);
      return `<button class="apt-svc-point-nav-btn${i===pIdx?' active':''}${ppDone?' done':''}" onclick="goToAptSvcPoint(${i})">${i+1}</button>`;
    }).join('')}
  </div>`;

  const floorGroups=groupApartmentUnitsByFloor(p.units.map(u=>u.ho));
  const unitByHo={};
  p.units.forEach((u,uIdx)=>{unitByHo[u.ho]={u,uIdx};});

  const checklistHtml=`<div class="apt-svc-point-card">
    <div class="apt-svc-point-head">${pIdx+1}/${card.points.length}. ${esc(p.complexName)} ${esc(p.dong)} <span style="font-weight:400;color:var(--txm);">${doneCnt}/${checkableUnits.length}</span></div>
    ${floorGroups.map(g=>{
      const isWorkMarker=card.lastWorkedPoint===pIdx&&card.lastWorkedFloor===g.floor;
      // V2 H67: 개별 호수마다 있던 체크박스를 층별 체크박스 하나로 통합.
      // 체크하면 그 층의 체크가능(금지 아닌) 호수 전부가 한번에 완료/미완료로
      // 토글된다(개별 호수 완료 여부 자체는 여전히 unit.completed로 저장 —
      // 완료 집계 로직인 apartmentCardCheckableUnits/CompletedUnits는 무수정).
      const floorEntries=g.units.map(ho=>unitByHo[ho]).filter(e=>e&&!e.u.forbidden);
      const floorAllDone=floorEntries.length>0&&floorEntries.every(e=>e.u.completed);
      return `<div class="apt-svc-floor-group" id="apt-svc-floor-${pIdx}-${g.floor}"${isWorkMarker?' style="background:#EAF7EE;border:1px solid #16A34A;border-radius:8px;padding:6px 8px;margin:-6px -8px 10px;"':''}>
      <div class="apt-svc-floor-head" style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <label style="display:flex;align-items:center;gap:6px;cursor:${floorEntries.length?'pointer':'default'};">
          <input type="checkbox" ${floorAllDone?'checked':''} ${floorEntries.length?'':'disabled'} onchange="toggleAptSvcFloorAll(${pIdx},${g.floor})">
          <span>${g.floor==null?'기타 호수':g.floor+'층'}</span>
        </label>
        <button type="button" onclick="toggleAptSvcFloorMarker(${pIdx},${g.floor})" style="font-size:11px;font-weight:700;padding:3px 8px;border-radius:999px;border:1px solid ${isWorkMarker?'#16A34A':'var(--bd)'};background:${isWorkMarker?'#16A34A':'var(--bg2)'};color:${isWorkMarker?'#fff':'var(--txm)'};white-space:nowrap;">${isWorkMarker?'📍 오늘 여기까지':'오늘봉사 여기까지'}</button>
      </div>
      <div class="apt-svc-unit-list">
        ${g.units.map(ho=>{
          const{u,uIdx}=unitByHo[ho];
          const isLast=card.lastCheckedPoint===pIdx&&card.lastCheckedUnit===uIdx;
          return `<span class="apt-svc-unit-row${u.forbidden?' forbidden':''}${isLast?' last-checked':''}" id="apt-svc-unit-${pIdx}-${uIdx}" style="${u.completed?'background:var(--okbg);border-color:#B7D990;':''}cursor:default;">
            <span>${u.completed?'✅ ':''}${esc(u.ho)}${u.forbidden?' (금지)':''}</span>
          </span>`;
        }).join('')}
      </div>
    </div>`;
    }).join('')}
  </div>`;

  const advanceHtml=allDone?`<div class="apt-svc-advance-banner">
    <div style="font-weight:800;margin-bottom:8px;">✅ 이 지점이 끝났습니다. 다음 진행 장소로 이동하세요.</div>
    ${nextCoord?`<div style="display:flex;gap:8px;">
      <button class="svc-secondary-btn" onclick="openAptCardPointMapView(${nextCoord[0]},${nextCoord[1]})">카카오지도로 위치 확인</button>
      <button class="svc-locate-btn" onclick="openAptCardPointNavi(${nextCoord[0]},${nextCoord[1]})">카카오네비 연결</button>
    </div>`:nextPt?'<div style="font-size:12px;color:var(--txm);">다음 지점의 좌표가 없습니다. 관리자 화면에서 동(또는 단지) 좌표를 먼저 등록하세요.</div>':'<div style="font-size:12px;color:var(--txm);">마지막 지점입니다. "봉사 완료"를 눌러 마무리하세요.</div>'}
  </div>`:'';

  wrap.innerHTML=pointNav+checklistHtml+advanceHtml;
}
// V2 H65: "오늘봉사 여기까지" 층 마커. 주택구역의 이어하기 핀과 같은
// 역할이지만 아파트는 지도 핀 대신 층 단위 참고표시로 둔다. 개별 호수
// 체크/완료 판정(toggleAptSvcUnit, card.status)과는 완전히 별개의
// 필드(lastWorkedPoint/lastWorkedFloor)이며, 이 마커 자체는 완료를
// 의미하지 않는다(그대로 안 누르고 넘어가도 됨 — 참고용).
function toggleAptSvcFloorMarker(pIdx,floor){
  const card=S.apartmentCards.find(c=>c.id===S.aptSession.cardId);
  if(!card||!card.points[pIdx])return;
  const already=card.lastWorkedPoint===pIdx&&card.lastWorkedFloor===floor;
  if(already){
    card.lastWorkedPoint=null;
    card.lastWorkedFloor=null;
  }else{
    card.lastWorkedPoint=pIdx;
    card.lastWorkedFloor=floor;
  }
  persistApartmentCards();
  renderAptSvcChecklist();
  toast(already?'표시를 지웠습니다.':`"${floor==null?'기타 호수':floor+'층'}"을 오늘 작업 위치로 표시했습니다.`);
}
// 이어하기 재진입 시 스크롤 우선순위: 오늘봉사 마커(사람이 직접 찍은 표시)가
// 있으면 그쪽으로, 없으면 기존 scrollToAptSvcLastChecked()(마지막 체크된
// 호수) 그대로 사용 — 기존 함수는 손대지 않고 이 함수에서만 우선순위를 정함.
function scrollToAptSvcWorkMarker(){
  const card=S.apartmentCards.find(c=>c.id===S.aptSession.cardId);
  if(card&&card.lastWorkedPoint!=null){
    const el=document.getElementById(`apt-svc-floor-${card.lastWorkedPoint}-${card.lastWorkedFloor}`);
    if(el){el.scrollIntoView({behavior:'smooth',block:'center'});return;}
  }
  scrollToAptSvcLastChecked();
}
// V2 H67: 층별 체크박스 하나로 그 층의 체크가능 호수 전부를 한번에
// 완료/미완료 처리. toggleAptSvcUnit과 동일한 저장 방식(unit.completed,
// persistApartmentCards, 전체완료시 자동 completeAptSvcSession)을 그대로
// 재사용하고, 대상만 호수 1개 대신 층 전체로 확장한 것뿐이다.
function toggleAptSvcFloorAll(pIdx,floor){
  const card=S.apartmentCards.find(c=>c.id===S.aptSession.cardId);
  const pt=card&&card.points[pIdx];
  if(!pt)return;
  const group=groupApartmentUnitsByFloor(pt.units.map(u=>u.ho)).find(g=>g.floor===floor);
  if(!group)return;
  const unitByHo={};
  pt.units.forEach((u,uIdx)=>{unitByHo[u.ho]={u,uIdx};});
  const entries=group.units.map(ho=>unitByHo[ho]).filter(e=>e&&!e.u.forbidden);
  if(!entries.length)return;
  const newVal=!entries.every(e=>e.u.completed);
  entries.forEach(e=>{e.u.completed=newVal;});
  if(newVal){
    const last=entries[entries.length-1];
    card.lastCheckedPoint=pIdx;
    card.lastCheckedUnit=last.uIdx;
  }
  persistApartmentCards();
  renderAptSvcChecklist();
  if(newVal&&apartmentCardCheckableUnits(card)>0&&apartmentCardCompletedUnits(card)>=apartmentCardCheckableUnits(card)){
    completeAptSvcSession();
  }
}
function toggleAptSvcUnit(pIdx,uIdx){
  const card=S.apartmentCards.find(c=>c.id===S.aptSession.cardId);
  const pt=card&&card.points[pIdx];
  const u=pt&&pt.units[uIdx];
  if(!u||u.forbidden)return; // 금지 unit은 체크 불가 (코드 레벨 가드, checkbox disabled와 이중 방어)
  u.completed=!u.completed;
  if(u.completed){card.lastCheckedPoint=pIdx;card.lastCheckedUnit=uIdx;}
  persistApartmentCards();
  renderAptSvcChecklist();
  // 전체 unit(금지 제외) 체크 완료 시 "완료" 버튼과 동일한 흐름으로 자동 진입
  if(u.completed&&apartmentCardCheckableUnits(card)>0&&apartmentCardCompletedUnits(card)>=apartmentCardCheckableUnits(card)){
    completeAptSvcSession();
  }
}
function pauseAptSvcSession(){
  if(!S.aptSession.active)return;
  const card=S.apartmentCards.find(c=>c.id===S.aptSession.cardId);
  // V2 H66: 주택구역의 "미완료" 버튼/상태와 같은 이름·같은 로직으로 통일
  // (예전엔 '이어하기'라는 상태값만 있어서 관리자/인도자 목록에 "미완료"로
  // 안 보였음). 완료 여부와 무관하게 진행 상태를 그대로 저장하는 동작
  // 자체는 그대로 두고 상태값 이름만 구역과 맞춤.
  if(card&&card.status!=='완료')card.status='미완료';
  persistApartmentCards();
  S.aptSession.active=false;
  S.aptSession.cardId=null;
  S.aptSession.startTime=null;
  closeAptSvcFullscreen();
  goTab('home');
  renderHomeApartmentCardList();
  toast('📍 미완료로 저장했습니다. "이어하기"로 계속할 수 있습니다.');
}
function aptSvcChangeCard(){
  showAppConfirm('카드를 변경할까요?','현재 체크 상태를 저장하고 카드 목록으로 돌아갑니다. 나중에 같은 카드를 다시 열면 이어할 수 있습니다.','변경하기',()=>pauseAptSvcSession());
}
function aptSvcTempLeave(){
  pauseAptSvcSession();
}
function completeAptSvcSession(){
  const card=S.apartmentCards.find(c=>c.id===S.aptSession.cardId);
  if(!card)return;
  showAppConfirm('봉사를 완료할까요?',`"${card.name}" 카드를 완료 처리합니다.`,'완료',()=>{
    card.status='완료';
    card.endTime=new Date().toISOString();
    recordS13Completion(s13TerritoryIdForAptCard(card.id),Date.now()); // V2 J1: S-13 완료 기록
    persistApartmentCards();
    S.aptSession.active=false;
    S.aptSession.cardId=null;
    S.aptSession.startTime=null;
    closeAptSvcFullscreen();
    toast(`✅ ${card.name} 봉사 완료! 기록이 저장되었습니다.`);
    goTab('home');
    renderHomeApartmentCardList();
  });
}

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
  if(storageGet('sokcho_builtin_samples_removed')!=='1'){
    S.zones=S.zones.filter(z=>!sampleZoneNames.has(z.name));
  }
  if(S.zones.length!==zoneBefore)persistZones();
  if(S.rteLines.length!==routeBefore)persistRteLines();
  storageSet('sokcho_builtin_samples_removed','1');
}

// V2 H7: 관리자가 명시적으로 삭제한 구역 id는 여기 영구 기록되어,
// zones_seed.js 재시딩이나 icevening_import.html 재가져오기로도 다시 살아나지 않는다.
function loadDeletedZoneIds(){
  try{
    const ids=JSON.parse(storageGet('sokcho_deleted_zone_ids')||'[]');
    return Array.isArray(ids)?ids.map(String):[];
  }catch(e){return [];}
}
function addDeletedZoneId(id){
  try{
    const ids=new Set(loadDeletedZoneIds());
    ids.add(String(id));
    storageSet('sokcho_deleted_zone_ids',JSON.stringify([...ids]));
  }catch(e){}
}
function loadCoreData(){
  try{
    const zones=JSON.parse(storageGet('sokcho_zones')||'[]');
    S.zones=Array.isArray(zones)?zones:[];
  }catch(e){S.zones=[];}
  if(Array.isArray(window.SOKCHO_ZONES_SEED)&&window.SOKCHO_ZONES_SEED.length){
    const zoneKey=z=>{
      const src=z&&z.source;
      if(src&&src.system==='icevening'&&src.originalId)return 'ice:'+String(src.originalId);
      return String(z&&z.name||'')+'|'+String(z&&z.type||'')+'|'+String((z&&z.polygon&&z.polygon[0]&&z.polygon[0][0])||'');
    };
    const existingKeys=new Set(S.zones.map(zoneKey));
    const existingIds=new Set(S.zones.map(z=>String(z&&z.id))); // V2 H18: 이름을 수정한 구역은 zoneKey(이름 기반)가 더 이상 seed와 안 맞으므로, id로도 한 번 더 걸러 중복 재생성을 막는다
    const deletedIds=new Set(loadDeletedZoneIds());
    const seedZones=window.SOKCHO_ZONES_SEED
      .filter(z=>!deletedIds.has(String(z&&z.id))) // V2 H7: 관리자가 이미 삭제한 id는 재시딩하지 않음
      .filter(z=>!existingIds.has(String(z&&z.id))) // V2 H18: 같은 id가 이미 있으면(이름이 바뀌었어도) 재시딩하지 않음
      .filter(z=>!existingKeys.has(zoneKey(z)))
      .map(z=>({...z,polygon:Array.isArray(z.polygon)?z.polygon:[],streets:Array.isArray(z.streets)?z.streets:[]}));
    if(seedZones.length){
      S.zones=S.zones.concat(seedZones);
      try{
        storageSet('sokcho_zones',JSON.stringify(S.zones));
        storageSet('sokcho_builtin_samples_removed','1');
      }catch(e){}
    }
  }
  try{
    const records=JSON.parse(storageGet('sokcho_records')||'[]');
    S.records=Array.isArray(records)?records:[];
  }catch(e){S.records=[];}
  try{
    const progress=JSON.parse(storageGet('sokcho_progress')||'{}');
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
function persistZones(){storageSet('sokcho_zones',JSON.stringify(S.zones));}
function persistRecords(){storageSet('sokcho_records',JSON.stringify(S.records));}
function persistAllData(){persistZones();persistRecords();persistRteLines();persistLeaders();persistVolunteers();persistContacts();persistApartmentRegistry();persistApartmentCards();} // V2 H16: 아파트 레지스트리/카드도 백업 복원 후 저장되게 포함
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
// V2 H77: 구역 경계색 통일. 기본(미선택) 상태는 전부 진한 청색
// 하나(#185FA5 — 이 파일에서 이미 기본색으로 쓰이던 값과 동일해서
// 새 색을 만들지 않고 그대로 재사용)로 통일하고, 선택된 구역만
// 원래 배정된 고유색(zoneAutoColor, z.color — 데이터/할당 로직은
// 그대로 둠)으로 강조한다. Polygon geometry나 선택 로직(H23/H53) 자체는
// 손대지 않고, "어떤 색을 쓸지" 계산만 isActive 인자로 갈라지게 함.
const ZONE_DEFAULT_COLOR='#185FA5';
function zoneStrokeColor(z,isActive){
  if(!z.color)z.color=zoneAutoColor(S.zones.findIndex(x=>x===z));
  return isActive?z.color:ZONE_DEFAULT_COLOR;
}
function zoneFillColor(z,isActive){
  const c=zoneStrokeColor(z,isActive);
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
    const raw=JSON.parse(storageGet('sokcho_routes')||'[]');
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
  storageSet('sokcho_routes',JSON.stringify(data));
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
const mainKakaoPolygons = new Map();
let rdKakaoPoly=null;
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

      if(containerId==='main-map')drawAllZones(S.panelZone||null);
      else if(containerId==='monitor-map')drawMonitorZones();
      else if(containerId==='home-map')drawHomeZones(S.homeSelectedZone||null);
      else if(containerId==='svc-map'&&S.session&&S.session.zoneId!=null){
        const svcZone=S.zones.find(zz=>zz.id===S.session.zoneId);
        if(svcZone)drawSvcZonePolygon(svcZone);
      }
      else if(containerId==='rd-map'&&S.curZone!=null){
        const rdZone=S.zones.find(zz=>zz.id===S.curZone);
        if(rdZone)drawRdZonePolygon(rdZone);
      }

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
  // V2 H76: 선택 표시를 인라인 opacity 대신 .on 클래스 토글로 바꿈
  // (카드형 디자인 — 선택된 카드는 accent 테두리+배경, 나머지는
  // 중립 스타일. 역할 분기 로직 자체는 아래 그대로 무수정).
  const rkey=role==='volunteer'?'vol':role;
  ['vol','leader','admin'].forEach(r=>{
    const btn=document.getElementById('role-btn-'+r);
    if(btn) btn.classList.toggle('on',r===rkey);
  });
  // 패널 표시
  ['volunteer','leader','admin'].forEach(r=>{
    const p=document.getElementById('panel-'+r);
    if(p) p.style.display=r===role?'block':'none';
  });
  fillSelForRole(role);
}

// V2 H75: 봉사자/인도자 이름 선택을 스크롤 드롭다운에서 검색형
// 입력으로 교체. select였던 자리를 같은 id의 text input으로 바꾸고
// (doLogin()이 그대로 .value를 읽으므로 doLogin/finishLogin/
// requestLoginGps는 전혀 안 건드림), 입력값으로 S.volunteers/
// S.leaders를 실시간으로 부분일치(포함) 검색해서 후보를 보여준다.
function fillSelForRole(role){
  loadVolunteers();loadContacts();
  loadLeaders();
  if(role==='volunteer'){
    const inp=document.getElementById('l-vol-name');
    if(inp)inp.value='';
    renderNameSearchResults('vol','');
  } else if(role==='leader'){
    const inp=document.getElementById('l-leader-name');
    if(inp)inp.value='';
    renderNameSearchResults('leader','');
  }
}

function fillSel(){
  fillSelForRole('volunteer');
  fillSelForRole('leader');
}

function nameSearchList(role){
  return role==='vol'?S.volunteers:S.leaders.map(l=>l.name);
}
function filterNameSearch(role,keyword){
  renderNameSearchResults(role,keyword);
}
function renderNameSearchResults(role,keyword){
  const isVol=role==='vol';
  const wrap=document.getElementById(isVol?'l-vol-name-results':'l-leader-name-results');
  if(!wrap)return;
  const kw=(keyword||'').trim();
  if(!kw){wrap.innerHTML='';wrap.classList.remove('on');return;}
  const matches=nameSearchList(role).filter(n=>n.includes(kw));
  wrap.classList.add('on');
  if(!matches.length){
    wrap.innerHTML='<div class="name-search-empty">일치하는 이름이 없습니다.</div>';
    return;
  }
  const single=matches.length===1;
  wrap.innerHTML=matches.map(n=>`<button type="button" class="name-search-item${single?' single':''}" onclick="selectNameSearchResult('${role}','${jsq(n)}')">${esc(n)}</button>`).join('');
}
function selectNameSearchResult(role,name){
  const isVol=role==='vol';
  const inp=document.getElementById(isVol?'l-vol-name':'l-leader-name');
  if(inp)inp.value=name;
  const wrap=document.getElementById(isVol?'l-vol-name-results':'l-leader-name-results');
  if(wrap){wrap.innerHTML='';wrap.classList.remove('on');}
  if(isVol){
    doLogin(); // 요청사항: 봉사자는 추가입력(PIN 등)이 없으므로 탭하는 순간 바로 확정 로그인
  }else{
    const pinInp=document.getElementById('l-leader-pin');
    if(pinInp)pinInp.focus(); // 인도자는 PIN/모드 선택이 더 필요하므로 자동로그인하지 않고 다음 입력으로 포커스만 이동
  }
}
function confirmNameSearchOnEnter(e,role){
  if(e.key!=='Enter')return;
  const isVol=role==='vol';
  const inp=document.getElementById(isVol?'l-vol-name':'l-leader-name');
  const kw=(inp&&inp.value||'').trim();
  if(!kw)return;
  const matches=nameSearchList(role).filter(n=>n.includes(kw));
  if(matches.length===1)selectNameSearchResult(role,matches[0]);
}

function saveAutoLogin(){
  if(!S.role||!S.user)return;
  storageSet('sokcho_auto_login',JSON.stringify({
    role:S.role,
    user:S.user,
    leaderMode:S.leaderMode||'guide',
    savedAt:Date.now()
  }));
}

function readAutoLogin(){
  try{
    const saved=JSON.parse(storageGet('sokcho_auto_login')||'null');
    return saved&&saved.role&&saved.user?saved:null;
  }catch(e){return null;}
}

function clearAutoLogin(){
  storageRemove('sokcho_auto_login');
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
    storageSet('sokcho_last_login_gps',JSON.stringify(loc));
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
  if(S.aptBuildingPinEdit!=null&&name!=='map')S.aptBuildingPinEdit=null; // 지도 탭을 벗어나면 좌표찍기 모드 자동 취소 (V2 H3/H4)
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('on'));
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('on'));
  document.getElementById('p-'+name).classList.add('on');
  document.getElementById('t-'+name).classList.add('on');
  if(name==='record') renderRecords();
  if(name==='research') renderResearchList(); // V2 H41
  if(name==='admin') renderAdmin();
  if(name==='route'){showRouteList();renderRouteGrid();}
  if(name==='monitor') initMonitor();
  if(name==='home'){renderHome();renderHomeApartmentCardList();}
  if(name==='map'&&S.mainMap) setTimeout(()=>{S.mainMap.invalidateSize();},300);
  if(name==='route'&&S.rdMap) refreshMapAfterLayout(S.rdMap);
  if(name==='home'&&homeMapInst) refreshMapAfterLayout(homeMapInst);
  if(name==='monitor'&&S.monMap) refreshMapAfterLayout(S.monMap);
}

// V2 H33: 통합 접이식 메뉴. 각 .tab 버튼의 onclick(goTab 등, 위 함수
// 자체)은 전혀 건드리지 않고, 그 위에 "펼침/접힘 껍데기"만 씌운다.
function toggleMainMenu(){
  const bar=document.getElementById('tabbar');
  if(!bar)return;
  bar.classList.toggle('menu-open');
}
function closeMainMenu(){
  const bar=document.getElementById('tabbar');
  if(bar)bar.classList.remove('menu-open');
}
// 바깥 영역 클릭 시 닫힘(SCOPE 3)
document.addEventListener('click',e=>{
  const bar=document.getElementById('tabbar');
  const toggleBtn=document.getElementById('menu-toggle-btn');
  if(!bar||!bar.classList.contains('menu-open'))return;
  if(bar.contains(e.target)||(toggleBtn&&toggleBtn.contains(e.target)))return;
  closeMainMenu();
},true);
// 메뉴 항목(.tab) 클릭 시 자동으로 접힘 — 콘텐츠를 계속 가리지 않게.
// 각 버튼의 onclick 자체는 이 리스너와 별개로 먼저 그대로 실행된다.
document.addEventListener('click',e=>{
  const bar=document.getElementById('tabbar');
  if(!bar)return;
  const tabBtn=e.target.closest?e.target.closest('.tab'):null;
  if(tabBtn&&bar.contains(tabBtn))closeMainMenu();
});

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

function goAdminZoneDraw(zoneId){
  if(S.role!=='admin')return;
  const editZone=zoneId!=null?S.zones.find(z=>z.id===zoneId):null;
  goTab('map');
  setTimeout(()=>{
    if(S.mainMap)S.mainMap.invalidateSize();
    if(S.drawMode)cancelDraw();
    startDraw(editZone);
  },350);
}

// V2 H34: 관리자 구역관리 목록 → "지도보기" → 원래 목록 화면(스크롤
// 위치 포함)으로 정확히 복귀. 지도 강조는 기존 openSheet(zoneId)를
// 그대로 재사용(main-map의 구역 강조/패널 로직 무수정), goTab/
// openSheet 자체는 손대지 않고 그 앞뒤로 상태 저장/복원만 감싼다.
let adminZoneMapReturn=null; // {scrollTop} — 관리자 목록에서 지도보기로 왔을 때만 세팅
function goAdminZoneMapView(zoneId){
  if(S.role!=='admin')return;
  const pb=document.querySelector('#p-admin .pb');
  adminZoneMapReturn={scrollTop:pb?pb.scrollTop:0};
  goTab('map');
  setTimeout(()=>{
    if(S.mainMap)S.mainMap.invalidateSize();
    openSheet(zoneId);
    updateAdminZoneMapReturnUi();
  },350);
}
function updateAdminZoneMapReturnUi(){
  const show=adminZoneMapReturn!=null;
  document.querySelectorAll('.admin-zone-return-btn').forEach(el=>el.classList.toggle('hide',!show));
}
function returnToAdminZoneList(){
  const ret=adminZoneMapReturn;
  adminZoneMapReturn=null;
  closeSheet();
  closeSideDetail();
  goTab('admin');
  updateAdminZoneMapReturnUi();
  if(ret){
    setTimeout(()=>{
      const pb=document.querySelector('#p-admin .pb');
      if(pb)pb.scrollTop=ret.scrollTop;
    },60);
  }
}

// ================================================================
// 초기화
// ================================================================
function initApp(){
  initFirebaseIfConfigured(); // V2 H69-B: config 없으면 즉시 false 반환, 나머지 흐름 그대로
  initFirestoreSyncH105(); // V2 H105: db 연결돼 있으면 리스너 등록(최초 1회만, 이미 붙어있으면 즉시 반환)
  loadCoreData();
  loadRteLines();
  cleanupBuiltInSamples();
  loadLeaders();loadVolunteers();loadContacts();
  // V2 H9: 로그아웃 후 재로그인(새로고침 없이) 시 initApp()가 다시 실행되는데,
  // _kakaoInstances에 이전 로그인의 Kakao 인스턴스가 남아있으면 addBaseTiles()가
  // "이미 있다"고 판단해 새 Leaflet 지도에 Kakao 배경/동기화를 아예 안 붙인다.
  // 지도를 실제로 재생성하는 이 두 컨테이너만 캐시도 함께 지워 재초기화되게 한다.
  if(S.mainMap){S.mainMap.remove();S.mainMap=null;S.mainLayers=[];delete _kakaoInstances['main-map'];}
  if(S.rdMap){S.rdMap.remove();S.rdMap=null;S.rdLayers=[];S.rdRteLayers=[];delete _kakaoInstances['rd-map'];}
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
  const kakaoMap=_kakaoInstances['main-map'];
  if(kakaoMap&&window.kakao?.maps?.Polygon){
    const zoneIds=new Set(S.zones.map(z=>String(z.id)));
    mainKakaoPolygons.forEach((item,id)=>{
      // V2 H53: setMap(null)만으로는 캐시(Map)에 옛 id 항목이 계속
      // 쌓여서(구역번호 재정리 등으로 id가 바뀔 때마다) 무한정 늘어남 —
      // 실제로 지금 쓰는 id가 아니면 캐시에서도 완전히 지운다.
      if(!zoneIds.has(id)){item.polygon.setMap(null);mainKakaoPolygons.delete(id);}
    });
    S.zones.forEach(z=>{
      let item=mainKakaoPolygons.get(String(z.id));
      if(!item){
        const path=(z.polygon||[]).map(pt=>new kakao.maps.LatLng(Number(pt[0]),Number(pt[1])));
        const polygon=new kakao.maps.Polygon({path,strokeWeight:3.5,strokeColor:'#185FA5',strokeOpacity:1,fillColor:'#185FA5',fillOpacity:.05});
        kakao.maps.event.addListener(polygon,'click',()=>openSheet(z.id));
        item={polygon};
        mainKakaoPolygons.set(String(z.id),item);
      }
      const show=S.mapFilter==='all'||(S.mapFilter==='residential'&&z.type==='residential')||(S.mapFilter==='commercial'&&z.type==='commercial')||(S.mapFilter==='undone'&&isInProgress(z.id))||(S.mapFilter==='standby'&&getZoneState(z.id)==='standby');
      const isActive=activeId===z.id;
      const dimmed=activeId!==null&&!isActive;
      const sc=zoneStrokeColor(z,isActive);
      const fillC=zoneFillColor(z,isActive);
      item.polygon.setOptions({strokeWeight:isActive?5:3.5,strokeColor:sc,strokeOpacity:dimmed?.35:1,fillColor:fillC,fillOpacity:dimmed?.01:.05});
      item.polygon.setMap(show?kakaoMap:null);
    });
  }
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
    const sc=zoneStrokeColor(z,isActive);
    if(isActive)addStartPinMarker(S.mainMap,z,S.mainLayers,{label:'시작점'});
    // V2 H23: home-map과 동일한 이유(Kakao 폴리곤은 pointer-events:none
    // 배경 렌더러라 클릭이 안 닿음) — 투명 Leaflet 폴리곤으로 클릭만 받음.
    // 그리기 모드/아파트 동 좌표찍기 중에는 지도 클릭이 그 용도로 먼저
    // 쓰여야 하므로, 그 경우엔 기존 onMapClick(e)에 그대로 위임하고(Leaflet
    // 기본 버블링에 기대지 않고 직접 호출) 구역 선택은 하지 않는다.
    if(Array.isArray(z.polygon)&&z.polygon.length>=3){
      const hitPoly=L.polygon(z.polygon,{stroke:false,fill:true,fillOpacity:0,interactive:true,bubblingMouseEvents:false});
      hitPoly.on('click',(e)=>{
        if(S.drawMode||S.aptBuildingPinEdit!=null){onMapClick(e);return;}
        openSheet(z.id);
      });
      hitPoly.addTo(S.mainMap);
      S.mainLayers.push(hitPoly);
    }
    if(!showLabels)return;
    const ctr=zoneCenter(z);
    const op=dimmed?.3:1;
    const labelColor='#111827';
    const labelPrefix=done?'✅ ':inProg?'⏸ ':meta.state==='standby'?'○ ':'';
    const mk=L.marker(ctr,{icon:L.divIcon({html:`<div class="zone-map-label" style="opacity:${op};border:${isActive?'2px':'1.5px'} solid ${sc};color:${labelColor};">${labelPrefix}${zoneMapLabel(z)}</div>`,className:'zone-label-anchor',iconAnchor:[0,0],iconSize:[1,1]})}).addTo(S.mainMap);
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
    document.getElementById('sh-name').textContent=`${zoneDisplayLabel(z.id)} ${displayZoneNameCleaned(z.name)}`;
    document.getElementById('sh-badges').innerHTML=bh;
    document.getElementById('sh-info').innerHTML=ih;
    const sh=document.getElementById('zsheet');
    sh.style.display='block';
    setTimeout(()=>sh.classList.add('open'),10);
  } else {
    document.getElementById('side-zone-list').style.display='none';
    document.getElementById('side-zone-detail').style.display='block';
    document.getElementById('side-detail-name').textContent=`${zoneDisplayLabel(z.id)} ${displayZoneNameCleaned(z.name)}`;
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

  // V2 H85: 구역지도(#p-map) PC 사이드패널(우측, zone-search+새구역그리기)에
  // 아파트 카드가 아예 없던 것을 H68(renderRouteGrid, #rte-grid — 하단
  // "목록" 탭, 완전히 다른 화면)과 동일한 원칙으로 추가. "주택"/"상가"
  // 필터는 아파트와 무관한 카테고리라 그때만 제외하고, 전체/미완료/
  // 봉사대기에서는 같이 보이게 한다. 클릭은 openSheet(zone 폴리곤 전용,
  // 손대지 않음) 대신 기존 startApartmentCardAndGo를 그대로 재사용해서
  // H68과 동일하게 진행화면으로 바로 연결한다.
  let aptCards=(S.mapFilter==='residential'||S.mapFilter==='commercial')?[]:[...S.apartmentCards];
  if(S.mapFilter==='undone')aptCards=aptCards.filter(c=>c.status==='진행중'||c.status==='미완료');
  else if(S.mapFilter==='standby')aptCards=aptCards.filter(c=>c.status==='미시작');
  if(keyword&&keyword.trim()){
    const kw=keyword.trim().toLowerCase();
    aptCards=aptCards.filter(c=>c.name.toLowerCase().includes(kw)||String(c.number).includes(kw));
  }

  if(zones.length===0&&aptCards.length===0){
    wrap.innerHTML='<p style="font-size:12px;color:var(--txm);padding:12px 0;text-align:center;">검색 결과가 없습니다.</p>';
    return;
  }
  const zoneHtml=zones.map(z=>{
    const done=isDone(z.id);
    const meta=getZoneStatusMeta(z.id);
    const isRes=z.type==='residential';
    const cnt=S.records.filter(r=>r.zoneId===z.id).length;
    const selected=String(activeZoneId())===String(z.id);
    return `<div id="side-zone-item-${z.id}" class="side-zone-item ${isRes?'res':'com'} ${selected?'selected':''}" onclick="openSheet(${z.id})">
      <div>
        <div style="font-size:13px;font-weight:600;"><span style="color:var(--txm);font-size:11px;">${zoneDisplayLabel(z.id)} </span>${esc(displayZoneNameCleaned(z.name))}</div>
        <div style="font-size:11px;color:var(--txm);">${z.streets.join(', ').slice(0,30)} · ${cnt}회</div>
      </div>
      <div style="width:9px;height:9px;border-radius:50%;background:${meta.color};flex-shrink:0;margin-left:8px;"></div>
    </div>`;
  }).join('');
  const aptHtml=aptCards.map(card=>{
    const done=card.status==='완료';
    const inProg=card.status==='진행중'||card.status==='미완료';
    const meta={color:done?'#3B6D11':inProg?'#D85A30':'#d1d5db'};
    const click=done?`toast('완료된 카드입니다. 관리자가 초기화해야 다시 시작할 수 있습니다.')`:`startApartmentCardAndGo(${card.id},${inProg})`;
    return `<div id="side-apt-item-${card.id}" class="side-zone-item" style="border-left:3px solid #7F3FBF;" onclick="${click}">
      <div>
        <div style="font-size:13px;font-weight:600;"><span style="color:#7F3FBF;font-size:11px;">아파트 #${card.number} </span>${esc(card.name)}</div>
        <div style="font-size:11px;color:var(--txm);">${card.points.length}개 지점 · ${apartmentCardCompletedUnits(card)}/${apartmentCardCheckableUnits(card)}호</div>
      </div>
      <div style="width:9px;height:9px;border-radius:50%;background:${meta.color};flex-shrink:0;margin-left:8px;"></div>
    </div>`;
  }).join('');
  wrap.innerHTML=zoneHtml+aptHtml;
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
        <div style="font-size:13px;font-weight:600;"><span style="color:var(--txm);font-size:11px;">${zoneDisplayLabel(z.id)} </span>${esc(displayZoneNameCleaned(z.name))}</div>
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
function startDraw(editZone){
  S.drawMode=true;
  S.drawEditId=editZone?editZone.id:null;
  S.drawPts=editZone&&Array.isArray(editZone.polygon)?editZone.polygon.map(p=>[p[0],p[1]]):[];
  document.getElementById('draw-bar').classList.add('on');
  document.getElementById('draw-ind').classList.add('on');
  document.getElementById('draw-toggle-btn').style.background='#D85A30';
  document.getElementById('draw-toggle-btn').style.color='#fff';
  document.getElementById('side-draw-hint').style.display='block';
  document.getElementById('side-draw-start-btn').textContent='🛑 찍기 중지';
  ['draw-title','draw-title2'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=editZone?'✏️ 구역 수정':'✏️ 새 구역 그리기';}); // V2 H30: 구역수정하기 버튼과 연결
  ['draw-name','draw-name2'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=editZone?editZone.name:'';});
  ['draw-type','draw-type2'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=editZone?editZone.type:'residential';});
  ['draw-streets','draw-streets2'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=editZone?editZone.streets.join(', '):'';});
  closeSheet();
  // V2 H31: 편집모드 진입 시 이 구역의 기존 Kakao 폴리곤(지도에 항상
  // 떠 있는 원본 구역 렌더링)을 숨긴다. 이걸 안 숨기면 "초기화"를
  // 눌러도 이 폴리곤은 draw-mode 임시 오버레이(S.drawMk/drawLine/
  // drawPoly)가 아니라서 전혀 지워지지 않고 계속 남아 보인다(원인).
  if(editZone){
    const item=mainKakaoPolygons.get(String(editZone.id));
    if(item)item.polygon.setMap(null);
  }
  updateDrawViz();
  toast(editZone?`"${editZone.name}" 구역 경계 수정 모드입니다. 기존 꼭짓점을 불러왔습니다.`:'지도를 클릭해 꼭짓점을 찍으세요');
}
function cancelDraw(){
  // V2 H31: 편집모드였다면 숨겨뒀던 원본 구역 폴리곤을 다시 보이게 한다.
  // (저장 경로에서는 _doSaveZone이 invalidateZonePolygonCache로 이미
  // 캐시에서 제거한 뒤 cancelDraw를 호출하므로 item이 없어 자연히
  // no-op — 그 다음 drawAllZones(null)이 새 경계로 다시 그려준다.)
  if(S.drawEditId!=null){
    const item=mainKakaoPolygons.get(String(S.drawEditId));
    if(item)item.polygon.setMap(S.mainMap);
  }
  S.drawMode=false;S.drawPts=[];S.drawEditId=null;clearDrawTmp();
  document.getElementById('draw-bar').classList.remove('on');
  document.getElementById('draw-ind').classList.remove('on');
  document.getElementById('draw-toggle-btn').style.background='var(--pbg)';
  document.getElementById('draw-toggle-btn').style.color='var(--p)';
  document.getElementById('side-draw-hint').style.display='none';
  document.getElementById('side-draw-start-btn').textContent='🖊 꼭짓점 찍기 시작';
  ['draw-title','draw-title2'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent='✏️ 새 구역 그리기';}); // V2 H30: 취소 시 신규 그리기 문구로 복귀
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
  if(S.aptBuildingPinEdit!=null){
    const{complexId,bIdx}=S.aptBuildingPinEdit;
    S.aptBuildingPinEdit=null;
    saveApartmentBuildingPin(complexId,bIdx,e.latlng.lat,e.latlng.lng);
    return;
  }
  if(!S.drawMode)return;
  S.drawPts.push([e.latlng.lat,e.latlng.lng]);
  updateDrawViz();
}
function updatePtCnt(n){
  ['pt-cnt','pt-cnt2','pt-cnt2b'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=n;});
  ['save-btn','save-btn2'].forEach(id=>{const el=document.getElementById(id);if(el)el.disabled=n<3;});
}
function deleteDrawPt(idx){
  // V2 H31: 꼭짓점 번호 마커를 클릭하면 그 점만 삭제하고 라인을 다시 그린다.
  if(idx<0||idx>=S.drawPts.length)return;
  S.drawPts.splice(idx,1);
  updateDrawViz();
  toast('꼭짓점을 삭제했습니다.');
}
function updateDrawViz(){
  clearDrawTmp();
  const pts=S.drawPts,n=pts.length;
  updatePtCnt(n);
  pts.forEach((p,i)=>{
    const icon=L.divIcon({html:`<div style="width:22px;height:22px;border-radius:50%;background:#D85A30;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3);cursor:pointer;">${i+1}</div>`,className:'',iconAnchor:[11,11]});
    const mk=L.marker(p,{icon}).addTo(S.mainMap);
    mk.on('click',e=>{L.DomEvent.stopPropagation(e);deleteDrawPt(i);});
    S.drawMk.push(mk);
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
function findOverlappingZone(poly,excludeId){
  return S.zones.find(z=>z.polygon&&z.polygon.length>=3&&(excludeId==null||z.id!==excludeId)&&polygonsOverlapArea(poly,z.polygon));
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
  const editId=S.drawEditId;
  const overlap=findOverlappingZone(S.drawPts,editId);
  if(overlap){
    drawAllZones(overlap.id);
    toast(`"${overlap.name}" 구역과 겹칩니다. 경계가 겹치지 않게 다시 그려주세요.`);
    return;
  }
  const streets=sr?sr.split(',').map(s=>s.trim()).filter(Boolean):['거리 미지정'];
  if(editId!=null){
    const z=S.zones.find(zz=>zz.id===editId);
    if(!z){toast('수정할 구역을 찾을 수 없습니다.');return;}
    z.name=name;z.type=type;z.polygon=[...S.drawPts];z.streets=streets;
    persistZones();
    invalidateZonePolygonCache(editId);
    toast(`✅ "${name}" 구역 경계 수정 완료!`);
  } else {
    S.nextId++;
    S.zones.push({id:S.nextId,name,type,polygon:[...S.drawPts],streets,color:zoneAutoColor(S.zones.length)});
    persistZones();
    toast(`✅ "${name}" 구역 저장 완료!`);
  }
  // V2 H32-2: delZone과 동일한 이유로, 화면 갱신 체인 중 하나가 예외를
  // 던지면 그 뒤(특히 renderAdmin→구역별 현황)가 통째로 안 돈다. 저장
  // 데이터 로직(위쪽)은 그대로 두고, 갱신 순서/격리만 delZone과
  // 동일하게 맞춘다 — 저장/삭제 둘 다 "구역별 현황"에 항상 반영되게.
  try{cancelDraw();}catch(e){console.error('구역 저장 후 cancelDraw 실패',e);}
  if(S.role==='admin'){try{renderAdmin();}catch(e){console.error('구역 저장 후 renderAdmin 갱신 실패',e);}}
  try{drawAllZones(null);}catch(e){console.error('구역 저장 후 drawAllZones 갱신 실패',e);}
  try{renderSideList();}catch(e){console.error('구역 저장 후 renderSideList 갱신 실패',e);}
  try{renderRouteGrid();}catch(e){console.error('구역 저장 후 renderRouteGrid 갱신 실패',e);}
}
function invalidateZonePolygonCache(zoneId){
  const key=String(zoneId);
  const main=mainKakaoPolygons.get(key);
  if(main){main.polygon.setMap(null);mainKakaoPolygons.delete(key);}
  const home=homeKakaoPolygons.get(key);
  if(home){home.polygon.setMap(null);homeKakaoPolygons.delete(key);}
  if(homeMapInst)drawHomeZones(S.homeSelectedZone||null);
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
  // V2 H68: H67과 동일한 규칙 — 미완료(진행중/미완료 포함) 우선, 완료는 뒤로
  zones.sort((a,b)=>(isDone(a.id)?1:0)-(isDone(b.id)?1:0)||(Number(a.id)||0)-(Number(b.id)||0)||a.name.localeCompare(b.name,'ko',{numeric:true}));
  const grid=document.getElementById('rte-grid');
  if(!grid)return;

  // V2 H68: "목록" 탭(rte-grid)에 아파트 카드가 아예 없던 것을 추가.
  // 상가(주택과 같은 배열, id가 항상 4074 이하라 항상 먼저 옴) 다음에
  // 이어지는 별도 블록으로 붙인다(구역과 한 배열로 합쳐서 정렬하지 않음
  // — "상가 다음에 아파트 섹션" 요청을 그대로 반영). 카드 클릭은 기존
  // startApartmentCardAndGo()를 그대로 재사용(진행화면 흐름 그대로).
  let aptCards=[...S.apartmentCards];
  if(routeListFilter==='done')aptCards=aptCards.filter(c=>c.status==='완료');
  if(routeListFilter==='undone')aptCards=aptCards.filter(c=>c.status==='진행중'||c.status==='미완료');
  if(routeListFilter==='standby')aptCards=aptCards.filter(c=>c.status==='미시작');
  if(keyword&&keyword.trim()){
    const kw=keyword.trim().toLowerCase();
    aptCards=aptCards.filter(c=>c.name.toLowerCase().includes(kw)||String(c.number).includes(kw));
  }
  aptCards.sort((a,b)=>(a.status==='완료'?1:0)-(b.status==='완료'?1:0)||(Number(a.number)||0)-(Number(b.number)||0)||a.name.localeCompare(b.name,'ko',{numeric:true}));

  if(zones.length===0&&aptCards.length===0){grid.innerHTML='<p style="font-size:12px;color:var(--txm);padding:20px 0;text-align:center;grid-column:1/-1;">검색 결과가 없습니다.</p>';return;}
  const renderZoneItem=z=>{
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
      <div class="zc-name"><span style="color:var(--txm);font-size:10px;">${zoneDisplayLabel(z.id)} </span>${esc(displayZoneNameCleaned(z.name))}</div>
      <div class="zc-meta">${z.streets.length}개 거리 · ${cnt}회${routeCnt?` · 경로 ${routeCnt}개`:''}</div>
      <div class="zc-status-row">
        <span class="zc-status ${statusClass}">${statusIcon} ${statusText}</span>
      </div>
      ${S.role==='admin'?`<div class="zc-admin-row"><button class="zc-edit-id" onclick="event.stopPropagation();editZoneNumber(${z.id})">번호 수정</button></div>`:''}
    </div>`;
  };
  // V2 H104: 인도자의 기본 화면인 "목록" 탭(#rte-grid)에는 홈 화면(renderHomeZoneList)/
  // 관리자 구역관리(renderAdmGrid)와 달리 주택/상가/아파트를 구분하는 섹션 헤더가 아예
  // 없어서, id 오름차순 정렬 특성상 화면 맨 위가 특정 단지(예: 부영xxx동) 이름의 구역들로
  // 채워지면 "아파트 항목이 주택 목록에 섞여 있다"는 인상을 준다(실제로는 데이터가 섞이거나
  // 옛 캐시를 쓰는 것이 아니라, 이 화면에만 구분 헤더가 없었을 뿐 — 조사 결과는 H104
  // 보고서 참고). 데이터/필터링 로직은 전혀 안 건드리고, 이미 필터링·정렬된 zones/aptCards를
  // type별로 다시 나눠 헤더(전체 개수, 필터와 무관 — 홈/관리자 화면과 동일한 관례)만 끼워넣는다.
  const resZones=zones.filter(z=>z.type==='residential');
  const comZones=zones.filter(z=>z.type==='commercial');
  const resTotal=S.zones.filter(z=>z.type==='residential').length;
  const comTotal=S.zones.filter(z=>z.type==='commercial').length;
  const sectionHeader=(icon,label,count)=>`<div class="zc-section-header" style="grid-column:1/-1;font-size:13px;font-weight:800;padding:10px 2px 2px;">${icon} ${label} (${count})</div>`;
  const resHtml=resZones.length?sectionHeader('🏠','주택',resTotal)+resZones.map(renderZoneItem).join(''):'';
  const comHtml=comZones.length?sectionHeader('🏪','상가',comTotal)+comZones.map(renderZoneItem).join(''):'';
  const zoneHtml=resHtml+comHtml;

  const aptHtml=(aptCards.length?sectionHeader('🏢','아파트',S.apartmentCards.length):'')+aptCards.map(card=>{
    const done=card.status==='완료';
    const inProg=card.status==='진행중'||card.status==='미완료';
    const statusClass=done?'done':inProg?'progress':'reset';
    const statusIcon=done?'✓':inProg?'!':'○';
    const total=apartmentCardCheckableUnits(card);
    const doneCnt=apartmentCardCompletedUnits(card);
    const click=done?`toast('완료된 카드입니다. 관리자가 초기화해야 다시 시작할 수 있습니다.')`:`startApartmentCardAndGo(${card.id},${inProg})`;
    return `<div id="rte-apt-item-${card.id}" class="zc" style="border-left:3px solid #7F3FBF;" onclick="${click}">
      <div class="zc-dot" style="background:${done?'#3B6D11':inProg?'#D85A30':'#d1d5db'};"></div>
      <div class="zc-badge"><span class="badge" style="background:#F1E9FA;color:#7F3FBF;">아파트</span></div>
      <div class="zc-name"><span style="color:var(--txm);font-size:10px;">#${card.number} </span>${esc(card.name)}</div>
      <div class="zc-meta">${card.points.length}개 지점 · ${doneCnt}/${total}호</div>
      <div class="zc-status-row">
        <span class="zc-status ${statusClass}">${statusIcon} ${esc(card.status)}</span>
      </div>
    </div>`;
  }).join('');

  grid.innerHTML=zoneHtml+aptHtml;
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
function drawRdZonePolygon(z){
  if(!S.rdMap||!z)return;
  const kakaoMap=_kakaoInstances['rd-map'];
  if(!kakaoMap||!window.kakao?.maps?.Polygon)return;
  if(rdKakaoPoly)rdKakaoPoly.setMap(null);
  const path=(z.polygon||[]).map(pt=>new kakao.maps.LatLng(Number(pt[0]),Number(pt[1])));
  rdKakaoPoly=new kakao.maps.Polygon({path,strokeWeight:3.8,strokeColor:zoneStrokeColor(z,true),strokeOpacity:1,fillColor:zoneFillColor(z,true),fillOpacity:.05}); // V2 H77: 이 지도는 항상 구역 1개만 보여주는 상세화면이라 고유색(선택색) 유지
  rdKakaoPoly.setMap(kakaoMap);
}
function drawRdZone(z){
  clearRdLayers();
  keepMapDraggable(S.rdMap);
  drawRdZonePolygon(z);
  addStartPinMarker(S.rdMap,z,S.rdLayers,{label:'시작점',draggable:S.role==='admin'});
  centerRouteMapOnZone(z,18);
  setTimeout(()=>{S.rdMap.invalidateSize();centerRouteMapOnZone(z,18);},80);
}
function drawRoute(){
  const z=S.zones.find(z=>z.id===S.curZone);if(!z)return;
  // 기존 경로선 제거 (폴리곤은 별도 Kakao 오버레이로 관리되어 영향 없음)
  S.rdLayers.forEach(l=>S.rdMap.removeLayer(l));
  S.rdLayers=[];
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
  if(S.rteDraw){
    S.rtePts.push([e.latlng.lat,e.latlng.lng]);
    updateRteViz();
    return;
  }
  // 지도 탭 = 기존 "카카오맵" 버튼과 동일 동작 (H1)
  openZoneKakaoStart(S.curZone);
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
let homeComFilter='all'; // V2 H21: 상가 섹션 전용 필터(전체/미완료/완료), 지도 필터칩(homeMapFilter)과 무관
const homeKakaoPolygons=new Map();

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
  const kakaoMap=_kakaoInstances['home-map'];
  if(kakaoMap&&window.kakao?.maps?.Polygon){
    const zoneIds=new Set(S.zones.map(z=>String(z.id)));
    homeKakaoPolygons.forEach((item,id)=>{
      // V2 H53: mainKakaoPolygons와 동일 — 캐시에서도 완전히 제거
      if(!zoneIds.has(id)){item.polygon.setMap(null);homeKakaoPolygons.delete(id);}
    });
    S.zones.forEach(z=>{
      let item=homeKakaoPolygons.get(String(z.id));
      if(!item){
        const path=(z.polygon||[]).map(pt=>new kakao.maps.LatLng(Number(pt[0]),Number(pt[1])));
        const polygon=new kakao.maps.Polygon({path,strokeWeight:3.5,strokeColor:'#185FA5',strokeOpacity:1,fillColor:'#185FA5',fillOpacity:.05});
        kakao.maps.event.addListener(polygon,'click',()=>selectHomeZone(z.id));
        item={polygon};
        homeKakaoPolygons.set(String(z.id),item);
      }
      const show=homeMapFilter==='all'||
        (homeMapFilter==='residential'&&z.type==='residential')||
        (homeMapFilter==='commercial'&&z.type==='commercial')||
        (homeMapFilter==='undone'&&isInProgress(z.id))||
        (homeMapFilter==='standby'&&getZoneState(z.id)==='standby');
      const isActive=activeId===z.id;
      const dimmed=activeId!==null&&!isActive;
      const sc=zoneStrokeColor(z,isActive);
      const fillColor=zoneFillColor(z,isActive);
      item.polygon.setOptions({strokeWeight:isActive?5:3.5,strokeColor:sc,strokeOpacity:dimmed?.35:1,fillColor,fillOpacity:dimmed?.01:.05});
      item.polygon.setMap(show?kakaoMap:null);
    });
  }
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
    const sc=zoneStrokeColor(z,isActive);
    if(isActive)addStartPinMarker(homeMapInst,z,homeMapLayers,{label:'시작점'});
    // V2 H23: Kakao 폴리곤은 배경 전용 렌더러라 pointer-events:none이 걸려
    // 있어(styles.css .kakao-bg) 실제 클릭이 전혀 닿지 않는다(1탭 무반응의
    // 원인). 시각적으로는 아무것도 그리지 않는 투명(opacity 0) Leaflet
    // 폴리곤을 같은 좌표에 겹쳐 클릭만 받아내고 기존 selectHomeZone을
    // 그대로 호출한다 — Kakao의 폴리곤 "모양" 자체는 그대로 두므로 drift
    // 재발과 무관하다.
    if(Array.isArray(z.polygon)&&z.polygon.length>=3){
      const hitPoly=L.polygon(z.polygon,{stroke:false,fill:true,fillOpacity:0,interactive:true,bubblingMouseEvents:false});
      hitPoly.on('click',()=>selectHomeZone(z.id));
      hitPoly.addTo(homeMapInst);
      homeMapLayers.push(hitPoly);
    }
    if(!showLabels)return;
    const ctr=zoneCenter(z);
    const labelColor2='#111827';
    const labelPre=done?'✅ ':inProg?'⏸ ':'○ ';
    const mk=L.marker(ctr,{icon:L.divIcon({
        html:`<div class="zone-map-label" style="opacity:${dimmed?.3:1};border:${isActive?'2px':'1.5px'} solid ${sc};color:${labelColor2};">${labelPre}${zoneMapLabel(z)}</div>`,
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
  S.homeSelectedAptCard=null; // V2 K2: 아파트 카드 강조 상태와 상호 배타적으로 유지
  drawHomeZones(id);
  markSelectedCards(id);
  const z=S.zones.find(z=>z.id===id);
  if(z){
    homeMapInst.fitBounds(L.latLngBounds(z.polygon),{padding:[30,30]});
    // V2 H27 PART B: 상가 구역은 목록이 기본적으로 접힌 섹션(H21) 안에
    // 있어서, 주택과 달리 지도에서 선택해도 강조/스크롤이 화면에 보이지
    // 않았다(섹션 자체가 display:none). 상가 구역을 선택하면 그 섹션을
    // 자동으로 펼친다 — 주택 목록은 항상 펼쳐져 있어 이 처리가 필요 없다.
    if(z.type==='commercial'){
      const body=document.getElementById('home-com-body');
      if(body&&body.classList.contains('hide'))toggleHomeCommercialSection();
    }
  }
  // 목록에서 해당 구역 스크롤
  const el=document.getElementById('home-zone-item-'+id);
  if(el)el.scrollIntoView({behavior:'smooth',block:'nearest'});
}

function renderHomeZoneList(kw){
  renderHomeCommercialList(); // V2 H21: 상가는 별도 섹션에서 렌더 — 이 함수가 호출되는 모든 지점에서 함께 새로고침
  renderHomeApartmentCardList(); // V2 H67: 아파트도 함께 새로고침(주택 목록이 갱신되는 모든 지점에서 아파트도 같이 최신 상태 유지)
  const resCountEl=document.getElementById('home-res-count');
  // V2 H67: 미완료(진행중/미완료 포함) 우선, 완료는 뒤로 — 구역/상가/아파트 전부 통일
  let zones=S.zones.filter(z=>z.type==='residential').sort((a,b)=>(isDone(a.id)?1:0)-(isDone(b.id)?1:0)||(Number(a.id)||0)-(Number(b.id)||0)||a.name.localeCompare(b.name,'ko',{numeric:true}));
  if(resCountEl)resCountEl.textContent=zones.length;
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
    return `<div id="home-zone-item-${z.id}" class="home-zone-row home-zone-row-kakao ${isRes?'res':'com'} ${selected?'selected':''}" onclick="selectHomeZone(${z.id})">
      <div style="min-width:0;">
        <div class="home-zone-title"><span>${zoneDisplayLabel(z.id)} </span>${esc(displayZoneNameCleaned(z.name))}</div>
        <div class="home-zone-meta">${isRes?'주택':'상가'} · ${z.streets.length}개 거리</div>
      </div>
      <span class="zc-status ${statusClass}">${status}</span>
      <button class="btn btn-sm btn-out home-zone-action" onclick="event.stopPropagation();openZoneKakaoStart(${z.id})" style="flex-shrink:0;">카카오맵</button>
      ${action}
    </div>`;
  }).join('');
}

// V2 H28: 모바일에서 지도를 최대한 넓히기 위해 구역 목록 전체(주택/
// 상가/아파트)를 손잡이로 접고 펼친다. PC에서는 이 손잡이 자체가
// CSS로 숨겨져 있어(styles.css .home-list-handle) 아무 영향 없다.
// 목록이 접혀있어도 selectHomeZone/selectHomeApartmentCard 등 지도
// 선택 로직은 DOM 표시 여부와 무관하게 그대로 동작한다.
function toggleHomeListPanel(){
  const panel=document.getElementById('home-list-panel');
  const icon=document.getElementById('home-list-handle-icon');
  if(!panel)return;
  const willExpand=panel.classList.contains('home-list-collapsed');
  panel.classList.toggle('home-list-collapsed',!willExpand);
  if(icon)icon.textContent=willExpand?'▾':'▸';
}

// V2 H21: 홈 화면 상가 섹션(아파트 카드 섹션과 동일 스타일, 지도 필터칩과 무관한 독립 필터)
// V2 H67: 상가/아파트와 똑같은 접기 섹션 패턴을 주택 목록에도 적용
function toggleHomeResSection(){
  const body=document.getElementById('home-res-body');
  const icon=document.getElementById('home-res-toggle-icon');
  if(!body)return;
  const willShow=body.classList.contains('hide');
  body.classList.toggle('hide',!willShow);
  if(icon)icon.textContent=willShow?'▾':'▸';
  if(willShow)renderHomeZoneList(document.getElementById('home-zone-search')?.value||'');
}
function toggleHomeCommercialSection(){
  const body=document.getElementById('home-com-body');
  const icon=document.getElementById('home-com-toggle-icon');
  if(!body)return;
  const willShow=body.classList.contains('hide');
  body.classList.toggle('hide',!willShow);
  if(icon)icon.textContent=willShow?'▾':'▸';
  if(willShow)renderHomeCommercialList();
}
function setHomeComFilter(mode,el){
  homeComFilter=mode;
  document.querySelectorAll('#home-com-section .chip').forEach(c=>c.classList.remove('on'));
  if(el)el.classList.add('on');
  renderHomeCommercialList();
}
function renderHomeCommercialList(){
  const all=S.zones.filter(z=>z.type==='commercial');
  const countEl=document.getElementById('home-com-count');
  if(countEl)countEl.textContent=all.length;
  // V2 H67: 미완료 우선, 완료는 뒤로(구역/아파트와 동일 규칙)
  let zones=[...all].sort((a,b)=>(isDone(a.id)?1:0)-(isDone(b.id)?1:0)||(Number(a.id)||0)-(Number(b.id)||0)||a.name.localeCompare(b.name,'ko',{numeric:true}));
  zones=zones.filter(z=>homeComFilter==='all'||(homeComFilter==='undone'&&!isDone(z.id))||(homeComFilter==='done'&&isDone(z.id)));
  const wrap=document.getElementById('home-com-list');
  if(!wrap)return;
  if(!zones.length){
    wrap.innerHTML='<p style="font-size:13px;color:var(--txm);text-align:center;padding:14px 0;">해당하는 상가 구역이 없습니다.</p>';
    return;
  }
  wrap.innerHTML=zones.map(z=>{
    const done=isDone(z.id);
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
    return `<div id="home-zone-item-${z.id}" class="home-zone-row home-zone-row-kakao com ${selected?'selected':''}" onclick="selectHomeZone(${z.id})">
      <div style="min-width:0;">
        <div class="home-zone-title"><span>${zoneDisplayLabel(z.id)} </span>${esc(displayZoneNameCleaned(z.name))}</div>
        <div class="home-zone-meta">상가 · ${z.streets.length}개 거리</div>
      </div>
      <span class="zc-status ${statusClass}">${status}</span>
      <button class="btn btn-sm btn-out home-zone-action" onclick="event.stopPropagation();openZoneKakaoStart(${z.id})" style="flex-shrink:0;">카카오맵</button>
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

// ================================================================
// V2 J1 PART1: S-13 구역 배정 기록 — 봉사년도 유틸 + assignment cycle
// 데이터모델 + 자동기록(docs/S13_SPEC_20260829.md 기준).
// 기존 봉사시작/이어하기/완료 로직은 전혀 수정하지 않고, 각 트리거
// 끝에 이 모듈의 기록 함수 호출만 추가한다. 이 모듈 자체는 house
// zone/apartment card 어느 쪽 데이터도 직접 변경하지 않는다(읽기만).
// ================================================================
function getServiceYear(date){
  const d=date instanceof Date?date:new Date(date);
  const y=d.getFullYear();
  const m=d.getMonth()+1; // 1~12
  return m>=9?y+1:y; // 9~12월=현재연도+1, 1~8월=현재연도
}
function s13TerritoryIdForZone(zoneId){return 'zone-'+zoneId;}
function s13TerritoryIdForAptCard(cardId){return 'apt-'+cardId;}
function loadS13Records(){
  try{
    const data=JSON.parse(storageGet('sokcho_s13_v1')||'null');
    if(data&&Array.isArray(data.records))return data.records;
  }catch(e){}
  return [];
}
function persistS13Records(records){
  storageSet('sokcho_s13_v1',JSON.stringify({schemaVersion:1,records}));
}
function findOrCreateS13Record(records,territoryId,territoryType,zoneNumber,serviceYear){
  let record=records.find(r=>r.territoryId===territoryId&&r.serviceYear===serviceYear);
  if(!record){
    record={id:territoryId+'-'+serviceYear,territoryId,territoryType,zoneNumber,serviceYear,cycles:[],lastCompletedAt:null,overflow:[]};
    records.push(record);
  }else{
    // 구역번호/유형이 그 사이 바뀌었을 수 있으니 최신 값으로 갱신(배정 이력 자체는 안 건드림)
    record.zoneNumber=zoneNumber;
    record.territoryType=territoryType;
  }
  return record;
}
// 같은 territory에서 아직 완료되지 않은(=진행중인) cycle을 봉사년도 구분 없이 전부 뒤진다.
// (배정~완료 사이에 봉사년도 경계를 넘어갈 수 있으므로, 완료 처리 시점에는 "현재 봉사년도"가
// 아니라 실제로 열려있는 cycle을 찾아야 한다.)
function findOpenS13Cycle(records,territoryId){
  for(const record of records){
    if(record.territoryId!==territoryId)continue;
    const openCycle=record.cycles.find(c=>!c.completedAt);
    if(openCycle)return{record,cycle:openCycle};
  }
  return null;
}
// 봉사 시작 트리거에서 호출. 이미 열려있는(미완료) cycle이 있으면 "이어하기"로
// 간주해 배정자/배정일을 그대로 두고 아무것도 하지 않는다(SCOPE 3/5, 명세 9·10).
function recordS13AssignmentStart(territoryId,territoryType,zoneNumber,publisher,atMs){
  const records=loadS13Records();
  if(findOpenS13Cycle(records,territoryId))return;
  const serviceYear=getServiceYear(new Date(atMs));
  const record=findOrCreateS13Record(records,territoryId,territoryType,zoneNumber,serviceYear);
  const nextIndex=record.cycles.length+1;
  const cycle={cycleIndex:nextIndex,assignedPublisher:publisher,assignedAt:atMs,completedAt:null};
  if(nextIndex<=4)record.cycles.push(cycle);
  else record.overflow.push({...cycle,cycleIndex:nextIndex}); // 4회 초과분은 삭제하지 않고 overflow에 보존(명세 14)
  persistS13Records(records);
}
// 완료 트리거에서 호출. 열려있는 cycle을 찾아 completedAt만 채운다(배정자는 그대로).
function recordS13Completion(territoryId,atMs){
  const records=loadS13Records();
  const found=findOpenS13Cycle(records,territoryId);
  if(!found)return; // 열려있는 cycle이 없으면(이미 완료됐거나 기록이 없으면) 아무것도 안 함
  found.cycle.completedAt=atMs;
  found.record.lastCompletedAt=atMs;
  persistS13Records(records);
}

// ================================================================
// V2 J1 PART2: S-13 열람 화면(인도자/관리자 전용, 읽기 전용). 관리자
// correction/PDF 출력/과거사진 import는 이번 범위 밖(명세 20~30).
// ================================================================
function getS13CongregationName(){
  return storageGet('sokcho_s13_congregation')||'';
}
function setS13CongregationName(name){
  const trimmed=(name||'').trim();
  const display=trimmed?(trimmed.endsWith('회중')?trimmed:trimmed+'회중'):'';
  storageSet('sokcho_s13_congregation',display);
  return display;
}
function saveS13CongregationNameFromInput(){
  const inp=document.getElementById('s13-congregation-input');
  const saved=setS13CongregationName(inp?.value||'');
  if(inp)inp.value=saved;
  renderS13Viewer();
  toast('회중 이름이 저장되었습니다.');
}
function s13AvailableYears(){
  const records=loadS13Records();
  const years=new Set(records.map(r=>r.serviceYear));
  years.add(getServiceYear(new Date()));
  return Array.from(years).sort((a,b)=>b-a);
}
function formatS13Date(ms){
  if(!Number.isFinite(ms))return'';
  const d=new Date(ms);
  return `${d.getMonth()+1}/${d.getDate()}`;
}
let s13ViewerYear=null;
function openS13Viewer(){
  if(S.role!=='admin'&&S.role!=='leader'){toast('인도자·관리자만 열람할 수 있습니다.');return;}
  s13ViewerYear=getServiceYear(new Date());
  const modal=document.getElementById('s13-viewer');
  if(modal)modal.classList.add('on');
  renderS13Viewer();
}
function closeS13Viewer(){
  const modal=document.getElementById('s13-viewer');
  if(modal)modal.classList.remove('on');
}
function setS13ViewerYear(year){
  s13ViewerYear=Number(year);
  renderS13Viewer();
}
function renderS13Viewer(){
  const yearSel=document.getElementById('s13-year-select');
  if(yearSel){
    const years=s13AvailableYears();
    yearSel.innerHTML=years.map(y=>`<option value="${y}" ${y===s13ViewerYear?'selected':''}>${y}</option>`).join('');
  }
  const nameInp=document.getElementById('s13-congregation-input');
  if(nameInp&&document.activeElement!==nameInp)nameInp.value=getS13CongregationName();
  const titleEl=document.getElementById('s13-viewer-title');
  if(titleEl)titleEl.textContent=`${s13ViewerYear} 봉사년도`;
  const congEl=document.getElementById('s13-congregation-display');
  if(congEl)congEl.textContent=getS13CongregationName();

  // V2 H33: 인쇄/미리보기 전용 상단 제목·회중명·작성일(명세 3·4)
  const printYearEl=document.getElementById('s13-print-year-line');
  if(printYearEl)printYearEl.textContent=`${s13ViewerYear} 봉사년도`;
  const printCongEl=document.getElementById('s13-print-cong');
  if(printCongEl)printCongEl.textContent=getS13CongregationName();
  const printDateEl=document.getElementById('s13-print-date');
  if(printDateEl){
    const now=new Date();
    printDateEl.textContent=`작성일: ${now.getFullYear()}. ${now.getMonth()+1}. ${now.getDate()}.`;
  }

  const records=loadS13Records().filter(r=>r.serviceYear===s13ViewerYear)
    .sort((a,b)=>(Number(a.zoneNumber)||0)-(Number(b.zoneNumber)||0)||String(a.zoneNumber).localeCompare(String(b.zoneNumber),'ko',{numeric:true}));
  const wrap=document.getElementById('s13-table-wrap');
  if(!wrap)return;
  if(!records.length){
    wrap.innerHTML='<p style="font-size:13px;color:var(--txm);text-align:center;padding:24px 0;">이 봉사년도에는 아직 기록이 없습니다.</p>';
    return;
  }
  const editable=S.role==='admin'; // V2 H33: 관리자만 표의 값을 눌러서 수정 가능(명세 20)
  wrap.innerHTML=`<table class="s13-table">
    <thead>
      <tr>
        <th rowspan="2">구역<br>번호</th>
        <th rowspan="2">마지막으로<br>완료한 날짜</th>
        ${[1,2,3,4].map(()=>'<th colspan="3">배정된 전도인</th>').join('')}
      </tr>
      <tr>
        ${[1,2,3,4].map(()=>'<th>전도인</th><th>배정 날짜</th><th>완료 날짜</th>').join('')}
      </tr>
    </thead>
    <tbody>
      ${records.map(r=>{
        const cycles=[0,1,2,3].map(i=>r.cycles[i]||null);
        return `<tr>
          <td${editable?` class="s13-editable" onclick="editS13ZoneNumber('${r.id}')"`:''}>${esc(r.zoneNumber)}</td>
          <td${editable?` class="s13-editable" onclick="editS13LastCompleted('${r.id}')"`:''}>${formatS13Date(r.lastCompletedAt)}</td>
          ${cycles.map((c,i)=>editable
            ?`<td class="s13-editable" onclick="editS13CyclePublisher('${r.id}',${i})">${c?esc(c.assignedPublisher):''}</td><td class="s13-editable" onclick="editS13CycleDate('${r.id}',${i},'assignedAt')">${c?formatS13Date(c.assignedAt):''}</td><td class="s13-editable" onclick="editS13CycleDate('${r.id}',${i},'completedAt')">${c?formatS13Date(c.completedAt):''}</td>`
            :`<td>${c?esc(c.assignedPublisher):''}</td><td>${c?formatS13Date(c.assignedAt):''}</td><td>${c?formatS13Date(c.completedAt):''}</td>`
          ).join('')}
        </tr>`;
      }).join('')}
    </tbody>
  </table>`;
}

// V2 H33: 관리자 수정(명세 20) — 구역번호/마지막완료날짜/배정된전도인/
// 배정날짜/완료날짜만 수정 가능. 자동 기록된 원본 event 자체(S.records,
// S.aptSession 등)는 건드리지 않고 S-13 projection(loadS13Records/
// persistS13Records)만 정정한다. 날짜는 화면 표시와 동일하게 M/D로
// 입력받아, 그 구역배정기록의 봉사년도 기준으로 실제 연도를 복원한다.
function s13ParseMMDD(input,serviceYear){
  const m=String(input||'').trim().match(/^(\d{1,2})\s*\/\s*(\d{1,2})$/);
  if(!m)return null;
  const month=Number(m[1]),day=Number(m[2]);
  if(month<1||month>12||day<1||day>31)return null;
  const year=month>=9?serviceYear-1:serviceYear; // 봉사년도 역산(getServiceYear의 역함수)
  const d=new Date(year,month-1,day,12,0,0);
  return d.getTime();
}
function editS13ZoneNumber(recordId){
  if(S.role!=='admin')return;
  const records=loadS13Records();
  const record=records.find(r=>r.id===recordId);
  if(!record)return;
  const next=prompt('구역 번호를 입력하세요.',record.zoneNumber);
  if(next==null)return;
  const trimmed=String(next).trim();
  if(!trimmed){toast('구역 번호를 입력하세요.');return;}
  record.zoneNumber=trimmed;
  persistS13Records(records);
  renderS13Viewer();
  toast('구역 번호가 수정되었습니다.');
}
function editS13LastCompleted(recordId){
  if(S.role!=='admin')return;
  const records=loadS13Records();
  const record=records.find(r=>r.id===recordId);
  if(!record)return;
  const next=prompt('마지막으로 완료한 날짜를 M/D로 입력하세요(예: 9/14). 비우면 삭제됩니다.',formatS13Date(record.lastCompletedAt));
  if(next==null)return;
  if(!String(next).trim()){
    record.lastCompletedAt=null;
  }else{
    const ms=s13ParseMMDD(next,record.serviceYear);
    if(ms==null){toast('날짜 형식이 올바르지 않습니다. 예: 9/14');return;}
    record.lastCompletedAt=ms;
  }
  persistS13Records(records);
  renderS13Viewer();
  toast('마지막 완료 날짜가 수정되었습니다.');
}
function editS13CyclePublisher(recordId,cycleIdx){
  if(S.role!=='admin')return;
  const records=loadS13Records();
  const record=records.find(r=>r.id===recordId);
  if(!record)return;
  const cycle=record.cycles[cycleIdx];
  if(!cycle){toast('해당 회차 기록이 없습니다. 실제 봉사 시작 시 자동으로 생성됩니다.');return;}
  const next=prompt('배정된 전도인 이름을 입력하세요.',cycle.assignedPublisher||'');
  if(next==null)return;
  const trimmed=String(next).trim();
  if(!trimmed){toast('이름을 입력하세요.');return;}
  cycle.assignedPublisher=trimmed;
  persistS13Records(records);
  renderS13Viewer();
  toast('배정된 전도인이 수정되었습니다.');
}
function editS13CycleDate(recordId,cycleIdx,field){
  if(S.role!=='admin')return;
  const records=loadS13Records();
  const record=records.find(r=>r.id===recordId);
  if(!record)return;
  const cycle=record.cycles[cycleIdx];
  if(!cycle){toast('해당 회차 기록이 없습니다. 실제 봉사 시작 시 자동으로 생성됩니다.');return;}
  const label=field==='assignedAt'?'배정 날짜':'완료 날짜';
  const hint=field==='completedAt'?' 비우면 미완료 상태로 되돌립니다.':'';
  const next=prompt(`${label}를 M/D로 입력하세요(예: 9/14).${hint}`,formatS13Date(cycle[field]));
  if(next==null)return;
  if(field==='completedAt'&&!String(next).trim()){
    cycle.completedAt=null;
  }else{
    const ms=s13ParseMMDD(next,record.serviceYear);
    if(ms==null){toast('날짜 형식이 올바르지 않습니다. 예: 9/14');return;}
    cycle[field]=ms;
  }
  persistS13Records(records);
  renderS13Viewer();
  toast(`${label}가 수정되었습니다.`);
}

// V2 H33: 미리보기(원본 서식 그대로 화면에서 미리 확인) + 인쇄/PDF 저장.
// window.print()는 모든 주요 브라우저가 지원하고, "PDF로 저장"을
// 프린터로 선택하면 OS 표준 저장 대화상자가 그대로 뜨므로(저장 위치
// 지정 요건 충족) 별도 PDF 생성 라이브러리(CDN 의존)를 새로 들이지
// 않았다 — @media print CSS가 이미 원본과 동일한 표 구조를 재현한다.
let s13PreviewOn=false;
function toggleS13Preview(){
  s13PreviewOn=!s13PreviewOn;
  const card=document.querySelector('#s13-viewer .s13-viewer-card');
  if(card)card.classList.toggle('s13-preview-mode',s13PreviewOn);
  const btn=document.getElementById('s13-preview-btn');
  if(btn)btn.textContent=s13PreviewOn?'✏️ 편집 화면으로':'👁 미리보기';
  renderS13Viewer();
}
function printS13(){
  renderS13Viewer();
  window.print();
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
  recordS13AssignmentStart(s13TerritoryIdForZone(z.id),z.type,z.id,S.user,S.session.startTime); // V2 J1: S-13 배정 기록
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
    const data=JSON.parse(storageGet('sokcho_progress')||'{}');
    data[zoneId]=z.progress;
    storageSet('sokcho_progress',JSON.stringify(data));
  }catch(e){}
}

function updateSessionStorage(){
  try{
    const data=JSON.parse(storageGet('sokcho_live')||'{}');
    if(data[S.user]){
      data[S.user].sessionZone=S.session.zoneId;
      data[S.user].sessionStart=S.session.startTime;
      storageSet('sokcho_live',JSON.stringify(data));
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
    const data=JSON.parse(storageGet('sokcho_progress')||'{}');
    data[zoneId]=z.progress;
    storageSet('sokcho_progress',JSON.stringify(data));
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
      const data=JSON.parse(storageGet('sokcho_progress')||'{}');
      if(data[zoneId])data[zoneId].note='';
      storageSet('sokcho_progress',JSON.stringify(data));
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
  if(completed)recordS13Completion(s13TerritoryIdForZone(zoneId),Date.now()); // V2 J1: S-13 완료 기록(미완료 저장은 기록 안 함)
  persistRecords();
  // GPS 중지
  if(S.session.gpsWatch){navigator.geolocation.clearWatch(S.session.gpsWatch);S.session.gpsWatch=null;}
  if(completed){
    // 완료 시 진행 데이터 초기화
    const z=S.zones.find(z=>z.id===zoneId);
    if(z)z.progress=null;
    clearZoneReset(zoneId);
    try{
      const data=JSON.parse(storageGet('sokcho_progress')||'{}');
      delete data[zoneId];
      storageSet('sokcho_progress',JSON.stringify(data));
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
let svcKakaoPoly=null;

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

function drawSvcZonePolygon(z){
  if(!svcMapInst||!z)return;
  const kakaoMap=_kakaoInstances['svc-map'];
  if(!kakaoMap||!window.kakao?.maps?.Polygon)return;
  if(svcKakaoPoly)svcKakaoPoly.setMap(null);
  const path=(z.polygon||[]).map(pt=>new kakao.maps.LatLng(Number(pt[0]),Number(pt[1])));
  svcKakaoPoly=new kakao.maps.Polygon({path,strokeWeight:3.5,strokeColor:zoneStrokeColor(z,true),strokeOpacity:1,fillColor:zoneFillColor(z,true),fillOpacity:.05}); // V2 H77: 구역 1개만 보여주는 봉사 진행화면 — 고유색 유지
  svcKakaoPoly.setMap(kakaoMap);
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
  drawSvcZonePolygon(z);
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
  loadApartmentRegistry();
  loadApartmentCards();
  const recEmail=document.getElementById('admin-recovery-email');
  if(recEmail)recEmail.value=getAdminRecoveryEmail();
  document.getElementById('a-tot').textContent=S.records.length;
  document.getElementById('a-vol').textContent=S.volunteers.length;
  renderMonChart();renderZoneChart();renderVolList();renderAdmGrid();renderLeaderList();renderApartmentComplexList();renderApartmentCardGenPanel();renderCardBuilder();renderApartmentCardList();renderResearchList();
}
function renderMonChart(){
  const c=new Array(12).fill(0);S.records.forEach(r=>{c[parseInt(r.date.split('-')[1])-1]++;});
  document.getElementById('mon-chart').innerHTML='<div class="compact-counts">'+Array.from({length:12},(_,i)=>`<span class="count-chip">${i+1}월 <b>${c[i]}</b></span>`).join('')+'</div>';
}
function renderZoneChart(){
  // V2: 다른 화면들(H48)과 동일하게 재정리된 번호(#대표-순번/#id)와
  // 접두번호 제거된 이름을 보여준다 — 예전엔 원본 이름만(번호 없이)
  // 표시해서 재정리된 새 번호가 여기만 반영 안 된 것처럼 보였음.
  const d=S.zones.map(z=>({lbl:zoneDisplayLabel(z.id),n:displayZoneNameCleaned(z.name),c:S.records.filter(r=>r.zoneId===z.id).length})).sort((a,b)=>b.c-a.c||a.n.localeCompare(b.n,'ko'));
  document.getElementById('zone-chart').innerHTML='<div class="compact-counts">'+d.map(x=>`<span class="count-chip">${esc(x.lbl)} ${esc(x.n).slice(0,8)} <b>${x.c}</b></span>`).join('')+'</div>';
}
function renderVolList(){
  const countEl=document.getElementById('adm-vol-count');
  if(countEl)countEl.textContent=S.volunteers.length;
  document.getElementById('vol-list').innerHTML=S.volunteers.map(v=>{
    const c=S.records.filter(r=>r.volunteer===v).length;
    return `<div class="vol-row">
      <div><div style="font-size:13px;font-weight:700;">${esc(v)}</div><div style="font-size:12px;color:var(--txm);">총 ${c}회</div></div>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-sm btn-out" onclick="editVol('${jsq(v)}')">수정</button>
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
// V2 H18: 주택카드 이름 앞의 내부 참조번호("숫자-숫자 ") 접두사를 관리자
// 구역 목록에서만 화면 표시 시점에 제거한다(원본 데이터/zones_seed.js는
// 그대로 유지 — loadCoreData()의 이름 기반 재시딩 매칭과 충돌해 중복
// 구역이 재생성되는 것을 피하기 위함). "숫자-숫자-숫자 " 같은 다른 형식은
// 건드리지 않는다(조사 결과 별개 패턴으로 확인됨, 추측 처리 금지).
function displayZoneNameCleaned(name){
  // V2 H48: zoneMapLabel()과 동일한 정규식으로 통일 — 기존 버전은
  // "8-01 " 같은 2단계 접두만 지웠고 "100-01-1 " 같은 3단계 접두는
  // 못 지웠던 버그를 함께 고침(딘이 예로 든 두 형태 모두 검증됨).
  return String(name||'').replace(/^\s*\d{1,3}-\d{1,3}(?:-\d+)?\s+/,'').trim() || String(name||'');
}
// V2 H48: 실제 내부 id(1001~/3001~/4001~ 재정리 완료된 고유 숫자)는
// 절대 바꾸지 않는다 — S-13/삭제목록/봉사기록/route 등 여러 곳이 이
// id를 그대로 참조하기 때문. 화면에 보여줄 라벨만 렌더링 시점에
// 계산한다: 순수이름(접두번호 제거)이 같은 구역이 2개 이상이면
// "#그룹대표id-순번"(대표id=그룹 내 최소 id, 순번=id 오름차순 1,2,3...),
// 혼자면 "#원래id" 그대로.
function zoneGroupLabelMap(){
  const groups={};
  S.zones.forEach(z=>{
    const key=displayZoneNameCleaned(z.name);
    (groups[key]=groups[key]||[]).push(z);
  });
  const labelById={};
  Object.values(groups).forEach(list=>{
    list.sort((a,b)=>(Number(a.id)||0)-(Number(b.id)||0));
    if(list.length>=2){
      const rep=list[0].id;
      list.forEach((z,i)=>{labelById[z.id]=`#${rep}-${i+1}`;});
    }else{
      labelById[list[0].id]=`#${list[0].id}`;
    }
  });
  return labelById;
}
function zoneDisplayLabel(zoneId){
  return zoneGroupLabelMap()[zoneId]||`#${zoneId}`;
}
function renameZoneName(zoneId){
  const z=S.zones.find(z=>z.id===zoneId);
  if(!z)return;
  const next=prompt('구역 이름을 입력하세요.',displayZoneNameCleaned(z.name));
  if(next==null)return; // 취소
  const trimmed=next.trim();
  if(!trimmed){toast('이름을 입력하세요.');return;}
  z.name=trimmed;
  persistZones();
  renderAdmGrid();
  drawAllZones(null);
  renderSideList();
  renderHomeZoneList(document.getElementById('home-zone-search')?.value||'');
  toast('구역 이름이 저장되었습니다.');
}
// V2 H22: 관리자가 잘못 분류된 구역의 type(주택/상가)만 수동으로 바꿀 수
// 있게 함. Polygon/좌표/2인4인/route point 등 다른 필드는 전혀 손대지
// 않고 z.type 한 필드만 갱신 — H21에서 만든 홈 화면 섹션 분리 로직은
// z.type을 그대로 참조하므로 재작성 없이 자동으로 올바른 섹션에 반영됨.
function toggleZoneType(zoneId){
  const z=S.zones.find(z=>z.id===zoneId);
  if(!z)return;
  const next=z.type==='residential'?'commercial':'residential';
  const curLabel=z.type==='residential'?'주택':'상가';
  const nextLabel=next==='residential'?'주택':'상가';
  if(!confirm(`"${z.name}" 구역을 ${curLabel}에서 ${nextLabel}(으)로 유형을 바꿀까요?`))return;
  z.type=next;
  persistZones();
  renderAdmGrid();
  drawAllZones(null);
  renderSideList();
  renderRouteGrid();
  renderHomeZoneList(document.getElementById('home-zone-search')?.value||'');
  toast(`"${z.name}" 유형을 ${nextLabel}(으)로 변경했습니다.`);
}
// V2 H35: 주택/상가 그리드가 공유하는 행 템플릿(복붙 대신 공통 함수화).
// 각 버튼(완료/미완료/초기화/번호수정/유형변경/그리기/지도보기/삭제)의
// onclick은 기존 renderAdmGrid에 있던 것을 그대로 옮겼을 뿐 무수정.
function renderAdminZoneRowHtml(z){
  const isRes=z.type==='residential';
  const done=isDone(z.id);
  const inProg=isInProgress(z.id);
  const meta=getZoneStatusMeta(z.id);
  const c=S.records.filter(r=>r.zoneId===z.id).length;
  const routeCnt=S.rteLines.filter(r=>r.zoneId===z.id).length;
  const selected=String(activeZoneId())===String(z.id);
  return `<div id="admin-zone-item-${z.id}" class="admin-zone-row ${isRes?'res':'com'} ${selected?'selected':''}">
    <div class="admin-zone-no">${zoneDisplayLabel(z.id)}</div>
    <div style="min-width:0;">
      <div class="admin-zone-name"><span class="admin-zone-name-text">${esc(displayZoneNameCleaned(z.name))}</span></div>
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
      <button class="btn btn-sm btn-out" onclick="renameZoneName(${z.id})">✏ 명칭수정</button>
      <button class="btn btn-sm btn-out" onclick="toggleZoneType(${z.id})">${isRes?'유형변경(→상가)':'유형변경(→주택)'}</button>
      <button class="btn btn-sm btn-out" onclick="goAdminZoneDraw(${z.id})">구역경계그리기</button>
      <button class="btn btn-sm btn-out" onclick="goAdminZoneMapView(${z.id})">🗺 지도보기</button>
      <button class="btn btn-sm btn-dk" onclick="delZone(${z.id})">삭제</button>
    </div>
  </div>`;
}
function adminZoneFilterSort(zones){
  let filtered=zones;
  if(adminZoneFilter==='done')filtered=filtered.filter(z=>isDone(z.id));
  if(adminZoneFilter==='undone')filtered=filtered.filter(z=>isInProgress(z.id));
  if(adminZoneFilter==='standby')filtered=filtered.filter(z=>getZoneState(z.id)==='standby');
  if(adminZoneKeyword.trim()){
    const kw=adminZoneKeyword.trim().toLowerCase();
    filtered=filtered.filter(z=>z.name.toLowerCase().includes(kw)||String(z.id).includes(kw)||z.streets.some(s=>s.toLowerCase().includes(kw)));
  }
  return filtered.sort((a,b)=>(Number(a.id)||0)-(Number(b.id)||0)||a.name.localeCompare(b.name,'ko',{numeric:true}));
}
// V2 H102: 주택 목록 렌더링을 renderAdmGrid()에서 분리(renderAdmCommercialGrid()와
// 동일한 모양 — 개수 표시(adm-res-count) + 목록 렌더 한 벌). renderAdmGrid()는
// 기존 호출부(setAdminZoneFilter/searchAdminZones/renameZoneName 등) 전부 그대로
// 동작하도록 이 함수 + renderAdmCommercialGrid()를 순서대로 호출만 함.
function renderAdmResidentialGrid(){
  const all=S.zones.filter(z=>z.type==='residential');
  const countEl=document.getElementById('adm-res-count');
  if(countEl)countEl.textContent=all.length;
  const zones=adminZoneFilterSort(all);
  const grid=document.getElementById('adm-grid');
  grid.innerHTML=zones.length?zones.map(renderAdminZoneRowHtml).join(''):'<p style="font-size:12px;color:var(--txm);padding:12px;text-align:center;">표시할 구역이 없습니다.</p>';
}
function renderAdmGrid(){
  renderAdmResidentialGrid();
  renderAdmCommercialGrid(); // V2 H35: 이 함수가 호출되는 모든 지점에서 상가 섹션도 함께 새로고침
}
// V2 H102: 상가(toggleAdminComSection)와 동일한 접기/펼치기 패턴을 주택에도 적용.
let adminResSectionOpen=false;
function toggleAdminResSection(){
  const body=document.getElementById('adm-res-body');
  const icon=document.getElementById('adm-res-toggle-icon');
  if(!body)return;
  adminResSectionOpen=body.classList.contains('hide');
  body.classList.toggle('hide',!adminResSectionOpen);
  if(icon)icon.textContent=adminResSectionOpen?'▾':'▸';
  if(adminResSectionOpen)renderAdmResidentialGrid();
}
// V2 H35: 관리자 구역관리 화면의 상가 섹션(H21 홈 화면 패턴과 동일한
// 헤더+개수, 접이식 UI 재사용 — CSS는 home-apt-section 계열 그대로,
// 필터/검색은 기존 adminZoneFilter/adminZoneKeyword를 주택 목록과
// 공유한다(SCOPE: "각 섹션 안에서 필터 적용"과 자연스럽게 맞물림).
let adminComSectionOpen=false;
function toggleAdminComSection(){
  const body=document.getElementById('adm-com-body');
  const icon=document.getElementById('adm-com-toggle-icon');
  if(!body)return;
  adminComSectionOpen=body.classList.contains('hide');
  body.classList.toggle('hide',!adminComSectionOpen);
  if(icon)icon.textContent=adminComSectionOpen?'▾':'▸';
  if(adminComSectionOpen)renderAdmCommercialGrid();
}
// V2: 아파트 카드 목록만 상가 바로 아래로 옮겨 접기/펼치기(단지등록/
// 카드생성 도구는 딘 요청대로 별도의 항상 펼쳐진 블록으로 분리했고,
// renderAdmin()이 이미 그 블록들의 render 함수를 매번 직접 호출하므로
// 여기서 따로 호출할 필요 없음 — 카드 목록만 펼칠 때 갱신).
let adminAptCardsSectionOpen=false;
function toggleAdminAptCardsSection(){
  const body=document.getElementById('adm-aptcards-body');
  const icon=document.getElementById('adm-aptcards-toggle-icon');
  if(!body)return;
  adminAptCardsSectionOpen=body.classList.contains('hide');
  body.classList.toggle('hide',!adminAptCardsSectionOpen);
  if(icon)icon.textContent=adminAptCardsSectionOpen?'▾':'▸';
  if(adminAptCardsSectionOpen)renderApartmentCardList();
}
// V2: 인도자/봉사자 명단도 상가/아파트와 동일한 접기/펼치기 패턴.
let adminLeaderSectionOpen=false;
function toggleAdminLeaderSection(){
  const body=document.getElementById('adm-leader-body');
  const icon=document.getElementById('adm-leader-toggle-icon');
  if(!body)return;
  adminLeaderSectionOpen=body.classList.contains('hide');
  body.classList.toggle('hide',!adminLeaderSectionOpen);
  if(icon)icon.textContent=adminLeaderSectionOpen?'▾':'▸';
  if(adminLeaderSectionOpen)renderLeaderList();
}
let adminVolSectionOpen=false;
function toggleAdminVolSection(){
  const body=document.getElementById('adm-vol-body');
  const icon=document.getElementById('adm-vol-toggle-icon');
  if(!body)return;
  adminVolSectionOpen=body.classList.contains('hide');
  body.classList.toggle('hide',!adminVolSectionOpen);
  if(icon)icon.textContent=adminVolSectionOpen?'▾':'▸';
  if(adminVolSectionOpen)renderVolList();
}
function renderAdmCommercialGrid(){
  const all=S.zones.filter(z=>z.type==='commercial');
  const countEl=document.getElementById('adm-com-count');
  if(countEl)countEl.textContent=all.length;
  const zones=adminZoneFilterSort(all);
  const grid=document.getElementById('adm-com-grid');
  if(!grid)return;
  grid.innerHTML=zones.length?zones.map(renderAdminZoneRowHtml).join(''):'<p style="font-size:12px;color:var(--txm);padding:12px;text-align:center;">표시할 상가 구역이 없습니다.</p>';
}
function addVol(){const nm=document.getElementById('nv-inp').value.trim();if(!nm){toast('이름 입력');return;}if(S.volunteers.includes(nm)){toast('이미 있음');return;}S.volunteers.push(nm);persistVolunteers();document.getElementById('nv-inp').value='';renderVolList();fillSel();toast(`${nm} 추가`);}
function rmVol(nm){S.volunteers=S.volunteers.filter(v=>v!==nm);persistVolunteers();renderVolList();fillSel();toast(`${nm} 삭제`);}
function editVol(oldName){
  const next=prompt('봉사자 이름을 입력하세요.',oldName);
  if(next==null)return; // 취소
  const trimmed=next.trim();
  if(!trimmed){toast('이름을 입력하세요.');return;}
  if(trimmed===oldName)return;
  if(S.volunteers.includes(trimmed)){toast('이미 있는 이름입니다.');return;}
  S.volunteers=S.volunteers.map(v=>v===oldName?trimmed:v);
  if(S.contacts[oldName]){S.contacts[trimmed]=S.contacts[oldName];delete S.contacts[oldName];persistContacts();}
  S.records.forEach(r=>{if(r.volunteer===oldName)r.volunteer=trimmed;});
  persistVolunteers();persistRecords();
  renderVolList();fillSel();
  toast(`${oldName} → ${trimmed}로 수정되었습니다.`);
}
function delZone(id){
  if(!confirm('삭제하시겠습니까?'))return;
  S.zones=S.zones.filter(z=>z.id!==id);
  S.rteLines=S.rteLines.filter(l=>l.zoneId!==id);
  addDeletedZoneId(id);
  persistZones();
  persistRteLines();
  // V2 H32: 삭제 자체(위 데이터/저장 처리)는 이미 끝난 상태 — 그 뒤
  // 화면 갱신 4개가 하나의 호출 사슬로 묶여있으면, 그중 하나가
  // (지도/사이드목록/경로화면 등 다른 화면 렌더에서) 예외를 던질 때
  // 그 뒤 호출(특히 관리자 목록 재렌더와 완료 토스트)까지 전부
  // 실행되지 않아 "삭제됐는데 화면엔 그대로 남아있다"로 보이는
  // 문제가 있었다. 지금 보고 있는 화면(관리자 목록)부터 최우선으로,
  // 각 갱신을 서로 독립적으로 보호해 하나가 실패해도 나머지는
  // 정상 반영되게 한다.
  try{renderAdmin();}catch(e){console.error('구역 삭제 후 renderAdmin 갱신 실패',e);}
  try{drawAllZones(null);}catch(e){console.error('구역 삭제 후 drawAllZones 갱신 실패',e);}
  try{renderSideList();}catch(e){console.error('구역 삭제 후 renderSideList 갱신 실패',e);}
  try{renderRouteGrid();}catch(e){console.error('구역 삭제 후 renderRouteGrid 갱신 실패',e);}
  toast('구역 삭제됨');
}
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
    const data=JSON.parse(storageGet('sokcho_progress')||'{}');
    delete data[id];
    storageSet('sokcho_progress',JSON.stringify(data));
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
  try{progress=JSON.parse(storageGet('sokcho_progress')||'{}')||{};}catch(e){}
  // V2 H16: 아파트 레지스트리/카드/S-13/영구삭제 목록도 백업에 포함. 아직 메모리에
  // 로드 안 됐을 수 있으니(관리자 화면을 한 번도 안 열었다면) 먼저 로드부터 확실히 함.
  loadApartmentRegistry();
  loadApartmentCards();
  return {
    app:'sokcho-service-area',
    version:3,
    savedAt:new Date().toISOString(),
    zones:S.zones,
    records:S.records,
    routes:S.rteLines.map(({id,zoneId,mode,name,color,pts,visible,createdAt})=>({id,zoneId,mode,name,color,pts,visible,createdAt})),
    volunteers:S.volunteers,
    leaders:S.leaders,
    contacts:S.contacts,
    progress,
    apartmentComplexes:S.apartmentComplexes,
    apartmentCards:S.apartmentCards,
    s13Records:loadS13Records(),
    s13Congregation:getS13CongregationName(),
    deletedZoneIds:loadDeletedZoneIds(),
    deletedApartmentCardIds:loadDeletedApartmentCardIds(),
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
      if(data.progress&&typeof data.progress==='object')storageSet('sokcho_progress',JSON.stringify(data.progress));
      // V2 H16: 구버전(version 2 이하) 백업 파일에는 아래 필드가 없을 수 있으니
      // Array.isArray/타입 체크로 있을 때만 복원한다(하위호환, 없으면 현재 값 유지).
      if(Array.isArray(data.apartmentComplexes)){S.apartmentComplexes=data.apartmentComplexes;S._apartmentRegistryLoaded=true;}
      if(Array.isArray(data.apartmentCards)){S.apartmentCards=data.apartmentCards;S._apartmentCardsLoaded=true;}
      if(Array.isArray(data.s13Records))storageSet('sokcho_s13_v1',JSON.stringify({schemaVersion:1,records:data.s13Records}));
      if(typeof data.s13Congregation==='string')storageSet('sokcho_s13_congregation',data.s13Congregation);
      if(Array.isArray(data.deletedZoneIds))storageSet('sokcho_deleted_zone_ids',JSON.stringify(data.deletedZoneIds));
      if(Array.isArray(data.deletedApartmentCardIds))storageSet('sokcho_deleted_apartment_card_ids',JSON.stringify(data.deletedApartmentCardIds));
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
// V2 H43/PARTB: 구역번호 재정리(1회성 마이그레이션). 시내=1001~/
// 시외=3001~/상가=4001~ (딘 확정, PARTB-MAPPING 보고서 기준).
// zones_seed.js만 고치면 이미 저장된 실제 데이터(옛 id)는 그대로
// 남고 새 id가 중복으로 추가되므로, 이 함수가 "이미 저장된 데이터를
// 옛id→새id로 직접 rename"한다. zoneId를 참조하는 다른 데이터
// (route/기록/진행상황/S-13/삭제목록)도 함께 갱신. 관리자가 실행
// 버튼을 눌렀을 때만 동작, 실행 전 자동 백업 다운로드.
// ================================================================
const ZONE_ID_RENUMBER_MAP_H43={31601:1001,31701:1002,31801:1003,31901:1004,32001:1005,32101:1006,32201:1007,32301:1008,32401:1009,32501:1010,32801:1011,32901:1012,33001:1013,33101:1014,33201:1015,33301:1016,33401:1017,33501:1018,33601:1019,33701:1020,33801:1021,33901:1022,34001:1023,17001:1024,16901:1025,18301:1026,18401:1027,12901:1028,13001:1029,8401:1030,8501:1031,17101:1032,17201:1033,9001:1034,9101:1035,9201:1036,9301:1037,9401:1038,9501:1039,13801:1040,13901:1041,14001:1042,14101:1043,14201:1044,18801:1045,18901:1046,19001:1047,2101:1048,2201:1049,2301:1050,21401:1051,21501:1052,21601:1053,21701:1054,14901:1055,15001:1056,15101:1057,18501:1058,18601:1059,18701:1060,10001:1061,9901:1062,10201:1063,10101:1064,10401:1065,10301:1066,10601:1067,10501:1068,9701:1069,9801:1070,22401:1071,22402:1072,22601:1073,22602:1074,22701:1075,22702:1076,22703:1077,22801:1078,22802:1079,22901:1080,22902:1081,23001:1082,23002:1083,23101:1084,23102:1085,25701:1086,25702:1087,25703:1088,25801:1089,25901:1090,25902:1091,25903:1092,26001:1093,26002:1094,26003:1095,26101:1096,26102:1097,26103:1098,28601:1099,28602:1100,28701:1101,28702:1102,28801:1103,28802:1104,28803:1105,28901:1106,28902:1107,28903:1108,29001:1109,29002:1110,29003:1111,29101:1112,29102:1113,29103:1114,26301:1115,26501:1116,26502:1117,26503:1118,26601:1119,26602:1120,26603:1121,23601:1122,23602:1123,23603:1124,23701:1125,23702:1126,23703:1127,24501:1128,24502:1129,24503:1130,24504:1131,24601:1132,24602:1133,24603:1134,24701:1135,24702:1136,24703:1137,24801:1138,24802:1139,24803:1140,24901:1141,24902:1142,24903:1143,25001:1144,25002:1145,26701:1146,26702:1147,26801:1148,26802:1149,26901:1150,27001:1151,27101:1152,29401:1153,29402:1154,29501:1155,29502:1156,29503:1157,29701:1158,29702:1159,29703:1160,29801:1161,29802:1162,29901:1163,29902:1164,30001:1165,30002:1166,3601:1167,3602:1168,3603:1169,4901:1170,4902:1171,4903:1172,5001:1173,5002:1174,5003:1175,5101:1176,5102:1177,30101:1178,30102:1179,30201:1180,30202:1181,30203:1182,30204:1183,30301:1184,30302:1185,30303:1186,30501:1187,30502:1188,30601:1189,30602:1190,30701:1191,30702:1192,30801:1193,30802:1194,30803:1195,30901:1196,30902:1197,30903:1198,30904:1199,30905:1200,5301:1201,5302:1202,5303:1203,5304:1204,5305:1205,5401:1206,5402:1207,5403:1208,5501:1209,5502:1210,5503:1211,5504:1212,5601:1213,5602:1214,5701:1215,5702:1216,5703:1217,5704:1218,5705:1219,5801:1220,5802:1221,5803:1222,5804:1223,5805:1224,5901:1225,5902:1226,5903:1227,5904:1228,5905:1229,6001:1230,6002:1231,6003:1232,6101:1233,6102:1234,27201:1235,27202:1236,27203:1237,27204:1238,27205:1239,27301:1240,27302:1241,27303:1242,27304:1243,35301:3001,27401:3002,27402:3003,27403:3004,28501:3005,28502:3006,28503:3007,25101:3008,25102:3009,25103:3010,25104:3011,25201:3012,25202:3013,25203:3014,25301:3015,25302:3016,25303:3017,25304:3018,25401:3019,25402:3020,25403:3021,25601:3022,25602:3023,25603:3024,25604:3025,67701:3026,6201:3027,67702:3028,6202:3029,6301:3030,6302:3031,6303:3032,6401:3033,6402:3034,6403:3035,6501:3036,6502:3037,6601:3038,6701:3039,31001:3040,31002:3041,31003:3042,31004:3043,31101:3044,31102:3045,31103:3046,31104:3047,27501:3048,27502:3049,27503:3050,27601:3051,27602:3052,27603:3053,27701:3054,27702:3055,27703:3056,27801:3057,27802:3058,27803:3059,27804:3060,6801:3061,6802:3062,6803:3063,6901:3064,6902:3065,7001:3066,7002:3067,7101:3068,7102:3069,7103:3070,7201:3071,27901:3072,27902:3073,27903:3074,27904:3075,28001:3076,28002:3077,28101:3078,28102:3079,28103:3080,28104:3081,28201:3082,28202:3083,28301:3084,28302:3085,28401:3086,28402:3087,7301:3088,7302:3089,7303:3090,7401:3091,7402:3092,7403:3093,7501:3094,7502:3095,31201:3096,31202:3097,31203:3098,31301:3099,31302:3100,31303:3101,58201:4001,58301:4002,59601:4003,26201:4004,26202:4005,29201:4006,29202:4007,29301:4008,29302:4009,10701:4010,10702:4011,10801:4012,10802:4013,10803:4014,23201:4015,23202:4016,23203:4017,23204:4018,23205:4019,601:4020,602:4021,603:4022,4601:4023,4602:4024,4603:4025,4301:4026,4302:4027,23301:4028,23302:4029,23401:4030,12001:4031,23801:4032,23802:4033,23803:4034,23804:4035,23901:4036,23902:4037,23903:4038,24001:4039,24002:4040,24003:4041,24004:4042,24101:4043,24102:4044,24103:4045,24104:4046,24105:4047,24201:4048,24202:4049,24203:4050,24204:4051,24301:4052,24302:4053,24303:4054,24401:4055,24402:4056,24403:4057,24404:4058,12101:4059,12102:4060,12103:4061,5201:4062,5202:4063,5203:4064,5204:4065,5205:4066,5206:4067,5207:4068,5208:4069,5209:4070,30401:4071,30402:4072,30403:4073,30404:4074};
const ZONE_ID_DELETE_LIST_H43=[14301]; // 10-10 썬라이즈빌 101동(양양 소재, 딘 확인 삭제 대상)
function runZoneRenumberMigration(){
  if(S.role!=='admin'){toast('관리자만 실행할 수 있습니다.');return;}
  const targetExists=S.zones.some(z=>ZONE_ID_RENUMBER_MAP_H43[z.id]!=null||ZONE_ID_DELETE_LIST_H43.includes(z.id));
  if(!targetExists){toast('재정리 대상 구역(옛 번호)을 찾을 수 없습니다 — 이미 실행되었거나 대상이 없습니다.');return;}
  if(!confirm('구역번호를 새 체계(시내 1001~ / 시외 3001~ / 상가 4001~)로 지금 이 기기에서 한 번에 재정리합니다.\n실행 전 안전을 위해 백업 파일이 자동으로 다운로드됩니다.\n계속하시겠습니까?'))return;
  exportBackup(); // 안전망: 실행 전 현재 상태 그대로 자동 백업

  const map=ZONE_ID_RENUMBER_MAP_H43;
  const deleteIds=new Set(ZONE_ID_DELETE_LIST_H43.map(String));
  let deletedCount=0,renumberedCount=0;

  // V2 H53: id가 바뀌거나(재정리) 구역이 없어지면(삭제), Kakao 폴리곤
  // 캐시(mainKakaoPolygons/homeKakaoPolygons)에 옛 id로 걸린 항목을
  // 그 자리에서 즉시 지운다. 기존 invalidateZonePolygonCache()와 같은
  // 삭제 로직이지만, 그 함수는 호출마다 지도를 다시 그려서(무거움)
  // 344개 반복에는 안 맞아 캐시 삭제 부분만 직접 처리 — 실제 화면
  // 다시 그리기는 이 함수 끝의 refreshAllViews()가 한 번에 담당한다.
  function clearStalePolygonCache(oldId){
    const key=String(oldId);
    const main=mainKakaoPolygons.get(key);
    if(main){main.polygon.setMap(null);mainKakaoPolygons.delete(key);}
    const home=homeKakaoPolygons.get(key);
    if(home){home.polygon.setMap(null);homeKakaoPolygons.delete(key);}
  }

  S.zones=S.zones.filter(z=>{
    if(deleteIds.has(String(z.id))){addDeletedZoneId(z.id);clearStalePolygonCache(z.id);deletedCount++;return false;}
    return true;
  });

  const oldToNew={};
  S.zones.forEach(z=>{
    const newId=map[z.id];
    if(newId!=null&&newId!==z.id){oldToNew[String(z.id)]=newId;clearStalePolygonCache(z.id);z.id=newId;renumberedCount++;}
  });

  S.rteLines.forEach(l=>{if(oldToNew[String(l.zoneId)]!=null)l.zoneId=oldToNew[String(l.zoneId)];});
  S.records.forEach(r=>{if(oldToNew[String(r.zoneId)]!=null)r.zoneId=oldToNew[String(r.zoneId)];});

  try{
    const progress=JSON.parse(storageGet('sokcho_progress')||'{}')||{};
    const newProgress={};
    Object.keys(progress).forEach(k=>{
      const nk=oldToNew[k]!=null?String(oldToNew[k]):k;
      newProgress[nk]=progress[k];
    });
    storageSet('sokcho_progress',JSON.stringify(newProgress));
  }catch(e){}

  try{
    const delIds=loadDeletedZoneIds();
    const newDelIds=delIds.map(id=>oldToNew[String(id)]!=null?String(oldToNew[String(id)]):id);
    storageSet('sokcho_deleted_zone_ids',JSON.stringify([...new Set(newDelIds)]));
  }catch(e){}

  try{
    const s13records=loadS13Records();
    s13records.forEach(rec=>{
      const m=/^zone-(.+)$/.exec(rec.territoryId||'');
      if(m&&oldToNew[m[1]]!=null){
        const newId=oldToNew[m[1]];
        rec.territoryId='zone-'+newId;
        rec.zoneNumber=newId;
        rec.id=rec.territoryId+'-'+rec.serviceYear;
      }
    });
    persistS13Records(s13records);
  }catch(e){}

  S.nextId=Math.max(0,...S.zones.map(z=>Number(z.id)||0));
  persistAllData();
  refreshAllViews();
  if(S.role==='admin')renderAdmin();
  toast(`구역번호 재정리 완료 — ${renumberedCount}개 변경, ${deletedCount}개 삭제`);
}

// ================================================================
// V2 H78: 기기 동기화 통합 버튼. 지금까지 따로따로 눌러야 했던
// 1회성 마이그레이션(구역번호 재정리 H43, KCC/진덕 카드 가져오기
// H63)을 순서대로 실행한다. 각 마이그레이션의 실제 로직/멱등성
// 판단은 원래 함수(runZoneRenumberMigration/runApartmentImportH63)
// 그대로 재사용하고 손대지 않는다 — 이 함수는 "무엇을 언제 부를지"
// 와 "결과를 하나로 요약해서 보여주는 것"만 담당한다.
//
// 아파트 카드 가져오기만 별도 처리가 필요했던 이유: 원래 함수는
// 이미 실행된 기기에서 다시 실행하면 "정말 다시 실행하시겠습니까?"
// 확인창을 띄우고, 거기서 실수로 확인을 누르면 카드가 중복
// 생성된다(원래 함수 자체의 동작, 손대지 않음). 통합 버튼은 반드시
// 완전히 안전(멱등)해야 하므로, 이미 실행된 기기에서는 그 확인창이
// 아예 뜨지 않게 호출 자체를 건너뛴다. 구역번호 재정리는 원래
// 함수가 "대상 없음"일 때 확인창 없이 조용히 끝나므로 그대로 매번
// 호출해도 안전하다(수정 불필요).
function zoneRenumberStillNeeded(){
  return S.zones.some(z=>ZONE_ID_RENUMBER_MAP_H43[z.id]!=null||ZONE_ID_DELETE_LIST_H43.includes(z.id));
}
// ================================================================
// H80: H79 자동검색에서 "확실"(단일 후보 + 이름에 동번호 정확히
// 포함)로 분류된 32건의 동 좌표를 확정값으로 반영. 좌표 저장 자체는
// 기존 saveApartmentBuildingPin/setApartmentBuildingCoord와 동일하게
// b.lat/b.lng 설정 + persistApartmentRegistry() 재사용 — 새 저장
// 경로를 만들지 않음. 이미 좌표가 있는 동은 건드리지 않아(멱등)
// runDeviceSyncAll에서 매번 다시 호출해도 안전함.
// ================================================================
const APARTMENT_BUILDING_COORDS_H80=[
  {complex:'KCC',dong:'101동',lat:38.18428590753883,lng:128.59523656595624},
  {complex:'KCC',dong:'102동',lat:38.18420656352619,lng:128.59603715992924},
  {complex:'KCC',dong:'103동',lat:38.18467676121987,lng:128.59617182223167},
  {complex:'KCC',dong:'104동',lat:38.18485446534868,lng:128.59522614163964},
  {complex:'KCC',dong:'105동',lat:38.18540538548667,lng:128.59525413698293},
  {complex:'KCC',dong:'106동',lat:38.1852384720854,lng:128.59620120140676},
  {complex:'KCC',dong:'107동',lat:38.1856844593864,lng:128.595996369422},
  {complex:'KCC',dong:'108동',lat:38.1858639066855,lng:128.595320063262},
  {complex:'LH천년나무3단지',dong:'301동',lat:38.186563431021,lng:128.591634009875},
  {complex:'LH천년나무3단지',dong:'302동',lat:38.18598402411911,lng:128.59084987044477},
  {complex:'LH천년나무3단지',dong:'303동',lat:38.185833157028526,lng:128.59154621332698},
  {complex:'LH천년나무3단지',dong:'304동',lat:38.18595992197959,lng:128.5922953919055},
  {complex:'동명',dong:'가동',lat:38.186080575582885,lng:128.59912537165815},
  {complex:'동명',dong:'나동',lat:38.18583406030057,lng:128.59989607317706},
  {complex:'동명',dong:'다동',lat:38.185792524193104,lng:128.5991099424727},
  {complex:'동명',dong:'라동',lat:38.18558142591531,lng:128.59985973100092},
  {complex:'부영1단지',dong:'101동',lat:38.18863437762138,lng:128.5859791493793},
  {complex:'부영1단지',dong:'102동',lat:38.18822541537364,lng:128.5861118070458},
  {complex:'부영2단지',dong:'201동',lat:38.1876406147503,lng:128.58579096042806},
  {complex:'성호2차',dong:'201동',lat:38.18404843362865,lng:128.59772851609102},
  {complex:'성호2차',dong:'202동',lat:38.18478351547185,lng:128.59746267499136},
  {complex:'성호2차',dong:'203동',lat:38.1853606280761,lng:128.59775033542235},
  {complex:'성호2차',dong:'204동',lat:38.18539332714063,lng:128.59720094075058},
  {complex:'아뜨리움',dong:'101동',lat:38.18757748682281,lng:128.59755566532178},
  {complex:'아뜨리움',dong:'103동',lat:38.18738242324718,lng:128.5968631781678},
  {complex:'조양주공',dong:'201동',lat:38.186578622948865,lng:128.59323675981094},
  {complex:'조양주공',dong:'202동',lat:38.18654258993339,lng:128.5938340283285},
  {complex:'조양주공',dong:'203동',lat:38.186509408769425,lng:128.59435374843494},
  {complex:'조양주공',dong:'204동',lat:38.18602078488697,lng:128.59444809670077},
  {complex:'조양주공',dong:'205동',lat:38.1860572722294,lng:128.59388394084826},
  {complex:'조양주공',dong:'206동',lat:38.18628483558546,lng:128.59351112385687},
  {complex:'조양주공',dong:'207동',lat:38.18610711855559,lng:128.59313175817863},
];
function applyConfidentBuildingCoordsH80(){
  if(S.role!=='admin')return null;
  let applied=0,skipped=0,notFound=0;
  APARTMENT_BUILDING_COORDS_H80.forEach(item=>{
    const c=S.apartmentComplexes.find(c=>c.name===item.complex);
    const b=c&&c.buildings.find(bb=>bb.dong===item.dong);
    if(!b){notFound++;return;}
    if(hasApartmentBuildingCoord(b)){skipped++;return;}
    b.lat=item.lat;b.lng=item.lng;
    applied++;
  });
  if(applied>0)persistApartmentRegistry();
  renderApartmentComplexList();
  return {applied,skipped,notFound};
}
// ================================================================
// H81: H79 애매/결과없음 중 딘이 알려준 정확한 명칭/방식으로
// 재검색해서 새로 확실해진 7건. 좌표 저장 방식은 H80과 동일하게
// b.lat/b.lng 설정 + persistApartmentRegistry() 재사용, 이미 좌표
// 있으면 건드리지 않음(멱등).
// - 부영9단지 901~904동: "부영9단지"="부영9차"(딘 제공 정보)로
//   재검색해서 4건 모두 단일후보+동번호 정확히 일치로 확인
// - 부영6단지 601동: "부영6단지"="부영6차"로 재검색(부영9단지와
//   같은 명명 패턴 적용) → 단일후보+동번호 일치로 확인. TARGET에
//   명시된 "수동 확정 저장" 대상 — 지도를 직접 보고 찍는 대신
//   이름 교정 재검색으로 정확한 후보를 찾아 저장(둘 다 관리자가
//   최종 확인 없이 이 함수 안에서 바로 저장한다는 점은 동일)
// - 아뜨리움 102동: H79 원본 재검색 결과(후보 2개) 중 1번
//   "속초조양동ES아뜨리움아파트 102동"(동번호 정확히 일치)을 채택,
//   2번 "사월의눈"은 이름이 전혀 달라 무관한 업체로 판단해 제외
// - 진덕 1동: H79 원본 재검색 결과(후보 1개 "진덕설악맨션")를
//   그대로 채택 — 별도 검증 검색("진덕설악맨션"만 검색)에서도 동일
//   단지가 이 지역에 하나뿐임을 확인, "1동" 표기가 이름에 없는 것은
//   이 단지가 여러 동을 세부 명칭 없이 하나로 관리해서로 판단
// ================================================================
const APARTMENT_BUILDING_COORDS_H81=[
  {complex:'부영9단지',dong:'901동',lat:38.18887022827498,lng:128.58405650593548},
  {complex:'부영9단지',dong:'902동',lat:38.18848733855022,lng:128.58392608656536},
  {complex:'부영9단지',dong:'903동',lat:38.18886207225085,lng:128.58486098875346},
  {complex:'부영9단지',dong:'904동',lat:38.18849079712361,lng:128.5848712035871},
  {complex:'부영6단지',dong:'601동',lat:38.18767759466214,lng:128.5811795968316},
  {complex:'아뜨리움',dong:'102동',lat:38.187781072868866,lng:128.597158360444},
  {complex:'진덕',dong:'1동',lat:38.18669564311844,lng:128.59960219940692},
];
function applyConfidentBuildingCoordsH81(){
  if(S.role!=='admin')return null;
  let applied=0,skipped=0,notFound=0;
  APARTMENT_BUILDING_COORDS_H81.forEach(item=>{
    const c=S.apartmentComplexes.find(c=>c.name===item.complex);
    const b=c&&c.buildings.find(bb=>bb.dong===item.dong);
    if(!b){notFound++;return;}
    if(hasApartmentBuildingCoord(b)){skipped++;return;}
    b.lat=item.lat;b.lng=item.lng;
    applied++;
  });
  if(applied>0)persistApartmentRegistry();
  renderApartmentComplexList();
  return {applied,skipped,notFound};
}
// ================================================================
// H82: 좌표 등록 마무리 — 남은 20건 전부 확정. 저장 방식은 H80/H81과
// 동일(b.lat/b.lng + persistApartmentRegistry(), 이미 좌표 있으면
// 건드리지 않아 멱등).
// - 부영6단지 602~604동: 601동과 같은 "부영6차 {동}" 재검색으로
//   3건 모두 단일후보+동번호 정확히 일치 확인
// - 4차(주공4차) 12건: 딘이 지시한 "주공4차 입구"/"주공4차 아파트
//   입구" 검색은 실제로는 결과 0건(그런 이름의 장소가 카카오에
//   없음, "속초" 뺀 검색은 수원/부천 등 엉뚱한 도시 결과만 나옴).
//   대신 H81 조사에서 이미 확인해둔 "주공4차 중앙상가"(온정로 18,
//   이 단지의 실존 대표시설)를 12개 동 공통좌표로 사용 — 딘이
//   승인한 "공통좌표 사용" 의도에 맞는 대체
// - 성호1차 5건: 마찬가지로 "성호1단지 입구" 계열 검색은 0건.
//   "속초 성호1차아파트" 검색으로 확인된 "성호아파트"(청대로 8,
//   성호2차와는 다른 주소)를 5개 동 공통좌표로 사용
// ================================================================
const APARTMENT_BUILDING_COORDS_H82=[
  {complex:'부영6단지',dong:'602동',lat:38.187187656465014,lng:128.58170657219105},
  {complex:'부영6단지',dong:'603동',lat:38.187589563851965,lng:128.58203027548748},
  {complex:'부영6단지',dong:'604동',lat:38.187111689920485,lng:128.58246391617882},
  {complex:'4차',dong:'101동',lat:38.18577522796179,lng:128.59296132051855},
  {complex:'4차',dong:'102동',lat:38.18577522796179,lng:128.59296132051855},
  {complex:'4차',dong:'103동',lat:38.18577522796179,lng:128.59296132051855},
  {complex:'4차',dong:'104동',lat:38.18577522796179,lng:128.59296132051855},
  {complex:'4차',dong:'105동',lat:38.18577522796179,lng:128.59296132051855},
  {complex:'4차',dong:'106동',lat:38.18577522796179,lng:128.59296132051855},
  {complex:'4차',dong:'107동',lat:38.18577522796179,lng:128.59296132051855},
  {complex:'4차',dong:'108동',lat:38.18577522796179,lng:128.59296132051855},
  {complex:'4차',dong:'109동',lat:38.18577522796179,lng:128.59296132051855},
  {complex:'4차',dong:'110동',lat:38.18577522796179,lng:128.59296132051855},
  {complex:'4차',dong:'111동',lat:38.18577522796179,lng:128.59296132051855},
  {complex:'4차',dong:'112동',lat:38.18577522796179,lng:128.59296132051855},
  {complex:'성호1차',dong:'101동',lat:38.18455140908841,lng:128.5992928024047},
  {complex:'성호1차',dong:'102동',lat:38.18455140908841,lng:128.5992928024047},
  {complex:'성호1차',dong:'103동',lat:38.18455140908841,lng:128.5992928024047},
  {complex:'성호1차',dong:'104동',lat:38.18455140908841,lng:128.5992928024047},
  {complex:'성호1차',dong:'105동',lat:38.18455140908841,lng:128.5992928024047},
];
function applyConfidentBuildingCoordsH82(){
  if(S.role!=='admin')return null;
  let applied=0,skipped=0,notFound=0;
  APARTMENT_BUILDING_COORDS_H82.forEach(item=>{
    const c=S.apartmentComplexes.find(c=>c.name===item.complex);
    const b=c&&c.buildings.find(bb=>bb.dong===item.dong);
    if(!b){notFound++;return;}
    if(hasApartmentBuildingCoord(b)){skipped++;return;}
    b.lat=item.lat;b.lng=item.lng;
    applied++;
  });
  if(applied>0)persistApartmentRegistry();
  renderApartmentComplexList();
  return {applied,skipped,notFound};
}
// ================================================================
// H91: 아파트 카드 point.complexId가 실제 S.apartmentComplexes id와
// 어긋나는 데이터 정합성 문제 근본 수정. 원인: runApartmentImportH63()
// 자체는 항상 내부적으로 일관된 id를 부여하지만(complex 생성 시
// 그 자리에서 만든 id를 그대로 카드에 씀, 코드 재확인 완료), 과거
// 이 기능이 여러 차례 반복 개발/시험되는 동안 어느 한 기기에서
// 지금과 다른 버전의 코드/데이터로 먼저 실행되어 sokcho_h63_import_done
// 플래그가 이미 '1'로 저장돼 있으면, 이후 아무리 코드를 고쳐도
// runApartmentImportH63() 자체가 재실행되지 않아(중복 방지 설계,
// H78/H91에서 의도적으로 유지) 그 기기엔 옛 id 체계의 카드가
// 영구히 남는다 — 이것이 "이름은 맞는데 id가 어긋남" 현상의
// 근본 원인으로 판단. 코드 재작성이 아니라 데이터 정정(옵션 a)으로
// 해결한다: 카드가 들고 있는 complexName은 항상 정확하므로, 그
// 이름으로 지금 레지스트리에 있는 진짜 id를 찾아 point.complexId를
// 덮어쓴다. 이미 올바른 point는 그대로 두어(멱등) 몇 번을 다시
// 실행해도 안전하다.
function repairApartmentCardComplexId(){
  // H92: id 비교도 String()으로 타입 무관하게 맞춘다(문자열 "2" vs
  // 숫자 2 같은 경우). 값은 같은데 타입만 다른 경우는 "이미 정상"
  // 취급하지 않고 실제 레지스트리 쪽 타입 그대로 맞춰서 저장까지
  // 해준다 — 그래야 이 카드가 다음부터는 어떤 비교 방식을 쓰든
  // 항상 안전하게 일치한다.
  let repaired=0,alreadyOk=0,unresolved=0;
  S.apartmentCards.forEach(card=>{
    card.points.forEach(pt=>{
      const byId=S.apartmentComplexes.find(c=>String(c.id)===String(pt.complexId));
      if(byId){
        if(byId.id!==pt.complexId){pt.complexId=byId.id;repaired++;}
        else{alreadyOk++;}
        return;
      }
      const byName=pt.complexName&&S.apartmentComplexes.find(c=>c.name===pt.complexName);
      if(byName){pt.complexId=byName.id;repaired++;}
      else{unresolved++;}
    });
  });
  if(repaired>0)persistApartmentCards();
  return {repaired,alreadyOk,unresolved};
}
function runDeviceSyncAll(){
  if(S.role!=='admin'){toast('관리자만 실행할 수 있습니다.');return;}

  // 1) 구역번호 재정리(H43) — 원본 함수 그대로 호출(대상 없으면 확인창 없이 조용히 반환)
  const zoneNeededBefore=zoneRenumberStillNeeded();
  runZoneRenumberMigration();
  const zoneNeededAfter=zoneRenumberStillNeeded();
  const zoneApplied=zoneNeededBefore&&!zoneNeededAfter;

  // 2) KCC/진덕 아파트 카드 가져오기(H63) — 이미 실행됐으면 원본 함수 자체를 호출하지 않음(중복 방지)
  const aptAlreadyDone=storageGet('sokcho_h63_import_done')==='1';
  let aptApplied=false;
  if(!aptAlreadyDone&&typeof runApartmentImportH63==='function'){
    const cardsBefore=S.apartmentCards.length;
    runApartmentImportH63();
    aptApplied=S.apartmentCards.length>cardsBefore;
  }

  // 3) H80/H81/H82: 확실 매칭 동 좌표 일괄확정(32건+7건+20건=59건 전체) — 이미 좌표 있는 동은 건드리지 않아(멱등) 매번 호출해도 안전
  const coordResult80=applyConfidentBuildingCoordsH80()||{applied:0,skipped:0,notFound:0};
  const coordResult81=applyConfidentBuildingCoordsH81()||{applied:0,skipped:0,notFound:0};
  const coordResult82=applyConfidentBuildingCoordsH82()||{applied:0,skipped:0,notFound:0};
  const coordAppliedTotal=coordResult80.applied+coordResult81.applied+coordResult82.applied;

  // 4) H91: 카드 point.complexId가 옛 id 체계로 어긋나 있으면 이름 기준으로 정정 — 이미 올바르면 아무 것도 안 함(멱등)
  const complexIdFix=repairApartmentCardComplexId();

  const zoneMsg=zoneApplied?'구역번호 재정리 적용됨':'구역번호 이미 최신';
  const aptMsg=aptAlreadyDone?'아파트 카드 이미 최신':(aptApplied?'아파트 카드 가져오기 적용됨':'아파트 카드 가져오기 안 함(취소 또는 실패)');
  const coordMsg=coordAppliedTotal>0?`동 좌표 ${coordAppliedTotal}건 새로 확정`:'동 좌표 이미 최신';
  const fixMsg=complexIdFix.repaired>0?`카드 단지연결 ${complexIdFix.repaired}건 정정됨`:'카드 단지연결 이미 정상';
  const allUpToDate=!zoneApplied&&aptAlreadyDone&&coordAppliedTotal===0&&complexIdFix.repaired===0;
  toast(`${allUpToDate?'✅ 이미 최신 상태입니다':'✅ 최신 상태로 맞췄습니다'} — 구역 ${S.zones.length}개, 아파트 단지 ${S.apartmentComplexes.length}개, 카드 ${S.apartmentCards.length}개 (${zoneMsg} / ${aptMsg} / ${coordMsg} / ${fixMsg})`);
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
  const countEl=document.getElementById('adm-leader-count');
  if(countEl)countEl.textContent=S.leaders.length;
  const wrap=document.getElementById('leader-list');if(!wrap)return;
  wrap.innerHTML=S.leaders.map((l,i)=>`<div class="leader-card">
    <div style="width:12px;height:12px;border-radius:50%;background:${l.color};flex-shrink:0;"></div>
    <div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:700;">${esc(l.name)}</div>
    </div>
    <div style="display:flex;gap:6px;">
      <button class="btn btn-sm btn-out" onclick="editLeader(${i})">수정</button>
      <button class="btn btn-sm btn-dk" onclick="delLeader(${i})">삭제</button>
    </div>
  </div>`).join('');
}
function delLeader(i){S.leaders.splice(i,1);persistLeaders();renderLeaderList();fillSelForRole('leader');toast('인도자 삭제됨');}
function editLeader(i){
  const l=S.leaders[i];
  if(!l)return;
  const next=prompt('인도자 이름을 입력하세요.',l.name);
  if(next==null)return; // 취소
  const trimmed=next.trim();
  if(!trimmed){toast('이름을 입력하세요.');return;}
  if(trimmed===l.name)return;
  if(S.leaders.some((x,xi)=>xi!==i&&x.name===trimmed)){toast('이미 등록된 인도자입니다.');return;}
  l.name=trimmed;
  persistLeaders();
  renderLeaderList();
  fillSelForRole('leader');
  toast('인도자 이름이 수정되었습니다.');
}

// ================================================================
// V2 H41/H44: 연구자료(JW.ORG 링크) — 인도자 열람+jw.org 검색,
// 관리자 탭에서 CRUD. "봉사모임사회 Pro"(cksomj/bongsa-pro)의
// seed 링크 4개만 재사용, 그 외 Pro 기능은 가져오지 않음.
// H44: 봉사자 탭 노출 제거(인도자 전용), 로컬 제목검색 대신 검색
// 버튼으로 jw.org 통합검색을 새 탭에서 열도록 변경, 관리자 CRUD는
// 관리자 탭 안의 "연구자료 관리" 섹션으로 이동(인도자가 보는 목록과
// 같은 렌더 함수를 공유해서 두 화면이 항상 같은 데이터를 보여줌).
// ================================================================
const RESEARCH_LINKS_SEED=[
  {id:1,title:'사람들을 사랑하고 제자로 삼으십시오',url:'https://www.jw.org/ko/%EB%9D%BC%EC%9D%B4%EB%B8%8C%EB%9F%AC%EB%A6%AC/%ED%8C%9C%ED%94%8C%EB%A0%9B/%EC%82%AC%EB%9E%8C%EB%93%A4%EC%9D%84-%EC%82%AC%EB%9E%91%ED%95%98%EA%B3%A0-%EC%A0%9C%EC%9E%90%EB%A1%9C-%EC%82%BC%EC%9C%BC%EC%8B%AD%EC%8B%9C%EC%98%A4/'},
  {id:2,title:'읽고 가르치는 기술',url:'https://www.jw.org/ko/%EB%9D%BC%EC%9D%B4%EB%B8%8C%EB%9F%AC%EB%A6%AC/%ED%8C%9C%ED%94%8C%EB%A0%9B/%EC%9D%BD%EA%B3%A0-%EA%B0%80%EB%A5%B4%EC%B9%98%EB%8A%94-%EA%B8%B0%EC%88%A0/'},
  {id:3,title:'그리스도인 생활을 위한 성경 구절들',url:'https://www.jw.org/ko/%EB%9D%BC%EC%9D%B4%EB%B8%8C%EB%9F%AC%EB%A6%AC/%EC%84%9C%EC%A0%81/%EA%B7%B8%EB%A6%AC%EC%8A%A4%EB%8F%84%EC%9D%B8-%EC%83%9D%ED%99%9C%EC%9D%84-%EC%9C%84%ED%95%9C-%EC%84%B1%EA%B2%BD-%EA%B5%AC%EC%A0%88%EB%93%A4/'},
  {id:4,title:'행복한 삶을 영원히 누리십시오',url:'https://www.jw.org/ko/%EB%9D%BC%EC%9D%B4%EB%B8%8C%EB%9F%AC%EB%A6%AC/%EC%84%9C%EC%A0%81/%ED%96%89%EB%B3%B5%ED%95%9C-%EC%82%B6%EC%9D%84-%EC%98%81%EC%9B%90%ED%9E%88-%EB%88%84%EB%A6%AC%EC%8B%AD%EC%8B%9C%EC%98%A4/'},
];
function loadResearchLinks(){
  if(S._researchLinksLoaded)return;
  try{
    const saved=JSON.parse(storageGet('sokcho_research_links')||'null');
    S.researchLinks=Array.isArray(saved)&&saved.length?saved:RESEARCH_LINKS_SEED.map(l=>({...l}));
  }catch(e){S.researchLinks=RESEARCH_LINKS_SEED.map(l=>({...l}));}
  S._researchLinksLoaded=true;
}
function persistResearchLinks(){storageSet('sokcho_research_links',JSON.stringify(S.researchLinks));}
function nextResearchLinkId(){return Math.max(0,...S.researchLinks.map(l=>Number(l.id)||0))+1;}
// V2 H44: jw.org 공식 검색 URL(?q=검색어, ko/검색/ 한글 경로) — 실제
// Playwright로 열어 "웹사이트 검색 | JW.ORG" 결과 페이지가 정확히
// 뜨는 것까지 확인한 형식(추측 아님, H44 보고서에 검증 근거 기록).
const JW_ORG_SEARCH_BASE='https://www.jw.org/ko/%EA%B2%80%EC%83%89/?q=';
function openJwOrgSearch(){
  const q=(document.getElementById('research-search')?.value||'').trim();
  if(!q){toast('검색어를 입력하세요.');return;}
  window.open(JW_ORG_SEARCH_BASE+encodeURIComponent(q),'_blank','noopener,noreferrer');
}
// idPrefix로 인도자 화면(#research-link-item-N)과 관리자 화면
// (#adm-research-link-item-N)의 DOM id 중복을 피한다. CRUD 버튼은
// .admin-pin-action(기존 syncRoleUi() 토글)이라 관리자 화면에서만
// 자동으로 보인다 — 인도자 화면에는 같은 마크업이 있어도 항상 숨김.
function researchLinkRowHtml(l,idPrefix){
  return `<div class="leader-card" id="${idPrefix}-${l.id}">
    <a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" style="flex:1;min-width:0;font-size:13px;font-weight:700;color:var(--tx);text-decoration:none;">🔗 ${esc(l.title)}</a>
    <div class="admin-pin-action hide" style="display:flex;gap:6px;flex-shrink:0;">
      <button class="btn btn-sm btn-out" onclick="editResearchLink(${l.id})">수정</button>
      <button class="btn btn-sm btn-dk" onclick="deleteResearchLink(${l.id})">삭제</button>
    </div>
  </div>`;
}
function renderResearchList(){
  loadResearchLinks();
  const empty='<p style="font-size:13px;color:var(--txm);text-align:center;padding:20px 0;">등록된 링크가 없습니다.</p>';
  const wrap=document.getElementById('research-link-list');
  if(wrap)wrap.innerHTML=S.researchLinks.length?S.researchLinks.map(l=>researchLinkRowHtml(l,'research-link-item')).join(''):empty;
  const admWrap=document.getElementById('adm-research-link-list');
  if(admWrap)admWrap.innerHTML=S.researchLinks.length?S.researchLinks.map(l=>researchLinkRowHtml(l,'adm-research-link-item')).join(''):empty;
  syncRoleUi(); // 방금 새로 그린 admin-pin-action 요소에도 현재 역할 기준 표시 적용
}
function addResearchLink(){
  if(S.role!=='admin'){toast('관리자만 추가할 수 있습니다.');return;}
  const title=document.getElementById('adm-nrl-title').value.trim();
  const url=document.getElementById('adm-nrl-url').value.trim();
  if(!title){toast('링크 제목을 입력하세요.');return;}
  if(!url){toast('URL을 입력하세요.');return;}
  S.researchLinks.push({id:nextResearchLinkId(),title,url});
  persistResearchLinks();
  document.getElementById('adm-nrl-title').value='';
  document.getElementById('adm-nrl-url').value='';
  renderResearchList();
  toast('연구자료 링크가 추가되었습니다.');
}
function editResearchLink(id){
  if(S.role!=='admin'){toast('관리자만 수정할 수 있습니다.');return;}
  const link=S.researchLinks.find(l=>l.id===id);
  if(!link)return;
  const title=prompt('링크 제목',link.title);
  if(title==null)return;
  if(!title.trim()){toast('제목을 입력하세요.');return;}
  const url=prompt('URL',link.url);
  if(url==null)return;
  if(!url.trim()){toast('URL을 입력하세요.');return;}
  link.title=title.trim();link.url=url.trim();
  persistResearchLinks();
  renderResearchList();
  toast('연구자료 링크가 수정되었습니다.');
}
function deleteResearchLink(id){
  if(S.role!=='admin'){toast('관리자만 삭제할 수 있습니다.');return;}
  if(!confirm('이 링크를 삭제하시겠습니까?'))return;
  S.researchLinks=S.researchLinks.filter(l=>l.id!==id);
  persistResearchLinks();
  try{renderResearchList();}catch(e){console.error('연구자료 삭제 후 목록 갱신 실패',e);}
  toast('연구자료 링크가 삭제되었습니다.');
}
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
  const data=JSON.parse(storageGet('sokcho_live')||'{}');
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
  storageSet('sokcho_live',JSON.stringify(data));
}
function clearMonitorSimData(){
  const data=JSON.parse(storageGet('sokcho_live')||'{}');
  Object.keys(data).forEach(k=>{if(data[k]?._sim)delete data[k];});
  storageSet('sokcho_live',JSON.stringify(data));
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
function drawMonitorZones(){
  if(!S.monMap||S.monMap._zonesDrawn)return;
  const kakaoMap=_kakaoInstances['monitor-map'];
  if(!kakaoMap||!window.kakao?.maps?.Polygon)return;
  S.monMap._zonesDrawn=true;
  S.zones.forEach(z=>{
    const path=(z.polygon||[]).map(pt=>new kakao.maps.LatLng(Number(pt[0]),Number(pt[1])));
    const polygon=new kakao.maps.Polygon({path,strokeWeight:3.2,strokeColor:zoneStrokeColor(z,false),strokeOpacity:.98,fillColor:zoneFillColor(z,false),fillOpacity:.05}); // V2 H77: 실시간현황 전체보기 — 선택 개념이 없어 항상 통일색
    polygon.setMap(kakaoMap);
  });
}
function initMonitor(){
  if(!S.monMap){
    S.monMap=L.map('monitor-map',stableMapOptions({center:[38.20138,128.59350],zoom:18,zoomControl:false,attributionControl:false}));
    addBaseTiles(S.monMap);
    stabilizeZoneLabelsOnMove(S.monMap);
  }
  drawMonitorZones();
  setTimeout(()=>S.monMap.invalidateSize(),100);
  refreshMonitor();
  if(S.monInterval)clearInterval(S.monInterval);
  S.monInterval=setInterval(refreshMonitor,5000);
}
function refreshMonitor(){
  const data=JSON.parse(storageGet('sokcho_live')||'{}');
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
function openExternalApp(url, fallbackUrl, label, opts={}){
  const a=document.createElement('a');
  a.href=url;
  a.style.display='none';
  a.target='_self';
  document.body.appendChild(a);
  const started=Date.now();
  let appOpened=false;
  const markOpened=()=>{appOpened=true;};
  document.addEventListener('visibilitychange',markOpened,{once:true});
  window.addEventListener('pagehide',markOpened,{once:true});
  window.addEventListener('blur',markOpened,{once:true});
  try{a.click();}catch(e){try{window.location.href=url;}catch(_){}}
  setTimeout(()=>{a.remove();},300);
  if(fallbackUrl){
    setTimeout(()=>{
      if(!appOpened&&Date.now()-started<1400){
        try{window.open(fallbackUrl,'_blank','noopener');}catch(e){}
      }
    },900);
  }
  toast(opts.notice?`${opts.notice} · ${label} 앱을 여는 중입니다.`:`${label} 앱을 여는 중입니다.`);
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
  const data=JSON.parse(storageGet('sokcho_live')||'{}');
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
    const data=JSON.parse(storageGet('sokcho_live')||'{}');
    data[S.user]=loc;
    storageSet('sokcho_live',JSON.stringify(data));
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
  const data=JSON.parse(storageGet('sokcho_live')||'{}');
  delete data[S.user];
  storageSet('sokcho_live',JSON.stringify(data));
}

function toggleLocShare(){
  // 사용하지 않음 (자동실행)
}
tryAutoLogin();
