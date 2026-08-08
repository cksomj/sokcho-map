// JW.ORG / Watchtower Online Library search-link restoration
// Narrow additive patch: existing zone/route search behavior remains unchanged.
(function(){
  'use strict';

  const JW_BASE='https://www.jw.org/ko/%EA%B2%80%EC%83%89/?q=';
  const WOL_BASE='https://wol.jw.org/ko/wol/s/r8/lp-ko?q=';

  function urls(q){
    const e=encodeURIComponent((q||'').trim());
    return {
      jw: JW_BASE+e,
      wol: WOL_BASE+e+'&p=par'
    };
  }

  function linkButton(label,url,bg,color){
    const a=document.createElement('a');
    a.href=url;
    a.target='_blank';
    a.rel='noopener noreferrer';
    a.textContent=label;
    a.style.cssText='display:block;text-decoration:none;padding:10px 12px;border-radius:9px;font-size:13px;font-weight:700;text-align:center;background:'+bg+';color:'+color+';border:1px solid rgba(0,0,0,.10);';
    return a;
  }

  function buildBox(q,id){
    const old=document.getElementById(id);
    if(old)old.remove();
    q=(q||'').trim();
    if(!q)return null;
    const u=urls(q);
    const box=document.createElement('div');
    box.id=id;
    box.setAttribute('data-jw-search-restore','1');
    box.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:8px;margin-top:6px;background:#fff;border:1px solid rgba(0,0,0,.12);border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,.08);';
    box.appendChild(linkButton('🔎 JW.ORG에서 검색',u.jw,'#eef5ff','#185FA5'));
    box.appendChild(linkButton('📚 온라인 라이브러리',u.wol,'#f4f8ed','#3B6D11'));
    return box;
  }

  function updateMobile(){
    const input=document.getElementById('mobile-zone-search');
    const host=document.getElementById('mobile-search-results');
    if(!input||!host)return;
    const q=input.value.trim();
    const old=document.getElementById('jw-search-mobile');
    if(old)old.remove();
    if(!q)return;
    const box=buildBox(q,'jw-search-mobile');
    if(box)host.appendChild(box);
  }

  function installStandalone(inputId,anchorSelector,boxId){
    const input=document.getElementById(inputId);
    if(!input)return;
    const anchor=input.closest(anchorSelector)||input.parentElement;
    if(!anchor||!anchor.parentNode)return;
    function update(){
      const old=document.getElementById(boxId);
      if(old)old.remove();
      const box=buildBox(input.value,boxId);
      if(box)anchor.insertAdjacentElement('afterend',box);
    }
    input.addEventListener('input',function(){setTimeout(update,0);});
    input.addEventListener('change',update);
  }

  function install(){
    const mobile=document.getElementById('mobile-zone-search');
    if(mobile){
      mobile.addEventListener('input',function(){setTimeout(updateMobile,0);});
      mobile.addEventListener('change',updateMobile);
    }
    installStandalone('zone-search','div','jw-search-zone');
    installStandalone('rte-search','.route-search','jw-search-route');
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',install,{once:true});
  }else{
    install();
  }
})();
