// ##### draw_tool_core2.js  Rev.19.19  최신본 — 지름별칭(지름=지)·줄이기(선단축)추가·라벨자동수정·두께버튼삭제·명령키보드방향순환·만남·절교/절각·점·선·지름·거리두기·연장·기준점·방향교점·각교점·호·=수식·이동 #####
// 이 파일은 draw_tool_core.js 다음에 로드되어야 합니다 (전역 변수/함수 공유).

// Rev.16.29: 한붓그리기 점번호 시스템
//   시작 X Y / START X Y → P0를 (X,Y)mm로 설정 (없으면 0,0=중앙)
//   우/좌/상/하 D        → 현재 점에서 D mm 이동하며 선, 끝점에 새 번호
//   도 A D / ANG A D     → 각도 A도(반시계,0=우) 방향 D mm
//   P3 우 50             → P3에서 분기 시작 후 이동
//   선 P1 P4 / LINK P1 P4→ 두 점 직접 연결
//   닫기 / CLOSE         → 현재 점에서 P0로 선 긋기
//   점초기화 / PRESET     → 점번호 시스템 리셋
// Rev.16.43: 한붓그리기 원점(0,0)을 화면 우측 하단(빨간점 ≈ 가로85%, 세로78%)
// Rev.16.76: 한붓그리기 원점 - 사용자가 마우스로 지정 가능. 미지정 시 기본(우하단)
let penOriginPx = null;          // {x,y} 픽셀좌표. null이면 기본값
let penAwaitOrigin = false;      // 시작 직후 원점 클릭 대기 상태
function penWorldOrigin(){ return penOriginPx || { x: baseW * 0.85, y: baseH * 0.78 }; }
// mm(위=+Y 도면좌표) → 픽셀(아래=+Y).
function penMmToPx(xmm, ymm){
  const o = penWorldOrigin();
  return { x: o.x + xmm/mmPerPixel, y: o.y - ymm/mmPerPixel };
}
function penPxToMm(px, py){
  const o = penWorldOrigin();
  return { x: (px - o.x)*mmPerPixel, y: -(py - o.y)*mmPerPixel };
}
// Rev.16.46: 가장 가까운 한붓그리기 점 찾기
function penFindNearestPoint(p){
  const tolPx = Math.max(12/(zoom||1), 1/mmPerPixel*0.3);
  let best=-1, bestD=Infinity;
  for (let i=0;i<penPoints.length;i++){ const pt=penPoints[i]; if(!pt)continue;
    const d=Math.hypot(pt.x-p.x,pt.y-p.y); if(d<tolPx&&d<bestD){bestD=d;best=i;} }
  return best;
}
// Rev.16.46/49: 점 선택 모드 클릭 처리 (점 위 클릭만, 빈 곳은 점 생성 안 함)
function handlePenPickClick(p){
  if (!penPickMode) return false;
  // Rev.16.76: 시작 직후 첫 클릭 = 원점(0,0) 설정
  if (penAwaitOrigin){
    penOriginPx = { x:p.x, y:p.y };
    penAwaitOrigin = false;
    const a = penAddPoint(p.x, p.y);   // 원점에 0번 점 생성
    penPickFirst = a; penCur = a;
    cmdLog(`◎ 원점(0,0) 설정 → P${a} (마우스)`,'user');
    redoStack=[]; pushHistory(); redrawDraw(); updateCount();
    document.getElementById('statusHint').textContent=`◎ 원점 P${a}=(0,0) 설정됨 · 여기서 우/좌/상/하로 이어그리기`;
    return true;
  }
  const idx = penFindNearestPoint(p);
  if (idx < 0){
    // 빈 곳 클릭은 점을 만들지 않음
    if (penConnectMode2){
      penConnectPrev = -1;   // Rev.19.14: 클릭연결 중 빈 곳 클릭 = 연결 끊고 새 시작 대기
      document.getElementById('statusHint').textContent='🔗 클릭연결: 빈 곳 클릭 — 연결 끊김. 점을 클릭해 새로 시작';
      return true;
    }
    document.getElementById('statusHint').textContent='빈 곳: 점 없음 (기준점은 「기준 X Y」 명령 사용)';
    return true;
  }
  // Rev.19.14: 클릭연결 모드 - 직전 클릭 점과 이번 클릭 점을 선으로 연결
  if (penConnectMode2){
    if (penConnectPrev >= 0 && penConnectPrev !== idx
        && penPoints[penConnectPrev] && penPoints[idx]){
      const a = penPoints[penConnectPrev], b = penPoints[idx];
      // 같은 선이 이미 있으면 중복 생성 안 함
      const tol = 1/mmPerPixel*0.05;
      const exists = shapes.some(s => s.type==='line' && s.p1 && s.p2 &&
        ((Math.hypot(s.p1.x-a.x,s.p1.y-a.y)<tol && Math.hypot(s.p2.x-b.x,s.p2.y-b.y)<tol) ||
         (Math.hypot(s.p1.x-b.x,s.p1.y-b.y)<tol && Math.hypot(s.p2.x-a.x,s.p2.y-a.y)<tol)));
      if (!exists){
        const sw = parseInt(document.getElementById('strokeWidth').value) || 1;
        const stroke = document.getElementById('strokeColor').value || '#ffffff';
        shapes.push({ id:++shapeIdSeq, type:'line', p1:{x:a.x,y:a.y}, p2:{x:b.x,y:b.y},
          stroke, strokeWidth:sw, layer:(currentLayer||'default') });
        redoStack=[]; pushHistory();
        document.getElementById('statusHint').textContent = `🔗 클릭연결: P${penConnectPrev} → P${idx} 선 생성 · 계속 다음 점 클릭`;
        cmdLog(`  🔗 클릭연결: P${penConnectPrev}–P${idx}`, 'system');
      } else {
        document.getElementById('statusHint').textContent = `🔗 P${penConnectPrev}–P${idx}는 이미 연결됨 · 다음 점 클릭`;
      }
      // 연결 후 이번 점을 다음 연결의 시작점으로 (연속 연결)
      penConnectPrev = idx; penCur = idx; penPickFirst = idx;
      redrawDraw(); updateCount();
      return true;
    }
    // 첫 점 선택 (연결 시작점)
    penConnectPrev = idx; penCur = idx; penPickFirst = idx;
    document.getElementById('statusHint').textContent = `🔗 클릭연결 시작점 P${idx} · 다음 점을 클릭하면 선 연결`;
    redrawDraw();
    return true;
  }
  // Rev.16.92: 마우스 클릭은 항상 그 점을 현재 기준점으로 선택만 (자동 선긋기 안 함, 연결은 「연결 1 4」 명령)
  penCur = idx; penPickFirst = idx;
  const m = penPxToMm(penPoints[idx].x, penPoints[idx].y);
  document.getElementById('statusHint').textContent = `▸ ${idx}번 점 선택됨 (${Math.round(m.x*10)/10}, ${Math.round(m.y*10)/10})mm · 여기서 우/좌/상/하·각 명령으로 작도`;
  redrawDraw();
  return true;
}

function penAddPoint(px, py){
  // Rev.16.34: 이미 같은 위치에 번호 점이 있으면 그 번호를 현재점으로 (중복 생성 방지)
  const tolPx = 1/mmPerPixel * 0.05;
  for (let i=0;i<penPoints.length;i++){
    if (!penPoints[i]) continue;   // Rev.19.2: 삭제된 점(undefined) 건너뛰기 — 크래시 방지
    if (Math.hypot(penPoints[i].x-px, penPoints[i].y-py) < tolPx){ penCur = i; return i; }
  }
  const idx = penPoints.length;
  penPoints.push({ x:px, y:py });
  penCur = idx;
  // 점 마커
  shapes.push({ id:++shapeIdSeq, type:'point', p1:{x:px,y:py}, stroke:'#16e0b0', strokeWidth:1, penIdx:idx });
  // 라벨 Pn
  const lbId = ++shapeIdSeq;
  shapes.push({ id:lbId, type:'text', pos:{x:px + 8/(zoom||1), y:py - 22/(zoom||1)}, text:''+idx, sizePx: 16/(zoom||1), stroke:'#16e0b0', layer:(currentLayer||'default'), penLabel:idx });
  penLabelIds[idx] = lbId;
  return idx;
}
// Rev.16.53: 기준점(앵커) 추가 - 점 마커 대신 큰 십자(+)로 표시. 번호는 동일하게 부여(이어그리기용).
//   '빈 공간 좌표만 선택' 용도. 이후 우/좌/상/하 등으로 여기서부터 이어그리기 가능.
function penAddAnchor(px, py){
  const tolPx = 1/mmPerPixel * 0.05;
  for (let i=0;i<penPoints.length;i++){
    if (!penPoints[i]) continue;   // Rev.19.2: 삭제된 점 건너뛰기
    if (Math.hypot(penPoints[i].x-px, penPoints[i].y-py) < tolPx){ penCur = i; return i; }
  }
  const idx = penPoints.length;
  penPoints.push({ x:px, y:py });
  penCur = idx;
  // 큰 십자 앵커 마커 (점이 아님을 구분: anchor=true, 노란색)
  shapes.push({ id:++shapeIdSeq, type:'point', p1:{x:px,y:py}, stroke:'#ffcc00', strokeWidth:1, penIdx:idx, anchor:true });
  // 라벨 Pn
  const lbId = ++shapeIdSeq;
  shapes.push({ id:lbId, type:'text', pos:{x:px + 8/(zoom||1), y:py - 22/(zoom||1)}, text:''+idx, sizePx: 16/(zoom||1), stroke:'#ffcc00', layer:(currentLayer||'default'), penLabel:idx });
  penLabelIds[idx] = lbId;
  return idx;
}
function penAddLine(x1,y1,x2,y2,noMerge){
  const sw = parseInt(document.getElementById('strokeWidth').value) || 1;
  const stroke = document.getElementById('strokeColor').value || '#ffffff';
  const tolPx = 1/mmPerPixel * 0.05;   // 0.05mm 이내 = 같은 위치로 간주
  const A = {x:x1,y:y1}, B = {x:x2,y:y2};
  const len = Math.hypot(B.x-A.x, B.y-A.y);
  if (len < 1e-6){ return null; }   // 길이 0 선 무시

  // Rev.16.91: 같은 직선 위에서 겹치거나 맞닿는 기존 선이 있으면 합쳐서 가장 긴 선 하나로.
  //   (짧은 선이 긴 선에 완전히 포함되는 경우 포함)
  const ux = (B.x-A.x)/len, uy = (B.y-A.y)/len;
  // 점 P가 새 선 직선(A기준 방향 u) 위에 있는지: 수직거리
  const perpDist = (P) => Math.abs((P.x-A.x)*uy - (P.y-A.y)*ux);
  // 점 P의 방향축 투영값 (A=0, B=len 기준)
  const proj = (P) => (P.x-A.x)*ux + (P.y-A.y)*uy;

  let merged = false;
  for (let i = shapes.length-1; !noMerge && i >= 0; i--){
    const s = shapes[i];
    if (s.type !== 'line') continue;
    // 공선 판정: 기존 선의 두 끝점이 새 선 직선 위(수직거리≈0) + 방향 평행
    if (perpDist(s.p1) > tolPx || perpDist(s.p2) > tolPx) continue;
    // 구간(투영값) 계산
    const tNewMin = 0, tNewMax = len;
    let tA = proj(s.p1), tB = proj(s.p2);
    const tOldMin = Math.min(tA,tB), tOldMax = Math.max(tA,tB);
    // 겹치거나 맞닿음? (끝이 닿는 것도 합침: tol 허용)
    const overlap = (tOldMin <= tNewMax + tolPx) && (tNewMin <= tOldMax + tolPx);
    if (!overlap) continue;
    // 합치기: 두 구간을 포함하는 최소~최대 지점
    const lo = Math.min(tNewMin, tOldMin), hi = Math.max(tNewMax, tOldMax);
    const np1 = { x:A.x + ux*lo, y:A.y + uy*lo };
    const np2 = { x:A.x + ux*hi, y:A.y + uy*hi };
    s.p1 = np1; s.p2 = np2;   // 기존 선을 합친 결과로 확장
    document.getElementById('statusHint').textContent = '↪ 같은 직선의 선과 합침 (긴 선 하나로 유지)';
    merged = true;
    penAutoIntersect(s);
    return s;
  }

  const newLine = { id:++shapeIdSeq, type:'line', p1:A, p2:B, stroke, strokeWidth:sw, layer:(currentLayer||'default') };
  shapes.push(newLine);
  // Rev.16.34: 새 선이 기존 선들과 만나는 교차점 자동 번호 부여
  penAutoIntersect(newLine);
  return newLine;
}
// Rev.16.34: 주어진 선과 기존 다른 선들의 교차점을 찾아 자동으로 번호 점 추가
function penAutoIntersect(newLine){
  const tolPx = 1/mmPerPixel * 0.05;  // 0.05mm 이내 중복 무시
  const dup = (x,y) => penPoints.some(p => p && Math.hypot(p.x-x, p.y-y) < tolPx);
  for (const s of shapes){
    if (s === newLine || s.type !== 'line' || !s.p1 || !s.p2) continue;
    const ix = lineSegmentIntersection(newLine.p1, newLine.p2, s.p1, s.p2);
    if (ix && !dup(ix.x, ix.y)){
      penAddPoint(ix.x, ix.y);  // 교점에 번호 부여
    }
  }
}
// Rev.16.54: 시작점 ox,oy 에서 단위방향 (ux,uy) 으로 나가는 반직선이 기존 선분들과 만나는
//   가장 가까운 교점 반환 (자기 시작점 제외). 없으면 null.
function penRayFirstHit(ox, oy, ux, uy, maxPx){
  let best=null, bestT=Infinity;
  const far = { x: ox + ux*maxPx, y: oy + uy*maxPx };
  for (const s of shapes){
    if (s.type !== 'line' || !s.p1 || !s.p2) continue;
    const ix = lineSegmentIntersection({x:ox,y:oy}, far, s.p1, s.p2);
    if (!ix) continue;
    const t = (ix.x-ox)*ux + (ix.y-oy)*uy;   // 시작점에서의 거리(부호)
    if (t > 1/mmPerPixel*0.05 && t < bestT){ bestT = t; best = {x:ix.x, y:ix.y}; }
  }
  return best;
}
// Rev.16.54: 중심(cx,cy) 반지름 r 원이 기존 선분들과 만나는 교점들을, startA에서 sweep방향으로
//   각도 순서로 정렬해 첫 교점 반환 (ccw=캔버스 반시계). 없으면 null.
function penArcFirstHit(cx, cy, r, startA, ccw){
  const hits = [];
  for (const s of shapes){
    if (s.type !== 'line' || !s.p1 || !s.p2) continue;
    const pts = circleSegmentIntersections(cx, cy, r, s.p1, s.p2);
    for (const p of pts) hits.push(p);
  }
  if (!hits.length) return null;
  // 시작각 기준으로 sweep 방향 진행량(0~2π) 계산해 최소인 것
  let best=null, bestSweep=Infinity;
  for (const h of hits){
    let a = Math.atan2(h.y-cy, h.x-cx);
    let sweep;
    if (!ccw){ sweep = a - startA; } else { sweep = startA - a; }
    while (sweep < 1e-6) sweep += Math.PI*2;   // 0 이하(시작점)는 한 바퀴로
    if (sweep < bestSweep){ bestSweep = sweep; best = {x:h.x, y:h.y, ang:a, sweep:sweep}; }
  }
  return best;
}
// Rev.16.54: 원(cx,cy,r)과 선분(p1,p2)의 교점들 반환 (0~2개)
function circleSegmentIntersections(cx, cy, r, p1, p2){
  const dx=p2.x-p1.x, dy=p2.y-p1.y;
  const fx=p1.x-cx, fy=p1.y-cy;
  const a=dx*dx+dy*dy, b=2*(fx*dx+fy*dy), c=fx*fx+fy*fy-r*r;
  let disc=b*b-4*a*c;
  if (disc < 0 || a < 1e-9) return [];
  disc=Math.sqrt(disc);
  const res=[];
  for (const t of [(-b-disc)/(2*a), (-b+disc)/(2*a)]){
    if (t >= -0.01 && t <= 1.01){ res.push({x:p1.x+t*dx, y:p1.y+t*dy}); }
  }
  return res;
}

function penFinish(msg){
  redoStack = []; pushHistory();
  if (typeof redrawFills === 'function') redrawFills();
  redrawDraw(); updateCount();
  cmdLog('  '+msg, 'system');
  document.getElementById('statusHint').textContent = msg;
}
function tryPenCommand(cmdStr){
  let toks = cmdStr.replace(/,/g,' ').split(/\s+/).filter(Boolean);
  toks = mergeExprTokens(toks);
  // Rev.19.19: '지름'을 '지'의 별칭으로 허용 (지름/Ø/diameter → 내부 '지')
  toks = toks.map(t => (t === '지름' || t === 'Ø' || t === 'ø' || (typeof t === 'string' && t.toUpperCase() === 'DIA')) ? '지' : t);
  if (!toks.length) return false;

  // Rev.16.76: 원점 클릭 대기 중 명령을 입력하면 기본 원점(우하단) 사용
  if (penAwaitOrigin){ penAwaitOrigin = false; }

  // 점번호 초기화
  if (toks[0] === '점초기화' || toks[0] === 'PRESET' || toks[0] === '리셋'){
    penPoints = []; penLabelIds = []; penCur = -1;
    document.getElementById('statusHint').textContent = '✎ 한붓그리기 점번호 초기화됨';
    cmdLog('  점번호 초기화', 'system');
    return true;
  }

  // Rev.16.35: 백 - 직전 작업 1회 취소 (undo)
  if (toks[0] === '백' || toks[0] === 'BACK' || toks[0] === 'UNDO'){
    if (typeof undo === 'function') undo();
    // 마지막 점이 사라졌으면 penCur/penPoints 동기화
    penSyncFromShapes();
    document.getElementById('statusHint').textContent = '↩ 백: 직전 작업 취소';
    cmdLog('  백(취소)', 'system');
    return true;
  }

  // Rev.19.17: 정리 N - 점과 N mm 이하의 짧은 선을 삭제 (N 생략 시 도구바 칸 값)
  if (toks[0] === '정리' || toks[0] === 'CLEANUP'){
    let tolMm;
    if (toks.length >= 2){
      tolMm = evalExpr(toks[1]);
      if (!isFinite(tolMm) || tolMm <= 0){
        document.getElementById('statusHint').textContent = '정리: 치수(mm)를 숫자로 입력하세요. 예: 정리 1'; return true;
      }
      // 도구바 칸도 동기화(다음 버튼 클릭 시 일관)
      const el = document.getElementById('cleanupTolInput'); if (el) el.value = tolMm;
    }
    if (typeof cleanupDrawing === 'function') cleanupDrawing(tolMm);
    penSyncFromShapes();   // 정리로 점이 사라졌을 수 있으니 동기화
    return true;
  }

  // Rev.16.60: 선택 상/하/좌/우 교점 - 현재점에서 그 방향 직진하다 첫 교점에 점만 찍고 선택 (선 없음)
  if ((toks[0] === '선택' || toks[0] === 'SEL' || toks[0] === 'SELECT')
      && ['상','하','좌','우','U','D','L','R'].includes(toks[1])
      && (toks[2] === '교점' || toks[2] === 'IX')){
    if (penCur < 0 || !penPoints[penCur]){
      document.getElementById('statusHint').textContent = '⚠ 먼저 점을 선택하세요 (점 5 또는 점 클릭)';
      return true;
    }
    const dir2 = toks[1];
    let ux=0, uy=0;
    if (dir2==='우'||dir2==='R') ux = 1;
    else if (dir2==='좌'||dir2==='L') ux = -1;
    else if (dir2==='상'||dir2==='U') uy = -1;   // 화면 위=Y감소
    else if (dir2==='하'||dir2==='D') uy = 1;
    const sp2 = penPoints[penCur];
    const maxPx = Math.hypot(baseW, baseH);
    const hit = penRayFirstHit(sp2.x, sp2.y, ux, uy, maxPx);
    if (!hit){ document.getElementById('statusHint').textContent = `${dir2} 방향에 만나는 선이 없습니다`; return true; }
    penAddPoint(hit.x, hit.y);   // 선 없이 점만
    penFinish(`▸ ${dir2} 교점 점 = ${penCur}번 선택 (선 없음)`);
    return true;
  }

  // Rev.16.38: 선택 N - 현재 점을 N번으로 이동 (이후 거기서 이어그리기)
  if ((toks[0] === '선택' || toks[0] === 'SEL' || toks[0] === 'SELECT') && toks.length >= 2){
    const idx = parsePenIdx(toks[1]);
    if (idx == null || !penPoints[idx]){
      document.getElementById('statusHint').textContent = `선택 실패: ${toks[1]}번 점이 없습니다`;
      return true;
    }
    penCur = idx;
    const m = penPxToMm(penPoints[idx].x, penPoints[idx].y);
    penFinish(`▸ 현재 점 = ${idx}번 (${Math.round(m.x*10)/10}, ${Math.round(m.y*10)/10})mm · 여기서 이어그리기`);
    return true;
  }

  // Rev.16.39: 삭제 - 삭제 1 2 (1-2 선 삭제) / 삭제 3 (3번 점 삭제)
  if (toks[0] === '삭제' || toks[0] === 'DEL' || toks[0] === 'DELETE' || toks[0] === 'ERASE'){
    if (toks.length >= 3 && parsePenIdx(toks[1]) != null && parsePenIdx(toks[2]) != null){
      // 선 삭제 (두 점이 끝점인 선)
      const i1 = parsePenIdx(toks[1]), i2 = parsePenIdx(toks[2]);
      const ln = penFindLineByEndpoints(i1, i2);
      if (!ln){ document.getElementById('statusHint').textContent = `삭제 실패: ${i1}-${i2} 선이 없음`; return true; }
      shapes = shapes.filter(s => s.id !== ln.id);
      penFinish(`🗑 ${i1}-${i2} 선 삭제`);
      return true;
    } else if (toks.length >= 2 && parsePenIdx(toks[1]) != null){
      // 점 삭제 (점 마커 + 라벨)
      const idx = parsePenIdx(toks[1]);
      if (!penPoints[idx]){ document.getElementById('statusHint').textContent = `삭제 실패: ${idx}번 점이 없음`; return true; }
      const removeIds = [];
      for (const s of shapes){
        if (s.type === 'point' && s.penIdx === idx) removeIds.push(s.id);
        if (s.type === 'text' && s.penLabel === idx) removeIds.push(s.id);
      }
      shapes = shapes.filter(s => !removeIds.includes(s.id));
      penPoints[idx] = undefined;  // 번호는 빈 자리로 둠 (다른 번호 안 밀림)
      penLabelIds[idx] = undefined;
      penFinish(`🗑 ${idx}번 점 삭제 (연결선은 유지)`);
      return true;
    }
    return false;
  }

  // Rev.16.39/43/52: 이동 - 점 새로 찍지 않고 기존 포인트 위치만 옮김
  //   이동 1 우 10  → 1번 점을 우 10mm
  //   이동 상 3     → 현재 선택점(penCur)을 상 3mm (번호 생략 시 현재점 대상)
  if (toks[0] === '이동' || toks[0] === 'MOVE'){
    let idx, mdir, mval;
    const dirSet = ['우','좌','상','하','R','L','U','D'];
    if (dirSet.includes(toks[1])){
      // 번호 생략: 현재 선택점 대상
      idx = penCur;
      mdir = toks[1]; mval = evalExpr(toks[2]);
      if (idx < 0 || !penPoints[idx]){
        document.getElementById('statusHint').textContent = '⚠ 먼저 점을 선택하세요 (점 5 또는 점 클릭) — 이동 상 3';
        return true;
      }
    } else {
      // 번호 지정
      idx = parsePenIdx(toks[1]);
      if (idx == null || !penPoints[idx]) return false;
      mdir = toks[2]; mval = evalExpr(toks[3]);
    }
    if (!dirSet.includes(mdir) || !isFinite(mval)) return false;
    const old = penPoints[idx];
    let ndx=0, ndy=0; const dpx = mval/mmPerPixel;
    if (mdir==='우'||mdir==='R') ndx = dpx;
    else if (mdir==='좌'||mdir==='L') ndx = -dpx;
    else if (mdir==='상'||mdir==='U') ndy = -dpx;
    else if (mdir==='하'||mdir==='D') ndy = dpx;
    const nx = old.x + ndx, ny = old.y + ndy;
    const tol = 1/mmPerPixel * 0.1;
    // 이 점에 연결된 선 끝점들도 함께 이동
    for (const s of shapes){
      if (s.type !== 'line' || !s.p1 || !s.p2) continue;
      if (Math.hypot(s.p1.x-old.x, s.p1.y-old.y) < tol){ s.p1.x = nx; s.p1.y = ny; }
      if (Math.hypot(s.p2.x-old.x, s.p2.y-old.y) < tol){ s.p2.x = nx; s.p2.y = ny; }
    }
    // 점 마커 + 라벨 갱신
    for (const s of shapes){
      if (s.type === 'point' && s.penIdx === idx){ s.p1.x = nx; s.p1.y = ny; }
    }
    penPoints[idx] = { x:nx, y:ny };
    penUpdateLabel(idx, nx, ny);
    penFinish(`✥ ${idx}번 점 ${mdir} ${mval}mm 이동`);
    return true;
  }

  // Rev.16.55: 호 명령 - 지정한 점을 중심으로 반지름 R 원호.
  //   호 2 3 시계 각 45  → P2 중심, 반지름3, 시계방향 45도
  //   호 2 3 시계 교점   → P2 중심, 반지름3, 시계방향으로 돌다 첫 교점까지
  //   방향: 시계/반시계 (CW/CCW). 기준점(현재점)↔중심(P2) 사이는 점선 보조선 표시.
  if (toks[0] === '호' || toks[0] === 'ARC'){
    const ci = parsePenIdx(toks[1]);
    if (ci == null || !penPoints[ci]){
      document.getElementById('statusHint').textContent = '⚠ 호: 중심 점 이름이 필요합니다 (예: 호 2 3 시계 각 45)';
      return true;
    }
    const R = evalExpr(toks[2]);
    if (!isFinite(R)) return false;
    const r = Math.abs(R) / mmPerPixel;   // 반지름(mm) → px
    const cx = penPoints[ci].x, cy = penPoints[ci].y;

    // 기준점(현재점)↔중심(P_ci) 점선 보조선 (서로 다른 점일 때만)
    const baseRef = (penCur >= 0 && penPoints[penCur] && penCur !== ci) ? penPoints[penCur] : null;
    if (baseRef){
      shapes.push({ id:++shapeIdSeq, type:'line', p1:{x:baseRef.x,y:baseRef.y}, p2:{x:cx,y:cy},
        stroke:'#ffcc00', strokeWidth:1, dashed:true, layer:(currentLayer||'default'), aux:true });
    }

    // 시작각: 직전 선의 끝 방향에서 이어서 (중심으로 들어온 선의 진행 방향)
    let startA = 0;
    let lastLine = null;
    for (let i=shapes.length-1;i>=0;i--){ const s=shapes[i]; if (s.type==='line' && !s.aux){ lastLine=s; break; } }
    const tol = 1/mmPerPixel*0.2;
    if (lastLine){
      let from=null, to=null;
      if (Math.hypot(lastLine.p2.x-cx,lastLine.p2.y-cy)<tol){ from=lastLine.p1; to=lastLine.p2; }
      else if (Math.hypot(lastLine.p1.x-cx,lastLine.p1.y-cy)<tol){ from=lastLine.p2; to=lastLine.p1; }
      if (from && to){ startA = Math.atan2(to.y-from.y, to.x-from.x); }
      else { startA = Math.atan2(lastLine.p2.y-lastLine.p1.y, lastLine.p2.x-lastLine.p1.x); }
    } else if (baseRef){
      // 직전 선이 없으면 기준점→중심 방향을 시작각으로
      startA = Math.atan2(cy-baseRef.y, cx-baseRef.x);
    }

    // 방향/끝조건 토큰: 호 2 3 시계 각 45  /  호 2 3 시계 교점
    const dirTok = toks[3];
    const isCW = (dirTok==='시계'||dirTok==='CW');
    const isCCW = (dirTok==='반시계'||dirTok==='CCW');
    if (!isCW && !isCCW){ document.getElementById('statusHint').textContent='호: 방향은 시계/반시계'; return true; }
    const ccw = isCCW;

    let isAngMode=false, sweepTok;
    if (toks[4] === '각' || toks[4] === 'ANG'){ isAngMode=true; sweepTok=toks[5]; }
    else { sweepTok=toks[4]; }   // 교점

    const startPt = { x: cx + Math.cos(startA)*r, y: cy + Math.sin(startA)*r };
    let endA;
    if (isAngMode){
      const sweepDeg = evalExpr(sweepTok);
      if (!isFinite(sweepDeg)) return false;
      const sweepRad = sweepDeg*Math.PI/180;
      endA = isCW ? (startA + sweepRad) : (startA - sweepRad);
    } else {
      if (sweepTok !== '교점' && sweepTok !== 'IX'){ document.getElementById('statusHint').textContent='호: 각 A 또는 교점'; return true; }
      const hit = penArcFirstHit(cx, cy, r, startA, ccw);
      if (!hit){ document.getElementById('statusHint').textContent='호: 만나는 교점이 없습니다'; return true; }
      endA = hit.ang;
    }
    const endPt = { x: cx + Math.cos(endA)*r, y: cy + Math.sin(endA)*r };
    const sw = parseInt(document.getElementById('strokeWidth').value) || 1;
    const stroke = document.getElementById('strokeColor').value || '#ffffff';
    shapes.push({ id:++shapeIdSeq, type:'arc', cx, cy, r,
      startAngle: startA, endAngle: endA, ccw,
      stroke, strokeWidth: sw, layer:(currentLayer||'default'),
      p1:{x:startPt.x,y:startPt.y}, p2:{x:endPt.x,y:endPt.y} });
    penAddPoint(endPt.x, endPt.y);   // 호 끝점에 번호
    penFinish(`⌒ 호 중심P${ci} 반지름${R} ${isCW?'시계':'반시계'} ${isAngMode?evalExpr(sweepTok)+'°':'교점까지'} → ${penCur}`);
    return true;
  }

  // Rev.16.31: 교점 번호 - 현재 모든 선의 교차점을 찾아 번호 부여
  // Rev.18.4: 라벨 명령 - 라벨이 없는 모든 점/도형 꼭짓점에 자동 번호 부여
  if (toks[0] === '라벨' || toks[0] === '번호' || toks[0] === 'LABEL'){
    const tolPx = 1/mmPerPixel*0.05;
    const isDup = (x,y) => penPoints.some(p => p && Math.hypot(p.x-x, p.y-y) < tolPx);
    const cands = [];   // {x,y} 후보 좌표 (중복 제거 후)
    const addCand = (x,y) => {
      if (!isFinite(x) || !isFinite(y)) return;
      if (isDup(x,y)) return;
      if (cands.some(c => Math.hypot(c.x-x, c.y-y) < tolPx)) return;
      cands.push({x,y});
    };
    // (i) shapes의 type='point' 도형 중 penIdx 없는 것 (이미 라벨이 있는 점은 제외)
    for (const s of shapes){
      if (s.type === 'point' && s.p1 && s.penIdx == null){
        addCand(s.p1.x, s.p1.y);
      }
    }
    // (ii) 도형 꼭짓점: 선·사각형·원·호 끝점
    for (const s of shapes){
      if (s.type === 'line' && s.p1 && s.p2){
        addCand(s.p1.x, s.p1.y); addCand(s.p2.x, s.p2.y);
      } else if (s.type === 'rect' && s.p1 && s.p2){
        const x1=Math.min(s.p1.x,s.p2.x), x2=Math.max(s.p1.x,s.p2.x);
        const y1=Math.min(s.p1.y,s.p2.y), y2=Math.max(s.p1.y,s.p2.y);
        addCand(x1,y1); addCand(x2,y1); addCand(x2,y2); addCand(x1,y2);
      } else if (s.type === 'circle' && s.p1 && s.p2){
        addCand(s.p1.x, s.p1.y);   // 중심
      } else if (s.type === 'arc' && typeof s.cx === 'number'){
        addCand(s.cx, s.cy);   // 중심
        if (s.startAngle != null && s.r != null){
          addCand(s.cx + Math.cos(s.startAngle)*s.r, s.cy + Math.sin(s.startAngle)*s.r);
        }
        if (s.endAngle != null && s.r != null){
          addCand(s.cx + Math.cos(s.endAngle)*s.r, s.cy + Math.sin(s.endAngle)*s.r);
        }
      } else if (s.type === 'polyline' && Array.isArray(s.points)){
        s.points.forEach(p => addCand(p.x, p.y));
      }
    }
    if (cands.length === 0){
      document.getElementById('statusHint').textContent = '🏷 라벨: 새로 부여할 곳이 없습니다 (모든 점·꼭짓점에 이미 라벨)';
      return true;
    }
    const first = penPoints.length;
    cands.forEach(c => penAddPoint(c.x, c.y));
    penFinish(`🏷 라벨 ${cands.length}개 자동 부여 (P${first}~P${penPoints.length-1})`);
    return true;
  }

  // Rev.18.5: 만남 - 두 선의 무한 직선 교점에 번호 부여 (선분 밖이어도 OK)
  //   ① 만남          → 선택된 두 선 사용 (두께 평행선처럼 번호없는 선도 가능)
  //   ② 만남 N M      → N번/M번이 끝점인 선분(또는 같은 위치 평행선) 자동 매칭
  //   주: 평행한 두 직선은 교점 없음 → 안내 메시지
  if (toks[0] === '만남' || toks[0] === 'MEET'){
    let L1=null, L2=null;
    // 인자 2개: 점번호 기반
    if (toks.length >= 3 && isFinite(evalExpr(toks[1])) && isFinite(evalExpr(toks[2]))){
      const ia = Math.round(evalExpr(toks[1]));
      const ib = Math.round(evalExpr(toks[2]));
      if (!penPoints[ia] || !penPoints[ib]){
        document.getElementById('statusHint').textContent = `만남: ${ia}/${ib}번 점 없음`; return true;
      }
      const pa = penPoints[ia], pb = penPoints[ib];
      const tolPx = 1/mmPerPixel * 0.05;
      // 두 점을 끝점으로 갖는 선 찾기
      const findLine = (p) => shapes.find(s => s.type==='line' && s.p1 && s.p2
        && (Math.hypot(s.p1.x-p.x, s.p1.y-p.y) < tolPx || Math.hypot(s.p2.x-p.x, s.p2.y-p.y) < tolPx));
      L1 = findLine(pa); L2 = findLine(pb);
      if (!L1 || !L2){
        document.getElementById('statusHint').textContent = `만남: ${ia}/${ib}번 점이 속한 선을 찾지 못함`; return true;
      }
      if (L1.id === L2.id){
        document.getElementById('statusHint').textContent = '만남: 두 점이 같은 선에 속함'; return true;
      }
    } else {
      // 인자 없음: 선택된 도형에서 line 2개
      const selLines = shapes.filter(s => s.type==='line' && s.p1 && s.p2 && selectedIds && selectedIds.has(s.id));
      if (selLines.length < 2){
        document.getElementById('statusHint').textContent = '만남: 선 2개를 먼저 선택하세요 (Shift+클릭으로 추가 선택)'; return true;
      }
      if (selLines.length > 2){
        document.getElementById('statusHint').textContent = `만남: 선이 ${selLines.length}개 선택됨 - 정확히 2개만 선택하세요`; return true;
      }
      L1 = selLines[0]; L2 = selLines[1];
    }
    // 무한 직선 교점 (선분 밖도 OK)
    const ix = lineLineIntersection(L1.p1, L1.p2, L2.p1, L2.p2);
    if (!ix){
      document.getElementById('statusHint').textContent = '만남: 두 선이 평행하여 교점이 없습니다'; return true;
    }
    // 중복 체크
    const tolPx = 1/mmPerPixel * 0.05;
    const dup = penPoints.findIndex(p => p && Math.hypot(p.x-ix.x, p.y-ix.y) < tolPx);
    if (dup >= 0){
      penCur = dup;
      document.getElementById('statusHint').textContent = `만남: 이미 ${dup}번 점이 그 위치에 있음 → 선택됨`;
      return true;
    }
    const idx = penAddPoint(ix.x, ix.y);
    penFinish(`✕ 만남: 두 선의 교점 = ${idx}번 (선분 밖이어도 무한 직선 기준)`);
    return true;
  }

  if (toks[0] === '교점' || toks[0] === 'INTERSECT' || toks[0] === 'IX'){
    const lines = shapes.filter(s => s.type === 'line' && s.p1 && s.p2);
    // Rev.16.93: 원/호도 교점 대상에 포함. 중심/반지름 추출
    const circs = [];
    for (const s of shapes){
      if (s.type === 'circle' && s.p1 && s.p2){
        circs.push({ cx:s.p1.x, cy:s.p1.y, r:Math.hypot(s.p2.x-s.p1.x, s.p2.y-s.p1.y), shape:s });
      } else if (s.type === 'arc' && typeof s.cx === 'number'){
        circs.push({ cx:s.cx, cy:s.cy, r:s.r, arc:true, a0:s.startAngle, a1:s.endAngle, shape:s });
      }
    }
    if (lines.length + circs.length < 2){
      document.getElementById('statusHint').textContent = '교점: 선/원이 2개 이상 필요합니다';
      return true;
    }
    const found = [];
    const isDup = (x,y) => found.some(p => Math.hypot(p.x-x, p.y-y) < 1/mmPerPixel*0.05)
                        || penPoints.some(p => p && Math.hypot(p.x-x, p.y-y) < 1/mmPerPixel*0.05);
    // 선분이 원 호 범위 안인지 (arc면 각도 체크, circle이면 항상 true)
    const onArc = (c, x, y) => {
      if (!c.arc) return true;
      let ang = Math.atan2(y-c.cy, x-c.cx);
      let a0=c.a0, a1=c.a1;
      if (a0==null||a1==null) return true;
      const norm = a => { while(a<0)a+=2*Math.PI; while(a>=2*Math.PI)a-=2*Math.PI; return a; };
      ang=norm(ang); a0=norm(a0); a1=norm(a1);
      if (a0<=a1) return ang>=a0-1e-3 && ang<=a1+1e-3;
      return ang>=a0-1e-3 || ang<=a1+1e-3;
    };
    // 선분-원 교점
    const lineCircleIx = (p1,p2,c) => {
      const dx=p2.x-p1.x, dy=p2.y-p1.y;
      const fx=p1.x-c.cx, fy=p1.y-c.cy;
      const A=dx*dx+dy*dy, B=2*(fx*dx+fy*dy), C=fx*fx+fy*fy-c.r*c.r;
      const disc=B*B-4*A*C;
      const res=[];
      if (disc<0 || A<1e-9) return res;
      const sq=Math.sqrt(disc);
      [(-B-sq)/(2*A), (-B+sq)/(2*A)].forEach(t => {
        if (t>=-1e-6 && t<=1+1e-6){   // 선분 범위 내
          const x=p1.x+t*dx, y=p1.y+t*dy;
          if (onArc(c,x,y)) res.push({x,y});
        }
      });
      return res;
    };
    // 원-원 교점
    const circleCircleIx = (c1,c2) => {
      const d=Math.hypot(c2.cx-c1.cx, c2.cy-c1.cy);
      const res=[];
      if (d<1e-6 || d>c1.r+c2.r || d<Math.abs(c1.r-c2.r)) return res;
      const a=(c1.r*c1.r-c2.r*c2.r+d*d)/(2*d);
      const h2=c1.r*c1.r-a*a; if (h2<0) return res;
      const h=Math.sqrt(h2);
      const xm=c1.cx+a*(c2.cx-c1.cx)/d, ym=c1.cy+a*(c2.cy-c1.cy)/d;
      const rx=-(c2.cy-c1.cy)/d*h, ry=(c2.cx-c1.cx)/d*h;
      [[xm+rx,ym+ry],[xm-rx,ym-ry]].forEach(([x,y])=>{ if(onArc(c1,x,y)&&onArc(c2,x,y)) res.push({x,y}); });
      return res;
    };
    // 선-선
    for (let i=0;i<lines.length;i++) for (let j=i+1;j<lines.length;j++){
      const ix = lineSegmentIntersection(lines[i].p1, lines[i].p2, lines[j].p1, lines[j].p2);
      if (ix && !isDup(ix.x, ix.y)) found.push({x:ix.x, y:ix.y});
    }
    // 선-원
    for (const ln of lines) for (const c of circs){
      lineCircleIx(ln.p1, ln.p2, c).forEach(p => { if(!isDup(p.x,p.y)) found.push(p); });
    }
    // 원-원
    for (let i=0;i<circs.length;i++) for (let j=i+1;j<circs.length;j++){
      circleCircleIx(circs[i], circs[j]).forEach(p => { if(!isDup(p.x,p.y)) found.push(p); });
    }
    if (found.length === 0){
      document.getElementById('statusHint').textContent = '교점: 새로운 교차점이 없습니다';
      return true;
    }
    const first = penPoints.length;
    found.forEach(p => penAddPoint(p.x, p.y));
    penFinish(`✕ 교점 ${found.length}개에 번호 부여 (선·원 포함, ${first}~${penPoints.length-1})`);
    return true;
  }

  // Rev.16.70: 선 상 3.7 - 현재점에서 방향으로 거리만큼 선 긋기 (접두 없는 '상 3.7'과 동일, 일관된 이름)
  if (toks[0] === '선' && ['상','하','좌','우','U','D','L','R'].includes(toks[1])
      && toks[2] !== '지' && toks[2] !== '교점' && isFinite(evalExpr(toks[2]))){
    if (penCur < 0 || !penPoints[penCur]){
      document.getElementById('statusHint').textContent = '⚠ 먼저 점을 선택하세요 (점 5 또는 점 클릭)'; return true;
    }
    const sdir = toks[1];
    const sdist = evalExpr(toks[2]);
    if (!isFinite(sdist)) return false;
    const base = penPoints[penCur]; const dpx = sdist/mmPerPixel;
    let nx=base.x, ny=base.y;
    if (sdir==='우'||sdir==='R') nx+=dpx;
    else if (sdir==='좌'||sdir==='L') nx-=dpx;
    else if (sdir==='상'||sdir==='U') ny-=dpx;   // 화면 위=Y감소
    else if (sdir==='하'||sdir==='D') ny+=dpx;
    penAddLine(base.x, base.y, nx, ny);
    penAddPoint(nx, ny);
    penFinish(`✎ ${penCur}번 → 선 ${sdir} ${sdist}mm → ${penCur}`);
    return true;
  }

  // Rev.16.69: 선 좌 지 110 130 - 현재점에서 (130-110)/2 만큼 방향으로 선 긋기 (기존 '좌 지'와 동일, 직관적 이름)
  if (toks[0] === '선' && ['상','하','좌','우','U','D','L','R'].includes(toks[1]) && toks[2] === '지'){
    if (penCur < 0 || !penPoints[penCur]){
      document.getElementById('statusHint').textContent = '⚠ 먼저 점을 선택하세요 (점 5 또는 점 클릭)'; return true;
    }
    const sdir = toks[1];
    const d1 = evalExpr(toks[3]), d2 = evalExpr(toks[4]);
    if (!isFinite(d1) || !isFinite(d2)) return false;
    const moveMm = Math.abs(d2 - d1) / 2;
    const base = penPoints[penCur]; const dpx = moveMm/mmPerPixel;
    let nx=base.x, ny=base.y;
    if (sdir==='우'||sdir==='R') nx+=dpx;
    else if (sdir==='좌'||sdir==='L') nx-=dpx;
    else if (sdir==='상'||sdir==='U') ny-=dpx;
    else if (sdir==='하'||sdir==='D') ny+=dpx;
    penAddLine(base.x, base.y, nx, ny);
    penAddPoint(nx, ny);
    penFinish(`✎ ${penCur}번 → 선 ${sdir} 지름 ${d1}→${d2} = ${moveMm}mm → ${penCur}`);
    return true;
  }

  // Rev.16.51: 점 좌 지 110 130 - 현재 선택점에서 (130-110)/2 만큼 방향으로 떨어진 곳에 점만 찍기
  if (toks[0] === '점' && ['상','하','좌','우','U','D','L','R'].includes(toks[1]) && toks[2] === '지'){
    if (penCur < 0 || !penPoints[penCur]){
      document.getElementById('statusHint').textContent = '⚠ 먼저 점을 선택하세요 (점 5 또는 점 클릭)'; return true;
    }
    const pdir = toks[1];
    const d1 = evalExpr(toks[3]), d2 = evalExpr(toks[4]);
    if (!isFinite(d1) || !isFinite(d2)) return false;
    const moveMm = Math.abs(d2 - d1) / 2;
    const base = penPoints[penCur]; const dpx = moveMm/mmPerPixel;
    let nx=base.x, ny=base.y;
    if (pdir==='우'||pdir==='R') nx+=dpx;
    else if (pdir==='좌'||pdir==='L') nx-=dpx;
    else if (pdir==='상'||pdir==='U') ny-=dpx;
    else if (pdir==='하'||pdir==='D') ny+=dpx;
    penAddPoint(nx, ny);
    penFinish(`• ${penCur}번 점 = ${pdir} 지름 ${d1}→${d2} = ${moveMm}mm (독립 점)`);
    return true;
  }

  // Rev.16.67: 선 좌 교점 - 그 방향으로 직진해 첫 교점까지 선 긋기 (기존 '좌 교점'과 동일, 직관적 이름)
  if (toks[0] === '선' && ['상','하','좌','우','U','D','L','R'].includes(toks[1])
      && (toks[2] === '교점' || toks[2] === 'IX')){
    if (penCur < 0 || !penPoints[penCur]){
      document.getElementById('statusHint').textContent = '⚠ 먼저 점을 선택하세요 (점 5 또는 점 클릭)'; return true;
    }
    const d = toks[1];
    let ux=0, uy=0;
    if (d==='우'||d==='R') ux=1; else if (d==='좌'||d==='L') ux=-1;
    else if (d==='상'||d==='U') uy=-1; else if (d==='하'||d==='D') uy=1;
    const sp2 = penPoints[penCur];
    const maxPx = Math.hypot(baseW, baseH);
    const hit = penRayFirstHit(sp2.x, sp2.y, ux, uy, maxPx);
    if (!hit){ document.getElementById('statusHint').textContent = `${d} 방향에 만나는 선이 없습니다`; return true; }
    penAddLine(sp2.x, sp2.y, hit.x, hit.y);
    penAddPoint(hit.x, hit.y);
    penFinish(`✎ ${penCur}번 → 선 ${d} 교점까지 → ${penCur}`);
    return true;
  }

  // Rev.16.67: 점 좌 교점 - 그 방향으로 직진해 첫 교점에 점만 찍고 선택 (기존 '선택 좌 교점'과 동일)
  if (toks[0] === '점' && ['상','하','좌','우','U','D','L','R'].includes(toks[1])
      && (toks[2] === '교점' || toks[2] === 'IX')){
    if (penCur < 0 || !penPoints[penCur]){
      document.getElementById('statusHint').textContent = '⚠ 먼저 점을 선택하세요 (점 5 또는 점 클릭)'; return true;
    }
    const d = toks[1];
    let ux=0, uy=0;
    if (d==='우'||d==='R') ux=1; else if (d==='좌'||d==='L') ux=-1;
    else if (d==='상'||d==='U') uy=-1; else if (d==='하'||d==='D') uy=1;
    const sp2 = penPoints[penCur];
    const maxPx = Math.hypot(baseW, baseH);
    const hit = penRayFirstHit(sp2.x, sp2.y, ux, uy, maxPx);
    if (!hit){ document.getElementById('statusHint').textContent = `${d} 방향에 만나는 선이 없습니다`; return true; }
    penAddPoint(hit.x, hit.y);   // 선 없이 점만
    penFinish(`▸ ${d} 교점 점 = ${penCur}번 선택 (선 없음)`);
    return true;
  }

  // Rev.19.15: 점 [방향 거리]... - 현재 선택점에서 방향+거리 쌍을 여러 개 누적 이동한 곳에 점 찍기
  //   점 상 2.5        → 위 2.5mm
  //   점 우 3 좌 3      → 우 3 + 좌 3 누적 (= 제자리 X, 실은 우3후 좌3) ※ X/Y 분리 입력
  //   점 우 3 하 5      → 우 3, 아래 5 (대각 위치)
  //   ※ '지'(지름) 명령과 충돌 방지: toks[2]가 '지'면 이 블록은 건너뜀(아래 지름 블록에서 처리)
  if (toks[0] === '점' && toks.length >= 3
      && ['상','하','좌','우','U','D','L','R'].includes(toks[1])
      && toks[2] !== '지'){
    if (penCur < 0 || !penPoints[penCur]){
      document.getElementById('statusHint').textContent = '⚠ 먼저 점을 선택하세요 (점 5 또는 점 클릭)'; return true;
    }
    const base = penPoints[penCur];
    let nx = base.x, ny = base.y;
    const applied = [];   // 적용된 (방향, 거리) 기록
    // toks[1]부터 [방향, 거리] 쌍을 순서대로 처리
    let i = 1;
    while (i < toks.length){
      const dir = toks[i];
      if (!['상','하','좌','우','U','D','L','R'].includes(dir)){
        document.getElementById('statusHint').textContent = `⚠ 점: '${dir}'는 방향이 아닙니다 (상/하/좌/우)`; return true;
      }
      const dist = evalExpr(toks[i+1]);
      if (!isFinite(dist)){
        document.getElementById('statusHint').textContent = `⚠ 점: '${dir}' 다음에 거리(mm)가 필요합니다`; return true;
      }
      const dpx = dist / mmPerPixel;
      if (dir==='우'||dir==='R') nx += dpx;
      else if (dir==='좌'||dir==='L') nx -= dpx;
      else if (dir==='상'||dir==='U') ny -= dpx;
      else if (dir==='하'||dir==='D') ny += dpx;
      applied.push(`${dir}${dist}`);
      i += 2;
    }
    const newIdx = penAddPoint(nx, ny);
    penFinish(`• P${newIdx} = 이전점에서 ${applied.join(' ')} 이동 (독립 점)`);
    return true;
  }

  // Rev.16.47: 점 N (인자 1개) - N이 기존 점번호면 그 점을 현재점으로 선택
  if (toks[0] === '점' && toks.length === 2){
    const n = parsePenIdx(toks[1]);
    if (n != null && penPoints[n]){
      penCur = n; penPickFirst = n;
      const m = penPxToMm(penPoints[n].x, penPoints[n].y);
      penFinish(`▸ ${n}번 점 선택 (${Math.round(m.x*10)/10}, ${Math.round(m.y*10)/10})mm`);
      return true;
    }
    const xv = evalExpr(toks[1]); if (!isFinite(xv)) return false;
    let yv = 0;
    if (penCur >= 0 && penPoints[penCur]) yv = penPxToMm(penPoints[penCur].x, penPoints[penCur].y).y;
    const p = penMmToPx(xv, yv);
    penAddPoint(p.x, p.y);
    penFinish(`• ${penCur}번 점 = (${xv}, ${yv})mm`);
    return true;
  }

  // Rev.16.32: 좌표 점 찍기 - 점 X,Y  (0,0=중앙, 위=+Y)
  if (toks[0] === '점' && toks.length >= 3){
    const xmm = evalExpr(toks[1]), ymm = evalExpr(toks[2]);
    if (!isFinite(xmm) || !isFinite(ymm)) return false;
    const p = penMmToPx(xmm, ymm);
    penAddPoint(p.x, p.y);
    penFinish(`• ${penCur}번 점 = (${xmm}, ${ymm})mm`);
    return true;
  }

  // Rev.16.43: 씰 점 명령 제거

  // Rev.16.33: 연결 1 2  (1번과 2번 직선 연결, 공백 구분 / '선'도 동일)
  if (toks[0] === '연결' || toks[0] === '선' || toks[0] === 'LINK'){
    if (toks.length < 3) return false;
    const i1 = parsePenIdx(toks[1]), i2 = parsePenIdx(toks[2]);
    if (i1 == null || i2 == null || !penPoints[i1] || !penPoints[i2]) return false;
    penAddLine(penPoints[i1].x, penPoints[i1].y, penPoints[i2].x, penPoints[i2].y);
    penCur = i2;
    penFinish(`／ ${i1}-${i2} 연결`);
    return true;
  }

  // Rev.16.32: 필렛 - 알 3 0.1  (3번 교점에 지름 0.1 필렛)
  if ((toks[0] === '알' || toks[0] === 'FILLET' || toks[0] === 'R') && toks.length >= 3){
    const idx = parsePenIdx(toks[1]);
    const dia = evalExpr(toks[2]);
    if (idx == null || !penPoints[idx] || !isFinite(dia) || dia <= 0) return false;
    const ok = penFilletAtPoint(penPoints[idx], dia);
    if (!ok){ document.getElementById('statusHint').textContent = `필렛 실패: ${idx}번에서 만나는 두 선을 못 찾음`; return true; }
    penFinish(`◜ ${idx}번 교점 Ø${dia} 필렛`);
    return true;
  }

  // Rev.16.37: 모따기 - 모따기 10 0.5  (10번 교점에 C=0.5 모따기, 기존 챔퍼와 동일)
  if ((toks[0] === '모따기' || toks[0] === 'CHAMFER' || toks[0] === 'CHA') && toks.length >= 3){
    const idx = parsePenIdx(toks[1]);
    const c = evalExpr(toks[2]);
    if (idx == null || !penPoints[idx] || !isFinite(c) || c <= 0) return false;
    const ok = penChamferAtPoint(penPoints[idx], c);
    if (!ok){ document.getElementById('statusHint').textContent = `모따기 실패: ${idx}번에서 만나는 두 선을 못 찾음`; return true; }
    penFinish(`╱ ${idx}번 교점 C${c} 모따기`);
    return true;
  }

  // Rev.16.65: 절교(절대교점) - 절교 3 4 x0 / 절교 3 4 y3 (대소문자 무관)
  //   절교 3 4 x0  → 3→4 방향 직선을 X=0 좌표까지 연장 (선 없으면 새 선 생성)
  //   치수 불명확하고 어디까지 그을지 절대좌표로 지정할 때.
  // Rev.16.80: 절교 1 하 수평 0 - 1번에서 방향(상/하/좌/우)으로 직선을 긋고,
  //   0번 점을 지나는 수평선(또는 수직선)과 만나는 지점까지. (점+방향+수평/수직+기준점번호)
  if (toks[0] === '절교' && parsePenIdx(toks[1]) != null
      && ['상','하','좌','우','U','D','L','R'].includes(toks[2])){
    const si = parsePenIdx(toks[1]);
    if (!penPoints[si]){ document.getElementById('statusHint').textContent=`절교: ${toks[1]}번 점이 없습니다`; return true; }
    const d = toks[2];
    let ux=0, uy=0;
    if (d==='우'||d==='R') ux=1; else if (d==='좌'||d==='L') ux=-1;
    else if (d==='상'||d==='U') uy=-1; else if (d==='하'||d==='D') uy=1;   // 화면 위=Y감소
    const refIdx = parsePenIdx((toks[4]||'').replace(/^점/,''));
    if (refIdx == null || !penPoints[refIdx]){
      document.getElementById('statusHint').textContent = '절교: 절교 1 하 수평 0 형식 (점+방향+수평/수직+기준점)';
      return true;
    }
    const T = penPoints[refIdx], S = penPoints[si];
    const isVert = (toks[3]==='수직' || (toks[3]||'').toUpperCase()==='V');
    const isHoriz = (toks[3]==='수평' || (toks[3]||'').toUpperCase()==='H');
    let nx, ny, lbl;
    if (isHoriz){
      // 기준점의 수평선(Y=T.y)과 방향선의 교점
      if (Math.abs(uy) < 1e-6){ document.getElementById('statusHint').textContent='절교: 좌/우 방향은 수평선과 안 만남(평행)'; return true; }
      const t = (T.y - S.y) / uy;
      nx = S.x + ux*t; ny = S.y + uy*t; lbl = `${d}→점${refIdx} 수평선`;
    } else if (isVert){
      // 기준점의 수직선(X=T.x)과 방향선의 교점
      if (Math.abs(ux) < 1e-6){ document.getElementById('statusHint').textContent='절교: 상/하 방향은 수직선과 안 만남(평행)'; return true; }
      const t = (T.x - S.x) / ux;
      nx = S.x + ux*t; ny = S.y + uy*t; lbl = `${d}→점${refIdx} 수직선`;
    } else {
      document.getElementById('statusHint').textContent = '절교: 수평 또는 수직을 지정하세요 (절교 1 하 수평 0)';
      return true;
    }
    penAddLine(S.x, S.y, nx, ny);
    const ne = penAddPoint(nx, ny);
    penFinish(`↦ P${si} ${lbl}까지 연장 → P${ne}`);
    return true;
  }

  if (toks[0] === '절교' && parsePenIdx(toks[1]) != null && parsePenIdx(toks[2]) != null){
    const i1 = parsePenIdx(toks[1]), i2 = parsePenIdx(toks[2]);
    if (!penPoints[i1] || !penPoints[i2]) return false;
    const a = penPoints[i1], b = penPoints[i2];
    const len = Math.hypot(b.x-a.x, b.y-a.y);
    if (len < 1e-6) return true;
    const ux = (b.x-a.x)/len, uy = (b.y-a.y)/len;
    let nx, ny, jgLabel;
    // Rev.16.74: 절교 9 10 3 y - 9→10 선을 3번 점의 Y(또는 X)좌표까지 연장
    //   toks[3]=기준 점번호, toks[4]=축(x/y). 축 생략 시 점을 연장선에 수직투영(기존 동작).
    const refIdx = parsePenIdx((toks[3]||'').replace(/^점/,''));   // '점3','3','P3' 모두 번호 추출
    if (refIdx == null || !penPoints[refIdx]){
      document.getElementById('statusHint').textContent = '절교: 절교 9 10 3 수직 형식 (기준 점번호 + 수평/수직)';
      return true;
    }
    const T = penPoints[refIdx];
    const axisTok = (toks[4]||'').toUpperCase();
    const isVert = (toks[4]==='수직' || axisTok==='V');
    const isHoriz = (toks[4]==='수평' || axisTok==='H');
    if (isVert){
      // 3번 점을 지나는 수직선(세로선, X=T.x)과 9-10 연장선의 교점
      if (Math.abs(ux) < 1e-6){ document.getElementById('statusHint').textContent='절교: 세로 연장선은 수직선과 안 만남(평행)'; return true; }
      const t = (T.x - b.x) / ux;
      nx = b.x + ux*t; ny = b.y + uy*t; jgLabel = `점${refIdx} 수직선`;
    } else if (isHoriz){
      // 3번 점을 지나는 수평선(가로선, Y=T.y)과 9-10 연장선의 교점
      if (Math.abs(uy) < 1e-6){ document.getElementById('statusHint').textContent='절교: 가로 연장선은 수평선과 안 만남(평행)'; return true; }
      const t = (T.y - b.y) / uy;
      nx = b.x + ux*t; ny = b.y + uy*t; jgLabel = `점${refIdx} 수평선`;
    } else {
      // 축 생략: 점을 연장선에 수직투영 (보조 동작)
      const proj = (T.x-b.x)*ux + (T.y-b.y)*uy;
      nx = b.x + ux*proj; ny = b.y + uy*proj; jgLabel = `점${refIdx}`;
    }
    const ln = penFindLineByEndpoints(i1, i2);
    if (ln){
      const which = (Math.hypot(ln.p1.x-b.x, ln.p1.y-b.y) < Math.hypot(ln.p2.x-b.x, ln.p2.y-b.y)) ? 'p1' : 'p2';
      ln[which] = { x:nx, y:ny };
      penPoints[i2] = { x:nx, y:ny };
      penUpdateLabel(i2, nx, ny);
      penFinish(`↦ ${i1}-${i2} 선 ${jgLabel}까지 연장`);
    } else {
      penAddLine(a.x, a.y, nx, ny);
      const ne = penAddPoint(nx, ny);
      penFinish(`↦ ${i1}-${i2} 방향 ${jgLabel}까지 연장 → P${ne}`);
    }
    return true;
  }

  // Rev.16.65: 절각 - 절각 3 45 Y10 / 절각 3 45 x0 (대소문자 무관)
  //   절각 3 45 Y10 → 3번 점에서 45도 방향 직선을 Y=10 좌표까지 연장 (선 생성)
  if (toks[0] === '절각' && parsePenIdx(toks[1]) != null && isFinite(evalExpr(toks[2]))){
    const si = parsePenIdx(toks[1]);
    if (!penPoints[si]){ document.getElementById('statusHint').textContent=`절각: ${toks[1]}번 점이 없습니다`; return true; }
    const ang = evalExpr(toks[2]);
    const rad = ang * Math.PI/180;
    const ux = Math.cos(rad), uy = -Math.sin(rad);   // 반시계+ , 위=Y감소
    const sp2 = penPoints[si];
    let nx, ny, label;
    // Rev.16.74: 절각 3 45 5 y - 3번 점서 45도 방향으로 5번 점의 Y(또는 X)좌표까지.
    //   toks[3]=기준 점번호, toks[4]=축(x/y). 축 생략 시 점을 연장선에 수직투영.
    const refIdx = parsePenIdx((toks[3]||'').replace(/^점/,''));
    if (refIdx == null || !penPoints[refIdx]){
      document.getElementById('statusHint').textContent = '절각: 절각 3 45 5 수직 형식 (각도 + 기준 점번호 + 수평/수직)';
      return true;
    }
    const T = penPoints[refIdx];
    const axisTok = (toks[4]||'').toUpperCase();
    const isVert = (toks[4]==='수직' || axisTok==='V');
    const isHoriz = (toks[4]==='수평' || axisTok==='H');
    if (isVert){
      // 기준점을 지나는 수직선(세로선, X=T.x)과 각도 연장선의 교점
      if (Math.abs(ux) < 1e-6){ document.getElementById('statusHint').textContent='절각: 수직(90/270°) 방향은 수직선과 안 만남(평행)'; return true; }
      const t = (T.x - sp2.x) / ux;
      nx = sp2.x + ux*t; ny = sp2.y + uy*t; label = `점${refIdx} 수직선`;
    } else if (isHoriz){
      // 기준점을 지나는 수평선(가로선, Y=T.y)과 각도 연장선의 교점
      if (Math.abs(uy) < 1e-6){ document.getElementById('statusHint').textContent='절각: 수평(0/180°) 방향은 수평선과 안 만남(평행)'; return true; }
      const t = (T.y - sp2.y) / uy;
      nx = sp2.x + ux*t; ny = sp2.y + uy*t; label = `점${refIdx} 수평선`;
    } else {
      const proj = (T.x-sp2.x)*ux + (T.y-sp2.y)*uy;
      nx = sp2.x + ux*proj; ny = sp2.y + uy*proj; label = `점${refIdx}`;
    }
    penAddLine(sp2.x, sp2.y, nx, ny);
    const ne = penAddPoint(nx, ny);
    penFinish(`↦ P${si}에서 ${ang}° 방향 ${label}까지 연장 → P${ne}`);
    return true;
  }

  // Rev.16.84: 절교/절각으로 시작했는데 위 분기에 안 걸린 경우 — 원인 안내 (조용히 사라지지 않게)
  if (toks[0] === '절교' || toks[0] === '절각'){
    const ri = parsePenIdx((toks[toks[0]==='절교' ? (['상','하','좌','우','U','D','L','R'].includes(toks[2])?4:3) : 3]||'').replace(/^점/,''));
    let why = '형식을 확인하세요';
    if (parsePenIdx(toks[1]) == null) why = `${toks[1]||'?'}번 점이 잘못됨`;
    else if (!penPoints[parsePenIdx(toks[1])]) why = `${toks[1]}번 점이 없음`;
    else if (toks[0]==='절교' && ['상','하','좌','우','U','D','L','R'].includes(toks[2]) && ri!=null && !penPoints[ri]) why = `기준 ${toks[4]}번 점이 없음`;
    document.getElementById('statusHint').textContent = `⚠ ${toks[0]} 실행 안 됨: ${why} (예: 절교 2 우 수직 0 — 0번 점이 실제로 있어야 함)`;
    cmdLog(`⚠ ${toks[0]} 실행 안 됨: ${why}`, 'error');
    return true;
  }

  // Rev.16.57: 연장 - i1-i2 선의 i2쪽을 늘림.
  //   연장 1 2 30     → 30mm 연장 (거리)
  //   연장 1 2 교점   → i1→i2 방향으로 늘려 처음 만나는 선과의 교점까지
  //   연장 1 2 X 50   → i2쪽 끝의 X좌표가 50mm 될 때까지 연장
  //   연장 1 2 Y 30   → i2쪽 끝의 Y좌표가 30mm 될 때까지 연장
  if ((toks[0] === '연장' || toks[0] === 'EXTEND') && toks.length >= 4){
    const i1 = parsePenIdx(toks[1]), i2 = parsePenIdx(toks[2]);
    if (i1 == null || i2 == null || !penPoints[i1] || !penPoints[i2]) return false;
    const ln = penFindLineByEndpoints(i1, i2);   // Rev.16.64: 선이 없어도 두 점 방향으로 연장(새 선 생성)
    const a = penPoints[i1], b = penPoints[i2];
    const len = Math.hypot(b.x-a.x, b.y-a.y);
    if (len < 1e-6) return true;
    const ux = (b.x-a.x)/len, uy = (b.y-a.y)/len;
    let nx, ny, label;
    const mode = toks[3];

    if (mode === '교점' || mode === 'IX'){
      // i2 끝에서 i1→i2 방향 반직선이 처음 만나는 선과의 교점
      const maxPx = Math.hypot(baseW, baseH);
      const hit = penRayFirstHit(b.x, b.y, ux, uy, maxPx);
      if (!hit){ document.getElementById('statusHint').textContent='연장: 그 방향에 만나는 선이 없습니다'; return true; }
      nx = hit.x; ny = hit.y; label = '교점까지';
    } else if (mode === 'X' || mode === 'x'){
      const xmm = evalExpr(toks[4]);
      if (!isFinite(xmm)) return false;
      const targetPx = penMmToPx(xmm, 0).x;     // 목표 X(px)
      if (Math.abs(ux) < 1e-6){ document.getElementById('statusHint').textContent='연장: 세로선은 X좌표로 연장 불가'; return true; }
      const t = (targetPx - b.x) / ux;          // b에서 방향으로 t만큼
      nx = b.x + ux*t; ny = b.y + uy*t; label = `X=${xmm}`;
    } else if (mode === 'Y' || mode === 'y'){
      const ymm = evalExpr(toks[4]);
      if (!isFinite(ymm)) return false;
      const targetPy = penMmToPx(0, ymm).y;     // 목표 Y(px)
      if (Math.abs(uy) < 1e-6){ document.getElementById('statusHint').textContent='연장: 가로선은 Y좌표로 연장 불가'; return true; }
      const t = (targetPy - b.y) / uy;
      nx = b.x + ux*t; ny = b.y + uy*t; label = `Y=${ymm}`;
    } else {
      const dist = evalExpr(mode);
      if (!isFinite(dist)) return false;
      nx = b.x + ux*dist/mmPerPixel; ny = b.y + uy*dist/mmPerPixel; label = `${dist}mm`;
    }

    if (ln){
      // 기존 선이 있으면 i2쪽 끝점을 갱신
      const which = (Math.hypot(ln.p1.x-b.x, ln.p1.y-b.y) < Math.hypot(ln.p2.x-b.x, ln.p2.y-b.y)) ? 'p1' : 'p2';
      ln[which] = { x:nx, y:ny };
      penPoints[i2] = { x:nx, y:ny };
      penUpdateLabel(i2, nx, ny);
      penFinish(`↦ ${i1}-${i2} 선 ${i2}번 쪽 ${label} 연장`);
    } else {
      // 선이 없으면 i1→(연장 끝점) 새 선 + 끝점 번호 부여
      penAddLine(a.x, a.y, nx, ny);
      const ne = penAddPoint(nx, ny);
      penFinish(`↦ ${i1}-${i2} 방향 ${label} 선 생성 → P${ne}`);
    }
    return true;
  }

  // Rev.19.18: 줄이기 - i1-i2 선의 i2쪽 끝점을 안쪽(i1 방향)으로 당겨 선 길이를 줄임. (연장의 반대)
  //   줄이기 1 2 30     → i2쪽을 30mm 줄임 (거리)
  //   줄이기 1 2 반     → 절반 길이로 줄임
  //   줄이기 1 2 X 50   → i2쪽 끝의 X좌표가 50mm 되도록
  //   줄이기 1 2 Y 30   → i2쪽 끝의 Y좌표가 30mm 되도록
  if ((toks[0] === '줄이기' || toks[0] === '단축' || toks[0] === 'SHORTEN' || toks[0] === 'TRIM')
      && toks.length >= 4){
    const i1 = parsePenIdx(toks[1]), i2 = parsePenIdx(toks[2]);
    if (i1 == null || i2 == null || !penPoints[i1] || !penPoints[i2]) return false;
    const ln = penFindLineByEndpoints(i1, i2);
    const a = penPoints[i1], b = penPoints[i2];
    const len = Math.hypot(b.x-a.x, b.y-a.y);
    if (len < 1e-6) return true;
    const ux = (b.x-a.x)/len, uy = (b.y-a.y)/len;   // i1→i2 단위방향
    let nx, ny, label;
    const mode = toks[3];

    if (mode === 'X' || mode === 'x'){
      const xmm = evalExpr(toks[4]);
      if (!isFinite(xmm)) return false;
      const targetPx = penMmToPx(xmm, 0).x;
      if (Math.abs(ux) < 1e-6){ document.getElementById('statusHint').textContent='줄이기: 세로선은 X좌표로 줄이기 불가'; return true; }
      const t = (targetPx - b.x) / ux;
      nx = b.x + ux*t; ny = b.y + uy*t; label = `X=${xmm}`;
    } else if (mode === 'Y' || mode === 'y'){
      const ymm = evalExpr(toks[4]);
      if (!isFinite(ymm)) return false;
      const targetPy = penMmToPx(0, ymm).y;
      if (Math.abs(uy) < 1e-6){ document.getElementById('statusHint').textContent='줄이기: 가로선은 Y좌표로 줄이기 불가'; return true; }
      const t = (targetPy - b.y) / uy;
      nx = b.x + ux*t; ny = b.y + uy*t; label = `Y=${ymm}`;
    } else if (mode === '반' || mode === '절반' || mode === 'HALF'){
      // 절반 길이로
      const dPx = len/2;
      nx = a.x + ux*dPx; ny = a.y + uy*dPx; label = '절반';
    } else {
      // 거리(mm)만큼 i2쪽에서 안쪽으로 당김
      const dist = evalExpr(mode);
      if (!isFinite(dist)) return false;
      const dPx = dist/mmPerPixel;
      const remainPx = len - dPx;
      if (remainPx <= 1e-6){ document.getElementById('statusHint').textContent=`줄이기: ${dist}mm가 선 길이보다 같거나 큼 (선이 사라짐)`; return true; }
      nx = b.x - ux*dPx; ny = b.y - uy*dPx; label = `${dist}mm`;
    }

    if (ln){
      const which = (Math.hypot(ln.p1.x-b.x, ln.p1.y-b.y) < Math.hypot(ln.p2.x-b.x, ln.p2.y-b.y)) ? 'p1' : 'p2';
      ln[which] = { x:nx, y:ny };
      penPoints[i2] = { x:nx, y:ny };
      penUpdateLabel(i2, nx, ny);
      penFinish(`↤ ${i1}-${i2} 선 ${i2}번 쪽 ${label} 줄임`);
    } else {
      // 선이 없으면 i1→(줄인 끝점) 새 선 + 끝점 번호 부여
      penAddLine(a.x, a.y, nx, ny);
      const ne = penAddPoint(nx, ny);
      penFinish(`↤ ${i1}-${i2} 방향 ${label} 선 생성 → P${ne}`);
    }
    return true;
  }

  // Rev.17.0: 두께 1 5 좌 / 우 / 양 - 1~5번 연결 경로(선·호 포함)를 소재두께만큼 평행복제.
  //   좌/우: 거리두기 칸 두께만큼 한쪽으로. 양: 칸 두께의 절반씩 양쪽으로 (중심선 방식).
  // Rev.18.6: penPoints 배열에 없는 번호여도 화면상 점/라벨에서 자동 복구 (조용히 return false 제거)
  if (toks[0] === '두께'
      && parsePenIdx(toks[1]) != null && parsePenIdx(toks[2]) != null){
    const startI = parsePenIdx(toks[1]), endI = parsePenIdx(toks[2]);
    const lr = toks[3] || '좌';
    const isBoth = (lr==='양'||lr==='양쪽'||lr==='BOTH'||lr==='B');
    const tEl = document.getElementById('offsetTwinDistInput');
    const dmm = tEl ? parseFloat(tEl.value) : NaN;

    // Rev.18.6: penPoints[]가 sparse하거나 비어있어도 shapes에서 점/라벨 좌표를 복구
    const findPointByLabel = (idx) => {
      if (penPoints[idx]) return penPoints[idx];
      // shapes에서 penIdx === idx 인 point 도형 검색
      for (const s of shapes){
        if (s.type === 'point' && s.penIdx === idx && s.p1) return { x:s.p1.x, y:s.p1.y };
      }
      // text 라벨로도 검색 (penLabel)
      for (const s of shapes){
        if (s.type === 'text' && s.penLabel === idx && s.pos){
          // 라벨은 점에서 살짝 오프셋 되어있음. 가까운 point 도형 찾기
          const tolPx = 1/mmPerPixel * 2;
          for (const p of shapes){
            if (p.type === 'point' && p.p1
                && Math.abs(p.p1.x - s.pos.x) < tolPx
                && Math.abs(p.p1.y - s.pos.y) < tolPx*2){
              return { x:p.p1.x, y:p.p1.y };
            }
          }
        }
      }
      return null;
    };
    const pStart = findPointByLabel(startI);
    const pEnd   = findPointByLabel(endI);
    if (!pStart || !pEnd){
      const miss = !pStart ? startI : endI;
      document.getElementById('statusHint').textContent = `두께: ${miss}번 점을 찾지 못함 (점 번호 확인 또는 「라벨」 명령으로 라벨 부여)`;
      cmdLog(`  ✗ 두께: ${miss}번 점 없음 (penPoints길이=${penPoints.length})`, 'system');
      return true;   // Rev.18.6: 조용한 return false 제거
    }
    // penPoints 복구 (이후 코드가 penPoints[startI] 직접 참조)
    if (!penPoints[startI]) penPoints[startI] = pStart;
    if (!penPoints[endI])   penPoints[endI]   = pEnd;

    if (!isFinite(dmm) || dmm<=0){ document.getElementById('statusHint').textContent='두께: 거리두기 칸(상단 도구바)에 소재두께(mm)를 입력하세요'; return true; }
    const tol = 1/mmPerPixel*0.15;
    const onPt = (P,Q)=>Math.hypot(P.x-Q.x,P.y-Q.y)<tol;
    const arcEnd = (s,which) => {
      const ang = which==='start'? s.startAngle : s.endAngle;
      return { x:s.cx+Math.cos(ang)*s.r, y:s.cy+Math.sin(ang)*s.r };
    };
    // 경로 추적 (한 번만)
    const usedIds = new Set();
    const segAt = (P) => {
      for (const s of shapes){
        if (usedIds.has(s.id)) continue;
        if (s.type==='line' && s.p1 && s.p2){
          if (onPt(s.p1,P) || onPt(s.p2,P)) return s;
        } else if (s.type==='arc'){
          if (onPt(arcEnd(s,'start'),P) || onPt(arcEnd(s,'end'),P)) return s;
        }
      }
      return null;
    };
    const path = [];
    let curP = penPoints[startI];
    const endP = penPoints[endI];
    let guard = 0;
    while (guard++ < 200){
      const s = segAt(curP);
      if (!s) break;
      usedIds.add(s.id);
      let nextP;
      if (s.type==='line'){ nextP = onPt(s.p1,curP) ? s.p2 : s.p1; }
      else { const es=arcEnd(s,'start'), ee=arcEnd(s,'end'); nextP = onPt(es,curP) ? ee : es; }
      path.push({ seg:s, from:{x:curP.x,y:curP.y}, to:{x:nextP.x,y:nextP.y} });
      curP = nextP;
      if (onPt(curP, endP)) break;
    }
    // Rev.18.6: 경로 못 찾으면 진단 정보 출력 (어디서 끊겼는지)
    if (path.length===0){
      const sm = penPxToMm(pStart.x, pStart.y);
      const em = penPxToMm(pEnd.x, pEnd.y);
      document.getElementById('statusHint').textContent =
        `두께: ${startI}~${endI} 연결 경로를 찾지 못함 — ${startI}번 끝점에 닿은 선이 없음`;
      cmdLog(`  ✗ 두께 경로 탐색 실패: P${startI}(${sm.x.toFixed(1)},${sm.y.toFixed(1)}) → P${endI}(${em.x.toFixed(1)},${em.y.toFixed(1)}) · ${startI}번 점에 끝점이 닿은 선이 없습니다`, 'system');
      return true;
    }
    // 끝점까지 도달 못 했으면 경고
    if (!onPt(curP, endP)){
      cmdLog(`  ⚠ 두께 경로가 ${endI}번까지 닿지 못함 (${path.length}구간 추적 후 중단). 도중에 선 단절이 있을 수 있음 — 그래도 추적된 ${path.length}개 구간에 두께 적용`, 'system');
    }

    // 한쪽 방향으로 평행 복제하는 헬퍼 (isLeft, offPx 받음)
    const sw = parseInt(document.getElementById('strokeWidth').value) || 1;
    const stroke = document.getElementById('strokeColor').value || '#ffffff';
    const buildSide = (isLeft, offPx) => {
      const offSegs = [];
      for (const node of path){
        const s = node.seg, A = node.from, B = node.to;
        if (s.type==='line'){
          const dx=B.x-A.x, dy=B.y-A.y, len=Math.hypot(dx,dy);
          if (len<1e-6) continue;
          const ux=dx/len, uy=dy/len, nx=isLeft?uy:-uy, ny=isLeft?-ux:ux;
          offSegs.push({ type:'line', p1:{x:A.x+nx*offPx,y:A.y+ny*offPx}, p2:{x:B.x+nx*offPx,y:B.y+ny*offPx} });
        } else {
          const es=arcEnd(s,'start');
          const fromIsStart = onPt(es, A);
          let dr;
          const ccw = !!s.ccw;
          if (isLeft) dr = ccw ? -offPx : +offPx;
          else        dr = ccw ? +offPx : -offPx;
          if (!fromIsStart) dr = -dr;
          const nr = s.r + dr;
          if (nr > 1e-3){
            offSegs.push({ type:'arc', cx:s.cx, cy:s.cy, r:nr, startAngle:s.startAngle, endAngle:s.endAngle, ccw:s.ccw });
          }
        }
      }
      // 코너 보정
      for (let k=0;k<offSegs.length-1;k++){
        const s1=offSegs[k], s2=offSegs[k+1];
        if (s1.type==='line' && s2.type==='line'){
          const ix = lineLineIntersection(s1.p1,s1.p2,s2.p1,s2.p2);
          if (ix){ s1.p2={x:ix.x,y:ix.y}; s2.p1={x:ix.x,y:ix.y}; }
        }
      }
      // 도형 생성 — Rev.17.1: 두께선이 같은 직선의 기존 선과 겹치면 합쳐 하나로 유지 (noMerge 끔)
      for (const o of offSegs){
        if (o.type==='line'){
          penAddLine(o.p1.x,o.p1.y,o.p2.x,o.p2.y);   // 합치기 활성
          penAddPoint(o.p1.x,o.p1.y); penAddPoint(o.p2.x,o.p2.y);
        } else {
          shapes.push({ id:++shapeIdSeq, type:'arc', cx:o.cx, cy:o.cy, r:o.r, startAngle:o.startAngle, endAngle:o.endAngle, ccw:o.ccw, stroke, strokeWidth:sw, layer:(currentLayer||'default') });
        }
      }
      return offSegs.length;
    };

    // Rev.18.8: 양쪽 생성 제거 — 좌/우 한쪽만. '양' 입력 시 안내 후 좌측 처리
    if (isBoth){
      document.getElementById('statusHint').textContent = '두께: 양쪽 생성은 제거됨 — 좌/우 한쪽만 가능. 좌측으로 생성합니다';
      cmdLog('  ⚠ 두께 "양"(양쪽)은 제거됨 → 좌측 한쪽으로 생성 (반대쪽은 "두께 N M 우")', 'system');
    }
    const isLeft = isBoth ? true : (lr==='좌'||lr==='L');
    const off = dmm/mmPerPixel;
    const n = buildSide(isLeft, off);
    penFinish(`▦ ${startI}~${endI} 경로 두께 ${dmm}mm ${isLeft?'좌':'우'}측 평행 (구간 ${n}개)`);
    return true;
  }

  // Rev.16.56: 거리두기 4 5 좌 1 - 진행방향 좌/우 평행복제.
  //   원본 끝점에 붙은 인접선과 만나도록 평행선을 연장/단축(폐곽 유지), 끝점에 번호 부여.
  if ((toks[0] === '거리두기' || toks[0] === 'OFFSET')
      && parsePenIdx(toks[1]) != null && parsePenIdx(toks[2]) != null){
    const i1 = parsePenIdx(toks[1]), i2 = parsePenIdx(toks[2]);
    let lr = toks[3], dmm;
    if (lr==='좌'||lr==='우'||lr==='L'||lr==='R'){ dmm = evalExpr(toks[4]); }
    else { lr='좌'; dmm = evalExpr(toks[3]); }
    const isLeft=(lr==='좌'||lr==='L');
    if (!penPoints[i1] || !penPoints[i2] || !isFinite(dmm)) return false;
    const a=penPoints[i1], b=penPoints[i2];
    const dx=b.x-a.x, dy=b.y-a.y, len=Math.hypot(dx,dy);
    if (len<1e-6){ document.getElementById('statusHint').textContent=`거리두기 실패: ${i1},${i2}가 같은 위치`; return true; }
    const ux=dx/len, uy=dy/len, nx=isLeft?uy:-uy, ny=isLeft?-ux:ux;
    const offPx=dmm/mmPerPixel, ox=nx*offPx, oy=ny*offPx;
    // 평행 이동한 임시 끝점
    let na = { x:a.x+ox, y:a.y+oy };
    let nb = { x:b.x+ox, y:b.y+oy };

    // 원본 i1-i2 선 자신을 찾아 제외
    const tol = 1/mmPerPixel*0.15;
    const onPt = (P,Q)=>Math.hypot(P.x-Q.x,P.y-Q.y)<tol;
    const selfLine = shapes.find(s=>s.type==='line'&&s.p1&&s.p2&&
      ((onPt(s.p1,a)&&onPt(s.p2,b))||(onPt(s.p1,b)&&onPt(s.p2,a))));
    // 끝점 P에 붙은 인접선(원본 제외) 1개 찾기
    const adjLineAt = (P)=>{
      for (const s of shapes){
        if (s.type!=='line'||!s.p1||!s.p2||s===selfLine) continue;
        if (onPt(s.p1,P)||onPt(s.p2,P)) return s;
      }
      return null;
    };
    const adjA = adjLineAt(a), adjB = adjLineAt(b);
    // 새 평행선(무한직선) na-nb 와 인접선(무한직선)의 교점으로 끝점 보정
    if (adjA){ const ix=lineLineIntersection(na,nb,adjA.p1,adjA.p2); if(ix) na={x:ix.x,y:ix.y}; }
    if (adjB){ const ix=lineLineIntersection(na,nb,adjB.p1,adjB.p2); if(ix) nb={x:ix.x,y:ix.y}; }

    penAddLine(na.x,na.y,nb.x,nb.y,true);   // noMerge: 평행선은 합치지 않음
    const ea = penAddPoint(na.x,na.y);
    const eb = penAddPoint(nb.x,nb.y);
    penFinish(`⫴ ${i1}→${i2} ${isLeft?'좌':'우'}측 ${dmm}mm 평행복제 → P${ea}, P${eb}`);
    return true;
  }

  // 시작점 지정: 시작 X Y
  if ((toks[0] === '시작' || toks[0] === 'START') && toks.length >= 3){
    const xmm = evalExpr(toks[1]), ymm = evalExpr(toks[2]);
    if (!isFinite(xmm) || !isFinite(ymm)) return false;
    const p = penMmToPx(xmm, ymm);
    penAddPoint(p.x, p.y);
    penFinish(`✎ 시작점 P0 = (${xmm}, ${ymm})mm`);
    return true;
  }

  // Rev.16.61/63: 기준 상 50 - 현재 기준점에서 방향+거리에 새 기준점.
  //   기준 좌 지 79.44 85.7 - 지름차 (85.7-79.44)/2 만큼 그 방향으로 새 기준점
  if (toks[0] === '기준' && ['상','하','좌','우','U','D','L','R'].includes(toks[1]) && toks.length >= 3){
    if (penCur < 0 || !penPoints[penCur]){
      document.getElementById('statusHint').textContent = '⚠ 먼저 기준점을 잡으세요 (기준 X Y 또는 빈 곳 클릭)';
      return true;
    }
    const bdir = toks[1];
    let bdist, label;
    if (toks[2] === '지'){
      const d1 = evalExpr(toks[3]), d2 = evalExpr(toks[4]);
      if (!isFinite(d1) || !isFinite(d2)) return false;
      bdist = Math.abs(d2 - d1) / 2;
      label = `지름 ${d1}→${d2} = ${bdist}mm`;
    } else {
      bdist = evalExpr(toks[2]);
      if (!isFinite(bdist)) return false;
      label = `${bdist}mm`;
    }
    const base = penPoints[penCur];
    const dpx = bdist/mmPerPixel;
    let nx = base.x, ny = base.y;
    if (bdir==='우'||bdir==='R') nx += dpx;
    else if (bdir==='좌'||bdir==='L') nx -= dpx;
    else if (bdir==='상'||bdir==='U') ny -= dpx;   // 화면 위=Y감소
    else if (bdir==='하'||bdir==='D') ny += dpx;
    penAddAnchor(nx, ny);
    penFinish(`✛ 기준점 ${penCur} = 이전 기준점에서 ${bdir} ${label}`);
    return true;
  }

  // Rev.16.58: 기준 지 130 110 - 지름 기반 기준점. 130=지름→X=좌측 반지름(-65), Y=110
  if (toks[0] === '기준' && toks[1] === '지' && toks.length >= 4){
    const D = evalExpr(toks[2]), ymm = evalExpr(toks[3]);
    if (!isFinite(D) || !isFinite(ymm)) return false;
    const xmm = -Math.abs(D)/2;   // 지름 → 좌측 반지름
    const p = penMmToPx(xmm, ymm);
    penAddAnchor(p.x, p.y);
    penFinish(`✛ 기준점 ${penCur} = 지름 ${D} → 좌측 X=${xmm}, Y=${ymm}mm`);
    return true;
  }

  // Rev.16.58: 기준 X Y - 빈 공간 좌표를 기준점(앵커)으로. ('좌표' 명령은 '기준'으로 통일)
  if (toks[0] === '기준' && toks.length >= 3 && toks[1] !== '지'){
    const xmm = evalExpr(toks[1]), ymm = evalExpr(toks[2]);
    if (!isFinite(xmm) || !isFinite(ymm)) return false;
    const p = penMmToPx(xmm, ymm);
    penAddAnchor(p.x, p.y);
    penFinish(`✛ 기준점 ${penCur} = (${xmm}, ${ymm})mm`);
    return true;
  }

  // 선 P1 P4 : 두 점 직접 연결
  if ((toks[0] === '선' || toks[0] === 'LINK') && toks.length >= 3){
    const i1 = parsePenIdx(toks[1]), i2 = parsePenIdx(toks[2]);
    if (i1 == null || i2 == null || !penPoints[i1] || !penPoints[i2]) return false;
    penAddLine(penPoints[i1].x, penPoints[i1].y, penPoints[i2].x, penPoints[i2].y);
    penCur = i2;
    penFinish(`✎ 선 P${i1}-P${i2} 연결`);
    return true;
  }

  // 닫기 : 현재 점 → P0
  if (toks[0] === '닫기' || toks[0] === 'CLOSE'){
    if (penCur < 0 || !penPoints[0] || penCur === 0){ return false; }
    penAddLine(penPoints[penCur].x, penPoints[penCur].y, penPoints[0].x, penPoints[0].y);
    penFinish(`✎ 닫기: ${penCur} → 0`);
    penCur = 0;
    return true;
  }

  // [Pn] 방향 거리  /  방향 거리
  let off = 0;
  let startIdx = penCur;
  const maybeIdx = parsePenIdx(toks[0]);
  if (maybeIdx != null){
    if (!penPoints[maybeIdx]) return false;
    startIdx = maybeIdx;
    off = 1;
  }
  // Rev.16.43: '씰' 접두 제거
  const dir = toks[off];
  const dirSet = ['우','좌','상','하','R','L','U','D','각','도','ANG','거리두기'];
  if (!dirSet.includes(dir)) return false;

  // 시작점이 없으면 P0를 중앙(0,0)에 자동 생성
  if (startIdx < 0 || !penPoints[startIdx]){
    const o = penMmToPx(0,0);
    penAddPoint(o.x, o.y);
    startIdx = 0;
  }
  const sp = penPoints[startIdx];

  // 거리두기 위/아래 D : 마지막 선 평행복제 (점번호 없이)
  if (dir === '거리두기'){
    const ud = toks[off+1]; const dmm = evalExpr(toks[off+2]);
    if (ud==='좌'||ud==='우'||ud==='L'||ud==='R'){ document.getElementById('statusHint').textContent='⚠ 좌/우 거리두기는 점번호 2개로: 예) 거리두기 2 3 좌 0.6'; return true; }
    if ((ud !== '위' && ud !== '아래') || !isFinite(dmm)) return false;
    // 마지막으로 그린 line 찾기
    let last=null;
    for (let i=shapes.length-1;i>=0;i--){ if (shapes[i].type==='line'){ last=shapes[i]; break; } }
    if (!last) return false;
    const dpx = dmm/mmPerPixel * (ud==='위'? -1 : 1);  // 화면상 위=Y감소
    penAddLine(last.p1.x, last.p1.y+dpx, last.p2.x, last.p2.y+dpx);
    penFinish(`✎ 거리두기 ${ud} ${dmm}mm 평행복제`);
    return true;
  }

  // 각도: 도 A D  또는  각 A 교점 (45도 방향 직진 → 첫 교점까지)
  if (dir === '각' || dir === '도' || dir === 'ANG'){
    const ang = evalExpr(toks[off+1]);
    if (!isFinite(ang)) return false;
    const rad = ang * Math.PI/180;
    const ux = Math.cos(rad), uy = -Math.sin(rad);   // 반시계 양수=화면 위
    // Rev.16.54: 각 A 교점 - 그 방향으로 직진하다 처음 만나는 선과의 교점까지
    if (toks[off+2] === '교점' || toks[off+2] === 'IX'){
      const maxPx = Math.hypot(baseW, baseH);
      const hit = penRayFirstHit(sp.x, sp.y, ux, uy, maxPx);
      if (!hit){ document.getElementById('statusHint').textContent = `각 ${ang}° 방향에 만나는 선이 없습니다`; return true; }
      penAddLine(sp.x, sp.y, hit.x, hit.y);
      penAddPoint(hit.x, hit.y);
      penFinish(`✎ ${startIdx} → ${ang}° 교점까지 → ${penCur}`);
      return true;
    }
    // Rev.17.2: 각 45 수평 -5 / 수직 10 - 원점 기준 절대 좌표축선까지 연장
    //   수평 Y=val 수평선과의 교점, 수직 X=val 수직선과의 교점
    if (toks[off+2] === '수평' || toks[off+2] === '수직'){
      const valMm = evalExpr(toks[off+3]);
      if (!isFinite(valMm)){ document.getElementById('statusHint').textContent='각: 수평/수직 다음에 좌표(mm) 필요. 예: 각 45 수평 -5'; return true; }
      const target = penMmToPx(toks[off+2]==='수직' ? valMm : 0, toks[off+2]==='수평' ? valMm : 0);
      let nx, ny;
      if (toks[off+2] === '수평'){
        if (Math.abs(uy) < 1e-9){ document.getElementById('statusHint').textContent=`각 ${ang}°는 수평이라 Y=${valMm} 수평선과 만나지 않음`; return true; }
        const t = (target.y - sp.y) / uy;
        nx = sp.x + ux*t; ny = sp.y + uy*t;
      } else {
        if (Math.abs(ux) < 1e-9){ document.getElementById('statusHint').textContent=`각 ${ang}°는 수직이라 X=${valMm} 수직선과 만나지 않음`; return true; }
        const t = (target.x - sp.x) / ux;
        nx = sp.x + ux*t; ny = sp.y + uy*t;
      }
      penAddLine(sp.x, sp.y, nx, ny);
      penAddPoint(nx, ny);
      penFinish(`✎ ${startIdx} → ${ang}° ${toks[off+2]}=${valMm}까지 → ${penCur}`);
      return true;
    }
    const dist = evalExpr(toks[off+2]);
    if (!isFinite(dist)) return false;
    const dx = ux*dist/mmPerPixel, dy = uy*dist/mmPerPixel;
    const nx = sp.x + dx, ny = sp.y + dy;
    penAddLine(sp.x, sp.y, nx, ny);
    penAddPoint(nx, ny);
    penFinish(`✎ ${startIdx} → ${ang}° ${dist}mm → ${penCur}`);
    return true;
  }

  // 좌우상하 거리
  // Rev.16.51: 지름 모드 - 좌 지 110 130 → (130-110)/2 만큼 해당 방향으로 선긋기
  //   형식: [방향] 지 D1 D2   (D1=시작지름, D2=끝지름, 이동량=|D2-D1|/2)
  const isLR = (dir==='우'||dir==='R'||dir==='좌'||dir==='L');
  if (isLR && toks[off+1] === '지'){
    const d1 = evalExpr(toks[off+2]);
    const d2 = evalExpr(toks[off+3]);
    if (!isFinite(d1) || !isFinite(d2)) return false;
    const moveMm = Math.abs(d2 - d1) / 2;
    const moveDir = (dir==='좌'||dir==='L') ? -1 : +1;
    const dxp = moveDir * moveMm / mmPerPixel;
    const nx = sp.x + dxp, ny = sp.y;
    penAddLine(sp.x, sp.y, nx, ny);
    penAddPoint(nx, ny);
    penFinish(`⌀ ${startIdx} → ${dir} 지름 ${d1}→${d2} = ${moveMm}mm 선긋기 → ${penCur}`);
    return true;
  }

  // Rev.16.59: 상/하/좌/우 교점 - 그 방향으로 직진하다 처음 만나는 선과의 교점까지 선긋기
  if (toks[off+1] === '교점' || toks[off+1] === 'IX'){
    let ux=0, uy=0;
    if (dir==='우'||dir==='R') ux = 1;
    else if (dir==='좌'||dir==='L') ux = -1;
    else if (dir==='상'||dir==='U') uy = -1;   // 화면 위=Y감소
    else if (dir==='하'||dir==='D') uy = 1;
    else return false;
    const maxPx = Math.hypot(baseW, baseH);
    const hit = penRayFirstHit(sp.x, sp.y, ux, uy, maxPx);
    if (!hit){ document.getElementById('statusHint').textContent = `${dir} 방향에 만나는 선이 없습니다`; return true; }
    penAddLine(sp.x, sp.y, hit.x, hit.y);
    penAddPoint(hit.x, hit.y);
    penFinish(`✎ ${startIdx} → ${dir} 교점까지 → ${penCur}`);
    return true;
  }

  const dist = evalExpr(toks[off+1]);
  if (!isFinite(dist)) return false;
  let dx=0, dy=0;

  // 일반 이동
  const dpx = dist/mmPerPixel;
  if (dir==='우'||dir==='R') dx = dpx;
  else if (dir==='좌'||dir==='L') dx = -dpx;
  else if (dir==='상'||dir==='U') dy = -dpx;   // 화면 위=Y감소
  else if (dir==='하'||dir==='D') dy = dpx;
  const nx = sp.x + dx, ny = sp.y + dy;
  penAddLine(sp.x, sp.y, nx, ny);
  penAddPoint(nx, ny);
  penFinish(`✎ ${startIdx} → ${dir} ${dist}mm → ${penCur}`);
  return true;
}
// Rev.16.36: 두 점 번호(i1,i2)를 양 끝점으로 가진 선 찾기
function penFindLineByEndpoints(i1, i2){
  const a = penPoints[i1], b = penPoints[i2];
  if (!a || !b) return null;
  const tol = 1/mmPerPixel * 0.1;  // 0.1mm
  for (const s of shapes){
    if (s.type !== 'line' || !s.p1 || !s.p2) continue;
    const m1 = (Math.hypot(s.p1.x-a.x,s.p1.y-a.y)<tol && Math.hypot(s.p2.x-b.x,s.p2.y-b.y)<tol);
    const m2 = (Math.hypot(s.p1.x-b.x,s.p1.y-b.y)<tol && Math.hypot(s.p2.x-a.x,s.p2.y-a.y)<tol);
    if (m1 || m2) return s;
  }
  return null;
}
// Rev.16.36: 점 번호 라벨 위치 갱신
function penUpdateLabel(idx, px, py){
  const lbId = penLabelIds[idx];
  if (lbId == null) return;
  const lb = shapes.find(s => s.id === lbId);
  if (lb && lb.pos){ lb.pos.x = px + 8/(zoom||1); lb.pos.y = py - 22/(zoom||1); }
}

// "3" / "P3" → 3, 그 외 null
function parsePenIdx(tok){
  if (/^P\d+$/i.test(tok)) return parseInt(tok.slice(1));
  if (/^\d+$/.test(tok)) return parseInt(tok);
  return null;
}

// Rev.16.35: undo 후 현재 도면에 남은 점 라벨 기준으로 penPoints 재구성
function penSyncFromShapes(){
  // 남아있는 point 도형 중 penIdx 가진 것들로 penPoints 복원
  const pts = [];
  const labels = [];
  for (const s of shapes){
    if (s.type === 'point' && typeof s.penIdx === 'number'){
      pts[s.penIdx] = { x:s.p1.x, y:s.p1.y };
    }
    if (s.type === 'text' && typeof s.penLabel === 'number'){
      labels[s.penLabel] = s.id;
    }
  }
  // 연속된 앞부분만 유효 (중간 빈 곳에서 끊김)
  let n = 0;
  while (pts[n] !== undefined) n++;
  const prevCur = penCur;   // Rev.16.86: 취소 후에도 현재점 유지
  penPoints = pts.slice(0, n);
  penLabelIds = labels.slice(0, n);
  // 기존 현재점이 여전히 유효하면 유지, 아니면 마지막 점으로
  penCur = (prevCur >= 0 && prevCur < penPoints.length) ? prevCur : (penPoints.length - 1);
}

// Rev.16.32: 지정 점(pt) 근처에서 끝점이 만나는 두 선을 찾아 지름 dia 필렛
function penFilletAtPoint(pt, diaMm){
  const tol = Math.max(2, 1/mmPerPixel*0.2);  // 0.2mm 또는 2px
  const near = [];
  for (const s of shapes){
    if (s.type !== 'line' || !s.p1 || !s.p2) continue;
    const d1 = Math.hypot(s.p1.x-pt.x, s.p1.y-pt.y);
    const d2 = Math.hypot(s.p2.x-pt.x, s.p2.y-pt.y);
    if (d1 <= tol || d2 <= tol){
      // 교점에서 먼 끝점 = keep(살릴 방향) 클릭점으로 사용
      const far = (d1 <= d2) ? s.p2 : s.p1;
      near.push({ line:s, click:{x:far.x, y:far.y} });
    }
  }
  if (near.length < 2) return false;
  const L1 = near[0], L2 = near[1];
  const rMm = diaMm/2;
  const r = rMm / mmPerPixel;
  return applyFilletNoPrompt(L1.line, L2.line, L1.click, L2.click, r, rMm);
}

// Rev.16.37: 지정 점에서 만나는 두 선을 찾아 C값 cMm 모따기 (기존 챔퍼 로직 사용)
function penChamferAtPoint(pt, cMm){
  const tol = Math.max(2, 1/mmPerPixel*0.2);
  const near = [];
  for (const s of shapes){
    if (s.type !== 'line' || !s.p1 || !s.p2) continue;
    const d1 = Math.hypot(s.p1.x-pt.x, s.p1.y-pt.y);
    const d2 = Math.hypot(s.p2.x-pt.x, s.p2.y-pt.y);
    if (d1 <= tol || d2 <= tol){
      const far = (d1 <= d2) ? s.p2 : s.p1;
      near.push({ line:s, click:{x:far.x, y:far.y} });
    }
  }
  if (near.length < 2) return false;
  return applyChamferToTwoLines(near[0].line, near[1].line, near[0].click, near[1].click, cMm);
}

// Rev.16.46/51/82: 텍스트입력(한붓그리기) 시작 — 함수화하여 여러 버튼에서 호출
function startTextMode(){
  // Rev.18.3: 기존 점이 있으면 자동으로 이어가기 (다이얼로그 없이). 새로 시작하려면 "새 파일" 사용.
  if (penPickMode || (typeof penPoints !== 'undefined' && penPoints.length)){
    const hasPts = (typeof penPoints !== 'undefined' && penPoints.length);
    if (hasPts){
      // 기존 작업 유지: 모드만 보장하고 종료 (일반 모드 갔다 왔을 때 점·번호 그대로 유지)
      penPickMode = true; penAwaitOrigin = false;
      const _t = document.getElementById('headerBtnTextMode'); if (_t) _t.classList.add('active');
      const _p = document.getElementById('headerBtnPenInput'); if (_p) _p.classList.add('active');
      const _n = document.getElementById('headerBtnNormalMode'); if (_n) _n.classList.remove('active');
      const _ci = document.getElementById('cmdInput'); if (_ci) _ci.focus();
      document.getElementById('statusHint').textContent = `⌨ 텍스트 모드 (점 ${penPoints.length}개 이어서) · 새로 시작은 [파일→새 파일]`;
      if (typeof redrawDraw === 'function') redrawDraw();
      return;
    }
  }
  penPoints = []; penLabelIds = []; penCur = -1;
  penPickMode = true; penPickFirst = -1; pointMode = false;
  penOriginPx = null; penAwaitOrigin = true;   // 첫 클릭으로 원점 지정 대기
  // 모드 표시: 다른 도구 active 끄고 텍스트 모드 버튼들 active
  document.querySelectorAll('.tool-strip-btn, .tool-menu-item').forEach(b => b.classList.remove('active'));
  const pbtn = document.getElementById('headerBtnPenInput'); if (pbtn) pbtn.classList.add('active');
  const tbtn = document.getElementById('headerBtnTextMode'); if (tbtn) tbtn.classList.add('active');
  const nbtn = document.getElementById('headerBtnNormalMode'); if (nbtn) nbtn.classList.remove('active');
  const ci = document.getElementById('cmdInput');
  if (ci){ ci.focus(); ci.value = ''; }
  document.getElementById('statusHint').textContent =
    `◎ 텍스트 모드: 먼저 화면을 클릭해 원점(0,0)을 정하세요 · [일반] 버튼/ESC로 일반모드 복귀`;
  cmdLog(`⌨ 텍스트 모드 시작 — 화면 클릭으로 원점 지정 (ESC=일반모드)`, 'system');
}
// Rev.16.82: 일반 모드로 전환 (텍스트모드 해제 + 선택 도구)
function startNormalMode(){
  penPickMode = false; penPickFirst = -1; penAwaitOrigin = false;
  const pbtn = document.getElementById('headerBtnPenInput'); if (pbtn) pbtn.classList.remove('active');
  const tbtn = document.getElementById('headerBtnTextMode'); if (tbtn) tbtn.classList.remove('active');
  const nbtn = document.getElementById('headerBtnNormalMode'); if (nbtn) nbtn.classList.add('active');
  if (typeof selectTool === 'function') selectTool('select');
  document.getElementById('statusHint').textContent = `🖱 일반 모드: 마우스로 선택·작도`;
}
(function(){
  const btn = document.getElementById('headerBtnPenInput');
  if (btn) btn.addEventListener('click', startTextMode);
  const tbtn = document.getElementById('headerBtnTextMode');
  if (tbtn) tbtn.addEventListener('click', startTextMode);
  const nbtn = document.getElementById('headerBtnNormalMode');
  if (nbtn) nbtn.addEventListener('click', startNormalMode);
})();

function tryDimCommand(cmdStr){
  // Rev.16.29: 한붓그리기(점번호) 명령 우선 처리
  if (tryPenCommand(cmdStr)) return true;
  let toks = cmdStr.replace(/,/g,' ').split(/\s+/).filter(Boolean);
  toks = mergeExprTokens(toks);
  if (toks.length < 2) return false;
  const key = toks[0];
  const nums = toks.slice(1).map(t => evalExpr(t));
  if (nums.some(n => !isFinite(n))) return false;
  const mm2px = mm => mm / mmPerPixel;
  const cx = baseW/2, cy = baseH/2;
  const sw = parseInt(document.getElementById('strokeWidth').value) || 1;
  const stroke = document.getElementById('strokeColor').value || '#ffffff';
  const mkLine = (x1,y1,x2,y2) => ({ id:++shapeIdSeq, type:'line', p1:{x:x1,y:y1}, p2:{x:x2,y:y2}, stroke, strokeWidth:sw, layer:(currentLayer||'default') });

  function pushAnd(msg, arr){
    arr.forEach(s => shapes.push(s));
    redoStack = []; pushHistory();
    if (typeof redrawFills === 'function') redrawFills();
    redrawDraw(); updateCount();
    cmdLog('  ' + msg, 'system');
    document.getElementById('statusHint').textContent = msg;
  }

  if ((key === 'BASE' || key === '사각형' || key === 'REC' || key === 'RECT') && nums.length >= 2){
    const w = mm2px(nums[0]), h = mm2px(nums[1]);
    const xL = cx - w/2, xR = cx + w/2, yT = cy - h/2, yB = cy + h/2;
    pushAnd(`▭ 사각형 ${nums[0]}×${nums[1]}mm 생성`, [
      mkLine(xL,yT,xR,yT), mkLine(xL,yB,xR,yB), mkLine(xL,yT,xL,yB), mkLine(xR,yT,xR,yB)
    ]);
    return true;
  }
  if (key === 'LINE' && nums.length >= 4){
    pushAnd(`／ 선 (${nums[0]},${nums[1]})-(${nums[2]},${nums[3]})mm 생성`,
      [ mkLine(mm2px(nums[0]),mm2px(nums[1]),mm2px(nums[2]),mm2px(nums[3])) ]);
    return true;
  }
  if ((key === 'HLINE' || key === '가로선') && nums.length >= 1){
    const L = mm2px(nums[0]);
    pushAnd(`― 가로선 ${nums[0]}mm 생성`, [ mkLine(cx-L/2,cy,cx+L/2,cy) ]);
    return true;
  }
  if ((key === 'VLINE' || key === '세로선') && nums.length >= 1){
    const L = mm2px(nums[0]);
    pushAnd(`｜ 세로선 ${nums[0]}mm 생성`, [ mkLine(cx,cy-L/2,cx,cy+L/2) ]);
    return true;
  }
  if ((key === 'CIRCLE' || key === '원' || key === 'CIR') && nums.length >= 1){
    let ccx = cx, ccy = cy, dia = nums[0];
    if (nums.length >= 3){
      // 원 X Y D : 좌표 지정 (0,0=중앙, 위=+Y)
      const o = { x: baseW/2, y: baseH/2 };
      ccx = o.x + nums[0]/mmPerPixel;
      ccy = o.y - nums[1]/mmPerPixel;
      dia = nums[2];
    }
    const r = mm2px(dia)/2;  // 지름 → 반지름
    shapes.push({ id:++shapeIdSeq, type:'circle',
      p1:{x:ccx, y:ccy}, p2:{x:ccx+r, y:ccy},
      stroke, strokeWidth:sw, layer:(currentLayer||'default') });
    redoStack=[]; pushHistory(); redrawDraw(); updateCount();
    const msg = (nums.length>=3) ? `○ 원 (${nums[0]},${nums[1]}) Ø${dia}mm 생성` : `○ 원 Ø${dia}mm 생성`;
    cmdLog('  '+msg,'system'); document.getElementById('statusHint').textContent = msg;
    return true;
  }
  return false;
}


// ===== Rev.16.88: 명령 키보드 패널 =====
(function(){
  // 카테고리별 명령 정의: {라벨, 채울 틀, 예문}
  const CMD_CATS = {
    '점': [
      { l:'점 X,Y', t:'점 ', ex:'점 -100,100 → 좌표(mm)에 점' },
      { l:'점 N', t:'점 ', ex:'점 5 → 5번 점 선택' },
      { l:'점', t:'점 ', ex:'점 우 3 → 현재점서 우 3mm 독립점 · 점 우 3 하 5 → 우3+아래5 대각 · 점 우 3 좌 3 등 방향+거리 여러 쌍 가능 (상/하/좌/우)' },
      { l:'점 좌 지름', t:'점 좌 지름 ', ex:'점 좌 지름 110 130 → 지름차/2 만큼 좌측 독립점 (지=지름)' },
    ],
    '선': [
      // Rev.18.7: 클릭할 때마다 방향 순환 (우 → 좌 → 상 → 하 → 우). action 콜백 사용
      { l:'우/좌/상/하', cycle:['우','좌','상','하'], ex:'우 50 → 그 방향 50mm 선. 버튼 클릭마다 방향 순환' },
      { l:'선 방향 교점', t:'선 좌 교점', ex:'선 좌 교점 → 좌로 첫 교점까지 선' },
      { l:'선 좌 지름', t:'선 좌 지름 ', ex:'선 좌 지름 110 130 → 지름차/2 좌측 선 (지=지름)' },
      // Rev.18.7: '선 상 거리' 삭제 — '우/좌/상/하' 버튼 + 숫자키로 동일 결과 가능 (중복 제거)
      { l:'연결', t:'연결 ', ex:'연결 1 4 → 1번·4번 직선 연결' },
      { l:'각 A 거리', t:'각 ', ex:'각 45 100 / 각 45 교점 / 각 45 수평 -5 (Y=-5까지) / 수직 10 (X=10까지)' },
      { l:'호', t:'호 ', ex:'호 2 3 시계 각 45 / 호 2 3 시계 교점' },
    ],
    '기준': [
      { l:'기준 X Y', t:'기준 ', ex:'기준 -50 30 → 빈공간 기준점' },
      { l:'기준 지름', t:'기준 지름 ', ex:'기준 지름 130 110 → 지름 좌측반지름,Y (지=지름)' },
      { l:'기준 방향', t:'기준 상 ', ex:'기준 상 50 / 기준 좌 지름 79.44 85.7' },
    ],
    '연장/절교': [
      { l:'연장', t:'연장 ', ex:'연장 1 2 30 / 교점 / X 50 / Y 30' },
      { l:'줄이기', t:'줄이기 ', ex:'줄이기 1 2 30 → 1-2선 2번쪽 30mm 줄임 / 반(절반) / X 50 / Y 30' },
      { l:'절교 두점', t:'절교 ', ex:'절교 9 10 3 수직 / 수평' },
      { l:'절교 방향', t:'절교 ', ex:'절교 1 하 수평 0 → 1서 아래로 0번 수평선까지' },
      { l:'절각', t:'절각 ', ex:'절각 3 45 5 수직 → 3서 45도, 5번 수직선까지' },
    ],
    '편집': [
      { l:'이동', t:'이동 ', ex:'이동 상 3 (현재점) / 이동 1 우 10' },
      { l:'거리두기', t:'거리두기 ', ex:'거리두기 2 3 좌 0.6 → 평행복제' },
      // Rev.18.8: 두께(소재) 버튼 삭제 — 거리두기와 동일 동작 (선 클릭 → 좌/우 클릭). 거리두기 도구 사용
      { l:'삭제', t:'삭제 ', ex:'삭제 1 2 (선) / 삭제 3 (점)' },
      // Rev.17.7: 도구 상단 기능을 명령판에서 직접 호출 (action 콜백)
      { l:'⊞ 교차(분할)', action: () => { if (typeof runBreakAllIntersections === 'function') runBreakAllIntersections(); },
        ex:'⊞ 교차 분할: 도형들의 모든 교차점에서 선·원·호·사각형 분할 (도구 상단 교차 버튼과 동일)' },
      { l:'🗑 삭제(선택)', action: () => { if (typeof deleteSelected === 'function') deleteSelected(); },
        ex:'🗑 선택된 도형 삭제: 마우스 클릭/드래그로 도형을 선택한 후 이 버튼 (Delete 키와 동일)' },
      { l:'닫기', t:'닫기', ex:'닫기 → 현재점→0번 선' },
      { l:'백(취소)', t:'백', ex:'백 → 직전 1회 취소' },
      { l:'교점', t:'교점', ex:'교점 → 모든 교차점 번호부여' },
      { l:'만남', t:'만남', ex:'만남 → 선택한 두 선의 무한직선 교점에 번호 부여 (두께 평행선처럼 번호 없는 선도 OK). 두 선 선택 후 입력 · 또는 "만남 3 5"=3번/5번 점이 속한 선 자동' },
      { l:'🏷 라벨 자동', t:'라벨', ex:'🏷 라벨이 없는 점·도형 꼭짓점에 자동 번호 부여 (이미 라벨 있는 건 제외)' },
      // Rev.19.16: 정리·외곽선·채움을 텍스트도구에서도 직접 호출
      { l:'🧹 정리', t:'정리 ', ex:'🧹 정리 1 → 1mm 이하 짧은 선과 모든 점 삭제 (치수 생략 시 도구바 칸 값). 선택된 도형 있으면 그 안에서만' },
      { l:'🖊 외곽선', action: () => { document.getElementById('headerBtnOutline')?.click(); },
        ex:'🖊 외곽선: 닫힌 영역을 클릭하면 경계를 닫힌 폴리라인(외곽선)으로 추출. 픽셀 계단 자동 정리. Esc=종료' },
      { l:'🎨 채움', action: () => { document.querySelector('.tool-strip-btn[data-tool=fill]')?.click(); },
        ex:'🎨 채움: 닫힌 영역 안을 클릭하면 색으로 채움 (영역 확정용). 채움 후 외곽선 추출 가능' },
    ],
  };
  const panel = document.getElementById('cmdPanel');
  const ci = document.getElementById('cmdInput');
  const pInput = document.getElementById('cmdPanelInput');
  const tabsEl = document.getElementById('cmdPanelTabs');
  const btnsEl = document.getElementById('cmdPanelBtns');
  const hintEl = document.getElementById('cmdPanelHint');
  if (!panel || !ci) return;

  function setBuf(v){ pInput.value = v; ci.value = v; }
  function appendBuf(s){ setBuf(pInput.value + s); }

  function renderTab(cat){
    btnsEl.innerHTML = '';
    (CMD_CATS[cat]||[]).forEach(c => {
      const b = document.createElement('button');
      b.className = 'cmd-pbtn'; b.textContent = c.l;
      // Rev.18.7: cycle 속성 - 클릭마다 다음 방향으로 순환하며 입력 (현재 입력의 첫 토큰 자리에)
      if (Array.isArray(c.cycle)){
        b.dataset.cycleIdx = '0';
        b.style.background = '#3a5545';  // 순환 버튼은 녹색 톤
        b.addEventListener('click', () => {
          const idx = parseInt(b.dataset.cycleIdx||'0', 10);
          const dir = c.cycle[idx];
          // 현재 버퍼 첫 토큰이 cycle 안에 있으면 교체, 아니면 새로 시작
          const cur = pInput.value;
          const firstTok = cur.trim().split(/\s+/)[0];
          let newBuf;
          if (c.cycle.includes(firstTok)){
            // 기존 방향 토큰만 교체 (뒤에 입력한 숫자는 유지)
            newBuf = cur.replace(/^\s*\S+/, dir);
          } else {
            // 새로 입력
            newBuf = dir + ' ';
          }
          setBuf(newBuf);
          b.textContent = `${dir} (다음: ${c.cycle[(idx+1)%c.cycle.length]})`;
          b.dataset.cycleIdx = String((idx+1) % c.cycle.length);
          hintEl.textContent = '🔁 ' + c.ex;
          ci.focus();
        });
      }
      // Rev.17.7: action 콜백이 있으면 직접 호출(도구 기능 링크), 없으면 기존처럼 명령 텍스트 채움
      else if (typeof c.action === 'function'){
        b.style.background = '#3a4a55';   // 함수형 버튼은 살짝 강조
        b.addEventListener('click', () => {
          hintEl.textContent = '▶ ' + c.ex;
          try { c.action(); }
          catch(e){ hintEl.textContent = '✗ 실행 오류: ' + (e.message||e); }
        });
      } else {
        b.addEventListener('click', () => {
          setBuf(c.t);
          hintEl.textContent = '📝 ' + c.ex;
          ci.focus();
        });
      }
      btnsEl.appendChild(b);
    });
    tabsEl.querySelectorAll('.cmd-ptab').forEach(t => t.classList.toggle('active', t.dataset.cat===cat));
  }
  // 탭 생성
  Object.keys(CMD_CATS).forEach((cat,i) => {
    const t = document.createElement('button');
    t.className = 'cmd-ptab' + (i===0?' active':''); t.textContent = cat; t.dataset.cat = cat;
    t.addEventListener('click', () => renderTab(cat));
    tabsEl.appendChild(t);
  });
  renderTab(Object.keys(CMD_CATS)[0]);

  // 숫자판
  document.querySelectorAll('#cmdPanelKeys .cpk').forEach(k => {
    k.addEventListener('click', () => {
      let v = k.dataset.k;
      // 방향/키워드는 앞뒤 공백 보장
      if (['좌','우','상','하','수직','수평','지','지름','교점'].includes(v.trim())){
        v = v.trim();
        if (pInput.value && !pInput.value.endsWith(' ')) v = ' ' + v;
        v = v + ' ';
      }
      appendBuf(v);
      ci.focus();
    });
  });
  document.getElementById('cmdPanelBack').addEventListener('click', () => setBuf(pInput.value.slice(0,-1)));
  document.getElementById('cmdPanelClear').addEventListener('click', () => setBuf(''));
  document.getElementById('cmdPanelRun').addEventListener('click', () => {
    const v = pInput.value.trim();
    if (!v) return;
    if (typeof executeCommand === 'function') executeCommand(v);
    setBuf(''); ci.value = '';
  });

  // 열기/닫기
  const openBtn = document.getElementById('headerBtnCmdPanel');
  if (openBtn) openBtn.addEventListener('click', () => {
    panel.style.display = (panel.style.display==='none') ? 'flex' : 'none';
  });
  document.getElementById('cmdPanelClose').addEventListener('click', () => { panel.style.display='none'; });

  // Rev.19.14: 클릭연결 토글
  const pcToggle = document.getElementById('penConnectToggle');
  if (pcToggle){
    pcToggle.addEventListener('click', () => {
      penConnectMode2 = !penConnectMode2;
      penConnectPrev = -1;   // 토글 시 시작점 초기화
      if (penConnectMode2){
        pcToggle.textContent = '🔗 클릭연결 ON — 점→점 클릭으로 선 연결 (다시 누르면 OFF)';
        pcToggle.style.background = '#2a6e2a';
        pcToggle.style.color = '#fff';
        // 클릭연결은 텍스트 모드에서만 의미. 텍스트모드 아니면 켜줌
        if (typeof penPickMode !== 'undefined' && !penPickMode && typeof startTextMode === 'function'){
          startTextMode();
        }
        document.getElementById('statusHint').textContent = '🔗 클릭연결 ON: 점을 클릭한 뒤 다른 점을 클릭하면 선이 연결됩니다';
      } else {
        pcToggle.textContent = '🔗 클릭연결 OFF — 켜면 점→점 클릭 시 선 자동 연결';
        pcToggle.style.background = '#2d3a45';
        pcToggle.style.color = '#cfe';
        document.getElementById('statusHint').textContent = '🔗 클릭연결 OFF';
      }
    });
  }

  // 드래그 이동
  const head = document.getElementById('cmdPanelHead');
  let dragging=false, ox=0, oy=0;
  head.addEventListener('mousedown', e => {
    dragging=true; const r=panel.getBoundingClientRect();
    ox=e.clientX-r.left; oy=e.clientY-r.top; e.preventDefault();
  });
  window.addEventListener('mousemove', e => {
    if(!dragging) return;
    panel.style.left=(e.clientX-ox)+'px'; panel.style.top=(e.clientY-oy)+'px'; panel.style.right='auto';
  });
  window.addEventListener('mouseup', () => { dragging=false; });
})();

// ===== Rev.17.5: 명령창 통합 - .txt 한 줄씩 명령창에 자동 채움 (이전 스크립트 패널 대체) =====
(function(){
  const loadBtn = document.getElementById('cmdScriptLoad');
  const nextBtn = document.getElementById('cmdScriptNext');
  const progEl = document.getElementById('cmdScriptProg');
  const ci = document.getElementById('cmdInput');
  if (!loadBtn || !ci) return;

  let lines = [];   // 줄 배열 (원본 그대로, 빈 줄/주석 포함)
  let idx = 0;      // 다음에 채울 줄 인덱스
  let execCount = 0;
  let totalExec = 0;   // 주석/빈 줄 제외 총 실행 명령 수

  function updateProg(){
    if (lines.length === 0){
      progEl.style.display = 'none'; nextBtn.style.display = 'none'; return;
    }
    progEl.style.display = ''; nextBtn.style.display = '';
    progEl.textContent = `${execCount}/${totalExec}`;
    progEl.title = `실행 ${execCount}/${totalExec} 줄 · 다음 줄 ${idx+1}/${lines.length}`;
  }
  function isExec(s){
    const t = (s||'').trim();
    return !(t === '' || t.startsWith('#') || t.startsWith('//'));
  }
  function fillNext(){
    // 다음 실행 가능한 줄까지 진행하면서 명령창에 채움. 주석/빈 줄은 건너뜀.
    while (idx < lines.length && !isExec(lines[idx])){
      idx++;
    }
    if (idx >= lines.length){
      ci.value = '';
      ci.placeholder = `✓ 스크립트 완료 (${execCount}줄 실행) — 새로 불러오려면 📁 .txt`;
      updateProg();
      document.getElementById('statusHint').textContent = `📜 스크립트 ${execCount}줄 모두 실행 완료`;
      return false;
    }
    ci.value = lines[idx].trim();
    ci.focus();
    // 커서를 줄 끝으로
    setTimeout(() => { try{ ci.setSelectionRange(ci.value.length, ci.value.length);}catch(e){} }, 0);
    updateProg();
    document.getElementById('statusHint').textContent = `📜 ${idx+1}/${lines.length} 줄: ${ci.value.slice(0,40)}${ci.value.length>40?'…':''} (Enter로 실행 → 다음 자동 채움)`;
    return true;
  }
  function loadText(text, srcName){
    lines = text.replace(/\r\n/g, '\n').split('\n');
    totalExec = lines.filter(isExec).length;
    idx = 0; execCount = 0;
    if (totalExec === 0){
      alert('스크립트에 실행할 명령이 없습니다 (주석/빈 줄만 있음).');
      lines = []; updateProg(); return;
    }
    fillNext();
    document.getElementById('statusHint').textContent = `📜 ${srcName||'스크립트'} 불러옴 — 총 ${totalExec}개 명령. Enter로 한 줄씩 실행`;
  }

  // 파일 불러오기
  loadBtn.addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.txt,text/plain';
    inp.onchange = (e) => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = ev => loadText(ev.target.result, f.name);
      r.readAsText(f, 'utf-8');
    };
    inp.click();
  });

  // 다음 줄 (현재 줄 건너뛰기)
  nextBtn.addEventListener('click', () => {
    if (lines.length === 0) return;
    idx++;   // 현재 줄은 안 실행하고 건너뜀
    fillNext();
  });

  // 명령창에서 Enter로 실행 후 자동으로 다음 줄 채우기
  // (cmdInput keydown 'Enter' 처리는 core.js에서 executeCommand 호출 + value=''. 그 직후 자동 채움)
  ci.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key !== 'Enter') return;
    if (lines.length === 0) return;   // 스크립트 없으면 그대로
    // core의 keydown 핸들러가 먼저 executeCommand 실행 후 value를 비움. 그 다음 우리가 채움.
    setTimeout(() => {
      // 방금 실행한 줄이 현재 idx 줄이라고 가정 (사용자가 그대로 Enter)
      execCount++;
      idx++;
      fillNext();
    }, 0);
  });
})();
// ===== Rev.17.4: 도형 팝업/패널 드래그 이동 (lineDimPop, baseLinePop, shapePropPanel) =====
(function(){
  function makeDraggable(elId){
    const el = document.getElementById(elId);
    if (!el) return;
    // 시각적 힌트(상단 살짝 강조)와 커서
    if (!el.dataset.dragInit){
      el.dataset.dragInit = '1';
      const hint = document.createElement('div');
      hint.style.cssText = 'position:absolute; left:0; right:0; top:0; height:6px; cursor:move; background:rgba(255,255,255,0.08); border-radius:6px 6px 0 0;';
      hint.title = '드래그하여 이동';
      // 패널이 relative position 아닐 수 있으니, 절대 핸들이 잘 보이게 패딩-상단을 살짝
      if (getComputedStyle(el).position === 'static') el.style.position = 'fixed';
      el.insertBefore(hint, el.firstChild);
      // 패딩 상단 약간 늘려 핸들 안 가리게
      const oldPadTop = parseInt(getComputedStyle(el).paddingTop) || 10;
      el.style.paddingTop = (oldPadTop + 4) + 'px';
    }
    let dragging=false, ox=0, oy=0;
    // 헤더 핸들(맨 위 6px)을 잡았을 때 + 패널 빈 공간(input/button/select/textarea 외)을 잡았을 때 드래그
    el.addEventListener('mousedown', e => {
      const t = e.target;
      const isInteractive = t.closest('input, button, select, textarea, label[for], a');
      const rect = el.getBoundingClientRect();
      const onTopBar = (e.clientY - rect.top) <= 10;   // 상단 10px 영역
      if (!onTopBar && isInteractive) return;
      dragging = true;
      ox = e.clientX - rect.left;
      oy = e.clientY - rect.top;
      el.style.right = 'auto';   // 좌표 left/top로 전환
      el.style.bottom = 'auto';
      e.preventDefault();
    });
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      let nx = e.clientX - ox, ny = e.clientY - oy;
      // 화면 밖으로 너무 나가지 않게
      const W = window.innerWidth, H = window.innerHeight;
      const r = el.getBoundingClientRect();
      nx = Math.max(-r.width+40, Math.min(W-40, nx));
      ny = Math.max(0, Math.min(H-40, ny));
      el.style.left = nx + 'px';
      el.style.top = ny + 'px';
    });
    window.addEventListener('mouseup', () => { dragging=false; });
  }
  // 패널은 늦게 생길 수도 있으니, DOM이 준비된 다음 한 번 시도하고
  // 표시될 때 다시 한 번 확인 (display 변경 시 init 보장)
  function applyAll(){
    ['lineDimPop','baseLinePop','shapePropPanel','moveDeltaPanel'].forEach(makeDraggable);
  }
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', applyAll);
  } else {
    applyAll();
  }
})();

// ===== Rev.17.6: AI 프롬프트 (도면→.txt 작도 스크립트 생성용) =====
(function(){
  const btn = document.getElementById('cmdAiPrompt');
  const modal = document.getElementById('aiPromptModal');
  const txt = document.getElementById('aiPromptText');
  const copyBtn = document.getElementById('aiPromptCopy');
  const closeBtn = document.getElementById('aiPromptClose');
  const status = document.getElementById('aiPromptStatus');
  if (!btn || !modal || !txt) return;

  const PROMPT = `아래는 "도면 작도기" 웹 도구의 텍스트 명령 문법입니다.
첨부한 도면 이미지를 분석해, 단면 윤곽을 따라가는 작도 명령 .txt를 만들어 주세요.

[목적]
씰·가스켓·O-링 등 단면 형상 도면을 텍스트 명령 시퀀스로 변환합니다.
사람이 도면을 보고 한 줄씩 명령을 짜는 대신, AI가 도면을 보고 자동으로 명령 목록을 만들어 주는 것이 목표입니다.

[좌표 시스템]
- 단위: mm
- 원점(0,0): 도면 우측 하단 (중심축 위 끝점). 사용자가 텍스트 모드 시작 후 마우스 클릭으로 지정합니다.
- X축: 우측이 +, 좌측이 - (도면 좌측으로 갈수록 X 감소)
- Y축: 위쪽이 +, 아래쪽이 - (도면 위로 갈수록 Y 증가)
- 각도: 양의 X축이 0°, 반시계 방향이 +

[출력 형식 규칙]
- 한 줄에 한 명령
- 주석은 # 으로 시작 (실행 안 됨)
- 빈 줄 허용 (건너뜀)
- 첫 부분에 도면 정보(제품명·치수 요약)를 # 주석으로 적기
- 명령 순서는 단면 윤곽 흐름을 따라가는 순서 (보통 우측 하단 → 좌측 → 위 → 우측)
- 끝에 "두께 1 N 좌" (또는 우) — 1번부터 마지막 점 N번까지 소재두께만큼 한쪽 평행 추가

[기본 명령]
기준 X Y         원점 기준 (X,Y)mm 위치에 기준점 0번 (텍스트 모드 시작 직후 보통 "기준 0 0")
우 N             현재점에서 우측 N mm 직선
좌 N             현재점에서 좌측 N mm 직선
상 N             현재점에서 위쪽 N mm 직선
하 N             현재점에서 아래쪽 N mm 직선

[방향 + 교점/기준]
좌 교점          좌측으로 직진하다 첫 교점까지 (우/상/하도 동일)
좌 지 D1 D2      좌측으로 (D1-D2)/2 mm 직선 (지름차 → 반지름차)  예: 좌 지 79.6 74.8 → 좌측 2.4mm
선 좌 교점       위와 동일 (선 prefix는 선택)
점 좌 N          현재점서 좌측 N mm에 독립 점 (선 안 그음)
기준 좌 N        현재점서 좌측 N mm에 기준점

[각도]
각 A D           현재점에서 각도 A° 방향으로 D mm 선
각 A 교점        그 방향으로 직진하다 첫 교점까지
각 A 수평 V      그 방향으로 직진하다 원점 기준 Y=V 수평선까지
각 A 수직 V      그 방향으로 직진하다 원점 기준 X=V 수직선까지

[호(R)]
호 i1 i2 시계 각 A      중심 i1번 점, 시작 i2번 점, 시계방향 A° 호
호 i1 i2 반시계 각 A    반시계방향 A°
호 i1 i2 시계 교점      시계 방향으로 직진하다 첫 교점까지 (반시계도 동일)

[교점·절교]
교점                    모든 선·원·호의 교차점에 번호 부여 (선-선, 선-원, 원-원)
절교 9 10 3 수직        9→10 선을 3번 점의 수직선(X=3.x)까지 연장
절교 9 10 3 수평        9→10 선을 3번 점의 수평선(Y=3.y)까지 연장
절교 1 하 수평 0        1번 점에서 아래 방향이 0번 점의 수평선과 만나는 곳까지

[편집·평행]
연결 1 4                1번과 4번 점을 직선으로 연결
이동 상 3               현재점을 위로 3mm 이동
이동 1 우 10            1번 점을 우측 10mm 이동
거리두기 2 3 좌 0.6     2→3 선을 진행 방향 좌측으로 0.6mm 평행 복제
삭제 1 2                1-2번 선 삭제
삭제 3                  3번 점 삭제
닫기                    현재점을 0번 점으로 직선 연결 (단면 닫기)
백                      직전 1회 취소

[두께 (소재 두께 평행 복제) — 가장 중요]
두께 1 5 좌             1~5번 경로(꺾인선·호 포함)를 거리두기 칸 두께만큼 좌측 평행
두께 1 5 우             우측
(양쪽 생성은 제거됨 — 좌/우 한쪽만. 반대쪽도 필요하면 우측으로 한 번 더)

* "거리두기 칸"은 도구 상단의 두께 입력칸(기본 0.6 같은 값).
* 두께 명령은 보통 .txt 마지막에 한 번 호출해 단면을 완성합니다.

[작도 흐름 예시 — 단순 ㄷ자 단면]
# 제품: 예시 단면
# 외경=20mm, 내경=15mm, 깊이=3mm, 소재두께=0.6mm
기준 0 0
좌 2.5
하 3
좌 2.5
상 3
두께 1 4 좌

[중요한 작도 원칙]
1. 도면의 단면 윤곽 한쪽 선을 따라가는 게 가장 깔끔합니다. 마지막에 "두께 N 좌"(또는 우)로 소재두께만큼 평행선을 만들어 단면 윤곽을 완성합니다.
2. 지름은 우측 기준(중심축에서의 거리)으로 표기되니, 원점이 우측 하단이면 "좌 지 D1 D2" 형식으로 반지름 차를 자연스럽게 쓸 수 있습니다.
3. 호(R)는 중심점이 먼저 정의돼야 합니다. R0.4 모서리라면 그 호의 중심점을 점 번호로 잡은 뒤 "호 중심번호 시작번호 시계/반시계 각 90" 식으로 그립니다.
4. 도면에서 정확한 치수를 못 읽으면 # 주석으로 "??" 표시해 사용자가 수정할 수 있게 하세요.
5. 모든 치수는 mm 단위, 소수점 첫째 자리까지가 일반적입니다 (예: 79.6, 0.4).

[치수 읽기 규칙 — 매우 중요]
도면에는 다양한 표기가 있습니다. 작도에 쓸 치수와 무시할 표기를 정확히 구분해야 합니다.

★ 작도에 쓸 치수 (주요 치수, 보통 숫자만 표기됨):
  - Ø79.6, Ø74.8 같은 지름값 (Ø 기호 + 숫자)
  - 0.4, 3.7, 1.5 같은 길이/두께/단차 값
  - R0.4, R1.0 같은 모서리 호의 반지름 (R + 숫자)
  - 106° 같은 각도

★ 무시할 표기:
  - 괄호 안 숫자: (0.35), (R0.5), (R1) — 참고 치수일 뿐 작도에 안 씀
  - 공차: ±0.1, ±0.05, +0.1/-0.2, +0.20/-0.05 → 본값만 쓰고 공차는 버림
    예) "4 +0.1 -0.2" → 4 만 사용. "Ø64.84±0.04" → 64.84만 사용
  - 표면 거칠기 기호, 기하공차 기호(◇, ⊥, ⊙ 등)와 그 안의 숫자
  - 데이텀 기호(M, SC, A1, B1 같은 영문/번호)
  - T.S.C 같은 영역 표시는 그냥 지름 표기로만 취급 (T.S.C Ø64.8 → 64.8 사용)
  - 표기 옆 작은 원 안 번호(①, ②, ⑬ 같은 식별 번호): 도면 내 부품/항목 식별용일 뿐 치수가 아님

요약: **본값만 쓰고 공차·괄호·기호·번호는 무시.** 도면에 "Ø64.84±0.04"가 있으면 64.84만, "4 +0.1 -0.2"는 4만 사용합니다.

[당신의 작업]
1. 첨부한 도면의 단면 형상과 치수를 분석해 주세요.
2. 우측 하단 원점에서 시작해 단면 중심선(또는 한쪽 윤곽)을 따라가는 명령 시퀀스를 만들어 주세요.
3. 첫 부분에 # 주석으로 도면 요약(주요 치수)을 적어 주세요.
4. 끝에 "두께 1 N 좌"(또는 우) 명령으로 마무리해 주세요(N = 마지막 점 번호).
5. 결과는 .txt로 바로 쓸 수 있는 형식으로 출력해 주세요. 코드 블록(\`\`\`)으로 감싸 주시면 복사가 편합니다.
6. 도면에서 명확히 안 읽히는 치수는 # 주석으로 표시해 주세요.

준비되셨으면, 도면 이미지를 분석해 .txt를 만들어 주세요.
`;

  function open(){
    txt.value = PROMPT;
    status.textContent = '';
    modal.style.display = 'flex';
  }
  function close(){ modal.style.display = 'none'; }

  btn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

  copyBtn.addEventListener('click', async () => {
    try{
      await navigator.clipboard.writeText(txt.value);
      status.style.color = '#5fcf8a';
      status.textContent = '✓ 클립보드에 복사됨. 다른 AI 채팅창에 붙여넣고 도면 이미지를 첨부하세요.';
    } catch(e){
      // 폴백: 선택해서 사용자가 직접 복사
      txt.select(); txt.setSelectionRange(0, txt.value.length);
      try { document.execCommand('copy'); status.style.color='#5fcf8a'; status.textContent='✓ 복사됨 (폴백 방식). 텍스트가 선택됐으니 Ctrl+C로도 가능.'; }
      catch(e2){ status.style.color='#ff8888'; status.textContent='✗ 자동 복사 실패. 텍스트를 직접 선택해 Ctrl+C로 복사하세요.'; }
    }
  });
})();
