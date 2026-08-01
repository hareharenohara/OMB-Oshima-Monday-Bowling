    /* ---------------------------------------------------------
       UI モーダル・タブ制御
       --------------------------------------------------------- */
    function switchTab(tabId) {
      document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
      document.getElementById(tabId).style.display = 'block';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function navigateTo(tabId) {
      if (tabId === 'tab-dashboard') dashboardViewedMemberId = null;
      switchTab(tabId);
      closeAppMenu();
      if (tabId === 'tab-dashboard') renderDashboard();
    }

    function toggleAppMenu() {
      const menu = document.getElementById('app-menu');
      const open = !menu.classList.contains('open');
      menu.classList.toggle('open', open);
      document.getElementById('menu-backdrop').classList.toggle('open', open);
      menu.setAttribute('aria-hidden', String(!open));
      document.querySelector('.menu-toggle').setAttribute('aria-expanded', String(open));
    }

    function closeAppMenu() {
      const menu = document.getElementById('app-menu');
      if (!menu) return;
      menu.classList.remove('open');
      document.getElementById('menu-backdrop').classList.remove('open');
      menu.setAttribute('aria-hidden', 'true');
      document.querySelector('.menu-toggle').setAttribute('aria-expanded', 'false');
    }

    function showModal(id) {
      document.getElementById(id).style.display = 'flex';
    }

    function closeModal(id) {
      document.getElementById(id).style.display = 'none';
    }

    function toggleAchievementList() {
      const el = document.getElementById('mypage-ach-full');
      const btn = document.getElementById('toggle-ach-btn');
      if (el.style.display === 'none') {
        el.style.display = 'block';
        btn.innerText = '閉じる ▲';
      } else {
        el.style.display = 'none';
        btn.innerText = '一覧を見る ▼';
      }
    }

    function openAdminSettings() {
      const settings = appData.settings || { pricePerPack: 3000, gamesPerPack: 11 };
      document.getElementById('settings-price-per-pack').value = settings.pricePerPack;
      document.getElementById('settings-games-per-pack').value = settings.gamesPerPack;
      showModal('modal-admin-settings');
    }

    async function submitPackSettings() {
      const price = document.getElementById('settings-price-per-pack').value;
      const games = document.getElementById('settings-games-per-pack').value;
      const res = await supabaseUpdatePackSettings(price, games);
      showToast(res.message);
      if (res.success) {
        closeModal('modal-admin-settings');
        fetchData();
      }
    }

    function showAddMemberModal() {
      document.getElementById('new-member-name').value = '';
      showModal('modal-add-member');
    }

    function submitAddMember() {
      const name = document.getElementById('new-member-name').value;
      if (!name) return showToast('氏名を入力してください');
      document.getElementById('loading').style.display = 'block';
      supabaseAddMember(name).then(res => {
        document.getElementById('loading').style.display = 'none';
        showToast(res.message);
        if (!res.success) return;
        closeModal('modal-add-member');
        fetchData();
      });
    }

    function showEditMemberModal(id, name) {
      document.getElementById('edit-member-id').value = id;
      document.getElementById('edit-member-name').value = name;
      showModal('modal-edit-member');
    }

    function submitUpdateMember() {
      const id = document.getElementById('edit-member-id').value;
      const name = document.getElementById('edit-member-name').value;
      document.getElementById('loading').style.display = 'block';
      supabaseUpdateMember(id, name).then(res => {
        document.getElementById('loading').style.display = 'none';
        showToast(res.message);
        if (!res.success) return;
        closeModal('modal-edit-member');
        fetchData();
      });
    }

    function executeDeleteMember() {
      if (!confirm('本当にこのメンバーを退会処理しますか？')) return;
      const id = document.getElementById('edit-member-id').value;
      document.getElementById('loading').style.display = 'block';
      supabaseDeleteMember(id).then(res => {
        document.getElementById('loading').style.display = 'none';
        showToast(res.message);
        if (!res.success) return;
        closeModal('modal-edit-member');
        fetchData();
      });
    }

