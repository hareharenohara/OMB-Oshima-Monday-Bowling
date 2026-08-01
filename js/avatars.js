    /* ---------------------------------------------------------
       アバター選択（絵文字 / 写真）
       --------------------------------------------------------- */

    // avatar値が写真URLかどうかの判定（http(s)で始まる文字列のみ写真として扱う）
    function isPhotoAvatar(avatar) {
      return typeof avatar === 'string' && /^https?:\/\//.test(avatar);
    }

    // 各所のアバター表示用HTMLを生成（写真なら<img>、それ以外は絵文字/頭文字テキスト）
    function avatarInnerHtml(avatar, fallbackChar) {
      if (isPhotoAvatar(avatar)) {
        return `<img src="${escapeHtml(avatar)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:50%;">`;
      }
      return escapeHtml(avatar || fallbackChar || '👤');
    }

    function showAvatarPicker() {
      if (!currentMyPageMemberId) return;
      const member = appData.members.find(m => m.id === currentMyPageMemberId);
      const grid = document.getElementById('avatar-picker-grid');
      grid.innerHTML = AVATAR_OPTIONS.map(emoji => `
        <div class="avatar-picker-item ${member && member.avatar === emoji ? 'selected' : ''}" onclick="submitAvatarChoice('${emoji}')">${emoji}</div>
      `).join('');
      showModal('modal-avatar-picker');
    }

    function submitAvatarChoice(emoji) {
      document.getElementById('loading').style.display = 'block';
      supabaseSetAvatar(currentMyPageMemberId, emoji).then(res => {
        document.getElementById('loading').style.display = 'none';
        showToast(res.message);
        if (!res.success) return;
        closeModal('modal-avatar-picker');
        fetchData(() => {
          renderDashboard();
        });
      });
    }

    // 写真選択 → 大きすぎる画像は縮小してから切り抜きUIへ渡す
    function handleAvatarFileSelect(event) {
      const file = event.target.files && event.target.files[0];
      event.target.value = ''; // 同じファイルを連続選択しても発火するようにリセット
      if (!file) return;
      if (!file.type || !file.type.startsWith('image/')) {
        showToast('画像ファイルを選択してください');
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const tempImg = new Image();
        tempImg.onload = () => {
          // 大きな画像はキャンバス操作を軽くするため長辺1200pxに縮小
          const MAX = 1200;
          let w = tempImg.naturalWidth, h = tempImg.naturalHeight;
          if (w > MAX || h > MAX) {
            const ratio = Math.min(MAX / w, MAX / h);
            w = Math.round(w * ratio);
            h = Math.round(h * ratio);
          }
          const resizeCanvas = document.createElement('canvas');
          resizeCanvas.width = w;
          resizeCanvas.height = h;
          resizeCanvas.getContext('2d').drawImage(tempImg, 0, 0, w, h);

          const cropImg = document.getElementById('avatar-crop-img');
          cropImg.onload = () => {
            initAvatarCropState(cropImg);
            closeModal('modal-avatar-picker');
            showModal('modal-avatar-crop');
          };
          cropImg.src = resizeCanvas.toDataURL('image/jpeg', 0.92);
        };
        tempImg.onerror = () => showToast('画像の読み込みに失敗しました');
        tempImg.src = e.target.result;
      };
      reader.onerror = () => showToast('ファイルの読み込みに失敗しました');
      reader.readAsDataURL(file);
    }

    let avatarCropState = null;

    function initAvatarCropState(imgEl) {
      const stage = document.getElementById('avatar-crop-stage');
      const stageSize = stage.clientWidth || 260;
      const nw = imgEl.naturalWidth, nh = imgEl.naturalHeight;
      const minScale = stageSize / Math.min(nw, nh); // 円形の枠を必ず埋める最小倍率
      avatarCropState = {
        naturalW: nw, naturalH: nh, stageSize,
        minScale, scale: minScale,
        offsetX: (stageSize - nw * minScale) / 2,
        offsetY: (stageSize - nh * minScale) / 2,
        dragging: false, startX: 0, startY: 0, startOffsetX: 0, startOffsetY: 0
      };
      document.getElementById('avatar-crop-zoom').value = 100;
      applyAvatarCropTransform();
    }

    function applyAvatarCropTransform() {
      const s = avatarCropState;
      if (!s) return;
      const imgEl = document.getElementById('avatar-crop-img');
      imgEl.style.width = (s.naturalW * s.scale) + 'px';
      imgEl.style.height = (s.naturalH * s.scale) + 'px';
      imgEl.style.transform = `translate(${s.offsetX}px, ${s.offsetY}px)`;
    }

    function clampAvatarOffset() {
      const s = avatarCropState;
      const w = s.naturalW * s.scale, h = s.naturalH * s.scale;
      s.offsetX = Math.min(0, Math.max(s.stageSize - w, s.offsetX));
      s.offsetY = Math.min(0, Math.max(s.stageSize - h, s.offsetY));
    }

    function onAvatarZoomChange() {
      const s = avatarCropState;
      if (!s) return;
      const zoomPct = Number(document.getElementById('avatar-crop-zoom').value);
      const newScale = s.minScale * (zoomPct / 100);
      // 中心点を保ったままズームする
      const cx = s.stageSize / 2, cy = s.stageSize / 2;
      const relX = (cx - s.offsetX) / s.scale;
      const relY = (cy - s.offsetY) / s.scale;
      s.scale = newScale;
      s.offsetX = cx - relX * s.scale;
      s.offsetY = cy - relY * s.scale;
      clampAvatarOffset();
      applyAvatarCropTransform();
    }

    // ドラッグ操作（マウス・タッチ共通のPointer Eventsで実装、リスナーは初期化時に一度だけ登録）
    function setupAvatarCropDragHandlers() {
      const stage = document.getElementById('avatar-crop-stage');
      if (!stage) return;
      stage.addEventListener('pointerdown', (e) => {
        const s = avatarCropState;
        if (!s) return;
        s.dragging = true;
        s.startX = e.clientX; s.startY = e.clientY;
        s.startOffsetX = s.offsetX; s.startOffsetY = s.offsetY;
        stage.classList.add('dragging');
        stage.setPointerCapture(e.pointerId);
      });
      stage.addEventListener('pointermove', (e) => {
        const s = avatarCropState;
        if (!s || !s.dragging) return;
        s.offsetX = s.startOffsetX + (e.clientX - s.startX);
        s.offsetY = s.startOffsetY + (e.clientY - s.startY);
        clampAvatarOffset();
        applyAvatarCropTransform();
      });
      const endDrag = (e) => {
        const s = avatarCropState;
        if (!s) return;
        s.dragging = false;
        stage.classList.remove('dragging');
      };
      stage.addEventListener('pointerup', endDrag);
      stage.addEventListener('pointercancel', endDrag);
      stage.addEventListener('pointerleave', endDrag);
    }

    async function confirmAvatarCrop() {
      const s = avatarCropState;
      if (!s || !currentMyPageMemberId) return;
      const imgEl = document.getElementById('avatar-crop-img');
      const OUT = 400; // 保存する正方形画像の出力サイズ(px)
      const ratio = OUT / s.stageSize;
      const canvas = document.createElement('canvas');
      canvas.width = OUT; canvas.height = OUT;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(
        imgEl,
        0, 0, s.naturalW, s.naturalH,
        s.offsetX * ratio, s.offsetY * ratio, s.naturalW * s.scale * ratio, s.naturalH * s.scale * ratio
      );

      canvas.toBlob(async (blob) => {
        if (!blob) { showToast('画像の処理に失敗しました'); return; }
        document.getElementById('loading').style.display = 'block';
        const result = await uploadAvatarPhoto(currentMyPageMemberId, blob);
        document.getElementById('loading').style.display = 'none';
        showToast(result.message);
        if (!result.success) return;
        closeModal('modal-avatar-crop');
        fetchData(() => {
          renderDashboard();
        });
      }, 'image/jpeg', 0.88);
    }

    // Supabase Storageの'avatars'バケットへアップロードし、公開URLをavatarに保存
    // （事前にSupabase側で'avatars'バケットの作成と、認証済みユーザーへのinsert/update許可ポリシーが必要）
    async function uploadAvatarPhoto(memberId, blob) {
      try {
        const path = `${memberId}/${Date.now()}.jpg`;
        const { error: uploadError } = await supabaseClient
          .storage
          .from('avatars')
          .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
        if (uploadError) {
          return { success: false, message: '写真のアップロードに失敗しました: ' + uploadError.message };
        }
        const { data: urlData } = supabaseClient.storage.from('avatars').getPublicUrl(path);
        const publicUrl = urlData.publicUrl + `?t=${Date.now()}`; // 更新時にキャッシュされないよう付与
        return await supabaseSetAvatar(memberId, publicUrl);
      } catch (err) {
        return { success: false, message: '予期せぬエラーが発生しました: ' + err.message };
      }
    }

