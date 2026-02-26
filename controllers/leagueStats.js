const axios = require("axios");
const LeagueStats = require("../models/leagueStats.js")
const ApiFootballCall = require("../models/apifootballCals.js");
const { getCurrentSeason } = require("../helper/getCurrentSeason.js");
require("dotenv").config();

const API_URL = process.env.API_URL;
const API_KEY = process.env.API_FOOTBALL_KEY;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function nz(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function axiosGetWithRetry(
  url,
  config = {},
  retries = 4,
  userId = null,
  source = "system"
) {
  for (let i = 0; i <= retries; i++) {
    const start = Date.now();

    try {
      const response = await axios.get(url, {
        timeout: 20000,
        ...config,
      });

      // 🔹 Registrar éxito
      await ApiFootballCall.create({
        endpoint: new URL(url).pathname,
        method: "GET",
        source,
        user: userId || null,
        apiProvider: "api-football",
        costUnit: 1,
        statusCode: response.status,
        success: true,
        retryAttempt: i,
        responseTimeMs: Date.now() - start,
        remainingRequests:
          response.headers?.["x-ratelimit-requests-remaining"] || null,
      });

      return response;
    } catch (err) {
      const status = err?.response?.status;
      const retryAfter = Number(
        err?.response?.headers?.["retry-after"] || 0
      );

      // 🔹 Registrar error del intento
      await ApiFootballCall.create({
        endpoint: new URL(url).pathname,
        method: "GET",
        source,
        user: userId || null,
        apiProvider: "api-football",
        costUnit: 1,
        statusCode: status || 500,
        success: false,
        retryAttempt: i,
        responseTimeMs: Date.now() - start,
        remainingRequests:
          err?.response?.headers?.["x-ratelimit-requests-remaining"] || null,
        errorMessage: err.message,
      });

      if (i === retries) throw err;

      const waitMs =
        status === 429
          ? Math.max(retryAfter * 1000, 1500 * (i + 1))
          : 800 * (i + 1);

      console.warn(
        `⚠️ API-Football retry ${i + 1}/${retries} status=${status} wait=${waitMs}ms`
      );

      await sleep(waitMs);
    }
  }
}

function mapTopItem(item, type) {
  const p = item.player || {};
  const st = item.statistics?.[0] || {};
  const team = st.team || {};

  const base = {
    playerId: p.id,
    name: p.name || "",
    photo: p.photo || null,
    teamId: team.id ?? null,
    teamName: team.name ?? "",

    // defaults para tu schema
    goals: 0,
    assists: 0,
    yellow: 0,
    red: 0,
    rating: 0,
    shotsTotal: 0,
    shotsOn: 0,
    keyPasses: 0,
    passesTotal: 0,
    dribblesSuccess: 0,
    dribblesAttempts: 0,
    tackles: 0,
    interceptions: 0,
    foulsDrawn: 0,
    foulsCommitted: 0,
    minutes: 0,
  };

  if (type === "scorers") base.goals = nz(st?.goals?.total);
  if (type === "assists") base.assists = nz(st?.goals?.assists);
  if (type === "yellow") base.yellow = nz(st?.cards?.yellow);
  if (type === "red") base.red = nz(st?.cards?.red);

  return base;
}

const listLeagueStats = async (req, res) => {
  try {
    const leagueId = parseInt(req.params.leagueId);
    let season = parseInt(req.params.season);
    const userId = req.user.id;
    if (isNaN(leagueId)) {
      return res
        .status(400)
        .json({ status: "error", message: "Invalid leagueId" });
    }
    if (isNaN(season)) {
      return res
        .status(400)
        .json({ status: "error", message: "Invalid season" });
    }

    if (season === 0) {
      season = await getCurrentSeason({ leagueId: leagueId, userId });
    }

    const now = new Date();
    const TTL_MINUTES = 6 * 60; // 6h (ajústalo)

    // ✅ cache
    let doc = await LeagueStats.findOne({ leagueId, season }).lean();
    if (doc?.lastUpdated) {
      const diffMinutes = (now - new Date(doc.lastUpdated)) / (1000 * 60);
      if (diffMinutes < TTL_MINUTES) {
        return res.json({ status: "success", stats: doc, cached: true });
      }
    }

    // ✅ fetch oficiales (rápidos)
    const endpoints = [
      { key: "topScorers", url: "players/topscorers", type: "scorers" },
      { key: "topAssists", url: "players/topassists", type: "assists" },
      { key: "topYellowCards", url: "players/topyellowcards", type: "yellow" },
      { key: "topRedCards", url: "players/topredcards", type: "red" },
    ];

    const result = {
      leagueId,
      season,
      topScorers: [],
      topAssists: [],
      topYellowCards: [],
      topRedCards: [],
      lastUpdated: now,
    };

    for (const ep of endpoints) {
      const { data } = await axiosGetWithRetry(`${API_URL}/${ep.url}`, {headers: { "x-apisports-key": API_KEY },params: { league: leagueId, season },}, userId);

      result[ep.key] = (data?.response || [])
        .slice(0, 10)
        .map((item) => mapTopItem(item, ep.type));

      await sleep(250);
    }

    doc = await LeagueStats.findOneAndUpdate(
      { leagueId, season },
      { $set: result },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();

    return res.json({ status: "success", stats: doc, cached: false });
  } catch (error) {
    return res.json({ status: "error", message: "Server error" });
  }
};

module.exports = {
  listLeagueStats,
};
