const axios = require("axios");
const LeagueStats = require("../models/leagueStats");
const LiveMatch = require("../models/LiveMatch");
const Fixture = require("../models/fixture");
require("dotenv").config();

const API_KEY = process.env.API_FOOTBALL_KEY;
const BASE_URL = process.env.API_URL;
const headers = { "x-apisports-key": API_KEY };

const LIVE_SHORT = ["1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE"];
const nz = (v) => (isNaN(v) || v == null ? 0 : Number(v));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch paginado de /players (secuencial)
 */
async function fetchAllPlayers(leagueId, season) {
  let page = 1;
  let totalPages = 1;
  const all = [];

  while (page <= totalPages) {
    const { data } = await axios.get(`${BASE_URL}/players`, {
      headers,
      params: { league: leagueId, season, page },
    });

    all.push(...(data.response || []));
    totalPages = data?.paging?.total || page;
    page++;

    await sleep(300); // evita rate limit
  }

  return all;
}

/**
 * Aggregation de métricas por jugador
 */
function aggregatePlayers(rawPlayers) {
  const map = new Map();

  for (const { player = {}, statistics = [] } of rawPlayers) {
    if (!player?.id || !statistics.length) continue;

    let acc = map.get(player.id);
    if (!acc) {
      acc = {
        playerId: player.id,
        name: player.name || "",
        photo: player.photo || "",
        teamId: null,
        teamName: "",
        minutes: 0,
        _teamMinutes: 0,
        goals: 0,
        assists: 0,
        yellow: 0,
        red: 0,
        shotsTotal: 0,
        shotsOn: 0,
        passesTotal: 0,
        keyPasses: 0,
        dribblesAttempts: 0,
        dribblesSuccess: 0,
        tackles: 0,
        interceptions: 0,
        foulsDrawn: 0,
        foulsCommitted: 0,
        rating: 0,
      };
      map.set(player.id, acc);
    }

    for (const st of statistics) {
      const minutes = nz(st?.games?.minutes);
      acc.minutes += minutes;

      if (minutes > acc._teamMinutes) {
        acc._teamMinutes = minutes;
        acc.teamId = st?.team?.id ?? acc.teamId;
        acc.teamName = st?.team?.name ?? acc.teamName;
        const r = Number(st?.games?.rating);
        if (!isNaN(r)) acc.rating = r;
      }

      acc.shotsTotal += nz(st?.shots?.total);
      acc.shotsOn += nz(st?.shots?.on);
      acc.passesTotal += nz(st?.passes?.total);
      acc.keyPasses += nz(st?.passes?.key);
      acc.dribblesAttempts += nz(st?.dribbles?.attempts);
      acc.dribblesSuccess += nz(st?.dribbles?.success);
      acc.tackles += nz(st?.tackles?.total);
      acc.interceptions += nz(st?.tackles?.interceptions);
      acc.foulsDrawn += nz(st?.fouls?.drawn);
      acc.foulsCommitted += nz(st?.fouls?.committed);
      acc.goals += nz(st?.goals?.total);
      acc.assists += nz(st?.goals?.assists);
      acc.yellow += nz(st?.cards?.yellow);
      acc.red += nz(st?.cards?.red);
    }
  }

  return Array.from(map.values());
}

/**
 * Top N filtrado
 */
function topN(players, key, n = 10) {
  return players
    .filter((p) => nz(p[key]) > 0)
    .sort((a, b) => nz(b[key]) - nz(a[key]))
    .slice(0, n)
    .map((p) => ({
      playerId: p.playerId,
      name: p.name,
      photo: p.photo,
      teamId: p.teamId,
      teamName: p.teamName,
      [key]: p[key],
      minutes: p.minutes,
    }));
}

/**
 * Fetch de tops oficiales (secuencial)
 */
async function fetchOfficialTopLists(leagueId, season) {
  const endpoints = [
    { key: "topScorers", url: "players/topscorers", metric: "goals", path: (st) => nz(st?.goals?.total) },
    { key: "topAssists", url: "players/topassists", metric: "assists", path: (st) => nz(st?.goals?.assists) },
    { key: "topYellowCards", url: "players/topyellowcards", metric: "yellow", path: (st) => nz(st?.cards?.yellow) },
    { key: "topRedCards", url: "players/topredcards", metric: "red", path: (st) => nz(st?.cards?.red) },
  ];

  const result = {};

  for (const ep of endpoints) {
    try {
      const { data } = await axios.get(`${BASE_URL}/${ep.url}`, {
        headers,
        params: { league: leagueId, season },
      });
      const mapItem = (item) => {
        const p = item.player || {};
        const st = item.statistics?.[0] || {};
        const team = st.team || {};
        return {
          playerId: p.id,
          name: p.name,
          photo: p.photo,
          teamId: team.id ?? null,
          teamName: team.name ?? "",
          [ep.metric]: ep.path(st),
        };
      };
      result[ep.key] = (data.response || []).slice(0, 10).map(mapItem);
    } catch (err) {
      console.warn(`⚠️ Error obteniendo ${ep.url}:`, err.message);
      result[ep.key] = [];
    }
    await sleep(500); // pequeña pausa entre peticiones
  }

  return result;
}

/**
 * 🔥 Orquestador principal con actualización dinámica (sin Promise.all)
 */
async function getLeagueStats(leagueId, season) {
  let doc = await LeagueStats.findOne({ leagueId, season });
  const now = new Date();

  // --- 1️⃣ Detectar actividad (en vivo o del día) ---
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const liveMatches = await LiveMatch.find({
    "league.id": leagueId,
    "status.short": { $in: LIVE_SHORT },
  }).lean();
  const hasLive = liveMatches.length > 0;

  const fixturesToday = await Fixture.find({
    "league.id": leagueId,
    date: { $gte: startOfDay, $lte: endOfDay },
  }).lean();
  const hasToday = fixturesToday.length > 0;

  // --- 2️⃣ Frecuencia de actualización dinámica ---
  let maxAgeMinutes = 720; // 12 h
  if (hasLive) maxAgeMinutes = 10;
  else if (hasToday) maxAgeMinutes = 120;

  const lastUpdated = doc ? new Date(doc.lastUpdated) : null;
  const diffMinutes = lastUpdated ? (now - lastUpdated) / (1000 * 60) : Infinity;
  const shouldUpdate = !doc || diffMinutes >= maxAgeMinutes;

  if (!shouldUpdate) return doc;

  console.log(`🔁 Actualizando estadísticas de liga ${leagueId} (${season}) cada ${maxAgeMinutes} min...`);

  // --- 3️⃣ Fetch de datos (secuencial) ---
  const playersRaw = await fetchAllPlayers(leagueId, season);
  await sleep(500);
  const official = await fetchOfficialTopLists(leagueId, season);

  const aggregated = aggregatePlayers(playersRaw);

  // --- 4️⃣ Armar payload completo ---
  const payload = {
    leagueId,
    season,
    ...official,
    topRating: topN(aggregated, "rating"),
    topShotsTotal: topN(aggregated, "shotsTotal"),
    topShotsOn: topN(aggregated, "shotsOn"),
    topKeyPasses: topN(aggregated, "keyPasses"),
    topPassesTotal: topN(aggregated, "passesTotal"),
    topDribblesSuccess: topN(aggregated, "dribblesSuccess"),
    topDribblesAttempts: topN(aggregated, "dribblesAttempts"),
    topTackles: topN(aggregated, "tackles"),
    topInterceptions: topN(aggregated, "interceptions"),
    topFoulsDrawn: topN(aggregated, "foulsDrawn"),
    topFoulsCommitted: topN(aggregated, "foulsCommitted"),
    lastUpdated: now,
  };

  doc = await LeagueStats.findOneAndUpdate(
    { leagueId, season },
    { $set: payload },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return doc;
}

module.exports = { getLeagueStats };