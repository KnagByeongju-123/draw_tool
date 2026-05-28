/* ============================================================
   draw_tool3 단면(Section / Clipping) 추가 모듈  v1.0
   ------------------------------------------------------------
   ■ 사용법
     1) draw_tool3.js 파일 맨 끝에 이 코드를 그대로 붙여넣기
        (또는 draw_tool3.html 에서 draw_tool3.js 다음 줄에
         <script src="draw3_section_addon.js"></script> 추가)
     2) 끝.  나머지는 자동 초기화됨.

   ■ 기능
     - 단면 보기 ON/OFF
     - 절단 축 선택 (X / Y / Z)
     - 절단 위치 슬라이더 (실시간)
     - 절단 방향 뒤집기
     - 잘린 단면 막기(캡) : 속 빈 모델도 꽉 찬 단면처럼 보이게
   ------------------------------------------------------------
   * 기존 draw3 코드(state, scene, renderer, camera)는 건드리지 않음
   * 전역 SectionView 하나만 추가
   ============================================================ */
(function(){
  'use strict';

  var SectionView = {
    enabled: false,
    axis: 'x',        // 'x' | 'y' | 'z'  (draw3 화면표기: 위=Z(내부 Y))
    pos: 0,           // 절단 위치 (mm)
    flip: false,      // 방향 뒤집기
    capOn: true,      // 단면 막기
    plane: null,      // THREE.Plane
    capGroup: null,   // 캡 메쉬 담는 그룹
    _bound: false
  };
  window.SectionView = SectionView;

  // three.js / scene 준비될 때까지 대기 후 초기화
  function waitInit(){
    if (typeof THREE === 'undefined' || typeof scene === 'undefined' ||
        typeof renderer === 'undefined' || !renderer) {
      return setTimeout(waitInit, 200);
    }
    setup();
  }

  function setup(){
    // 1) 렌더러 로컬 클리핑 활성화 (이게 없으면 단면이 안 됨)
    renderer.localClippingEnabled = true;

    // 2) 절단 평면 생성 (처음엔 멀리 둬서 안 잘리게)
    SectionView.plane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 1e6);

    // 3) 캡 그룹
    SectionView.capGroup = new THREE.Group();
    SectionView.capGroup.name = '__sectionCaps';
    scene.add(SectionView.capGroup);

    // 4) UI 패널 주입
    buildUI();

    SectionView._bound = true;
  }

  // ---- 절단 평면 갱신 ----
  function updatePlane(){
    var p = SectionView.plane;
    if (!p) return;
    if (!SectionView.enabled){ p.constant = 1e6; clearCaps(); return; }

    var n = new THREE.Vector3(0,0,0);
    // draw3 좌표: 내부 three는 Y-up. 화면 표기 X=빨강(내부X), Y=녹색(내부Z), Z=흰색높이(내부Y)
    if (SectionView.axis === 'x')      n.set(1,0,0);   // 빨강
    else if (SectionView.axis === 'y') n.set(0,0,1);   // 녹색(내부 Z)
    else                               n.set(0,1,0);   // 높이(내부 Y)

    if (SectionView.flip) n.multiplyScalar(-1);
    p.normal.copy(n).multiplyScalar(-1);   // 평면 노멀 반대쪽을 잘라냄
    p.constant = SectionView.pos * (SectionView.flip ? -1 : 1);

    applyToAllParts();
    if (SectionView.capOn) buildCaps(); else clearCaps();
  }

  // ---- 모든 부품 머티리얼에 평면 연결 ----
  function applyToAllParts(){
    if (typeof state === 'undefined' || !state.parts) return;
    var planes = SectionView.enabled ? [SectionView.plane] : [];
    state.parts.forEach(function(part){
      if (!part.mesh) return;
      part.mesh.traverse(function(o){
        if (o.isMesh && o.material){
          var mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach(function(m){
            m.clippingPlanes = planes;
            m.clipShadows = true;
            m.side = THREE.DoubleSide;   // 단면 안쪽도 보이게
            m.needsUpdate = true;
          });
        }
      });
    });
  }

  // ---- 단면 캡(잘린 면 막기) ----
  // 절단 평면에 살짝 못 미치는 위치에 평면 머티리얼을 입혀
  // 속이 빈 메쉬도 꽉 찬 단면처럼 보이게 하는 간이 방식(스텐실 없이)
  function clearCaps(){
    if (!SectionView.capGroup) return;
    while (SectionView.capGroup.children.length){
      var c = SectionView.capGroup.children.pop();
      if (c.geometry) c.geometry.dispose();
      SectionView.capGroup.remove(c);
    }
  }

  function buildCaps(){
    clearCaps();
    if (typeof state === 'undefined' || !state.parts) return;

    var planeNormal = SectionView.plane.normal.clone();
    state.parts.forEach(function(part){
      if (!part.mesh || part.visible === false) return;
      part.mesh.updateMatrixWorld(true);
      part.mesh.traverse(function(o){
        if (!(o.isMesh && o.geometry)) return;
        var capGeo = buildCapForMesh(o);
        if (!capGeo) return;
        var col = 0xc04040; // 단면 색(연한 빨강) - 보고서에서 잘린 면 강조
        try {
          var srcMat = Array.isArray(o.material)? o.material[0] : o.material;
          if (srcMat && srcMat.color) col = srcMat.color.getHex();
        } catch(_){}
        var capMat = new THREE.MeshStandardMaterial({
          color: col, metalness: 0.3, roughness: 0.7,
          side: THREE.DoubleSide
        });
        var capMesh = new THREE.Mesh(capGeo, capMat);
        SectionView.capGroup.add(capMesh);
      });
    });
  }

  // 한 메쉬를 절단 평면으로 잘랐을 때의 단면 윤곽을 삼각형으로 채움
  // (삼각형-평면 교차선을 모아 평면상에서 fan triangulation)
  function buildCapForMesh(mesh){
    var geom = mesh.geometry;
    if (!geom || !geom.attributes || !geom.attributes.position) return null;
    var pos = geom.attributes.position;
    var idx = geom.index ? geom.index.array : null;
    var mat = mesh.matrixWorld;
    var plane = SectionView.plane;

    var segs = [];  // 교차선분 [[ax,ay,az, bx,by,bz], ...]
    var vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3();

    function triCount(){ return idx ? idx.length/3 : pos.count/3; }
    function getVert(i, out){
      out.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(mat);
      return out;
    }

    var n = triCount();
    for (var t=0; t<n; t++){
      var i0,i1,i2;
      if (idx){ i0=idx[t*3]; i1=idx[t*3+1]; i2=idx[t*3+2]; }
      else    { i0=t*3; i1=t*3+1; i2=t*3+2; }
      getVert(i0,vA); getVert(i1,vB); getVert(i2,vC);
      var dA = plane.distanceToPoint(vA);
      var dB = plane.distanceToPoint(vB);
      var dC = plane.distanceToPoint(vC);
      // 평면을 가로지르는 삼각형만
      var pts = crossPoints(vA,dA, vB,dB, vC,dC);
      if (pts.length === 2){
        segs.push([pts[0].x,pts[0].y,pts[0].z, pts[1].x,pts[1].y,pts[1].z]);
      }
    }
    if (segs.length < 3) return null;

    // 교차선분들의 중점을 중심으로 fan (간이 채움 — 볼록 단면에서 깔끔)
    var cx=0,cy=0,cz=0,cnt=0;
    segs.forEach(function(s){
      cx+=s[0]+s[3]; cy+=s[1]+s[4]; cz+=s[2]+s[5]; cnt+=2;
    });
    cx/=cnt; cy/=cnt; cz/=cnt;

    var verts = [];
    segs.forEach(function(s){
      verts.push(cx,cy,cz,  s[0],s[1],s[2],  s[3],s[4],s[5]);
    });
    var cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(verts,3));
    cg.computeVertexNormals();
    return cg;
  }

  // 삼각형 한 변이 평면을 지나면 교차점 반환 (선형보간)
  function crossPoints(A,dA, B,dB, C,dC){
    var out = [];
    function edge(P,dP, Q,dQ){
      if ((dP>0 && dQ<=0) || (dP<=0 && dQ>0)){
        var tt = dP/(dP-dQ);
        out.push(new THREE.Vector3(
          P.x+(Q.x-P.x)*tt,
          P.y+(Q.y-P.y)*tt,
          P.z+(Q.z-P.z)*tt));
      }
    }
    edge(A,dA,B,dB); edge(B,dB,C,dC); edge(C,dC,A,dA);
    return out;
  }

  // 부품이 추가/변경될 때 단면 자동 재적용 (간단히 주기적 갱신)
  function tickReapply(){
    if (SectionView.enabled){
      applyToAllParts();
    }
    requestAnimationFrame(tickReapply);
  }

  // ---- UI ----
  function buildUI(){
    if (document.getElementById('sectionViewPanel')) return;

    var box = document.createElement('div');
    box.id = 'sectionViewPanel';
    box.style.cssText =
      'position:fixed;right:14px;bottom:14px;z-index:9999;'+
      'background:rgba(26,30,36,.94);border:1px solid #3a4450;border-radius:10px;'+
      'padding:12px 14px;width:210px;font-family:"Malgun Gothic",sans-serif;'+
      'color:#e8edf2;box-shadow:0 6px 20px rgba(0,0,0,.4);font-size:12px;';

    box.innerHTML =
      '<div style="font-weight:700;font-size:13px;border-left:3px solid #ff7a18;'+
        'padding-left:7px;margin-bottom:10px;">✂ 단면 보기</div>'+
      '<label style="display:flex;align-items:center;gap:7px;margin-bottom:9px;cursor:pointer;">'+
        '<input type="checkbox" id="svEnable" style="width:15px;height:15px;accent-color:#ff7a18;cursor:pointer;"> 단면 켜기</label>'+
      '<div style="display:flex;gap:5px;margin-bottom:9px;">'+
        '<button class="sv-axis sv-on" data-ax="x" style="flex:1;">X</button>'+
        '<button class="sv-axis" data-ax="y" style="flex:1;">Y</button>'+
        '<button class="sv-axis" data-ax="z" style="flex:1;">Z(높이)</button>'+
      '</div>'+
      '<div style="display:flex;justify-content:space-between;margin-bottom:3px;">'+
        '<span style="color:#8a96a5;">위치</span>'+
        '<span id="svPosV" style="color:#ff7a18;">0.0</span></div>'+
      '<input type="range" id="svPos" min="-100" max="100" value="0" step="0.5" '+
        'style="width:100%;accent-color:#ff7a18;cursor:pointer;margin-bottom:9px;">'+
      '<label style="display:flex;align-items:center;gap:7px;margin-bottom:6px;cursor:pointer;">'+
        '<input type="checkbox" id="svFlip" style="width:14px;height:14px;accent-color:#ff7a18;cursor:pointer;"> 방향 뒤집기</label>'+
      '<label style="display:flex;align-items:center;gap:7px;cursor:pointer;">'+
        '<input type="checkbox" id="svCap" checked style="width:14px;height:14px;accent-color:#ff7a18;cursor:pointer;"> 단면 막기(캡)</label>';

    document.body.appendChild(box);

    // 버튼 스타일
    var st = document.createElement('style');
    st.textContent =
      '#sectionViewPanel .sv-axis{background:#2a323d;color:#e8edf2;border:1px solid #3a4450;'+
        'border-radius:5px;padding:6px 0;font-size:12px;cursor:pointer;font-family:inherit;}'+
      '#sectionViewPanel .sv-axis:hover{border-color:#ff7a18;}'+
      '#sectionViewPanel .sv-axis.sv-on{background:#ff7a18;color:#101418;font-weight:700;border-color:#ff7a18;}';
    document.head.appendChild(st);

    // 이벤트
    document.getElementById('svEnable').addEventListener('change', function(e){
      SectionView.enabled = e.target.checked; updatePlane();
    });
    document.querySelectorAll('#sectionViewPanel .sv-axis').forEach(function(b){
      b.addEventListener('click', function(){
        document.querySelectorAll('#sectionViewPanel .sv-axis').forEach(function(x){x.classList.remove('sv-on');});
        b.classList.add('sv-on');
        SectionView.axis = b.dataset.ax; updatePlane();
      });
    });
    document.getElementById('svPos').addEventListener('input', function(e){
      SectionView.pos = parseFloat(e.target.value);
      document.getElementById('svPosV').textContent = SectionView.pos.toFixed(1);
      updatePlane();
    });
    document.getElementById('svFlip').addEventListener('change', function(e){
      SectionView.flip = e.target.checked; updatePlane();
    });
    document.getElementById('svCap').addEventListener('change', function(e){
      SectionView.capOn = e.target.checked;
      if (SectionView.enabled){ if(SectionView.capOn) buildCaps(); else clearCaps(); }
    });

    // 캡 주기 갱신 시작 (부품 이동 시 단면 따라가도록)
    tickReapply();
  }

  // 시작
  waitInit();
})();
