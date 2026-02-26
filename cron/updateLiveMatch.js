// cron/updateLiveMatches.js
const axios = require("axios");
const Fixture = require("../models/fixture");
const LiveMatch = require("../models/LiveMatch");
const { isPriorityCompetition } = require("../data/leaguesPriority");
const cron = require("node-cron");
require("dotenv").config();

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_URL = process.env.API_URL;

const MIN_REFRESH_MS = 75 * 1000; // poquito mas de 1 min

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
      // console.log(leagueId)
      if (!isPriorityCompetition(leagueId)) continue;
      const fixtureDate = new Date(fixture.date).getTime();
      if (fixtureDate > now) continue; // aún no empieza

      const liveMatch = await LiveMatch.findOne({
        fixtureId: fixture.fixtureId,
      }).lean();

      // ⛔ ya terminó
      if (liveMatch?.status?.short && ["FT", "AET", "PEN"].includes(liveMatch.status.short)) {
        continue;
      }

      // ⏱️ throttle
      if (
        liveMatch?.lastUpdated &&
        now - new Date(liveMatch.lastUpdated).getTime() < MIN_REFRESH_MS
      ) {
        continue;
      }

      const result = await fetchAndUpsertLiveMatch(
        fixture.fixtureId,
        liveMatch
      );

      if (result.ok) {
        updated++;
        apiCalls += result.apiCalls;
      }
    }

    console.log(
      `✅ Cron ${new Date().toISOString()} | Updated: ${updated} | API calls: ${apiCalls}`
    );
  } catch (error) {
    console.error("❌ runUpdate error:", error.message);
  }
}

// --- HELPERS ---
async function fetchAndUpsertLiveMatch(fixtureId) {
  try {
    const headers = { "x-apisports-key": API_KEY };
    let apiCalls = 0;

    // Siempre traemos info básica del fixture (status, goles, minuto, etc.)
    const { data: fixtureData } = await axios.get(`${API_URL}/fixtures`, {
      headers,
      params: { id: fixtureId },
      timeout: 10000,
    });
    apiCalls++;

    if (!fixtureData.response?.length) return { ok: false, apiCalls };
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
      { upsert: true, new: true }
    );

    // --- Traemos datos dinámicos ---
    const { data: eventsData } = await axios.get(`${API_URL}/fixtures/events`, {
      headers,
      params: { fixture: fixtureId },
    });
    apiCalls++;

    const { data: statsData } = await axios.get(
      `${API_URL}/fixtures/statistics`,
      {
        headers,
        params: { fixture: fixtureId },
      }
    );
    apiCalls++;

    // 🔎 Revisamos si ya tenemos lineups en DB
    const liveMatch = await LiveMatch.findOne({ fixtureId }).lean();
    let lineups = liveMatch?.lineups || [];
    let lineupsChecked = liveMatch?.lineupsChecked || false;

    // Solo consultamos /lineups una vez
    if (!lineupsChecked) {
      try {
        const { data: lineupsData } = await axios.get(
          `${API_URL}/fixtures/lineups`,
          {
            headers,
            params: { fixture: fixtureId },
          }
        );
        lineups = lineupsData.response || [];
        lineupsChecked = true; // marcamos que ya intentamos
        apiCalls++;
      } catch (err) {
        console.error(
          `❌ Error al consultar lineups (${fixtureId}):`,
          err.message
        );
        lineups = []; // fallback
        lineupsChecked = true; // igual marcamos para no repetir
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
          events: eventsData.response || [],
          statistics: statsData.response || [],
          lineups,
           lineupsChecked,
          lastUpdated: new Date(),
        },
      },
      { upsert: true, new: true }
    ).lean();

    return { ok: true, apiCalls };
  } catch (err) {
    console.error(
      `❌ Error consultando API Live (fixture ${fixtureId}):`,
      err.message
    );
    return { ok: false, apiCalls: 0 };
  }
}

// 🚀 Scheduler cada minuto
function startCron() {
  cron.schedule("*/1 * * * *", runUpdate);
}

module.exports = { startCron, runUpdate };
