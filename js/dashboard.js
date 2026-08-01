let dashboardFrameChartInstance = null;
let dashboardScoreChartInstance = null;
let dashboardHistoryVisibleCount = 15;
let dashboardViewedMemberId = null;

const RANKING_CATEGORY_LABELS = {
  avg: 'アベレージ',
  g3: '3G合計スコア',
  high: 'ハイスコア(1G)',
  games: '投球ゲーム数',
  gapMax: '最多ギャップ',
  gapMin: '最小ギャップ',
  mip: '急成長(MIP)',
  giant: 'ジャイアントキリング'
};

function getDashboardMemberId() {
  return dashboardViewedMemberId || supabaseMemberId;
}

function openMemberDashboard(memberId) {
  dashboardViewedMemberId = memberId;
  switchTab('tab-dashboard');
  closeAppMenu();
  renderDashboard();
}

function openDashboardAvatarPicker() {
  if (getDashboardMemberId() !== supabaseMemberId) return;
  showAvatarPicker();
}

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
  const memberId = getDashboardMemberId();
  const member = appData.members.find((m) => m.id === memberId);
  const stats = appData.stats[memberId];
  if (!member || !stats) return;
  const isOwnDashboard = memberId === supabaseMemberId;
  currentProfileMemberId = memberId;
  const dashboard = document.getElementById('tab-dashboard');
  dashboard.classList.toggle('member-dashboard', !isOwnDashboard);
  document.getElementById('dashboard-viewing-name').textContent = member.name;
  document.getElementById('dashboard-welcome-label').textContent = isOwnDashboard ? 'Welcome back' : 'MEMBER PERFORMANCE';
  const avatarButton = document.getElementById('dashboard-avatar');
  avatarButton.disabled = !isOwnDashboard;
  avatarButton.title = isOwnDashboard ? 'プロフィール画像を変更' : '';
  const equippedBadge = document.getElementById('dashboard-equipped-badge');
  const equippedIcon = getAchievementIcon(member.equipped);
  equippedBadge.textContent = equippedIcon;
  equippedBadge.classList.toggle('visible', !!equippedIcon);

  document.getElementById('dashboard-name').textContent = `${member.name}さん`;
  document.getElementById('dashboard-avatar').innerHTML = avatarInnerHtml(member.avatar, member.name.charAt(0));
  document.getElementById('dashboard-ticket-balance').textContent = isOwnDashboard ? `${stats.remainingGames} G` : '—';

  const recent = getRecentDashboardGames(memberId);
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
  const allAttendance = appData.attendance.filter((a) => a.memberId === memberId);
  const totalFrameStats = computeAdvancedFrameStats(allAttendance);
  const strike = frameStats.strikeRate || 0;
  const spare = Math.max(0, (frameStats.markRate || 0) - strike);
  const open = frameStats.openFrameRate || 0;
  document.getElementById('dashboard-mark-rate').textContent = frameStats.markRate == null ? '—' : `${frameStats.markRate.toFixed(1)}%`;
  document.getElementById('dashboard-frame-legend').innerHTML = [
    ['#0072B2', 'ストライク', strike], ['#F0E442', 'スペア', spare], ['#D55E00', 'オープン', open]
  ].map(([color, label, value]) => `<span><i style="background:${color}"></i><em>${label}</em><b>${Number(value).toFixed(1)}%</b></span>`).join('');
  renderDashboardFrameChart(strike, spare, open);

  const fba = frameStats.firstBallAvg;
  document.getElementById('dashboard-fba').textContent = fba == null ? '—' : fba.toFixed(1);
  document.getElementById('dashboard-fba-bar').style.width = `${fba == null ? 0 : Math.min(100, fba * 10)}%`;
  const totalFba = totalFrameStats.firstBallAvg;
  document.getElementById('dashboard-fba-total').textContent = totalFba == null ? '—' : totalFba.toFixed(1);
  document.getElementById('dashboard-fba-marker').style.left = `${totalFba == null ? 0 : Math.min(100, totalFba * 10)}%`;
  setDashboardComparison('dashboard-fba', fba, totalFba, '本');

  const recentHigh = recent.length ? Math.max(...recent.map((g) => Number(g.score || 0))) : null;
  document.getElementById('dashboard-high-recent').textContent = recentHigh == null ? '—' : recentHigh;
  document.getElementById('dashboard-high-total').textContent = stats.highScore || '—';
  document.getElementById('dashboard-high-bar').style.width = `${recentHigh == null ? 0 : Math.min(100, recentHigh / 300 * 100)}%`;
  document.getElementById('dashboard-high-marker').style.left = `${Math.min(100, (stats.highScore || 0) / 300 * 100)}%`;
  setDashboardComparison('dashboard-high', recentHigh, stats.highScore || null, '点');
  renderDashboardScoreChart();

  renderDashboardMedals(memberId);
  renderDashboardAchievements(member, stats);
  renderDashboardMemberCarousel();
  if (isAdmin) refreshDashboardAdminSummary();
}

function setDashboardComparison(prefix, recent, total, unit) {
  const trend = document.getElementById(`${prefix}-trend`);
  const message = document.getElementById(`${prefix}-message`);
  if (recent == null || total == null) {
    trend.textContent = '—';
    trend.className = 'trend-pill';
    message.textContent = '比較できるデータがありません';
    return;
  }
  const difference = recent - total;
  trend.textContent = `${difference >= 0 ? '↑ +' : '↓ '}${difference.toFixed(1)}`;
  trend.className = `trend-pill ${difference >= 0 ? 'trend-up' : 'trend-down'}`;
  message.textContent = `通算より ${Math.abs(difference).toFixed(1)}${unit} ${difference >= 0 ? '高い' : '低い'}`;
}

function renderDashboardMedals(memberId) {
  const rankings = computeRankings('month');
  const counts = getDashboardMedalCounts(memberId, rankings);
  const medals = [];
  if (counts[0]) medals.push(`🥇×${counts[0]}`);
  if (counts[1]) medals.push(`🥈×${counts[1]}`);
  if (counts[2]) medals.push(`🥉×${counts[2]}`);
  document.getElementById('dashboard-ranking').textContent = medals.length ? medals.join(' ') : 'メダルなし';
}

function getDashboardMedalCounts(memberId, rankings) {
  const counts = [0, 0, 0];
  Object.keys(RANKING_CATEGORY_LABELS).forEach((key) => {
    const index = (rankings[key] || []).findIndex((item) => item.id === memberId);
    if (index >= 0 && index < 3) counts[index]++;
  });
  return counts;
}

function renderDashboardMemberCarousel() {
  const container = document.getElementById('dashboard-member-carousel');
  if (!container) return;
  const rankings = computeRankings('month');
  const members = [...appData.members].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  if (!members.length) {
    container.innerHTML = '<div class="dashboard-member-empty">メンバーがいません</div>';
    return;
  }

  container.innerHTML = members.map((member) => {
    const stats = appData.stats[member.id] || {};
    const recent = getRecentDashboardGames(member.id);
    const recentAvg = recent.length ? recent.reduce((sum, game) => sum + Number(game.score || 0), 0) / recent.length : null;
    const totalAvg = Number.isFinite(Number(stats.totalAvg)) ? Number(stats.totalAvg) : null;
    const counts = getDashboardMedalCounts(member.id, rankings);
    const equippedIcon = getAchievementIcon(member.equipped);
    const avatar = avatarInnerHtml(member.avatar, member.name.charAt(0));
    return `
      <button class="dashboard-member-slide" onclick="openMemberDashboard('${member.id}')" aria-label="${escapeHtml(member.name)}さんのダッシュボードを開く">
        <span class="dashboard-member-profile">
          <span class="dashboard-member-avatar-wrap">
            <span class="dashboard-member-avatar">${avatar}</span>
            ${equippedIcon ? `<span class="dashboard-member-badge">${equippedIcon}</span>` : ''}
          </span>
          <span class="dashboard-member-name"><small>MEMBER</small><b>${escapeHtml(member.name)}</b></span>
          <em>›</em>
        </span>
        <span class="dashboard-member-averages">
          <span><small>直近15G AVG</small><b>${recentAvg == null ? '—' : recentAvg.toFixed(1)}</b></span>
          <span><small>通算 AVG</small><b>${totalAvg == null ? '—' : totalAvg.toFixed(1)}</b></span>
        </span>
        <span class="dashboard-member-medals" aria-label="今月のメダル獲得数">
          <small>今月のメダル</small><span><b>🥇 ${counts[0]}</b><b>🥈 ${counts[1]}</b><b>🥉 ${counts[2]}</b></span>
        </span>
      </button>
    `;
  }).join('');
}

function renderDashboardAchievements(member, stats) {
  const unlocked = checkAchievements(stats);
  document.getElementById('dashboard-achievement-count').textContent = `${unlocked.length} / ${ACHIEVEMENTS.length}`;
  const summary = document.getElementById('dashboard-achievement-summary');
  if (!unlocked.length) {
    summary.innerHTML = '<span class="dashboard-achievement-empty">スコアを登録して実績を獲得しよう</span>';
    return;
  }
  summary.innerHTML = unlocked.slice(-4).map((id) => `<span>${getAchievementIcon(id)}</span>`).join('');
}

function openDashboardAchievements() {
  const memberId = getDashboardMemberId();
  const member = appData.members.find((m) => m.id === memberId);
  const stats = appData.stats[memberId];
  const unlocked = checkAchievements(stats);
  document.getElementById('dashboard-achievements-note').textContent = `獲得済み ${unlocked.length} / ${ACHIEVEMENTS.length}　称号をタップすると詳細を確認・装備できます。`;
  document.getElementById('dashboard-achievements-grid').innerHTML = ACHIEVEMENTS.map((achievement) => {
    const isUnlocked = unlocked.includes(achievement.id);
    const isEquipped = member.equipped === achievement.id;
    return `<button class="achievement-item ${isUnlocked ? '' : 'locked'} ${isEquipped ? 'equipped' : ''}" onclick="showAchievementDetail('${achievement.id}', ${isUnlocked}, ${isEquipped})"><span class="achievement-icon">${achievement.icon}</span><span class="achievement-name">${escapeHtml(achievement.name)}</span></button>`;
  }).join('');
  showModal('modal-dashboard-achievements');
}

function renderDashboardFrameChart(strike, spare, open) {
  const canvas = document.getElementById('dashboardFrameChart');
  if (!canvas) return;
  if (dashboardFrameChartInstance) dashboardFrameChartInstance.destroy();
  const hasData = strike + spare + open > 0;
  dashboardFrameChartInstance = new Chart(canvas, {
    type: 'doughnut',
    data: { datasets: [{ data: hasData ? [strike, spare, open] : [1], backgroundColor: hasData ? ['#0072B2', '#F0E442', '#D55E00'] : ['#334155'], borderColor: '#182233', borderWidth: hasData ? 3 : 0, hoverOffset: 3 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '72%', plugins: { legend: { display: false }, tooltip: { enabled: hasData } } }
  });
}

function renderDashboardScoreChart() {
  const canvas = document.getElementById('dashboardScoreChart');
  if (!canvas) return;
  const unitSelect = document.getElementById('dashboard-chart-unit');
  const unit = unitSelect ? unitSelect.value : 'day';
  const grouped = {};
  appData.attendance.filter((a) => a.memberId === getDashboardMemberId()).forEach((attendance) => {
    let key = attendance.date;
    if (unit === 'month') key = attendance.date.slice(0, 7);
    if (unit === 'year') key = attendance.date.slice(0, 4);
    if (unit === 'quarter') key = `${attendance.date.slice(0, 4)}-Q${Math.ceil(Number(attendance.date.slice(5, 7)) / 3)}`;
    if (!grouped[key]) grouped[key] = { score: 0, games: 0 };
    grouped[key].score += Number(attendance.totalScore || 0);
    grouped[key].games += Number(attendance.gameCount || 0);
  });
  const labels = Object.keys(grouped).sort();
  const points = labels.map((key) => grouped[key].games ? (grouped[key].score / grouped[key].games).toFixed(1) : 0);
  if (dashboardScoreChartInstance) dashboardScoreChartInstance.destroy();
  dashboardScoreChartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{ data: points, borderColor: '#38bdf8', backgroundColor: 'rgba(56,189,248,.12)', fill: true, tension: .32, pointRadius: 3, pointBackgroundColor: '#38bdf8' }]
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { suggestedMin: 80, suggestedMax: 250, grid: { color: '#263244' } }, x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } } }, plugins: { legend: { display: false } } }
  });
}

function dashboardHistoryRowHtml(item) {
  const scores = (item.games || []).map((game) => game.score).filter((score) => score != null);
  const average = item.gameCount ? (item.totalScore / item.gameCount).toFixed(1) : '—';
  const scoreChips = scores.map((score, index) => `<span class="history-score-chip ${Number(score) >= 200 ? 'score-200' : ''}"><small>${index + 1}G</small><b>${score}</b></span>`).join('');
  return `<button class="dashboard-history-row" onclick="closeModal('modal-dashboard-history'); showGameDetail('${item.id}')"><span class="history-date"><b>${item.date.slice(5).replace('-', '/')}</b><small>${item.date.slice(0, 4)}</small></span><span class="history-scores">${scoreChips || '<small>記録なし</small>'}</span><span class="history-average"><small>AVG</small><b>${average}</b></span><em>›</em></button>`;
}

function openDashboardHistoryPopup() {
  dashboardHistoryVisibleCount = 15;
  document.getElementById('dashboard-history-month').value = '';
  const member = appData.members.find((item) => item.id === getDashboardMemberId());
  document.getElementById('dashboard-history-popup-name').textContent = member ? `${member.name}さん` : '';
  renderDashboardHistoryPopup();
  showModal('modal-dashboard-history');
}

function resetDashboardHistoryPopup() {
  dashboardHistoryVisibleCount = 15;
  renderDashboardHistoryPopup();
}

function clearDashboardHistoryMonth() {
  document.getElementById('dashboard-history-month').value = '';
  resetDashboardHistoryPopup();
}

function loadMoreDashboardHistory() {
  dashboardHistoryVisibleCount += 15;
  renderDashboardHistoryPopup();
}

function renderDashboardHistoryPopup() {
  const month = document.getElementById('dashboard-history-month').value;
  let attendance = appData.attendance.filter((item) => item.memberId === getDashboardMemberId());
  if (month) attendance = attendance.filter((item) => item.date.startsWith(month));
  attendance.sort((a, b) => b.date.localeCompare(a.date));
  const visible = attendance.slice(0, dashboardHistoryVisibleCount);
  document.getElementById('dashboard-history-popup-count').textContent = `${attendance.length}件${month ? `（${month.replace('-', '年')}月）` : ''}`;
  document.getElementById('dashboard-history-popup-list').innerHTML = visible.length ? visible.map((item) => dashboardHistoryRowHtml(item)).join('') : '<p class="dashboard-empty">該当するスコア履歴がありません</p>';
  const loadMore = document.getElementById('dashboard-history-load-more');
  loadMore.style.display = visible.length < attendance.length ? 'block' : 'none';
}

function openDashboardScoreDetail() {
  document.getElementById('dashboard-detail-start').value = '';
  document.getElementById('dashboard-detail-end').value = '';
  renderDashboardScoreDetail();
  showModal('modal-dashboard-score-detail');
}

function clearDashboardScoreDetailFilter() {
  document.getElementById('dashboard-detail-start').value = '';
  document.getElementById('dashboard-detail-end').value = '';
  renderDashboardScoreDetail();
}

function renderDashboardScoreDetail() {
  const start = document.getElementById('dashboard-detail-start').value;
  const end = document.getElementById('dashboard-detail-end').value;
  let attendance = appData.attendance.filter((a) => a.memberId === getDashboardMemberId());
  if (start) attendance = attendance.filter((a) => a.date >= start);
  if (end) attendance = attendance.filter((a) => a.date <= end);
  const games = attendance.flatMap((a) => a.games || []).filter((g) => g.score != null);
  const average = games.length ? games.reduce((sum, game) => sum + Number(game.score), 0) / games.length : null;
  const high = games.length ? Math.max(...games.map((game) => Number(game.score))) : null;
  const detail = computeAdvancedFrameStats(attendance);
  document.getElementById('dashboard-detail-avg').textContent = average == null ? '—' : average.toFixed(1);
  document.getElementById('dashboard-detail-high').textContent = high == null ? '—' : `${high}`;
  document.getElementById('dashboard-detail-games').textContent = `${games.length}G`;
  const format = (value, unit, digits = 1) => value == null ? '—' : `${value.toFixed(digits)}${unit}`;
  document.getElementById('dashboard-detail-stats').innerHTML = [
    ['1投目平均倒ピン数', format(detail.firstBallAvg, '本')], ['ストライク率', format(detail.strikeRate, '%')],
    ['マーク率', format(detail.markRate, '%')], ['オープンフレーム率', format(detail.openFrameRate, '%')],
    ['スプリットカバー率', format(detail.splitCoverRate, '%')], ['10フレーム目平均獲得点', format(detail.frame10Avg, '点')],
    ['ダブル発生（1G平均）', format(detail.doublesPerGame, '回', 2)], ['ターキー発生（1G平均）', format(detail.turkeysPerGame, '回', 2)]
  ].map(([label, value]) => `<div><span>${label}</span><b>${value}</b></div>`).join('');
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
