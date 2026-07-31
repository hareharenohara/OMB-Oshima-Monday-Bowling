    /* ---------------------------------------------------------
       ① スコア入力画面
       --------------------------------------------------------- */
    // 全メンバーの「参加率」を計算（開催された全日付のうち、そのメンバーが記録を残した日付の割合）
    function computeAttendanceRates() {
      const allDates = new Set();
      appData.attendance.forEach(a => allDates.add(a.date));
      const totalSessions = allDates.size;

      const attendedByMember = {};
      appData.attendance.forEach(a => {
        if (!attendedByMember[a.memberId]) attendedByMember[a.memberId] = new Set();
        attendedByMember[a.memberId].add(a.date);
      });

      const rates = {};
      appData.members.forEach(m => {
        const attended = attendedByMember[m.id] ? attendedByMember[m.id].size : 0;
        rates[m.id] = totalSessions > 0 ? attended / totalSessions : 0;
      });
      return rates;
    }

    function renderScoreInputList() {
      const container = document.getElementById('score-member-list');
      container.innerHTML = '';
      let lowBalanceHtml = '';

      const attendanceRates = computeAttendanceRates();
      const sortedMembers = [...appData.members].sort((a, b) => attendanceRates[b.id] - attendanceRates[a.id]);

      sortedMembers.forEach(member => {
        const stats = appData.stats[member.id] || { recent15Avg: 0, totalAvg: 0, highScore: 0, totalGameCount: 0, remainingGames: 0 };
        const badgeClass = stats.remainingGames <= 3 ? 'badge-red' : 'badge-green';
        const equippedIcon = getAchievementIcon(member.equipped);

        if (stats.remainingGames <= 3) {
          lowBalanceHtml += `<li>${escapeHtml(member.name)} (残り ${stats.remainingGames} G)</li>`;
        }

        let arrow = '➔';
        let arrowColor = '#aaa';
        if (stats.recent15Avg > stats.totalAvg) {
          arrow = '⬆'; arrowColor = '#4ade80';
        } else if (stats.recent15Avg < stats.totalAvg) {
          arrow = '⬇'; arrowColor = '#f87171';
        }

        const card = document.createElement('div');
        card.className = 'score-card member-row';
        card.setAttribute('data-member-id', member.id);

        card.innerHTML = `
          <div class="score-card-header">
            <label class="member-selector">
              <input type="checkbox" class="attendance-check" value="${member.id}" onchange="toggleInputArea('${member.id}')">
              <div class="avatar-wrapper score">
                <span class="score-avatar">${avatarInnerHtml(member.avatar, member.name.charAt(0))}</span>
                ${equippedIcon ? `<span class="equipped-badge" title="装備称号">${equippedIcon}</span>` : ''}
              </div>
              <span style="margin-left: 2px;">${escapeHtml(member.name)}</span>
            </label>
            <div style="display:flex; align-items:center; gap:6px;">
              <span class="badge ${badgeClass}">残 ${stats.remainingGames} G</span>
              <button class="btn btn-secondary btn-sm" onclick="showMyPage('${member.id}')">詳細</button>
            </div>
          </div>
          <div class="score-card-body" id="input-area-${member.id}">
            <div class="scan-row">
              <img class="scan-preview-thumb" id="scan-thumb-${member.id}" alt="">
              <button type="button" class="btn btn-sm btn-scan-photo" onclick="triggerScorePhoto('${member.id}')">📷 結果票を読み取る</button>
              <span class="scan-status-text" id="scan-status-${member.id}"></span>
              <input type="file" accept="image/*" capture="environment" id="scan-file-${member.id}" style="display:none;" onchange="handleScorePhotoSelected('${member.id}', this)">
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; margin-bottom:8px;">
              <span>投球G数: 
                <select id="gc-${member.id}" onchange="updatePreview('${member.id}'); updateGameSlots('${member.id}')" style="padding:2px 4px;">
                  <option value="1">1 G</option>
                  <option value="2">2 G</option>
                  <option value="3" selected>3 G</option>
                  <option value="4">4 G</option>
                  <option value="5">5 G</option>
                </select>
              </span>
              <button class="btn btn-success btn-sm admin-only" onclick="showChargeModal('', '${member.id}', '${member.name}')">🎟️ 回数券追加</button>
            </div>
            <div class="score-table" id="score-table-${member.id}"></div>
            <div id="calc-result-${member.id}" style="text-align:right; font-size:12px; font-weight:bold; margin-top:6px; color:#38bdf8;"></div>
          </div>
        `;
        container.appendChild(card);
        renderScoreTable(member.id);
      });

      const alertArea = document.getElementById('alert-area');
      if (lowBalanceHtml !== '') {
        alertArea.innerHTML = `<div class="card" style="border-color:#dc2626;"><b style="font-size:13px; color:#f87171;">⚠️ 回数券残数が少ないメンバー</b><ul style="margin:4px 0; padding-left:20px; font-size:12px; color:#f87171;">${lowBalanceHtml}</ul></div>`;
      } else {
        alertArea.innerHTML = '';
      }
      applyHideAbsentFilter();
    }

    function applyHideAbsentFilter() {
      const hideAbsent = document.getElementById('hide-absent-toggle').checked;
      document.querySelectorAll('.member-row').forEach(row => {
        const checkbox = row.querySelector('.attendance-check');
        row.style.display = (hideAbsent && checkbox && !checkbox.checked) ? 'none' : 'block';
      });
    }

    function toggleInputArea(memberId) {
      const area = document.getElementById(`input-area-${memberId}`);
      const checkbox = document.querySelector(`.attendance-check[value="${memberId}"]`);
      if (checkbox && checkbox.checked) {
        area.classList.add('active');
        updatePreview(memberId);
      } else {
        area.classList.remove('active');
      }
      applyHideAbsentFilter();
    }

    function updatePreview(memberId) {
      const gc = parseInt(document.getElementById(`gc-${memberId}`).value) || 0;
      const stats = appData.stats[memberId] || { remainingGames: 0 };
      const rem = stats.remainingGames - gc;
      document.getElementById(`calc-result-${memberId}`).innerText = `消化後残数: ${rem} G`;
    }

    // 投球G数の選択に応じて4G/5G目の入力欄の表示・非表示を切り替える
    function updateGameSlots(memberId) {
      const gc = parseInt(document.getElementById(`gc-${memberId}`).value) || 3;
      // 表示するゲーム数より多い分のフレームデータは削除しておく
      if (scannedFrameData[memberId]) {
        Object.keys(scannedFrameData[memberId]).forEach(gn => {
          if (Number(gn) > gc) delete scannedFrameData[memberId][gn];
        });
      }
      renderScoreTable(memberId);
    }

    // memberIdのスコア表(ゲームごとの10フレーム分)を描画する
    function renderScoreTable(memberId) {
      const container = document.getElementById(`score-table-${memberId}`);
      if (!container) return;
      const gc = parseInt(document.getElementById(`gc-${memberId}`).value) || 3;

      let html = '';
      for (let gameNumber = 1; gameNumber <= gc; gameNumber++) {
        const fd = (scannedFrameData[memberId] && scannedFrameData[memberId][gameNumber]) || null;
        const frames = fd ? fd.frames : blankFrames();
        const cellsHtml = frames.map((f, idx) => {
          const throwsHtml = padThrowsForDisplay(f.throws, idx).map((t, ti) => renderThrowMark(t, ti === 0, f.is_split)).join('');
          return `
            <div class="scoreboard-frame readonly${f.is_split ? ' split' : ''}">
              <div class="sb-idx">${idx + 1}</div>
              <div class="sb-throws">${throwsHtml}</div>
              <div class="sb-score">${f.score != null ? f.score : ''}</div>
            </div>
          `;
        }).join('');

        html += `
          <div class="score-table-row" onclick="openFrameEditModal('${memberId}', ${gameNumber})">
            <div class="score-table-glabel">${gameNumber}G</div>
            <div class="scoreboard-strip score-table-strip">${cellsHtml}</div>
          </div>
        `;
      }
      html += `<div class="score-table-empty-hint">枠をタップして記入・修正</div>`;
      container.innerHTML = html;

      calcTotal(memberId);
    }

    function calcTotal(memberId) {
      const gc = parseInt(document.getElementById(`gc-${memberId}`).value) || 3;
      let sum = 0;
      for (let gameNumber = 1; gameNumber <= gc; gameNumber++) {
        const fd = scannedFrameData[memberId] && scannedFrameData[memberId][gameNumber];
        if (fd && fd.total != null) sum += fd.total;
      }
      document.getElementById(`calc-result-${memberId}`).innerText = `合計: ${sum} 点`;
    }

    /* ---------------------------------------------------------
       個人結果票の写真読み取り。
       Gemini APIキーとプロンプトはSupabase Edge Function内で管理し、
       ブラウザには保存しない。1フレームごとの投球結果まで読み取り、
       framesテーブルに保存できる形で保持する。
       --------------------------------------------------------- */
    // scannedFrameData[memberId][gameNumber] = { frames: [10要素], total: 数値|null }
    const scannedFrameData = {};

    function triggerScorePhoto(memberId) {
      document.getElementById(`scan-file-${memberId}`).click();
    }

    function setScanStatus(memberId, text, cls) {
      const el = document.getElementById(`scan-status-${memberId}`);
      el.textContent = text;
      el.className = 'scan-status-text' + (cls ? ' ' + cls : '');
    }

    function handleScorePhotoSelected(memberId, inputEl) {
      const file = inputEl.files && inputEl.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        const thumb = document.getElementById(`scan-thumb-${memberId}`);
        thumb.src = e.target.result;
        thumb.style.display = 'inline-block';
        setScanStatus(memberId, '画像を最適化中...');

        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, 1200 / img.naturalWidth);
          const w = Math.max(1, Math.round(img.naturalWidth * scale));
          const h = Math.max(1, Math.round(img.naturalHeight * scale));
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          const resizedDataUrl = c.toDataURL('image/jpeg', 0.85);
          const base64 = resizedDataUrl.split(',')[1];
          scanPersonalSlip(memberId, base64, 'image/jpeg');
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
      inputEl.value = ''; // 同じファイルを連続選択できるようにリセット
    }

    async function scanPersonalSlip(memberId, base64, mime) {
      setScanStatus(memberId, '読み取り中...');

      try {
        const { data, error } = await supabaseClient.functions.invoke('scan-bowling-slip', {
          body: { imageBase64: base64, mimeType: mime }
        });
        if (error) {
          let message = '画像読み取りサービスを利用できませんでした。';
          if (error.context && typeof error.context.json === 'function') {
            const errorBody = await error.context.json().catch(() => null);
            if (errorBody && errorBody.error) message = errorBody.error;
          }
          throw new Error(message);
        }

        const games = Array.isArray(data && data.games) ? data.games : [];
        if (games.length === 0) throw new Error((data && data.error) || 'ゲームを読み取れませんでした。手入力してください。');

        applyScannedGames(memberId, games, data.date);
        setScanStatus(memberId, `${games.length}ゲーム分を読み取りました。読み取り精度は完璧ではないため📋アイコンから必ず確認してください。`, 'ok');
      } catch (err) {
        setScanStatus(memberId, err.message || String(err), 'err');
      }
    }

    function normalizeFrames(frames) {
      const arr = Array.isArray(frames) ? frames.slice(0, 10) : [];
      while (arr.length < 10) arr.push({ throws: [], score: null, is_split: false });
      return arr.map(f => ({
        throws: Array.isArray(f.throws) ? f.throws.map(String) : [],
        score: (f == null || f.score === '' || f.score == null || isNaN(f.score)) ? null : Number(f.score),
        is_split: !!(f && f.is_split)
      }));
    }

    function computeTotalFromFrames(frames) {
      for (let i = frames.length - 1; i >= 0; i--) {
        if (frames[i].score != null) return frames[i].score;
      }
      return null;
    }

    function applyScannedGames(memberId, games, date) {
      const capped = games.slice(0, 5);
      if (games.length > 5) {
        showToast(`${games.length}ゲーム検出されましたが、入力欄は最大5Gまでのため先頭5Gのみ反映しました`);
      }

      const gcSelect = document.getElementById(`gc-${memberId}`);
      gcSelect.value = String(capped.length || 1);

      if (!scannedFrameData[memberId]) scannedFrameData[memberId] = {};

      capped.forEach((g, idx) => {
        const gameNumber = idx + 1;
        const frames = normalizeFrames(g.frames);
        const total = computeTotalFromFrames(frames);
        scannedFrameData[memberId][gameNumber] = { frames, total };
      });
      renderScoreTable(memberId);

      if (date) {
        ['score-date', 'score-request-date'].forEach(id => {
          const el = document.getElementById(id);
          if (el && !el.value) el.value = date;
        });
      }
    }

    /* ---------------------------------------------------------
       フレーム詳細 確認・修正モーダル
       --------------------------------------------------------- */
    function openFrameEditModal(memberId, gameNumber) {
      const fd = ensureGameFrameData(memberId, gameNumber);
      document.getElementById('frame-edit-member-id').value = memberId;
      document.getElementById('frame-edit-game-number').value = gameNumber;
      renderFrameEditStrip(fd.frames);
      document.getElementById('frame-edit-total').textContent = fd.total != null ? fd.total : '-';
      showModal('modal-frame-edit');
    }

    let frameEditSelectedBtn = null;

    function renderFrameEditStrip(frames) {
      const strip = document.getElementById('frame-edit-strip');
      strip.innerHTML = '';
      frameEditSelectedBtn = null;
      frames.forEach((f, idx) => {
        const cell = document.createElement('div');
        cell.className = 'scoreboard-frame' + (f.is_split ? ' split' : '');
        const throwsArr = padThrowsForDisplay(f.throws, idx);
        const throwsHtml = throwsArr.map((t, ti) => `<div class="sb-throw-btn" data-frame="${idx}" data-throw="${ti}">${escapeHtml(t)}</div>`).join('');
        cell.innerHTML = `
          <div class="sb-idx">${idx + 1}</div>
          <div class="sb-throws">${throwsHtml}</div>
          <div class="sb-score"><input type="text" inputmode="numeric" class="sb-score-input" value="${f.score != null ? f.score : ''}"></div>
          <div class="sb-split-toggle"><input type="checkbox" class="sb-split-check" title="スプリット" ${f.is_split ? 'checked' : ''}></div>
        `;
        strip.appendChild(cell);
      });
      strip.querySelectorAll('.sb-throw-btn').forEach(btn => btn.addEventListener('click', () => selectThrowBtn(btn)));
      strip.querySelectorAll('.sb-score-input').forEach(inp => inp.addEventListener('input', recalcFrameEditTotal));
      strip.querySelectorAll('.sb-split-check').forEach(chk => chk.addEventListener('change', (e) => {
        e.target.closest('.scoreboard-frame').classList.toggle('split', e.target.checked);
      }));
    }

    // 投球欄(テンキー入力対象)を選択状態にする
    function selectThrowBtn(btn) {
      if (frameEditSelectedBtn) frameEditSelectedBtn.classList.remove('selected');
      frameEditSelectedBtn = btn;
      btn.classList.add('selected');
    }

    // テンキーのボタンが押された時、選択中の投球欄に値を反映する
    function applyKeypadValue(val) {
      if (!frameEditSelectedBtn) return;
      frameEditSelectedBtn.textContent = val;
      recalcFrameEditTotal();
      const next = frameEditSelectedBtn.nextElementSibling;
      frameEditSelectedBtn.classList.remove('selected');
      if (next && next.classList.contains('sb-throw-btn')) {
        selectThrowBtn(next);
      } else {
        frameEditSelectedBtn = null;
      }
    }

    function recalcFrameEditTotal() {
      const cells = document.querySelectorAll('#frame-edit-strip .scoreboard-frame');
      let last = null;
      cells.forEach(cell => {
        const sc = cell.querySelector('.sb-score-input').value;
        if (sc !== '') last = Number(sc);
      });
      document.getElementById('frame-edit-total').textContent = last != null ? last : '-';
    }

    function saveFrameEdit() {
      const memberId = document.getElementById('frame-edit-member-id').value;
      const gameNumber = Number(document.getElementById('frame-edit-game-number').value);
      const cells = document.querySelectorAll('#frame-edit-strip .scoreboard-frame');
      const frames = Array.from(cells).map(cell => ({
        throws: Array.from(cell.querySelectorAll('.sb-throw-btn')).map(b => b.textContent.trim()).filter(v => v !== ''),
        score: (() => { const v = cell.querySelector('.sb-score-input').value; return v === '' ? null : Number(v); })(),
        is_split: cell.querySelector('.sb-split-check').checked
      }));
      const total = computeTotalFromFrames(frames);
      if (!scannedFrameData[memberId]) scannedFrameData[memberId] = {};
      scannedFrameData[memberId][gameNumber] = { frames, total };

      renderScoreTable(memberId);
      closeModal('modal-frame-edit');
    }

    function clearFrameEditData() {
      const memberId = document.getElementById('frame-edit-member-id').value;
      const gameNumber = Number(document.getElementById('frame-edit-game-number').value);
      if (scannedFrameData[memberId]) scannedFrameData[memberId][gameNumber] = { frames: blankFrames(), total: null };
      renderScoreTable(memberId);
      closeModal('modal-frame-edit');
    }


    function submitScores() {
      const date = document.getElementById('score-date').value;
      const checkboxes = document.querySelectorAll('.attendance-check:checked');
      if (checkboxes.length === 0) return showToast('参加メンバーが選択されていません');

      const beforeUnlocked = {};
      appData.members.forEach(m => {
        beforeUnlocked[m.id] = checkAchievements(appData.stats[m.id]);
      });

      const records = [];
      checkboxes.forEach(cb => {
        const mId = cb.value;
        const gc = parseInt(document.getElementById(`gc-${mId}`).value) || 0;
        const totals = [1, 2, 3, 4, 5].map(gameNumber => {
          if (gameNumber > gc) return null;
          const fd = scannedFrameData[mId] && scannedFrameData[mId][gameNumber];
          return (fd && fd.total != null) ? fd.total : null;
        });
        const [g1, g2, g3, g4, g5] = totals;
        records.push({
          date: date,
          memberId: mId,
          gameCount: gc,
          g1: g1, g2: g2, g3: g3, g4: g4, g5: g5,
          totalScore: (g1||0) + (g2||0) + (g3||0) + (g4||0) + (g5||0),
          frames: scannedFrameData[mId] || {}
        });
      });

      const totalGamesToday = records.reduce((sum, r) => sum + (r.gameCount || 0), 0);
      const poolBefore = appData.vault.totalPoolGames;

      document.getElementById('loading').style.display = 'block';
      supabaseInsertScores(records).then(res => {
        document.getElementById('loading').style.display = 'none';
        showToast(res.message);
        if (!res.success) return;

        checkboxes.forEach(cb => { delete scannedFrameData[cb.value]; });

        fetchData(() => {
          showSaveSummary(totalGamesToday, poolBefore, appData.vault.totalPoolGames);

          checkboxes.forEach(cb => {
            const mId = cb.value;
            const member = appData.members.find(m => m.id === mId);
            const afterList = checkAchievements(appData.stats[mId]);
            const beforeList = beforeUnlocked[mId] || [];

            const newlyUnlocked = afterList.filter(id => !beforeList.includes(id));
            newlyUnlocked.forEach(achId => {
              const ach = ACHIEVEMENTS.find(a => a.id === achId);
              if (ach && member) {
                showToast(`🎉 【${member.name}】がアチーブメント『${ach.icon} ${ach.name}』を獲得！`, true);
              }
            });
          });
        });
      });
    }

    function showSaveSummary(totalGamesToday, poolBefore, poolAfter) {
      document.getElementById('summary-total-games').innerText = `${totalGamesToday} G`;
      document.getElementById('summary-pool-before').innerText = `${poolBefore} G`;
      document.getElementById('summary-pool-after').innerText = `${poolAfter} G`;
      showModal('modal-save-summary');
    }

