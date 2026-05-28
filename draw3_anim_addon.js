/* ============================================================
   draw_tool3 작동 애니메이션 추가 모듈  v2.0 (순차 키프레임)
   ------------------------------------------------------------
   ■ 사용법
     draw_tool3.html 에서 draw3_section_addon.js 다음 줄에:
       <script src="draw3_anim_addon.js"></script>
     좌측 하단 "▶ 작동 시퀀스" 패널 자동 생성.

   ■ 기능 (순차 키프레임)
     - 동작 스텝을 순서대로 추가
       각 스텝 = [부품] [축] [이동량mm] [시간초]
       예) 1.펀치 Z -40  0.8초   (펀치 하강)
           2.(대기)        0.4초   (성형 유지)
           3.펀치 Z +40  0.8초   (펀치 상승)
           4.이젝터 Z +15 0.5초   (제품 밀어올림)
     - ▶전체재생(순서대로) / ⏸정지 / ⟲원위치
     - 반복 재생 옵션
   ------------------------------------------------------------
   * 기존 draw3 코드 무수정. 전역 PartAnim 하나만 추가.
   * 단면(SectionView)과 동시 사용 가능.
   ============================================================ */
(function(){
  'use strict';

  var PartAnim = {
    steps: [],          // [{partId, axis, amount, dur}]
    playing:false,
    loop:false,
    _idx:0,             // 현재 스텝
    _t:0,               // 현재 스텝 경과(초)
    _homes:{},          // partId -> {x,y,z} 원위치
    _stepStart:{},      // 스텝 시작 시 부품 위치(상대 이동 기준)
    _bound:false
  };
  window.PartAnim = PartAnim;

  function waitInit(){
    if(typeof THREE==='undefined' || typeof scene==='undefined' ||
       typeof state==='undefined' || !state.parts){ return setTimeout(waitInit,200); }
    setup();
  }
  function setup(){
    buildUI();
    refreshPartList();
    setInterval(refreshPartList, 1500);
    requestAnimationFrame(loop);
    PartAnim._bound = true;
  }

  function getPart(id){
    if(id==null||id==='') return null;
    return state.parts.find(function(p){ return String(p.id)===String(id); }) || null;
  }
  function axisKey(a){ return a==='x'?'x' : a==='y'?'z' : 'y'; } // 화면z(상하)=내부y

  // 모든 관련 부품 원위치 저장
  function captureHomes(){
    PartAnim._homes = {};
    PartAnim.steps.forEach(function(s){
      if(s.partId==null) return;
      var p=getPart(s.partId);
      if(p&&p.mesh&&!PartAnim._homes[s.partId]){
        PartAnim._homes[s.partId]={x:p.mesh.position.x,y:p.mesh.position.y,z:p.mesh.position.z};
      }
    });
  }
  function restoreHomes(){
    Object.keys(PartAnim._homes).forEach(function(id){
      var p=getPart(id); var h=PartAnim._homes[id];
      if(p&&p.mesh&&h) p.mesh.position.set(h.x,h.y,h.z);
    });
  }

  function playAll(){
    if(PartAnim.steps.length===0){ toastSafe('스텝을 먼저 추가하세요'); return; }
    captureHomes();
    PartAnim._idx=0; PartAnim._t=0;
    beginStep(0);
    PartAnim.playing=true; setBtns();
  }
  function pause(){ PartAnim.playing=false; setBtns(); }
  function home(){
    PartAnim.playing=false;
    restoreHomes();
    PartAnim._idx=0; PartAnim._t=0;
    setBtns(); updateStepHighlight();
  }

  // 스텝 시작: 현재 부품 위치를 기준점으로 기록(상대이동)
  function beginStep(i){
    var s=PartAnim.steps[i];
    PartAnim._stepStart={};
    if(s && s.partId!=null){
      var p=getPart(s.partId);
      if(p&&p.mesh){
        PartAnim._stepStart[s.partId]={x:p.mesh.position.x,y:p.mesh.position.y,z:p.mesh.position.z};
      }
    }
    PartAnim._t=0;
    updateStepHighlight();
  }

  var lastTime=performance.now();
  function loop(){
    var now=performance.now(); var dt=(now-lastTime)/1000; lastTime=now;
    if(PartAnim.playing && PartAnim.steps.length){
      var s=PartAnim.steps[PartAnim._idx];
      var dur=Math.max(0.05, s.dur||0.5);
      PartAnim._t += dt;
      var f=Math.min(1, PartAnim._t/dur);
      var ease=0.5-0.5*Math.cos(f*Math.PI); // in-out

      if(s.partId!=null){
        var p=getPart(s.partId);
        var base=PartAnim._stepStart[s.partId];
        if(p&&p.mesh&&base){
          var k=axisKey(s.axis);
          p.mesh.position[k]=base[k]+(s.amount||0)*ease;
        }
      }
      updateProgress((PartAnim._idx+f)/PartAnim.steps.length);

      if(f>=1){
        PartAnim._idx++;
        if(PartAnim._idx>=PartAnim.steps.length){
          if(PartAnim.loop){ // 반복: 원위치 후 처음부터
            restoreHomes(); PartAnim._idx=0; beginStep(0);
          } else {
            PartAnim.playing=false; setBtns();
          }
        } else {
          beginStep(PartAnim._idx);
        }
      }
    }
    requestAnimationFrame(loop);
  }

  function toastSafe(msg){
    try{ if(typeof toast==='function'){ toast(msg); return; } }catch(_){}
    var el=document.getElementById('paMsg'); if(el) el.textContent=msg;
  }

  // ---- 스텝 조작 ----
  function addStep(){
    PartAnim.steps.push({partId:null, axis:'z', amount:-30, dur:0.8});
    renderSteps();
  }
  function delStep(i){ PartAnim.steps.splice(i,1); renderSteps(); }
  function moveStep(i,dir){
    var j=i+dir; if(j<0||j>=PartAnim.steps.length) return;
    var t=PartAnim.steps[i]; PartAnim.steps[i]=PartAnim.steps[j]; PartAnim.steps[j]=t;
    renderSteps();
  }

  // ---- UI ----
  function buildUI(){
    if(document.getElementById('partAnimPanel')) return;
    var box=document.createElement('div');
    box.id='partAnimPanel';
    box.style.cssText='position:fixed;left:14px;bottom:14px;z-index:9999;'+
      'background:rgba(26,30,36,.95);border:1px solid #3a4450;border-radius:10px;'+
      'padding:12px 14px;width:300px;font-family:"Malgun Gothic",sans-serif;'+
      'color:#e8edf2;box-shadow:0 6px 20px rgba(0,0,0,.4);font-size:12px;max-height:80vh;overflow-y:auto;';
    box.innerHTML=
      '<div style="font-weight:700;font-size:13px;border-left:3px solid #3a9bdc;padding-left:7px;margin-bottom:9px;">▶ 작동 시퀀스 <span style="color:#5a6675;font-size:10px;">v2.0</span></div>'+
      '<div id="paSteps" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px;"></div>'+
      '<button id="paAdd" style="width:100%;margin-bottom:9px;border:1px dashed #3a4450;">＋ 스텝 추가</button>'+
      '<div style="display:flex;gap:5px;margin-bottom:7px;">'+
        '<button id="paPlay" style="flex:1.6;background:#3a9bdc;color:#08121a;font-weight:700;border:none;">▶ 전체 재생</button>'+
        '<button id="paPause" style="flex:1;">⏸</button>'+
        '<button id="paHome" style="flex:1;">⟲</button></div>'+
      '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin-bottom:7px;"><input type="checkbox" id="paLoop" style="width:14px;height:14px;accent-color:#3a9bdc;cursor:pointer;"> 반복 재생</label>'+
      '<div style="height:5px;background:#10151c;border-radius:3px;overflow:hidden;"><div id="paBar" style="height:100%;width:0%;background:#3a9bdc;"></div></div>'+
      '<div id="paMsg" style="color:#8a96a5;font-size:10px;margin-top:6px;min-height:12px;">스텝을 추가해 순서대로 동작을 만드세요</div>';
    document.body.appendChild(box);

    var st=document.createElement('style');
    st.textContent='#partAnimPanel button{background:#2a323d;color:#e8edf2;border:1px solid #3a4450;border-radius:5px;padding:6px 0;font-size:12px;cursor:pointer;font-family:inherit;}'+
      '#partAnimPanel button:hover{border-color:#3a9bdc;color:#3a9bdc;}'+
      '#partAnimPanel #paPlay:hover{color:#08121a;opacity:.9;}'+
      '#partAnimPanel select,#partAnimPanel input[type=number]{background:#10151c;color:#e8edf2;border:1px solid #3a4450;border-radius:4px;padding:4px;font-size:11px;font-family:inherit;}'+
      '#partAnimPanel .pa-step{background:#10151c;border:1px solid #2a323d;border-radius:6px;padding:7px;}'+
      '#partAnimPanel .pa-step.active{border-color:#3a9bdc;box-shadow:0 0 0 1px #3a9bdc;}'+
      '#partAnimPanel .pa-axis-s{padding:3px 6px;font-size:10px;}'+
      '#partAnimPanel .pa-axis-s.on{background:#3a9bdc;color:#08121a;font-weight:700;border-color:#3a9bdc;}'+
      '#partAnimPanel .pa-mini{padding:3px 7px;font-size:11px;}';
    document.head.appendChild(st);

    document.getElementById('paAdd').addEventListener('click',addStep);
    document.getElementById('paPlay').addEventListener('click',playAll);
    document.getElementById('paPause').addEventListener('click',pause);
    document.getElementById('paHome').addEventListener('click',home);
    document.getElementById('paLoop').addEventListener('change',function(e){PartAnim.loop=e.target.checked;});

    renderSteps();
  }

  function partOptions(selId){
    var opts='<option value="">(대기)</option>';
    (state.parts||[]).forEach(function(p){
      var sel = String(p.id)===String(selId)?' selected':'';
      opts+='<option value="'+p.id+'"'+sel+'>'+(p.name||('부품'+p.id))+'</option>';
    });
    return opts;
  }

  function renderSteps(){
    var wrap=document.getElementById('paSteps');
    if(!wrap) return;
    wrap.innerHTML='';
    PartAnim.steps.forEach(function(s,i){
      var div=document.createElement('div');
      div.className='pa-step'; div.dataset.i=i;
      div.innerHTML=
        '<div style="display:flex;align-items:center;gap:5px;margin-bottom:5px;">'+
          '<span style="color:#3a9bdc;font-weight:700;font-size:11px;">'+(i+1)+'</span>'+
          '<select class="pa-part" style="flex:1;">'+partOptions(s.partId)+'</select>'+
          '<button class="pa-mini pa-up" title="위로">▲</button>'+
          '<button class="pa-mini pa-dn" title="아래로">▼</button>'+
          '<button class="pa-mini pa-del" title="삭제" style="color:#ff6b6b;">✕</button>'+
        '</div>'+
        '<div style="display:flex;align-items:center;gap:4px;">'+
          '<button class="pa-axis-s'+(s.axis==='x'?' on':'')+'" data-ax="x">X</button>'+
          '<button class="pa-axis-s'+(s.axis==='y'?' on':'')+'" data-ax="y">Y</button>'+
          '<button class="pa-axis-s'+(s.axis==='z'?' on':'')+'" data-ax="z">Z</button>'+
          '<input type="number" class="pa-amt" value="'+s.amount+'" step="1" style="width:54px;" title="이동량(mm)">'+
          '<span style="color:#5a6675;font-size:10px;">mm</span>'+
          '<input type="number" class="pa-dur" value="'+s.dur+'" step="0.1" min="0.1" style="width:46px;" title="시간(초)">'+
          '<span style="color:#5a6675;font-size:10px;">초</span>'+
        '</div>';
      wrap.appendChild(div);

      div.querySelector('.pa-part').addEventListener('change',function(e){
        var v=e.target.value; s.partId = v===''? null : v;
      });
      div.querySelectorAll('.pa-axis-s').forEach(function(b){
        b.addEventListener('click',function(){
          div.querySelectorAll('.pa-axis-s').forEach(function(x){x.classList.remove('on');});
          b.classList.add('on'); s.axis=b.dataset.ax;
        });
      });
      div.querySelector('.pa-amt').addEventListener('input',function(e){ s.amount=parseFloat(e.target.value)||0; });
      div.querySelector('.pa-dur').addEventListener('input',function(e){ s.dur=Math.max(0.1,parseFloat(e.target.value)||0.5); });
      div.querySelector('.pa-up').addEventListener('click',function(){ moveStep(i,-1); });
      div.querySelector('.pa-dn').addEventListener('click',function(){ moveStep(i,+1); });
      div.querySelector('.pa-del').addEventListener('click',function(){ delStep(i); });
    });
  }

  function updateStepHighlight(){
    document.querySelectorAll('#paSteps .pa-step').forEach(function(d,i){
      d.classList.toggle('active', PartAnim.playing && i===PartAnim._idx);
    });
  }
  function setBtns(){
    var p=document.getElementById('paPlay');
    if(p) p.textContent=PartAnim.playing?'▶ 재생중':'▶ 전체 재생';
    updateStepHighlight();
  }
  function updateProgress(r){
    var bar=document.getElementById('paBar');
    if(bar) bar.style.width=(Math.min(1,r)*100).toFixed(0)+'%';
  }

  function refreshPartList(){
    // 부품 목록 변경 시 각 스텝의 select 갱신(선택값 보존)
    var sig=(state.parts||[]).map(function(p){return p.id+':'+(p.name||'');}).join('|');
    if(refreshPartList._sig===sig) return;
    refreshPartList._sig=sig;
    document.querySelectorAll('#paSteps .pa-part').forEach(function(sel,i){
      var s=PartAnim.steps[i]; if(!s) return;
      sel.innerHTML=partOptions(s.partId);
    });
  }

  waitInit();
})();
