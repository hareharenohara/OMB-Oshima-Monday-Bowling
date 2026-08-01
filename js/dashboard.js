let dashboardFrameChartInstance = null;
let dashboardScoreChartInstance = null;

function getRecentDashboardGames(memberId) {
  const games = [];
  appData.attendance
    .filter((a) => a.memberId === memberId)
    .forEach((a) => (a.games || []).forEach((g) => {
      if (g.score != null) games.push({ date: a.date, sessionId: a.id, ...g });
    }));
  return games
    .sort((a, b) => a.date.localeCompare(b.date) || a.gameNumber - b.gameNumber)
    .slice(-15);
}

function renderDashboard() {
  if (!supabaseMemberId || !appData.members || !appData.stats) return;
  const member = appData.members.find((m) => m.id === supabaseMemberId);
  const stats = appData.stats[supabaseMemberId];
  if (!member || !stats) return;
  currentMyPageMemberId = supabaseMemberId;

  document.getElementById('dashboard-name').textContent = `${member.name}さん`;
  document.getElementById('dashboard-avatar').innerHTML = avatarInnerHtml(member.avatar, member.name.charAt(0));
  document.getElementById('dashboard-ticket-balance').textContent = `${stats.remainingGames} G`;

  const recent = getRecentDashboardGames(supabaseMemberId);
  const recentAvg = recent.length ? recent.reduce((sum, g) => sum + Number(g.score || 0), 0) / recent.length : 0;
  const difference = recentAvg - stats.totalAvg;
  const trend = document.getElementById('dashboard-avg-trend');
  trend.textContent = recent.length ? `${difference >= 0 ? '↑ +' : '↓ '}${difference.toFixed(1)}` : '—';
  trend.className = `trend-pill ${difference >= 0 ? 'trend-up' : 'trend-down'}`;
  document.getElementById('dashboard-recent-avg').textContent = recent.length ? recentAvg.toFixed(1) : '—';
  document.getElementById('dashboard-total-avg').textContent = stats.totalAvg.toFixed(1);
  document.getElementById('dashboard-average-bar').style.width = `${Math.min(100, Math.max(0, recentAvg / 300 * 100))}%`;
  document.getElementById('dashboard-average-marker').style.left = `${Math.min(100, Math.max(0, stats.totalAvg / 300 * 100))}%`;
  document.getElementById('dashboard-average-message').textContent = !recent.length ? 'スコアデータがありません' : difference >= 0 ? `通算より ${difference.toFixed(1)} 高いペース` : `通算より ${Math.abs(difference).toFixed(1)} 低いペース`;

  const frameStats = computeAdvancedFrameStats(recent.map((g) => ({ games: [g] })));
  const strike = frameStats.strikeRate || 0;
  const spare = Math.max(0, (frameStats.markRate || 0) - strike);
  const open = frameStats.openFrameRate || 0;
  document.getElementById('dashboard-mark-rate').textContent = frameStats.markRate == null ? '—' : `${frameStats.markRate.toFixed(1)}%`;
  document.getElementById('dashboard-frame-legend').innerHTML = [
    ['#38bdf8', 'ストライク', strike], ['#a78bfa', 'スペア', spare], ['#f97316', 'オープン', open]
  ].map(([color, label, value]) => `<span><i style="background:${color}"></i>${label}<b>${Number(value).toFixed(1)}%</b></span>`).join('');
  renderDashboardFrameChart(strike, spare, open);

  const fba = frameStats.firstBallAvg;
  document.getElementById('dashboard-fba').textContent = fba == null ? '—' : fba.toFixed(1);
  document.getElementById('dashboard-fba-bar').style.width = `${fba == null ? 0 : Math.min(100, fba * 10)}%`;
  renderDashboardScoreChart(recent);

  const avgRanking = computeRankings('all').avg || [];
  const rank = avgRanking.findIndex((r) => r.id === supabaseMemberId);
  document.getElementById('dashboard-ranking').textContent = rank >= 0 ? `${rank + 1}位` : '順位を見る';
  renderDashboardAchievements(member, stats);
  if (isAdmin) refreshDashboardAdminSummary();
}

function renderDashboardAchievements(member, stats) {
  const unlocked = checkAchievements(stats);
  document.getElementById('dashboard-achievement-count').textContent = `${unlocked.length} / ${ACHIEVEMENTS.length}`;
  const list = document.getElementById('dashboard-achievement-list');
  if (!unlocked.length) {
    list.innerHTML = '<span class="dashboard-achievement-empty">スコアを登録して実績を獲得しよう</span>';
    return;
  }
  list.innerHTML = unlocked.map((id) => {
    const achievement = ACHIEVEMENTS.find((a) => a.id === id);
    if (!achievement) return '';
    const equipped = member.equipped === id;
    return `<button class="dashboard-achievement ${equipped ? 'equipped' : ''}" onclick="showAchievementDetail('${id}', true, ${equipped})" title="${escapeHtml(achievement.name)}"><span>${achievement.icon}</span><small>${escapeHtml(achievement.name)}</small></button>`;
  }).join('');
}

function renderDashboardFrameChart(strike, spare, open) {
  const canvas = document.getElementById('dashboardFrameChart');
  if (!canvas) return;
  if (dashboardFrameChartInstance) dashboardFrameChartInstance.destroy();
  const hasData = strike + spare + open > 0;
  dashboardFrameChartInstance = new Chart(canvas, {
    type: 'doughnut',
    data: { datasets: [{ data: hasData ? [strike, spare, open] : [1], backgroundColor: hasData ? ['#38bdf8', '#a78bfa', '#f97316'] : ['#334155'], borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '72%', plugins: { legend: { display: false }, tooltip: { enabled: hasData } } }
  });
}

function renderDashboardScoreChart(games) {
  const canvas = document.getElementById('dashboardScoreChart');
  if (!canvas) return;
  if (dashboardScoreChartInstance) dashboardScoreChartInstance.destroy();
  dashboardScoreChartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels: games.map((g) => `${g.date.slice(5)} ${g.gameNumber}G`),
      datasets: [{ data: games.map((g) => g.score), borderColor: '#38bdf8', backgroundColor: 'rgba(56,189,248,.12)', fill: true, tension: .32, pointRadius: 3, pointBackgroundColor: '#38bdf8' }]
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { suggestedMin: 80, suggestedMax: 250, grid: { color: '#263244' } }, x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } } }, plugins: { legend: { display: false } } }
  });
}

function toggleDashboardAdmin() {
  const body = document.getElementById('dashboard-admin-body');
  const open = body.classList.toggle('open');
  document.querySelector('.dashboard-admin-summary').setAttribute('aria-expanded', String(open));
  document.getElementById('dashboard-admin-chevron').textContent = open ? '⌃' : '⌄';
}

async function refreshDashboardAdminSummary() {
  const { data, error } = await supabaseClient.from('requests').select('type').eq('status', 'pending');
  if (error) return;
  const scoreCount = data.filter((r) => r.type === 'score').length;
  const ticketCount = data.filter((r) => r.type === 'purchase' || r.type === 'return').length;
  const total = scoreCount + ticketCount;
  document.getElementById('dashboard-admin-summary').textContent = total ? `スコア ${scoreCount}件・回数券 ${ticketCount}件` : '承認待ちはありません';
  document.getElementById('dashboard-pending-count').textContent = `${total}件`;
}
