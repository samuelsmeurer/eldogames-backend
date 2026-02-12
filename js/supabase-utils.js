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

async function getDailyPosition(username, gameType) {
  try {
    let url = '/leaderboard/daily/position/' + encodeURIComponent(username.toLowerCase());
    if (gameType && gameType !== 'all') url += '?game_type=' + encodeURIComponent(gameType);
    return await api(url);
  } catch (e) {
    return { rank: null, score: 0, username };
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

// ========== MULTIPLIER BOOSTERS ==========

const DAILY_QUESTIONS = [
  { q: 'Cual es la stablecoin mas utilizada del mundo?', options: ['USDT', 'USDC', 'DAI', 'BUSD'], answer: 0 },
  { q: 'Quien creo Bitcoin?', options: ['Vitalik Buterin', 'Satoshi Nakamoto', 'Charles Hoskinson', 'Elon Musk'], answer: 1 },
  { q: 'Que significa "HODL" en cripto?', options: ['Vender rapido', 'Mantener a largo plazo', 'Comprar mas', 'Hacer trading'], answer: 1 },
  { q: 'En que ano se creo Bitcoin?', options: ['2007', '2009', '2011', '2013'], answer: 1 },
  { q: 'Que blockchain usa El Dorado para transferencias?', options: ['Bitcoin', 'Ethereum', 'Tron', 'Varias redes'], answer: 3 },
  { q: 'Que es una wallet en cripto?', options: ['Un exchange', 'Una billetera digital', 'Un token', 'Un banco'], answer: 1 },
  { q: 'Cual es el simbolo de Ethereum?', options: ['BTC', 'ETH', 'XRP', 'SOL'], answer: 1 },
  { q: 'Que significa P2P?', options: ['Pay to Play', 'Peer to Peer', 'Point to Point', 'Price to Price'], answer: 1 },
  { q: 'Que es KYC?', options: ['Una criptomoneda', 'Verificacion de identidad', 'Un tipo de wallet', 'Un exchange'], answer: 1 },
  { q: 'Cuantos Bitcoin existiran como maximo?', options: ['10 millones', '21 millones', '100 millones', 'Infinitos'], answer: 1 },
  { q: 'Que es un NFT?', options: ['Una moneda', 'Un token no fungible', 'Un exchange', 'Una blockchain'], answer: 1 },
  { q: 'Que red es conocida por sus bajas comisiones?', options: ['Bitcoin', 'Ethereum', 'Tron', 'Ninguna'], answer: 2 },
  { q: 'Que es DeFi?', options: ['Finanzas descentralizadas', 'Un token', 'Un banco digital', 'Una app'], answer: 0 },
  { q: 'Que significa "gas" en Ethereum?', options: ['Combustible', 'Comision de transaccion', 'Un token', 'Velocidad'], answer: 1 },
];

function getTodayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}

function getDailyQuestion() {
  const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  return DAILY_QUESTIONS[dayOfYear % DAILY_QUESTIONS.length];
}

function getBoosterState() {
  const key = 'ed_boosters_' + getTodayKey();
  const saved = localStorage.getItem(key);
  if (saved) return JSON.parse(saved);
  return { question: false, tarjeta: false, tarjetaSpent: 0, compra: false, referral: false };
}

function saveBoosterState(state) {
  const key = 'ed_boosters_' + getTodayKey();
  localStorage.setItem(key, JSON.stringify(state));
}

function completeBoosterTask(task) {
  const state = getBoosterState();
  state[task] = true;
  saveBoosterState(state);
}

function addTarjetaSpending(amount) {
  const state = getBoosterState();
  state.tarjetaSpent = (state.tarjetaSpent || 0) + amount;
  if (state.tarjetaSpent >= 10) state.tarjeta = true;
  saveBoosterState(state);
}

function getMultiplier() {
  const state = getBoosterState();
  let m = 1.0;
  if (state.question) m *= 1.1;
  if (state.tarjeta) m *= 1.1;
  if (state.compra) m *= 1.1;
  if (state.referral) m *= 1.1;
  return parseFloat(m.toFixed(4));
}

function getActiveBoosterCount() {
  const state = getBoosterState();
  let count = 0;
  if (state.question) count++;
  if (state.tarjeta) count++;
  if (state.compra) count++;
  if (state.referral) count++;
  return count;
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
  getDailyPosition,
  getGlobalLeaderboard,
  getAvailableBoosters,
  getUserBoosters,
  checkBoosterProgress,
  completeBooster,
  getDailyQuestion,
  getBoosterState,
  saveBoosterState,
  completeBoosterTask,
  addTarjetaSpending,
  getMultiplier,
  getActiveBoosterCount,
};
