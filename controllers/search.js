const Player = require("../models/player");
const Search = require("../models/search.js");
const Team = require("../models/team.js");
const League = require("../models/league.js");
const axios = require("axios");
const ApiFootballCall = require("../models/apifootballCals.js");

require("dotenv").config();

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_URL = process.env.API_URL;

const searchGlobal = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 3) {
      return res.status(400).json({
        message: "Query must be at least 3 characters",
      });
    }

    const query = q.toLowerCase().trim();

    /* =========================
       1️⃣ Revisar cache (30 min)
    ========================= */

    const cache = await Search.findOne({ query });

    if (cache) {
      const diffMinutes =
        (Date.now() - cache.createdAt.getTime()) / (1000 * 60);

      if (diffMinutes < 30) {
        return res.json({
          status: "success",
          players: cache.players || [],
          teams: cache.teams || [],
          leagues: cache.leagues || [],
        });
      }
    }

    /* =========================
       2️⃣ Buscar en BBDD
    ========================= */

    const regex = new RegExp(query, "i");

    const localPlayers = await Player.find({
      $or: [{ name: regex }, { firstname: regex }, { lastname: regex }],
    })
      .limit(10)
      .lean();

    const localTeams = await Team.find({ name: regex })
      .select("teamId leagueId name logo country updatedAt")
      .limit(10)
      .lean();

    const localLeagues = await League.find({
      "league.name": regex,
    })
      .limit(10)
      .lean();

    if (localPlayers.length || localTeams.length || localLeagues.length) {
      await Search.findOneAndUpdate(
        { query },
        {
          query,
          players: localPlayers,
          teams: localTeams,
          leagues: localLeagues,
          createdAt: new Date(),
        },
        { upsert: true },
      );

      return res.json({
        status: "success",
        players: localPlayers,
        teams: localTeams,
        leagues: localLeagues,
      });
    }

    /* =========================
       3️⃣ Buscar en API Football
    ========================= */

    let players = [];
    let teams = [];
    let leagues = [];

    /* ---------- PLAYERS ---------- */

    try {
      const start = Date.now();

      const response = await axios.get(`${API_URL}/players`, {
        headers: { "x-apisports-key": API_KEY },
        params: { search: query },
      });

      players = response.data?.response?.slice(0, 10) || [];

      await ApiFootballCall.create({
        endpoint: "/players",
        method: "GET",
        source: "manual",
        user: req.user?.id || null,
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
        endpoint: "/players",
        method: "GET",
        source: "manual",
        user: req.user?.id || null,
        apiProvider: "api-football",
        costUnit: 1,
        statusCode: err.response?.status || 500,
        success: false,
        responseTimeMs: 0,
        remainingRequests:
          err.response?.headers?.["x-ratelimit-requests-remaining"] || null,
        errorMessage: err.message,
      });
    }

    /* ---------- TEAMS ---------- */

    try {
      const start = Date.now();

      const response = await axios.get(`${API_URL}/teams`, {
        headers: { "x-apisports-key": API_KEY },
        params: { search: query },
      });

      teams = response.data?.response?.slice(0, 10) || [];

      await ApiFootballCall.create({
        endpoint: "/teams",
        method: "GET",
        source: "manual",
        user: req.user?.id || null,
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
        endpoint: "/teams",
        method: "GET",
        source: "manual",
        user: req.user?.id || null,
        apiProvider: "api-football",
        costUnit: 1,
        statusCode: err.response?.status || 500,
        success: false,
        responseTimeMs: 0,
        remainingRequests:
          err.response?.headers?.["x-ratelimit-requests-remaining"] || null,
        errorMessage: err.message,
      });
    }

    /* ---------- LEAGUES ---------- */

    try {
      const start = Date.now();

      const response = await axios.get(`${API_URL}/leagues`, {
        headers: { "x-apisports-key": API_KEY },
        params: { search: query },
      });

      leagues = response.data?.response?.slice(0, 10) || [];

      await ApiFootballCall.create({
        endpoint: "/leagues",
        method: "GET",
        source: "manual",
        user: req.user?.id || null,
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
        endpoint: "/leagues",
        method: "GET",
        source: "manual",
        user: req.user?.id || null,
        apiProvider: "api-football",
        costUnit: 1,
        statusCode: err.response?.status || 500,
        success: false,
        responseTimeMs: 0,
        remainingRequests:
          err.response?.headers?.["x-ratelimit-requests-remaining"] || null,
        errorMessage: err.message,
      });
    }

    /* =========================
       4️⃣ Guardar cache
    ========================= */

    await Search.findOneAndUpdate(
      { query },
      {
        query,
        players,
        teams,
        leagues,
        createdAt: new Date(),
      },
      { upsert: true },
    );

    return res.json({
      status: "success",
      players,
      teams,
      leagues,
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "Internal server error. Please, try again",
    });
  }
};

module.exports = {
  searchGlobal,
};
