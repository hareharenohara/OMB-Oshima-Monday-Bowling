    /* ---------------------------------------------------------
       ③ マイページ・グラフ描画
       --------------------------------------------------------- */
    function showMyPage(memberId) {
      currentMyPageMemberId = memberId;
      clearGraphDateFilter();

      // 自分自身のページかどうかで、アバター変更のタップ可否を切り替える
      const isOwnPage = (memberId === supabaseMemberId);
      const avatarWrapper = document.querySelector('#modal-mypage .avatar-wrapper.mypage');
      if (avatarWrapper) {
        avatarWrapper.onclick = isOwnPage ? showAvatarPicker : null;
        avatarWrapper.style.cursor = isOwnPage ? 'pointer' : 'default';
        avatarWrapper.title = isOwnPage ? 'タップしてアバター変更' : '';
      }

      // ランキング／過去のスコア履歴／称号・実績は開くたびに必ず閉じた状態にする
      document.getElementById('mypage-ranking-full').style.display = 'none';
      document.getElementById('toggle-ranking-btn').innerText = '詳細を見る ▼';
      document.getElementById('mypage-ranking-filter').value = 'month';

      document.getElementById('mypage-history-full').style.display = 'none';
      document.getElementById('toggle-history-btn').innerText = '表示する ▼';

      document.getElementById('mypage-ach-full').style.display = 'none';
      document.getElementById('toggle-ach-btn').innerText = '一覧を見る ▼';

      showModal('modal-mypage');
      // スクロールされた状態から開かれても必ず一番上から表示する
      const content = document.getElementById('modal-mypage').querySelector('.modal-content');
      if (content) content.scrollTop = 0;
    }

    function clearGraphDateFilter() {
      document.getElementById('mypage-filter-start').value = '';
      document.getElementById('mypage-filter-end').value = '';
      renderMyPageData();
    }

    function toggleMyPageHistory() {
      const el = document.getElementById('mypage-history-full');
      const btn = document.getElementById('toggle-history-btn');
      if (el.style.display === 'none') {
        el.style.display = 'block';
        btn.innerText = '閉じる ▲';
      } else {
        el.style.display = 'none';
        btn.innerText = '表示する ▼';
      }
    }

    const RANKING_CATEGORY_LABELS = {
      avg: 'アベレージ',
      g3: '3G合計スコア',
      high: 'ハイスコア(1G)',
      games: '投球ゲーム数',
      gapMax: '最多ギャップ',
      gapMin: '最小ギャップ',
      mip: '急成長(MIP)',
      giant: 'ジャイアントキリング'
    };

    // 今月時点でのメダル獲得数（見出し用・コンパクト表示）
    function renderMyPageRankingSummary() {
      if (!currentMyPageMemberId) return;
      const r = computeRankings('month');
      const counts = { 1: 0, 2: 0, 3: 0 };
      Object.keys(RANKING_CATEGORY_LABELS).forEach(key => {
        const idx = (r[key] || []).findIndex(x => x.id === currentMyPageMemberId);
        if (idx >= 0 && idx < 3) counts[idx + 1]++;
      });
      const el = document.getElementById('mypage-ranking-summary');
      const total = counts[1] + counts[2] + counts[3];
      if (total === 0) {
        el.innerText = '(今月のメダルなし)';
      } else {
        const parts = [];
        if (counts[1]) parts.push(`🥇×${counts[1]}`);
        if (counts[2]) parts.push(`🥈×${counts[2]}`);
        if (counts[3]) parts.push(`🥉×${counts[3]}`);
        el.innerText = `今月: ${parts.join(' ')}`;
      }
    }

    function toggleMyPageRanking() {
      const el = document.getElementById('mypage-ranking-full');
      const btn = document.getElementById('toggle-ranking-btn');
      if (el.style.display === 'none') {
        el.style.display = 'block';
        btn.innerText = '閉じる ▲';
        renderMyPageRankingDetail();
      } else {
        el.style.display = 'none';
        btn.innerText = '詳細を見る ▼';
      }
    }

    function renderMyPageRankingDetail() {
      if (!currentMyPageMemberId) return;
      const filter = document.getElementById('mypage-ranking-filter').value;
      const r = computeRankings(filter);
      const container = document.getElementById('mypage-ranking-list');
      const medals = ['🥇', '🥈', '🥉'];

      const rows = [];
      Object.keys(RANKING_CATEGORY_LABELS).forEach(key => {
        const arr = r[key] || [];
        const idx = arr.findIndex(x => x.id === currentMyPageMemberId);
        if (idx === -1) return; // ランク外（対象データなし）は表示しない
        const rank = idx + 1;
        const badge = rank <= 3 ? medals[rank - 1] : `${rank}位`;
        rows.push(`
          <div style="display:flex; justify-content:space-between; align-items:center; padding: 5px 0; border-bottom: 1px solid #333;">
            <span>${RANKING_CATEGORY_LABELS[key]}</span>
            <span style="color:#facc15; font-weight:bold;">${badge}</span>
          </div>
        `);
      });

      container.innerHTML = rows.length > 0
        ? rows.join('')
        : '<div style="color:#888; text-align:center; padding:8px;">この期間はランクインしている項目がありません</div>';
    }

    function throwToPins(t) {
      if (t === 'X' || t === 'x') return 10;
      if (t === '/') return null;
      if (t === '-' || t === 'G' || t === 'g' || t === 'F' || t === 'f') return 0;
      const n = parseInt(t, 10);
      return isNaN(n) ? null : n;
    }

    // スコア記号一覧(ストライク/スペア/ミス/ガター/ファール)の見た目を再現する
    // フレームの投球スロット数(通常2、10フレーム目のみ最大3)。足りない分は空白で埋める
    function frameSlotCount(idx) { return idx === 9 ? 3 : 2; }
    function padThrowsForDisplay(throwsArr, idx) {
      const n = frameSlotCount(idx);
      let arr = (throwsArr || []).map(v => String(v));
      // 通常フレームでストライク1投のみ記録されている場合、
      // スコアボード表記(1投目欄は空欄・2投目欄にマーク)に合わせて末尾へ寄せる
      if (idx < 9 && arr.length === 1 && arr[0].trim().toUpperCase() === 'X') {
        arr = ['', arr[0]];
      }
      arr = arr.slice(0, n);
      while (arr.length < n) arr.push('');
      return arr;
    }

    // スコア記号一覧(ストライク/スペア/ミス/ガター/ファール/スプリット)の見た目を再現する
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
      if (t === '-') return `<span class="mark-miss" title="ノーヘッド">－</span>`;
      if (t === 'G') return `<span class="mark-miss" title="ガター">G</span>`;
      if (t === 'F') return `<span class="mark-miss" title="ファール">F</span>`;
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

    // memberId・gameNumberのフレームデータが無ければ空のフレームで初期化して返す
    function ensureGameFrameData(memberId, gameNumber) {
      if (!scannedFrameData[memberId]) scannedFrameData[memberId] = {};
      if (!scannedFrameData[memberId][gameNumber]) {
        scannedFrameData[memberId][gameNumber] = { frames: blankFrames(), total: null };
      }
      return scannedFrameData[memberId][gameNumber];
    }

    // filteredAtt(期間内の出席記録配列)から、frames詳細が付いているゲームだけを対象に
    // 投球詳細統計(1球平均・ストライク率・マーク率・オープン率・スプリットカバー率・
    // 10フレーム目平均・ダブル/ターキー発生数)を計算する
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
            if (isStrike) { run++; }
            else { if (run === 2) doublesCount++; else if (run >= 3) turkeysCount++; run = 0; }
          });
          if (run === 2) doublesCount++; else if (run >= 3) turkeysCount++;
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
        maxFrame10Points: maxFrame10Points,
        doublesPerGame: gamesWithFrames > 0 ? doublesCount / gamesWithFrames : null,
        turkeysPerGame: gamesWithFrames > 0 ? turkeysCount / gamesWithFrames : null,
        turkeysTotal: turkeysCount,
        gamesWithFrames,
        totalFrames
      };
    }

    function renderMyPageFrameStats(filteredAtt) {
      const s = computeAdvancedFrameStats(filteredAtt);
      const noteEl = document.getElementById('mypage-frame-stats-note');
      if (s.gamesWithFrames === 0) {
        noteEl.textContent = '(フレーム詳細付きの記録がまだありません)';
      } else {
        noteEl.textContent = `(フレーム詳細のある${s.gamesWithFrames}ゲーム分で集計)`;
      }
      const fmt = (v, unit, digits) => v == null ? '-' : `${v.toFixed(digits)}${unit}`;
      document.getElementById('mypage-fba').innerText = fmt(s.firstBallAvg, '本', 1);
      document.getElementById('mypage-strike-rate').innerText = fmt(s.strikeRate, '%', 1);
      document.getElementById('mypage-mark-rate').innerText = fmt(s.markRate, '%', 1);
      document.getElementById('mypage-open-rate').innerText = fmt(s.openFrameRate, '%', 1);
      document.getElementById('mypage-splitcover').innerText = s.splitTotal > 0 ? `${fmt(s.splitCoverRate, '%', 1)} (${s.splitTotal}回中)` : '- (スプリットなし)';
      document.getElementById('mypage-f10avg').innerText = fmt(s.frame10Avg, '点', 1);
      document.getElementById('mypage-doubles').innerText = fmt(s.doublesPerGame, '回', 2);
      document.getElementById('mypage-turkeys').innerText = fmt(s.turkeysPerGame, '回', 2);
    }

    function renderMyPageData() {
      if (!currentMyPageMemberId) return;
      const member = appData.members.find(m => m.id === currentMyPageMemberId);
      const stats = appData.stats[currentMyPageMemberId];

      const startDate = document.getElementById('mypage-filter-start').value;
      const endDate = document.getElementById('mypage-filter-end').value;

      let filteredAtt = appData.attendance.filter(a => a.memberId === currentMyPageMemberId);
      if (startDate) filteredAtt = filteredAtt.filter(a => a.date >= startDate);
      if (endDate) filteredAtt = filteredAtt.filter(a => a.date <= endDate);

      document.getElementById('mypage-name').innerText = `${member.name} さんの個人成績`;
      document.getElementById('mypage-avatar-btn').innerHTML = avatarInnerHtml(member.avatar, member.name.charAt(0));
      
      const equippedBadgeEl = document.getElementById('mypage-equipped-badge');
      const equippedIcon = getAchievementIcon(member.equipped);
      if (equippedIcon) {
        equippedBadgeEl.innerText = equippedIcon;
        equippedBadgeEl.style.display = 'flex';
      } else {
        equippedBadgeEl.style.display = 'none';
      }

      document.getElementById('mypage-avg-total').innerText = stats.totalAvg.toFixed(1);
      document.getElementById('mypage-avg-recent').innerText = stats.recent15Avg.toFixed(1);
      document.getElementById('mypage-high').innerText = `${stats.highScore} 点`;

      renderMyPageFrameStats(filteredAtt);

      renderMyPageRankingSummary();

      const historyListContainer = document.getElementById('mypage-history-list');
      document.getElementById('mypage-history-count').innerText = `(${filteredAtt.length}件)`;
      
      if (filteredAtt.length === 0) {
        const avgEl = document.getElementById('mypage-history-avg');
        if (avgEl) avgEl.innerText = '-';
        historyListContainer.innerHTML = '<div style="color:#888; font-size:12px; text-align:center; padding:8px;">該当するスコア記録がありません</div>';
      } else {
        const totalScoreSum = filteredAtt.reduce((sum, att) => sum + Number(att.totalScore || 0), 0);
        const totalGameSum = filteredAtt.reduce((sum, att) => sum + Number(att.gameCount || 0), 0);
        const periodAvg = totalGameSum > 0 ? (totalScoreSum / totalGameSum).toFixed(1) : '-';
        
        const avgEl = document.getElementById('mypage-history-avg');
        if (avgEl) avgEl.innerText = `${periodAvg}点`;

        const historySorted = [...filteredAtt].sort((a, b) => new Date(b.date) - new Date(a.date));
        historyListContainer.innerHTML = historySorted.map(att => {
          const scores = [att.g1, att.g2, att.g3, att.g4, att.g5]
            .filter(g => g !== null && g !== undefined && !isNaN(g))
            .join(', ');

          const dayAvg = (att.gameCount > 0 && att.totalScore > 0) 
            ? (att.totalScore / att.gameCount).toFixed(1) 
            : '-';

          return `
            <div style="border-bottom: 1px solid #333; padding: 6px 0; font-size: 12px;">
              <div style="display: flex; justify-content: space-between; align-items: center; cursor:pointer;" onclick="toggleMyPageHistoryDetail('${att.id}')">
                <div>
                  <span style="color: #38bdf8; font-weight: bold;">${att.date}</span>
                  <span style="color: #aaa; margin-left: 6px;">[${scores || '記録なし'}]</span>
                </div>
                <div style="text-align: right;">
                  <strong style="color: #facc15;">${att.totalScore}点</strong>
                  <span style="color: #888; font-size: 11px;">(${att.gameCount}G)</span>
                  <span style="color: #38bdf8; font-size: 11px; margin-left: 4px;">Avg: ${dayAvg}</span>
                </div>
              </div>
              <div id="mypage-history-detail-${att.id}" style="display:none; margin-top:8px;"></div>
            </div>
          `;
        }).join('');
      }

      const unlockedList = checkAchievements(stats);
      document.getElementById('mypage-ach-count').innerText = `(${unlockedList.length} / ${ACHIEVEMENTS.length})`;
      document.getElementById('mypage-ach-summary').innerText = `獲得済み: ${unlockedList.map(id => getAchievementIcon(id)).join(' ')}`;

      const badgesContainer = document.getElementById('mypage-badges');
      badgesContainer.innerHTML = '';
      ACHIEVEMENTS.forEach(ach => {
        const isUnlocked = unlockedList.includes(ach.id);
        const isEquipped = member.equipped === ach.id;
        badgesContainer.innerHTML += `
          <div class="achievement-item ${isUnlocked ? '' : 'locked'} ${isEquipped ? 'equipped' : ''}" onclick="showAchievementDetail('${ach.id}', ${isUnlocked}, ${isEquipped})">
            <span class="achievement-icon">${ach.icon}</span>
            <span class="achievement-name">${ach.name}</span>
          </div>
        `;
      });

      const unit = document.getElementById('chart-unit-select').value || 'day';
      const groupedData = {};

      const sortedAtt = [...filteredAtt].sort((a, b) => new Date(a.date) - new Date(b.date));

      sortedAtt.forEach(a => {
        let key = a.date.substring(0, 7);
        if (unit === 'day') {
          key = a.date;
        } else if (unit === 'year') {
          key = a.date.substring(0, 4);
        } else if (unit === 'quarter') {
          const m = parseInt(a.date.substring(5, 7));
          const q = Math.ceil(m / 3);
          key = `${a.date.substring(0, 4)}-Q${q}`;
        }

        if (!groupedData[key]) groupedData[key] = { totalScore: 0, games: 0 };
        groupedData[key].totalScore += a.totalScore;
        groupedData[key].games += a.gameCount;
      });

      const labels = Object.keys(groupedData).sort();
      const dataPoints = labels.map(k => (groupedData[k].totalScore / groupedData[k].games).toFixed(1));

      const ctx = document.getElementById('scoreChart').getContext('2d');
      if (scoreChartInstance) scoreChartInstance.destroy();
      
      scoreChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'アベレージ',
            data: dataPoints,
            borderColor: '#38bdf8',
            backgroundColor: 'rgba(56, 189, 248, 0.1)',
            fill: true,
            tension: 0.2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: { y: { grid: { color: '#333' } }, x: { grid: { color: '#333' } } },
          plugins: { legend: { display: false } }
        }
      });
    }

