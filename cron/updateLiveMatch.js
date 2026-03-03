// cron/updateLiveMatches.js
const axios = require("axios");
const Fixture = require("../models/fixture");
const LiveMatch = require("../models/LiveMatch");
const ApiFootballCall = require("../models/apifootballCals.js");
const { isPriorityCompetition } = require("../data/leaguesPriority");
const cron = require("node-cron");
require("dotenv").config();

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_URL = process.env.API_URL;

const MIN_REFRESH_MS = 75 * 1000; // poquito mas de 1 min

const SOURCE = "cron"; // ✅ para logs internos

function getRemaining(headers) {
  return (
    headers?.["x-ratelimit-requests-remaining"] ||
    headers?.["x-requests-remaining"] ||
    null
  );
}

async function logApiSuccess(endpoint, response, startMs) {
  try {
    await ApiFootballCall.create({
      endpoint,
      method: "GET",
      source: SOURCE,
      user: null, // ✅ cron
      apiProvider: "api-football",
      costUnit: 1,
      statusCode: response.status,
      success: true,
      responseTimeMs: Date.now() - startMs,
      remainingRequests: getRemaining(response.headers),
    });
  } catch (e) {
    // no rompas el cron por logging
  }
}

async function logApiError(endpoint, err, startMs) {
  try {
    await ApiFootballCall.create({
      endpoint,
      method: "GET",
      source: SOURCE,
      user: null, // ✅ cron
      apiProvider: "api-football",
      costUnit: 1,
      statusCode: err?.response?.status || 500,
      success: false,
      responseTimeMs: Date.now() - startMs,
      remainingRequests: getRemaining(err?.response?.headers),
      errorMessage: err?.message,
    });
  } catch (e) {
    // no rompas el cron por logging
  }
}

// 🚀 Función principal: actualiza partidos en vivo y finalizados de ligas prioritarias
async function runUpdate() {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // 👉 solo fixtures del día
    const fixturesToday = await Fixture.find({
      date: { $gte: startOfDay, $lte: endOfDay },
    }).lean();

    const now = Date.now();
    let updated = 0;
    let apiCalls = 0;

    for (const fixture of fixturesToday) {
      const leagueId = fixture.leagueId;
      if (!isPriorityCompetition(leagueId)) continue;

      const fixtureDate = new Date(fixture.date).getTime();
      if (fixtureDate > now) continue; // aún no empieza

      const liveMatch = await LiveMatch.findOne({
        fixtureId: fixture.fixtureId,
      }).lean();

      // ⛔ ya terminó
      if (
        liveMatch?.status?.short &&
        ["FT", "AET", "PEN"].includes(liveMatch.status.short)
      ) {
        continue;
      }

      // ⏱️ throttle
      if (
        liveMatch?.lastUpdated &&
        now - new Date(liveMatch.lastUpdated).getTime() < MIN_REFRESH_MS
      ) {
        continue;
      }

      const result = await fetchAndUpsertLiveMatch(fixture.fixtureId);

      if (result.ok) {
        updated++;
        apiCalls += result.apiCalls;
      }
    }

    console.log(
      `✅ Cron ${new Date().toISOString()} | Updated: ${updated} | API calls: ${apiCalls}`,
    );
  } catch (error) {
    console.error("❌ runUpdate error:", error.message);
  }
}

// --- HELPERS ---
async function fetchAndUpsertLiveMatch(fixtureId) {
  const headers = { "x-apisports-key": API_KEY };
  let apiCalls = 0;

  try {
    // 1) /fixtures (base)
    const startFixture = Date.now();
    let fixtureRes;
    try {
      fixtureRes = await axios.get(`${API_URL}/fixtures`, {
        headers,
        params: { id: fixtureId },
        timeout: 10000,
      });
      apiCalls++;
      await logApiSuccess("/fixtures", fixtureRes, startFixture);
    } catch (err) {
      await logApiError("/fixtures", err, startFixture);
      return { ok: false, apiCalls };
    }

    const fixtureData = fixtureRes.data;
    if (!fixtureData?.response?.length) return { ok: false, apiCalls };
    const apiFixture = fixtureData.response[0];

    await Fixture.findOneAndUpdate(
      { fixtureId: apiFixture.fixture.id },
      {
        $set: {
          fixtureId: apiFixture.fixture.id,
          date: apiFixture.fixture.date,
          timestamp: apiFixture.fixture.timestamp,
          referee: apiFixture.fixture.referee,
          league: apiFixture.league,
          teams: apiFixture.teams,
          goals: apiFixture.goals,
          status: apiFixture.fixture.status,
          venue: apiFixture.fixture.venue,
          lastUpdated: new Date(),
        },
      },
      { upsert: true, new: true },
    );

    // 2) /fixtures/events
    const startEvents = Date.now();
    let eventsRes;
    try {
      eventsRes = await axios.get(`${API_URL}/fixtures/events`, {
        headers,
        params: { fixture: fixtureId },
      });
      apiCalls++;
      await logApiSuccess("/fixtures/events", eventsRes, startEvents);
    } catch (err) {
      await logApiError("/fixtures/events", err, startEvents);
      return { ok: false, apiCalls };
    }
    const eventsData = eventsRes.data;

    // 3) /fixtures/statistics
    const startStats = Date.now();
    let statsRes;
    try {
      statsRes = await axios.get(`${API_URL}/fixtures/statistics`, {
        headers,
        params: { fixture: fixtureId },
      });
      apiCalls++;
      await logApiSuccess("/fixtures/statistics", statsRes, startStats);
    } catch (err) {
      await logApiError("/fixtures/statistics", err, startStats);
      return { ok: false, apiCalls };
    }
    const statsData = statsRes.data;

    // 🔎 Revisamos si ya tenemos lineups en DB
    const liveMatch = await LiveMatch.findOne({ fixtureId }).lean();
    let lineups = liveMatch?.lineups || [];
    let lineupsChecked = liveMatch?.lineupsChecked || false;

    // 4) /fixtures/lineups (solo una vez)
    if (!lineupsChecked) {
      const startLineups = Date.now();
      try {
        const lineupsRes = await axios.get(`${API_URL}/fixtures/lineups`, {
          headers,
          params: { fixture: fixtureId },
        });
        apiCalls++;
        await logApiSuccess("/fixtures/lineups", lineupsRes, startLineups);

        lineups = lineupsRes.data?.response || [];
        lineupsChecked = true;
      } catch (err) {
        await logApiError("/fixtures/lineups", err, startLineups);

        console.error(`❌ Error al consultar lineups (${fixtureId}):`, err.message);
        lineups = []; // fallback
        lineupsChecked = true; // no repetir
      }
    }

    // --- Guardamos en LiveMatch ---
    await LiveMatch.findOneAndUpdate(
      { fixtureId: apiFixture.fixture.id },
      {
        $set: {
          fixtureId: apiFixture.fixture.id,
          fixture: apiFixture.fixture,
          league: apiFixture.league,
          teams: apiFixture.teams,
          goals: apiFixture.goals,
          status: apiFixture.fixture.status,
          events: eventsData?.response || [],
          statistics: statsData?.response || [],
          lineups,
          lineupsChecked,
          lastUpdated: new Date(),
        },
      },
      { upsert: true, new: true },
    ).lean();

    return { ok: true, apiCalls };
  } catch (err) {
    // si fue un error no contemplado
    return { ok: false, apiCalls };
  }
}

// 🚀 Scheduler cada minuto
function startCron() {
  cron.schedule("*/1 * * * *", runUpdate);
}

module.exports = { startCron, runUpdate };