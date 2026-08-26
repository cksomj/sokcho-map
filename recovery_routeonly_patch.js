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
  function cardDestination(card){
    if(cardRenderType(card)==='route-only') return cardRoutePoints(card)[0]||null;
    if(typeof window.zoneStartPoint==='function') return window.zoneStartPoint(card, window.S&&S.routeMode);
    return null;
  }

  window.serviceCardRenderType = window.serviceCardRenderType || cardRenderType;
  window.serviceCardRoutePoints = window.serviceCardRoutePoints || cardRoutePoints;
  window.serviceCardTypeIcon = window.serviceCardTypeIcon || cardIcon;
  window.serviceCardDisplayName = window.serviceCardDisplayName || cardDisplayName;
  window.serviceCardDestinationPoint = window.serviceCardDestinationPoint || cardDestination;

  // Preserve existing residential behavior. Only route-only cards take this path.
  const originalDrawRdZone = window.drawRdZone;
  if(typeof originalDrawRdZone==='function'){
    window.drawRdZone = function(z){
      if(cardRenderType(z)!=='route-only') return originalDrawRdZone.apply(this, arguments);
      if(typeof window.clearRdLayers==='function') clearRdLayers();
      if(typeof window.keepMapDraggable==='function' && window.S&&S.rdMap) keepMapDraggable(S.rdMap);
      // Deliberately no polygon for apartment cards.
      const pts=cardRoutePoints(z);
      if(window.S&&S.rdMap&&pts.length){
        const bounds = window.L && L.latLngBounds ? L.latLngBounds(pts) : null;
        if(bounds&&bounds.isValid()) S.rdMap.fitBounds(bounds,{padding:[52,52],maxZoom:18,animate:false});
      }
    };
  }

  const originalDrawRoute = window.drawRoute;
  if(typeof originalDrawRoute==='function'){
    window.drawRoute = function(){
      const z=window.S&&Array.isArray(S.zones)?S.zones.find(x=>String(x.id)===String(S.curZone)):null;
      if(!z || cardRenderType(z)!=='route-only') return originalDrawRoute.apply(this, arguments);
      const pts=cardRoutePoints(z);
      if(!window.S || !S.rdMap) return;
      if(Array.isArray(S.rdLayers)){
        S.rdLayers.forEach(l=>{ try{S.rdMap.removeLayer(l);}catch(e){} });
        S.rdLayers=[];
      }
      const color=z.routeColor||'#003A8C';
      if(pts.length>=2 && window.L){
        const line=L.polyline(pts,{color,weight:6,opacity:1,interactive:false}).addTo(S.rdMap);
        S.rdLayers.push(line);
      }
      if(window.L){
        pts.forEach((pt,i)=>{
          const label=i===0?'시작':String(i+1);
          const icon=L.divIcon({html:'<div style="min-width:28px;height:28px;border-radius:14px;background:'+color+';color:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;padding:0 5px;white-space:nowrap;">'+label+'</div>',className:'',iconSize:[28,28],iconAnchor:[14,14]});
          S.rdLayers.push(L.marker(pt,{icon,zIndexOffset:700,interactive:false}).addTo(S.rdMap));
        });
      }
      const box=document.getElementById('rd-info');
      if(box) box.innerHTML='<h4>🏢 아파트 경로</h4><p style="font-size:12px;line-height:1.6;">지도 위 번호 포인트를 순서대로 이동하며 봉사합니다.</p>';
    };
  }

  // Apartment service entry must not require 2-person / 4-person team direction selection.
  const originalStartSvcAndGo = window.startSvcAndGo;
  if(typeof originalStartSvcAndGo==='function'){
    window.startSvcAndGo = function(){
      const z=window.S&&Array.isArray(S.zones)?S.zones.find(x=>String(x.id)===String(S.curZone)):null;
      if(!z || cardRenderType(z)!=='route-only') return originalStartSvcAndGo.apply(this, arguments);
      const prevMode=S.routeMode, prevDirection=S.routeDirection;
      S.routeMode='route-only';
      S.routeDirection=null;
      try{
        const resume=!!(S.pendingResume || (typeof window.isInProgress==='function'&&isInProgress(S.curZone)));
        S.pendingResume=false;
        if((S.role==='volunteer'||S.role==='leader')){
          if(!S.session.active && typeof window.startSession==='function') startSession(S.curZone,resume,{openRoute:false});
          if(typeof window.openSvcFullscreen==='function') openSvcFullscreen(S.curZone);
        }else if(typeof window.startSvcDirect==='function'){
          startSvcDirect();
        }
      } finally {
        if(!S.session.active){ S.routeMode=prevMode; S.routeDirection=prevDirection; }
      }
    };
  }

  window.__sokchoRecoveryRouteOnlyPatch={enabled:true,version:'20260826-a1'};
})();
