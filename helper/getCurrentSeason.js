// helpers/getCurrentSeason.js
const axios = require("axios");
const dayjs = require("dayjs");
const SeasonCache = require("../models/seasonCache");
const ApiFootballCall = require("../models/apifootballCals.js");
require("dotenv").config();

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_URL = process.env.API_URL;
const start = Date.now();

/**
 * Obtiene la temporada actual de una liga, equipo o jugador.
 * @param {Object} opts
 * @param {number} [opts.leagueId]
 * @param {number} [opts.teamId]
 * @param {number} [opts.playerId]
 * @returns {Promise<number>} temporada actual (por ejemplo 2025)
 */
async function getCurrentSeason({ leagueId, teamId, playerId, userId }) {
  if (!leagueId && !teamId && !playerId) {
    throw new Error("You must provide either leagueId, teamId or playerId");
  }

  // 🔑 Clave de caché dinámica
  const cacheKey = leagueId
    ? `league-${leagueId}`
    : teamId
      ? `team-${teamId}`
      : `player-${playerId}`;

  const cached = await SeasonCache.findOne({ key: cacheKey }).lean();
  const now = dayjs();

  // ⚡ Reusar caché si fue actualizado en las últimas 24h
  if (cached && now.diff(dayjs(cached.lastUpdated), "hour") < 24) {
    return cached.season;
  }

  try {
    let data;
    if (playerId) {
      // 🧍‍♂️ Caso jugador → usamos /players/seasons
      const res = await axios.get(`${API_URL}/players/seasons`, {
        headers: { "x-apisports-key": API_KEY },
        params: { player: playerId },
      });

      const remaining =
        res.headers["x-ratelimit-requests-remaining"] ||
        res.headers["x-requests-remaining"];

      await ApiFootballCall.create({
        endpoint: "/players/seasons",
        method: "GET",
        source: "manual", // o "cron" según el caso
        user: userId || null,
        apiProvider: "api-football",
        costUnit: 1,

        statusCode: res.status,
        success: true,
        responseTimeMs: Date.now() - start,
        remainingRequests: remaining || null,
      });

      data = res.data?.response || [];
      if (Array.isArray(data) && data.length) {
        // Orden descendente para obtener la más reciente
        const latest = data.sort((a, b) => b - a)[0];
        await SeasonCache.findOneAndUpdate(
          { key: cacheKey },
          { key: cacheKey, season: latest, lastUpdated: new Date() },
          { upsert: true, new: true },
        );
        return latest;
      }
    } else {
      // ⚽ Caso liga o equipo → usamos /leagues
      const params = leagueId ? { id: leagueId } : { team: teamId };
      const res = await axios.get(`${API_URL}/leagues`, {
        headers: { "x-apisports-key": API_KEY },
        params,
      });

      const league = res.data?.response?.[0];
      if (league?.seasons?.length) {
        // 🟢 Buscar temporada actual
        const current = league.seasons.find((s) => s.current === true);
        if (current) {
          await SeasonCache.findOneAndUpdate(
            { key: cacheKey },
            { key: cacheKey, season: current.year, lastUpdated: new Date() },
            { upsert: true, new: true },
          );
          return current.year;
        }

        // ⚙️ Fallback: detectar según fechas
        const nowDate = dayjs();
        const seasonByDate = league.seasons.find(
          (s) =>
            nowDate.isAfter(dayjs(s.start)) && nowDate.isBefore(dayjs(s.end)),
        );
        if (seasonByDate) {
          await SeasonCache.findOneAndUpdate(
            { key: cacheKey },
            {
              key: cacheKey,
              season: seasonByDate.year,
              lastUpdated: new Date(),
            },
            { upsert: true, new: true },
          );
          return seasonByDate.year;
        }
      }
    }

    console.warn("⚠️ No current season found, falling back to heuristic.");
  } catch (err) {
    console.warn("⚠️ API error while fetching current season:", err.message);
    await ApiFootballCall.create({
      endpoint: "/players/seasons",
      method: "GET",
      source: "manual",
      user: userId || null,
      apiProvider: "api-football",
      costUnit: 1,

      statusCode: err.response?.status || 500,
      success: false,
      responseTimeMs: Date.now() - start,
      remainingRequests:
        err.response?.headers?.["x-ratelimit-requests-remaining"] || null,
      errorMessage: err.message,
    });
  }

  // 🔁 Fallback: inferir según calendario (Europa / LatAm)
  const year = dayjs().year();
  const month = dayjs().month() + 1;
  const guessedSeason = month >= 7 ? year : year - 1;

  await SeasonCache.findOneAndUpdate(
    { key: cacheKey },
    { key: cacheKey, season: guessedSeason, lastUpdated: new Date() },
    { upsert: true, new: true },
  );

  return guessedSeason;
}

module.exports = { getCurrentSeason };
