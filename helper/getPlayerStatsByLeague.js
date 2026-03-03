const axios = require("axios");
const TeamPlayerStatByLeague = require("../models/TeamPlayerStatByLeague");
const Fixture = require("../models/fixture");
const ApiFootballCall = require("../models/apifootballCals.js");
require("dotenv").config();

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_URL = process.env.API_URL;

// 🧠 Calcula el límite de refresco dinámico según actividad
const getRefreshLimitHours = (hoursSinceLastMatch) => {
  if (hoursSinceLastMatch < 6) return 6; // partido en curso o muy reciente
  if (hoursSinceLastMatch < 72) return 12; // jugó hace 1–3 días
  if (hoursSinceLastMatch < 168) return 48; // jugó hace menos de una semana
  return 168; // más de 7 días sin actividad
};

const getPlayerStats = async (
  teamId,
  leagueId,
  season,
  userId = null,
  source = "system",
) => {
  try {
    const logApiSuccess = async (endpoint, response, start) =>
      ApiFootballCall.create({
        endpoint,
        method: "GET",
        source,
        user: userId || null,
        apiProvider: "api-football",
        costUnit: 1,
        statusCode: response.status,
        success: true,
        responseTimeMs: Date.now() - start,
        remainingRequests:
          response.headers?.["x-ratelimit-requests-remaining"] ||
          response.headers?.["x-requests-remaining"] ||
          null,
      });

    const logApiError = async (endpoint, err, start) =>
      ApiFootballCall.create({
        endpoint,
        method: "GET",
        source,
        user: userId || null,
        apiProvider: "api-football",
        costUnit: 1,
        statusCode: err.response?.status || 500,
        success: false,
        responseTimeMs: Date.now() - start,
        remainingRequests:
          err.response?.headers?.["x-ratelimit-requests-remaining"] ||
          err.response?.headers?.["x-requests-remaining"] ||
          null,
        errorMessage: err.message,
      });

    // 🟢 Buscar datos guardados
    let stats = await TeamPlayerStatByLeague.findOne({
      teamId,
      leagueId,
      season,
    }).lean();

    // 🕓 Buscar último fixture del equipo (para calcular actividad)
    const recentFixture = await Fixture.findOne({
      $or: [{ "teams.home.id": teamId }, { "teams.away.id": teamId }],
      "league.id": leagueId,
      "fixture.season": season,
    })
      .sort({ "fixture.date": -1 })
      .lean();

    const hoursSinceLastMatch = recentFixture
      ? (Date.now() - new Date(recentFixture.fixture.date)) / 36e5
      : 9999;

    const MAX_AGE_HOURS = getRefreshLimitHours(hoursSinceLastMatch);
    const tooOld =
      !stats ||
      !stats.lastUpdate ||
      (Date.now() - new Date(stats.lastUpdate).getTime()) / 36e5 >
        MAX_AGE_HOURS;

    // ⚡ Si datos son recientes, devolverlos
    if (!tooOld) return stats;

    // 🚀 Si están desactualizados, llamar a la API-Football
    const start = Date.now();
    let response;

    try {
      response = await axios.get(`${API_URL}/players`, {
        headers: { "x-apisports-key": API_KEY },
        params: {
          team: teamId,
          league: leagueId,
          season,
        },
      });

      await logApiSuccess("/players", response, start);
    } catch (err) {
      await logApiError("/players", err, start);
      // Mantengo tu comportamiento: si falla, devuelve lo que haya en cache o []
      return stats || [];
    }

    const playerStats = response.data?.response;
    if (!playerStats || playerStats.length === 0) return stats || [];

    // 🧩 Guardar/actualizar en DB
    stats = await TeamPlayerStatByLeague.findOneAndUpdate(
      { teamId, leagueId, season },
      {
        teamId,
        leagueId,
        season,
        lastUpdate: new Date(),
        players: playerStats,
      },
      { upsert: true, new: true },
    ).lean();

    return stats;
  } catch (error) {
    return [];
  }
};

const getBestRatedTeamPlayer = (teamPlayersStats) => {
  let bestDoc = null;
  let bestRating = -Infinity;
  try {
    for (const player of teamPlayersStats.players) {
      for (const stat of player.statistics) {
        const rating = parseFloat(stat.games.rating || 0);
        if (!isNaN(rating) && rating > bestRating) {
          bestRating = rating;
          bestDoc = player;
        }
      }
    }
    return bestDoc;
  } catch (error) {
    return [];
  }
};

module.exports = {
  getPlayerStats,
  getBestRatedTeamPlayer,
};
