const axios = require("axios");
require("dotenv").config();
const TeamLeague = require("../models/teamLeague");
const ApiFootballCall = require("../models/apifootballCals.js");

const API_URL = process.env.API_URL;
const API_KEY = process.env.API_KEY;

const getLeaguesByTeam = async (
  teamId,
  season,
  userId = null,
  source = "system",
) => {
  if (isNaN(teamId) || isNaN(season)) {
    throw new Error("Invalid teamId or season");
  }

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

  // 1️⃣ Buscar en DB
  const existingLeagues = await TeamLeague.find({
    "team.id": teamId,
    season,
  }).sort({ lastUpdate: -1 });

  const now = new Date();
  const lastUpdate = existingLeagues[0]?.lastUpdate || null;
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // 2️⃣ Verificar si necesita actualización (cada 1 día)
  if (existingLeagues.length > 0 && lastUpdate && lastUpdate > oneDayAgo) {
    return existingLeagues;
  }

  // 3️⃣ Consultar API-Football
  const start = Date.now();
  let response;

  try {
    response = await axios.get(`${API_URL}/leagues`, {
      headers: { "x-apisports-key": API_KEY },
      params: { team: teamId, season },
    });

    await logApiSuccess("/leagues", response, start);
  } catch (err) {
    await logApiError("/leagues", err, start);
    return []; // mantengo tu comportamiento
  }

  const leagues = response.data.response || [];
  if (!leagues.length) return [];

  const savedLeagues = [];

  // 4️⃣ Crear o actualizar sin borrar los registros anteriores
  for (const item of leagues) {
    const data = {
      team: { id: teamId },
      league: {
        id: item.league.id,
        name: item.league.name,
        logo: item.league.logo,
        leagueType: item.league.type,
      },
      season,
      lastUpdate: now,
    };

    const updated = await TeamLeague.findOneAndUpdate(
      {
        "team.id": teamId,
        season,
        "league.id": item.league.id,
      },
      { $set: data },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    savedLeagues.push(updated);

    // pequeña espera entre iteraciones para evitar rate limit de DB
    await new Promise((r) => setTimeout(r, 150));
  }

  return savedLeagues;
};

module.exports = {
  getLeaguesByTeam,
};
