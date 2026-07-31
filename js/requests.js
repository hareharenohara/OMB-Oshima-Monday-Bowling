    /* ---------------------------------------------------------
       スコア申請（承認リクエスト制）
       メンバー本人が結果票を読み取り／手入力し、requestsテーブルに
       status='pending'で登録する。実際のsessions/games/framesへの
       反映は管理者が承認センターで承認した時点で行う。

       注意：管理者用の「スコア入力」タブにも自分自身の行が表示され、
       scan-file-${memberId} 等が同じmemberIdで既に存在しうるため、
       このモーダル内の要素IDは全て "-req" サフィックス付きの
       別キー(reqKey)を使ってIDの衝突を避ける。
       --------------------------------------------------------- */
    function reqKey(memberId) {
      return memberId + '-req';
    }

    function openScoreRequestModal() {
      if (!supabaseMemberId) return showToast('ログイン情報を取得できませんでした');
      const key = reqKey(supabaseMemberId);
      if (!scannedFrameData[key]) scannedFrameData[key] = {};
      const todayStr = new Date().toISOString().slice(0, 10);

      document.getElementById('score-request-body').innerHTML = `
        <div style="margin-bottom:10px;">
          <label style="font-size:13px; font-weight:bold;">実施日: <input type="date" id="score-request-date" value="${todayStr}"></label>
        </div>
        <div class="scan-row">
          <img class="scan-preview-thumb" id="scan-thumb-${key}" alt="">
          <button type="button" class="btn btn-sm btn-scan-photo" onclick="triggerScorePhoto('${key}')">📷 結果票を読み取る</button>
          <span class="scan-status-text" id="scan-status-${key}"></span>
          <input type="file" accept="image/*" capture="environment" id="scan-file-${key}" style="display:none;" onchange="handleScorePhotoSelected('${key}', this)">
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; margin-bottom:8px;">
          <span>投球G数:
            <select id="gc-${key}" onchange="updateGameSlots('${key}')" style="padding:2px 4px;">
              <option value="1">1 G</option>
              <option value="2">2 G</option>
              <option value="3" selected>3 G</option>
              <option value="4">4 G</option>
              <option value="5">5 G</option>
            </select>
          </span>
        </div>
        <div class="score-table" id="score-table-${key}"></div>
        <div id="calc-result-${key}" style="text-align:right; font-size:12px; font-weight:bold; margin-top:6px; color:#38bdf8;"></div>
      `;
      renderScoreTable(key);
      showModal('modal-score-request');
      loadMyPendingRequests();
    }

    async function loadMyPendingRequests() {
      const container = document.getElementById('score-request-mine');
      if (!container || !supabaseMemberId) return;
      container.innerHTML = '';
      const { data, error } = await supabaseClient
        .from('requests')
        .select('id, date, status, created_at, reject_reason')
        .eq('member_id', supabaseMemberId)
        .eq('type', 'score')
        .order('created_at', { ascending: false })
        .limit(5);
      if (error || !data || data.length === 0) return;

      const rowsHtml = data.map(r => {
        const label = r.status === 'pending'
          ? '⏳ 承認待ち'
          : r.status === 'approved'
            ? '✅ 承認済み'
            : `❌ 却下${r.reject_reason ? '（' + escapeHtml(r.reject_reason) + '）' : ''}`;
        return `<div style="font-size:12px; display:flex; justify-content:space-between; padding:2px 0;"><span>${escapeHtml(r.date || '')}</span><span>${label}</span></div>`;
      }).join('');
      container.innerHTML = `<div style="font-size:11px; color:#888; margin-top:12px; border-top:1px dashed #444; padding-top:8px;">直近の申請状況</div>${rowsHtml}`;
    }

    async function submitScoreRequest() {
      const mId = supabaseMemberId;
      if (!mId) return showToast('ログイン情報を取得できませんでした');
      const key = reqKey(mId);

      const date = document.getElementById('score-request-date').value;
      if (!date) return showToast('実施日を入力してください');

      const gc = parseInt(document.getElementById(`gc-${key}`).value) || 0;
      if (gc === 0) return showToast('投球ゲーム数を選択してください');

      const games = [];
      for (let gameNumber = 1; gameNumber <= gc; gameNumber++) {
        const fd = scannedFrameData[key] && scannedFrameData[key][gameNumber];
        if (!fd || fd.total == null) {
          return showToast(`${gameNumber}ゲーム目のスコアが未入力です。枠をタップして入力してください。`);
        }
        games.push({ game_number: gameNumber, score: fd.total, frames: fd.frames || [] });
      }

      document.getElementById('loading').style.display = 'block';
      const { error } = await supabaseClient.from('requests').insert({
        type: 'score',
        member_id: mId,
        status: 'pending',
        date: date,
        games: games,
        source: 'photo'
      });
      document.getElementById('loading').style.display = 'none';

      if (error) {
        if (error.code === '23505') {
          return showToast('この日の申請が既に存在します。修正は管理者に依頼してください。');
        }
        return showToast('申請に失敗しました: ' + error.message);
      }

      showToast('申請を送信しました。管理者の承認をお待ちください。');
      delete scannedFrameData[key];
      closeModal('modal-score-request');
    }

    /* ---------------------------------------------------------
       管理者専用：承認センター（スコア申請の確認・承認・却下）
       --------------------------------------------------------- */
    let approvalType = 'score';

    function openApprovalCenter() {
      switchApprovalType('score');
      showModal('modal-approval-center');
    }

    function switchApprovalType(type) {
      approvalType = type;
      const scoreBtn = document.getElementById('approval-tab-score');
      const purchaseBtn = document.getElementById('approval-tab-purchase');
      scoreBtn.className = 'btn btn-sm ' + (type === 'score' ? 'btn-primary' : 'btn-secondary');
      purchaseBtn.className = 'btn btn-sm ' + (type === 'purchase' ? 'btn-primary' : 'btn-secondary');
      loadApprovalList();
    }

    async function loadApprovalList() {
      const container = document.getElementById('approval-list-container');
      container.innerHTML = '<p style="font-size:12px; color:#888;">読み込み中...</p>';

      if (approvalType === 'purchase') {
        container.innerHTML = '<p style="font-size:12px; color:#888;">回数券の申請承認は今後実装予定です。</p>';
        return;
      }

      const { data, error } = await supabaseClient
        .from('requests')
        .select('id, date, games, source, created_at, member_id, members(name)')
        .eq('type', 'score')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      if (error) {
        container.innerHTML = `<p style="font-size:12px; color:#f87171;">読み込みエラー: ${escapeHtml(error.message)}</p>`;
        return;
      }
      if (!data || data.length === 0) {
        container.innerHTML = '<p style="font-size:12px; color:#888;">承認待ちのスコア申請はありません。</p>';
        return;
      }

      container.innerHTML = data.map(req => {
        const memberName = req.members ? req.members.name : '(不明なメンバー)';
        const gamesHtml = (req.games || []).map(g => {
          const frames = normalizeFrames(g.frames);
          return `
            <div class="score-table-row">
              <div class="score-table-glabel">${g.game_number}G</div>
              <div class="scoreboard-strip score-table-strip">${renderFrameViewStrip(frames)}</div>
            </div>
          `;
        }).join('');
        return `
          <div class="card" style="margin-bottom:10px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <b>${escapeHtml(memberName)}</b>
              <span style="font-size:12px; color:#aaa;">${escapeHtml(req.date || '')}</span>
            </div>
            ${gamesHtml}
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:8px;">
              <button class="btn btn-danger btn-sm" onclick="rejectScoreRequest('${req.id}')">却下</button>
              <button class="btn btn-success btn-sm" onclick="approveScoreRequest('${req.id}')">承認</button>
            </div>
          </div>
        `;
      }).join('');
    }

    async function approveScoreRequest(requestId) {
      document.getElementById('loading').style.display = 'block';

      const { data: req, error: fetchErr } = await supabaseClient
        .from('requests').select('*').eq('id', requestId).single();
      if (fetchErr || !req) {
        document.getElementById('loading').style.display = 'none';
        return showToast('申請の取得に失敗しました: ' + (fetchErr ? fetchErr.message : ''));
      }

      const games = req.games || [];
      const record = {
        date: req.date,
        memberId: req.member_id,
        gameCount: games.length,
        g1: null, g2: null, g3: null, g4: null, g5: null,
        frames: {}
      };
      games.forEach(g => {
        record['g' + g.game_number] = g.score;
        record.frames[g.game_number] = { frames: g.frames || [], total: g.score };
      });

      const res = await supabaseInsertScores([record]);
      if (!res.success) {
        document.getElementById('loading').style.display = 'none';
        return showToast('記録への反映に失敗しました: ' + res.message);
      }

      const { error: updErr } = await supabaseClient
        .from('requests')
        .update({ status: 'approved', decided_at: new Date().toISOString(), decided_by: supabaseMemberId })
        .eq('id', requestId);

      document.getElementById('loading').style.display = 'none';
      if (updErr) return showToast('承認状態の更新に失敗しました: ' + updErr.message);

      showToast('スコアを承認し、記録に反映しました。');
      loadApprovalList();
      refreshPendingRequestBadge();
      fetchData();
    }

    async function rejectScoreRequest(requestId) {
      const reason = window.prompt('却下理由（任意・申請者に表示されます）:') || null;
      document.getElementById('loading').style.display = 'block';
      const { error } = await supabaseClient
        .from('requests')
        .update({ status: 'rejected', decided_at: new Date().toISOString(), decided_by: supabaseMemberId, reject_reason: reason })
        .eq('id', requestId);
      document.getElementById('loading').style.display = 'none';
      if (error) return showToast('却下に失敗しました: ' + error.message);
      showToast('申請を却下しました。');
      loadApprovalList();
      refreshPendingRequestBadge();
    }

    async function refreshPendingRequestBadge() {
      if (!isAdmin) return;
      const badge = document.getElementById('approval-center-badge');
      if (!badge) return;
      const { count, error } = await supabaseClient
        .from('requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (!error && count > 0) {
        badge.style.display = 'inline-block';
        badge.textContent = count;
      } else {
        badge.style.display = 'none';
      }
    }

