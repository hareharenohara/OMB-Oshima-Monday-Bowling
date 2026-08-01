/* 共通のフレーム表示・投球統計ロジック */
function throwToPins(t) {
  if (t === 'X' || t === 'x') return 10;
  if (t === '/') return null;
  if (t === '-' || t === 'G' || t === 'g' || t === 'F' || t === 'f') return 0;
  const n = parseInt(t, 10);
  return isNaN(n) ? null : n;
}

function frameSlotCount(idx) { return idx === 9 ? 3 : 2; }

function padThrowsForDisplay(throwsArr, idx) {
  const n = frameSlotCount(idx);
  let arr = (throwsArr || []).map(v => String(v));
  if (idx < 9 && arr.length === 1 && arr[0].trim().toUpperCase() === 'X') {
    arr = ['', arr[0]];
  }
  arr = arr.slice(0, n);
  while (arr.length < n) arr.push('');
  return arr;
}

function renderThrowMark(raw, isFirstThrow, isSplit) {
  const t = (raw == null ? '' : String(raw)).trim().toUpperCase();
  if (t === '') return '<span class="mark-blank"></span>';
  if (t === 'X') {
    return `<svg class="mark-icon" viewBox="0 0 100 100" preserveAspectRatio="none">
      <polygon points="0,0 0,100 50,50"/><polygon points="100,0 100,100 50,50"/>
    </svg>`;
  }
  if (t === '/') {
    return `<svg class="mark-icon" viewBox="0 0 100 100" preserveAspectRatio="none">
      <polygon points="100,0 100,100 0,100"/>
    </svg>`;
  }
  if (t === '-') return '<span class="mark-miss" title="ノーヘッド">－</span>';
  if (t === 'G') return '<span class="mark-miss" title="ガター">G</span>';
  if (t === 'F') return '<span class="mark-miss" title="ファール">F</span>';
  if (isSplit && isFirstThrow && /^\d+$/.test(t)) {
    return `<svg class="mark-icon" viewBox="0 0 100 100" preserveAspectRatio="none">
      <circle cx="50" cy="50" r="42" stroke-width="8"/>
      <text x="50" y="68" font-size="52" font-weight="bold" text-anchor="middle">${escapeHtml(t)}</text>
    </svg>`;
  }
  return `<span class="mark-num">${escapeHtml(t)}</span>`;
}

function blankFrames() {
  return Array.from({ length: 10 }, () => ({ throws: [], score: null, is_split: false }));
}

function ensureGameFrameData(memberId, gameNumber) {
  if (!scannedFrameData[memberId]) scannedFrameData[memberId] = {};
  if (!scannedFrameData[memberId][gameNumber]) {
    scannedFrameData[memberId][gameNumber] = { frames: blankFrames(), total: null };
  }
  return scannedFrameData[memberId][gameNumber];
}

function computeAdvancedFrameStats(filteredAtt) {
  let firstBallPinsSum = 0, firstBallCount = 0;
  let strikeFrames = 0, spareFrames = 0, openFrames = 0, totalFrames = 0;
  let splitTotal = 0, splitCovered = 0;
  let frame10PointsSum = 0, frame10Count = 0, maxFrame10Points = null;
  let doublesCount = 0, turkeysCount = 0, gamesWithFrames = 0;

  filteredAtt.forEach(att => {
    (att.games || []).forEach(g => {
      const frames = g.frames || [];
      const hasData = frames.some(f => f.score != null || (f.throws && f.throws.length));
      if (!hasData) return;
      gamesWithFrames++;

      const strikeFlags = [];
      frames.forEach((f, idx) => {
        const t0 = f.throws && f.throws[0];
        const t1 = f.throws && f.throws[1];
        if (t0 === undefined || t0 === null || t0 === '') return;

        const p0 = throwToPins(t0);
        if (p0 != null) { firstBallPinsSum += p0; firstBallCount++; }

        const isStrike = (t0 === 'X' || t0 === 'x');
        const isSpare = !isStrike && t1 === '/';
        strikeFlags.push(isStrike);

        totalFrames++;
        if (isStrike) strikeFrames++;
        else if (isSpare) spareFrames++;
        else if (t1 !== undefined && t1 !== null && t1 !== '') openFrames++;

        if (f.is_split) {
          splitTotal++;
          if (isSpare) splitCovered++;
        }

        if (idx === 9) {
          const prevScore = frames[8] && frames[8].score != null ? frames[8].score : null;
          const finalScore = f.score != null ? f.score : g.score;
          if (prevScore != null && finalScore != null) {
            const f10pts = finalScore - prevScore;
            frame10PointsSum += f10pts;
            frame10Count++;
            if (maxFrame10Points == null || f10pts > maxFrame10Points) maxFrame10Points = f10pts;
          }
        }
      });

      let run = 0;
      strikeFlags.forEach(isStrike => {
        if (isStrike) run++;
        else {
          if (run === 2) doublesCount++;
          else if (run >= 3) turkeysCount++;
          run = 0;
        }
      });
      if (run === 2) doublesCount++;
      else if (run >= 3) turkeysCount++;
    });
  });

  return {
    firstBallAvg: firstBallCount > 0 ? firstBallPinsSum / firstBallCount : null,
    strikeRate: totalFrames > 0 ? (strikeFrames / totalFrames) * 100 : null,
    markRate: totalFrames > 0 ? ((strikeFrames + spareFrames) / totalFrames) * 100 : null,
    openFrameRate: totalFrames > 0 ? (openFrames / totalFrames) * 100 : null,
    splitCoverRate: splitTotal > 0 ? (splitCovered / splitTotal) * 100 : null,
    splitTotal,
    splitCovered,
    frame10Avg: frame10Count > 0 ? frame10PointsSum / frame10Count : null,
    maxFrame10Points,
    doublesPerGame: gamesWithFrames > 0 ? doublesCount / gamesWithFrames : null,
    turkeysPerGame: gamesWithFrames > 0 ? turkeysCount / gamesWithFrames : null,
    turkeysTotal: turkeysCount,
    gamesWithFrames,
    totalFrames
  };
}
