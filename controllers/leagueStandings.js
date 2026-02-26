const axios = require("axios");
const LeagueStanding = require("../models/leagueStanding");
const LiveMatch = require("../models/LiveMatch");
const Fixture = require("../models/fixture");
const ApiFootballCall = require("../models/apifootballCals.js");
const { getCurrentSeason } = require("../helper/getCurrentSeason.js");
require("dotenv").config();

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_URL = process.env.API_URL;

const LIVE_SHORT = ["1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE"];

const getLeagueStandings = async (req, res) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  let season = parseInt(req.params.season, 10);
  const userId = req.user.id;

  if (isNaN(leagueId) || isNaN(season)) {
    return res.json({ status: "error", message: "Invalid leagueId or season" });
  }

  if (season === 0) {
    season = await getCurrentSeason({ leagueId, userId });
  }

  try {
    let data = await LeagueStanding.findOne({ leagueId, season });
    const now = new Date();

    // --- 1️⃣ Detectar partidos en vivo o del día ---
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

    // --- 2️⃣ Frecuencia dinámica ---
    let maxAgeMinutes = 360; // 6h default
    if (hasLive) maxAgeMinutes = 5;
    else if (hasToday) maxAgeMinutes = 60;

    const lastUpdated = data ? new Date(data.lastUpdate) : null;
    const diffMinutes = lastUpdated
      ? (now - lastUpdated) / (1000 * 60)
      : Infinity;

    const shouldUpdate = !data || diffMinutes >= maxAgeMinutes;

    if (!shouldUpdate && data) {
      return res.json({
        status: "success",
        updated: false,
        standings: data.standings,
        raw: data.raw,
        matches: liveMatches,
      });
    }

    /* ===========================
       🔹 LLAMADO A API-FOOTBALL
    ============================ */

    const start = Date.now();
    let response;

    try {
      response = await axios.get(`${API_URL}/standings`, {
        headers: { "x-apisports-key": API_KEY },
        params: { league: leagueId, season },
      });

      await ApiFootballCall.create({
        endpoint: "/standings",
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
        endpoint: "/standings",
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

      return res.json({
        status: "error",
        message: "Error fetching standings from API",
      });
    }

    const apiData = response.data?.response?.[0];

    if (!apiData || !apiData.league) {
      return res.json({ status: "error", message: "No data found" });
    }

    // --- Guardar en DB ---
    const newEntry = {
      leagueId,
      season,
      league: {
        id: apiData.league.id,
        name: apiData.league.name,
        country: apiData.league.country,
        logo: apiData.league.logo,
        flag: apiData.league.flag,
      },
      standings: apiData.league.standings[0],
      raw: apiData.league,
      lastUpdate: now,
    };

    if (data) {
      await LeagueStanding.updateOne({ _id: data._id }, newEntry);
      data = await LeagueStanding.findById(data._id);
    } else {
      data = await LeagueStanding.create(newEntry);
    }

    return res.json({
      status: "success",
      updated: true,
      standings: data.standings,
      raw: data.raw,
      matches: liveMatches,
    });

  } catch (error) {
    return res.json({
      status: "error",
      message: "An error was found. Please, try again",
    });
  }
};

module.exports = { getLeagueStandings };