// ##### draw_tool_core.js  Rev.16.51  최신본 (한글·거리두기좌우·씰제거·우하단원점·=수식·점마우스선택·점N·점방향거리·배경화면맞춤·지름선긋기[좌 지 D1 D2]) #####
// ===========================================================
//  draw_tool_core.js  —  [1/2]
//  전역상태 · 캔버스/렌더링 · 마우스/키보드 이벤트 · 기본 도구
//  (draw_tool.html 에서 분리. tools 보다 먼저 로드)
//  ※ initPanZoom()/updateLayerStatus() 호출은 tools 정의 이후 실행되도록
//     draw_tool_tools.js 끝으로 이동했습니다.
// ===========================================================
'use strict';

// ===== Rev.10.12: 글로벌 에러 진단 =====
// addEventListener of null 같은 에러가 정확히 어디서 발생하는지 콘솔에 명확히 표시
window.addEventListener('error', function(e) {
  if (e && e.error && e.message && e.message.indexOf('addEventListener') >= 0) {
    console.error('🔍 [draw_tool 진단] addEventListener null 에러 발생');
    console.error('  파일:', e.filename);
    console.error('  라인:', e.lineno, '컬럼:', e.colno);
    console.error('  메시지:', e.message);
    console.error('  스택:\n' + (e.error.stack || '(없음)'));
  }
});

const bgCanvas = document.getElementById('bgCanvas');
const fillCanvas = document.getElementById('fillCanvas');
const drawCanvas = document.getElementById('drawCanvas');
const previewCanvas = document.getElementById('previewCanvas');
const bgCtx = bgCanvas.getContext('2d');
const fillCtx = fillCanvas.getContext('2d');
const drawCtx = drawCanvas.getContext('2d');
const preCtx = previewCanvas.getContext('2d');

let baseW = 16000, baseH = 9000;  // Rev.16.22: 16:9, 1mm=300px 기준 약 53mm×30mm (5cm 미만 제품, 줌 100%까지 선명)
let zoom = 0.06;
// Rev.11.24: 눈금자(그리드) 표시
let gridOn = false;
let gridSpacingMm = 10;   // 격자 간격 (mm)
let bgImage = null;
let bgImageOpacity = 1.0; // 배경 이미지 불투명도 (0~1)
let bgImageScale = 1.0;   // Rev.11.10: 배경 이미지 자체 확대/축소 (도면 맞춤용)
let bgImageOffsetX = 0;   // Rev.11.10: 배경 이미지 X 오프셋 (px)
let bgImageOffsetY = 0;   // Rev.11.10: 배경 이미지 Y 오프셋 (px)
let bgZoom = 1.0;         // Rev.13.2: 배경 독립 확대/축소 (작업영역과 별개, CSS transform)
let bgZoomOriginX = 50;   // transform-origin X (%)
let bgZoomOriginY = 50;   // transform-origin Y (%)
let tool = 'select';
let shapes = [];
let fills = [];        // 영역 채움 목록 [{type:'fill', points:[{x,y}...], color, alpha}]
let fillAsOutline = false;  // Rev.15.5: 채움 도구가 외곽선(폴리라인) 생성 모드인지
let redoStack = [];
// Rev.11.41: 스냅샷 기반 Undo/Redo (전체 상태 저장 → 정렬·이동·분할 등 모든 작업 복원)
let history = [];      // 상태 스냅샷 배열
let histIdx = -1;      // 현재 위치
let histLock = false;  // 복원 중 재기록 방지
const HIST_MAX = 100;  // 최대 보관 단계
let firstClick = null;

let continuousMode = false;
let snapMode = false;
let snapPoints = [];
let snapShown = null;
let selectedIds = new Set();
let dragState = null;
// Rev.11.9: 이동 거리 패널 상태
//   moveDeltaBase: 이동 기준 시점의 선택 도형 좌표 스냅샷 {id: shapeJSON}
//   현재 ΔX/ΔY는 이 기준에서의 누적 이동량 (mm)
let moveDeltaBase = null;
// Rev.11.14: 클립보드 (Ctrl+C / Ctrl+V) - 복사된 도형 스냅샷 배열
let clipboardShapes = [];
let pasteCount = 0; // 연속 붙여넣기 시 오프셋 누적
// Rev.11.18: 버텍스 점 찍기 / 연결 모드
let pointMode = false;        // 점 찍기 모드
let connectMode = false;      // 연결 모드
let connectPoints = [];       // 연결 모드에서 클릭한 좌표 누적 [{x,y}]
// Rev.11.20: 연장(Extrude) 모드 - 선을 끌어 면 만들기
let extrudeMode = false;
let extrudeState = null;      // {lineId, p1, p2}  돌출 대상 선 정보
let extrudeAxis = null;       // Rev.11.39: 연장 축 제한 null/'x'/'y'
let extrudeDragging = false;  // Rev.11.43: 연장 드래그 진행 중
// Rev.11.37: 블렌더식 분할(Subdivide) 모드 - 선 클릭 → 휠로 분할 수 → 좌클릭 적용
let subdivideMode = false;        // 분할 모드 ON/OFF
let subdivideTarget = null;       // 선택된 선 도형
let subdivideCount = 1;           // 분할 수 (N개 점 추가 → N+1 세그먼트)
// Rev.16.14: 쓸어 지우기(Swipe Erase) - 드래그 경로가 가로지른 선 중 방향 각도차≥임계값인 선 삭제
let swipeEraseMode = false;       // 쓸어 지우기 모드 ON/OFF
let swipeErasing = false;         // 드래그 중 여부
let swipePath = [];               // 드래그 경로 점들 [{x,y}]
let swipeAngleThresh = 30;        // 삭제 각도 임계값(도)
// Rev.16.29: 한붓그리기 점번호 시스템 (좌/우/상/하/도 명령으로 이어그리기)
let penPoints = [];               // [{x,y}] P0,P1,P2... 픽셀 좌표
let penLabelIds = [];             // 각 점 라벨(text 도형) id (지우기용)
let penCur = -1;                  // 현재 점 인덱스 (이 점에서 다음 선 시작)
let penPickMode = false;          // Rev.16.46: 점 마우스 선택 모드
let penPickFirst = -1;            // Rev.16.46: 자동 연결용 첫 클릭 점
let penSealMode = false;          // Rev.16.30: 씰 모드(좌/우 숫자=목표 지름, 이동=|목표-현재|/2)
// Rev.16.9~16.10: 대각선(교점) 모드 - 범위 안 교점을 드래그로 선택(최대2), 2쌍 동시 대각 연결
let diagXMode = false;            // 대각선-교점 모드 ON/OFF
let diagXRadius = 40;             // 짧은 클릭 시 교점 탐지 반경 (px, 고정)
let diagXPhase = 0;              // 0=시작영역 선택, 1=끝영역 선택
let diagXStartPts = [];          // 시작 교점들 (최대 2) [{x,y}]
let diagXEndPts = [];            // 끝 교점들 (최대 2) [{x,y}]
let diagXDragging = false;       // 드래그 중 여부
let diagXDragOrigin = null;      // 드래그 시작 화면점(도면좌표)
let diagXHoverPt = null;         // 현재 마우스 도면좌표 (반경 미리보기용)
// Rev.11.39: 블렌더식 이동(Grab) 모드 - G → 마우스 따라 이동, X/Y로 축 제한
let grabMode = false;             // 이동 모드 ON/OFF
let grabAxis = null;              // null=자유, 'x'=X축만, 'y'=Y축만
let grabStart = null;             // 시작 마우스 좌표 (도면)
let grabBase = {};                // {id: 원본도형 복사본}
// Rev.11.23: 거리두기(Offset Twin) - 선 생성/선택 시 좌우 평행선 후보 생성
let offsetTwinMode = false;        // 거리두기 ON/OFF
let offsetTwinDist = 0.6;          // mm 단위 거리
let offsetTwinCandidates = [];     // (미사용: Rev.11.27부터 3개 모두 즉시 확정)
// Rev.12.6: 거리두기 좌/우 선택 방식
//   offsetTwinPickMode: 버튼 클릭 후 "선 클릭 → 좌/우 방향 클릭"으로 한쪽만 생성
//   offsetTwinTarget : 거리두기 대상으로 클릭한 선 도형
let offsetTwinPickMode = false;    // 좌/우 선택 진행 모드
let offsetTwinTarget = null;       // 선택된 대상 선 도형
// Rev.13.3: 베이스선 복제 모드 - 선 클릭 후 방향별 치수 입력으로 평행선 생성
let baseLineMode = false;          // 베이스선 복제 ON/OFF
let baseLineTarget = null;         // 클릭된 기준 선 도형
let baseLineOrient = null;         // 'h'(가로) | 'v'(세로) | 'o'(기타)
let baseLineDir = null;            // 선택된 방향 'up'|'down'|'left'|'right'
let baseOffDir = null;             // Rev.14.9: 거리두기 독립 방향 (베이스선과 별개)
// Rev.13.2: 기준선(중심선) 자동생성
let centerlineMode = false;
let centerlineOverhang = 5;   // 원 바깥으로 튀어나오는 길이(mm)
// Rev.13.2: 챔퍼(C면취)
let chamferState = null;           // null | {firstLine, firstClickPt}
let chamferC = 5;                  // 챔퍼 거리(mm)
// Rev.13.2: 호-직선 접선 연결
let tangentState = null;           // null | {line, endKey}
let shapeIdSeq = 0;

// 라운드(호) 그리기용 마우스 경로 추적
let arcPath = [];           // 1차 클릭 후 마우스 이동 경로
let detectedArcs = [];      // 배경에서 검출된 호/원 후보

// 캘리브레이션 상태 (v5.0)
// Rev.12.4: 기본 단위계 1mm = 75px (mmPerPixel=1/75).
let mmPerPixel = 1/300;
let calibSet = true;
let calibFirstPoint = null;

// 회전축 (v6.0)
let rotAxis = null;
let axisFirstPoint = null;
let lastGeneratedMesh = null;
let lastMousePoint = null; // Rev.10.5 - 회전축 거리입력 Enter 처리용

// 끝점 픽킹 모드 (v7.2)
let endpointPickState = null;

// 호 각도 편집 (v7.3)
let editingArcId = null;          // 편집 중인 호의 id
let arcHandleDrag = null;         // {type:'start'|'end'|'middle', startMouseAngle, originalStart, originalEnd}

// 라이브 스냅 (Rev.7.8): 마우스가 도형 근처에 갈 때 점/선/면으로 자동 흡착
let liveSnapMode = false;

// B/D안 도구 상태 (Rev.9.0)
let filletState = null;
// Rev.16.24: 필렛 방향 인터랙티브 선택 - 두 선 선택+지름 입력 후, 마우스로 코너 방향 결정→좌클릭 확정
let filletPreview = null;  // {L1, L2, ix, rPx, rMm} 방향 미리보기 진행 중
let offsetState = null;
let dimState = null;

// A안 정밀 스냅 (Rev.7.9): 접점/수선/평행/연장선
let snapTangent = true;
let snapPerpendicular = true;
let snapParallel = true;
let snapExtension = true;
const PARALLEL_ANGLE_TOL_DEG = 1.5;  // 평행 판정 허용 오차 (도)

// ===== OSNAP 점-종류별 토글 (Rev.10.8) =====
// 일반 스냅(snapMode)이 ON일 때, 어떤 종류의 점을 스냅할지 세부 제어
let osnapEnabled = {
  endpoint: true,     // 선/원의 끝점, 호의 끝점
  midpoint: true,     // 선/사각형 변의 중점
  center: true,       // 원·호·사각형의 중심
  quadrant: true,     // 원의 4분점 (0°/90°/180°/270°)
  corner: true,       // 사각형 코너, 배경 코너
  intersection: true, // 도형 간 교차점
  onshape: true       // 선/원 위 임의점 (라이브스냅)
};

setCanvasSize(baseW, baseH);

function setCanvasSize(w, h) {
  baseW = w; baseH = h;
  let dw = w * zoom, dh = h * zoom;
  // Rev.12.0: 캔버스 내부 해상도 안전 상한 — 초과 시 하얀 화면(렌더 실패) 방지.
  //   브라우저 캔버스 한계(변 길이/총 면적)를 넘지 않도록 내부 해상도 배율을 낮춤.
  //   CSS 표시 크기(style)는 그대로 두고 backing store만 줄여 디테일만 약간 감소.
  const MAX_SIDE = 16384;         // Rev.16.18: 한 변 최대 px (최신 브라우저 한계 현실화)
  const MAX_AREA = 160000000;     // 총 면적 최대 (약 1.6억 px) - 확대 시 흐트러짐 방지
  let res = 1;                    // backing store 해상도 배율
  if (dw > MAX_SIDE) res = Math.min(res, MAX_SIDE / dw);
  if (dh > MAX_SIDE) res = Math.min(res, MAX_SIDE / dh);
  if (dw * dh > MAX_AREA) res = Math.min(res, Math.sqrt(MAX_AREA / (dw * dh)));
  const bw = Math.max(1, Math.floor(dw * res));
  const bh = Math.max(1, Math.floor(dh * res));
  [bgCanvas, fillCanvas, drawCanvas, previewCanvas].forEach(c => {
    c.width = bw;
    c.height = bh;
    c.style.width = dw + 'px';   // 표시 크기는 줌 그대로
    c.style.height = dh + 'px';
  });
  // 컨텍스트 스케일: 내부 해상도 = zoom * res → 그리기는 도면좌표(baseW 기준) 그대로
  const eff = zoom * res;
  [bgCtx, fillCtx, drawCtx, preCtx].forEach(ctx => {
    ctx.setTransform(eff, 0, 0, eff, 0, 0);
  });
  document.getElementById('canvasStack').style.width = dw + 'px';
  document.getElementById('canvasStack').style.height = dh + 'px';
  redrawAll();
}

// Rev.16.50: 배경/도면을 화면(canvasWrap)에 꽉 차게 zoom 자동 계산
function fitZoomToViewport(){
  const wrap = document.getElementById('canvasWrap');
  if (!wrap || !baseW || !baseH) return;
  const vw = wrap.clientWidth || wrap.offsetWidth || 800;
  const vh = wrap.clientHeight || wrap.offsetHeight || 600;
  let z = Math.min((vw*0.95)/baseW, (vh*0.95)/baseH);
  if (!isFinite(z) || z<=0) z = 1;
  zoom = z;
  setCanvasSize(baseW, baseH);
  const zi = document.getElementById('zoom');
  if (zi){ const zp=Math.round(zoom*100); zi.value=zp; const zv=document.getElementById('zoomVal'); if(zv)zv.textContent=zp+'%'; }
}

// ====== 배경 ======
document.getElementById('imgFile').addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      bgImage = img;
      // Rev.11.10: 새 이미지 로드 시 배경 맞춤 슬라이더 초기화
      bgImageScale = 1.0; bgImageOffsetX = 0; bgImageOffsetY = 0;
      bgZoom = 1.0; bgZoomOriginX = 50; bgZoomOriginY = 50; applyBgZoom();
      const bs = document.getElementById('bgScale');
      const bx = document.getElementById('bgOffsetX');
      const by = document.getElementById('bgOffsetY');
      if (bs){ bs.value = 100; document.getElementById('bgScaleVal').textContent = '100%'; }
      if (bx){ bx.value = 0; document.getElementById('bgOffsetXVal').textContent = '0'; }
      if (by){ by.value = 0; document.getElementById('bgOffsetYVal').textContent = '0'; }
      setCanvasSize(img.naturalWidth, img.naturalHeight);
      fitZoomToViewport();   // Rev.16.50: 불러온 이미지 화면 꽉 차게 자동 맞춤
      resetCalibration();
      if (typeof cv !== 'undefined' && cv.Mat) {
        detectSnapPoints();
        detectBackgroundArcs();
      }
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(f);
});

document.getElementById('btnClearBg').addEventListener('click', () => {
  bgImage = null;
  snapPoints = []; detectedArcs = [];
  updateSnapStat();
  redrawBg();
});

document.getElementById('zoom').addEventListener('input', e => {
  zoom = parseInt(e.target.value) / 100;
  document.getElementById('zoomVal').textContent = e.target.value + '%';
  setCanvasSize(baseW, baseH);
  if (typeof updateSelActionBar === 'function') updateSelActionBar(); // Rev.10.11
});

// 배경 이미지 불투명도
document.getElementById('bgOpacity').addEventListener('input', e => {
  bgImageOpacity = parseInt(e.target.value) / 100;
  document.getElementById('bgOpacityVal').textContent = e.target.value + '%';
  redrawBg();
});

// Rev.11.10: 배경 이미지 크기 (도면 맞춤용)
document.getElementById('bgScale').addEventListener('input', e => {
  bgImageScale = parseInt(e.target.value) / 100;
  document.getElementById('bgScaleVal').textContent = e.target.value + '%';
  redrawBg();
});

// Rev.11.10: 배경 이미지 X 오프셋
document.getElementById('bgOffsetX').addEventListener('input', e => {
  bgImageOffsetX = parseInt(e.target.value);
  document.getElementById('bgOffsetXVal').textContent = e.target.value;
  redrawBg();
});

// Rev.11.10: 배경 이미지 Y 오프셋
document.getElementById('bgOffsetY').addEventListener('input', e => {
  bgImageOffsetY = parseInt(e.target.value);
  document.getElementById('bgOffsetYVal').textContent = e.target.value;
  redrawBg();
});

// Rev.11.10: 배경 위치/크기 초기화
document.getElementById('menuBgReset').addEventListener('click', () => {
  bgImageScale = 1.0; bgImageOffsetX = 0; bgImageOffsetY = 0;
  bgZoom = 1.0; bgZoomOriginX = 50; bgZoomOriginY = 50; applyBgZoom();
  document.getElementById('bgScale').value = 100;
  document.getElementById('bgScaleVal').textContent = '100%';
  document.getElementById('bgOffsetX').value = 0;
  document.getElementById('bgOffsetXVal').textContent = '0';
  document.getElementById('bgOffsetY').value = 0;
  document.getElementById('bgOffsetYVal').textContent = '0';
  redrawBg();
});

// Rev.11.10: 빠른 배율 프리셋 버튼
document.querySelectorAll('.zoom-preset').forEach(el => {
  el.addEventListener('click', () => {
    const z = el.getAttribute('data-zoom');
    const zoomInput = document.getElementById('zoom');
    zoomInput.value = z;
    zoomInput.dispatchEvent(new Event('input'));
  });
});

// 채움 투명도 표시
document.getElementById('fillAlpha').addEventListener('input', e => {
  document.getElementById('fillAlphaVal').textContent = e.target.value + '%';
});

// Rev.10.1: 해치 패턴
let currentHatchPattern = 'solid';
let selectedFillIds = new Set();  // 선택된 채움 (편집용)

document.getElementById('hatchPattern').addEventListener('change', e => {
  currentHatchPattern = e.target.value;
  cmdLog(`  HATCH 패턴 = ${e.target.options[e.target.selectedIndex].text}`, 'system');
});

// Rev.11.22: 채움(면)의 테두리 선 id 목록 찾기
// Rev.11.30: 더 견고하게 - 선의 양 끝점이 면의 어느 한 변(선분) 위에 놓이면 테두리로 간주
function findFillEdgeLines(f){
  if (!f || !f.points || f.points.length < 2) return [];
  const tol = 4; // px 허용 오차 (변에서 이 거리 이내면 변 위로 간주)
  const pts = f.points;
  const ids = [];

  // 점이 선분(a-b) 위(투영 0~1 범위 내)이고 수직거리 tol 이내인지
  const onSegment = (pt, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx*dx + dy*dy;
    if (len2 < 1e-6) return Math.hypot(pt.x-a.x, pt.y-a.y) <= tol;
    let t = ((pt.x-a.x)*dx + (pt.y-a.y)*dy) / len2;
    if (t < -0.02 || t > 1.02) return false;
    const px = a.x + t*dx, py = a.y + t*dy;
    return Math.hypot(pt.x-px, pt.y-py) <= tol;
  };

  shapes.forEach(s => {
    if (s.type !== 'line' || !s.p1 || !s.p2) return;
    if (ids.includes(s.id)) return;
    // 면의 각 변에 대해, 선의 양 끝점이 모두 그 변 위에 있으면 테두리
    for (let i = 0; i < pts.length; i++){
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if (onSegment(s.p1, a, b) && onSegment(s.p2, a, b)){
        ids.push(s.id);
        break;
      }
    }
  });
  return ids;
}

// 채움 편집 모달 생성 (런타임)
function openFillEditor(fill) {
  // 동적 모달
  let modal = document.getElementById('fillEditModal');
  if (!modal) {
    const html = `
      <div class="modal-overlay" id="fillEditModal">
        <div class="modal" style="max-width:400px;">
          <h3>🎨 채움 편집</h3>
          <div class="row"><label>색상:</label><input type="color" id="feColor" style="flex:1;"></div>
          <div class="row"><label>투명도:</label>
            <input type="range" id="feAlpha" min="0" max="100" style="flex:1;">
            <span id="feAlphaVal" style="min-width:36px;">50%</span>
          </div>
          <div class="row"><label>패턴:</label>
            <select id="fePattern" style="flex:1;">
              <option value="solid">■ 단색</option>
              <option value="lines45">／ 빗금45°</option>
              <option value="lines135">＼ 빗금135°</option>
              <option value="cross">＃ 격자</option>
              <option value="dots">⋮⋮ 도트</option>
              <option value="ansi31">≡ ANSI31</option>
            </select>
          </div>
          <div class="actions">
            <button id="feDelete" style="background:#c9302c;">🗑 삭제</button>
            <button id="feCancel">취소</button>
            <button class="success" id="feApply">적용</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    
    // 핸들러 (한 번만)
    document.getElementById('feAlpha').addEventListener('input', e => {
      document.getElementById('feAlphaVal').textContent = e.target.value + '%';
    });
    document.getElementById('feCancel').addEventListener('click', () => {
      document.getElementById('fillEditModal').classList.remove('show');
    });
    document.getElementById('feApply').addEventListener('click', () => {
      const f = window._editingFill;
      if (f) {
        f.color = document.getElementById('feColor').value;
        f.alpha = parseInt(document.getElementById('feAlpha').value) / 100;
        f.pattern = document.getElementById('fePattern').value;
        redrawFills();
        redrawDraw();
        cmdLog(`  채움 #${f.id} 편집 완료.`, 'system');
      }
      document.getElementById('fillEditModal').classList.remove('show');
    });
    document.getElementById('feDelete').addEventListener('click', () => {
      const f = window._editingFill;
      if (f) {
        // 면의 테두리(꼭지점을 잇는 선)가 있으면 함께 삭제할지 확인
        const edgeIds = findFillEdgeLines(f);
        let alsoEdges = false;
        if (edgeIds.length > 0) {
          alsoEdges = confirm(
            `이 채움을 삭제합니다.\n\n테두리 선 ${edgeIds.length}개도 함께 삭제할까요?\n[확인] 면+테두리 모두 삭제\n[취소] 면만 삭제`
          );
        }
        fills = fills.filter(x => x.id !== f.id);
        if (alsoEdges) {
          shapes = shapes.filter(s => !edgeIds.includes(s.id));
        }
        if (typeof redrawAll === 'function') redrawAll();
        else { redrawFills(); redrawDraw(); }
        updateCount();
        cmdLog(`  채움 #${f.id} 삭제됨${alsoEdges ? ' (테두리 '+edgeIds.length+'개 포함)' : ''}.`, 'system');
      }
      document.getElementById('fillEditModal').classList.remove('show');
    });
  }
  
  // 값 채우기
  window._editingFill = fill;
  document.getElementById('feColor').value = fill.color || '#ffaa00';
  document.getElementById('feAlpha').value = Math.round((fill.alpha || 0.5) * 100);
  document.getElementById('feAlphaVal').textContent = Math.round((fill.alpha || 0.5) * 100) + '%';
  document.getElementById('fePattern').value = fill.pattern || 'solid';
  document.getElementById('fillEditModal').classList.add('show');
}

// ====== 도구 선택 ======
// Rev.11.51: 도구 선택 공통 함수 (메뉴/상단버튼 공용, active 동기화)
function selectTool(toolName){
  document.querySelectorAll('.tool-menu-item').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tool-strip-btn').forEach(b => b.classList.remove('active'));
  // 같은 data-tool 가진 메뉴/버튼 모두 active
  document.querySelectorAll('.tool-menu-item[data-tool="'+toolName+'"], .tool-strip-btn[data-tool="'+toolName+'"]').forEach(b => b.classList.add('active'));
  tool = toolName;
  firstClick = null;
  arcPath = [];
  // Rev.15.5: 도구 전환 시 외곽선 모드 해제 (외곽선 버튼이 직접 다시 켬)
  fillAsOutline = false;
  const obtn = document.getElementById('headerBtnOutline');
  if (obtn) obtn.classList.remove('active');
  filletState = null; offsetState = null; dimState = null; breakState = null;
  filletPreview = null;  // Rev.16.27: 도구 전환 시 필렛 미리보기 확실히 종료
  preCtx.clearRect(0,0,baseW,baseH);
  redrawDraw();
  updateToolStatus();
  if (typeof updateVertexButtons === 'function') updateVertexButtons();
  if (tool === 'select') drawCanvas.style.cursor = 'default';
  else if (tool === 'fill') drawCanvas.style.cursor = 'cell';
  else if (tool === 'calib') drawCanvas.style.cursor = 'crosshair';
  else drawCanvas.style.cursor = 'crosshair';
  if (tool === 'calib') calibFirstPoint = null;
  if (tool === 'axis') axisFirstPoint = null;
  if (tool !== 'select') { selectedIds.clear(); updateSelStat(); redrawDraw(); }
}

// Rev.11.64: 작성 도구 1회 실행 후 선택 도구로 복귀하는 공통 헬퍼 (블렌더식)
function backToSelectTool(){
  firstClick = null; arcPath = [];
  preCtx.clearRect(0,0,baseW,baseH);
  selectTool('select');
}

document.querySelectorAll('.tool-menu-item').forEach(btn => {
  btn.addEventListener('click', () => {
    selectTool(btn.dataset.tool);
  });
});

// Rev.11.51: 상단 그리기 버튼 → 도구 선택
document.querySelectorAll('.tool-strip-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    selectTool(btn.dataset.tool);
  });
});

// Rev.11.51: 상단 편집 액션 버튼 → 대상 선택 후 실행
document.querySelectorAll('.edit-act-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    runEditAction(btn.dataset.edit);
  });
});

// Rev.11.58: 거리복사 모달 방향 버튼
document.querySelectorAll('.dc-dir').forEach(b => {
  b.addEventListener('click', () => {
    _dcDir = b.dataset.dir;
    if (typeof updateDcDirButtons === 'function') updateDcDirButtons();
  });
});
// 거리복사 모달에서 Enter=실행
document.getElementById('dcGaps')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); runDistCopy(); }
});

// Rev.11.53: 상단 파일/스냅 액션 버튼 → 기존 메뉴 핸들러 트리거
document.querySelectorAll('.ts-act').forEach(btn => {
  btn.addEventListener('click', () => {
    const a = btn.dataset.act;
    const trigger = id => { const el = document.getElementById(id); if (el) el.click(); };
    switch(a){
      case 'open':     trigger('imgFile'); break;
      case 'save':     trigger('btnSaveProject'); break;
      case 'undo':     trigger('btnUndo'); break;
      case 'redo':     trigger('btnRedo'); break;
      case 'clearall': trigger('btnClearAll'); break;
      case 'snap':     trigger('menuSnap'); break;
      case 'cont':     trigger('menuContinuous'); break;
      case 'osnap':    trigger('menuOsnapDlg'); break;
    }
    // Rev.12.0: 토글형 버튼은 클릭 후 ON/OFF 색상 동기화
    if (typeof syncToolStripToggles === 'function') syncToolStripToggles();
  });
});

// Rev.12.0: 보라색 스냅/연속선 버튼의 ON/OFF 색상 동기화
function syncToolStripToggles(){
  const snapBtn = document.querySelector('.ts-act[data-act="snap"]');
  const contBtn = document.querySelector('.ts-act[data-act="cont"]');
  if (snapBtn) snapBtn.classList.toggle('active', !!snapMode);
  if (contBtn) contBtn.classList.toggle('active', !!continuousMode);
}

// Rev.11.51: 편집 액션 실행 (대상 선택 필요)
function runEditAction(act){
  // 선택 도형이 없으면 안내 (삭제/배열/거리복사 등 모두 선택 필요)
  if (selectedIds.size === 0){
    cmdLog('  먼저 선택(S) 도구로 대상을 클릭해 선택한 뒤 편집 버튼을 누르세요.', 'error');
    if (typeof updateToolStatus === 'function') updateToolStatus();
    return;
  }
  try {
    switch(act){
      case 'delete':
        if (typeof deleteSelected === 'function') deleteSelected();
        else { document.getElementById('btnDelSel') && document.getElementById('btnDelSel').click(); }
        break;
      case 'distcopy': handleDistanceCopyCommand(); break;
      case 'array':    handleArrayCommand(); break;
      case 'copy':     selectTool('copy'); break;
      case 'move':     selectTool('movetool'); break;
      case 'rotate':   selectTool('rotate'); break;
      case 'mirror':   selectTool('mirror'); break;
    }
  } catch(err){
    cmdLog('  편집 실행 오류: ' + err.message, 'error');
    console.error('편집 액션 오류:', err);
  }
}

function updateToolStatus() {
  const names = {select:'선택', line:'선', rect:'사각형', circle:'원', arc:'라운드', fill:'영역채움', calib:'캘리브', axis:'회전축',
    trim:'트리밍', extend:'연장', fillet:'모서리R', offset:'오프셋', break:'분할', breakAtPoint:'점분할',
    dimLinear:'선형치수', dimAligned:'평행치수', dimRadius:'반지름치수', dimDiameter:'직경치수', dimAngle:'각도치수',
    copy:'복사', movetool:'이동', rotate:'회전', mirror:'대칭', scale:'스케일',
    polyline:'폴리라인', ellipse:'타원', text:'텍스트'};
  const el = document.getElementById('statusTool');
  el.textContent = names[tool];
  el.className = 'badge tool-' + tool;
  const hints = {
    select: '클릭=선택 / Shift+클릭=추가 / 빈곳드래그=박스(영역에 걸치면 선택) / 드래그=이동 (끝점/도형 자동 스냅) / Shift+드래그=수평수직만 / Del=삭제',
    line: continuousMode ? '⛓ 연속선: 매 클릭마다 선 추가 / 더블클릭/ESC=종료' : '첫 클릭→두 번째 클릭 / Shift=직각',
    rect: '첫 클릭→두 번째 클릭으로 사각형',
    circle: '첫 클릭(중심)→두 번째 클릭으로 반지름',
    arc: '⌒ 1차 클릭 → 라운드를 따라 마우스 이동 → 2차 클릭 시 가장 가까운 배경 라운드 자동 피팅!',
    fill: '🎨 닫힌 영역 안 클릭 → 채움 (연속 클릭 가능) / 더블클릭=편집 / 패턴 셀렉트로 빗금/격자 선택 / BPOLY=모두 자동',
    calib: '📏 알고 있는 치수의 양 끝점 2개를 클릭 (스냅 권장) → 실제 mm 입력 → 이미지 자동 스케일',
    axis: '🔄 회전축의 양 끝 2개 클릭 → 보라색 점선 표시됨. 이 축 기준으로 윤곽선이 회전체가 됨',
    trim: '✂ 트리밍: 자르고 싶은 선의 자를 부분을 클릭 (다른 선/도형과 교차하는 부분 기준으로 자름)',
    extend: '↔ 연장: 연장할 선의 늘릴 쪽 끝점 가까이 클릭 → 가장 가까운 다른 선까지 자동 연장',
    fillet: '◜ 모서리 R: ① 사각형/두 선의 꼭지점 클릭→자동 라운드 ② 또는 두 직선 차례 클릭',
    chamfer: '⌐ 챔퍼(C면취): ① 사각형/꼭지점 클릭→즉시 면취 ② 또는 두 직선 차례 클릭 (C값 입력 필드 참조)',
    centerline: '✛ 기준선: 원/호 클릭→수평+수직 일점쇄선 자동생성 / 선 클릭→그 선의 평행 중심선 / Esc=종료',
    tangent: '⌒ 접선연결: 직선 클릭(끝점 가까운 쪽)→ 호/원 클릭→ 자동 접선 연결',
    offset: '∥ 오프셋: 원본 선/도형 클릭 → 오프셋할 방향 클릭 → 거리 입력으로 평행 복사',
    break: '✄ 분할: 선 클릭 → 첫 분할점 → 두 번째 분할점 클릭 (두 점 사이를 잘라내고 두 선으로 분할). 같은 점 두 번 클릭하면 그 점에서만 분할',
    breakAtPoint: '⋮ 점에서 분할: 선 클릭 → 한 점 클릭 → 그 점에서 두 선으로 분할 (중간 제거 없음)',
    dimLinear: '↦ 선형 치수: 두 점 클릭 (또는 선 1개 클릭) → 치수선 위치 클릭',
    dimAligned: '⤡ 평행 치수: 두 점을 잇는 방향에 평행한 치수 / 점1 → 점2 → 위치',
    dimRadius: 'R 반지름: 원/호 클릭 → 라벨 위치 클릭',
    dimDiameter: '⌀ 직경: 원/호 클릭 → 라벨 위치 클릭',
    dimAngle: '∠ 각도: 첫 번째 선 → 두 번째 선 → 호 위치 클릭'
  };
  document.getElementById('statusHint').textContent = hints[tool] || '';
}

document.getElementById('btnContinuous').addEventListener('click', () => {
  continuousMode = !continuousMode;
  document.getElementById('btnContinuous').classList.toggle('active', continuousMode);
  document.getElementById('btnContinuous').textContent = continuousMode ? '⛓ 연속선 ON' : '⛓ 연속선';
  firstClick = null;
  preCtx.clearRect(0,0,baseW,baseH);
  updateToolStatus();
  if (typeof syncToolStripToggles === 'function') syncToolStripToggles(); // Rev.12.0
});

document.getElementById('btnSnap').addEventListener('click', () => {
  snapMode = !snapMode;
  document.getElementById('btnSnap').classList.toggle('active', snapMode);
  document.getElementById('btnSnap').textContent = snapMode ? '🧲 스냅 ON' : '🧲 스냅';
  if (!snapMode) snapShown = null;
  updateSnapStat();
  if (typeof syncToolStripToggles === 'function') syncToolStripToggles(); // Rev.12.0
});

function updateSnapStat() {
  const el = document.getElementById('snapStat');
  if (!bgImage && !shapes.length) {
    el.textContent = '스냅: 비활성 (배경/도형 없음)';
    el.classList.remove('ready');
  } else {
    let txt = `🧲 점${snapPoints.length} 호${detectedArcs.length}`;
    if (snapMode) txt += ' [고정ON]';
    if (liveSnapMode) txt += ' [라이브ON]';
    el.textContent = txt;
    el.classList.add('ready');
  }
}

// ====== 스냅점 검출 ======
function detectSnapPoints() {
  if (!bgImage) return;
  try {
    const tmpC = document.createElement('canvas');
    tmpC.width = baseW; tmpC.height = baseH;
    tmpC.getContext('2d').drawImage(bgImage, 0, 0, baseW, baseH);
    const src = cv.imread(tmpC);
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    const corners = new cv.Mat();
    cv.goodFeaturesToTrack(gray, corners, 500, 0.01, 10);
    snapPoints = [];
    for (let i = 0; i < corners.rows; i++) {
      snapPoints.push({x: Math.round(corners.data32F[i*2]), y: Math.round(corners.data32F[i*2+1])});
    }
    // 직선 교차점 추가
    const edges = new cv.Mat();
    cv.Canny(gray, edges, 50, 150);
    const lines = new cv.Mat();
    cv.HoughLinesP(edges, lines, 1, Math.PI/180, 50, 40, 10);
    const lineSegs = [];
    for (let i = 0; i < lines.rows; i++) {
      lineSegs.push({x1:lines.data32S[i*4],y1:lines.data32S[i*4+1],x2:lines.data32S[i*4+2],y2:lines.data32S[i*4+3]});
    }
    const maxLines = Math.min(lineSegs.length, 80);
    for (let i = 0; i < maxLines; i++) {
      for (let j = i+1; j < maxLines; j++) {
        const ip = lineIntersection(lineSegs[i], lineSegs[j]);
        if (ip && ip.x>=0 && ip.y>=0 && ip.x<baseW && ip.y<baseH) {
          if (isPointNearSegment(ip, lineSegs[i], 5) && isPointNearSegment(ip, lineSegs[j], 5)) {
            snapPoints.push({x: Math.round(ip.x), y: Math.round(ip.y)});
          }
        }
      }
    }
    snapPoints = dedupePoints(snapPoints, 5);
    src.delete(); gray.delete(); corners.delete(); edges.delete(); lines.delete();
    updateSnapStat();
  } catch(e) { console.error('스냅 검출:', e); }
}

// ====== 배경 라운드(호/원) 자동검출 (라운드 도구용) ======
function detectBackgroundArcs() {
  if (!bgImage) return;
  try {
    const tmpC = document.createElement('canvas');
    tmpC.width = baseW; tmpC.height = baseH;
    tmpC.getContext('2d').drawImage(bgImage, 0, 0, baseW, baseH);
    const src = cv.imread(tmpC);
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    
    detectedArcs = [];
    
    // 1) Hough Circles로 완전한 원/큰 호
    const circles = new cv.Mat();
    const grayBlur = new cv.Mat();
    cv.medianBlur(gray, grayBlur, 5);
    cv.HoughCircles(grayBlur, circles, cv.HOUGH_GRADIENT, 1, 15, 100, 25, 5, 300);
    for (let i = 0; i < circles.cols; i++) {
      detectedArcs.push({
        cx: circles.data32F[i*3],
        cy: circles.data32F[i*3+1],
        r: circles.data32F[i*3+2],
        startAngle: 0, endAngle: Math.PI*2, isFull: true
      });
    }
    circles.delete(); grayBlur.delete();
    
    // 2) Contour + fitEllipse로 부분 호(라운드 코너) 검출
    const bin = new cv.Mat();
    cv.threshold(gray, bin, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(bin, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_NONE);
    
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      if (cnt.rows < 15) { cnt.delete(); continue; }
      
      try {
        // 윤곽선을 작은 세그먼트로 잘라서 각 부분이 호인지 검사
        // 간단히: fitEllipse → 원에 가까우면 (rx≈ry) 호로 등록
        if (cnt.rows >= 5) {
          const rrect = cv.fitEllipse(cnt);
          const rx = rrect.size.width / 2;
          const ry = rrect.size.height / 2;
          const ratio = Math.max(rx,ry) / Math.max(Math.min(rx,ry), 0.001);
          
          // 원에 가까운 (ratio < 1.5) 작은 호만 (반지름 3~200px)
          if (ratio < 1.5 && rx >= 3 && rx <= 200 && ry >= 3 && ry <= 200) {
            const cx = rrect.center.x;
            const cy = rrect.center.y;
            const r = (rx + ry) / 2;
            
            // 윤곽선 점들이 실제로 이 원 위에 있는지 검증
            let onCircle = 0;
            for (let k = 0; k < cnt.rows; k++) {
              const px = cnt.data32S[k*2];
              const py = cnt.data32S[k*2+1];
              const d = Math.hypot(px-cx, py-cy);
              if (Math.abs(d - r) < r * 0.15) onCircle++;
            }
            const onRatio = onCircle / cnt.rows;
            
            if (onRatio > 0.7) {
              // 시작/끝 각도 계산 (윤곽선 양 끝점 기준)
              const sx = cnt.data32S[0], sy = cnt.data32S[1];
              const ex = cnt.data32S[(cnt.rows-1)*2], ey = cnt.data32S[(cnt.rows-1)*2+1];
              const startAng = Math.atan2(sy-cy, sx-cx);
              const endAng = Math.atan2(ey-cy, ex-cx);
              
              const fullPerim = 2 * Math.PI * r;
              const cntPerim = cv.arcLength(cnt, false);
              const coverage = cntPerim / fullPerim;
              
              detectedArcs.push({
                cx, cy, r,
                startAngle: startAng,
                endAngle: endAng,
                isFull: coverage > 0.85
              });
            }
          }
        }
      } catch(e) {}
      cnt.delete();
    }
    
    contours.delete(); hierarchy.delete(); bin.delete();
    src.delete(); gray.delete();
    
    // 중복 제거 (중심과 반지름이 거의 같은것)
    const filtered = [];
    for (const a of detectedArcs) {
      let dup = false;
      for (const b of filtered) {
        if (Math.abs(a.cx-b.cx)<5 && Math.abs(a.cy-b.cy)<5 && Math.abs(a.r-b.r)<5) { dup = true; break; }
      }
      if (!dup) filtered.push(a);
    }
    detectedArcs = filtered;
    
    updateSnapStat();
  } catch(e) { console.error('배경 호 검출:', e); }
}

function lineIntersection(L1, L2) {
  const x1=L1.x1, y1=L1.y1, x2=L1.x2, y2=L1.y2;
  const x3=L2.x1, y3=L2.y1, x4=L2.x2, y4=L2.y2;
  const denom = (x1-x2)*(y3-y4) - (y1-y2)*(x3-x4);
  if (Math.abs(denom) < 1e-6) return null;
  const t = ((x1-x3)*(y3-y4) - (y1-y3)*(x3-x4)) / denom;
  return { x: x1 + t*(x2-x1), y: y1 + t*(y2-y1) };
}
function isPointNearSegment(p, L, tol) {
  return p.x >= Math.min(L.x1,L.x2)-tol && p.x <= Math.max(L.x1,L.x2)+tol &&
         p.y >= Math.min(L.y1,L.y2)-tol && p.y <= Math.max(L.y1,L.y2)+tol;
}
function dedupePoints(pts, tol) {
  const r = [];
  for (const p of pts) {
    let dup = false;
    for (const q of r) { if (Math.abs(p.x-q.x)<tol && Math.abs(p.y-q.y)<tol) { dup=true; break; }}
    if (!dup) r.push(p);
  }
  return r;
}

function getAllSnapTargets() {
  const t = [...snapPoints];
  // 그려진 도형의 끝점/중심
  shapes.forEach(s => {
    if (s.type === 'line' || s.type === 'rect') {
      t.push({x:s.p1.x, y:s.p1.y});
      t.push({x:s.p2.x, y:s.p2.y});
      if (s.type === 'rect') {
        t.push({x:s.p1.x, y:s.p2.y});
        t.push({x:s.p2.x, y:s.p1.y});
      }
    } else if (s.type === 'circle') {
      t.push({x:s.p1.x, y:s.p1.y});
      // 원의 4분점도 스냅 대상으로
      const r = Math.hypot(s.p2.x-s.p1.x, s.p2.y-s.p1.y);
      t.push({x:s.p1.x+r, y:s.p1.y});
      t.push({x:s.p1.x-r, y:s.p1.y});
      t.push({x:s.p1.x, y:s.p1.y+r});
      t.push({x:s.p1.x, y:s.p1.y-r});
    } else if (s.type === 'arc') {
      t.push({x:s.cx, y:s.cy});
      // 호의 시작점과 끝점
      t.push({x: s.cx + s.r*Math.cos(s.startAngle), y: s.cy + s.r*Math.sin(s.startAngle)});
      t.push({x: s.cx + s.r*Math.cos(s.endAngle), y: s.cy + s.r*Math.sin(s.endAngle)});
    }
  });
  // 배경 검출 라운드의 핵심 점들 (중심, 4분점, 검출된 호의 양 끝점)
  detectedArcs.forEach(a => {
    t.push({x: Math.round(a.cx), y: Math.round(a.cy)});
    t.push({x: Math.round(a.cx + a.r), y: Math.round(a.cy)});
    t.push({x: Math.round(a.cx - a.r), y: Math.round(a.cy)});
    t.push({x: Math.round(a.cx), y: Math.round(a.cy + a.r)});
    t.push({x: Math.round(a.cx), y: Math.round(a.cy - a.r)});
    // 호의 시작/끝 (전체 원이 아닌 경우만)
    if (!a.isFull) {
      t.push({x: Math.round(a.cx + a.r*Math.cos(a.startAngle)), y: Math.round(a.cy + a.r*Math.sin(a.startAngle))});
      t.push({x: Math.round(a.cx + a.r*Math.cos(a.endAngle)), y: Math.round(a.cy + a.r*Math.sin(a.endAngle))});
    }
  });
  return t;
}

function findNearestSnap(p) {
  // 어떤 스냅도 켜져있지 않으면 종료
  const anyPreciseOn = snapTangent || snapPerpendicular || snapParallel || snapExtension;
  if (!snapMode && !liveSnapMode && !anyPreciseOn) return null;
  
  // Rev.11.29: 스냅 반경을 화면 픽셀 기준으로 → 줌과 무관하게 커서 근처에서만 스냅
  const radiusScreen = parseInt(document.getElementById('snapRadius').value) || 15;
  const radius = radiusScreen / (zoom || 1); // 도면 좌표 기준 반경
  const r2 = radius * radius;
  let best = null, bestD = Infinity;
  
  // 1) 일반 스냅 점들 (배경 코너 + 도형 특징점) - 점종류별 필터 적용
  if (snapMode) {
    for (const t of getAllSnapTargets()) {
      // Rev.10.8: 점 종류 필터링
      const kind = t.kind || 'corner';
      if (!osnapKindAllowed(kind)) continue;
      const dx = t.x - p.x, dy = t.y - p.y;
      const d2 = dx*dx + dy*dy;
      if (d2 < r2 && d2 < bestD) { bestD = d2; best = {...t, kind: kind}; }
    }
  }
  
  // 2) 라이브 스냅: 모든 도형의 가장 가까운 점 (선 위/원 위/사각형 변 위)
  if (liveSnapMode) {
    const excludeIds = (dragState && dragState.type === 'move') 
      ? new Set(dragState.offsets.map(o => o.id)) 
      : new Set();
    
    for (const s of shapes) {
      if (excludeIds.has(s.id)) continue;
      // 도형 위 임의점 - osnapEnabled.onshape 필터 (Rev.10.8)
      if (osnapEnabled.onshape) {
        const np = nearestPointOnShape(p, s);
        if (np) {
          const dx = np.x - p.x, dy = np.y - p.y;
          const d2 = dx*dx + dy*dy;
          if (d2 < r2 && d2 < bestD) {
            bestD = d2;
            best = {x: np.x, y: np.y, kind: 'on-shape', shapeType: s.type};
          }
        }
      }
      const kps = getShapeKeyPoints(s);
      for (const kp of kps) {
        // Rev.10.8: 점 종류 필터
        if (!osnapKindAllowed(kp.kind)) continue;
        const ddx = kp.x - p.x, ddy = kp.y - p.y;
        const dd2 = ddx*ddx + ddy*ddy;
        if (dd2 < r2 && dd2 < bestD) {
          bestD = dd2;
          best = {x: kp.x, y: kp.y, kind: kp.kind};
        }
      }
    }
  }
  
  // 3) A안 정밀 스냅 (작도 중일 때만): 접점/수선/평행/연장
  // 각 정밀스냅 토글로만 제어 - 일반 스냅 OFF여도 독립 작동
  if (firstClick && (tool === 'line' || tool === 'arc' || tool === 'circle' || tool === 'rect')) {
    if (anyPreciseOn) {
      const preciseCands = findPreciseSnapCandidates(firstClick, p);
      // 정밀 스냅은 반경을 더 크게 (접점이나 연장은 마우스에서 멀 수 있음)
      const preciseR = Math.max(radius * 3, 40);
      const preciseR2 = preciseR * preciseR;
      
      for (const c of preciseCands) {
        const dx = c.x - p.x, dy = c.y - p.y;
        const d2 = dx*dx + dy*dy;
        if (d2 < preciseR2 && d2 < bestD) {
          bestD = d2;
          best = c;
        }
      }
    }
  }
  
  return best;
}

// ====== A안 정밀 스냅 후보 계산 (Rev.7.9) ======
// firstPt(시작점) → p(현재 마우스) 작도 중일 때, 다른 도형들과의 관계 기반 후보점 생성
function findPreciseSnapCandidates(firstPt, p) {
  const cands = [];
  const ids = new Set(); // 중복 방지
  
  // 1) 접점 (Tangent): 시작점에서 원/호에 접하는 직선
  //    캐드 동작: 마우스가 원 둘레 어느 부분에 가까우면 → 가장 가까운 수학적 접점으로 흡착
  //    원 외부 시작점일 때 접점은 정확히 2개 (대칭). 마우스 위치로 둘 중 하나 자동 선택.
  if (snapTangent && tool === 'line') {
    for (const s of shapes) {
      let cx, cy, r, isArc = false, arcStart = 0, arcEnd = Math.PI*2, arcCcw = false;
      if (s.type === 'circle') {
        cx = s.p1.x; cy = s.p1.y;
        r = Math.hypot(s.p2.x-s.p1.x, s.p2.y-s.p1.y);
      } else if (s.type === 'arc') {
        cx = s.cx; cy = s.cy; r = s.r;
        isArc = true; arcStart = s.startAngle; arcEnd = s.endAngle; arcCcw = s.ccw;
      } else continue;
      
      const distStart = Math.hypot(firstPt.x - cx, firstPt.y - cy);
      if (distStart <= r + 0.5) continue;  // 시작점이 원 안/위면 접선 없음
      
      // 마우스가 원 둘레에 얼마나 가까운지 (확장 반경 적용)
      const distMouse = Math.hypot(p.x - cx, p.y - cy);
      const distToCircumference = Math.abs(distMouse - r);
      
      // 마우스가 원 둘레 근처(원의 반지름의 50% 또는 60px 중 큰 값 이내)면 접점 후보 활성화
      const tangentSnapThreshold = Math.max(60, r * 0.5);
      if (distToCircumference > tangentSnapThreshold) continue;
      
      // 수학적 접점 2개
      const tangents = computeTangentPoints({x: firstPt.x, y: firstPt.y}, {cx, cy, r});
      
      tangents.forEach(tp => {
        // 호일 경우 그 접점이 호 범위 내에 있어야 함
        if (isArc) {
          const ang = Math.atan2(tp.y - cy, tp.x - cx);
          if (!isAngleInArcRange(ang, arcStart, arcEnd, arcCcw)) return;
        }
        cands.push({x: tp.x, y: tp.y, kind: 'tangent', sourceId: s.id});
      });
    }
  }
  
  // 2) 수선 (Perpendicular): 시작점에서 다른 선에 내린 수선의 발
  if (snapPerpendicular && tool === 'line') {
    for (const s of shapes) {
      if (s.type === 'line') {
        // s의 무한 직선 위에 firstPt에서 내린 수선의 발
        const foot = footOnInfiniteLine(firstPt, s.p1, s.p2);
        if (foot) cands.push({x: foot.x, y: foot.y, kind: 'perp', sourceId: s.id});
      } else if (s.type === 'rect') {
        // 사각형 4변 각각에 대해
        const x1 = Math.min(s.p1.x, s.p2.x), x2 = Math.max(s.p1.x, s.p2.x);
        const y1 = Math.min(s.p1.y, s.p2.y), y2 = Math.max(s.p1.y, s.p2.y);
        const edges = [
          [{x:x1,y:y1},{x:x2,y:y1}], [{x:x2,y:y1},{x:x2,y:y2}],
          [{x:x2,y:y2},{x:x1,y:y2}], [{x:x1,y:y2},{x:x1,y:y1}]
        ];
        for (const [a,b] of edges) {
          const foot = footOnInfiniteLine(firstPt, a, b);
          if (foot) cands.push({x: foot.x, y: foot.y, kind: 'perp', sourceId: s.id});
        }
      }
      // 원에 대한 수선: 중심을 지나는 직선과의 교점 (= 가까운 4분점)
      // 일반적으로는 접점이 더 의미있으므로 생략
    }
  }
  
  // 3) 평행 (Parallel): 시작점에서 그어지는 직선이 다른 직선과 평행이 되는 지점
  // 현재 마우스 위치가 만드는 선의 각도가 기존 선과 가까우면 정확히 평행으로 보정
  if (snapParallel && tool === 'line') {
    const curDx = p.x - firstPt.x;
    const curDy = p.y - firstPt.y;
    const curLen = Math.hypot(curDx, curDy);
    if (curLen > 5) {  // 너무 짧으면 의미 없음
      const curAng = Math.atan2(curDy, curDx);
      for (const s of shapes) {
        if (s.type !== 'line' && s.type !== 'rect') continue;
        // 후보 각도들 (선=1개, 사각형=2개)
        let candAngs = [];
        if (s.type === 'line') {
          const ang = Math.atan2(s.p2.y-s.p1.y, s.p2.x-s.p1.x);
          candAngs.push(ang);
          candAngs.push(ang + Math.PI);  // 반대 방향도
        } else if (s.type === 'rect') {
          // 사각형은 수평/수직만
          candAngs = [0, Math.PI/2, Math.PI, -Math.PI/2];
        }
        for (const refAng of candAngs) {
          // 각도 차이를 -PI~PI로 정규화
          let diff = curAng - refAng;
          while (diff > Math.PI) diff -= Math.PI*2;
          while (diff < -Math.PI) diff += Math.PI*2;
          const diffDeg = Math.abs(diff * 180 / Math.PI);
          if (diffDeg < PARALLEL_ANGLE_TOL_DEG) {
            // 평행 보정: 현재 길이는 유지, 방향만 refAng로
            const x = firstPt.x + curLen * Math.cos(refAng);
            const y = firstPt.y + curLen * Math.sin(refAng);
            cands.push({x, y, kind: 'parallel', sourceId: s.id});
          }
        }
      }
    }
  }
  
  // 4) 연장선 (Extension): 시작점에서 그어지는 선이 기존 선의 연장선과 일치하거나 그 위에 있을 때
  // 또는 마우스 근처에 다른 선의 연장선이 있을 때
  if (snapExtension) {
    for (const s of shapes) {
      if (s.type !== 'line') continue;
      // 선 s의 무한 직선 위에서 p에 가장 가까운 점
      const foot = footOnInfiniteLine(p, s.p1, s.p2);
      if (!foot) continue;
      // 선분 양 끝점에서 떨어져 있어야 "연장선"
      const dToP1 = Math.hypot(foot.x-s.p1.x, foot.y-s.p1.y);
      const dToP2 = Math.hypot(foot.x-s.p2.x, foot.y-s.p2.y);
      const segLen = Math.hypot(s.p2.x-s.p1.x, s.p2.y-s.p1.y);
      // 선분 안에 있으면 일반 line nearest로 잡힘 → 여기서는 외부 연장만
      if (dToP1 > segLen + 2 || dToP2 > segLen + 2) {
        cands.push({x: foot.x, y: foot.y, kind: 'extension', sourceId: s.id});
      }
    }
  }
  
  return cands;
}

// 점 P에서 두 점이 정의하는 무한 직선 위에 내린 수선의 발
function footOnInfiniteLine(P, A, B) {
  const dx = B.x - A.x, dy = B.y - A.y;
  const len2 = dx*dx + dy*dy;
  if (len2 < 1e-6) return null;
  const t = ((P.x - A.x)*dx + (P.y - A.y)*dy) / len2;
  return { x: A.x + t*dx, y: A.y + t*dy };
}

// 각도 ang이 호 (startAng, endAng, ccw)의 범위 안에 있는지 (canvas 좌표계)
function isAngleInArcRange(ang, startAng, endAng, ccw) {
  const norm = a => { while(a < 0) a += Math.PI*2; while(a >= Math.PI*2) a -= Math.PI*2; return a; };
  const na = norm(ang);
  const ns = norm(startAng);
  const ne = norm(endAng);
  // canvas의 ccw=false 면 start→end로 각도 증가 방향 (캔버스 시계방향)
  // 시작각부터 ccw=false 방향으로 끝각까지 경로상에 na가 있는지
  if (!ccw) {
    if (ns <= ne) return na >= ns && na <= ne;
    return na >= ns || na <= ne;
  } else {
    if (ns >= ne) return na <= ns && na >= ne;
    return na <= ns || na >= ne;
  }
}

// 점 P에서 중심 (cx,cy) 반지름 r 원에 그어지는 접선의 접점 2개
function computeTangentPoints(P, circle) {
  const cx = circle.cx, cy = circle.cy, r = circle.r;
  const dx = P.x - cx, dy = P.y - cy;
  const dist = Math.hypot(dx, dy);
  if (dist <= r + 0.5) return [];  // 점이 원 안이나 위에 있으면 접선 없음
  
  // 벡터 (P-C) 정규화
  const ux = dx / dist, uy = dy / dist;
  // 접점은 C에서 (P방향으로 r²/dist만큼) + (수직방향으로 ±r*sqrt(1-(r/dist)²))
  const a = r * r / dist;
  const h = r * Math.sqrt(Math.max(0, 1 - (r/dist) * (r/dist)));
  const baseX = cx + ux * a;
  const baseY = cy + uy * a;
  // 수직 단위벡터: (-uy, ux)
  return [
    { x: baseX + (-uy) * h, y: baseY + (ux) * h },
    { x: baseX - (-uy) * h, y: baseY - (ux) * h }
  ];
}

function getCanvasPoint(e) {
  const r = drawCanvas.getBoundingClientRect();
  const p = {
    x: Math.round((e.clientX - r.left) / zoom),
    y: Math.round((e.clientY - r.top) / zoom)
  };
  const snap = findNearestSnap(p);
  if (snap) { p.snapped = true; p.x = snap.x; p.y = snap.y; snapShown = snap; }
  else snapShown = null;
  return p;
}

// ====== 마우스 이벤트 ======
drawCanvas.addEventListener('mousemove', e => {
  const p = getCanvasPoint(e);
  lastMousePoint = p; // 회전축 거리입력 Enter 처리용
  const mmX = (p.x * mmPerPixel).toFixed(2);
  const mmY = (p.y * mmPerPixel).toFixed(2);
  const unit = calibSet ? `${mmX}, ${mmY} mm` : `${p.x}, ${p.y} px`;
  document.getElementById('statusCoord').textContent = unit + (p.snapped ? ' 🧲' : '');

  // Rev.16.24: 필렛 방향 미리보기 (지름 입력 후 진행 중)
  if (filletPreview){
    drawFilletPreview(p);
    return;
  }

  // Rev.16.14: 쓸어 지우기 미리보기 - 경로(빨강) + 삭제예정 선(빨강 굵게)
  if (swipeEraseMode){
    if (swipeErasing){
      const last = swipePath[swipePath.length-1];
      if (!last || Math.hypot(p.x-last.x, p.y-last.y) > (3/(zoom||1))){
        swipePath.push({ x: p.x, y: p.y });
      }
    }
    drawSwipeErasePreview(p);
    return;
  }

  // Rev.16.10: 대각선(교점) 미리보기 - 반경 원 + 범위내 교점후보 + 선택점 + 드래그박스
  if (diagXMode){
    diagXHoverPt = { x: p.x, y: p.y };
    drawDiagXPreview(p);
    return;
  }

  // Rev.12.6: 거리두기 좌/우 미리보기 (대상 선 선택 후)
  if (offsetTwinPickMode && offsetTwinTarget){
    drawOffsetTwinPreview(p);
    return;
  }

  // Rev.11.39: 이동(Grab) 모드 - 마우스 따라 선택 도형 이동
  if (grabMode){
    grabUpdate(p);
    return;
  }

  // Rev.11.20: 연장(Extrude) 미리보기
  if (extrudeMode && extrudeState) {
    const off = extrudeOffset(p);
    drawExtrudePreview(off);
    return;
  }
  // 캘리브 도구: 첫 점 클릭 후 두 번째 점까지의 미리보기
  if (tool === 'calib' && calibFirstPoint) {
    drawCalibPreview(calibFirstPoint, p);
    return;
  }
  
  // 회전축 도구: 첫 점 클릭 후 미리보기
  if (tool === 'axis' && axisFirstPoint) {
    // Shift 직선 잠금 + 거리 오버라이드 적용
    const constrained = applyAxisConstraint(axisFirstPoint, p);
    drawAxisPreview(axisFirstPoint, constrained);
    // 길이 표시 (mm 우선)
    const dx0 = constrained.x - axisFirstPoint.x;
    const dy0 = constrained.y - axisFirstPoint.y;
    const lenPx = Math.hypot(dx0, dy0);
    const lenMmShow = (lenPx * mmPerPixel).toFixed(2);
    const angDeg = (Math.atan2(-dy0, dx0) * 180 / Math.PI).toFixed(1);
    const lockTxt = shiftDown ? ' [Shift:45°잠금]' : '';
    const distTxt = axisDistanceOverride !== null
      ? ` ⟪ 거리고정 ${axisDistanceOverride}${calibSet ? 'mm' : 'px'} ⟫` : '';
    document.getElementById('statusHint').textContent =
      `🔄 회전축 2번째 점 → 길이 ${lenMmShow}mm (${lenPx.toFixed(0)}px) · ${angDeg}°${lockTxt}${distTxt}` +
      ` · 숫자입력=거리지정(Enter확정, Esc해제)`;
    return;
  }
  
  // Rev.10.9: select 외 도구에서 시작된 박스 선택 드래그 미리보기
  if (dragState && dragState.type === 'box' && dragState.fromOtherTool) {
    const dx = p.x - dragState.boxStart.x;
    const dy = p.y - dragState.boxStart.y;
    // 5px 이상 움직였을 때만 박스 선택을 실제로 시작
    if (!dragState.active) {
      if (Math.hypot(dx, dy) < 5) return; // 아직 작은 움직임 - 도구 미리보기 계속
      // 활성화: 기존 선택 해제 (Shift 누른 상태면 추가 선택)
      dragState.active = true;
      if (!shiftDown) { selectedIds.clear(); updateSelStat(); redrawDraw(); }
    }
    drawBoxSelectPreview(dragState.boxStart, p);
    return;
  }
  
  if (tool === 'select') {
    // 호 핸들 드래그 처리
    if (arcHandleDrag) {
      handleArcHandleDrag(p);
      return;
    }
    // Rev.11.12: 그립 위 hover 시 커서 변경 (드래그 중이 아닐 때)
    if (!dragState){
      const overGrip = hitGrip(p);
      drawCanvas.style.cursor = overGrip ? 'crosshair' : 'default';
    }
    // Rev.11.12: 끝점 그립 드래그 (연장/이동) - 스냅 지원
    // Rev.11.15: 정렬 추적 추가 (점 위치 유지하며 X/Y축만 정렬 → 수평/수직 연장)
    if (dragState && dragState.type === 'grip') {
      const g = dragState.grip;
      const s = shapes.find(x => x.id === g.shapeId);
      if (!s) return;
      let nx = p.x, ny = p.y;
      // Shift = 수평/수직 제약 (반대편 끝점 기준)
      let anchor = null;
      if (s.type === 'line') anchor = (g.key === 'p1') ? s.p2 : s.p1;
      if (shiftDown && anchor){
        if (Math.abs(nx - anchor.x) > Math.abs(ny - anchor.y)) ny = anchor.y;
        else nx = anchor.x;
      }
      let snapHit = null;     // 점 직접 스냅
      let alignX = null;      // X 정렬 기준점 {x,y} (수직 정렬선)
      let alignY = null;      // Y 정렬 기준점 {x,y} (수평 정렬선)
      if (snapMode && !shiftDown){
        const radius = (parseInt(document.getElementById('snapRadius').value) || 15) / (zoom || 1);
        // 후보점 수집: 다른 도형의 끝점/코너/중심 + 배경 스냅점 + (선이면) 반대편 끝점
        const cand = [];
        shapes.forEach(o => {
          if (o.id === s.id) return;
          if (o.type === 'line' && o.p1 && o.p2){ cand.push(o.p1, o.p2); }
          else if (o.type === 'rect' && o.p1 && o.p2){
            cand.push(o.p1, {x:o.p2.x,y:o.p1.y}, o.p2, {x:o.p1.x,y:o.p2.y});
          }
          else if (o.type === 'circle'){ cand.push({x:o.cx, y:o.cy}); }
          else if (o.type === 'arc'){
            cand.push({x:o.cx + o.r*Math.cos(o.startAngle), y:o.cy + o.r*Math.sin(o.startAngle)});
            cand.push({x:o.cx + o.r*Math.cos(o.endAngle), y:o.cy + o.r*Math.sin(o.endAngle)});
          }
        });
        if (typeof snapPoints !== 'undefined' && snapPoints.length){
          snapPoints.forEach(sp => cand.push(sp));
        }
        // 반대편 끝점(앵커)도 정렬 후보 → 늘려도 수평/수직 유지
        if (anchor) cand.push({x: anchor.x, y: anchor.y, _anchor: true});

        // ① 점 직접 스냅: 마우스와 가장 가까운 후보점 (반경 내)
        let best = Infinity;
        cand.forEach(c => {
          const d = Math.hypot(c.x - p.x, c.y - p.y);
          if (d < radius && d < best){ best = d; snapHit = c; }
        });

        // ② 점 스냅이 없으면 정렬 추적: X 정렬(수직선) / Y 정렬(수평선)
        if (!snapHit){
          let bestDX = radius, bestDY = radius;
          cand.forEach(c => {
            const dX = Math.abs(c.x - p.x); // 세로 정렬선까지 거리
            const dY = Math.abs(c.y - p.y); // 가로 정렬선까지 거리
            if (dX < bestDX){ bestDX = dX; alignX = c; }
            if (dY < bestDY){ bestDY = dY; alignY = c; }
          });
        }
      }

      if (snapHit){
        nx = snapHit.x; ny = snapHit.y;
      } else {
        // 정렬: X는 alignX의 X로(세로 정렬), Y는 alignY의 Y로(가로 정렬)
        if (alignX) nx = alignX.x;
        if (alignY) ny = alignY.y;
      }

      // 그립 좌표를 도형에 반영
      applyGripMove(s, g.key, nx, ny);
      redrawDraw();

      // 가이드/스냅 표시
      preCtx.clearRect(0,0,baseW,baseH);
      preCtx.save();
      const Z = zoom || 1;
      if (snapHit){
        const sr = 6 / Z;
        preCtx.strokeStyle = '#00ff88';
        preCtx.lineWidth = 2 / Z;
        preCtx.strokeRect(snapHit.x - sr, snapHit.y - sr, sr*2, sr*2);
      } else {
        // 정렬 가이드 점선 (수직: 주황 / 수평: 하늘)
        preCtx.setLineDash([6/Z, 4/Z]);
        preCtx.lineWidth = 1 / Z;
        if (alignX){
          preCtx.strokeStyle = '#ff9b3d';
          preCtx.beginPath();
          preCtx.moveTo(alignX.x, alignX.y);
          preCtx.lineTo(nx, ny);
          preCtx.stroke();
          // 기준점 표시
          preCtx.setLineDash([]);
          preCtx.strokeStyle = '#ff9b3d';
          const m = 4 / Z;
          preCtx.strokeRect(alignX.x - m, alignX.y - m, m*2, m*2);
          preCtx.setLineDash([6/Z, 4/Z]);
        }
        if (alignY){
          preCtx.strokeStyle = '#3dc8ff';
          preCtx.beginPath();
          preCtx.moveTo(alignY.x, alignY.y);
          preCtx.lineTo(nx, ny);
          preCtx.stroke();
          preCtx.setLineDash([]);
          preCtx.strokeStyle = '#3dc8ff';
          const m = 4 / Z;
          preCtx.strokeRect(alignY.x - m, alignY.y - m, m*2, m*2);
          preCtx.setLineDash([6/Z, 4/Z]);
        }
      }
      preCtx.restore();

      // 길이/좌표 안내
      let alignMsg = '';
      if (snapHit) alignMsg = ' [🧲 점 스냅]';
      else if (alignX && alignY) alignMsg = ' [📐 X·Y 정렬]';
      else if (alignX) alignMsg = ' [📐 수직 정렬]';
      else if (alignY) alignMsg = ' [📐 수평 정렬]';
      else if (shiftDown) alignMsg = ' [Shift: 직선]';
      if (s.type === 'line'){
        const len = Math.hypot(s.p2.x - s.p1.x, s.p2.y - s.p1.y) * mmPerPixel;
        document.getElementById('statusHint').textContent =
          `↔ 끝점 이동: 길이 ${len.toFixed(2)}mm` + alignMsg;
      } else {
        document.getElementById('statusHint').textContent =
          `↔ 코너 이동: (${(nx*mmPerPixel).toFixed(2)}, ${(ny*mmPerPixel).toFixed(2)})mm` + alignMsg;
      }
      return;
    }
    if (dragState && dragState.type === 'movefill') {
      let dx = p.x - dragState.startX, dy = p.y - dragState.startY;
      if (dx !== 0 || dy !== 0) dragState.moved = true;
      if (shiftDown) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      const f = fills.find(x => x.id === dragState.fillId);
      if (f){
        f.points = dragState.basePts.map(pt => ({ x: pt.x + dx, y: pt.y + dy }));
        redrawFills(); redrawDraw();
      }
      return;
    }
    if (dragState && dragState.type === 'move') {
      let dx = p.x - dragState.startX, dy = p.y - dragState.startY;
      if (dx !== 0 || dy !== 0) dragState.moved = true; // Rev.11.41: 실제 이동 표시
      // Shift 누르면 수평/수직만 (큰 변위 방향만 적용)
      if (shiftDown) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      
      // 이동 스냅: 선택된 도형들의 끝점을 다른 도형의 끝점/선/면으로 자동 흡착
      // 가장 가까운 (선택된 끝점, 타깃) 쌍을 찾아 그쪽으로 보정
      let snapApplied = null;  // {targetPoint, snappedShape, type}
      if (snapMode && !shiftDown) {
        const radius = (parseInt(document.getElementById('snapRadius').value) || 15) / (zoom || 1);
        const r2 = radius * radius;
        
        // 모든 선택된 도형의 끝점들 (이동 후 예상 위치)
        const movedPoints = [];  // [{x, y, shapeId, kind}]
        for (const off of dragState.offsets) {
          const s = shapes.find(x => x.id === off.id);
          if (!s) continue;
          getShapeKeyPoints({...s, _snapshot: off}).forEach(kp => {
            // 이동 후 위치 (off의 원본에 dx,dy 더함)
            movedPoints.push({x: kp.x + dx, y: kp.y + dy, shapeId: s.id});
          });
        }
        
        // 후보 타깃: 비선택 도형들의 끝점 + 배경 스냅점
        let bestD2 = r2;
        let bestSnapDx = 0, bestSnapDy = 0;
        let bestTarget = null;
        
        for (const mp of movedPoints) {
          // 배경 스냅점
          for (const sp of snapPoints) {
            const d2 = (sp.x - mp.x)*(sp.x - mp.x) + (sp.y - mp.y)*(sp.y - mp.y);
            if (d2 < bestD2) {
              bestD2 = d2;
              bestSnapDx = sp.x - mp.x; bestSnapDy = sp.y - mp.y;
              bestTarget = {pt: sp, kind: 'corner'};
            }
          }
          // 비선택 도형의 특징점들
          for (const ts of shapes) {
            if (selectedIds.has(ts.id)) continue;
            const tps = getShapeKeyPoints(ts);
            for (const tp of tps) {
              const d2 = (tp.x - mp.x)*(tp.x - mp.x) + (tp.y - mp.y)*(tp.y - mp.y);
              if (d2 < bestD2) {
                bestD2 = d2;
                bestSnapDx = tp.x - mp.x; bestSnapDy = tp.y - mp.y;
                bestTarget = {pt: tp, kind: tp.kind || 'endpoint'};
              }
            }
            // 선 위/원 위 가까운 점에도 스냅 (선의 면 스냅)
            const nearestOnShape = nearestPointOnShape({x:mp.x, y:mp.y}, ts);
            if (nearestOnShape) {
              const d2 = (nearestOnShape.x-mp.x)*(nearestOnShape.x-mp.x) + (nearestOnShape.y-mp.y)*(nearestOnShape.y-mp.y);
              if (d2 < bestD2) {
                bestD2 = d2;
                bestSnapDx = nearestOnShape.x - mp.x; bestSnapDy = nearestOnShape.y - mp.y;
                bestTarget = {pt: nearestOnShape, kind: 'on-shape'};
              }
            }
          }
        }
        
        // 스냅 보정 적용
        if (bestTarget) {
          dx += bestSnapDx; dy += bestSnapDy;
          snapApplied = bestTarget;
        }
      }
      
      for (const off of dragState.offsets) {
        const s = shapes.find(x => x.id === off.id);
        if (s) moveShapeTo(s, off, dx, dy);
      }
      redrawDraw();
      
      // 스냅 인디케이터 표시
      if (snapApplied) {
        preCtx.clearRect(0,0,baseW,baseH);
        preCtx.save();
        preCtx.strokeStyle = '#f39c12';
        preCtx.lineWidth = 2;
        const sr = 10;
        preCtx.strokeRect(snapApplied.pt.x - sr, snapApplied.pt.y - sr, sr*2, sr*2);
        preCtx.beginPath();
        preCtx.moveTo(snapApplied.pt.x - sr/2, snapApplied.pt.y);
        preCtx.lineTo(snapApplied.pt.x + sr/2, snapApplied.pt.y);
        preCtx.moveTo(snapApplied.pt.x, snapApplied.pt.y - sr/2);
        preCtx.lineTo(snapApplied.pt.x, snapApplied.pt.y + sr/2);
        preCtx.stroke();
        // 라벨
        const kindLabel = {corner:'코너', endpoint:'끝점', midpoint:'중점', center:'중심', 'on-shape':'선위'}[snapApplied.kind] || '스냅';
        preCtx.fillStyle = '#f39c12';
        preCtx.font = 'bold 11px sans-serif';
        preCtx.fillText(`🧲 ${kindLabel}`, snapApplied.pt.x + 12, snapApplied.pt.y - 8);
        preCtx.restore();
      } else {
        preCtx.clearRect(0,0,baseW,baseH);
      }
      
      // 이동 거리 표시 (mm)
      const dxMm = (dx * mmPerPixel).toFixed(2);
      const dyMm = (dy * mmPerPixel).toFixed(2);
      document.getElementById('statusHint').textContent = 
        `🔲 이동 중: ΔX=${dxMm}mm, ΔY=${dyMm}mm` + 
        (shiftDown ? ' [Shift: 직선이동]' : '') +
        (snapApplied ? ` [🧲 ${snapApplied.kind} 스냅]` : '');
      // Rev.11.9: 이동 거리 패널이 열려있으면 실시간 갱신
      updateMoveDeltaPanelLive();
      return;
    } else if (dragState && dragState.type === 'box') {
      drawBoxSelectPreview(dragState.boxStart, p);
      return;
    }
  } else if (tool === 'arc' && firstClick) {
    // 라운드 도구: 마우스 경로 기록
    if (arcPath.length === 0 || 
        (Math.abs(p.x - arcPath[arcPath.length-1].x) + Math.abs(p.y - arcPath[arcPath.length-1].y)) > 2) {
      arcPath.push({x: p.x, y: p.y});
    }
    drawArcPreview(firstClick, p);
    return;
  } else if (firstClick) {
    drawPreview(firstClick, p);
    return;
  }
  drawSnapIndicator();
});

drawCanvas.addEventListener('mousedown', e => {
  // Rev.11.26: 휠 클릭(가운데 버튼)은 패닝 전용 → 작도/선택 처리 안 함
  if (e.button === 1) return;

  // Rev.16.24: 필렛 방향 미리보기 중 - 좌클릭=확정, 우클릭=취소
  if (filletPreview){
    const p = getCanvasPoint(e);
    if (e.button === 0){ commitFilletAt(p); }
    else if (e.button === 2){ cancelFilletPreview(); }
    e.preventDefault();
    return;
  }

  // Rev.12.7: 거리두기 픽 모드 중에는 select 드래그(박스·이동) 시작 안 함 (click 으로만 처리)
  if ((offsetTwinPickMode || baseLineMode) && e.button === 0) return;

  // Rev.11.39: 이동(Grab) 모드 - 좌클릭 = 확정
  if (grabMode){
    if (e.button === 0){
      exitGrabMode(true);
      document.getElementById('statusHint').textContent = '✓ 이동 확정';
      e.preventDefault();
      return;
    }
  }

  // Rev.16.10: 대각선(교점) 모드 - 드래그 시작 (영역 선택)
  if (diagXMode){
    // 우클릭 = 취소
    if (e.button === 2){
      cancelDiagX();
      e.preventDefault();
      return;
    }
    if (e.button === 0){
      const p = getCanvasPoint(e);
      // 시작/끝 교점 모두 Shift+드래그 박스로 선택
      if (e.shiftKey){
        diagXDragging = true;
        diagXDragOrigin = { x: p.x, y: p.y };
      } else {
        const stg = diagXPhase === 0 ? '시작' : '끝';
        document.getElementById('statusHint').textContent = `╲ 대각선: ${stg} 교점은 Shift+드래그로 박스 선택하세요 (최대 2개)`;
      }
      e.preventDefault();
      return;
    }
  }

  // Rev.16.14: 쓸어 지우기 모드 - 드래그 시작
  if (swipeEraseMode){
    if (e.button === 2){  // 우클릭 = 종료
      exitSwipeEraseMode();
      document.getElementById('statusHint').textContent = '🧹 쓸어 지우기 종료';
      e.preventDefault();
      return;
    }
    if (e.button === 0){
      const p = getCanvasPoint(e);
      swipeErasing = true;
      swipePath = [{ x: p.x, y: p.y }];
      e.preventDefault();
      return;
    }
  }

  // Rev.11.37: 블렌더식 분할 모드
  if (subdivideMode){
    if (e.button === 0){
      const p = getCanvasPoint(e);
      if (!subdivideTarget){
        // 선 선택
        const target = findShapeAtPoint(p, 15);
        if (target && target.type === 'line'){
          subdivideTarget = target;
          subdivideCount = 1;
          drawSubdividePreview();
        } else {
          document.getElementById('statusHint').textContent = '✂ 분할: 선(line)만 분할 가능합니다. 선을 클릭하세요.';
        }
      } else {
        // 이미 선 선택됨 → 좌클릭 = 적용
        applySubdivide();
      }
      e.preventDefault();
      return;
    }
  }

  // Rev.11.20: 연장(Extrude) 확정 (좌클릭)
  if (extrudeMode && extrudeState && e.button === 0) {
    // Rev.11.43: 드래그로 연장 - mousedown은 드래그 시작만 표시
    extrudeDragging = true;
    e.preventDefault();
    return;
  }
  // Rev.11.18: 버텍스 점 찍기 모드 (좌클릭 = 점 생성)
  //   Rev.16.49: 한붓그리기 점선택 모드 중 점 생성 금지
  if (pointMode && !penPickMode && e.button === 0) {
    let p = getCanvasPoint(e);
    p = snapPointForVertex(p); // 스냅 적용
    const sw = parseInt(document.getElementById('strokeWidth').value) || 1;
    shapes.push({
      id: ++shapeIdSeq, type: 'point',
      p1: { x: p.x, y: p.y },
      stroke: document.getElementById('strokeColor').value || '#16e0b0',
      strokeWidth: sw
    });
    redoStack = []; pushHistory();
    redrawDraw(); updateCount();
    // Rev.11.44: 점 생성은 1회성 - 점 1개 찍으면 모드 종료
    pointMode = false;
    updateVertexButtons();
    drawCanvas.style.cursor = 'default';
    document.getElementById('statusHint').textContent =
      `• 점 생성 완료 (${(p.x*mmPerPixel).toFixed(2)}, ${(p.y*mmPerPixel).toFixed(2)})mm`;
    e.preventDefault();
    return;
  }
  // Rev.11.18: 연결 모드 (점/끝점을 순서대로 클릭해 선으로 잇기)
  // Rev.11.19: 연결에 사용된 버텍스 점은 선으로 흡수되어 삭제됨
  if (connectMode && e.button === 0) {
    let p = getCanvasPoint(e);
    // 클릭 위치에 버텍스 점이 있으면 그 점에 정확히 맞추고 삭제 대상으로 기록
    let usedPointId = null;
    const tolPt = (parseInt(document.getElementById('snapRadius').value) || 15) / (zoom || 1);
    for (let i = shapes.length - 1; i >= 0; i--) {
      const o = shapes[i];
      if (o.type === 'point' && o.p1 && Math.hypot(o.p1.x - p.x, o.p1.y - p.y) <= tolPt) {
        p = { x: o.p1.x, y: o.p1.y };
        usedPointId = o.id;
        break;
      }
    }
    // 버텍스에 안 걸리면 일반 스냅(끝점/코너 등) 적용
    if (usedPointId === null) p = snapPointForVertex(p);

    connectPoints.push({ x: p.x, y: p.y, pointId: usedPointId });
    if (connectPoints.length >= 2) {
      const a = connectPoints[connectPoints.length - 2];
      const b = connectPoints[connectPoints.length - 1];
      const sw = parseInt(document.getElementById('strokeWidth').value) || 1;
      shapes.push({
        id: ++shapeIdSeq, type: 'line',
        p1: { x: a.x, y: a.y }, p2: { x: b.x, y: b.y },
        stroke: document.getElementById('strokeColor').value || '#ffffff',
        strokeWidth: sw
      });
      // 이 선에 사용된 양 끝의 버텍스 점 삭제 (선으로 흡수)
      [a.pointId, b.pointId].forEach(pid => {
        if (pid != null){
          const idx = shapes.findIndex(x => x.id === pid && x.type === 'point');
          if (idx >= 0) shapes.splice(idx, 1);
        }
      });
      redoStack = []; pushHistory();
      redrawDraw(); updateCount();
      // Rev.14.6: 연결은 1회성 - 선 1개 생성 후 모드 종료
      connectPoints = [];
      exitConnectMode();
      drawCanvas.style.cursor = 'default';
      document.getElementById('statusHint').textContent =
        '🔗 연결: 선 1개 생성 완료 (모드 종료) · 다시 연결하려면 F';
      e.preventDefault();
      return;
    }
    document.getElementById('statusHint').textContent =
      `🔗 연결: 1번째 점 지정됨 · 두 번째 점을 클릭하면 선 생성 / 우클릭·Esc=종료`;
    e.preventDefault();
    return;
  }

  // 끝점 픽킹 모드 (select 도구 외에서도 동작 - 어느 도구에서든 picker 활성 시 우선 처리)
  if (endpointPickState) {
    const p = getCanvasPoint(e);
    handleEndpointPick(p);
    e.preventDefault();
    return;
  }

  // ===== Rev.10.9: 모든 도구에서 좌클릭 드래그로 박스 선택 가능 =====
  // 조건:
  //   - 좌클릭만 (button === 0)
  //   - 'select' 도구가 아닐 때
  //   - 작도 중 첫 점이 이미 찍히지 않은 상태 (firstClick 등)
  //   - 호 핸들 편집 중도 아님
  //   - 도형이 없는 빈 영역에서 시작
  if (tool !== 'select' && tool !== 'fill' && e.button === 0 && !endpointPickState && !arcHandleDrag) {
    const inDrawSequence =
      firstClick || axisFirstPoint || calibFirstPoint ||
      (typeof arcPath !== 'undefined' && arcPath.length > 0) ||
      filletState || offsetState || dimState ||
      (typeof copyTransformState !== 'undefined' && copyTransformState) ||
      idPickActive;
    if (!inDrawSequence) {
      const p = getCanvasPoint(e);
      const hit = hitTest(p);
      if (!hit) {
        // 빈 영역 → 박스 선택 모드 대기 (5px 이상 움직여야 실제 활성화)
        // 즉, 살짝 클릭은 도구의 일반 클릭으로 처리됨
        dragState = { type: 'box', boxStart: p, fromOtherTool: true, active: false };
        window._lastBoxRect = null;
        return; // preventDefault 안 함 → click 이벤트도 같이 발생
      }
      // 도형 위에서는 기존 도구의 동작에 맡김
    }
  }

  if (tool !== 'select') return;
  const p = getCanvasPoint(e);
  
  // 호 핸들 클릭 처리 (편집 중인 호가 있을 때 우선)
  if (editingArcId !== null) {
    const arcShape = shapes.find(x => x.id === editingArcId);
    if (arcShape) {
      const handleType = hitArcHandle(p, arcShape);
      if (handleType) {
        // 핸들 드래그 시작
        arcHandleDrag = {
          type: handleType,
          shapeId: editingArcId,
          original: {
            startAngle: arcShape.startAngle,
            endAngle: arcShape.endAngle,
            ccw: arcShape.ccw,
            r: arcShape.r
          },
          mouseStartAngle: Math.atan2(p.y - arcShape.cy, p.x - arcShape.cx)
        };
        e.preventDefault();
        return;
      }
    }
  }
  
  const hit = hitTest(p);
  // Rev.11.12: 단일 선택 도형의 끝점 그립을 잡으면 끝점 드래그(연장/이동) 시작
  const grip = hitGrip(p);
  if (grip) {
    dragState = { type: 'grip', grip: grip, startX: p.x, startY: p.y };
    e.preventDefault();
    return;
  }
  if (hit) {
    if (!selectedIds.has(hit.id)) {
      if (!e.shiftKey) selectedIds.clear();
      selectedIds.add(hit.id);
      updateSelStat(); redrawDraw();
    }
    updateShapePropPanel();  // Rev.14.5: 클릭 즉시 속성 패널 갱신 (editingShapeId 설정)
    const offsets = [];
    selectedIds.forEach(id => {
      const s = shapes.find(x => x.id === id);
      if (s) offsets.push(snapshotShape(s));
    });
    dragState = { type: 'move', startX: p.x, startY: p.y, offsets };
    // Rev.11.9: 이동 시작 시점을 기준으로 거리 패널 준비
    captureMoveDeltaBase();
    showMoveDeltaPanel(0, 0);
  } else {
    // Rev.16.0: 도형이 없으면 채움(fill) 위인지 검사 → 채움 단독 선택·이동
    const fhit = hitTestFill(p);
    if (fhit){
      selectedFillIds.clear(); selectedFillIds.add(fhit.id);
      if (!e.shiftKey) selectedIds.clear();
      updateSelStat(); redrawFills(); redrawDraw();
      dragState = { type: 'movefill', startX: p.x, startY: p.y,
                    fillId: fhit.id, basePts: fhit.points.map(pt => ({x:pt.x, y:pt.y})) };
      document.getElementById('statusHint').textContent = '🎨 채움 선택 — 드래그로 이동 (외곽선 버튼 누르면 이 위치에 외곽선 생성)';
      e.preventDefault();
      return;
    }
    // Rev.11.62: 블렌더식 - 점/선 선택 + Shift+빈공간 클릭 → 즉시 연장(점→선, 선→면)
    if (e.shiftKey && selectedIds.size > 0) {
      if (blenderQuickExtrudeAt(p)) {
        suppressNextClick = true; // 직후 click으로 선택 해제 방지
        e.preventDefault();
        return;
      }
    }
    if (!e.shiftKey) { selectedIds.clear(); selectedFillIds.clear(); updateSelStat(); redrawDraw(); redrawFills(); updateShapePropPanel(); }
    dragState = { type: 'box', boxStart: p };
    window._lastBoxRect = null;
  }
});

drawCanvas.addEventListener('mouseup', e => {
  // Rev.16.14: 쓸어 지우기 - 드래그 종료 시 경로가 가로지른 선 중 각도차≥임계값인 선 삭제
  if (swipeEraseMode && swipeErasing){
    swipeErasing = false;
    const p = getCanvasPoint(e);
    const last = swipePath[swipePath.length-1];
    if (!last || Math.hypot(p.x-last.x, p.y-last.y) > 0.5) swipePath.push({x:p.x, y:p.y});
    const ids = swipeEraseTargets(swipePath, swipeAngleThresh);
    if (ids.length){
      shapes = shapes.filter(s => !ids.includes(s.id));
      selectedIds.clear();
      redoStack = []; pushHistory();
      redrawDraw(); updateCount();
      document.getElementById('statusHint').textContent =
        `🧹 쓸어 지우기: 방향 ${swipeAngleThresh}° 이상 어긋난 선 ${ids.length}개 삭제 · 계속 드래그 · 우클릭/Esc=종료`;
    } else {
      document.getElementById('statusHint').textContent = '🧹 쓸어 지우기: 조건에 맞는 선이 없습니다 (경로를 가로지르고 방향이 어긋난 선만 삭제)';
    }
    swipePath = [];
    preCtx.clearRect(0,0,baseW,baseH);
    redrawDraw();
    e.preventDefault();
    return;
  }

  // Rev.16.12: 대각선(교점) - Shift+드래그 박스로 시작(Phase0)·끝(Phase1) 교점 각각 선택
  if (diagXMode && diagXDragging){
    diagXDragging = false;
    const p = getCanvasPoint(e);
    const o = diagXDragOrigin || p;
    diagXDragOrigin = null;

    const dragDist = Math.hypot(p.x - o.x, p.y - o.y);
    let picked;
    if (dragDist > (8 / (zoom||1))){
      picked = intersectionsInBox(Math.min(o.x,p.x), Math.min(o.y,p.y), Math.max(o.x,p.x), Math.max(o.y,p.y));
    } else {
      const rWorld = diagXRadius / (zoom||1);
      picked = intersectionsWithinRadius(p.x, p.y, rWorld);
    }
    const sel = picked.slice(0, 2).map(q => ({x:q.x, y:q.y}));

    if (sel.length === 0){
      document.getElementById('statusHint').textContent = '╲ 대각선: 선택 영역 안에 교점이 없습니다. 교차부를 더 넓게 Shift+드래그하세요.';
      drawDiagXPreview(p);
      e.preventDefault(); return;
    }

    if (diagXPhase === 0){
      diagXStartPts = sel;
      diagXPhase = 1;
      document.getElementById('statusHint').textContent =
        `╲ 시작 교점 ${sel.length}곳 마킹됨 — 이제 끝 교점을 Shift+드래그로 선택하세요 (우클릭/Esc=취소)`;
      drawDiagXPreview(p);
    } else {
      // Phase 1: 끝 교점 확정 → 시작 개수에 맞춰 자르고 확인 팝업
      const n = Math.min(diagXStartPts.length, sel.length);
      diagXEndPts = sel.slice(0, n);
      drawDiagXPreview(p);
      confirmDiagX();
    }
    e.preventDefault();
    return;
  }

  // Rev.11.43: 연장 드래그 종료 → 확정 (모드는 유지하여 연속 연장 가능)
  if (extrudeMode && extrudeState && extrudeDragging){
    extrudeDragging = false;
    const p = getCanvasPoint(e);
    const off = extrudeOffset(p);
    if (off.dist > 1){ // 충분히 드래그됐을 때만 확정
      commitExtrude(off);
    }
    preCtx.clearRect(0,0,baseW,baseH);
    // 모드 종료 (commitExtrude가 새 도형 선택 상태로 만듦) → 다시 연장하려면 버튼/E
    extrudeMode = false; extrudeState = null; extrudeAxis = null;
    updateVertexButtons();
    drawCanvas.style.cursor = 'default';
    document.getElementById('statusHint').textContent = '⬄ 연장 완료 · 계속하려면 도형 선택 후 연장(E)';
    return;
  }
  // 호 핸들 드래그 종료
  if (arcHandleDrag) {
    arcHandleDrag = null;
    updateShapePropPanel();  // 통합 패널 갱신
    return;
  }
  // Rev.10.9: select 외 도구에서 시작된 박스 선택 확정
  if (dragState && dragState.type === 'box' && dragState.fromOtherTool) {
    if (dragState.active) {
      // 실제로 5px 이상 드래그된 경우만 박스 선택 확정
      const p = getCanvasPoint(e);
      boxSelect(dragState.boxStart, p, e.shiftKey);
      preCtx.clearRect(0,0,baseW,baseH);
      window._lastBoxRect = null;
      updateShapePropPanel();  // Rev.14.5
      suppressNextClick = true; // click 이벤트 차단
    }
    // active=false였다면 도구의 일반 클릭으로 처리되도록 그냥 종료
    dragState = null;
    return;
  }
  if (tool !== 'select') return;
  const p = getCanvasPoint(e);
  if (dragState && dragState.type === 'box') {
    boxSelect(dragState.boxStart, p, e.shiftKey);
    preCtx.clearRect(0,0,baseW,baseH);
    window._lastBoxRect = null;
    updateShapePropPanel();  // Rev.14.5: 박스 선택 후에도 단일 선택이면 패널 표시
  } else if (dragState && dragState.type === 'move') {
    preCtx.clearRect(0,0,baseW,baseH);  // 스냅 표시 제거
    updateToolStatus();
    updateShapePropPanel();  // 이동 후 패널값 갱신
    // Rev.11.41: 실제로 움직였으면 히스토리 기록
    if (dragState.moved) { redoStack = []; pushHistory(); }
  } else if (dragState && dragState.type === 'movefill') {
    // Rev.16.0: 채움 이동 종료
    if (dragState.moved) { redoStack = []; pushHistory(); }
    suppressNextClick = true; // 드래그 후 click으로 선택 해제/외곽선 오작동 방지
  } else if (dragState && dragState.type === 'grip') {
    // Rev.11.12: 끝점 그립 드래그 종료
    preCtx.clearRect(0,0,baseW,baseH);
    redoStack = []; pushHistory();
    redrawDraw();
    updateToolStatus();
    updateShapePropPanel();
    suppressNextClick = true; // 드래그 후 click으로 인한 선택 해제 방지
  }
  dragState = null;
});

// Rev.10.9: 박스 선택 후 click 이벤트 중복 방지
let suppressNextClick = false;

drawCanvas.addEventListener('click', e => {
  // Rev.16.24: 필렛 방향 미리보기 중에는 click 무시 (mousedown에서 처리)
  if (filletPreview) return;
  // Rev.16.14: 쓸어 지우기 모드는 mousedown/up에서 처리하므로 click 무시
  if (swipeEraseMode) return;
  // Rev.16.11: 대각선 모드는 mousedown에서 처리하므로 click은 무시 (select 동작 방지)
  if (diagXMode) return;
  // Rev.10.9: 박스 선택 직후의 click 이벤트 무시
  if (suppressNextClick) {
    suppressNextClick = false;
    return;
  }
  // Rev.12.6: 거리두기 좌/우 선택 모드 (select 도구 상태에서 동작)
  if (offsetTwinPickMode) {
    const pOt = getCanvasPoint(e);
    if (handleOffsetTwinPickClick(pOt)) return;
  }
  // Rev.13.3: 베이스선 복제 모드 (select 도구 상태에서 동작)
  if (baseLineMode) {
    const pBl = getCanvasPoint(e);
    if (handleBaseLineClick(pBl)) return;
  }
  // Rev.16.46: 점 마우스 선택 모드
  if (penPickMode) {
    const pPk = getCanvasPoint(e);
    if (handlePenPickClick(pPk)) return;
  }
  if (tool === 'select') return;
  const p = getCanvasPoint(e);
  
  if (tool === 'fill') {
    doFillAtPoint(p);
    // Rev.16.1: 채움/외곽선 후 선택 모드로 전환 (연속 모드가 아니면)
    if (!continuousMode){
      fillAsOutline = false;
      const obtn = document.getElementById('headerBtnOutline');
      if (obtn) obtn.classList.remove('active');
      selectTool('select');
    }
    return;
  }
  
  if (tool === 'calib') {
    handleCalibClick(p);
    return;
  }
  
  if (tool === 'axis') {
    handleAxisClick(p);
    return;
  }
  
  // B안 편집 도구
  if (tool === 'trim') { handleTrimClick(p); return; }
  if (tool === 'extend') { handleExtendClick(p); return; }
  if (tool === 'fillet') { handleFilletClick(p); return; }
  if (tool === 'chamfer') { handleChamferClick(p); return; }
  if (tool === 'centerline') { handleCenterlineClick(p); return; }
  if (tool === 'tangent') { handleTangentClick(p); return; }
  if (tool === 'offset') { handleOffsetClick(p); return; }
  if (tool === 'break') { handleBreakClick(p); return; }
  if (tool === 'breakAtPoint') { handleBreakAtPointClick(p); return; }
  
  // E안 복사/변환
  if (tool === 'copy') { handleCopyClick(p); return; }
  if (tool === 'movetool') { handleMoveClick(p); return; }
  if (tool === 'rotate') { handleRotateClick(p); return; }
  if (tool === 'mirror') { handleMirrorClick(p); return; }
  if (tool === 'scale') { handleScaleClick(p); return; }
  
  // F안 그리기
  if (tool === 'polyline') { handlePolylineClick(p); return; }
  if (tool === 'ellipse') { handleEllipseClick(p); return; }
  if (tool === 'text') { handleTextClick(p); return; }
  if (polygonState) { handlePolygonClick(p); return; }
  if (arrayState && arrayState.phase === 'center') { handleArrayClick(p); return; }
  
  // 측정 (ID)
  if (idPickActive) { if (handleIdClick(p)) return; }
  
  // D안 치수 도구
  if (tool === 'dimLinear' || tool === 'dimAligned' || 
      tool === 'dimRadius' || tool === 'dimDiameter' || tool === 'dimAngle') {
    handleDimClick(p);
    return;
  }
  
  if (tool === 'arc') {
    if (!firstClick) {
      firstClick = {x: p.x, y: p.y};
      arcPath = [{x: p.x, y: p.y}];
    } else {
      // 2차 클릭: 마우스 경로와 가장 잘 맞는 배경 호 찾기
      addArcFromPath(firstClick, p, arcPath);
      firstClick = null;
      arcPath = [];
      preCtx.clearRect(0,0,baseW,baseH);
      // Rev.11.64: 호 1회 작도 후 선택 도구로 전환 (연속모드 제외)
      if (!continuousMode){
        backToSelectTool();
        document.getElementById('statusHint').textContent = '⌒ 호 1개 생성 완료 (선택 도구로 전환)';
      }
    }
    return;
  }
  
  if (!firstClick) {
    firstClick = {x: p.x, y: p.y};
  } else {
    addShape(firstClick, p);
    if (tool === 'line' && continuousMode) {
      firstClick = {x: p.x, y: p.y};
    } else {
      firstClick = null;
      preCtx.clearRect(0,0,baseW,baseH);
      // Rev.11.64: 작성 도구(선/사각형/원) 1회 작도 후 선택 도구로 자동 전환 (연속모드 제외)
      if (!continuousMode){
        const nm = (tool === 'line') ? '／ 선' : (tool === 'rect') ? '▭ 사각형' : (tool === 'circle') ? '○ 원' : '도형';
        backToSelectTool();
        document.getElementById('statusHint').textContent = `${nm} 1개 생성 완료 (선택 도구로 전환)`;
      }
    }
  }
});

drawCanvas.addEventListener('dblclick', e => {
  if (tool === 'polyline' && polylineState) {
    finishPolyline(false);
    return;
  }
  
  // 채움 영역 더블클릭 시 편집 모달 (선택/채움 도구에서)
  if ((tool === 'select' || tool === 'fill') && !fillAsOutline) {
    const p = getCanvasPoint(e);
    const f = hitTestFill(p);
    if (f) {
      openFillEditor(f);
      return;
    }
  }
  
  if (continuousMode && firstClick) {
    firstClick = null;
    preCtx.clearRect(0,0,baseW,baseH);
  }
});

let shiftDown = false;
window.addEventListener('keydown', e => {
  if (e.key === 'Shift') shiftDown = true;

  // 회전축 도구 + 첫 점 클릭된 상태에서 숫자 입력 = 거리 지정
  // (입력창에 포커스 있을 때는 동작 안 함)
  const focusInInput = document.activeElement &&
    (document.activeElement.tagName === 'INPUT' ||
     document.activeElement.tagName === 'TEXTAREA' ||
     document.activeElement.tagName === 'SELECT');
  if (tool === 'axis' && axisFirstPoint && !focusInInput && !e.ctrlKey && !e.altKey) {
    // 숫자, 소수점, 백스페이스
    if (/^[0-9.]$/.test(e.key)) {
      axisDistanceBuf += e.key;
      const v = parseFloat(axisDistanceBuf);
      if (isFinite(v) && v > 0) axisDistanceOverride = v;
      document.getElementById('statusHint').textContent =
        `🔄 회전축 거리 입력중: ${axisDistanceBuf}${calibSet ? 'mm' : 'px'} (Enter:확정, Esc:해제, BS:지움)`;
      e.preventDefault();
      return;
    }
    if (e.key === 'Backspace') {
      axisDistanceBuf = axisDistanceBuf.slice(0, -1);
      const v = parseFloat(axisDistanceBuf);
      axisDistanceOverride = (isFinite(v) && v > 0) ? v : null;
      document.getElementById('statusHint').textContent =
        `🔄 회전축 거리 입력중: ${axisDistanceBuf || '(없음)'} (Enter:확정, Esc:해제)`;
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter') {
      // 현재 마우스 위치 + 거리 강제 적용 즉시 확정
      if (axisDistanceOverride !== null && lastMousePoint) {
        handleAxisClick(lastMousePoint); // 내부에서 applyAxisConstraint로 거리 적용됨
      }
      e.preventDefault();
      return;
    }
  }

  if (e.key === 'Escape') {
    // Rev.12.6: 거리두기 좌/우 선택 모드 우선 취소
    if (offsetTwinPickMode){
      cancelOffsetTwinPick();
      document.getElementById('statusHint').textContent = '⫴ 거리두기 취소';
      return;
    }
    // Rev.13.3: 베이스선 복제 모드 종료
    if (baseLineMode){
      cancelBaseLineMode();
      document.getElementById('statusHint').textContent = '📋 베이스선 복제 종료';
      return;
    }
    // Rev.11.39: 이동(Grab) 모드 우선 취소 (원위치 복원)
    if (grabMode){
      exitGrabMode(false);
      document.getElementById('statusHint').textContent = '↔ 이동 취소 (원위치)';
      return;
    }
    // Rev.16.24: 필렛 방향 미리보기 취소
    if (filletPreview){
      cancelFilletPreview();
      return;
    }
    // Rev.16.14: 쓸어 지우기 모드 종료
    if (swipeEraseMode){
      exitSwipeEraseMode();
      document.getElementById('statusHint').textContent = '🧹 쓸어 지우기 종료';
      return;
    }
    // Rev.16.11: 대각선(교점) 모드 - 진행 중이면 선택만 취소, 비어있으면 모드 종료
    if (diagXMode){
      if (diagXPhase !== 0 || diagXStartPts.length || diagXEndPts.length || diagXDragging){
        cancelDiagX();
      } else {
        exitDiagXMode();
        document.getElementById('statusHint').textContent = '╲ 대각선 종료';
      }
      return;
    }
    // Rev.11.37: 분할 모드 우선 종료
    if (subdivideMode){
      exitSubdivideMode();
      document.getElementById('statusHint').textContent = '✂ 분할 취소';
      return;
    }
    // Rev.11.18: 점/연결 모드 우선 종료
    if (exitVertexModes()){
      document.getElementById('statusHint').textContent = '모드 종료';
      preCtx.clearRect(0,0,baseW,baseH);
      redrawDraw();
      return;
    }
    // 작도 시퀀스 중이면 그것만 취소, 아니면 선택 해제도 같이
    const hadDrawing = firstClick || axisFirstPoint || calibFirstPoint ||
      (typeof arcPath !== 'undefined' && arcPath.length > 0) ||
      filletState || offsetState || dimState ||
      endpointPickState || arcHandleDrag;
    firstClick = null; arcPath = []; dragState = null;
    calibFirstPoint = null; axisFirstPoint = null;
    axisDistanceOverride = null; axisDistanceBuf = '';
    endpointPickState = null;
    arcHandleDrag = null;
    filletState = null; offsetState = null; dimState = null; breakState = null;
    try { resetCopyTransformStates(); } catch(e) {}
    try { resetDrawingStates(); } catch(e) {}
    idPickActive = false;
    // Rev.10.11: 작도 시퀀스가 없었다면 선택도 해제
    if (!hadDrawing && selectedIds.size > 0) {
      selectedIds.clear();
      updateSelStat();
    }
    if (typeof closeMoveDeltaPanel === 'function') closeMoveDeltaPanel(); // Rev.11.14
    preCtx.clearRect(0,0,baseW,baseH);
    redrawDraw();
  } else if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
  else if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
  else if (e.ctrlKey && e.shiftKey && (e.key === 'e' || e.key === 'E')) {
    // Rev.11.13: Shift+Ctrl+E = 제자리 복제 (동일 좌표에 복제 후 드래그 이동 가능)
    e.preventDefault();
    duplicateInPlace();
  }
  else if (e.key === 'Delete' || e.key === 'Backspace') {
    // Rev.10.11: 도구 무관 - 선택된 도형이 있으면 삭제 (입력란에 포커스 있을 땐 제외)
    const inInput = document.activeElement &&
      (document.activeElement.tagName === 'INPUT' ||
       document.activeElement.tagName === 'TEXTAREA' ||
       document.activeElement.tagName === 'SELECT');
    if (!inInput && selectedIds.size > 0) {
      e.preventDefault();
      deleteSelected();
    }
  } else if (e.ctrlKey && (e.key === 'a' || e.key === 'A')) {
    // Rev.10.11: 도구 무관 Ctrl+A 전체 선택 (입력란 포커스 시 제외)
    const inInput = document.activeElement &&
      (document.activeElement.tagName === 'INPUT' ||
       document.activeElement.tagName === 'TEXTAREA');
    if (!inInput) {
      e.preventDefault();
      shapes.forEach(s => selectedIds.add(s.id));
      updateSelStat(); redrawDraw();
      document.getElementById('statusHint').textContent = `전체 선택: ${selectedIds.size}개 도형`;
    }
  } else if (e.ctrlKey && !e.shiftKey && (e.key === 'c' || e.key === 'C')) {
    // Rev.11.14: Ctrl+C 도형 복사 (입력란 포커스 시엔 일반 텍스트 복사 허용)
    const inInput = document.activeElement &&
      (document.activeElement.tagName === 'INPUT' ||
       document.activeElement.tagName === 'TEXTAREA');
    if (!inInput && selectedIds.size > 0) {
      e.preventDefault();
      copySelectedToClipboard();
    }
  } else if (e.ctrlKey && !e.shiftKey && (e.key === 'v' || e.key === 'V')) {
    // Rev.11.14: Ctrl+V 도형 붙여넣기 (입력란 포커스 시엔 일반 텍스트 붙여넣기 허용)
    const inInput = document.activeElement &&
      (document.activeElement.tagName === 'INPUT' ||
       document.activeElement.tagName === 'TEXTAREA');
    if (!inInput && clipboardShapes.length > 0) {
      e.preventDefault();
      pasteClipboard();
    }
  }
});
window.addEventListener('keyup', e => { if (e.key === 'Shift') shiftDown = false; });

function applyShiftConstraint(p1, p2) {
  if (!shiftDown || tool !== 'line') return p2;
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  if (Math.abs(dx) > Math.abs(dy)) return {x: p2.x, y: p1.y};
  return {x: p1.x, y: p2.y};
}

function addShape(p1, p2) {
  const _p2 = applyShiftConstraint(p1, p2);
  const newLine = {
    id: ++shapeIdSeq, type: tool,
    p1: {x:p1.x, y:p1.y}, p2: {x:_p2.x, y:_p2.y},
    stroke: document.getElementById('strokeColor').value,
    strokeWidth: parseInt(document.getElementById('strokeWidth').value)
  };
  shapes.push(newLine);
  redoStack = []; pushHistory();
  redrawDraw(); updateCount();
  // Rev.12.6: 거리두기는 더 이상 선 그리기 시 자동 생성하지 않음 (좌/우 선택 방식)
  // Rev.12.1: 일반 선(line) 그리기 직후 길이/각도/상대거리 팝업 (연속모드 제외)
  if (tool === 'line' && !continuousMode){
    const _id = newLine.id;
    setTimeout(() => openLineDimModal(_id), 0);
  }
}

// Rev.11.23: 거리두기 - 주어진 선의 좌우로 offsetTwinDist(mm) 만큼 평행선 생성
//   원본 포함 3개를 후보로 등록. 살릴 선 1개 클릭 → 나머지 삭제.
function makeOffsetTwins(srcLine){
  if (!srcLine || srcLine.type !== 'line') return;
  const distPx = offsetTwinDist / mmPerPixel; // mm → px
  if (distPx <= 0) return;
  const a = srcLine.p1, b = srcLine.p2;
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // 법선 단위벡터 (선에 수직)
  const nx = -dy / len, ny = dx / len;
  const stroke = srcLine.stroke;
  const sw = srcLine.strokeWidth;
  const mk = (sign) => {
    const ox = nx * distPx * sign, oy = ny * distPx * sign;
    const ln = {
      id: ++shapeIdSeq, type: 'line',
      p1: { x: a.x + ox, y: a.y + oy },
      p2: { x: b.x + ox, y: b.y + oy },
      stroke, strokeWidth: sw
    };
    shapes.push(ln);
    return ln.id;
  };
  // Rev.11.27: 좌(-) / 우(+) 평행선 2개를 원본과 함께 즉시 확정 (3개 모두 살림)
  mk(+1); mk(-1);
  offsetTwinCandidates = []; // 후보 개념 없음 (전부 확정)
  redoStack = []; pushHistory();
  redrawDraw(); updateCount();
  document.getElementById('statusHint').textContent =
    `⫴ 거리두기 ${offsetTwinDist}mm: 좌우 평행선 2개 + 원본 = 총 3개 선 생성 완료`;
}

// Rev.12.6: 거리두기(좌/우 선택) - 선의 한쪽(sign: +1=법선방향, -1=반대)으로만 평행선 1개 생성
//   nx,ny = (-dy/len, dx/len). 화면에서 sign=+1 은 진행방향 기준 왼쪽.
function makeOffsetTwinOneSide(srcLine, sign){
  if (!srcLine || srcLine.type !== 'line') return null;
  const distPx = offsetTwinDist / mmPerPixel; // mm → px
  if (distPx <= 0) return null;
  const a = srcLine.p1, b = srcLine.p2;
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len; // 법선 단위벡터
  const ox = nx * distPx * sign, oy = ny * distPx * sign;
  const ln = {
    id: ++shapeIdSeq, type: 'line',
    p1: { x: a.x + ox, y: a.y + oy },
    p2: { x: b.x + ox, y: b.y + oy },
    stroke: srcLine.stroke, strokeWidth: srcLine.strokeWidth
  };
  shapes.push(ln);
  redoStack = []; pushHistory();
  redrawDraw(); updateCount();
  return ln.id;
}

// Rev.12.6: 마우스 위치 p 가 선(srcLine)의 어느 쪽인지 부호 판정 (+1 / -1)
function offsetTwinSideSign(srcLine, p){
  const a = srcLine.p1, b = srcLine.p2;
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len; // 법선
  // 선 중점에서 마우스까지 벡터를 법선에 투영
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const proj = (p.x - mx) * nx + (p.y - my) * ny;
  return proj >= 0 ? +1 : -1;
}

// Rev.12.6: 거리두기 좌/우 선택 모드 시작
function startOffsetTwinPick(){
  offsetTwinPickMode = true;
  offsetTwinTarget = null;
  selectTool('select');
  drawCanvas.style.cursor = 'crosshair';
  document.getElementById('statusHint').textContent =
    `⫴ 거리두기(${offsetTwinDist}mm): 기준이 될 선을 클릭하세요`;
  updateOffsetTwinButton();
}

// Rev.12.6: 거리두기 좌/우 선택 모드 종료
function cancelOffsetTwinPick(){
  offsetTwinPickMode = false;
  offsetTwinTarget = null;
  preCtx.clearRect(0, 0, baseW, baseH);
  drawCanvas.style.cursor = 'default';
  updateOffsetTwinButton();
}

// Rev.12.6: 거리두기 모드의 클릭 처리. 처리했으면 true 반환
function handleOffsetTwinPickClick(p){
  if (!offsetTwinPickMode) return false;
  if (!offsetTwinTarget){
    // 1단계: 기준 선 선택
    const s = hitTest(p);   // hitTest는 도형 객체를 반환
    if (s && s.type === 'line'){
      offsetTwinTarget = s;
      document.getElementById('statusHint').textContent =
        `⫴ 거리두기(${offsetTwinDist}mm): 마우스를 선의 왼쪽/오른쪽으로 옮긴 뒤 클릭 (Esc=취소)`;
    } else {
      document.getElementById('statusHint').textContent =
        '⫴ 거리두기: 선(line)을 클릭하세요. (사각형/원 불가)';
    }
    return true;
  }
  // 2단계: 좌/우 방향 클릭 → 그 쪽에 평행선 1개 생성
  const sign = offsetTwinSideSign(offsetTwinTarget, p);
  const newId = makeOffsetTwinOneSide(offsetTwinTarget, sign);
  preCtx.clearRect(0, 0, baseW, baseH);
  document.getElementById('statusHint').textContent =
    newId ? `✓ 거리두기 완료: ${offsetTwinDist}mm 평행선 1개 생성` : '거리두기 실패';
  // 한 번 더 만들 수 있도록 대상은 유지(다른 쪽도 클릭 가능). 모드는 계속.
  return true;
}

// ===== Rev.13.3: 베이스선 복제 =====
// 선의 방향 판정: 가로('h') / 세로('v') / 기타('o')
function baseLineDetectOrient(ln){
  const dx = Math.abs(ln.p2.x - ln.p1.x);
  const dy = Math.abs(ln.p2.y - ln.p1.y);
  if (dx >= dy * 3) return 'h';   // 거의 수평
  if (dy >= dx * 3) return 'v';   // 거의 수직
  return 'o';
}

function startBaseLineMode(){
  baseLineMode = true;
  baseLineTarget = null;
  baseLineOrient = null;
  baseLineDir = null;
  selectTool('select');
  drawCanvas.style.cursor = 'crosshair';
  document.getElementById('headerBtnBaseLine')?.classList.add('active');
  closeBaseLinePop();
  document.getElementById('statusHint').textContent =
    '📋 베이스선 복제: 복제할 기준 선(가로/세로)을 클릭하세요 (Esc=종료)';
}

function cancelBaseLineMode(){
  baseLineMode = false;
  baseLineTarget = null;
  baseLineOrient = null;
  baseLineDir = null;
  preCtx.clearRect(0, 0, baseW, baseH);
  drawCanvas.style.cursor = 'default';
  document.getElementById('headerBtnBaseLine')?.classList.remove('active');
  closeBaseLinePop();
}

// 베이스선 모드 클릭 처리. 처리했으면 true
function handleBaseLineClick(p){
  if (!baseLineMode) return false;
  const s = findNearestLineForBase(p);   // 넓은 허용폭으로 가장 가까운 직선 탐색
  if (s){
    baseLineTarget = s;
    baseLineOrient = baseLineDetectOrient(s);
    // 미리보기 강조
    preCtx.clearRect(0,0,baseW,baseH);
    const Z = zoom || 1;
    preCtx.save();
    preCtx.strokeStyle = '#e67e22';
    preCtx.lineWidth = 3 / Z;
    preCtx.setLineDash([8/Z, 4/Z]);
    preCtx.beginPath(); preCtx.moveTo(s.p1.x, s.p1.y); preCtx.lineTo(s.p2.x, s.p2.y); preCtx.stroke();
    preCtx.restore();
    openBaseLinePop(s);
  } else {
    document.getElementById('statusHint').textContent =
      '📋 베이스선: 선(line) 근처를 클릭하세요. (사각형/원/호 불가)';
  }
  return true;
}

// 베이스선 모드 전용: 클릭점에서 가장 가까운 직선을 넓은 허용폭(화면 14px 환산)으로 탐색
function findNearestLineForBase(p){
  const Z = zoom || 1;
  const tolPx = 14 / Z;   // 화면상 약 14px → 월드좌표 환산
  let best = null, bestD = tolPx;
  for (const s of shapes){
    if (s.type !== 'line') continue;
    const d = pointToSegmentDist(p, s.p1, s.p2);
    if (d <= bestD){ bestD = d; best = s; }
  }
  return best;
}

// 클릭한 선의 X좌표(세로선 기준) 또는 Y좌표(가로선 기준) mm값 추정
function baseLineRefX(ln){ return ((ln.p1.x + ln.p2.x) / 2) * mmPerPixel; }
function baseLineRefY(ln){ return ((ln.p1.y + ln.p2.y) / 2) * mmPerPixel; }

function openBaseLinePop(ln){
  const orient = baseLineOrient;
  const typeEl = document.getElementById('baseLineType');
  typeEl.textContent = (orient === 'h') ? '(가로선 → 상/하)' :
                       (orient === 'v') ? '(세로선 → 좌/우)' : '(사선)';
  // 방향 버튼 활성/비활성: 가로선=상/하, 세로선=좌/우
  const allow = (orient === 'h') ? ['up','down'] : (orient === 'v') ? ['left','right'] : ['up','down','left','right'];
  document.querySelectorAll('.baseDirBtn').forEach(b => {
    const ok = allow.includes(b.dataset.dir);
    b.disabled = !ok;
    b.style.opacity = ok ? '1' : '0.3';
    b.style.cursor = ok ? 'pointer' : 'not-allowed';
  });
  // Rev.15.0: 거리두기 방향 버튼도 동일 규칙 (가로선=상/하, 세로선=좌/우)
  document.querySelectorAll('.baseOffDirBtn').forEach(b => {
    const ok = allow.includes(b.dataset.dir);
    b.disabled = !ok;
    b.style.opacity = ok ? '1' : '0.3';
    b.style.cursor = ok ? 'pointer' : 'not-allowed';
  });
  // 입력칸 초기화
  ['baseDist','baseSealCur','basePhi'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('baseSealOn').checked = false;
  document.getElementById('baseSealRow').style.display = 'none';
  document.getElementById('baseSealHint').style.display = 'none';
  document.getElementById('baseNormalRow').style.display = 'flex';
  document.getElementById('baseNormalRow').style.opacity = '1';   // 씰 모드 잔상 제거
  document.getElementById('baseDist').disabled = false;           // 거리칸 항상 활성화로 리셋
  // 씰 파이 토글은 세로선에서만 노출
  document.getElementById('baseSealWrap').style.display = (orient === 'v') ? 'block' : 'none';
  if (orient === 'v'){
    const xMm = baseLineRefX(ln);
    document.getElementById('baseSealCur').placeholder = `현재Ø(자동≈${(Math.abs(xMm)).toFixed(1)})`;
  }
  document.getElementById('basePreviewTxt').textContent = '';
  // 기본 방향 자동 선택 (가로=상, 세로=좌)
  baseLineSelectDir(orient === 'h' ? 'up' : orient === 'v' ? 'left' : 'up');
  // Rev.15.0: 거리두기 기본 방향 — 같은 축이되 베이스선 반대쪽 (가로선=하, 세로선=우)
  baseOffSelectDir(orient === 'h' ? 'down' : orient === 'v' ? 'right' : 'down');

  const pop = document.getElementById('baseLinePop');
  pop.style.display = 'block';
  const mx = (ln.p1.x + ln.p2.x)/2, my = (ln.p1.y + ln.p2.y)/2;
  const sc = worldToScreen(mx, my);
  const pw = pop.offsetWidth || 250, ph = pop.offsetHeight || 200;
  let left = sc.x + 16, top = sc.y + 16;
  if (left + pw > window.innerWidth - 8) left = sc.x - pw - 16;
  if (top + ph > window.innerHeight - 8) top = window.innerHeight - ph - 8;
  if (left < 8) left = 8;
  if (top < 8) top = 8;
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';
  const inp = document.getElementById('baseDist');
  setTimeout(() => { inp.focus(); inp.select(); }, 30);
  document.getElementById('statusHint').textContent =
    `📋 기준선 선택됨 ${typeEl.textContent} · 방향 선택 후 수치 입력 → Enter/생성 · Esc=종료`;
}

// 방향 버튼 선택 표시
function baseLineSelectDir(dir){
  baseLineDir = dir;
  document.querySelectorAll('.baseDirBtn').forEach(b => {
    const on = (b.dataset.dir === dir) && !b.disabled;
    b.style.background = on ? '#e67e22' : '#1f1f1f';
    b.style.color = on ? '#fff' : '#ccc';
    b.style.borderColor = on ? '#e67e22' : '#555';
  });
}

function closeBaseLinePop(){
  const pop = document.getElementById('baseLinePop');
  if (pop) pop.style.display = 'none';
}

// 기준선을 dxPx, dyPx 만큼 평행이동한 복제선 생성
// Rev.16.20: 복제선을 교차하는(수직방향) 베이스 선들 사이에 딱 맞게 길이 자동 조정
function baseLineMakeCopy(dxPx, dyPx){
  const ln = baseLineTarget;
  if (!ln) return false;
  let p1 = { x: ln.p1.x + dxPx, y: ln.p1.y + dyPx };
  let p2 = { x: ln.p2.x + dxPx, y: ln.p2.y + dyPx };

  // 복제선이 거의 수직/수평이면, 교차하는 반대축 선들 사이로 양끝을 맞춤 (체크 시)
  const fitChk = document.getElementById('baseFitLen');
  if (!fitChk || fitChk.checked){
    const fitted = fitLineToCrossingBase(p1, p2, ln.id);
    if (fitted){ p1 = fitted.p1; p2 = fitted.p2; }
  }

  const cp = {
    id: ++shapeIdSeq, type: 'line',
    p1, p2,
    stroke: ln.stroke,
    strokeWidth: ln.strokeWidth
  };
  if (ln.layer) cp.layer = ln.layer;
  if (ln.lineType) cp.lineType = ln.lineType;
  shapes.push(cp);
  redoStack = []; pushHistory();
  if (typeof redrawFills === 'function') redrawFills();
  redrawDraw(); updateCount();
  return cp.id;
}

// Rev.16.20: 거의 수직(세로)/수평(가로)인 선을, 그와 교차하는 반대축 선들 중
//   양 끝을 감싸는 가장 가까운 두 경계선에 닿도록 길이를 맞춤. 못 찾으면 null.
function fitLineToCrossingBase(p1, p2, excludeId){
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return null;
  const TOL = 2; // 방향 판정 허용(px)
  const isV = Math.abs(dx) <= TOL;  // 세로선
  const isH = Math.abs(dy) <= TOL;  // 가로선
  if (!isV && !isH) return null;    // 사선은 건드리지 않음

  if (isV){
    const x = (p1.x + p2.x)/2;
    const yMin = Math.min(p1.y, p2.y), yMax = Math.max(p1.y, p2.y);
    // 이 세로선의 x를 가로지르는 '가로선'들의 y 수집
    const ys = [];
    for (const s of shapes){
      if (s.type !== 'line' || s.id === excludeId) continue;
      const sdx = s.p2.x - s.p1.x, sdy = s.p2.y - s.p1.y;
      if (Math.abs(sdy) > TOL) continue;       // 가로선만
      const sx0 = Math.min(s.p1.x, s.p2.x), sx1 = Math.max(s.p1.x, s.p2.x);
      if (x < sx0 - 1 || x > sx1 + 1) continue; // x가 그 가로선 범위 안
      ys.push((s.p1.y + s.p2.y)/2);
    }
    if (ys.length < 2) return null;
    // 선 중심 기준 위/아래로 가장 가까운 경계
    const cy = (yMin + yMax)/2;
    const above = ys.filter(v => v <= cy).sort((a,b)=>b-a)[0];  // 위(작은 y) 중 가장 큰
    const below = ys.filter(v => v >= cy).sort((a,b)=>a-b)[0];  // 아래(큰 y) 중 가장 작은
    if (above === undefined || below === undefined) return null;
    return { p1:{x, y:above}, p2:{x, y:below} };
  } else {
    const y = (p1.y + p2.y)/2;
    const xMin = Math.min(p1.x, p2.x), xMax = Math.max(p1.x, p2.x);
    const xs = [];
    for (const s of shapes){
      if (s.type !== 'line' || s.id === excludeId) continue;
      const sdx = s.p2.x - s.p1.x, sdy = s.p2.y - s.p1.y;
      if (Math.abs(sdx) > TOL) continue;       // 세로선만
      const sy0 = Math.min(s.p1.y, s.p2.y), sy1 = Math.max(s.p1.y, s.p2.y);
      if (y < sy0 - 1 || y > sy1 + 1) continue;
      xs.push((s.p1.x + s.p2.x)/2);
    }
    if (xs.length < 2) return null;
    const cx = (xMin + xMax)/2;
    const left = xs.filter(v => v <= cx).sort((a,b)=>b-a)[0];
    const right = xs.filter(v => v >= cx).sort((a,b)=>a-b)[0];
    if (left === undefined || right === undefined) return null;
    return { p1:{x:left, y}, p2:{x:right, y} };
  }
}

// 통합 생성 처리 (선택된 방향 + 수치 / 씰 파이 모드)
function baseLineGenerate(){
  if (!baseLineTarget){ document.getElementById('statusHint').textContent = '📋 먼저 기준 선을 클릭하세요'; return; }
  const getVal = id => { const v = evalExpr(document.getElementById(id).value); return isFinite(v) ? v : null; };
  const sealOn = (baseLineOrient === 'v') && document.getElementById('baseSealOn').checked;
  let dxPx = 0, dyPx = 0, msg = '';

  if (sealOn){
    // 씰 파이 모드: 방향은 파이 대소로 자동 결정 (큰값=좌측)
    const phi = getVal('basePhi');
    if (phi === null){ document.getElementById('statusHint').textContent = '⚠ 목표 파이(Ø)를 입력하세요'; return; }
    let cur = getVal('baseSealCur');
    if (cur === null) cur = Math.abs(baseLineRefX(baseLineTarget));
    const radDiffMm = (phi - cur) / 2;
    if (Math.abs(radDiffMm) < 1e-6){ document.getElementById('statusHint').textContent = '⚠ 현재Ø와 목표Ø가 같습니다'; return; }
    const px = Math.abs(radDiffMm) / mmPerPixel;
    dxPx = (phi > cur) ? -px : +px;
    msg = `⌀ 씰 Ø${cur}→Ø${phi} → ${(phi>cur?'좌측':'우측')} ${Math.abs(radDiffMm).toFixed(2)}mm(반지름차) 세로선`;
  } else {
    const dir = baseLineDir;
    if (!dir){ document.getElementById('statusHint').textContent = '⚠ 방향(상/하/좌/우)을 선택하세요'; return; }
    const mm = getVal('baseDist');
    if (!(mm > 0)){ document.getElementById('statusHint').textContent = '⚠ 0보다 큰 거리(mm)를 입력하세요'; return; }
    const px = mm / mmPerPixel;
    if (dir === 'up')    { dyPx = -px; msg = `⬆ 상측 ${mm}mm 가로선`; }
    else if (dir==='down'){ dyPx = +px; msg = `⬇ 하측 ${mm}mm 가로선`; }
    else if (dir==='left'){ dxPx = -px; msg = `⬅ 좌측 ${mm}mm 세로선`; }
    else if (dir==='right'){ dxPx = +px; msg = `➡ 우측 ${mm}mm 세로선`; }
  }

  const id = baseLineMakeCopy(dxPx, dyPx);
  // 기준선 강조 다시 그리기
  const ln = baseLineTarget, Z = zoom || 1;
  preCtx.clearRect(0,0,baseW,baseH);
  preCtx.save();
  preCtx.strokeStyle = '#e67e22'; preCtx.lineWidth = 3/Z; preCtx.setLineDash([8/Z,4/Z]);
  preCtx.beginPath(); preCtx.moveTo(ln.p1.x, ln.p1.y); preCtx.lineTo(ln.p2.x, ln.p2.y); preCtx.stroke();
  preCtx.restore();
  document.getElementById('basePreviewTxt').textContent = id ? ('✓ ' + msg + ' 생성') : '생성 실패';
  document.getElementById('statusHint').textContent = id ? ('✓ ' + msg + ' 생성') : '생성 실패';
}

// Rev.14.9: 거리두기 방향 버튼 선택 (베이스선과 독립)
function baseOffSelectDir(dir){
  baseOffDir = dir;
  document.querySelectorAll('.baseOffDirBtn').forEach(b => {
    const on = (b.dataset.dir === dir) && !b.disabled;
    b.style.background = on ? '#9b59b6' : '#1f1f1f';
    b.style.color = on ? '#fff' : '#ccc';
    b.style.borderColor = on ? '#9b59b6' : '#6a4a7a';
  });
}

// Rev.14.9: 거리두기 생성 (클릭한 기준선에 직접, 자체 방향/거리 사용)
function baseOffGenerate(){
  if (!baseLineTarget){ document.getElementById('statusHint').textContent = '⫴ 먼저 기준 선을 클릭하세요'; return; }
  const dir = baseOffDir;
  if (!dir){ document.getElementById('statusHint').textContent = '⚠ 거리두기 방향(상/하/좌/우)을 선택하세요'; return; }
  const mm = parseFloat(document.getElementById('baseOffDist').value);
  if (!(mm > 0)){ document.getElementById('statusHint').textContent = '⚠ 0보다 큰 거리두기 거리(mm)를 입력하세요'; return; }
  const px = mm / mmPerPixel;
  let dxPx = 0, dyPx = 0, dirTxt = '';
  if (dir === 'up')    { dyPx = -px; dirTxt = '⬆ 상'; }
  else if (dir==='down'){ dyPx = +px; dirTxt = '⬇ 하'; }
  else if (dir==='left'){ dxPx = -px; dirTxt = '⬅ 좌'; }
  else if (dir==='right'){ dxPx = +px; dirTxt = '➡ 우'; }
  const id = baseLineMakeCopy(dxPx, dyPx);
  // 기준선 강조 다시 그리기
  const ln = baseLineTarget, Z = zoom || 1;
  preCtx.clearRect(0,0,baseW,baseH);
  preCtx.save();
  preCtx.strokeStyle = '#e67e22'; preCtx.lineWidth = 3/Z; preCtx.setLineDash([8/Z,4/Z]);
  preCtx.beginPath(); preCtx.moveTo(ln.p1.x, ln.p1.y); preCtx.lineTo(ln.p2.x, ln.p2.y); preCtx.stroke();
  preCtx.restore();
  const msg = `⫴ 거리두기 ${dirTxt} ${mm}mm 평행선`;
  document.getElementById('basePreviewTxt').textContent = id ? ('✓ ' + msg + ' 생성') : '생성 실패';
  document.getElementById('statusHint').textContent = id ? ('✓ ' + msg + ' 생성') : '생성 실패';
}

// Rev.12.6: 거리두기 좌/우 미리보기 (점선)
function drawOffsetTwinPreview(p){
  preCtx.clearRect(0, 0, baseW, baseH);
  if (!offsetTwinTarget) return;
  const sign = offsetTwinSideSign(offsetTwinTarget, p);
  const distPx = offsetTwinDist / mmPerPixel;
  const a = offsetTwinTarget.p1, b = offsetTwinTarget.p2;
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const ox = nx * distPx * sign, oy = ny * distPx * sign;
  preCtx.save();
  preCtx.strokeStyle = '#f39c12';
  preCtx.lineWidth = Math.max(1, (offsetTwinTarget.strokeWidth || 1));
  preCtx.setLineDash([6, 4]);
  preCtx.beginPath();
  preCtx.moveTo(a.x + ox, a.y + oy);
  preCtx.lin
