    /* ---------------------------------------------------------
       Supabase 認証（移行ステップ②: ログインゲートのみ）
       --------------------------------------------------------- */
    async function initSupabaseAndCheckSession() {
      if (SUPABASE_URL.includes('xxxxxxxxxxxx') || SUPABASE_ANON_KEY.includes('ここに')) {
        document.getElementById('login-error').innerText = 'SUPABASE_URL / SUPABASE_ANON_KEY が未設定です（index.html上部を編集してください）。';
        return;
      }
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

      const { data: { session } } = await supabaseClient.auth.getSession();
      if (session) {
        await onSupabaseLoggedIn(session);
      }
      // セッションが無ければログインゲートを表示したまま待機（デフォルトで表示済み）
    }

    async function handleSupabaseLogin() {
      const email = document.getElementById('login-gate-email').value;
      const password = document.getElementById('login-gate-password').value;
      const errorEl = document.getElementById('login-error');
      const btn = document.getElementById('login-gate-btn');
      errorEl.innerText = '';

      if (!email || !password) {
        errorEl.innerText = 'メールアドレスとパスワードを入力してください。';
        return;
      }

      btn.disabled = true;
      btn.innerText = 'ログイン中...';
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      btn.disabled = false;
      btn.innerText = 'ログイン';

      if (error) {
        errorEl.innerText = 'ログインに失敗しました。メールアドレス・パスワードをご確認ください。';
        return;
      }

      await onSupabaseLoggedIn(data.session);
    }

    async function onSupabaseLoggedIn(session) {
      supabaseUser = session.user;

      // membersテーブルとの紐付け（初回のみ実際に紐付き、以降は確認のみ）
      const { data: linkResult, error: linkError } = await supabaseClient.rpc('link_my_account');
      if (linkError) {
        document.getElementById('login-error').innerText = `紐付け処理でエラーが発生しました: ${linkError.message}`;
        return;
      }
      if (!linkResult.success) {
        document.getElementById('login-error').innerText = linkResult.message;
        await supabaseClient.auth.signOut();
        return;
      }
      supabaseMemberId = linkResult.member_id;

      // 管理者判定（membersテーブルのroleに基づく）
      const { data: memberRow, error: roleError } = await supabaseClient
        .from('members')
        .select('role')
        .eq('id', supabaseMemberId)
        .single();
      isAdmin = !roleError && memberRow && memberRow.role === 'admin';
      document.body.classList.toggle('is-admin', isAdmin);

      // ログインゲートを閉じてアプリ本体を起動
      document.getElementById('login-gate').classList.add('hidden');
      fetchData();
      refreshPendingRequestBadge();
      checkPushSubscriptionState();
    }

    function openMyOwnPage() {
      if (!supabaseMemberId) return;
      showMyPage(supabaseMemberId);
    }

    function renderAccountButton() {
      const btn = document.getElementById('account-btn');
      if (!btn || !supabaseMemberId) return;
      const member = appData.members.find(m => m.id === supabaseMemberId);
      const avatar = member && member.avatar;
      if (isPhotoAvatar(avatar)) {
        btn.style.cssText = 'width:40px; height:40px; min-height:40px; min-width:40px; padding:0; border-radius:50%; overflow:hidden; box-sizing:border-box; display:flex; align-items:center; justify-content:center;';
        btn.innerHTML = avatarInnerHtml(avatar, '👤');
      } else {
        btn.style.cssText = 'font-size:16px; padding:6px 10px;';
        btn.innerHTML = avatarInnerHtml(avatar, '👤');
      }
    }

    async function handleSupabaseLogout() {
      await supabaseClient.auth.signOut();
      location.reload();
    }

    // メンバー名・備考等をinnerHTMLに埋め込む際の簡易エスケープ
    function escapeHtml(str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function showToast(msg, isAchievement = false) {
      const container = document.getElementById('toast-container');
      const toast = document.createElement('div');
      toast.className = `toast ${isAchievement ? 'toast-achievement' : ''}`;
      toast.innerText = msg;
      container.appendChild(toast);
      setTimeout(() => toast.remove(), 3500);
    }

    function showEditScoreModal(id, memberId, date, gameCount, g1, g2, g3, g4, g5) {
      closeModal('modal-history-view');
      document.getElementById('edit-score-id').value = id;

      const memberSelect = document.getElementById('edit-score-member-id');
      memberSelect.innerHTML = appData.members.map(m =>
        `<option value="${m.id}" ${m.id === memberId ? 'selected' : ''}>${escapeHtml(m.name)}</option>`
      ).join('');

      document.getElementById('edit-score-date').value = date;
      document.getElementById('edit-score-gc').value = gameCount;

      document.getElementById('edit-score-g1').value = (g1 !== null && g1 !== undefined && !isNaN(g1)) ? g1 : '';
      document.getElementById('edit-score-g2').value = (g2 !== null && g2 !== undefined && !isNaN(g2)) ? g2 : '';
      document.getElementById('edit-score-g3').value = (g3 !== null && g3 !== undefined && !isNaN(g3)) ? g3 : '';
      document.getElementById('edit-score-g4').value = (g4 !== null && g4 !== undefined && !isNaN(g4)) ? g4 : '';
      document.getElementById('edit-score-g5').value = (g5 !== null && g5 !== undefined && !isNaN(g5)) ? g5 : '';

      updateEditGameSlots();
      showModal('modal-edit-score');
    }

    // 編集モーダルの投球G数選択に応じて4G/5G目の入力欄の表示・非表示を切り替える
    function updateEditGameSlots() {
      const gc = parseInt(document.getElementById('edit-score-gc').value) || 3;
      const grid = document.getElementById('edit-score-grid');
      grid.classList.remove('games-4', 'games-5');
      if (gc === 4) grid.classList.add('games-4');
      if (gc === 5) grid.classList.add('games-5');

      document.getElementById('edit-score-g4-wrap').classList.toggle('hidden-slot', gc < 4);
      document.getElementById('edit-score-g5-wrap').classList.toggle('hidden-slot', gc < 5);
    }

    function submitUpdateScore() {
      const g1Val = document.getElementById('edit-score-g1').value;
      const g2Val = document.getElementById('edit-score-g2').value;
      const g3Val = document.getElementById('edit-score-g3').value;
      const g4Val = document.getElementById('edit-score-g4').value;
      const g5Val = document.getElementById('edit-score-g5').value;

      const g1 = g1Val !== '' ? parseInt(g1Val) : null;
      const g2 = g2Val !== '' ? parseInt(g2Val) : null;
      const g3 = g3Val !== '' ? parseInt(g3Val) : null;
      const g4 = g4Val !== '' ? parseInt(g4Val) : null;
      const g5 = g5Val !== '' ? parseInt(g5Val) : null;

      const record = {
        id: document.getElementById('edit-score-id').value,
        memberId: document.getElementById('edit-score-member-id').value,
        date: document.getElementById('edit-score-date').value,
        gameCount: parseInt(document.getElementById('edit-score-gc').value) || 0,
        g1: g1,
        g2: g2,
        g3: g3,
        g4: g4,
        g5: g5,
        totalScore: (g1 || 0) + (g2 || 0) + (g3 || 0) + (g4 || 0) + (g5 || 0)
      };

      document.getElementById('loading').style.display = 'block';
      supabaseUpdateScore(record).then(res => {
        document.getElementById('loading').style.display = 'none';
        showToast(res.message);
        if (res.success) closeModal('modal-edit-score');
        fetchData();
      });
    }

    function executeDeleteScore() {
      const id = document.getElementById('edit-score-id').value;
      if (!id) return;
      if (!confirm('この記録を削除します。よろしいですか？（元に戻せません）')) return;

      document.getElementById('loading').style.display = 'block';
      supabaseDeleteSession(id).then(res => {
        document.getElementById('loading').style.display = 'none';
        showToast(res.message);
        if (res.success) closeModal('modal-edit-score');
        fetchData();
      });
    }

    function fetchData(onSuccessCallback) {
      document.getElementById('loading').style.display = 'block';
      fetchDataFromSupabase().then(res => {
        document.getElementById('loading').style.display = 'none';
        if (res.success) {
          appData = res;
          document.getElementById('tab-score').style.display = 'block';
          renderAll();
          if (onSuccessCallback) onSuccessCallback();
        } else {
          showToast(`データ取得に失敗しました: ${res.message || ''}`);
        }
      });
    }

