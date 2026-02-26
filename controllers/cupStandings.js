const axios = require("axios");
const GroupStanding = require("../models/groupStanding");
const CupStanding = require("../models/cupStanding");
const LiveMatch = require("../models/LiveMatch");
const ApiFootballCall = require("../models/apifootballCals.js");
const { getCurrentSeason } = require("../helper/getCurrentSeason");
require("dotenv").config();

const API_URL = process.env.API_URL;
const API_KEY = process.env.API_FOOTBALL_KEY;

// 🕒 Intervalo dinámico
const getRefreshInterval = (hasLiveMatches) => {
  return hasLiveMatches ? 5 * 60 * 1000 : 2 * 60 * 60 * 1000; // 5 min o 2h
};

const getCupStandings = async (req, res) => {
  try {
    const leagueId = parseInt(req.params.leagueId, 10);
    let season = parseInt(req.params.season, 10);
    const userId = req.user.id;

    if (season === 0) {
      season = await getCurrentSeason({ leagueId, userId });
    }

    if (!leagueId || !season || isNaN(leagueId) || isNaN(season)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid leagueId or season",
      });
    }

    const now = new Date();
    const currentSeason = season;

    const hasLiveMatches =
      season === currentSeason &&
      (await LiveMatch.exists({
        "league.id": leagueId,
        "league.season": season,
        "status.short": { $in: ["1H","HT","2H","ET","BT","P","LIVE","INT"] },
      }));

    const REFRESH_INTERVAL = getRefreshInterval(!!hasLiveMatches);

    const latestGroup = await GroupStanding.findOne({ leagueId, season }).sort({ lastUpdate: -1 });
    const latestFixture = await CupStanding.findOne({ leagueId, season }).sort({ lastUpdate: -1 });

    const groupRecent = latestGroup && now - latestGroup.lastUpdate < REFRESH_INTERVAL;
    const fixtureRecent = latestFixture && now - latestFixture.lastUpdate < REFRESH_INTERVAL;

    // ⚡ Si temporada actual y datos recientes → no llamar API
    if (season === currentSeason && groupRecent && fixtureRecent) {
      const groupPhase = await GroupStanding.find({ leagueId, season });
      const knockoutPhase = await CupStanding.find({ leagueId, season });
      const liveMatches = await LiveMatch.find({
        "league.id": leagueId,
        "league.season": season,
        "status.short": { $in: ["1H","HT","2H","ET","BT","P","LIVE","INT"] },
      });

      return res.json({
        status: "success",
        hasGroupPhase: groupPhase.length > 0,
        groupPhase,
        knockoutPhase,
        liveMatches,
      });
    }

    /* ===========================
       🔹 1️⃣ /standings
    ============================ */

    const startStandings = Date.now();
    let standingsRes;

    try {
      standingsRes = await axios.get(`${API_URL}/standings`, {
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
        statusCode: standingsRes.status,
        success: true,
        responseTimeMs: Date.now() - startStandings,
        remainingRequests:
          standingsRes.headers?.["x-ratelimit-requests-remaining"] || null,
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
        responseTimeMs: Date.now() - startStandings,
        remainingRequests:
          err.response?.headers?.["x-ratelimit-requests-remaining"] || null,
        errorMessage: err.message,
      });

      return res.status(500).json({
        status: "error",
        message: "Error fetching standings",
      });
    }

    const standingsData = standingsRes.data.response;
    let groupPhase = [];

    if (standingsData.length > 0 && Array.isArray(standingsData[0].league.standings)) {
      const allGroups = standingsData[0].league.standings.flat();
      groupPhase = allGroups;

      for (const team of allGroups) {
        await GroupStanding.updateOne(
          { leagueId, season, group: team.group, "team.id": team.team.id },
          {
            leagueId,
            season,
            group: team.group,
            team: {
              id: team.team.id,
              name: team.team.name,
              logo: team.team.logo,
            },
            rank: team.rank,
            points: team.points,
            all: team.all,
            lastUpdate: now,
          },
          { upsert: true }
        );
      }
    }

    /* ===========================
       🔹 2️⃣ /fixtures
    ============================ */

    const startFixtures = Date.now();
    let fixturesRes;

    try {
      fixturesRes = await axios.get(`${API_URL}/fixtures`, {
        headers: { "x-apisports-key": API_KEY },
        params: { league: leagueId, season },
      });

      await ApiFootballCall.create({
        endpoint: "/fixtures",
        method: "GET",
        source: "manual",
        user: userId || null,
        apiProvider: "api-football",
        costUnit: 1,
        statusCode: fixturesRes.status,
        success: true,
        responseTimeMs: Date.now() - startFixtures,
        remainingRequests:
          fixturesRes.headers?.["x-ratelimit-requests-remaining"] || null,
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
        responseTimeMs: Date.now() - startFixtures,
        remainingRequests:
          err.response?.headers?.["x-ratelimit-requests-remaining"] || null,
        errorMessage: err.message,
      });

      return res.status(500).json({
        status: "error",
        message: "Error fetching fixtures",
      });
    }

    const fixtures = fixturesRes.data.response;

    for (const fixture of fixtures) {
      await CupStanding.updateOne(
        {
          leagueId,
          season,
          round: fixture.league.round,
          "homeTeam.id": fixture.teams.home.id,
          "awayTeam.id": fixture.teams.away.id,
        },
        {
          leagueId,
          season,
          round: fixture.league.round,
          date: fixture.fixture.date,
          homeTeam: {
            id: fixture.teams.home.id,
            name: fixture.teams.home.name,
            logo: fixture.teams.home.logo,
          },
          awayTeam: {
            id: fixture.teams.away.id,
            name: fixture.teams.away.name,
            logo: fixture.teams.away.logo,
          },
          goals: fixture.goals,
          score: fixture.score,
          status: fixture.fixture.status.short,
          lastUpdate: now,
        },
        { upsert: true }
      );
    }

    const knockoutPhase = await CupStanding.find({ leagueId, season });
    const groupPhaseFinal = groupPhase.length > 0
      ? await GroupStanding.find({ leagueId, season })
      : [];

    return res.json({
      status: "success",
      hasGroupPhase: groupPhaseFinal.length > 0,
      groupPhase: groupPhaseFinal,
      knockoutPhase,
      liveMatches: [],
    });

  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "An error occurred while fetching cup standings",
    });
  }
};

module.exports = { getCupStandings };