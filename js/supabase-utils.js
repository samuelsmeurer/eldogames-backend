// ========== API CLIENT ==========
// Calls our Express backend at /api/*
// No external SDK needed - just fetch()

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

// ========== USER FUNCTIONS ==========

async function checkUsernameAvailable(username) {
  try {
    const data = await api('/users/check/' + encodeURIComponent(username.toLowerCase()));
    return data.available;
  } catch (e) {
    return false;
  }
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

async function getUser(username) {
  try {
    return await api('/users/' + encodeURIComponent(username.toLowerCase()));
  } catch (e) {
    return null;
  }
}

function getCurrentUsername() {
  return localStorage.getItem('ed_username') || null;
}

function getCurrentUserId() {
  return localStorage.getItem('ed_user_id') || null;
}

function requireUsername() {
  if (!getCurrentUsername()) {
    window.location.href = '/username.html';
    return false;
  }
  return true;
}

// ========== SCORE FUNCTIONS ==========

async function submitScore(username, gameType, scoreVal, coinsVal) {
  try {
    return await api('/scores', {
      method: 'POST',
      body: JSON.stringify({
        username: username.toLowerCase(),
        game_type: gameType,
        score: scoreVal,
        coins: coinsVal || 0,
      }),
    });
  } catch (e) {
    console.error('[API] submitScore error:', e);
    return null;
  }
}

async function getBestScore(username, gameType) {
  try {
    const data = await api(
      '/scores/best?username=' + encodeURIComponent(username) + '&game_type=' + encodeURIComponent(gameType)
    );
    return data.score || 0;
  } catch (e) {
    return 0;
  }
}

async function getDailyLeaderboard(gameType, limit) {
  try {
    let url = '/leaderboard/daily?limit=' + (limit || 10);
    if (gameType && gameType !== 'all') url += '&game_type=' + encodeURIComponent(gameType);
    return await api(url);
  } catch (e) {
    return [];
  }
}

async function getGlobalLeaderboard(gameType, limit) {
  try {
    let url = '/leaderboard/global?limit=' + (limit || 50);
    if (gameType && gameType !== 'all') url += '&game_type=' + encodeURIComponent(gameType);
    return await api(url);
  } catch (e) {
    return [];
  }
}

// ========== BOOSTER FUNCTIONS ==========

async function getAvailableBoosters() {
  try {
    return await api('/boosters');
  } catch (e) {
    return [];
  }
}

async function getUserBoosters(userId) {
  const uid = userId || getCurrentUserId();
  if (!uid) return [];
  try {
    return await api('/boosters/user/' + encodeURIComponent(uid));
  } catch (e) {
    return [];
  }
}

async function checkBoosterProgress(username) {
  try {
    return await api('/boosters/progress/' + encodeURIComponent(username.toLowerCase()));
  } catch (e) {
    return {};
  }
}

async function completeBooster(boosterId) {
  const uid = getCurrentUserId();
  if (!uid) return null;
  try {
    return await api('/boosters/complete', {
      method: 'POST',
      body: JSON.stringify({ user_id: uid, booster_id: boosterId }),
    });
  } catch (e) {
    console.error('[API] completeBooster error:', e);
    return null;
  }
}

// ========== EXPORT ==========
window.SupabaseUtils = {
  checkUsernameAvailable,
  createUser,
  getUser,
  getCurrentUsername,
  getCurrentUserId,
  requireUsername,
  submitScore,
  getBestScore,
  getDailyLeaderboard,
  getGlobalLeaderboard,
  getAvailableBoosters,
  getUserBoosters,
  checkBoosterProgress,
  completeBooster,
};
