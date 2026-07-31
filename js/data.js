    /* ---------------------------------------------------------
       Supabase版 getInitialData 相当
       （読み込みのみSupabaseに移行。保存系は次のステップでGASから移行予定）
       --------------------------------------------------------- */
    async function fetchDataFromSupabase() {
      try {
        const [membersRes, sessionsRes, depositsRes, settingsRes] = await Promise.all([
          supabaseClient.from('members').select('*'),
          supabaseClient
            .from('sessions')
            .select('id, date, member_id, game_count, created_at, games(id, game_number, score, frames(frame_number, throws, score, is_split))')
            .order('date', { ascending: true })
            .order('created_at', { ascending: true }),
          supabaseClient
            .from('deposits')
            .select('*')
            .order('date', { ascending: true })
            .order('created_at', { ascending: true }),
          supabaseClient.from('app_settings').select('*').eq('id', 1).single()
        ]);

        for (const res of [membersRes, sessionsRes, depositsRes, settingsRes]) {
          if (res.error) throw res.error;
        }

        const allMembersRaw = membersRes.data || [];
        const memberNameById = {};
        allMembersRaw.forEach(m => { memberNameById[m.id] = m.name; });

        const members = allMembersRaw
          .filter(m => m.status === '在籍')
          .map(m => ({
            id: m.id,
            name: m.name,
            equipped: m.equipped_achievement || '',
            avatar: m.avatar || ''
          }));

        const settings = {
          pricePerPack: Number(settingsRes.data.price_per_pack) || 3000,
          gamesPerPack: Number(settingsRes.data.games_per_pack) || 11
        };
        const gamesPerPack = settings.gamesPerPack;

        // stats用の初期化（在籍メンバーのみ、GAS版と同じ）
        const stats = {};
        members.forEach(m => {
          stats[m.id] = {
            totalPacks: 0, totalGameCount: 0, totalScore: 0,
            scoresArray: [], gamesDetailArray: [], highScore: 0
          };
        });

        // 回数券履歴
        const deposits = (depositsRes.data || []).map(d => {
          const packs = Number(d.packs) || 0;
          if (stats[d.member_id]) stats[d.member_id].totalPacks += packs;
          return {
            id: d.id,
            date: d.date,
            memberId: d.member_id,
            memberName: memberNameById[d.member_id] || '不明',
            packs: packs,
            note: d.note || ''
          };
        });

        // スコア履歴（sessions + 入れ子games を GAS版と同じ形に変換）
        const attendance = (sessionsRes.data || []).map(row => {
          const scoreByNum = {};
          (row.games || []).forEach(g => { scoreByNum[g.game_number] = g.score; });
          const g1 = scoreByNum[1] ?? null;
          const g2 = scoreByNum[2] ?? null;
          const g3 = scoreByNum[3] ?? null;
          const g4 = scoreByNum[4] ?? null;
          const g5 = scoreByNum[5] ?? null;
          const totalScore = (row.games || []).reduce((sum, g) => sum + (Number(g.score) || 0), 0);

          const s = stats[row.member_id];
          if (s) {
            s.totalGameCount += row.game_count;
            s.totalScore += totalScore;
            [g1, g2, g3, g4, g5].filter(g => g !== null && g > 0).forEach(g => {
              s.scoresArray.push(g);
              if (g > s.highScore) s.highScore = g;
            });
            s.gamesDetailArray.push({ date: row.date, g1, g2, g3, g4, g5, totalScore, gameCount: row.game_count });
          }

          const gamesDetail = (row.games || [])
            .slice()
            .sort((a, b) => a.game_number - b.game_number)
            .map(g => ({
              id: g.id,
              gameNumber: g.game_number,
              score: g.score,
              frames: (g.frames || [])
                .slice()
                .sort((a, b) => a.frame_number - b.frame_number)
                .map(f => ({ throws: f.throws || [], score: f.score, is_split: !!f.is_split }))
            }));

          return {
            id: row.id,
            date: row.date,
            memberId: row.member_id,
            memberName: memberNameById[row.member_id] || '不明',
            gameCount: row.game_count,
            g1, g2, g3, g4, g5,
            totalScore,
            games: gamesDetail
          };
        });

        // アチーブメント判定用に、メンバーごとの通算フレーム詳細統計を付与
        members.forEach(m => {
          const memberAtt = attendance.filter(a => a.memberId === m.id);
          stats[m.id].frameStats = computeAdvancedFrameStats(memberAtt);
        });

        // 統計計算（GAS版と同じロジック）
        let totalPoolGames = 0, totalInGames = 0, totalOutGames = 0;
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
      } catch (e) {
        console.error(e);
        return { success: false, message: e.message || String(e) };
      }
    }

    /* ---------------------------------------------------------
       Supabase版 書き込み処理
       （RLS: sessions/gamesのINSERTは全員可、UPDATE/DELETEは管理者のみ。
        deposits/members/app_settingsはすべて管理者のみ。
        avatar/称号装備はupdate_my_profile経由、対象は自分に限らずGAS版と同じ挙動を維持）
       --------------------------------------------------------- */

    // スコア新規保存（誰でも可）。重複日はunique制約でエラーになるので分かりやすいメッセージに変換する。
    async function supabaseInsertScores(records) {
      for (const r of records) {
        const { data: session, error: sessErr } = await supabaseClient
          .from('sessions')
          .insert({ member_id: r.memberId, date: r.date, game_count: r.gameCount })
          .select('id')
          .single();

        if (sessErr) {
          if (sessErr.code === '23505') {
            return { success: false, message: 'この日の記録は既に登録されています。修正は管理者に依頼してください。' };
          }
          return { success: false, message: sessErr.message };
        }

        const gameDefs = [];
        [r.g1, r.g2, r.g3, r.g4, r.g5].forEach((score, idx) => {
          if (score !== null && score !== undefined && score !== '') {
            gameDefs.push({ gameNumber: idx + 1, score: score });
          }
        });

        for (const gd of gameDefs) {
          const { data: gameRow, error: gameErr } = await supabaseClient
            .from('games')
            .insert({ session_id: session.id, game_number: gd.gameNumber, score: gd.score })
            .select('id')
            .single();
          if (gameErr) return { success: false, message: gameErr.message };

          const frameDetail = r.frames && r.frames[gd.gameNumber];
          if (frameDetail && frameDetail.frames && frameDetail.frames.length) {
            const frameRows = frameDetail.frames.map((f, idx) => ({
              game_id: gameRow.id,
              frame_number: idx + 1,
              throws: f.throws || [],
              score: (f.score === '' || f.score == null) ? null : f.score,
              is_split: !!f.is_split
            }));
            const { error: frameErr } = await supabaseClient.from('frames').insert(frameRows);
            if (frameErr) return { success: false, message: frameErr.message };
          }
        }
      }
      return { success: true, message: 'スコアを保存しました。' };
    }

    // スコア修正（管理者のみ・RLSで保護）。games行は一旦削除して作り直す。
    async function supabaseUpdateScore(record) {
      const { error: sessErr } = await supabaseClient
        .from('sessions')
        .update({ date: record.date, member_id: record.memberId, game_count: record.gameCount, updated_at: new Date().toISOString() })
        .eq('id', record.id);
      if (sessErr) return { success: false, message: sessErr.message };

      const { error: delErr } = await supabaseClient.from('games').delete().eq('session_id', record.id);
      if (delErr) return { success: false, message: delErr.message };

      const gameRows = [];
      [record.g1, record.g2, record.g3, record.g4, record.g5].forEach((score, idx) => {
        if (score !== null && score !== undefined && score !== '') {
          gameRows.push({ session_id: record.id, game_number: idx + 1, score: score });
        }
      });
      if (gameRows.length > 0) {
        const { error: insErr } = await supabaseClient.from('games').insert(gameRows);
        if (insErr) return { success: false, message: insErr.message };
      }
      return { success: true, message: 'スコアを更新しました。' };
    }

    // スコア削除（管理者のみ・RLSで保護）。gamesはON DELETE CASCADEで自動削除。
    async function supabaseDeleteSession(id) {
      const { error } = await supabaseClient.from('sessions').delete().eq('id', id);
      if (error) return { success: false, message: error.message };
      return { success: true, message: 'スコア履歴を削除しました。' };
    }

    // 回数券の追加・編集（管理者のみ・RLSで保護）
    async function supabaseSaveDeposit(data) {
      const packs = Number(data.packs);
      if (isNaN(packs) || packs === 0 || !Number.isInteger(packs)) {
        return { success: false, message: '冊数は0以外の整数で入力してください（返却の場合はマイナス）。' };
      }

      if (data.id) {
        const { error } = await supabaseClient
          .from('deposits')
          .update({ date: data.date, member_id: data.memberId, packs: packs, note: data.note || null })
          .eq('id', data.id);
        if (error) return { success: false, message: error.message };
        return { success: true, message: '回数券履歴を更新しました。' };
      } else {
        const { error } = await supabaseClient
          .from('deposits')
          .insert({ date: data.date, member_id: data.memberId, packs: packs, note: data.note || null });
        if (error) return { success: false, message: error.message };
        return { success: true, message: packs > 0 ? '回数券を追加しました。' : '返却分を記録しました。' };
      }
    }

    // メンバー管理（管理者のみ・RLSで保護）
    async function supabaseAddMember(name) {
      if (!name || !name.trim()) return { success: false, message: '氏名を入力してください。' };
      const { error } = await supabaseClient.from('members').insert({ name: name.trim() });
      if (error) return { success: false, message: error.message };
      return { success: true, message: 'メンバーを追加しました。' };
    }

    async function supabaseUpdateMember(id, name) {
      if (!name || !name.trim()) return { success: false, message: '氏名を入力してください。' };
      const { error } = await supabaseClient.from('members').update({ name: name.trim() }).eq('id', id);
      if (error) return { success: false, message: error.message };
      return { success: true, message: 'メンバー名を更新しました。' };
    }

    async function supabaseDeleteMember(id) {
      const { error } = await supabaseClient.from('members').update({ status: '退会' }).eq('id', id);
      if (error) return { success: false, message: error.message };
      return { success: true, message: '退会処理が完了しました。' };
    }

    // 回数券の単価・冊数設定（管理者のみ・RLSで保護）
    async function supabaseUpdatePackSettings(price, games) {
      const p = Number(price), g = Number(games);
      if (!p || p <= 0 || !g || g <= 0) {
        return { success: false, message: '金額・ゲーム数は正の数で入力してください。' };
      }
      const { error } = await supabaseClient
        .from('app_settings')
        .update({ price_per_pack: p, games_per_pack: g, updated_at: new Date().toISOString() })
        .eq('id', 1);
      if (error) return { success: false, message: error.message };
      return { success: true, message: '回数券の設定を更新しました。（以後の新規購入から適用されます）' };
    }

    // アバター・称号装備（全員可・update_my_profileはRPC内でtarget_member_idを直接指定するため
    // GAS版と同じく「誰でも任意のメンバーのプロフィールを操作できる」挙動を維持している）
    async function supabaseSetAvatar(memberId, avatar) {
      const { data, error } = await supabaseClient.rpc('set_member_avatar', {
        target_member_id: memberId,
        new_avatar: avatar
      });
      if (error) return { success: false, message: error.message };
      return data;
    }

    async function supabaseSetEquippedAchievement(memberId, achievementId) {
      const { data, error } = await supabaseClient.rpc('set_member_equipped_achievement', {
        target_member_id: memberId,
        achievement_id: achievementId
      });
      if (error) return { success: false, message: error.message };
      return data;
    }

    function getAchievementIcon(achId) {
      const ach = ACHIEVEMENTS.find(a => a.id === achId);
      return ach ? ach.icon : '';
    }

    function renderAll() {
      renderAccountButton();
      renderScoreInputList();
      renderVault();
      renderMembersTab();
      renderHistory();
      renderRanking();
    }

