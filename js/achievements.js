    /* ---------------------------------------------------------
       アチーブメント判定ロジック
       --------------------------------------------------------- */
    function checkAchievements(stats) {
      if (!stats) return [];
      const unlocked = [];
      const scores = stats.scoresArray || [];
      const attList = stats.gamesDetailArray || [];

      if (stats.totalGameCount >= 1) unlocked.push('first');
      if (stats.highScore >= 150) unlocked.push('score150');
      if (stats.highScore >= 200) unlocked.push('score200');
      if (stats.highScore >= 230) unlocked.push('score230');
      if (stats.highScore >= 250) unlocked.push('score250');
      if (stats.highScore >= 300) unlocked.push('score300');

      if (stats.totalGameCount >= 10) unlocked.push('g10');
      if (stats.totalGameCount >= 50) unlocked.push('g50');
      if (stats.totalGameCount >= 100) unlocked.push('g100');
      if (stats.totalGameCount >= 250) unlocked.push('g250');
      if (stats.totalGameCount >= 500) unlocked.push('g500');
      if (stats.totalGameCount >= 1000) unlocked.push('g1000');

      if (stats.totalGameCount >= 15) {
        if (stats.recent15Avg >= 150) unlocked.push('avg150');
        if (stats.recent15Avg >= 180) unlocked.push('avg180');
        if (stats.recent15Avg >= 200) unlocked.push('avg200');
        if (stats.recent15Avg >= 210) unlocked.push('avg210');
        if (stats.recent15Avg >= 220) unlocked.push('avg220');
        if (stats.recent15Avg >= 230) unlocked.push('avg230');
      }

      let max3G = 0;
      attList.forEach(att => {
        if (att.gameCount === 3 && att.totalScore > max3G) max3G = att.totalScore;
      });
      if (max3G >= 400) unlocked.push('p400');
      if (max3G >= 500) unlocked.push('p500');
      if (max3G >= 600) unlocked.push('p600');
      if (max3G >= 700) unlocked.push('p700');
      if (max3G >= 800) unlocked.push('p800');
      if (max3G >= 900) unlocked.push('p900');

      if (stats.totalPacks >= 3) unlocked.push('pack3');
      if (stats.totalPacks >= 10) unlocked.push('pack10');
      if (stats.totalPacks >= 50) unlocked.push('pack50');
      if (stats.totalPacks >= 100) unlocked.push('pack100');
      if (stats.totalPacks >= 200) unlocked.push('pack200');

      let hasZorome = false;
      let hasSplit100 = false;
      scores.forEach(s => {
        if (s === 100) hasSplit100 = true;
        if (s >= 111 && s <= 299 && s % 111 === 0) hasZorome = true;
      });
      if (hasZorome) unlocked.push('zorome');
      if (hasSplit100) unlocked.push('split');

      // フレーム詳細ベースの実績(通算、フレーム詳細15G以上が前提のものは frameStats.gamesWithFrames で判定)
      const fs = stats.frameStats;
      if (fs) {
        if (fs.gamesWithFrames >= 15) {
          if (fs.strikeRate != null) {
            if (fs.strikeRate >= 50) unlocked.push('strikerate50');
            if (fs.strikeRate >= 60) unlocked.push('strikerate60');
            if (fs.strikeRate >= 70) unlocked.push('strikerate70');
            if (fs.strikeRate >= 80) unlocked.push('strikerate80');
          }
          if (fs.openFrameRate != null) {
            if (fs.openFrameRate < 30) unlocked.push('lowopen30');
            if (fs.openFrameRate < 20) unlocked.push('lowopen20');
            if (fs.openFrameRate < 10) unlocked.push('lowopen10');
            if (fs.openFrameRate < 5) unlocked.push('lowopen5');
          }
          if (fs.firstBallAvg != null) {
            if (fs.firstBallAvg >= 7) unlocked.push('fba7');
            if (fs.firstBallAvg >= 8) unlocked.push('fba8');
            if (fs.firstBallAvg >= 9) unlocked.push('fba9');
          }
        }

        if (fs.splitCovered >= 1) unlocked.push('splitcover1');
        if (fs.splitCovered >= 10) unlocked.push('splitcover10');
        if (fs.splitCovered >= 30) unlocked.push('splitcover30');
        if (fs.splitCovered >= 50) unlocked.push('splitcover50');

        if (fs.turkeysTotal >= 1) unlocked.push('turkey1');
        if (fs.turkeysTotal >= 5) unlocked.push('turkey5');
        if (fs.turkeysTotal >= 20) unlocked.push('turkey20');
        if (fs.turkeysTotal >= 50) unlocked.push('turkey50');

        if (fs.maxFrame10Points != null) {
          if (fs.maxFrame10Points >= 20) unlocked.push('f10_20');
          if (fs.maxFrame10Points >= 25) unlocked.push('f10_25');
          if (fs.maxFrame10Points >= 30) unlocked.push('f10_30');
        }
      }

      // メタ実績:ここまでに解放した実績の数に応じて付与(無限ループ防止のため、他の実績の集計後に判定)
      const nonMetaCount = unlocked.length;
      if (nonMetaCount >= 10) unlocked.push('meta10');
      if (nonMetaCount >= 25) unlocked.push('meta25');
      if (nonMetaCount >= 40) unlocked.push('meta40');
      if (nonMetaCount >= 50) unlocked.push('meta50');

      return unlocked;
    }

    function showAchievementDetail(achId, isUnlocked, isEquipped) {
      const ach = ACHIEVEMENTS.find(a => a.id === achId);
      selectedAchievementId = ach.id;
      document.getElementById('ach-detail-icon').innerText = ach.icon;
      document.getElementById('ach-detail-title').innerText = ach.name;
      document.getElementById('ach-detail-desc').innerText = `【条件】${ach.desc}`;
      
      const statusBadge = document.getElementById('ach-detail-status');
      const equipBtn = document.getElementById('ach-equip-btn');
      const isOwnPage = (currentMyPageMemberId === supabaseMemberId);

      if (isEquipped) {
        statusBadge.innerText = '装備中'; statusBadge.className = 'badge badge-green';
        equipBtn.style.display = 'none';
      } else if (isUnlocked) {
        statusBadge.innerText = '獲得済み'; statusBadge.className = 'badge badge-green';
        equipBtn.style.display = isOwnPage ? 'inline-block' : 'none';
      } else {
        statusBadge.innerText = '未獲得'; statusBadge.className = 'badge badge-gray';
        equipBtn.style.display = 'none';
      }
      showModal('modal-achievement-detail');
    }

    function equipCurrentAchievement() {
      document.getElementById('loading').style.display = 'block';
      supabaseSetEquippedAchievement(currentMyPageMemberId, selectedAchievementId).then(res => {
        document.getElementById('loading').style.display = 'none';
        showToast(res.message);
        if (!res.success) return;
        closeModal('modal-achievement-detail');
        closeModal('modal-mypage');
        closeModal('modal-dashboard-achievements');
        fetchData();
      });
    }

