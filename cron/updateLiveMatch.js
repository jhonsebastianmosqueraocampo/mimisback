// cron/updateLiveMatches.js
const axios = require("axios");
const Fixture = require("../models/fixture");
const LiveMatch = require("../models/LiveMatch");
const {
  PRIORITY_COUNTRIES,
  PRIORITY_TOURNAMENTS,
} = require("../data/leaguesPriority");
const cron = require("node-cron");
require("dotenv").config();

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_URL = process.env.API_URL;

// 🚀 Función principal: actualiza partidos en vivo y finalizados de ligas prioritarias
async function runUpdate() {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const fixturesToday = await Fixture.find({
      date: { $gte: startOfDay, $lte: endOfDay },
    }).lean();

    const now = new Date();
    let updated = 0;
    let apiCalls = 0;
    console.log(fixturesToday.length)

    for (const fixture of fixturesToday) {
      const fixtureDate = new Date(fixture.date);

      // Filtramos por ligas prioritarias
      const isPriority =
        PRIORITY_COUNTRIES.includes(fixture.league?.country) ||
        PRIORITY_TOURNAMENTS.some((name) =>
          fixture.league?.name.toLowerCase().includes(name.toLowerCase())
        );
      if (!isPriority) continue;

      // --- 1. Próximos ---
      if (fixtureDate > now) continue;
      // --- 2. Ya empezó ---
      const liveMatch = await LiveMatch.findOne({
        fixtureId: fixture.fixtureId,
      });

      if (!liveMatch) {
        // Insert inicial
        const result = await fetchAndUpsertLiveMatch(fixture.fixtureId);
        if (result.ok) {
          updated++;
          apiCalls += result.apiCalls;
        }
      } else {
        const statusShort = liveMatch.status?.short;

        if (["FT", "AET", "PEN"].includes(statusShort)) {
          continue; // Finalizado, no hacemos nada
        }

        // Sigue en vivo → refrescamos
        const result = await fetchAndUpsertLiveMatch(fixture.fixtureId);
        if (result.ok) {
          updated++;
          apiCalls += result.apiCalls;
        }
      }
    }

    console.log(
      `✅ Cron ejecutado ${new Date().toISOString()} | Partidos actualizados: ${updated} | Requests enviados: ${apiCalls}`
    );
  } catch (error) {
    console.error("❌ Error en runUpdate:", error.message);
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
