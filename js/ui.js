    /* ---------------------------------------------------------
       UI モーダル・タブ制御
       --------------------------------------------------------- */
    function switchTab(tabId) {
      document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
      document.getElementById(tabId).style.display = 'block';
      document.querySelectorAll('.bottom-nav button').forEach(el => el.classList.remove('active'));
      const activeBtn = document.getElementById(`tab-btn-${tabId.replace('tab-', '')}`);
      if (activeBtn) activeBtn.classList.add('active');
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

