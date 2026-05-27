// ##### draw_tool_core2.js  Rev.16.69  최신본 — 명령어 (점·선[선 좌 교점/선 좌 지]·지름·거리두기·연장·절교/절각·점방향교점·기준점·각교점·호·=수식·이동) #####
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
function penWorldOrigin(){ return { x: baseW * 0.85, y: baseH * 0.78 }; }
// mm(위=+Y 도면좌표) → 픽셀(아래=+Y). 원점은 중앙
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
  const idx = penFindNearestPoint(p);
  if (idx < 0){
    // 빈 곳 클릭: 연결 대기중이면 선택 해제만, 아니면 그 좌표를 기준점(앵커)으로
    if (penPickFirst >= 0){ penPickFirst = -1;
      document.getElementById('statusHint').textContent='선택 해제'; redrawDraw(); return true; }
    const a = penAddAnchor(p.x, p.y);   // Rev.16.53: 빈 곳 클릭 = 기준점
    const m = penPxToMm(p.x, p.y);
    cmdLog(`✛ 기준점 ${a} = (${Math.round(m.x*10)/10}, ${Math.round(m.y*10)/10})mm (마우스)`,'user');
    penPickFirst = a;
    redoStack=[]; pushHistory(); redrawDraw(); updateCount();
    document.getElementById('statusHint').textContent=`✛ 기준점 ${a} 생성 · 여기서 우/좌/상/하로 이어그리기`;
    return true;
  }
  if (penPickFirst < 0){ penPickFirst=idx; penCur=idx;
    const m=penPxToMm(penPoints[idx].x,penPoints[idx].y);
    document.getElementById('statusHint').textContent=`▸ ${idx}번 점 선택 (${Math.round(m.x*10)/10}, ${Math.round(m.y*10)/10})mm · 다른 점 클릭=연결`;
    redrawDraw(); return true; }
  if (idx === penPickFirst) return true;
  penAddLine(penPoints[penPickFirst].x,penPoints[penPickFirst].y,penPoints[idx].x,penPoints[idx].y);
  cmdLog(`✎ 선 P${penPickFirst}-P${idx} 연결 (마우스)`,'user');
  penCur=idx; penPickFirst=idx;
  redoStack=[]; pushHistory(); if(typeof redrawFills==='function')redrawFills(); redrawDraw(); updateCount();
  return true;
}

function penAddPoint(px, py){
  // Rev.16.34: 이미 같은 위치에 번호 점이 있으면 그 번호를 현재점으로 (중복 생성 방지)
  const tolPx = 1/mmPerPixel * 0.05;
  for (let i=0;i<penPoints.length;i++){
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
function penAddLine(x1,y1,x2,y2){
  const sw = parseInt(document.getElementById('strokeWidth').value) || 1;
  const stroke = document.getElementById('strokeColor').value || '#ffffff';
  const newLine = { id:++shapeIdSeq, type:'line', p1:{x:x1,y:y1}, p2:{x:x2,y:y2}, stroke, strokeWidth:sw, layer:(currentLayer||'default') };
  shapes.push(newLine);
  // Rev.16.34: 새 선이 기존 선들과 만나는 교차점 자동 번호 부여
  penAutoIntersect(newLine);
}
// Rev.16.34: 주어진 선과 기존 다른 선들의 교차점을 찾아 자동으로 번호 점 추가
function penAutoIntersect(newLine){
  const tolPx = 1/mmPerPixel * 0.05;  // 0.05mm 이내 중복 무시
  const dup = (x,y) => penPoints.some(p => Math.hypot(p.x-x, p.y-y) < tolPx);
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
  if (!toks.length) return false;

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
  if (toks[0] === '교점' || toks[0] === 'INTERSECT' || toks[0] === 'IX'){
    const lines = shapes.filter(s => s.type === 'line' && s.p1 && s.p2);
    if (lines.length < 2){
      document.getElementById('statusHint').textContent = '교점: 선이 2개 이상 필요합니다';
      return true;
    }
    // 모든 선쌍의 교차점(선분 내부) 수집, 중복 제거
    const found = [];
    const isDup = (x,y) => found.some(p => Math.hypot(p.x-x, p.y-y) < 1/mmPerPixel*0.05) // 0.05mm 이내 중복
                        || penPoints.some(p => Math.hypot(p.x-x, p.y-y) < 1/mmPerPixel*0.05);
    for (let i=0;i<lines.length;i++){
      for (let j=i+1;j<lines.length;j++){
        const ix = lineSegmentIntersection(lines[i].p1, lines[i].p2, lines[j].p1, lines[j].p2);
        if (ix && !isDup(ix.x, ix.y)){ found.push({x:ix.x, y:ix.y}); }
      }
    }
    if (found.length === 0){
      document.getElementById('statusHint').textContent = '교점: 새로운 교차점이 없습니다';
      return true;
    }
    const first = penPoints.length;
    found.forEach(p => penAddPoint(p.x, p.y));
    penFinish(`✕ 교점 ${found.length}개에 번호 부여 (${first}~${penPoints.length-1})`);
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

  // Rev.16.48: 점 상 2.5 - 현재 선택점에서 방향으로 거리만큼 떨어진 곳에 점만 찍기(선 포함 안 함)
  if (toks[0] === '점' && toks.length >= 3
      && ['상','하','좌','우','U','D','L','R'].includes(toks[1])){
    if (penCur < 0 || !penPoints[penCur]){
      document.getElementById('statusHint').textContent = '⚠ 먼저 점을 선택하세요 (점 5 또는 점 클릭)'; return true;
    }
    const pdir = toks[1]; const pdist = evalExpr(toks[2]);
    if (!isFinite(pdist)) return false;
    const base = penPoints[penCur]; const dpx = pdist/mmPerPixel;
    let nx=base.x, ny=base.y;
    if (pdir==='우'||pdir==='R') nx+=dpx;
    else if (pdir==='좌'||pdir==='L') nx-=dpx;
    else if (pdir==='상'||pdir==='U') ny-=dpx;
    else if (pdir==='하'||pdir==='D') ny+=dpx;
    penAddPoint(nx, ny);
    penFinish(`• ${penCur}번 점 = 이전점에서 ${pdir} ${pdist}mm (독립 점)`);
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
  if (toks[0] === '절교' && parsePenIdx(toks[1]) != null && parsePenIdx(toks[2]) != null){
    const i1 = parsePenIdx(toks[1]), i2 = parsePenIdx(toks[2]);
    if (!penPoints[i1] || !penPoints[i2]) return false;
    const a = penPoints[i1], b = penPoints[i2];
    const len = Math.hypot(b.x-a.x, b.y-a.y);
    if (len < 1e-6) return true;
    const ux = (b.x-a.x)/len, uy = (b.y-a.y)/len;
    let nx, ny;
    // Rev.16.66: 절교 3 4 점 5 - 5번 점을 연장선에 수직투영한 위치까지
    if (toks[3] === '점'){
      const ti = parsePenIdx(toks[4]);
      if (ti == null || !penPoints[ti]){ document.getElementById('statusHint').textContent=`절교: ${toks[4]}번 점이 없습니다`; return true; }
      const T = penPoints[ti];
      const proj = (T.x-b.x)*ux + (T.y-b.y)*uy;   // b에서 방향으로 투영거리
      nx = b.x + ux*proj; ny = b.y + uy*proj;
    } else {
      // 축+값: 'X0' / 'X 0' 모두 허용
      let axisTok = toks[3] || '';
      let axis, val;
      const m = axisTok.match(/^([XY])\s*(.*)$/i);
      if (m){ axis = m[1].toUpperCase(); val = (m[2] !== '') ? evalExpr(m[2]) : evalExpr(toks[4]); }
      else { document.getElementById('statusHint').textContent = '절교: 절교 3 4 x0 / y3 / 점 5 형식'; return true; }
      if (!isFinite(val)) return false;
      if (axis === 'X'){
        if (Math.abs(ux) < 1e-6){ document.getElementById('statusHint').textContent='절교: 세로선은 X좌표로 도달 불가'; return true; }
        const targetPx = penMmToPx(val, 0).x;
        const t = (targetPx - b.x) / ux;
        nx = b.x + ux*t; ny = b.y + uy*t;
      } else {
        if (Math.abs(uy) < 1e-6){ document.getElementById('statusHint').textContent='절교: 가로선은 Y좌표로 도달 불가'; return true; }
        const targetPy = penMmToPx(0, val).y;
        const t = (targetPy - b.y) / uy;
        nx = b.x + ux*t; ny = b.y + uy*t;
      }
    }
    const ln = penFindLineByEndpoints(i1, i2);
    if (ln){
      const which = (Math.hypot(ln.p1.x-b.x, ln.p1.y-b.y) < Math.hypot(ln.p2.x-b.x, ln.p2.y-b.y)) ? 'p1' : 'p2';
      ln[which] = { x:nx, y:ny };
      penPoints[i2] = { x:nx, y:ny };
      penUpdateLabel(i2, nx, ny);
      penFinish(`↦ ${i1}-${i2} 선 ${axis}=${val}까지 절대연장`);
    } else {
      penAddLine(a.x, a.y, nx, ny);
      const ne = penAddPoint(nx, ny);
      penFinish(`↦ ${i1}-${i2} 방향 ${axis}=${val}까지 절대연장 선생성 → P${ne}`);
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
    // Rev.16.66: 절각 3 45 점 5 - 5번 점을 연장선에 수직투영한 위치까지
    if (toks[3] === '점'){
      const ti = parsePenIdx(toks[4]);
      if (ti == null || !penPoints[ti]){ document.getElementById('statusHint').textContent=`절각: ${toks[4]}번 점이 없습니다`; return true; }
      const T = penPoints[ti];
      const proj = (T.x-sp2.x)*ux + (T.y-sp2.y)*uy;
      nx = sp2.x + ux*proj; ny = sp2.y + uy*proj; label = `점 ${ti}`;
    } else {
      let axisTok = toks[3] || '';
      let axis, val;
      const m = axisTok.match(/^([XY])\s*(.*)$/i);
      if (m){ axis = m[1].toUpperCase(); val = (m[2] !== '') ? evalExpr(m[2]) : evalExpr(toks[4]); }
      else { document.getElementById('statusHint').textContent = '절각: 절각 3 45 Y10 / x0 / 점 5 형식'; return true; }
      if (!isFinite(val)) return false;
      if (axis === 'X'){
        if (Math.abs(ux) < 1e-6){ document.getElementById('statusHint').textContent='절각: 수직(90/270°)은 X좌표 도달 불가'; return true; }
        const targetPx = penMmToPx(val, 0).x;
        const t = (targetPx - sp2.x) / ux;
        nx = sp2.x + ux*t; ny = sp2.y + uy*t;
      } else {
        if (Math.abs(uy) < 1e-6){ document.getElementById('statusHint').textContent='절각: 수평(0/180°)은 Y좌표 도달 불가'; return true; }
        const targetPy = penMmToPx(0, val).y;
        const t = (targetPy - sp2.y) / uy;
        nx = sp2.x + ux*t; ny = sp2.y + uy*t;
      }
      label = `${axis}=${val}`;
    }
    penAddLine(sp2.x, sp2.y, nx, ny);
    const ne = penAddPoint(nx, ny);
    penFinish(`↦ P${si}에서 ${ang}° 방향 ${label}까지 절대연장 → P${ne}`);
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

    penAddLine(na.x,na.y,nb.x,nb.y);
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
  penPoints = pts.slice(0, n);
  penLabelIds = labels.slice(0, n);
  penCur = penPoints.length - 1;
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

// Rev.16.46/51: 텍스트입력(한붓그리기) 시작
(function(){
  const btn = document.getElementById('headerBtnPenInput');
  if (!btn) return;
  btn.addEventListener('click', () => {
    penPoints = []; penLabelIds = []; penCur = -1;
    penPickMode = true; penPickFirst = -1; pointMode = false;
    const ci = document.getElementById('cmdInput');
    if (ci){ ci.focus(); ci.value = ''; }
    document.getElementById('statusHint').textContent =
      `⌨ 한붓그리기: 점=명령(점 X,Y / 점 상 2.5 / 점 좌 지 110 130) · 선=좌/우/상/하/각, 선 좌 지 110 130 · 점 클릭=선택 · 수식 =(100-90)/2`;
    cmdLog(`⌨ 한붓그리기 시작`, 'system');
  });
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

