const axios = require("axios");
const Fixture = require("../models/fixture");
const ApiFootballCall = require("../models/apifootballCals.js");
const cron = require("node-cron");
require("dotenv").config();

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_URL = process.env.API_URL;

const SOURCE = "cron";

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
      user: null,
      apiProvider: "api-football",
      costUnit: 1,
      statusCode: response.status,
      success: true,
      responseTimeMs: Date.now() - startMs,
      remainingRequests: getRemaining(response.headers),
    });
  } catch (e) {
    // no romper el cron por logging
  }
}

async function logApiError(endpoint, err, startMs) {
  try {
    await ApiFootballCall.create({
      endpoint,
      method: "GET",
      source: SOURCE,
      user: null,
      apiProvider: "api-football",
      costUnit: 1,
      statusCode: err?.response?.status || 500,
      success: false,
      responseTimeMs: Date.now() - startMs,
      remainingRequests: getRemaining(err?.response?.headers),
      errorMessage: err?.message,
    });
  } catch (e) {
    // no romper el cron por logging
  }
}

const downloadFixtures = async () => {
  cron.schedule("0 3 * * *", async () => {// en pro, usar esta
    // cron.schedule("* * * * *", async () => { 

    const today = new Date().toISOString().split("T")[0];
    const start = Date.now();

    try {
      const response = await axios.get(`${API_URL}/fixtures`, {
        headers: { "x-apisports-key": API_KEY },
        params: { date: today },
      });

      await logApiSuccess("/fixtures", response, start);

      const fixtures = response.data?.response || [];

      if (!fixtures.length) {
        console.log("⚠️ No fixtures found for today");
        return;
      }

      const bulkOps = fixtures.map((f) => ({
        updateOne: {
          filter: { fixtureId: f.fixture.id },
          update: {
            $set: {
              fixtureId: f.fixture.id,
              date: f.fixture.date,
              leagueId: f.league.id,
              season: f.league.season,
              lastUpdate: new Date(),
              teams: {
                home: {
                  id: f.teams.home.id,
                  name: f.teams.home.name,
                  logo: f.teams.home.logo,
                  winner: f.teams.home.winner,
                },
                away: {
                  id: f.teams.away.id,
                  name: f.teams.away.name,
                  logo: f.teams.away.logo,
                  winner: f.teams.away.winner,
                },
              },
              league: {
                id: f.league.id,
                name: f.league.name,
                country: f.league.country,
                logo: f.league.logo,
                flag: f.league.flag,
                season: f.league.season,
                round: f.league.round,
              },
              venue: {
                name: f.fixture.venue?.name,
                city: f.fixture.venue?.city,
              },
              referee: f.fixture.referee || "",
              periods: {
                first: f.fixture.periods?.first,
                second: f.fixture.periods?.second,
              },
              status: {
                long: f.fixture.status.long,
                short: f.fixture.status.short,
                elapsed: f.fixture.status.elapsed,
              },
              goals: {
                home: f.goals.home,
                away: f.goals.away,
              },
              score: {
                halftime: {
                  home: f.score.halftime?.home,
                  away: f.score.halftime?.away,
                },
                fulltime: {
                  home: f.score.fulltime?.home,
                  away: f.score.fulltime?.away,
                },
                extratime: {
                  home: f.score.extratime?.home,
                  away: f.score.extratime?.away,
                },
                penalty: {
                  home: f.score.penalty?.home,
                  away: f.score.penalty?.away,
                },
              },
            },
          },
          upsert: true,
        },
      }));

      await Fixture.bulkWrite(bulkOps);
      console.log("✅ Fixtures actualizados correctamente");
    } catch (err) {
      await logApiError("/fixtures", err, start);
      console.error("❌ Error al obtener fixtures:", err.message);
    }
  });
};

module.exports = downloadFixtures;