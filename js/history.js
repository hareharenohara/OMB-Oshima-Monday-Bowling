    /* ---------------------------------------------------------
       ⑤ メンバータブ & 履歴
       --------------------------------------------------------- */
    function renderMembersTab() {
      const container = document.getElementById('member-management-list');
      container.innerHTML = '<h4 style="margin:0 0 4px 0;">👥 メンバー</h4><p style="font-size:12px;color:#888;margin:0 0 10px;">メンバーを選ぶと個人成績を確認できます。</p>';
      appData.members.forEach(m => {
        const stats = appData.stats[m.id];
        const badgeClass = stats.remainingGames <= 3 ? 'badge-red' : 'badge-green';
        
        container.innerHTML += `
          <div style="display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid #2d2d2d; align-items:center;">
            <div>
              <strong style="font-size:14px;">${escapeHtml(m.name)}</strong><br>
              <span style="font-size:12px;color:#94a3b8;">通算Avg ${stats.totalAvg.toFixed(1)}</span>
              <span class="badge ${badgeClass} admin-only">残り ${stats.remainingGames} G</span>
            </div>
            <div style="display:flex; gap:4px;">
              <button class="btn btn-primary btn-sm" onclick="openMemberDashboard('${m.id}')">詳細</button>
              <button class="btn btn-success btn-sm admin-only" onclick="showChargeModal('', '${m.id}', '${m.name}')">回数券+</button>
              <button class="btn btn-secondary btn-sm admin-only" onclick="showEditMemberModal('${m.id}', '${m.name}')">編集</button>
            </div>
          </div>
        `;
      });
    }

    function renderFrameViewStrip(frames) {
      return frames.map((f, idx) => {
        const throwsHtml = padThrowsForDisplay(f.throws, idx).map((t, ti) => renderThrowMark(t, ti === 0, f.is_split)).join('');
        return `
          <div class="scoreboard-frame${f.is_split ? ' split' : ''}">
            <div class="sb-idx">${idx + 1}</div>
            <div class="sb-throws">${throwsHtml}</div>
            <div class="sb-score">${f.score != null ? f.score : '-'}</div>
          </div>
        `;
      }).join('');
    }

    function showGameDetail(sessionId) {
      const att = appData.attendance.find(a => a.id === sessionId);
      if (!att) return;
      document.getElementById('game-detail-title').textContent = `🎳 ${att.date} - ${att.memberName}`;

      const content = document.getElementById('game-detail-content');
      const games = att.games || [];
      if (games.length === 0) {
        content.innerHTML = '<p style="font-size:13px; color:#aaa;">記録がありません。</p>';
      } else {
        content.innerHTML = games.map(g => {
          const hasFrames = g.frames && g.frames.length > 0 && g.frames.some(f => f.score != null || (f.throws && f.throws.length));
          if (!hasFrames) {
            return `
              <div style="margin-bottom:14px;">
                <div class="game-detail-label">${g.gameNumber}G: ${g.score != null ? g.score : '-'}点</div>
                <p style="font-size:12px; color:#888; margin:0;">フレーム詳細なし(合計のみの記録です)</p>
              </div>
            `;
          }
          return `
            <div style="margin-bottom:14px;">
              <div class="game-detail-label">${g.gameNumber}G: ${g.score != null ? g.score : '-'}点</div>
              <div class="scoreboard-strip">${renderFrameViewStrip(g.frames)}</div>
            </div>
          `;
        }).join('');
      }
      showModal('modal-game-detail');
    }

    function renderHistory() {
      const container = document.getElementById('history-list-container');
      container.innerHTML = '';
      appData.attendance.forEach(att => {
        container.innerHTML += `
          <div style="border-bottom: 1px solid #2d2d2d; padding: 10px 0; font-size:12px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-weight:bold; color:#38bdf8;">${att.date} - ${escapeHtml(att.memberName)}</div>
              <div style="color:#aaa; margin-top:2px;">
                投球: ${att.gameCount}G | スコア: [${[att.g1, att.g2, att.g3, att.g4, att.g5].slice(0, att.gameCount).map(g => g !== null && g !== undefined ? g : '-').join(', ')}] | 合計: ${att.totalScore}
              </div>
            </div>
            <div style="display:flex; gap:4px;">
              <button class="btn btn-secondary btn-sm" onclick="showGameDetail('${att.id}')">詳細</button>
              <button class="btn btn-secondary btn-sm admin-only" onclick="showEditScoreModal('${att.id}', '${att.memberId}', '${att.date}', ${att.gameCount}, ${att.g1}, ${att.g2}, ${att.g3}, ${att.g4}, ${att.g5})">編集</button>
            </div>
          </div>
        `;
      });
    }

