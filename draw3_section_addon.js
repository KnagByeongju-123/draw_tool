/* ============================================================
   draw_tool3 단면(Section / Clipping) 추가 모듈  v1.1
   ------------------------------------------------------------
   v1.1 변경점:
     - 캡(단면 막기)을 [스텐실 버퍼] 방식으로 교체
       → 가운데 구멍(홀) 있는 회전체, 오목 형상도 깔끔하게 막힘
       (v1.0 fan 방식은 홀 단면에서 중앙부가 지저분했음)

   ■ 사용법
     draw_tool3.html 에서 draw_tool3.js 다음 줄에:
       <script src="draw3_section_addon.js"></script>
     우측 하단 "✂ 단면 보기" 패널 자동 생성.
   ============================================================ */
(function(){
  'use strict';

  var SectionView = {
    enabled:false, axis:'x', pos:0, flip:false, capOn:true,
    plane:null, capGroup:null, _bound:false, _capPlanes:[]
  };
  window.SectionView = SectionView;

  function waitInit(){
    if (typeof THREE==='undefined' || typeof scene==='undefined' ||
        typeof renderer==='undefined' || !renderer){ return setTimeout(waitInit,200); }
    setup();
  }

  function setup(){
    renderer.localClippingEnabled = true;
    SectionView.plane = new THREE.Plane(new THREE.Vector3(-1,0,0), 1e6);
    SectionView.capGroup = new THREE.Group();
    SectionView.capGroup.name = '__sectionCaps';
    scene.add(SectionView.capGroup);
    buildUI();
    SectionView._bound = true;
    tickReapply();
  }

  function updatePlane(){
    var p = SectionView.plane; if(!p) return;
    if(!SectionView.enabled){ p.constant=1e6; clearCaps(); applyToAllParts(); return; }
    var n = new THREE.Vector3(0,0,0);
    if(SectionView.axis==='x') n.set(1,0,0);
    else if(SectionView.axis==='y') n.set(0,0,1);
    else n.set(0,1,0);
    if(SectionView.flip) n.multiplyScalar(-1);
    p.normal.copy(n).multiplyScalar(-1);
    p.constant = SectionView.pos * (SectionView.flip ? -1 : 1);
    applyToAllParts();
    if(SectionView.capOn) buildStencilCaps(); else clearCaps();
  }

  function applyToAllParts(){
    if(typeof state==='undefined' || !state.parts) return;
    var planes = SectionView.enabled ? [SectionView.plane] : [];
    state.parts.forEach(function(part){
      if(!part.mesh) return;
      part.mesh.traverse(function(o){
        if(!(o.isMesh && o.material)) return;
        var mats = Array.isArray(o.material)?o.material:[o.material];
        mats.forEach(function(m){
          m.clippingPlanes = planes;
          m.clipShadows = true;
          m.side = THREE.DoubleSide;
          m.needsUpdate = true;
        });
      });
    });
  }

  function clearCaps(){
    if(!SectionView.capGroup) return;
    while(SectionView.capGroup.children.length){
      var c = SectionView.capGroup.children.pop();
      if(c.geometry && !c.userData.sharedGeo) c.geometry.dispose();
      if(c.material) c.material.dispose && c.material.dispose();
      SectionView.capGroup.remove(c);
    }
    SectionView._capPlanes = [];
  }

  function buildStencilCaps(){
    clearCaps();
    if(typeof state==='undefined' || !state.parts) return;
    var plane = SectionView.plane;
    var SIZE = 2000;

    state.parts.forEach(function(part, pIdx){
      if(!part.mesh || part.visible===false) return;
      var col = 0xc04040;
      try{ var src=firstMat(part.mesh); if(src&&src.color) col=src.color.getHex(); }catch(_){}
      part.mesh.updateMatrixWorld(true);

      part.mesh.traverse(function(o){
        if(!(o.isMesh && o.geometry)) return;
        // back → +1
        var mb = new THREE.Mesh(o.geometry, makeMaskMat(THREE.BackSide, +1));
        copyWorld(o, mb); mb.renderOrder=1; mb.userData.sharedGeo=true;
        SectionView.capGroup.add(mb);
        // front → -1
        var mf = new THREE.Mesh(o.geometry, makeMaskMat(THREE.FrontSide, -1));
        copyWorld(o, mf); mf.renderOrder=1; mf.userData.sharedGeo=true;
        SectionView.capGroup.add(mf);
      });

      var fillMat = new THREE.MeshStandardMaterial({
        color: col, metalness:0.25, roughness:0.75, side:THREE.DoubleSide,
        stencilWrite:true, stencilRef:0,
        stencilFunc: THREE.NotEqualStencilFunc,
        stencilFail: THREE.ReplaceStencilOp,
        stencilZFail: THREE.ReplaceStencilOp,
        stencilZPass: THREE.ReplaceStencilOp,
        clippingPlanes: []
      });
      var fill = new THREE.Mesh(new THREE.PlaneGeometry(SIZE,SIZE), fillMat);
      orientFillToPlane(fill, plane);
      fill.renderOrder = 2;
      SectionView.capGroup.add(fill);
      SectionView._capPlanes.push(fill);
    });
  }

  function makeMaskMat(side, delta){
    var op = delta>0 ? THREE.IncrementWrapStencilOp : THREE.DecrementWrapStencilOp;
    return new THREE.MeshBasicMaterial({
      depthWrite:false, depthTest:true, colorWrite:false, side:side,
      clippingPlanes:[SectionView.plane],
      stencilWrite:true, stencilFunc:THREE.AlwaysStencilFunc, stencilRef:0,
      stencilZPass:op, stencilZFail:op, stencilFail:THREE.KeepStencilOp
    });
  }

  function orientFillToPlane(mesh, plane){
    var n = plane.normal.clone().normalize();
    var q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1), n.clone().multiplyScalar(-1));
    mesh.quaternion.copy(q);
    mesh.position.copy(n.clone().multiplyScalar(-plane.constant));
  }

  function firstMat(group){
    var f=null;
    group.traverse(function(o){ if(!f&&o.isMesh&&o.material){ f=Array.isArray(o.material)?o.material[0]:o.material; }});
    return f;
  }
  function copyWorld(src,dst){
    src.updateMatrixWorld(true);
    dst.matrixAutoUpdate=false; dst.matrix.copy(src.matrixWorld);
  }

  function tickReapply(){
    if(SectionView.enabled){
      applyToAllParts();
      if(SectionView.capOn) SectionView._capPlanes.forEach(function(f){ orientFillToPlane(f, SectionView.plane); });
    }
    requestAnimationFrame(tickReapply);
  }

  function buildUI(){
    if(document.getElementById('sectionViewPanel')) return;
    var box=document.createElement('div');
    box.id='sectionViewPanel';
    box.style.cssText='position:fixed;right:14px;bottom:14px;z-index:9999;'+
      'background:rgba(26,30,36,.94);border:1px solid #3a4450;border-radius:10px;'+
      'padding:12px 14px;width:210px;font-family:"Malgun Gothic",sans-serif;'+
      'color:#e8edf2;box-shadow:0 6px 20px rgba(0,0,0,.4);font-size:12px;';
    box.innerHTML=
      '<div style="font-weight:700;font-size:13px;border-left:3px solid #ff7a18;padding-left:7px;margin-bottom:10px;">✂ 단면 보기 <span style="color:#5a6675;font-size:10px;">v1.1</span></div>'+
      '<label style="display:flex;align-items:center;gap:7px;margin-bottom:9px;cursor:pointer;"><input type="checkbox" id="svEnable" style="width:15px;height:15px;accent-color:#ff7a18;cursor:pointer;"> 단면 켜기</label>'+
      '<div style="display:flex;gap:5px;margin-bottom:9px;">'+
        '<button class="sv-axis sv-on" data-ax="x" style="flex:1;">X</button>'+
        '<button class="sv-axis" data-ax="y" style="flex:1;">Y</button>'+
        '<button class="sv-axis" data-ax="z" style="flex:1;">Z(높이)</button></div>'+
      '<div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="color:#8a96a5;">위치</span><span id="svPosV" style="color:#ff7a18;">0.0</span></div>'+
      '<input type="range" id="svPos" min="-100" max="100" value="0" step="0.5" style="width:100%;accent-color:#ff7a18;cursor:pointer;margin-bottom:9px;">'+
      '<label style="display:flex;align-items:center;gap:7px;margin-bottom:6px;cursor:pointer;"><input type="checkbox" id="svFlip" style="width:14px;height:14px;accent-color:#ff7a18;cursor:pointer;"> 방향 뒤집기</label>'+
      '<label style="display:flex;align-items:center;gap:7px;cursor:pointer;"><input type="checkbox" id="svCap" checked style="width:14px;height:14px;accent-color:#ff7a18;cursor:pointer;"> 단면 막기(캡)</label>';
    document.body.appendChild(box);

    var st=document.createElement('style');
    st.textContent='#sectionViewPanel .sv-axis{background:#2a323d;color:#e8edf2;border:1px solid #3a4450;border-radius:5px;padding:6px 0;font-size:12px;cursor:pointer;font-family:inherit;}'+
      '#sectionViewPanel .sv-axis:hover{border-color:#ff7a18;}'+
      '#sectionViewPanel .sv-axis.sv-on{background:#ff7a18;color:#101418;font-weight:700;border-color:#ff7a18;}';
    document.head.appendChild(st);

    document.getElementById('svEnable').addEventListener('change',function(e){ SectionView.enabled=e.target.checked; updatePlane(); });
    document.querySelectorAll('#sectionViewPanel .sv-axis').forEach(function(b){
      b.addEventListener('click',function(){
        document.querySelectorAll('#sectionViewPanel .sv-axis').forEach(function(x){x.classList.remove('sv-on');});
        b.classList.add('sv-on'); SectionView.axis=b.dataset.ax; updatePlane();
      });
    });
    document.getElementById('svPos').addEventListener('input',function(e){
      SectionView.pos=parseFloat(e.target.value);
      document.getElementById('svPosV').textContent=SectionView.pos.toFixed(1);
      updatePlane();
    });
    document.getElementById('svFlip').addEventListener('change',function(e){ SectionView.flip=e.target.checked; updatePlane(); });
    document.getElementById('svCap').addEventListener('change',function(e){ SectionView.capOn=e.target.checked; updatePlane(); });
  }

  waitInit();
})();
