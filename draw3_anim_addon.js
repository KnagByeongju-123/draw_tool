/* ============================================================
   draw_tool3 작동 애니메이션 추가 모듈  v1.0
   ------------------------------------------------------------
   ■ 사용법
     draw_tool3.html 에서 draw3_section_addon.js 다음 줄에:
       <script src="draw3_anim_addon.js"></script>
     좌측 하단 "▶ 작동 모션" 패널 자동 생성.

   ■ 기능 (간단형)
     - 움직일 부품 선택 (드롭다운)
     - 이동 축 (X / Y / Z높이)
     - 이동량(mm) : 펀치 하강이면 음수
     - 속도
     - ▶재생 / ⏸정지 / ⟲원위치
     - 왕복(내렸다 올렸다) 자동 반복
   ------------------------------------------------------------
   * 기존 draw3 코드 무수정. 전역 PartAnim 하나만 추가.
   * 단면(SectionView)과 동시 사용 가능 — 움직이는 단면 연출.
   ============================================================ */
(function(){
  'use strict';

  var PartAnim = {
    playing:false,
    partId:null,
    axis:'z',        // 화면표기 z=높이(내부 Y)
    amount:-30,      // 이동량(mm)
    speed:1.0,       // 사이클 속도 배율
    mode:'pingpong', // 왕복
    _t:0,
    _home:null,      // 원위치 {x,y,z}
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
    // 부품 목록 변할 수 있으니 주기적 갱신
    setInterval(refreshPartList, 1500);
    requestAnimationFrame(loop);
    PartAnim._bound = true;
  }

  function getPart(id){
    if(id==null) return null;
    return state.parts.find(function(p){ return p.id===id; }) || null;
  }
  // 내부 three 축 매핑 (화면 x=내부x, y=내부z(녹색), z높이=내부y)
  function axisKey(a){ return a==='x'?'x' : a==='y'?'z' : 'y'; }

  function play(){
    var part = getPart(PartAnim.partId);
    if(!part || !part.mesh){ toastSafe('움직일 부품을 선택하세요'); return; }
    // 원위치 저장(처음 재생 시)
    if(!PartAnim._home){
      PartAnim._home = {
        x:part.mesh.position.x, y:part.mesh.position.y, z:part.mesh.position.z
      };
    }
    PartAnim.playing = true;
    setBtns();
  }
  function pause(){ PartAnim.playing=false; setBtns(); }

  function home(){
    PartAnim.playing=false;
    var part = getPart(PartAnim.partId);
    if(part && part.mesh && PartAnim._home){
      part.mesh.position.set(PartAnim._home.x, PartAnim._home.y, PartAnim._home.z);
    }
    PartAnim._t = 0;
    setBtns();
  }

  // 부품 바뀌면 이전 부품 원위치 복귀 후 home 리셋
  function changePart(newId){
    home();
    PartAnim.partId = newId;
    PartAnim._home = null;
    PartAnim._t = 0;
  }

  var lastTime = performance.now();
  function loop(){
    var now = performance.now();
    var dt = (now - lastTime)/1000; lastTime = now;
    if(PartAnim.playing){
      var part = getPart(PartAnim.partId);
      if(part && part.mesh && PartAnim._home){
        PartAnim._t += dt * PartAnim.speed;
        // 0→1→0 왕복 (사인 보간으로 부드럽게: 멈춤-가속-감속)
        var cycle = PartAnim._t % 2;           // 0~2
        var f = cycle <= 1 ? cycle : (2-cycle); // 0→1→0 (삼각)
        var s = 0.5 - 0.5*Math.cos(f*Math.PI);  // ease in-out
        var k = axisKey(PartAnim.axis);
        part.mesh.position[k] = PartAnim._home[k] + PartAnim.amount * s;
        updateProgress(f);
      }
    }
    requestAnimationFrame(loop);
  }

  function toastSafe(msg){
    try{ if(typeof toast==='function'){ toast(msg); return; } }catch(_){}
    var el=document.getElementById('paMsg'); if(el) el.textContent=msg;
  }

  // ---- UI ----
  function buildUI(){
    if(document.getElementById('partAnimPanel')) return;
    var box=document.createElement('div');
    box.id='partAnimPanel';
    box.style.cssText='position:fixed;left:14px;bottom:14px;z-index:9999;'+
      'background:rgba(26,30,36,.94);border:1px solid #3a4450;border-radius:10px;'+
      'padding:12px 14px;width:226px;font-family:"Malgun Gothic",sans-serif;'+
      'color:#e8edf2;box-shadow:0 6px 20px rgba(0,0,0,.4);font-size:12px;';
    box.innerHTML=
      '<div style="font-weight:700;font-size:13px;border-left:3px solid #3a9bdc;padding-left:7px;margin-bottom:10px;">▶ 작동 모션 <span style="color:#5a6675;font-size:10px;">v1.0</span></div>'+
      '<div style="color:#8a96a5;margin-bottom:3px;">움직일 부품</div>'+
      '<select id="paPart" style="width:100%;background:#10151c;color:#e8edf2;border:1px solid #3a4450;border-radius:5px;padding:6px;font-size:12px;margin-bottom:9px;font-family:inherit;cursor:pointer;"></select>'+
      '<div style="display:flex;gap:5px;margin-bottom:9px;">'+
        '<button class="pa-axis" data-ax="x" style="flex:1;">X</button>'+
        '<button class="pa-axis" data-ax="y" style="flex:1;">Y</button>'+
        '<button class="pa-axis pa-on" data-ax="z" style="flex:1;">Z(상하)</button></div>'+
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px;"><span style="color:#8a96a5;">이동량(mm)</span><span id="paAmtV" style="color:#3a9bdc;">-30</span></div>'+
      '<input type="range" id="paAmt" min="-100" max="100" value="-30" step="1" style="width:100%;accent-color:#3a9bdc;cursor:pointer;margin-bottom:9px;">'+
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px;"><span style="color:#8a96a5;">속도</span><span id="paSpdV" style="color:#3a9bdc;">1.0×</span></div>'+
      '<input type="range" id="paSpd" min="0.2" max="3" value="1" step="0.1" style="width:100%;accent-color:#3a9bdc;cursor:pointer;margin-bottom:10px;">'+
      '<div style="display:flex;gap:5px;margin-bottom:8px;">'+
        '<button id="paPlay" style="flex:1.4;background:#3a9bdc;color:#08121a;font-weight:700;border:none;">▶ 재생</button>'+
        '<button id="paPause" style="flex:1;">⏸</button>'+
        '<button id="paHome" style="flex:1;">⟲</button></div>'+
      '<div style="height:5px;background:#10151c;border-radius:3px;overflow:hidden;"><div id="paBar" style="height:100%;width:0%;background:#3a9bdc;transition:none;"></div></div>'+
      '<div id="paMsg" style="color:#8a96a5;font-size:10px;margin-top:6px;min-height:12px;">부품 선택 후 재생</div>';
    document.body.appendChild(box);

    var st=document.createElement('style');
    st.textContent='#partAnimPanel button{background:#2a323d;color:#e8edf2;border:1px solid #3a4450;border-radius:5px;padding:7px 0;font-size:12px;cursor:pointer;font-family:inherit;}'+
      '#partAnimPanel button:hover{border-color:#3a9bdc;color:#3a9bdc;}'+
      '#partAnimPanel #paPlay:hover{color:#08121a;opacity:.9;}'+
      '#partAnimPanel .pa-axis.pa-on{background:#3a9bdc;color:#08121a;font-weight:700;border-color:#3a9bdc;}';
    document.head.appendChild(st);

    document.getElementById('paPart').addEventListener('change',function(e){
      var id = e.target.value===''? null : (isNaN(+e.target.value)? e.target.value : +e.target.value);
      changePart(id);
    });
    document.querySelectorAll('#partAnimPanel .pa-axis').forEach(function(b){
      b.addEventListener('click',function(){
        document.querySelectorAll('#partAnimPanel .pa-axis').forEach(function(x){x.classList.remove('pa-on');});
        b.classList.add('pa-on'); 
        home(); PartAnim.axis=b.dataset.ax;
      });
    });
    document.getElementById('paAmt').addEventListener('input',function(e){
      PartAnim.amount=parseFloat(e.target.value);
      document.getElementById('paAmtV').textContent=PartAnim.amount;
    });
    document.getElementById('paSpd').addEventListener('input',function(e){
      PartAnim.speed=parseFloat(e.target.value);
      document.getElementById('paSpdV').textContent=PartAnim.speed.toFixed(1)+'×';
    });
    document.getElementById('paPlay').addEventListener('click',play);
    document.getElementById('paPause').addEventListener('click',pause);
    document.getElementById('paHome').addEventListener('click',home);
  }

  function setBtns(){
    var play=document.getElementById('paPlay');
    if(play) play.textContent = PartAnim.playing ? '▶ 재생중' : '▶ 재생';
  }
  function updateProgress(f){
    var bar=document.getElementById('paBar');
    if(bar) bar.style.width=(f*100).toFixed(0)+'%';
  }

  function refreshPartList(){
    var sel=document.getElementById('paPart');
    if(!sel) return;
    var cur = sel.value;
    var parts = state.parts || [];
    // 변경 없으면 스킵
    var sig = parts.map(function(p){return p.id+':'+(p.name||'');}).join('|');
    if(sel._sig===sig) return;
    sel._sig=sig;
    sel.innerHTML='';
    var o0=document.createElement('option'); o0.value=''; o0.textContent='— 선택 —'; sel.appendChild(o0);
    parts.forEach(function(p){
      var o=document.createElement('option');
      o.value=p.id;
      o.textContent=(p.name||('부품'+p.id));
      sel.appendChild(o);
    });
    if(cur) sel.value=cur;
  }

  waitInit();
})();
