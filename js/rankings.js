    /* ---------------------------------------------------------
       ④ ランキングタブ
       --------------------------------------------------------- */
    const RANKING_INFO = {
      avg: 'アベレージランキング\n\n選択した期間内に投球したスコアの平均点が高い順のランキングです。目安として月あたり6G以上の投球実績がないと対象になりません（今四半期は18G以上、今年は72G以上が目安）。',
      g3: '3G合計スコアランキング\n\n1回の参加が3ゲームだった日の合計スコアが最も高かった記録のランキングです（4G・5Gで参加した日は対象外）。',
      high: 'ハイスコア(1G)ランキング\n\n1ゲームで記録した最高スコアのランキングです。',
      games: '投球ゲーム数ランキング\n\n選択した期間内に投球した総ゲーム数のランキングです。',
      gapMax: '最多ギャップランキング\n\n1日(最大5G)の中での「最高スコア」と「最低スコア」の差が最も大きかった日の記録のランキングです。波の大きさを競います。（2ゲームのみの日は対象外）',
      gapMin: '最小ギャップランキング\n\n1日(最大5G)の中での「最高スコア」と「最低スコア」の差が最も小さかった日の記録のランキングです（例: 150, 152, 151点など）。安定感を競います。（2ゲームのみの日は対象外）',
      mip: '急成長(MIP)ランキング\n\n通算アベレージと比較して、選択した期間のアベレージがどれだけ伸びたかのランキングです。通算(歴代)フィルタでは算出できないため表示されません。',
      giant: 'ジャイアントキリングランキング\n\n自分の通算アベレージより+30点以上高いスコアを出した回数のランキングです。',
      strikeRate: 'ストライク率ランキング\n\n選択した期間内で、写真読み取り(フレーム詳細)のある記録が6ゲーム以上ある人を対象に、全フレームに占めるストライクの割合が高い順のランキングです。フレーム詳細のない手入力の記録は対象外です。',
      openFrame: 'オープンフレーム率ランキング\n\n選択した期間内で、フレーム詳細のある記録が6ゲーム以上ある人を対象に、ストライクにもスペアにもならなかった「オープンフレーム」の割合が低い順(堅実な順)のランキングです。',
      splitCover: 'スプリットカバー率ランキング\n\nフレーム詳細のある記録が6ゲーム以上あり、スプリット(丸で囲まれたピン数)が出た記録がある人を対象に、スペアで処理(カバー)できた割合が高い順のランキングです。',
      doubleTurkey: 'ダブル・ターキー発生率ランキング\n\nフレーム詳細のある記録が6ゲーム以上ある人を対象に、1ゲームあたりの平均でストライクが2連続(ダブル)・3連続以上(ターキー)発生した回数を合計した値が高い順のランキングです。',
      frame10: '10フレーム目 平均獲得点ランキング\n\nフレーム詳細のある記録が6ゲーム以上ある人を対象に、10フレーム目だけで獲得した点数(最大30点)の平均が高い順のランキングです。',
      fba: '1球平均倒ピン数ランキング\n\nフレーム詳細のある記録が6ゲーム以上ある人を対象に、全フレームの1投目で倒したピンの本数の平均が高い順のランキングです。'
    };

    function showRankingInfo(key) {
      const info = RANKING_INFO[key] || '';
      const [title, ...rest] = info.split('\n\n');
      document.getElementById('ranking-info-title').innerText = title;
      document.getElementById('ranking-info-desc').innerText = rest.join('\n\n');
      showModal('modal-ranking-info');
    }

    function formatShortDate(dateStr) {
      if (!dateStr) return '';
      const parts = dateStr.split('-');
      if (parts.length < 3) return dateStr;
      return `${parts[0]}/${parseInt(parts[1])}/${parseInt(parts[2])}`;
    }

    // アベレージランキングの最低投球数（月あたり6G以上を基準に期間へ按分）
    function getMinGamesForAvgRanking(filter) {
      const MONTHLY_MIN = 6;
      if (filter === 'month') return MONTHLY_MIN;
      if (filter === 'quarter') return MONTHLY_MIN * 3;
      if (filter === 'year') return MONTHLY_MIN * 12;

      // 通算(all): 初回記録から現在までの月数で按分
      if (!appData.attendance || appData.attendance.length === 0) return MONTHLY_MIN;
      const dates = appData.attendance.map(a => new Date(a.date)).filter(d => !isNaN(d));
      if (dates.length === 0) return MONTHLY_MIN;
      const earliest = new Date(Math.min(...dates));
      const now = new Date();
      const months = Math.max(1, (now.getFullYear() - earliest.getFullYear()) * 12 + (now.getMonth() - earliest.getMonth()) + 1);
      return MONTHLY_MIN * months;
    }

    function computeRankings(filter) {
      const now = new Date();
      const currentYear = `${now.getFullYear()}`;
      const currentMonth = `${now.getFullYear()}-${('0' + (now.getMonth() + 1)).slice(-2)}`;
      const currentQuarter = `Q${Math.ceil((now.getMonth() + 1) / 3)}`;

      function isInPeriod(dateStr) {
        if (filter === 'all') return true;
        if (filter === 'year') return dateStr.startsWith(currentYear);
        if (filter === 'month') return dateStr.startsWith(currentMonth);
        if (filter === 'quarter') {
          if (!dateStr.startsWith(currentYear)) return false;
          const m = parseInt(dateStr.substring(5, 7));
          return `Q${Math.ceil(m / 3)}` === currentQuarter;
        }
        return false;
      }

      const statsMap = {};
      appData.members.forEach(m => {
        statsMap[m.id] = {
          id: m.id, name: m.name, totalScore: 0, games: 0,
          highScore: 0, highScoreDate: '', highScoreSessionId: null,
          max3GScore: 0, max3GDate: '', max3GBreakdown: '', max3GSessionId: null,
          bestGap: null, bestGapDate: '', bestGapBreakdown: '', bestGapSessionId: null,
          worstGap: null, worstGapDate: '', worstGapBreakdown: '', worstGapSessionId: null,
          giantCount: 0
        };
      });

      appData.attendance.forEach(att => {
        if (!isInPeriod(att.date) || !statsMap[att.memberId]) return;
        const s = statsMap[att.memberId];
        s.totalScore += att.totalScore;
        s.games += att.gameCount;
        const maxInAtt = Math.max(att.g1 || 0, att.g2 || 0, att.g3 || 0, att.g4 || 0, att.g5 || 0);
        if (maxInAtt > s.highScore) {
          s.highScore = maxInAtt;
          s.highScoreDate = att.date;
          s.highScoreSessionId = att.id;
        }

        // 3G合計スコアランキング：仕様上、3ゲーム開催の記録のみを対象とする（4G/5Gの日は対象外）
        if (att.gameCount === 3 && att.totalScore > s.max3GScore) {
          s.max3GScore = att.totalScore;
          s.max3GDate = att.date;
          s.max3GBreakdown = `${att.g1} / ${att.g2} / ${att.g3}`;
          s.max3GSessionId = att.id;
        }

        // 最多/最小ギャップ（その日に記録されたゲーム(最大5G)の中での最高・最低差。2Gのみの日は対象外）
        const dayVals = [att.g1, att.g2, att.g3, att.g4, att.g5].filter(v => v != null);
        if (dayVals.length >= 3) {
          const gap = Math.max(...dayVals) - Math.min(...dayVals);
          const breakdown = dayVals.join(' / ');
          if (s.bestGap === null || gap > s.bestGap) {
            s.bestGap = gap; s.bestGapDate = att.date; s.bestGapBreakdown = breakdown; s.bestGapSessionId = att.id;
          }
          if (s.worstGap === null || gap < s.worstGap) {
            s.worstGap = gap; s.worstGapDate = att.date; s.worstGapBreakdown = breakdown; s.worstGapSessionId = att.id;
          }
        }

        // ジャイアントキリング（個人の通算アベレージ+30点以上）
        const personalAvg = (appData.stats[att.memberId] && appData.stats[att.memberId].totalAvg) || 0;
        if (personalAvg > 0) {
          [att.g1, att.g2, att.g3, att.g4, att.g5].forEach(g => {
            if (g != null && g >= personalAvg + 30) s.giantCount++;
          });
        }
      });

      // フレーム詳細ベースの統計(ストライク率・オープン率・スプリットカバー率・ダブル/ターキー・10フレーム目・1球平均)
      appData.members.forEach(m => {
        const memberAttInPeriod = appData.attendance.filter(a => a.memberId === m.id && isInPeriod(a.date));
        if (statsMap[m.id]) statsMap[m.id].frameStats = computeAdvancedFrameStats(memberAttInPeriod);
      });

      const list = Object.values(statsMap);

      // アベレージランキングは最低でも「月あたり6G以上」の投球数を要求する（期間に応じて按分）
      const minGamesForAvg = getMinGamesForAvgRanking(filter);

      const result = {};
      result.avg = [...list].filter(x => x.games >= minGamesForAvg).sort((a,b) => (b.totalScore/b.games) - (a.totalScore/a.games));
      result.g3 = [...list].filter(x => x.max3GScore > 0).sort((a,b) => b.max3GScore - a.max3GScore);
      result.high = [...list].filter(x => x.highScore > 0).sort((a,b) => b.highScore - a.highScore);
      result.games = [...list].filter(x => x.games > 0).sort((a,b) => b.games - a.games);
      result.gapMax = [...list].filter(x => x.bestGap !== null).sort((a,b) => b.bestGap - a.bestGap);
      result.gapMin = [...list].filter(x => x.worstGap !== null).sort((a,b) => a.worstGap - b.worstGap);
      result.giant = [...list].filter(x => x.giantCount > 0).sort((a,b) => b.giantCount - a.giantCount);

      const MIN_GAMES_FOR_FRAME_RANKING = 6;

      result.strikeRate = [...list].filter(x => x.frameStats && x.frameStats.gamesWithFrames >= MIN_GAMES_FOR_FRAME_RANKING && x.frameStats.strikeRate != null)
        .sort((a,b) => b.frameStats.strikeRate - a.frameStats.strikeRate);
      result.openFrame = [...list].filter(x => x.frameStats && x.frameStats.gamesWithFrames >= MIN_GAMES_FOR_FRAME_RANKING && x.frameStats.openFrameRate != null)
        .sort((a,b) => a.frameStats.openFrameRate - b.frameStats.openFrameRate);
      result.splitCover = [...list].filter(x => x.frameStats && x.frameStats.gamesWithFrames >= MIN_GAMES_FOR_FRAME_RANKING && x.frameStats.splitTotal > 0)
        .sort((a,b) => b.frameStats.splitCoverRate - a.frameStats.splitCoverRate);
      result.doubleTurkey = [...list].filter(x => x.frameStats && x.frameStats.gamesWithFrames >= MIN_GAMES_FOR_FRAME_RANKING)
        .map(x => Object.assign({}, x, { combinedRate: (x.frameStats.doublesPerGame || 0) + (x.frameStats.turkeysPerGame || 0) }))
        .filter(x => x.combinedRate > 0)
        .sort((a,b) => b.combinedRate - a.combinedRate);
      result.frame10 = [...list].filter(x => x.frameStats && x.frameStats.gamesWithFrames >= MIN_GAMES_FOR_FRAME_RANKING && x.frameStats.frame10Avg != null)
        .sort((a,b) => b.frameStats.frame10Avg - a.frameStats.frame10Avg);
      result.fba = [...list].filter(x => x.frameStats && x.frameStats.gamesWithFrames >= MIN_GAMES_FOR_FRAME_RANKING && x.frameStats.firstBallAvg != null)
        .sort((a,b) => b.frameStats.firstBallAvg - a.frameStats.firstBallAvg);

      if (filter === 'all') {
        result.mip = [];
      } else {
        result.mip = list
          .filter(x => x.games > 0 && appData.stats[x.id] && appData.stats[x.id].totalAvg > 0)
          .map(x => {
            const periodAvg = x.totalScore / x.games;
            const beforeAvg = appData.stats[x.id].totalAvg;
            const growth = periodAvg - beforeAvg;
            return Object.assign({}, x, { growth: growth, periodAvg: periodAvg, beforeAvg: beforeAvg });
          })
          .filter(x => x.growth > 0)
          .sort((a, b) => b.growth - a.growth);
      }

      return result;
    }

    function renderRanking() {
      const filter = document.getElementById('ranking-filter').value;
      const r = computeRankings(filter);

      renderRankingList('ranking-avg', r.avg.slice(0, 5), x => `${(x.totalScore / x.games).toFixed(1)}`, x => `${x.games}G参加`);
      renderRankingList('ranking-3g', r.g3.slice(0, 5),
        x => `${x.max3GScore}点`,
        x => `${formatShortDate(x.max3GDate)} (${x.max3GBreakdown})`,
        x => x.max3GSessionId);
      renderRankingList('ranking-high', r.high.slice(0, 5),
        x => `${x.highScore}点`,
        x => `${formatShortDate(x.highScoreDate)} 達成`,
        x => x.highScoreSessionId);
      renderRankingList('ranking-games', r.games.slice(0, 5), x => `${x.games}G`, x => `投球数`);
      renderRankingList('ranking-gap-max', r.gapMax.slice(0, 5),
        x => `${x.bestGap}点差`,
        x => `${formatShortDate(x.bestGapDate)} (${x.bestGapBreakdown})`,
        x => x.bestGapSessionId);
      renderRankingList('ranking-gap-min', r.gapMin.slice(0, 5),
        x => `${x.worstGap}点差`,
        x => `${formatShortDate(x.worstGapDate)} (${x.worstGapBreakdown})`,
        x => x.worstGapSessionId);
      renderRankingList('ranking-giant', r.giant.slice(0, 5),
        x => `${x.giantCount}回`,
        x => `アベレージ ${((appData.stats[x.id] && appData.stats[x.id].totalAvg) || 0).toFixed(1)}`);

      renderRankingList('ranking-strike-rate', r.strikeRate.slice(0, 5),
        x => `${x.frameStats.strikeRate.toFixed(1)}%`,
        x => `フレーム詳細${x.frameStats.gamesWithFrames}G分`);
      renderRankingList('ranking-open-frame', r.openFrame.slice(0, 5),
        x => `${x.frameStats.openFrameRate.toFixed(1)}%`,
        x => `フレーム詳細${x.frameStats.gamesWithFrames}G分`);
      renderRankingList('ranking-split-cover', r.splitCover.slice(0, 5),
        x => `${x.frameStats.splitCoverRate.toFixed(1)}%`,
        x => `${x.frameStats.splitCovered}/${x.frameStats.splitTotal}回カバー`);
      renderRankingList('ranking-double-turkey', r.doubleTurkey.slice(0, 5),
        x => `${x.combinedRate.toFixed(2)}回/G`,
        x => `ダブル${(x.frameStats.doublesPerGame||0).toFixed(2)} / ターキー${(x.frameStats.turkeysPerGame||0).toFixed(2)}`);
      renderRankingList('ranking-frame10', r.frame10.slice(0, 5),
        x => `${x.frameStats.frame10Avg.toFixed(1)}点`,
        x => `フレーム詳細${x.frameStats.gamesWithFrames}G分`);
      renderRankingList('ranking-fba', r.fba.slice(0, 5),
        x => `${x.frameStats.firstBallAvg.toFixed(1)}本`,
        x => `フレーム詳細${x.frameStats.gamesWithFrames}G分`);

      // MIPランキング（通算フィルタでは非表示）
      const mipSection = document.getElementById('ranking-section-mip');
      if (filter === 'all') {
        mipSection.style.display = 'none';
      } else {
        mipSection.style.display = 'block';
        renderRankingList('ranking-mip', r.mip.slice(0, 5),
          x => `+${x.growth.toFixed(1)}`,
          x => `${x.beforeAvg.toFixed(1)} → ${x.periodAvg.toFixed(1)}`);
      }
    }

    function renderRankingList(containerId, sortedList, mainScoreFn, subScoreFn, sessionIdFn) {
      const container = document.getElementById(containerId);
      if (!sortedList || sortedList.length === 0) {
        container.innerHTML = '<div class="ranking-empty">この期間の記録がまだありません</div>';
        return;
      }

      const medals = ['🥇', '🥈', '🥉'];
      container.innerHTML = sortedList.map((item, idx) => {
        const rank = idx + 1;
        const rankClass = rank <= 3 ? `rank-${rank}` : '';
        const member = appData.members.find(m => m.id === item.id);
        const equippedIcon = member ? getAchievementIcon(member.equipped) : '';
        const avatarDisplay = avatarInnerHtml(member && member.avatar, item.name ? item.name.charAt(0) : '?');
        const badgeContent = rank <= 3 ? medals[rank - 1] : rank;
        const sessionId = sessionIdFn ? sessionIdFn(item) : null;

        return `
          <div class="ranking-item ${rankClass}" onclick="openMemberDashboard('${item.id}')" style="cursor:pointer;">
            <div class="ranking-user">
              <span class="rank-badge">${badgeContent}</span>
              <div class="avatar-wrapper ranking">
                <span class="ranking-avatar">${avatarDisplay}</span>
                ${equippedIcon ? `<span class="equipped-badge" title="装備称号">${equippedIcon}</span>` : ''}
              </div>
              <span class="ranking-name">${escapeHtml(item.name)}</span>
            </div>
            ${sessionId ? `
            <div class="ranking-score-box">
              <div class="ranking-main-score ranking-tappable" onclick="event.stopPropagation(); showGameDetail('${sessionId}')">${mainScoreFn(item)}</div>
              <div class="ranking-tap-hint">📋 タップで詳細</div>
            </div>
            ` : `
            <div class="ranking-score-box">
              <div class="ranking-main-score">${mainScoreFn(item)}</div>
              <div class="ranking-sub-score">${subScoreFn(item)}</div>
            </div>
            `}
          </div>
        `;
      }).join('');
    }

