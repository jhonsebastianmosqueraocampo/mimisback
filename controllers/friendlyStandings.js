const axios = require("axios");
const FriendlyStanding = require("../models/FriendlyStanding");
const ApiFootballCall = require("../models/apifootballCals.js");
const { getCurrentSeason } = require("../helper/getCurrentSeason.js");
require("dotenv").config();

const API_URL = process.env.API_URL;
const API_KEY = process.env.API_FOOTBALL_KEY;

const FINISHED_SHORT = ["FT", "AET", "PEN", "AWD", "WO"];
const LIVE_SHORT = ["1H", "HT", "2H", "ET", "BT", "P", "LIVE"];
const POSTPONED_SHORT = ["PST", "SUSP", "INT"];

const getFriendlyStandings = async (req, res) => {
  const teamId = parseInt(req.params.teamId, 10);
  let season = parseInt(req.params.season, 10);
  const userId = req.user.id;

  if (!teamId || isNaN(teamId)) {
    return res.status(400).json({ status: "error", message: "Invalid teamId" });
  }

  if (!season || isNaN(season)) {
    return res.status(400).json({ status: "error", message: "Invalid season" });
  }

  if (season === 0) {
    season = await getCurrentSeason({ teamId, userId });
  }

  try {
    // 1️⃣ Buscar en BD
    const existingFixtures = await FriendlyStanding.find({
      $or: [{ "teams.home.id": teamId }, { "teams.away.id": teamId }],
      "league.season": season,
      "league.name": { $regex: /friendlies/i },
    }).sort({ date: 1 });

    const now = dayjs();
    const lastUpdate = existingFixtures[0]?.lastUpdate
      ? dayjs(existingFixtures[0].lastUpdate)
      : null;

    const hasLive = existingFixtures.some((f) =>
      LIVE_SHORT.includes(f.status?.short)
    );

    const hasToday = existingFixtures.some((f) =>
      dayjs(f.date).isSame(now, "day")
    );

    let maxAgeHours = 12;
    if (hasLive) maxAgeHours = 0.1;
    else if (hasToday) maxAgeHours = 2;
    else maxAgeHours = 12;

    const shouldUpdate =
      !existingFixtures.length ||
      !lastUpdate ||
      now.diff(lastUpdate, "hour") >= maxAgeHours;

    if (!shouldUpdate && existingFixtures.length > 0) {
      return res.json({
        status: "success",
        updated: false,
        standings: existingFixtures,
      });
    }

    /* ===========================
       🔹 LLAMADO A API-FOOTBALL
    ============================ */

    const start = Date.now();
    let response;

    try {
      response = await axios.get(`${API_URL}/fixtures`, {
        headers: { "x-apisports-key": API_KEY },
        params: {
          team: teamId,
          season,
        },
      });

      await ApiFootballCall.create({
        endpoint: "/fixtures",
        method: "GET",
        source: "manual",
        user: userId || null,
        apiProvider: "api-football",
        costUnit: 1,
        statusCode: response.status,
        success: true,
        responseTimeMs: Date.now() - start,
        remainingRequests:
          response.headers?.["x-ratelimit-requests-remaining"] || null,
      });

    } catch (err) {
      await ApiFootballCall.create({
        endpoint: "/fixtures",
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

      return res.status(500).json({
        status: "error",
        message: "Error al consultar amistosos en API",
      });
    }

    const fixtures = response.data?.response || [];

    // 6️⃣ Filtrar amistosos
    const friendlyFixtures = fixtures.filter((fixture) =>
      fixture.league.name.toLowerCase().includes("friendlies")
    );

    // 7️⃣ Guardar/actualizar en DB
    for (const fixture of friendlyFixtures) {
      const { fixture: f, league, teams, goals, score } = fixture;

      await FriendlyStanding.findOneAndUpdate(
        { fixtureId: f.id },
        {
          fixtureId: f.id,
          referee: f.referee,
          timezone: f.timezone,
          date: f.date,
          timestamp: f.timestamp,
          periods: f.periods,
          venue: {
            id: f.venue?.id,
            name: f.venue?.name,
            city: f.venue?.city,
          },
          status: {
            long: f.status?.long,
            short: f.status?.short,
            elapsed: f.status?.elapsed,
            extra: f.status?.extra ?? null,
          },
          league: {
            id: league.id,
            name: league.name,
            country: league.country,
            logo: league.logo,
            flag: league.flag,
            season: league.season,
            round: league.round,
          },
          teams,
          goals,
          score: {
            halftime: score.halftime || {},
            fulltime: score.fulltime || {},
            extratime: score.extratime || {},
            penalty: score.penalty || {},
          },
          lastUpdate: new Date(),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      await new Promise((r) => setTimeout(r, 250));
    }

    const updatedFixtures = await FriendlyStanding.find({
      $or: [{ "teams.home.id": teamId }, { "teams.away.id": teamId }],
      "league.season": season,
      "league.name": { $regex: /friendlies/i },
    }).sort({ date: 1 });

    res.json({
      status: "success",
      updated: true,
      standings: updatedFixtures,
    });

  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Error al obtener amistosos. Intenta nuevamente.",
    });
  }
};

module.exports = { getFriendlyStandings };
