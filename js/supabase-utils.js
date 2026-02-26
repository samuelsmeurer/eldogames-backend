// ========== API CLIENT ==========
const API_BASE = '/api';

async function api(path, options) {
  const res = await fetch(API_BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'API error');
  }
  return res.json();
}

// ========== USER ==========

async function checkUsernameAvailable(username) {
  const data = await api('/users/check/' + encodeURIComponent(username.toLowerCase()));
  return data.available;
}

async function createUser(username) {
  try {
    const data = await api('/users', {
      method: 'POST',
      body: JSON.stringify({ username: username.toLowerCase() }),
    });
    localStorage.setItem('ed_username', data.username);
    localStorage.setItem('ed_user_id', data.id);
    return data;
  } catch (e) {
    console.error('[API] createUser error:', e);
    return null;
  }
}

function getCurrentUsername() {
  return localStorage.getItem('ed_username') || null;
}

function getCurrentUserId() {
  return localStorage.getItem('ed_user_id') || null;
}

// ========== GAME COUNT (for seeded RNG) ==========

async function getGameCountToday(username) {
  try {
    const data = await api('/games/count/' + encodeURIComponent(username.toLowerCase()));
    return data.count || 0;
  } catch (e) {
    return 0;
  }
}

// ========== SCORES ==========

async function submitScore(username, rawScore, multiplier, finalScore) {
  try {
    return await api('/scores', {
      method: 'POST',
      body: JSON.stringify({
        username: username.toLowerCase(),
        raw_score: rawScore,
        multiplier: multiplier,
        final_score: finalScore,
      }),
    });
  } catch (e) {
    console.error('[API] submitScore error:', e);
    return null;
  }
}

async function getBestScore(username) {
  try {
    const data = await api('/scores/best/' + encodeURIComponent(username.toLowerCase()));
    return data.score || 0;
  } catch (e) {
    return 0;
  }
}

// ========== LEADERBOARD ==========

async function getDailyLeaderboard(filterOrLimit, limit) {
  try {
    // Support both getDailyLeaderboard(limit) and getDailyLeaderboard(filter, limit)
    let actualLimit = 10;
    if (typeof filterOrLimit === 'number') {
      actualLimit = filterOrLimit;
    } else if (typeof limit === 'number') {
      actualLimit = limit;
    }
    return await api('/leaderboard/daily?limit=' + actualLimit);
  } catch (e) {
    return [];
  }
}

async function getDailyPosition(username) {
  try {
    return await api('/leaderboard/daily/position/' + encodeURIComponent(username.toLowerCase()));
  } catch (e) {
    return { rank: null, score: 0, username };
  }
}

// ========== DAILY BOOSTS ==========

async function getDailyBoosts(username) {
  try {
    return await api('/daily-boosts/' + encodeURIComponent(username.toLowerCase()));
  } catch (e) {
    return { shared_link: false, question_answered: false, question_correct: false };
  }
}

async function shareLink(username) {
  try {
    return await api('/daily-boosts/share', {
      method: 'POST',
      body: JSON.stringify({ username: username.toLowerCase() }),
    });
  } catch (e) {
    console.error('[API] shareLink error:', e);
    return null;
  }
}

async function answerDailyQuestion(username, answer) {
  try {
    return await api('/daily-boosts/question', {
      method: 'POST',
      body: JSON.stringify({ username: username.toLowerCase(), answer }),
    });
  } catch (e) {
    console.error('[API] answerQuestion error:', e);
    return null;
  }
}

async function getDailyQuestion() {
  try {
    return await api('/daily-question');
  } catch (e) {
    return null;
  }
}

async function getMultiplier(username) {
  try {
    const data = await api('/multiplier/' + encodeURIComponent(username.toLowerCase()));
    return data.multiplier || 1.0;
  } catch (e) {
    return 1.0;
  }
}

// ========== EXPORT ==========
window.SupabaseUtils = {
  checkUsernameAvailable,
  createUser,
  getCurrentUsername,
  getCurrentUserId,
  getGameCountToday,
  submitScore,
  getBestScore,
  getDailyLeaderboard,
  getDailyPosition,
  getDailyBoosts,
  shareLink,
  answerDailyQuestion,
  getDailyQuestion,
  getMultiplier,
};
