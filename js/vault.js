    /* ---------------------------------------------------------
       ② 回数券残量画面
       --------------------------------------------------------- */
    function renderVault() {
      const ownStats = appData.stats[supabaseMemberId];
      const ownBalance = document.getElementById('vault-my-balance');
      if (ownBalance) ownBalance.innerText = ownStats ? `${ownStats.remainingGames} G` : '— G';
      document.getElementById('vault-in').innerText = `${appData.vault.totalInGames} G`;
      document.getElementById('vault-out').innerText = `${appData.vault.totalOutGames} G`;
      document.getElementById('vault-games').innerText = `${appData.vault.totalPoolGames} G`;
      document.getElementById('vault-members').innerText = appData.vault.activeMembersCount;

      const lowContainer = document.getElementById('low-balance-container');
      lowContainer.innerHTML = '';
      let hasLow = false;
      appData.members.forEach(m => {
        const stats = appData.stats[m.id];
        if (stats.remainingGames <= 3) {
          hasLow = true;
          lowContainer.innerHTML += `
            <div class="low-balance-row">
              <span><b>${escapeHtml(m.name)}</b><small>残り ${stats.remainingGames} G</small></span>
              <button class="btn btn-success btn-sm admin-only" onclick="showChargeModal('', '${m.id}', '${m.name}')">追加</button>
            </div>
          `;
        }
      });
      if (!hasLow) lowContainer.innerHTML = '<div class="feature-empty">該当者はいません</div>';

      renderVaultLedger();
    }

    let vaultChartInstance = null;

    function buildVaultLedgerEvents() {
      const events = [];
      const gamesPerPack = (appData.settings && appData.settings.gamesPerPack) || 11;

      appData.deposits.forEach(d => {
        events.push({
          date: d.date,
          type: 'in',
          amount: d.packs * gamesPerPack,
          label: `${escapeHtml(d.memberName)} さんが回数券 ${d.packs}冊 購入`,
          note: d.note,
          sortKey: 0,
          depositId: d.id,
          memberId: d.memberId,
          memberName: d.memberName,
          packs: d.packs
        });
      });

      const outByDate = {};
      appData.attendance.forEach(a => {
        if (!outByDate[a.date]) outByDate[a.date] = { total: 0, members: {} };
        outByDate[a.date].total += (a.gameCount || 0);
        outByDate[a.date].members[a.memberName] = (outByDate[a.date].members[a.memberName] || 0) + (a.gameCount || 0);
      });
      Object.keys(outByDate).forEach(date => {
        const info = outByDate[date];
        const detail = Object.keys(info.members).map(name => `${name}(${info.members[name]}G)`).join(', ');
        events.push({
          date: date,
          type: 'out',
          amount: info.total,
          label: `本日の消化: ${detail}`,
          sortKey: 1
        });
      });

      events.sort((a, b) => (new Date(a.date) - new Date(b.date)) || (a.sortKey - b.sortKey));
      let running = 0;
      events.forEach(ev => {
        running += (ev.type === 'in' ? ev.amount : -ev.amount);
        ev.balanceAfter = running;
      });

      return events;
    }

    function renderVaultChart() {
      const filter = document.getElementById('vault-chart-filter').value;
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

      // 残高（balanceAfter）は常に通算の累積値を使い、表示範囲だけを期間で絞り込む
      const allEvents = buildVaultLedgerEvents();
      const events = allEvents.filter(e => isInPeriod(e.date));

      const ctx = document.getElementById('vaultBalanceChart').getContext('2d');
      if (vaultChartInstance) vaultChartInstance.destroy();

      if (events.length === 0) {
        vaultChartInstance = null;
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        return;
      }

      vaultChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels: events.map(e => e.date),
          datasets: [{
            label: '在庫残高',
            data: events.map(e => e.balanceAfter),
            borderColor: '#38bdf8',
            backgroundColor: 'rgba(56, 189, 248, 0.12)',
            fill: true,
            stepped: true,
            pointRadius: 0,
            tension: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: { y: { grid: { color: '#333' }, beginAtZero: true }, x: { grid: { color: '#333' }, ticks: { maxTicksLimit: 6 } } },
          plugins: { legend: { display: false } }
        }
      });
    }

    function renderVaultLedger() {
      const events = buildVaultLedgerEvents();

      renderVaultChart();

      const monthlyGroups = {};
      events.forEach(ev => {
        const month = ev.date.substring(0, 7);
        if (!monthlyGroups[month]) monthlyGroups[month] = { in: 0, out: 0, items: [] };
        if (ev.type === 'in') monthlyGroups[month].in += ev.amount;
        else monthlyGroups[month].out += ev.amount;
        monthlyGroups[month].items.push(ev);
      });

      const accordionContainer = document.getElementById('vault-accordion-container');
      accordionContainer.innerHTML = '';

      Object.keys(monthlyGroups).sort().reverse().forEach(month => {
        const group = monthlyGroups[month];
        const itemsDesc = [...group.items].reverse();

        const monthHtml = `
          <div class="accordion-header" onclick="toggleAccordion('${month}')">
            <span>📅 ${month}</span>
            <span class="ledger-month-summary">
              <span class="ledger-in-tag">＋${group.in}G</span>
              <span class="ledger-out-tag">－${group.out}G</span>
              <span>▼</span>
            </span>
          </div>
          <div id="accordion-${month}" style="display:none; padding: 4px 0;">
            ${itemsDesc.map(ev => `
              <div class="ledger-event">
                <div style="display:flex; align-items:center; min-width:0;">
                  <span class="ledger-type-badge ${ev.type}">${ev.type === 'in' ? '＋' : '－'}</span>
                  <div style="min-width:0;">
                    <div style="color:#e0e0e0;">${ev.date} - ${ev.label}</div>
                    <div class="ledger-balance">保有残数: ${ev.balanceAfter} G</div>
                  </div>
                </div>
                <div style="display:flex; align-items:center; gap:6px; flex-shrink:0; margin-left:8px;">
                  <div class="ledger-amount ${ev.type}">${ev.type === 'in' ? '+' : '-'}${ev.amount}G</div>
                  ${ev.type === 'in' ? `<button class="btn btn-secondary btn-sm admin-only" onclick="showChargeModal('${ev.depositId}', '${ev.memberId}', '${ev.memberName}', '${ev.date}', ${ev.packs}, '${(ev.note || '').replace(/'/g, "\\'")}')">編集</button>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        `;
        accordionContainer.innerHTML += monthHtml;
      });
    }

    function toggleAccordion(month) {
      const el = document.getElementById(`accordion-${month}`);
      el.style.display = el.style.display === 'none' ? 'block' : 'none';
    }

    function showChargeModal(id, memberId, name, date, packs, note) {
      document.getElementById('charge-id').value = id || '';
      document.getElementById('charge-member-id').value = memberId;
      document.getElementById('charge-target-name').innerText = `対象: ${name} さん`;
      document.getElementById('charge-date').value = date || new Date().toISOString().split('T')[0];
      document.getElementById('charge-note').value = note || '';
      
      currentPacksCount = packs || 1;
      updateChargeDisplay();
      showModal('modal-charge');
    }

    function incrementChargePack() {
      currentPacksCount++;
      updateChargeDisplay();
    }

    function decrementChargePack() {
      currentPacksCount--;
      updateChargeDisplay();
    }

    function resetChargePack() {
      currentPacksCount = 1;
      updateChargeDisplay();
    }

    function updateChargeDisplay() {
      const price = (appData.settings && appData.settings.pricePerPack) || 3000;
      const games = (appData.settings && appData.settings.gamesPerPack) || 11;
      document.getElementById('charge-packs-display').innerText = currentPacksCount;
      document.getElementById('charge-games-display').innerText = currentPacksCount * games;
      document.getElementById('charge-total-price').innerText = (currentPacksCount * price).toLocaleString();
    }

    function submitCharge() {
      if (currentPacksCount === 0) return showToast('冊数が0です。増減させてから保存してください。');
      const targetMemberId = document.getElementById('charge-member-id').value;
      const beforeUnlocked = checkAchievements(appData.stats[targetMemberId]);

      const data = {
        id: document.getElementById('charge-id').value,
        memberId: targetMemberId,
        date: document.getElementById('charge-date').value,
        packs: currentPacksCount,
        note: document.getElementById('charge-note').value
      };

      document.getElementById('loading').style.display = 'block';
      supabaseSaveDeposit(data).then(res => {
        document.getElementById('loading').style.display = 'none';
        showToast(res.message);
        if (!res.success) return;
        closeModal('modal-charge');
        fetchData(() => {
          const member = appData.members.find(m => m.id === targetMemberId);
          const afterList = checkAchievements(appData.stats[targetMemberId]);
          const newlyUnlocked = afterList.filter(id => !beforeUnlocked.includes(id));

          newlyUnlocked.forEach(achId => {
            const ach = ACHIEVEMENTS.find(a => a.id === achId);
            if (ach && member) {
              showToast(`🎉 【${member.name}】がアチーブメント『${ach.icon} ${ach.name}』を獲得！`, true);
            }
          });
        });
      });
    }

