    /* ---------------------------------------------------------
       UI モーダル・タブ制御
       --------------------------------------------------------- */
    function switchTab(tabId) {
      document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
      document.getElementById(tabId).style.display = 'block';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    const PROTECTED_ROUTES = Object.freeze({
      dashboard: 'tab-dashboard',
      announcements: 'tab-announcements',
      schedule: 'tab-schedule',
      chat: 'tab-chat',
      messages: 'tab-direct-messages',
      scores: 'tab-score',
      vault: 'tab-vault',
      ranking: 'tab-ranking',
      members: 'tab-members'
    });

    function getRouteFromHash() {
      return location.hash.replace(/^#\/?/, '').split(/[?&]/)[0] || (supabaseUser ? 'dashboard' : 'login');
    }

    function routeToTab(route) {
      return PROTECTED_ROUTES[route] || null;
    }

    function tabToRoute(tabId) {
      return Object.keys(PROTECTED_ROUTES).find(route => PROTECTED_ROUTES[route] === tabId) || 'dashboard';
    }

    function navigateTo(tabId, options = {}) {
      if (!supabaseUser) {
        pendingProtectedRoute = tabToRoute(tabId);
        showLoginGate();
        return;
      }
      if (tabId === 'tab-score' && !isAdmin) {
        showToast('この画面は管理者のみ利用できます。');
        tabId = 'tab-dashboard';
        options.replace = true;
      }
      if (!document.getElementById(tabId)) tabId = 'tab-dashboard';
      if (tabId === 'tab-dashboard') dashboardViewedMemberId = null;
      switchTab(tabId);
      closeAppMenu();
      if (tabId === 'tab-dashboard') renderDashboard();
      if (tabId === 'tab-announcements' && typeof openAnnouncements === 'function') openAnnouncements();
      if (tabId === 'tab-schedule' && typeof loadSchedules === 'function') loadSchedules();
      if (tabId === 'tab-chat' && typeof openGroupChat === 'function') openGroupChat();
      if (tabId === 'tab-direct-messages' && typeof openDirectMessages === 'function') openDirectMessages();
      if (!options.fromRoute) {
        const hash = `#/${tabToRoute(tabId)}`;
        if (location.hash !== hash) {
          if (options.replace) history.replaceState(null, '', hash);
          else location.hash = hash;
        }
      } else if (options.replace) {
        history.replaceState(null, '', `#/${tabToRoute(tabId)}`);
      }
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

