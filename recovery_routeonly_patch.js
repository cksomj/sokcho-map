// Sokcho recovery overlay — apartment route-only compatibility
// Recovery branch only. Keeps the completed residential baseline untouched.
(function(){
  'use strict';

  function pointPair(pt){
    if(Array.isArray(pt)) return [Number(pt[0]), Number(pt[1])];
    if(pt && typeof pt.lat==='number' && typeof pt.lng==='number') return [pt.lat, pt.lng];
    return null;
  }
  function normalizePts(pts){
    return (Array.isArray(pts)?pts:[]).map(pointPair).filter(p=>p&&Number.isFinite(p[0])&&Number.isFinite(p[1]));
  }
  function cardRenderType(card){
    return card && card.cardType==='route-only' ? 'route-only' : 'polygon';
  }
  function cardRoutePoints(card){
    return cardRenderType(card)==='route-only' ? normalizePts(card.routePoints) : [];
  }
  function cardIcon(card){ return cardRenderType(card)==='route-only' ? '🏢' : '🏠'; }
  function cardDisplayName(card){ return (cardIcon(card)+' '+String(card&&card.name||'')).trim(); }

  // Only provide compatibility helpers that are safe without touching the residential path.
  if(typeof window.serviceCardRenderType!=='function') window.serviceCardRenderType=cardRenderType;
  if(typeof window.serviceCardRoutePoints!=='function') window.serviceCardRoutePoints=cardRoutePoints;
  if(typeof window.serviceCardTypeIcon!=='function') window.serviceCardTypeIcon=cardIcon;
  if(typeof window.serviceCardDisplayName!=='function') window.serviceCardDisplayName=cardDisplayName;

  // Use the existing app functions as the scope bridge. They already close over lexical `S`.
  // This overlay therefore avoids direct `window.S` access entirely.
  const originalOpenRd=window.openRd;
  if(typeof originalOpenRd==='function'){
    window.openRd=function(id){
      const result=originalOpenRd.apply(this,arguments);
      try{
        const card=(typeof getZoneById==='function')?getZoneById(id):null;
        if(!card||cardRenderType(card)!=='route-only') return result;
        // Existing recovered app.js already contains route-only-aware helpers and Kakao service rendering.
        // Mark the active route-only entry so later recovery stages/tests can detect it without altering data.
        document.documentElement.dataset.sokchoRouteOnlyActive=String(id);
      }catch(e){
        console.warn('route-only recovery overlay openRd hook failed',e);
      }
      return result;
    };
  }

  const originalBackList=window.backList;
  if(typeof originalBackList==='function'){
    window.backList=function(){
      delete document.documentElement.dataset.sokchoRouteOnlyActive;
      return originalBackList.apply(this,arguments);
    };
  }

  const originalCloseSvcFullscreen=window.closeSvcFullscreen;
  if(typeof originalCloseSvcFullscreen==='function'){
    window.closeSvcFullscreen=function(){
      delete document.documentElement.dataset.sokchoRouteOnlyActive;
      return originalCloseSvcFullscreen.apply(this,arguments);
    };
  }

  window.__sokchoRecoveryRouteOnlyPatch={
    enabled:true,
    version:'20260826-a2',
    residentialBaselineTouched:false,
    directWindowSAccess:false
  };
})();
