// controllers/leagueStatsController.js
const axios = require("axios");
const LeagueStats = require("../models/leagueStats");
require("dotenv").config();

const API_KEY = process.env.API_FOOTBALL_KEY;
const BASE_URL = process.env.API_URL;
const headers = { "x-apisports-key": API_KEY };

const nz = (v) => (isNaN(v) || v == null ? 0 : Number(v));

/**
 * Fetch paginado de /players (API-Football).
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
  }

  return all;
}

/**
 * Aggregation:
 * - suma contadores por jugador
 * - elige teamId/teamName según la estadística con MÁS minutos
 * - toma el rating directamente del statistics (st.games.rating) correspondiente a ese bloque (si existe)
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
        // minutos totales en la temporada (suma)
        minutes: 0,
        // minutos del bloque elegido (para seleccionar team y rating)
        _teamMinutes: 0,

        // métricas acumuladas
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

        // rating tomado directamente del statistics elegido
        rating: 0,
      };
      map.set(player.id, acc);
    }

    for (const st of statistics) {
      const minutes = nz(st?.games?.minutes);

      // actualizar minutos totales
      acc.minutes += minutes;

      // si este bloque tiene más minutos que el bloque que teníamos, lo elegimos como "principal"
      if (minutes > acc._teamMinutes) {
        acc._teamMinutes = minutes;
        acc.teamId = st?.team?.id ?? acc.teamId;
        acc.teamName = st?.team?.name ?? acc.teamName;

        // tomar rating directo de la API si está presente (viene como string)
        if (st?.games?.rating != null) {
          const r = Number(st.games.rating);
          acc.rating = isNaN(r) ? acc.rating : r;
        } else {
          // si no hay rating en este bloque, dejamos el rating previo (o 0)
        }
      }

      // acumular métricas
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

  // retornamos array listo (rating ya es numérico tomado del bloque con más minutos)
  return Array.from(map.values()).map((p) => ({
    playerId: p.playerId,
    name: p.name,
    photo: p.photo,
    teamId: p.teamId,
    teamName: p.teamName,
    minutes: p.minutes,
    rating: Number(p.rating) || 0,

    goals: p.goals,
    assists: p.assists,
    yellow: p.yellow,
    red: p.red,

    shotsTotal: p.shotsTotal,
    shotsOn: p.shotsOn,
    passesTotal: p.passesTotal,
    keyPasses: p.keyPasses,

    dribblesAttempts: p.dribblesAttempts,
    dribblesSuccess: p.dribblesSuccess,

    tackles: p.tackles,
    interceptions: p.interceptions,

    foulsDrawn: p.foulsDrawn,
    foulsCommitted: p.foulsCommitted,
  }));
}

/**
 * Devuelve top N cumpliendo el esquema (sin campos extras)
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
 * Fetch de listas "oficiales" (top scorers, assists, yellow, red)
 * Mapeo explícito para evitar nombres dinámicos confusos.
 */
async function fetchOfficialTopLists(leagueId, season) {
  const [scResp, asResp, ycResp, rcResp] = await Promise.all([
    axios.get(`${BASE_URL}/players/topscorers`, { headers, params: { league: leagueId, season } }),
    axios.get(`${BASE_URL}/players/topassists`, { headers, params: { league: leagueId, season } }),
    axios.get(`${BASE_URL}/players/topyellowcards`, { headers, params: { league: leagueId, season } }),
    axios.get(`${BASE_URL}/players/topredcards`, { headers, params: { league: leagueId, season } }),
  ]);

  const mapItem = (item, metricGetter) => {
    const p = item.player || {};
    const st = item.statistics?.[0] || {};
    const team = st.team || {};
    return {
      playerId: p.id,
      name: p.name,
      photo: p.photo,
      teamId: team.id ?? null,
      teamName: team.name ?? "",
      ...metricGetter(st),
    };
  };

  return {
    topScorers: (scResp.data?.response || []).slice(0, 10).map(item => mapItem(item, (st)=>({ goals: nz(st?.goals?.total) }))),
    topAssists: (asResp.data?.response || []).slice(0, 10).map(item => mapItem(item, (st)=>({ assists: nz(st?.goals?.assists) }))),
    topYellowCards: (ycResp.data?.response || []).slice(0, 10).map(item => mapItem(item, (st)=>({ yellow: nz(st?.cards?.yellow) }))),
    topRedCards: (rcResp.data?.response || []).slice(0, 10).map(item => mapItem(item, (st)=>({ red: nz(st?.cards?.red) }))),
  };
}

/**
 * Orquestador principal
 */
async function getLeagueStats(leagueId, season) {
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  const now = Date.now();

  let doc = await LeagueStats.findOne({ leagueId, season });
  if (doc && now - doc.lastUpdated.getTime() < TWO_HOURS) {
    return doc;
  }

  const [playersRaw, official] = await Promise.all([
    fetchAllPlayers(leagueId, season),
    fetchOfficialTopLists(leagueId, season),
  ]);

  const aggregated = aggregatePlayers(playersRaw);

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
    lastUpdated: new Date(),
  };

  doc = await LeagueStats.findOneAndUpdate(
    { leagueId, season },
    { $set: payload },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return doc;
}

module.exports = { getLeagueStats };