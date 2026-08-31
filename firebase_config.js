// V2 H73: Firebase 프로젝트 연결(joyang-ministry-app, 2026-08-31).
// 아래 값은 딘이 Firebase 콘솔에서 직접 발급받은 실제 웹앱 config입니다
// (Firebase 웹 config는 원래 클라이언트에 공개되는 값이라 그 자체로는
// 비밀번호가 아니지만, Firestore 보안 규칙 없이 공개 저장소에 올리면
// 누구나 읽고 쓸 수 있으니 주의 — 이번 단계는 "테스트 모드" 상태에서의
// 순수 연결 확인까지만 진행합니다).
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyC3rKDmDHgxX5_1bdglpV6KKKGtHSzreQ8",
  authDomain: "joyang-ministry-app.firebaseapp.com",
  projectId: "joyang-ministry-app",
  storageBucket: "joyang-ministry-app.firebasestorage.app",
  messagingSenderId: "492666770390",
  appId: "1:492666770390:web:048deccdff8f00a762ca77",
};
function isFirebaseConfigReady(){
  return !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId);
}

// V2 H73: Firestore 초기화. index.html에서 이 스크립트를 Firebase SDK
// 스크립트들 "뒤"에 로드하므로 이 시점엔 이미 firebase 전역이 존재한다.
// storageGet/storageSet(H69)의 실제 구현은 이번 단계에서 전혀 안 바꾼다
// — db는 여기서 초기화만 해두고, 아직 어디에서도 실제 데이터 읽기/쓰기에
// 쓰이지 않는다(다음 단계에서 별도로 연결).
let db=null;
if(isFirebaseConfigReady()&&typeof firebase!=='undefined'){
  firebase.initializeApp(FIREBASE_CONFIG);
  db=firebase.firestore();
  console.log('[Firebase] 초기화 완료 (projectId=' + FIREBASE_CONFIG.projectId + ')');
}else if(typeof firebase==='undefined'){
  console.warn('[Firebase] SDK 스크립트가 로드되지 않았습니다(index.html 순서 확인 필요).');
}

// V2 H74: 앱 시작 시 자동 익명 로그인(조용히 백그라운드에서만 — 화면에
// 아무 UI도 안 띄움). Firestore 보안 규칙을 "익명 인증된 요청만 허용"
// 으로 바꿀 예정이라, 이게 안 되면 정상적인 봉사자 화면 데이터 요청도
// 전부 막히게 되므로 실패해도 앱 자체는 절대 안 막는다(에러는 콘솔
// 로그만 남기고 기존 로그인/구역선택 등 모든 기능은 그대로 동작).
// storageGet/storageSet(H69)은 여전히 손 안 댐 — 지금은 로그인만 미리
// 준비해두는 단계.
if(db&&typeof firebase.auth==='function'){
  firebase.auth().signInAnonymously().then(function(cred){
    console.log('[Firebase] 익명 로그인 성공 (uid=' + (cred&&cred.user&&cred.user.uid) + ')');
  }).catch(function(err){
    console.error('[Firebase] 익명 로그인 실패(앱 동작에는 영향 없음):',err&&err.code,err&&err.message);
  });
}else if(db){
  console.warn('[Firebase] auth SDK가 로드되지 않아 익명 로그인을 건너뜁니다(index.html에 firebase-auth-compat.js 확인 필요).');
}

// V2 H73: 연결 테스트 전용 함수 — 테스트 컬렉션(_connection_test)에
// 문서 하나를 쓰고 → 읽고 → 지우는 것까지 실제로 성공하는지 확인한다.
// 이 함수는 페이지 로드 시 자동으로 실행되지 않는다(매 사용자가 앱을
// 열 때마다 불필요한 Firestore 쓰기가 발생하지 않도록). 브라우저
// 콘솔에서 testFirestoreConnection()을 직접 호출하거나, 개발/점검
// 시 필요할 때만 실행한다.
async function testFirestoreConnection(){
  if(!db){
    console.error('[Firebase 연결테스트] db가 초기화되지 않았습니다.');
    return {ok:false,step:'init',error:'db not initialized'};
  }
  const testId='connection_test_'+Date.now();
  const ref=db.collection('_connection_test').doc(testId);
  try{
    await ref.set({message:'sokcho-map Firebase 연결 테스트',createdAt:new Date().toISOString()});
    console.log('[Firebase 연결테스트] 1/3 쓰기 성공:',testId);
  }catch(e){
    console.error('[Firebase 연결테스트] 쓰기 실패:',e);
    return {ok:false,step:'write',error:String(e)};
  }
  let data=null;
  try{
    const snap=await ref.get();
    if(!snap.exists){
      console.error('[Firebase 연결테스트] 읽기 실패 — 문서가 존재하지 않음');
      return {ok:false,step:'read',error:'doc missing after write'};
    }
    data=snap.data();
    console.log('[Firebase 연결테스트] 2/3 읽기 성공:',data);
  }catch(e){
    console.error('[Firebase 연결테스트] 읽기 실패:',e);
    return {ok:false,step:'read',error:String(e)};
  }
  try{
    await ref.delete();
    console.log('[Firebase 연결테스트] 3/3 삭제 성공');
  }catch(e){
    console.error('[Firebase 연결테스트] 삭제 실패:',e);
    return {ok:false,step:'delete',error:String(e)};
  }
  console.log('[Firebase 연결테스트] 전체 성공(쓰기→읽기→삭제)');
  return {ok:true,testId,data};
}
