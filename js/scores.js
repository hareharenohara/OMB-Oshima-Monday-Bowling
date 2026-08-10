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

      const attendanceRates = computeAttendanceRates();
      const sortedMembers = [...appData.members].sort((a, b) => attendanceRates[b.id] - attendanceRates[a.id]);

      sortedMembers.forEach(member => {
        const stats = appData.stats[member.id] || { recent15Avg: 0, totalAvg: 0, highScore: 0, totalGameCount: 0, remainingGames: 0 };
        const equippedIcon = getAchievementIcon(member.equipped);


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
              <button class="btn btn-secondary btn-sm" onclick="openMemberDashboard('${member.id}')">詳細</button>
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
              <label>投球G数: <input type="number" id="gc-${member.id}" min="1" step="1" value="3" inputmode="numeric" onchange="updatePreview('${member.id}'); updateGameSlots('${member.id}')" style="width:64px; padding:2px 4px;"> G</label>
            </div>
            <div class="score-table" id="score-table-${member.id}"></div>
            <div id="calc-result-${member.id}" style="text-align:right; font-size:12px; font-weight:bold; margin-top:6px; color:#38bdf8;"></div>
          </div>
        `;
        container.appendChild(card);
        renderScoreTable(member.id);
      });

      document.getElementById('alert-area').innerHTML = '';
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
      document.getElementById(`calc-result-${memberId}`).innerText = `${gc}ゲーム入力`;
    }

    // 投球G数に応じて必要な数だけ入力欄を生成する（上限なし）
    function updateGameSlots(memberId) {
      const gc = Math.max(1, parseInt(document.getElementById(`gc-${memberId}`).value) || 3);
      document.getElementById(`gc-${memberId}`).value = gc;
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
    const pendingScanImages = {};
    let scoreCropState = null;

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
        const img = new Image();
        img.onload = () => openScoreCropEditor(memberId, img);
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
      inputEl.value = ''; // 同じファイルを連続選択できるようにリセット
    }

    function openScoreCropEditor(memberId, image) {
      const canvas = document.getElementById('score-crop-canvas');
      const controlPadding = 30;
      const maxW = Math.min(840, image.naturalWidth);
      const maxH = 640;
      const scale = Math.min(maxW / image.naturalWidth, maxH / image.naturalHeight, 1);
      const imageWidth = Math.max(1, Math.round(image.naturalWidth * scale));
      const imageHeight = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.width = imageWidth + controlPadding * 2;
      canvas.height = imageHeight + controlPadding * 2;
      scoreCropState = { memberId, image, scale, imageWidth, imageHeight, controlPadding, corners: detectScoreSheetBounds(image, imageWidth, imageHeight, controlPadding), drag: -1 };
      canvas.onpointerdown = handleCropPointerDown;
      canvas.onpointermove = handleCropPointerMove;
      canvas.onpointerup = canvas.onpointercancel = finishCropDrag;
      drawScoreCrop();
      showModal('modal-score-crop');
    }

    function detectScoreSheetBounds(image, width, height, offset = 0) {
      const probe = document.createElement('canvas');
      probe.width = width; probe.height = height;
      const ctx = probe.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(image, 0, 0, width, height);
      const pixels = ctx.getImageData(0, 0, width, height).data;
      let minX = width, minY = height, maxX = 0, maxY = 0, count = 0;
      for (let y = 0; y < height; y += 3) for (let x = 0; x < width; x += 3) {
        const i = (y * width + x) * 4;
        const light = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
        if (light > 135 && Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) - Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) < 75) {
          minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); count++;
        }
      }
      const enough = count > (width * height) / 100;
      const pad = 8;
      const box = enough ? { left: Math.max(pad, minX), top: Math.max(pad, minY), right: Math.min(width - pad, maxX), bottom: Math.min(height - pad, maxY) }
        : { left: pad, top: pad, right: width - pad, bottom: height - pad };
      return [{ x:box.left+offset,y:box.top+offset }, { x:box.right+offset,y:box.top+offset }, { x:box.right+offset,y:box.bottom+offset }, { x:box.left+offset,y:box.bottom+offset }];
    }

    function drawScoreCrop() {
      if (!scoreCropState) return;
      const canvas = document.getElementById('score-crop-canvas');
      const ctx = canvas.getContext('2d');
      const { controlPadding, imageWidth, imageHeight } = scoreCropState;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#080b10'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(scoreCropState.image, controlPadding, controlPadding, imageWidth, imageHeight);
      ctx.fillStyle = 'rgba(0,0,0,.42)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.save(); ctx.beginPath(); scoreCropState.corners.forEach((p, i) => i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y)); ctx.closePath(); ctx.clip();
      ctx.drawImage(scoreCropState.image, controlPadding, controlPadding, imageWidth, imageHeight); ctx.restore();
      ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 3; ctx.beginPath(); scoreCropState.corners.forEach((p, i) => i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y)); ctx.closePath(); ctx.stroke();
      scoreCropState.corners.forEach((p, i) => { ctx.fillStyle='#38bdf8'; ctx.beginPath(); ctx.arc(p.x,p.y,14,0,Math.PI*2); ctx.fill(); ctx.strokeStyle='#fff'; ctx.lineWidth=3; ctx.stroke(); ctx.fillStyle='#fff'; ctx.font='bold 11px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(String(i+1),p.x,p.y); });
    }

    function cropPointerPosition(event) {
      const canvas = document.getElementById('score-crop-canvas');
      const rect = canvas.getBoundingClientRect();
      return { x:(event.clientX-rect.left)*canvas.width/rect.width, y:(event.clientY-rect.top)*canvas.height/rect.height };
    }
    function handleCropPointerDown(event) { if(!scoreCropState)return; event.preventDefault(); const p=cropPointerPosition(event); let best=Infinity,index=-1; scoreCropState.corners.forEach((c,i)=>{const d=(c.x-p.x)**2+(c.y-p.y)**2;if(d<best){best=d;index=i;}}); if(best>55*55)return; scoreCropState.drag=index; event.currentTarget.setPointerCapture(event.pointerId); showCropLoupe(event,scoreCropState.corners[index]); }
    function handleCropPointerMove(event) { if (!scoreCropState || scoreCropState.drag < 0) return; event.preventDefault(); const p=cropPointerPosition(event),s=scoreCropState,min=s.controlPadding,maxX=min+s.imageWidth,maxY=min+s.imageHeight; s.corners[s.drag]={x:Math.max(min,Math.min(maxX,p.x)),y:Math.max(min,Math.min(maxY,p.y))}; drawScoreCrop(); showCropLoupe(event,s.corners[s.drag]); }
    function finishCropDrag() { if(scoreCropState)scoreCropState.drag=-1; document.getElementById('score-crop-loupe').classList.remove('active'); }
    function showCropLoupe(event, point) { const state=scoreCropState,loupe=document.getElementById('score-crop-loupe'),wrapper=loupe.parentElement,rect=wrapper.getBoundingClientRect(),size=132; loupe.width=264; loupe.height=264; const ctx=loupe.getContext('2d'),sourceSize=90/state.scale,zoom=loupe.width/sourceSize,px=(point.x-state.controlPadding)/state.scale,py=(point.y-state.controlPadding)/state.scale; ctx.fillStyle='#080b10';ctx.fillRect(0,0,loupe.width,loupe.height);ctx.drawImage(state.image,132-px*zoom,132-py*zoom,state.image.naturalWidth*zoom,state.image.naturalHeight*zoom); ctx.strokeStyle='#38bdf8';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(132,94);ctx.lineTo(132,170);ctx.moveTo(94,132);ctx.lineTo(170,132);ctx.stroke(); const localX=event.clientX-rect.left,localY=event.clientY-rect.top; loupe.style.left=(localX>rect.width/2?8:Math.max(8,rect.width-size-8))+'px'; loupe.style.top=(localY>rect.height/2?8:Math.max(8,rect.height-size-8))+'px'; loupe.classList.add('active'); }
    function resetScoreCrop() { if (!scoreCropState) return; const s=scoreCropState; s.corners=detectScoreSheetBounds(s.image,s.imageWidth,s.imageHeight,s.controlPadding); drawScoreCrop(); }
    function useFullScoreImage() { if (!scoreCropState) return; const s=scoreCropState,p=s.controlPadding; s.corners=[{x:p,y:p},{x:p+s.imageWidth,y:p},{x:p+s.imageWidth,y:p+s.imageHeight},{x:p,y:p+s.imageHeight}]; drawScoreCrop(); }
    function cancelScoreCrop() { finishCropDrag(); scoreCropState=null; closeModal('modal-score-crop'); }

    async function confirmScoreCrop() {
      if (!scoreCropState) return;
      const polygonArea = Math.abs(scoreCropState.corners.reduce((sum, point, i, points) => {
        const next = points[(i + 1) % points.length]; return sum + point.x * next.y - next.x * point.y;
      }, 0) / 2);
      const cropCanvas = document.getElementById('score-crop-canvas');
      if (polygonArea < cropCanvas.width * cropCanvas.height * .04) return showToast('選択範囲が小さすぎます。結果票全体を囲んでください。');
      setScanStatus(scoreCropState.memberId, '傾きとコントラストを補正しています（15%）...');
      const memberId = scoreCropState.memberId;
      const output = warpAndEnhanceScoreImage(scoreCropState);
      const blob = await new Promise(resolve => output.toBlob(resolve, 'image/jpeg', .9));
      if (!blob) return showToast('画像を処理できませんでした。別の写真をお試しください。');
      const dataUrl = output.toDataURL('image/jpeg', .9);
      const originalDataUrl = makeScanReferenceImage(scoreCropState.image);
      pendingScanImages[memberId] = blob;
      const thumb = document.getElementById(`scan-thumb-${memberId}`); thumb.src=dataUrl; thumb.style.display='inline-block';
      scoreCropState=null; closeModal('modal-score-crop');
      scanPersonalSlip(memberId, dataUrl.split(',')[1], 'image/jpeg', originalDataUrl.split(',')[1]);
    }

    function makeScanReferenceImage(image) {
      const canvas=document.createElement('canvas'),scale=Math.min(1,1400/image.naturalWidth);
      canvas.width=Math.max(1,Math.round(image.naturalWidth*scale)); canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height); return canvas.toDataURL('image/jpeg',.78);
    }

    function warpAndEnhanceScoreImage(state) {
      const src=document.createElement('canvas'), scale=state.scale;
      src.width=state.image.naturalWidth; src.height=state.image.naturalHeight; src.getContext('2d').drawImage(state.image,0,0);
      const p=state.corners.map(c=>({x:(c.x-state.controlPadding)/scale,y:(c.y-state.controlPadding)/scale}));
      const width=Math.min(1800,Math.max(600,Math.round(Math.max(Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y),Math.hypot(p[2].x-p[3].x,p[2].y-p[3].y)))));
      const ratio=width/Math.max(1,Math.max(Math.hypot(p[3].x-p[0].x,p[3].y-p[0].y),Math.hypot(p[2].x-p[1].x,p[2].y-p[1].y)));
      const height=Math.max(400,Math.min(2200,Math.round(width/ratio)));
      const out=document.createElement('canvas'); out.width=width; out.height=height;
      const sctx=src.getContext('2d',{willReadFrequently:true}), source=sctx.getImageData(0,0,src.width,src.height), result=new ImageData(width,height);
      for(let y=0;y<height;y++){const v=y/(height-1);for(let x=0;x<width;x++){const u=x/(width-1);const sx=(1-u)*(1-v)*p[0].x+u*(1-v)*p[1].x+u*v*p[2].x+(1-u)*v*p[3].x;const sy=(1-u)*(1-v)*p[0].y+u*(1-v)*p[1].y+u*v*p[2].y+(1-u)*v*p[3].y;const si=(Math.max(0,Math.min(src.height-1,Math.round(sy)))*src.width+Math.max(0,Math.min(src.width-1,Math.round(sx))))*4,di=(y*width+x)*4;for(let k=0;k<3;k++){const value=source.data[si+k];result.data[di+k]=Math.max(0,Math.min(255,(value-128)*1.22+140));}result.data[di+3]=255;}}
      out.getContext('2d').putImageData(result,0,0); return out;
    }

    async function scanPersonalSlip(memberId, base64, mime, originalBase64) {
      setScanStatus(memberId, '画像を送信しています（45%）...');
      const progressTimer = setTimeout(() => setScanStatus(memberId, '文字とスコアを解析しています（75%）...'), 1200);

      try {
        const { data, error } = await supabaseClient.functions.invoke('scan-bowling-slip', {
          body: { imageBase64: base64, originalImageBase64: originalBase64 || null, mimeType: mime }
        });
        if (error) {
          let message = '画像読み取りサービスを利用できませんでした。';
          if (error.context && typeof error.context.json === 'function') {
            const errorBody = await error.context.json().catch(() => null);
            if (errorBody && errorBody.error) message = errorBody.error;
          }
          throw new Error(message);
        }

        clearTimeout(progressTimer);
        setScanStatus(memberId, '読み取り結果を確認しています（90%）...');
        const games = Array.isArray(data && data.games) ? data.games : [];
        if (games.length === 0) throw new Error((data && data.error) || 'ゲームを読み取れませんでした。手入力してください。');

        applyScannedGames(memberId, games, data.date);
        setScanStatus(memberId, `${games.length}ゲーム分を読み取りました。読み取り精度は完璧ではないため📋アイコンから必ず確認してください。`, 'ok');
      } catch (err) {
        clearTimeout(progressTimer);
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
      const gcSelect = document.getElementById(`gc-${memberId}`);
      gcSelect.value = String(games.length || 1);

      if (!scannedFrameData[memberId]) scannedFrameData[memberId] = {};

      games.forEach((g, idx) => {
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
        const totals = Array.from({ length: gc }, (_, idx) => {
          const gameNumber = idx + 1;
          const fd = scannedFrameData[mId] && scannedFrameData[mId][gameNumber];
          return (fd && fd.total != null) ? fd.total : null;
        });
        records.push({
          date: date,
          memberId: mId,
          gameCount: gc,
          games: totals.map((score, idx) => ({ gameNumber: idx + 1, score })),
          totalScore: totals.reduce((sum, score) => sum + (score || 0), 0),
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

