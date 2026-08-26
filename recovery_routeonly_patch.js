// Sokcho recovery overlay — apartment route-only compatibility
// Recovery branch only. Residential baseline remains untouched.
(function(){
  'use strict';

  const original={
    openRd:window.openRd,
    drawRdZone:window.drawRdZone,
    drawRoute:window.drawRoute,
    startSvcAndGo:window.startSvcAndGo,
    openSvcFullscreen:window.openSvcFullscreen,
    backList:window.backList,
    closeSvcFullscreen:window.closeSvcFullscreen
  };

  function pointPair(pt){
    if(Array.isArray(pt)) return [Number(pt[0]),Number(pt[1])];
    if(pt&&typeof pt.lat==='number'&&typeof pt.lng==='number') return [pt.lat,pt.lng];
    return null;
  }
  function normalizePts(pts){
    return (Array.isArray(pts)?pts:[]).map(pointPair).filter(p=>p&&Number.isFinite(p[0])&&Number.isFinite(p[1]));
  }
  function renderType(card){ return card&&card.cardType==='route-only'?'route-only':'polygon'; }
  function routePts(card){ return renderType(card)==='route-only'?normalizePts(card.routePoints):[]; }
  function cardIcon(card){ return renderType(card)==='route-only'?'🏢':'🏠'; }
  function displayName(card){ return (cardIcon(card)+' '+String(card&&card.name||'')).trim(); }
  function currentCard(){
    try{return (typeof S!=='undefined'&&Array.isArray(S.zones))?S.zones.find(z=>String(z.id)===String(S.curZone)):null;}catch(e){return null;}
  }
  function isRouteOnly(card){ return renderType(card)==='route-only'; }
  function destination(card){ return routePts(card)[0]||null; }
  function routeColor(card){ return card&&card.routeColor||'#003A8C'; }

  window.serviceCardRenderType=window.serviceCardRenderType||renderType;
  window.serviceCardRoutePoints=window.serviceCardRoutePoints||routePts;
  window.serviceCardTypeIcon=window.serviceCardTypeIcon||cardIcon;
  window.serviceCardDisplayName=window.serviceCardDisplayName||displayName;
  window.serviceCardDestinationPoint=window.serviceCardDestinationPoint||function(card){
    if(isRouteOnly(card))return destination(card);
    return typeof zoneStartPoint==='function'?zoneStartPoint(card,typeof S!=='undefined'?S.routeMode:null):null;
  };

  function clearRouteLayers(){
    if(typeof S==='undefined'||!S.rdMap)return;
    if(Array.isArray(S.rdLayers)){
      S.rdLayers.forEach(l=>{try{S.rdMap.removeLayer(l);}catch(e){}});
      S.rdLayers=[];
    }
    if(Array.isArray(S.rdRteLayers)){
      S.rdRteLayers.forEach(l=>{try{S.rdMap.removeLayer(l);}catch(e){}});
      S.rdRteLayers=[];
    }
  }

  function routePointIcon(label,color){
    return L.divIcon({
      html:'<div style="min-width:30px;height:30px;border-radius:15px;background:'+color+';color:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;padding:0 6px;white-space:nowrap;">'+label+'</div>',
      className:'',iconSize:[30,30],iconAnchor:[15,15]
    });
  }

  function renderRouteOnlyOnRd(card){
    if(typeof S==='undefined'||!S.rdMap||typeof L==='undefined')return;
    clearRouteLayers();
    const pts=routePts(card),color=routeColor(card);
    if(pts.length>=2){
      S.rdLayers.push(L.polyline(pts,{color,weight:6,opacity:1,interactive:false}).addTo(S.rdMap));
      if(typeof addRouteArrowMarkers==='function'){
        try{S.rdLayers.push(...addRouteArrowMarkers(S.rdMap,pts,color,720));}catch(e){}
      }
    }
    pts.forEach((pt,i)=>{
      const label=i===0?'시작':String(i+1);
      S.rdLayers.push(L.marker(pt,{icon:routePointIcon(label,color),zIndexOffset:700,interactive:false}).addTo(S.rdMap));
    });
    if(pts.length&&L.latLngBounds){
      const bounds=L.latLngBounds(pts);
      if(bounds.isValid())S.rdMap.fitBounds(bounds,{padding:[52,52],maxZoom:18,animate:false});
    }
    const box=document.getElementById('rd-info');
    if(box)box.innerHTML='<h4>🏢 아파트 경로</h4><p style="font-size:12px;color:var(--txm);line-height:1.6;">번호 포인트를 순서대로 이동하며 봉사합니다. 아파트 카드는 1조·2조 선택 없이 하나의 경로만 사용합니다.</p>';
  }

  if(typeof original.drawRdZone==='function'){
    window.drawRdZone=function(card){
      if(!isRouteOnly(card))return original.drawRdZone.apply(this,arguments);
      renderRouteOnlyOnRd(card);
    };
  }
  if(typeof original.drawRoute==='function'){
    window.drawRoute=function(){
      const card=currentCard();
      if(!isRouteOnly(card))return original.drawRoute.apply(this,arguments);
      renderRouteOnlyOnRd(card);
    };
  }
  if(typeof original.openRd==='function'){
    window.openRd=function(id){
      const result=original.openRd.apply(this,arguments);
      try{
        const card=(typeof getZoneById==='function')?getZoneById(id):currentCard();
        if(isRouteOnly(card)){
          if(typeof S!=='undefined'){
            S.routeMode='route-only';
            S.routeDirection=null;
          }
          document.documentElement.dataset.sokchoRouteOnlyActive=String(id);
          setTimeout(()=>renderRouteOnlyOnRd(card),0);
        }else{
          delete document.documentElement.dataset.sokchoRouteOnlyActive;
        }
      }catch(e){console.warn('route-only openRd recovery hook failed',e);}
      return result;
    };
  }

  if(typeof original.startSvcAndGo==='function'){
    window.startSvcAndGo=function(){
      const card=currentCard();
      if(!isRouteOnly(card))return original.startSvcAndGo.apply(this,arguments);
      if(typeof S==='undefined'||!S.curZone)return;
      S.routeMode='route-only';
      S.routeDirection=null;
      const resume=!!(S.pendingResume||(typeof isInProgress==='function'&&isInProgress(S.curZone)));
      S.pendingResume=false;
      if(S.role==='volunteer'||S.role==='leader'){
        if(!S.session.active&&typeof startSession==='function')startSession(S.curZone,resume,{openRoute:false});
        if(typeof openSvcFullscreen==='function')openSvcFullscreen(S.curZone);
      }else if(typeof startSvcDirect==='function'){
        startSvcDirect();
      }
    };
  }

  function renderRouteOnlyOnSvc(card){
    if(typeof svcMapInst==='undefined'||!svcMapInst||typeof L==='undefined')return false;
    const pts=routePts(card),color=routeColor(card);
    if(typeof clearSvcRouteLayers==='function')clearSvcRouteLayers();
    if(Array.isArray(svcLayers)){
      svcLayers.forEach(l=>{try{svcMapInst.removeLayer(l);}catch(e){}});
      svcLayers=[];
    }
    if(pts.length>=2){
      const line=L.polyline(pts,{color,weight:6,opacity:1,interactive:false}).addTo(svcMapInst);
      if(Array.isArray(svcRouteLayers))svcRouteLayers.push(line);
      if(typeof addRouteArrowMarkers==='function'&&Array.isArray(svcRouteLayers)){
        try{svcRouteLayers.push(...addRouteArrowMarkers(svcMapInst,pts,color,820));}catch(e){}
      }
    }
    pts.forEach((pt,i)=>{
      const marker=L.marker(pt,{icon:routePointIcon(i===0?'시작':String(i+1),color),zIndexOffset:850,interactive:false}).addTo(svcMapInst);
      if(Array.isArray(svcRouteLayers))svcRouteLayers.push(marker);
    });
    if(pts.length){
      const bounds=L.latLngBounds(pts);
      if(bounds.isValid())svcMapInst.fitBounds(bounds,{padding:[46,46],maxZoom:18,animate:false});
    }
    return true;
  }

  if(typeof original.openSvcFullscreen==='function'){
    window.openSvcFullscreen=function(zoneId){
      const card=(typeof getZoneById==='function')?getZoneById(zoneId):null;
      if(!isRouteOnly(card))return original.openSvcFullscreen.apply(this,arguments);
      const result=original.openSvcFullscreen.apply(this,arguments);
      try{
        const name=document.getElementById('svc-zone-name');if(name)name.textContent=displayName(card);
        const comp=document.getElementById('svc-companions');if(comp)comp.textContent='차량 단위 단일 경로 봉사중';
        setTimeout(()=>renderRouteOnlyOnSvc(card),120);
        setTimeout(()=>renderRouteOnlyOnSvc(card),420);
      }catch(e){console.warn('route-only service recovery hook failed',e);}
      return result;
    };
  }

  if(typeof original.backList==='function'){
    window.backList=function(){delete document.documentElement.dataset.sokchoRouteOnlyActive;return original.backList.apply(this,arguments);};
  }
  if(typeof original.closeSvcFullscreen==='function'){
    window.closeSvcFullscreen=function(){delete document.documentElement.dataset.sokchoRouteOnlyActive;return original.closeSvcFullscreen.apply(this,arguments);};
  }

  window.__sokchoRecoveryRouteOnlyPatch={enabled:true,version:'20260826-a3',residentialBaselineTouched:false};
})();
