// Supabaseクライアントの設定
const SUPABASE_URL = 'YOUR_SUPABASE_PROJECT_URL'; // SupabaseのURLを記入してください
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY'; // Supabaseのanon keyを記入してください
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------------------------------------------------------
   ユーティリティ
   --------------------------------------------------------- */
// Web Crypto APIによるSHA-256ハッシュ化（GASのUtilities.computeDigest代替）
async function hashPassword(pass) {
  const msgUint8 = new TextEncoder().encode(String(pass));
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function formatDate(d) {
  if (!d) return '';
  const date = new Date(d);
  const year = date.getFullYear();
  const month = ('0' + (date.getMonth() + 1)).slice(-2);
  const day = ('0' + date.getDate()).slice(-2);
  return `${year}-${month}-${day}`;
}

/* ---------------------------------------------------------
   初期データ取得
   --------------------------------------------------------- */
async function getInitialData() {
  try {
    const [membersRes, attendanceRes, depositRes, settingsRes] = await Promise.all([
      supabase.from('members').select('*'),
      supabase.from('attendance_scores').select('*').order('date', { ascending: true }),
      supabase.from('deposit_history').select('*').order('date', { ascending: true }),
      supabase.from('settings').select('*')
    ]);

    if (membersRes.error) throw membersRes.error;
    if (attendanceRes.error) throw attendanceRes.error;
    if (depositRes.error) throw depositRes.error;
    if (settingsRes.error) throw settingsRes.error;

    const settingsMap = {};
    settingsRes.data.forEach(item => { settingsMap[item.key] = item.value; });

    const settings = {
      pricePerPack: Number(settingsMap['PricePerPack']) || 3000,
      gamesPerPack: Number(settingsMap['GamesPerPack']) || 11
    };
    const gamesPerPack = settings.gamesPerPack;

    const members = [];
    const stats = {};
    const memberNameById = {};

    membersRes.data.forEach(row => {
      const id = String(row.id);
      memberNameById[id] = String(row.name);
      if (row.status === '在籍') {
        members.push({
          id: id,
          name: String(row.name),
          equipped: row.equipped_achievement ? String(row.equipped_achievement) : '',
          avatar: row.avatar ? String(row.avatar) : ''
        });
        stats[id] = {
          totalPacks: 0,
          totalGameCount: 0,
          totalScore: 0,
          scoresArray: [],
          gamesDetailArray: [],
          highScore: 0
        };
      }
    });

    const deposits = [];
    depositRes.data.forEach(row => {
      const mId = String(row.member_id);
      const packs = Number(row.packs) || 0;
      if (stats[mId]) {
        stats[mId].totalPacks += packs;
      }
      deposits.push({
        id: String(row.id),
        date: formatDate(row.date),
        memberId: mId,
        memberName: memberNameById[mId] || '不明',
        packs: packs,
        note: row.note || ''
      });
    });

    const attendance = [];
    attendanceRes.data.forEach(row => {
      const mId = String(row.member_id);
      const gameCount = Number(row.game_count) || 0;
      const g1 = row.g1 !== null && row.g1 !== undefined ? Number(row.g1) : null;
      const g2 = row.g2 !== null && row.g2 !== undefined ? Number(row.g2) : null;
      const g3 = row.g3 !== null && row.g3 !== undefined ? Number(row.g3) : null;
      const g4 = row.g4 !== null && row.g4 !== undefined ? Number(row.g4) : null;
      const g5 = row.g5 !== null && row.g5 !== undefined ? Number(row.g5) : null;
      const totalScore = Number(row.total_score) || 0;

      if (stats[mId]) {
        stats[mId].totalGameCount += gameCount;
        stats[mId].totalScore += totalScore;

        const gameScores = [g1, g2, g3, g4, g5].filter(g => g !== null && g > 0);
        gameScores.forEach(g => {
          stats[mId].scoresArray.push(g);
          if (g > stats[mId].highScore) stats[mId].highScore = g;
        });

        stats[mId].gamesDetailArray.push({
          date: formatDate(row.date),
          g1: g1, g2: g2, g3: g3, g4: g4, g5: g5,
          totalScore: totalScore,
          gameCount: gameCount
        });
      }

      attendance.push({
        id: String(row.id),
        date: formatDate(row.date),
        memberId: mId,
        memberName: memberNameById[mId] || '不明',
        gameCount: gameCount,
        g1: g1, g2: g2, g3: g3, g4: g4, g5: g5,
        totalScore: totalScore
      });
    });

    let totalPoolGames = 0;
    let totalInGames = 0;
    let totalOutGames = 0;

    Object.keys(stats).forEach(id => {
      const s = stats[id];
      s.remainingGames = (s.totalPacks * gamesPerPack) - s.totalGameCount;
      totalPoolGames += s.remainingGames;
      totalInGames += s.totalPacks * gamesPerPack;
      totalOutGames += s.totalGameCount;
      s.totalAvg = s.scoresArray.length > 0 ? (s.scoresArray.reduce((a, b) => a + b, 0) / s.scoresArray.length) : 0;

      const sortedGames = [...s.gamesDetailArray].sort((a, b) => new Date(a.date) - new Date(b.date));
      const chronoScores = [];
      sortedGames.forEach(g => {
        [g.g1, g.g2, g.g3, g.g4, g.g5].forEach(v => { if (v !== null && v !== undefined && v > 0) chronoScores.push(v); });
      });
      const recentScores = chronoScores.slice(-15);
      s.recent15Avg = recentScores.length > 0 ? (recentScores.reduce((a, b) => a + b, 0) / recentScores.length) : 0;
    });

    return {
      success: true,
      members: members,
      stats: stats,
      attendance: attendance.reverse(),
      deposits: deposits.reverse(),
      settings: settings,
      vault: {
        totalPoolGames: totalPoolGames,
        totalInGames: totalInGames,
        totalOutGames: totalOutGames,
        activeMembersCount: members.length
      }
    };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/* ---------------------------------------------------------
   メンバー管理・設定操作
   --------------------------------------------------------- */
async function setEquippedAchievement(memberId, achievementId) {
  const { error } = await supabase.from('members').update({ equipped_achievement: achievementId }).eq('id', memberId);
  if (error) return { success: false, message: error.message };
  return { success: true, message: '称号を装備しました！' };
}

async function setAvatar(memberId, avatar) {
  const { error } = await supabase.from('members').update({ avatar: avatar }).eq('id', memberId);
  if (error) return { success: false, message: error.message };
  return { success: true, message: 'アバターを変更しました！' };
}

async function addMember(name) {
  if (!name || !String(name).trim()) return { success: false, message: '氏名を入力してください。' };
  const id = 'M_' + crypto.randomUUID();
  const { error } = await supabase.from('members').insert({ id, name: String(name).trim(), status: '在籍' });
  if (error) return { success: false, message: error.message };
  return { success: true, message: 'メンバーを追加しました。' };
}

async function updateMember(memberId, name) {
  if (!name || !String(name).trim()) return { success: false, message: '氏名を入力してください。' };
  const { error } = await supabase.from('members').update({ name: String(name).trim() }).eq('id', memberId);
  if (error) return { success: false, message: error.message };
  return { success: true, message: 'メンバー名を更新しました。' };
}

async function deleteMember(memberId) {
  const { error } = await supabase.from('members').update({ status: '退会' }).eq('id', memberId);
  if (error) return { success: false, message: error.message };
  return { success: true, message: '退会処理が完了しました。' };
}

/* ---------------------------------------------------------
   回数券・スコア保存処理
   --------------------------------------------------------- */
async function saveDeposit(data) {
  if (!data || !data.memberId || !data.date) return { success: false, message: '入力内容が不正です。' };
  const packs = Number(data.packs);
  if (isNaN(packs) || packs === 0 || !Number.isInteger(packs)) {
    return { success: false, message: '冊数は0以外の整数で入力してください（返却の場合はマイナス）。' };
  }

  const d = new Date(data.date);
  const fiscalYear = d.getMonth() < 3 ? d.getFullYear() - 1 : d.getFullYear();
  const id = data.id ? data.id : 'DEP_' + crypto.randomUUID();

  const record = {
    id: id,
    date: data.date,
    fiscal_year: fiscalYear,
    member_id: data.memberId,
    packs: packs,
    amount: 0,
    payment_method: '回数券',
    note: data.note || ''
  };

  const { error } = await supabase.from('deposit_history').upsert(record);
  if (error) return { success: false, message: error.message };
  return { success: true, message: packs > 0 ? '回数券を追加しました。' : '返却分を記録しました。' };
}

async function saveScores(records) {
  if (!records || !records.length) return { success: false, message: '保存対象がありません。' };

  for (const r of records) {
    const gc = Number(r.gameCount);
    if (!gc || gc < 1 || gc > 5) return { success: false, message: `投球G数が不正です（${r.memberId}）。` };
    for (const g of [r.g1, r.g2, r.g3, r.g4, r.g5]) {
      if (g !== null && g !== undefined && g !== '' && (Number(g) < 0 || Number(g) > 300)) {
        return { success: false, message: 'スコアは0〜300点の範囲で入力してください。' };
      }
    }
  }

  const upsertRows = records.map(data => {
    const d = new Date(data.date);
    const fiscalYear = d.getMonth() < 3 ? d.getFullYear() - 1 : d.getFullYear();
    return {
      id: data.id ? data.id : 'ATT_' + crypto.randomUUID(),
      date: data.date,
      fiscal_year: fiscalYear,
      member_id: data.memberId,
      game_count: data.gameCount,
      g1: data.g1 || null,
      g2: data.g2 || null,
      g3: data.g3 || null,
      g4: data.g4 || null,
      g5: data.g5 || null,
      total_score: data.totalScore
    };
  });

  const { error } = await supabase.from('attendance_scores').upsert(upsertRows);
  if (error) return { success: false, message: error.message };
  return { success: true, message: 'スコアを保存しました。' };
}

async function deleteScoreRecord(id) {
  if (!id) return { success: false, message: '対象が指定されていません。' };
  const { error } = await supabase.from('attendance_scores').delete().eq('id', id);
  if (error) return { success: false, message: error.message };
  return { success: true, message: 'スコア履歴を削除しました。' };
}

/* ---------------------------------------------------------
   パスワード・設定認証
   --------------------------------------------------------- */
async function verifyAdminPassword(pass) {
  const hash = await hashPassword(pass);
  const { data, error } = await supabase.from('settings').select('value').eq('key', 'AdminPasswordHash').single();
  if (error || !data) return false;
  return data.value === hash;
}

async function changeAdminPassword(oldPass, newPass) {
  const isOk = await verifyAdminPassword(oldPass);
  if (!isOk) return { success: false, message: '現在のパスワードが違います。' };
  if (!newPass || String(newPass).length < 4) {
    return { success: false, message: '新しいパスワードは4文字以上で入力してください。' };
  }

  const newHash = await hashPassword(newPass);
  const { error } = await supabase.from('settings').upsert({ key: 'AdminPasswordHash', value: newHash });
  if (error) return { success: false, message: error.message };
  return { success: true, message: '管理者パスワードを変更しました。' };
}

async function updatePackSettings(adminPass, pricePerPack, gamesPerPack) {
  const isOk = await verifyAdminPassword(adminPass);
  if (!isOk) return { success: false, message: '管理者パスワードが違います。' };

  const price = Number(pricePerPack);
  const games = Number(gamesPerPack);
  if (!price || price <= 0 || !games || games <= 0) {
    return { success: false, message: '金額・ゲーム数は正の数で入力してください。' };
  }

  const { error } = await supabase.from('settings').upsert([
    { key: 'PricePerPack', value: String(price) },
    { key: 'GamesPerPack', value: String(games) }
  ]);

  if (error) return { success: false, message: error.message };
  return { success: true, message: '回数券の設定を更新しました。（以後の新規購入から適用されます）' };
}