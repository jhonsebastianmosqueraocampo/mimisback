const axios = require("axios");
const Fixture = require("../models/fixture");
const Squad = require("../models/squad.js");
const PreMatchStats = require("../models/PreMatchStats");
const Lineup = require("../models/Lineup.js");
const LiveMatch = require("../models/LiveMatch.js");
const UserRating = require("../models/userRating.js");
const ApiFootballCall = require("../models/apifootballCals.js");
const { isPriorityCompetition } = require("../data/leaguesPriority");
require("dotenv").config();
const dayjs = require("dayjs");
const { getCurrentSeason } = require("../helper/getCurrentSeason.js");

const POSTPONED_SHORT = ["PST", "SUSP", "INT"];

const LIVE_SHORT = new Set(["1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE"]);

const FINISHED_SHORT = new Set(["FT", "AET", "PEN"]);

const CANCELLED_SHORT = new Set(["CANC", "PST", "ABD"]);
const NOT_STARTED_SHORT = new Set(["NS", "TBD"]);

const RATINGS_LIVE_REFRESH_MIN = 5;

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_URL = process.env.API_URL;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const MINUTE = 60 * 1000;
const REFRESH_PAST_NOT_FINISHED_MS = 10 * MINUTE; // si ya pasó la hora y no está FT
const REFRESH_FINISHED_MS = 24 * 60 * MINUTE; // si está FT, casi nunca refrescar

function shouldRefreshFixture(fixtureDoc) {
  if (!fixtureDoc?.date) return true;

  const now = Date.now();
  const kickoff = new Date(fixtureDoc.date).getTime();
  const short = fixtureDoc.status?.short ?? "NS";
  const last = fixtureDoc.lastUpdate
    ? new Date(fixtureDoc.lastUpdate).getTime()
    : 0;

  const isFinished = FINISHED_SHORT.has(short);

  // partido en el futuro: no gastes llamadas (a menos que no tengas doc bien)
  if (kickoff > now) return false;

  // partido en el pasado y ya finalizado: refresca muy de vez en cuando
  if (isFinished) {
    return now - last > REFRESH_FINISHED_MS;
  }

  // partido en el pasado pero NO está finalizado en BD => probablemente desactualizado
  return now - last > REFRESH_PAST_NOT_FINISHED_MS;
}

function mapApiFixtureToDb(f) {
  return {
    fixtureId: f.fixture.id,
    date: f.fixture.date,
    leagueId: f.league.id,
    season: f.league.season,
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
      name: f.fixture?.venue?.name ?? "",
      city: f.fixture?.venue?.city ?? "",
    },
    referee: f.fixture.referee || "",
    periods: {
      first: f.fixture?.periods?.first ?? null,
      second: f.fixture?.periods?.second ?? null,
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
        home: f.score?.halftime?.home ?? null,
        away: f.score?.halftime?.away ?? null,
      },
      fulltime: {
        home: f.score?.fulltime?.home ?? null,
        away: f.score?.fulltime?.away ?? null,
      },
      extratime: {
        home: f.score?.extratime?.home ?? null,
        away: f.score?.extratime?.away ?? null,
      },
      penalty: {
        home: f.score?.penalty?.home ?? null,
        away: f.score?.penalty?.away ?? null,
      },
    },
  };
}

async function updateLiveMatchCompleted(fixtureId, userId) {
  const existing = await LiveMatch.findOne({ fixtureId }).lean();
  if (existing?.finalizedAt) return existing;

  const headers = { "x-apisports-key": API_KEY };

  // Helper inline para no repetir mucho (sigue siendo "sobre cada llamado")
  const logSuccess = async (endpoint, res, start) => {
    await ApiFootballCall.create({
      endpoint,
      method: "GET",
      source: "system",
      user: userId || null,
      apiProvider: "api-football",
      costUnit: 1,
      statusCode: res.status,
      success: true,
      responseTimeMs: Date.now() - start,
      remainingRequests:
        res.headers?.["x-ratelimit-requests-remaining"] || null,
    });
  };

  const logError = async (endpoint, err, start) => {
    await ApiFootballCall.create({
      endpoint,
      method: "GET",
      source: "system",
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
  };

  // 1) Traer fixture base
  let fixtureRes;
  const startFixture = Date.now();
  try {
    fixtureRes = await axios.get(`${API_URL}/fixtures`, {
      headers,
      params: { id: fixtureId },
    });
    await logSuccess("/fixtures", fixtureRes, startFixture);
  } catch (err) {
    await logError("/fixtures", err, startFixture);
    return { ok: false, reason: "api-error-fixture" };
  }

  const fixtureData = fixtureRes.data;

  if (!fixtureData?.response?.length)
    return { ok: false, reason: "no-fixture" };

  const apiFixture = fixtureData.response[0];
  const short = apiFixture?.fixture?.status?.short ?? "NS";

  if (!FINISHED_SHORT.has(short)) return { ok: false, reason: "not-finished" };

  // 2) Events
  let eventsRes;
  const startEvents = Date.now();
  try {
    eventsRes = await axios.get(`${API_URL}/fixtures/events`, {
      headers,
      params: { fixture: fixtureId },
      timeout: 10000,
    });
    await logSuccess("/fixtures/events", eventsRes, startEvents);
  } catch (err) {
    await logError("/fixtures/events", err, startEvents);
    // Aquí decides: puedes continuar con events vacío o abortar.
    return { ok: false, reason: "api-error-events" };
  }
  const eventsData = eventsRes.data;

  // 2) Statistics
  let statsRes;
  const startStats = Date.now();
  try {
    statsRes = await axios.get(`${API_URL}/fixtures/statistics`, {
      headers,
      params: { fixture: fixtureId },
      timeout: 10000,
    });
    await logSuccess("/fixtures/statistics", statsRes, startStats);
  } catch (err) {
    await logError("/fixtures/statistics", err, startStats);
    return { ok: false, reason: "api-error-stats" };
  }
  const statsData = statsRes.data;

  // 3) Lineups (solo 1 vez)
  const liveMatch = await LiveMatch.findOne({ fixtureId }).lean();
  let lineups = liveMatch?.lineups || [];
  let lineupsChecked = liveMatch?.lineupsChecked || false;

  if (!lineupsChecked) {
    let lineupsRes;
    const startLineups = Date.now();

    try {
      lineupsRes = await axios.get(`${API_URL}/fixtures/lineups`, {
        headers,
        params: { fixture: fixtureId },
        timeout: 10000,
      });

      await logSuccess("/fixtures/lineups", lineupsRes, startLineups);

      lineups = lineupsRes.data?.response || [];
      lineupsChecked = true;
    } catch (err) {
      await logError("/fixtures/lineups", err, startLineups);

      console.error(`❌ Error lineups (${fixtureId}):`, err.message);
      lineups = [];
      lineupsChecked = true; // no repetir
    }
  }

  // 4) Guardar LiveMatch + marcar finalizedAt
  const livematchFixture = await LiveMatch.findOneAndUpdate(
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
        finalizedAt: new Date(),
      },
    },
    { upsert: true, new: true },
  ).lean();

  return livematchFixture;
}

async function getSquadPhotoMap(teamId, userId) {
  const teamIdNum = Number(teamId);
  if (!teamIdNum) return {};

  const cached = await Squad.findOne({ teamId: teamIdNum });
  const now = dayjs();

  if (cached?.lastUpdated && now.diff(dayjs(cached.lastUpdated), "hour") < 24) {
    return cached.photoMap || {};
  }

  const startSquad = Date.now();
  let squadRes;

  try {
    squadRes = await axios.get(`${API_URL}/players/squads`, {
      headers: { "x-apisports-key": API_KEY },
      params: { team: teamIdNum },
    });

    await ApiFootballCall.create({
      endpoint: "/players/squads",
      method: "GET",
      source: "system",
      user: userId || null,
      apiProvider: "api-football",
      costUnit: 1,
      statusCode: squadRes.status,
      success: true,
      responseTimeMs: Date.now() - startSquad,
      remainingRequests:
        squadRes.headers?.["x-ratelimit-requests-remaining"] || null,
    });

    const players = squadRes.data?.response?.[0]?.players || [];
    const photoMap = players.reduce((acc, p) => {
      acc[p.id] = p.photo || "";
      return acc;
    }, {});

    await TeamSquadCache.updateOne(
      { teamId: teamIdNum },
      { teamId: teamIdNum, photoMap, lastUpdated: new Date() },
      { upsert: true },
    );

    return photoMap;
  } catch (err) {
    await ApiFootballCall.create({
      endpoint: "/players/squads",
      method: "GET",
      source: "system",
      user: userId || null,
      apiProvider: "api-football",
      costUnit: 1,
      statusCode: err.response?.status || 500,
      success: false,
      responseTimeMs: Date.now() - startSquad,
      remainingRequests:
        err.response?.headers?.["x-ratelimit-requests-remaining"] || null,
      errorMessage: err.message,
    });

    return {};
  }
}

function hasFinalLineup(doc) {
  return (
    !!doc?.hasLineup ||
    (doc?.lineups?.length > 0 &&
      doc.lineups.some((t) => (t.startXI?.length || 0) > 0))
  );
}

async function fetchFixtureStatusShort(fixtureId, userId) {
  const startFixture = Date.now();
  let r;

  try {
    r = await axios.get(`${API_URL}/fixtures`, {
      headers: { "x-apisports-key": API_KEY },
      params: { id: fixtureId },
    });

    await ApiFootballCall.create({
      endpoint: "/fixtures",
      method: "GET",
      source: "system",
      user: userId || null,
      apiProvider: "api-football",
      costUnit: 1,
      statusCode: r.status,
      success: true,
      responseTimeMs: Date.now() - startFixture,
      remainingRequests: r.headers?.["x-ratelimit-requests-remaining"] || null,
    });
  } catch (err) {
    await ApiFootballCall.create({
      endpoint: "/fixtures",
      method: "GET",
      source: "system",
      user: userId || null,
      apiProvider: "api-football",
      costUnit: 1,
      statusCode: err.response?.status || 500,
      success: false,
      responseTimeMs: Date.now() - startFixture,
      remainingRequests:
        err.response?.headers?.["x-ratelimit-requests-remaining"] || null,
      errorMessage: err.message,
    });

    return null;
  }

  const fixture = r.data?.response?.[0];
  if (!fixture) return null;

  return fixture.fixture?.status?.short || null;
}

function normalizeTeamLineup(apiTeamLineup, photoMap) {
  return {
    team: {
      id: apiTeamLineup.team.id,
      name: apiTeamLineup.team.name,
      logo: apiTeamLineup.team.logo,
      coach: {
        id: apiTeamLineup.coach?.id,
        name: apiTeamLineup.coach?.name,
        photo: apiTeamLineup.coach?.photo || "",
      },
      formation: apiTeamLineup.formation || "",
    },
    startXI: (apiTeamLineup.startXI || []).map((p) => ({
      id: p.player.id,
      name: p.player.name,
      number: p.player.number,
      pos: p.player.pos,
      grid: p.player.grid || "",
      photo: p.player.photo || photoMap[p.player.id] || "",
    })),
    substitutes: (apiTeamLineup.substitutes || []).map((p) => ({
      id: p.player.id,
      name: p.player.name,
      number: p.player.number,
      pos: p.player.pos,
      grid: p.player.grid || "",
      photo: p.player.photo || photoMap[p.player.id] || "",
    })),
  };
}

async function fetchRatingsMap(fixtureId, userId) {
  const startRatings = Date.now();
  let r;

  try {
    r = await axios.get(`${API_URL}/fixtures/players`, {
      headers: { "x-apisports-key": API_KEY },
      params: { fixture: fixtureId },
    });

    await ApiFootballCall.create({
      endpoint: "/fixtures/players",
      method: "GET",
      source: "system",
      user: userId || null,
      apiProvider: "api-football",
      costUnit: 1,
      statusCode: r.status,
      success: true,
      responseTimeMs: Date.now() - startRatings,
      remainingRequests: r.headers?.["x-ratelimit-requests-remaining"] || null,
    });
  } catch (err) {
    await ApiFootballCall.create({
      endpoint: "/fixtures/players",
      method: "GET",
      source: "system",
      user: userId || null,
      apiProvider: "api-football",
      costUnit: 1,
      statusCode: err.response?.status || 500,
      success: false,
      responseTimeMs: Date.now() - startRatings,
      remainingRequests:
        err.response?.headers?.["x-ratelimit-requests-remaining"] || null,
      errorMessage: err.message,
    });

    return {}; // no romper flujo
  }

  const byTeam = r.data?.response || [];
  const map = {};

  for (const t of byTeam) {
    for (const p of t.players || []) {
      const s = p.statistics?.[0];
      const ratingRaw = s?.games?.rating ?? null;
      const minutes = s?.games?.minutes ?? null;

      const rating =
        ratingRaw === null || ratingRaw === undefined || ratingRaw === ""
          ? null
          : Number(ratingRaw);

      map[p.player.id] = { rating, minutes };
    }
  }

  return map;
}

function applyRatings(lineups, ratingsMap) {
  const applyOne = (pl) => {
    const key = String(pl.id);
    return {
      ...pl,
      rating:
        ratingsMap[key]?.rating !== undefined
          ? ratingsMap[key].rating
          : (pl.rating ?? null),
      minutes:
        ratingsMap[key]?.minutes !== undefined
          ? ratingsMap[key].minutes
          : (pl.minutes ?? null),
    };
  };

  return (lineups || []).map((t) => ({
    ...t,
    startXI: (t.startXI || []).map(applyOne),
    substitutes: (t.substitutes || []).map(applyOne),
  }));
}

const getNextFixture = async (req, res) => {
  const { teamId } = req.params;
  if (isNaN(Number(teamId))) {
    return res.json({
      status: "error",
      message: "Invalid teamId",
    });
  }

  try {
    const now = new Date();
    const userId = req.user.id;
    // Buscar en BD el próximo fixture futuro
    const existingFixture = await Fixture.findOne({
      $or: [
        { "teams.home.id": Number(teamId) },
        { "teams.away.id": Number(teamId) },
      ],
      date: { $gte: now },
    })
      .sort({ date: 1 })
      .lean();

    if (existingFixture) {
      return res.json({
        status: "success",
        from: "db",
        fixture: existingFixture,
      });
    }

    //Si no está en BD, consultar API-Football
    const startNext = Date.now();
    let response;

    try {
      response = await axios.get(`${API_URL}/fixtures`, {
        params: {
          team: Number(teamId),
          next: 1,
        },
        headers: {
          "x-apisports-key": API_KEY,
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
        responseTimeMs: Date.now() - startNext,
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
        responseTimeMs: Date.now() - startNext,
        remainingRequests:
          err.response?.headers?.["x-ratelimit-requests-remaining"] || null,
        errorMessage: err.message,
      });

      return res.json({
        status: "error",
        message: "Error al consultar API-Football para el próximo partido",
      });
    }

    const fixture = response.data?.response?.[0];
    if (!fixture) {
      return res.json({
        status: "error",
        message: "No se encontró un próximo partido para este equipo",
      });
    }

    // Validar que sea una fecha futura (la API a veces devuelve partido actual)
    const fixtureDate = new Date(fixture.fixture.date);
    if (fixtureDate < now) {
      return res.json({
        status: "error",
        message: "No hay partidos futuros disponibles",
      });
    }

    // Guardar o actualizar si ya existe
    const existing = await Fixture.findOne({ fixtureId: fixture.fixture.id });

    const newData = {
      fixtureId: fixture.fixture.id,
      date: fixture.fixture.date,
      leagueId: fixture.league.id,
      season: fixture.league.season,
      referee: fixture.fixture.referee,
      venue: {
        name: fixture.fixture.venue?.name || "",
        city: fixture.fixture.venue?.city || "",
      },
      league: {
        id: fixture.league.id,
        name: fixture.league.name,
        country: fixture.league.country,
        logo: fixture.league.logo,
        flag: fixture.league.flag || "",
        season: fixture.league.season,
        round: fixture.league.round,
      },
      teams: {
        home: {
          id: fixture.teams.home.id,
          name: fixture.teams.home.name,
          logo: fixture.teams.home.logo,
          winner: fixture.teams.home.winner,
        },
        away: {
          id: fixture.teams.away.id,
          name: fixture.teams.away.name,
          logo: fixture.teams.away.logo,
          winner: fixture.teams.away.winner,
        },
      },
      goals: fixture.goals,
      score: fixture.score,
      status: fixture.fixture.status,
      lastUpdate: new Date(),
    };

    if (!existing) {
      await Fixture.create(newData);
    } else {
      await Fixture.updateOne(
        { fixtureId: fixture.fixture.id },
        { $set: newData },
      );
    }

    // Devolver fixture obtenido
    return res.json({
      status: "success",
      from: "api",
      fixture: newData,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "Error al obtener el siguiente partido",
    });
  }
};

const getPreviousFixturesByTeam = async (req, res) => {
  const teamId = Number(req.params.teamId);
  let season = Number(req.params.season);

  const LIVE_SHORT = ["1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE"];

  const FINISHED_SHORT = ["FT", "AET", "PEN"];

  const CANCELLED_SHORT = ["CANC", "PST", "ABD"];

  const userId = req.user.id;

  if (season === 0) {
    season = await getCurrentSeason({ teamId, userId });
  }

  if (isNaN(teamId) || isNaN(season)) {
    return res.json({ status: "error", message: "Invalid teamId or season" });
  }

  try {
    //Último terminado en BD (para decidir refresco)
    const lastStored = await Fixture.findOne({
      $or: [{ "teams.home.id": teamId }, { "teams.away.id": teamId }],
      "league.season": season,
      "status.short": { $in: FINISHED_SHORT },
    })
      .sort({ date: -1 }) // 👈 usa el campo real de tu modelo
      .lean();

    const now = dayjs();
    const lastDate = lastStored ? dayjs(lastStored.date) : null;
    const shouldUpdate = !lastStored || now.diff(lastDate, "day") > 1;

    // 2️⃣ Refrescar desde API si corresponde
    if (shouldUpdate) {
      const startPrev = Date.now();
      let apiRes;

      try {
        apiRes = await axios.get(`${API_URL}/fixtures`, {
          headers: { "x-apisports-key": API_KEY },
          params: { team: teamId, season },
        });

        await ApiFootballCall.create({
          endpoint: "/fixtures",
          method: "GET",
          source: "manual",
          user: userId || null,
          apiProvider: "api-football",
          costUnit: 1,
          statusCode: apiRes.status,
          success: true,
          responseTimeMs: Date.now() - startPrev,
          remainingRequests:
            apiRes.headers?.["x-ratelimit-requests-remaining"] || null,
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
          responseTimeMs: Date.now() - startPrev,
          remainingRequests:
            err.response?.headers?.["x-ratelimit-requests-remaining"] || null,
          errorMessage: err.message,
        });

        return res.json({
          status: "error",
          message: "Error al consultar API-Football para refrescar fixtures",
        });
      }

      const fixtures = apiRes.data?.response || [];

      // preparar operaciones en bulk (upsert por fixtureId)
      const ops = fixtures.map((f) => {
        const doc = {
          fixtureId: f.fixture.id,
          date: f.fixture.date,
          leagueId: f.league.id,
          season: f.league.season,
          referee: f.fixture.referee || "",
          venue: {
            name: f.fixture.venue?.name || "",
            city: f.fixture.venue?.city || "",
          },
          league: {
            id: f.league.id,
            name: f.league.name,
            country: f.league.country,
            logo: f.league.logo,
            flag: f.league.flag || "",
            season: f.league.season,
            round: f.league.round,
          },
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
          goals: {
            home: f.goals?.home ?? null,
            away: f.goals?.away ?? null,
          },
          score: f.score || {},
          status: f.fixture.status || {},
          lastUpdate: new Date(),
        };

        return {
          updateOne: {
            filter: { fixtureId: f.fixture.id },
            update: { $set: doc },
            upsert: true,
          },
        };
      });

      if (ops.length > 0) {
        await Fixture.bulkWrite(ops, { ordered: false });
      }
    }

    // 3️⃣ Consultar terminados (pasados)
    const finishedFixtures = await Fixture.find({
      $or: [{ "teams.home.id": teamId }, { "teams.away.id": teamId }],
      "league.season": season,
      "status.short": { $in: FINISHED_SHORT },
    })
      .sort({ date: -1 })
      .lean();

    // 4️⃣ Consultar próximos o en vivo
    const upcomingFixtures = await Fixture.find({
      $and: [
        {
          $or: [{ "teams.home.id": teamId }, { "teams.away.id": teamId }],
        },
        { "league.season": season },
        { "status.short": { $nin: CANCELLED_SHORT } },
        {
          $or: [
            { date: { $gte: new Date() } },
            { "status.short": { $in: LIVE_SHORT } },
            { "status.short": { $in: POSTPONED_SHORT } },
          ],
        },
      ],
    })
      .sort({ date: 1 })
      .lean();

    return res.json({
      status: "success",
      pastFixtures: finishedFixtures,
      upcomingFixtures,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "An error was found. Please, try again",
    });
  }
};

const getFixturesLeague = async (req, res) => {
  let leagueId = parseInt(req.params.leagueId, 10);
  let season = parseInt(req.params.season, 10);

  const LIVE_SHORT = ["1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE"];

  const FINISHED_SHORT = ["FT", "AET", "PEN"];

  const CANCELLED_SHORT = ["CANC", "PST", "ABD"];

  if (isNaN(leagueId) || isNaN(season)) {
    return res.json({
      status: "error",
      message: "Invalid leagueId or season",
    });
  }

  const userId = req.user.id;

  // Obtener temporada actual si es 0
  if (season === 0) {
    season = await getCurrentSeason({ leagueId, userId });
  }

  try {
    // Buscar último fixture actualizado en la liga
    const lastStored = await Fixture.findOne({
      leagueId,
      season,
    }).sort({ lastUpdate: -1 });

    const now = dayjs();
    const lastUpdate = lastStored ? dayjs(lastStored.lastUpdate) : null;

    // Detectar si hay partidos activos o del día
    const activeFixtures = await Fixture.find({
      leagueId,
      season,
      "status.short": { $in: [...LIVE_SHORT, ...POSTPONED_SHORT] },
    });

    const hasLiveOrToday = activeFixtures.some((f) =>
      dayjs(f.date).isSame(now, "day"),
    );

    // Calcular si se debe actualizar
    const minutesDiff = lastUpdate ? now.diff(lastUpdate, "minute") : Infinity;
    const shouldUpdate =
      !lastStored ||
      (hasLiveOrToday && minutesDiff >= 5) || // cada 5 minutos
      (!hasLiveOrToday && minutesDiff >= 360); // cada 6 horas

    // Actualizar si corresponde
    if (shouldUpdate) {
      const startFixtures = Date.now();
      let apiRes;

      try {
        apiRes = await axios.get(`${API_URL}/fixtures`, {
          params: { league: leagueId, season },
          headers: { "x-apisports-key": API_KEY },
        });

        await ApiFootballCall.create({
          endpoint: "/fixtures",
          method: "GET",
          source: "manual",
          user: userId || null,
          apiProvider: "api-football",
          costUnit: 1,
          statusCode: apiRes.status,
          success: true,
          responseTimeMs: Date.now() - startFixtures,
          remainingRequests:
            apiRes.headers?.["x-ratelimit-requests-remaining"] || null,
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

        return res.json({
          status: "error",
          message: "Error al consultar fixtures en API-Football",
        });
      }

      const fixtures = apiRes.data?.response || [];
      if (!fixtures.length) {
        return res.json({
          status: "error",
          message: "No se encontraron partidos para esta liga",
        });
      }

      // Actualización optimizada (upsert)
      const ops = fixtures.map((f) => ({
        updateOne: {
          filter: { fixtureId: f.fixture.id },
          update: {
            $set: {
              fixtureId: f.fixture.id,
              leagueId,
              season,
              date: f.fixture.date,
              referee: f.fixture.referee || null,
              status: {
                long: f.fixture.status.long,
                short: f.fixture.status.short,
                elapsed: f.fixture.status.elapsed,
              },
              venue: {
                name: f.fixture.venue?.name || "",
                city: f.fixture.venue?.city || "",
              },
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
              goals: f.goals,
              league: {
                id: f.league.id,
                name: f.league.name,
                country: f.league.country,
                logo: f.league.logo,
                round: f.league.round,
                season: f.league.season,
              },
              lastUpdate: new Date(),
            },
          },
          upsert: true,
        },
      }));

      await Fixture.bulkWrite(ops, { ordered: false });
    }

    // Consultar desde DB
    const finishedFixtures = await Fixture.find({
      leagueId,
      season,
      "status.short": { $in: FINISHED_SHORT },
    })
      .sort({ date: -1 })
      .lean();

    const upcomingFixtures = await Fixture.find({
      leagueId,
      season,
      "status.short": { $nin: [...FINISHED_SHORT, ...CANCELLED_SHORT] },
      date: { $gte: new Date() },
    })
      .sort({ date: 1 })
      .lean();

    // Responder
    return res.json({
      status: "success",
      pastFixtures: finishedFixtures,
      upcomingFixtures,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "Error al obtener los fixtures de la liga",
    });
  }
};

const getFixtureById = async (req, res) => {
  const fixtureId = parseInt(req.params.fixtureId, 10);
  if (isNaN(fixtureId)) {
    return res.json({ status: "error", message: "Invalid fixtureId" });
  }

  const userId = req.user.id;

  try {
    let fixture = await Fixture.findOne({ fixtureId }).lean();

    // ✅ BD y no refresh
    if (fixture && !shouldRefreshFixture(fixture)) {
      const short = fixture?.status?.short;

      let liveMatchFixture = null;
      if (FINISHED_SHORT.has(short)) {
        liveMatchFixture = await updateLiveMatchCompleted(fixtureId, userId);
      }

      return res.json({ status: "success", fixture, liveMatchFixture });
    }

    // ✅ API fetch
    const startFixture = Date.now();
    let apiRes;

    try {
      apiRes = await axios.get(`${API_URL}/fixtures`, {
        params: { id: fixtureId },
        headers: { "x-apisports-key": API_KEY },
      });

      await ApiFootballCall.create({
        endpoint: "/fixtures",
        method: "GET",
        source: "manual",
        user: userId || null,
        apiProvider: "api-football",
        costUnit: 1,
        statusCode: apiRes.status,
        success: true,
        responseTimeMs: Date.now() - startFixture,
        remainingRequests:
          apiRes.headers?.["x-ratelimit-requests-remaining"] || null,
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
        responseTimeMs: Date.now() - startFixture,
        remainingRequests:
          err.response?.headers?.["x-ratelimit-requests-remaining"] || null,
        errorMessage: err.message,
      });

      return res.json({
        status: "error",
        message: "Error al consultar fixture en API-Football",
      });
    }

    const data = apiRes.data;

    const fixtures = data?.response || [];
    if (!fixtures.length) {
      if (fixture) {
        return res.json({ status: "success", fixture, liveMatchFixture: null });
      }
      return res.json({
        status: "error",
        message: "No se encontró el fixture en la API",
      });
    }

    const f = fixtures[0];
    const short = f?.fixture?.status?.short ?? "NS";

    const payload = mapApiFixtureToDb(f);

    // ✅ primero actualiza/crea el fixture y úsalo como respuesta
    const saved = await Fixture.findOneAndUpdate(
      { fixtureId: payload.fixtureId },
      {
        $set: payload,
        $setOnInsert: { notified: false },
        $currentDate: { lastUpdate: true },
      },
      { new: true, upsert: true },
    ).lean();

    let liveMatchFixture = null;
    if (FINISHED_SHORT.has(short)) {
      liveMatchFixture = await updateLiveMatchCompleted(fixtureId, userId);
    }

    return res.json({ status: "success", fixture: saved, liveMatchFixture });
  } catch (error) {
    return res.json({
      status: "error",
      message: "An error was found. Please, try again",
    });
  }
};

const getPreMatchStats = async (req, res) => {
  try {
    const { fixtureId } = req.params;
    const now = dayjs();
    const userId = req.user?.id || null;

    const TTL_HOURS_DEFAULT = 6;
    const H2H_EVENTS_LIMIT = 3;

    const logApiSuccess = async (endpoint, response, start, source = "manual") =>
      ApiFootballCall.create({
        endpoint,
        method: "GET",
        source,
        user: userId,
        apiProvider: "api-football",
        costUnit: 1,
        statusCode: response.status,
        success: true,
        responseTimeMs: Date.now() - start,
        remainingRequests:
          response.headers?.["x-ratelimit-requests-remaining"] || null,
      });

    const logApiError = async (endpoint, err, start, source = "manual") =>
      ApiFootballCall.create({
        endpoint,
        method: "GET",
        source,
        user: userId,
        apiProvider: "api-football",
        costUnit: 1,
        statusCode: err.response?.status || 500,
        success: false,
        responseTimeMs: Date.now() - start,
        remainingRequests:
          err.response?.headers?.["x-ratelimit-requests-remaining"] || null,
        errorMessage: err.message,
      });

    // 0) Buscar en DB
    let stats = await PreMatchStats.findOne({ fixtureId });

    /* =======================
       1) /fixtures (por id)
    ======================= */
    const startFixture = Date.now();
    let fixtureRes;

    try {
      fixtureRes = await axios.get(`${API_URL}/fixtures`, {
        headers: { "x-apisports-key": API_KEY },
        params: { id: fixtureId },
      });
      await logApiSuccess("/fixtures?id", fixtureRes, startFixture);
    } catch (err) {
      await logApiError("/fixtures?id", err, startFixture);
      return res.json({ status: "error", message: "Error consultando fixture" });
    }

    const fixture = fixtureRes.data?.response?.[0];
    if (!fixture) {
      return res.json({ status: "error", message: "Fixture no encontrado" });
    }

    const fixtureDate = dayjs(fixture.fixture.date);
    const statusShort = fixture.fixture.status.short;
    const hoursUntil = fixtureDate.diff(now, "hour");

    // 2) Frecuencia dinámica
    let maxAgeHours = TTL_HOURS_DEFAULT;
    if (LIVE_SHORT.has(statusShort)) maxAgeHours = 0.1; // ~6 min
    else if (FINISHED_SHORT.has(statusShort)) maxAgeHours = Infinity; // no actualizar
    else if (hoursUntil <= 12) maxAgeHours = 1;
    else if (hoursUntil <= 48) maxAgeHours = 6;
    else maxAgeHours = 12;

    const lastUpdated = stats ? dayjs(stats.lastUpdated) : null;
    const shouldUpdate =
      !stats ||
      (maxAgeHours !== Infinity &&
        (!lastUpdated || now.diff(lastUpdated, "hour") >= maxAgeHours));

    if (!shouldUpdate && stats) {
      return res.json({ status: "success", updated: false, stats });
    }

    // 3) Si ya terminó y no había stats guardadas
    if (FINISHED_SHORT.has(statusShort) && !stats) {
      return res.json({
        status: "not_found",
        message: "El partido ya terminó y no hay estadísticas previas",
      });
    }

    // 4) IDs base
    const homeId = fixture.teams.home.id;
    const awayId = fixture.teams.away.id;
    const season = fixture.league.season;
    const leagueId = fixture.league.id;

    /* =======================
       5) /fixtures/headtohead
    ======================= */
    const startH2H = Date.now();
    let h2hRes;

    try {
      h2hRes = await axios.get(`${API_URL}/fixtures/headtohead`, {
        headers: { "x-apisports-key": API_KEY },
        params: { h2h: `${homeId}-${awayId}` },
      });
      await logApiSuccess("/fixtures/headtohead", h2hRes, startH2H);
    } catch (err) {
      await logApiError("/fixtures/headtohead", err, startH2H);
      return res.json({
        status: "error",
        message: "Error consultando headtohead",
      });
    }

    // 6) H2H + goleadores (solo últimos 3)
    const h2hFixtures = Array.isArray(h2hRes.data?.response)
      ? h2hRes.data.response
      : [];

    // ordenar por fecha desc (por si la API no viene ordenada)
    h2hFixtures.sort(
      (a, b) => new Date(b.fixture.date).getTime() - new Date(a.fixture.date).getTime(),
    );

    const recentForEvents = h2hFixtures.slice(0, H2H_EVENTS_LIMIT);
    const headToHeadWithGoals = [];

    for (const f of recentForEvents) {
      await sleep(500);

      const startEv = Date.now();
      let evRes;

      try {
        evRes = await axios.get(`${API_URL}/fixtures/events`, {
          headers: { "x-apisports-key": API_KEY },
          params: { fixture: f.fixture.id },
        });
        await logApiSuccess("/fixtures/events", evRes, startEv);
      } catch (err) {
        await logApiError("/fixtures/events", err, startEv);
        continue; // seguimos sin romper
      }

      const goals = (evRes.data?.response || [])
        .filter((e) => e.type === "Goal")
        .map((e) => ({
          minute: e.time.elapsed,
          scorer: e.player.name,
          assist: e.assist?.name || null,
          teamId: e.team.id,
        }));

      headToHeadWithGoals.push({ ...f, goalscorers: goals });
    }

    /* =======================
       7) /fixtures (last 5 home/away)
    ======================= */
    await sleep(500);
    const startHomeRecent = Date.now();
    let homeRecent;

    try {
      homeRecent = await axios.get(`${API_URL}/fixtures`, {
        headers: { "x-apisports-key": API_KEY },
        params: { team: homeId, last: 5 },
      });
      await logApiSuccess("/fixtures?last", homeRecent, startHomeRecent);
    } catch (err) {
      await logApiError("/fixtures?last", err, startHomeRecent);
      return res.json({ status: "error", message: "Error consultando últimos home" });
    }

    await sleep(500);
    const startAwayRecent = Date.now();
    let awayRecent;

    try {
      awayRecent = await axios.get(`${API_URL}/fixtures`, {
        headers: { "x-apisports-key": API_KEY },
        params: { team: awayId, last: 5 },
      });
      await logApiSuccess("/fixtures?last", awayRecent, startAwayRecent);
    } catch (err) {
      await logApiError("/fixtures?last", err, startAwayRecent);
      return res.json({ status: "error", message: "Error consultando últimos away" });
    }

    /* =======================
       8) /teams/statistics (promedios)
       - si falla, dejamos nulls (no rompe)
    ======================= */
    let homeTeamStatsRes = null;
    const startHomeTeamStats = Date.now();
    try {
      homeTeamStatsRes = await axios.get(`${API_URL}/teams/statistics`, {
        headers: { "x-apisports-key": API_KEY },
        params: { league: leagueId, season, team: homeId },
      });
      await logApiSuccess("/teams/statistics", homeTeamStatsRes, startHomeTeamStats);
    } catch (err) {
      await logApiError("/teams/statistics", err, startHomeTeamStats);
      homeTeamStatsRes = null;
    }

    let awayTeamStatsRes = null;
    const startAwayTeamStats = Date.now();
    try {
      awayTeamStatsRes = await axios.get(`${API_URL}/teams/statistics`, {
        headers: { "x-apisports-key": API_KEY },
        params: { league: leagueId, season, team: awayId },
      });
      await logApiSuccess("/teams/statistics", awayTeamStatsRes, startAwayTeamStats);
    } catch (err) {
      await logApiError("/teams/statistics", err, startAwayTeamStats);
      awayTeamStatsRes = null;
    }

    // ⚠️ El shape exacto puede variar; dejamos defaults seguros.
    // Cuando confirmes estructura real, mapeas acá.
    const homeAvg = { possession: null, shots: null, passes: null };
    const awayAvg = { possession: null, shots: null, passes: null };

    /* =======================
       9) /players (home/away)
    ======================= */
    await sleep(500);
    const startHomePlayers = Date.now();
    let homePlayers;

    try {
      homePlayers = await axios.get(`${API_URL}/players`, {
        headers: { "x-apisports-key": API_KEY },
        params: { team: homeId, season },
      });
      await logApiSuccess("/players", homePlayers, startHomePlayers);
    } catch (err) {
      await logApiError("/players", err, startHomePlayers);
      return res.json({ status: "error", message: "Error consultando jugadores home" });
    }

    await sleep(500);
    const startAwayPlayers = Date.now();
    let awayPlayers;

    try {
      awayPlayers = await axios.get(`${API_URL}/players`, {
        headers: { "x-apisports-key": API_KEY },
        params: { team: awayId, season },
      });
      await logApiSuccess("/players", awayPlayers, startAwayPlayers);
    } catch (err) {
      await logApiError("/players", err, startAwayPlayers);
      return res.json({ status: "error", message: "Error consultando jugadores away" });
    }

    const getTop = (players, key) =>
      (players || [])
        .map((p) => ({
          id: p.player.id,
          name: p.player.name,
          value:
            key === "goals"
              ? p.statistics?.[0]?.goals?.total ?? 0
              : p.statistics?.[0]?.goals?.assists ?? 0,
        }))
        .filter((p) => p.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);

    const topScorersHome = getTop(homePlayers.data.response, "goals");
    const topScorersAway = getTop(awayPlayers.data.response, "goals");
    const topAssistsHome = getTop(homePlayers.data.response, "assists");
    const topAssistsAway = getTop(awayPlayers.data.response, "assists");

    /* =======================
       10) Guardar y responder
    ======================= */
    const preMatchStats = {
      fixtureId,
      homeTeamId: homeId,
      awayTeamId: awayId,

      headToHead: headToHeadWithGoals, // H2H con goleadores solo para los últimos 3
      homeRecent: homeRecent.data.response,
      awayRecent: awayRecent.data.response,

      homeAverages: homeAvg,
      awayAverages: awayAvg,

      topScorers: { home: topScorersHome, away: topScorersAway },
      topAssisters: { home: topAssistsHome, away: topAssistsAway },

      lastUpdated: new Date(),
    };

    if (stats) await PreMatchStats.updateOne({ fixtureId }, preMatchStats);
    else await PreMatchStats.create(preMatchStats);

    return res.json({
      status: "success",
      updated: true,
      stats: preMatchStats,
      apiCallsEstimate: {
        fixed: 8, // fixtures(id) + headtohead + fixtures(last home) + fixtures(last away) + teams/stat(2) + players(2)
        variableH2HEvents: H2H_EVENTS_LIMIT, // 3
        total: 8 + H2H_EVENTS_LIMIT, // 11
      },
    });
  } catch (error) {
    console.error("❌ getPreMatchStats error:", error.message);
    return res.json({
      status: "error",
      message: "Error al obtener estadísticas previas",
    });
  }
};

const getFixtureLineups = async (req, res) => {
  try {
    const fixtureId = Number(req.params.fixtureId);
    if (!fixtureId) {
      return res.json({ status: "error", message: "fixtureId inválido" });
    }

    const now = dayjs();
    const userId = req.user.id;

    // 1) Buscar en DB
    let lineupDoc = await Lineup.findOne({ fixtureId });

    // 2) Si ya hay alineación guardada => NO pedir /lineups
    const alreadyHasLineup = hasFinalLineup(lineupDoc);

    // 3) Si no hay alineación todavía, pedir /fixtures/lineups
    if (!alreadyHasLineup) {
      const startLineups = Date.now();
      let apiRes;

      try {
        apiRes = await axios.get(`${API_URL}/fixtures/lineups`, {
          headers: { "x-apisports-key": API_KEY },
          params: { fixture: fixtureId },
        });

        await ApiFootballCall.create({
          endpoint: "/fixtures/lineups",
          method: "GET",
          source: "manual",
          user: userId || null,
          apiProvider: "api-football",
          costUnit: 1,
          statusCode: apiRes.status,
          success: true,
          responseTimeMs: Date.now() - startLineups,
          remainingRequests:
            apiRes.headers?.["x-ratelimit-requests-remaining"] || null,
        });

      } catch (err) {

        await ApiFootballCall.create({
          endpoint: "/fixtures/lineups",
          method: "GET",
          source: "manual",
          user: userId || null,
          apiProvider: "api-football",
          costUnit: 1,
          statusCode: err.response?.status || 500,
          success: false,
          responseTimeMs: Date.now() - startLineups,
          remainingRequests:
            err.response?.headers?.["x-ratelimit-requests-remaining"] || null,
          errorMessage: err.message,
        });

        return res.json({
          status: "error",
          message: "Error consultando alineaciones en API-Football",
        });
      }

      const response = apiRes.data?.response || [];

      if (!response.length) {
        // fetchFixtureStatusShort ya registra por dentro (/fixtures)
        const statusShort = await fetchFixtureStatusShort(fixtureId, userId);
        if (!statusShort) {
          return res.json({
            status: "error",
            message: "Fixture no encontrado",
          });
        }

        if (FINISHED_SHORT.has(statusShort)) {
          return res.json({
            status: "not_found",
            message: "El partido ya terminó y no hay alineaciones",
          });
        }

        return res.json({
          status: "not_found",
          message: "No hay alineaciones disponibles todavía",
        });
      }

      // Enriquecer con fotos solo si hace falta
      const enrichedLineups = [];
      for (const l of response) {
        const teamId = l.team?.id;

        const needsSquadPhotos =
          (l.startXI || []).some((p) => !p.player.photo) ||
          (l.substitutes || []).some((p) => !p.player.photo);

        // getSquadPhotoMap ya registra por dentro (/players/squads)
        const photoMap = needsSquadPhotos
          ? await getSquadPhotoMap(teamId, userId)
          : {};

        enrichedLineups.push(normalizeTeamLineup(l, photoMap));
      }

      const hasLineupFlag = enrichedLineups.some(
        (t) => (t.startXI?.length || 0) > 0,
      );

      // Upsert lineup + hasLineup
      await Lineup.updateOne(
        { fixtureId },
        {
          $set: {
            fixtureId,
            lineups: enrichedLineups,
            hasLineup: hasLineupFlag,
            lastUpdated: new Date(),
          },
          $setOnInsert: {
            ratingsLastUpdated: null,
            ratingsFinal: false,
          },
        },
        { upsert: true },
      );

      lineupDoc = await Lineup.findOne({ fixtureId });
    }

    // 4) Ratings (fetchFixtureStatusShort y fetchRatingsMap registran por dentro)
    const statusShort = await fetchFixtureStatusShort(fixtureId, userId);
    if (!statusShort) {
      return res.json({ status: "error", message: "Fixture no encontrado" });
    }

    const isFinished = FINISHED_SHORT.has(statusShort);
    const isLive = LIVE_SHORT.has(statusShort);
    const isNotStarted = NOT_STARTED_SHORT.has(statusShort);

    let ratingsUpdated = false;

    if (hasFinalLineup(lineupDoc) && !isNotStarted) {
      let shouldUpdateRatings = false;

      if (lineupDoc.ratingsFinal) {
        shouldUpdateRatings = false;
      } else if (isFinished) {
        shouldUpdateRatings = true; // traer y sellar
      } else if (isLive) {
        const last = lineupDoc.ratingsLastUpdated
          ? dayjs(lineupDoc.ratingsLastUpdated)
          : null;
        const minutesAgo = last ? now.diff(last, "minute") : 9999;
        shouldUpdateRatings = minutesAgo >= RATINGS_LIVE_REFRESH_MIN;
      }

      if (shouldUpdateRatings) {
        const ratingsMap = await fetchRatingsMap(fixtureId, userId); // ya registra /fixtures/players
        const updatedLineups = applyRatings(lineupDoc.lineups, ratingsMap);

        lineupDoc.lineups = updatedLineups;
        lineupDoc.ratingsLastUpdated = new Date();
        lineupDoc.ratingsFinal = true;

        await lineupDoc.save();

        lineupDoc = await Lineup.findOne({ fixtureId });
        ratingsUpdated = true;
      }
    }

    return res.json({
      status: "success",
      updated: true,
      statusShort,
      ratingsUpdated,
      lineup: lineupDoc,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "Error al obtener alineaciones/ratings",
    });
  }
};

const getLiveMatch = async (req, res) => {
  try {
    const { fixtureId } = req.params;
    const id = Number(fixtureId);

    if (isNaN(id)) {
      return res.json({ status: "error", message: "fixtureId inválido" });
    }

    //Buscar en DB
    const live = await LiveMatch.findOne({ fixtureId: id }).lean();
    if (!live) {
      return res.json({
        status: "not_found",
        message: "No se encontró el partido en LiveMatch",
      });
    }

    return res.json({
      status: "success",
      live,
    });
  } catch (err) {
    return res.json({
      status: "error",
      message: "Error al obtener datos del partido en vivo",
    });
  }
};

const getMatchesDay = async (req, res) => {
  try {
    const { leagueId = 0, team = "", status = "ALL" } = req.query;
    const teamQ = String(team || "")
      .trim()
      .toLowerCase();

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // 1) fixtures de hoy (TODOS)
    const fixturesToday = await Fixture.find({
      date: { $gte: startOfDay, $lte: endOfDay },
    })
      .sort({ date: 1 })
      .lean();

    // 2) fixtures prioritarios (para selector ligas y home default)
    const priorityFixtures = fixturesToday.filter((f) =>
      isPriorityCompetition(f.league?.id),
    );

    // 3) ligas disponibles (de prioritarios)
    const leaguesMap = new Map();
    for (const f of priorityFixtures) {
      if (!f.league?.id) continue;
      if (!leaguesMap.has(f.league.id)) {
        leaguesMap.set(f.league.id, {
          id: f.league.id,
          name: f.league.name,
          logo: f.league.logo,
        });
      }
    }
    const leagues = Array.from(leaguesMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    // 4) default league si no mandan (ej: Colombia - Primera A)
    const defaultLeagueId =
      leagues.find((l) => l.name.toLowerCase() === "primera a")?.id ||
      leagues[0]?.id ||
      "ALL";

    // --- MODO BUSCADOR (team) ---
    // Si viene team, buscamos si ese equipo juega HOY (en TODOS los fixtures del día)
    let scopedFixtures = null;
    let teamPlaysToday = undefined;
    let teamInfo = undefined;
    let message = undefined;

    if (teamQ) {
      const matchesTeam = fixturesToday.filter((f) => {
        const home = String(f.teams?.home?.name || "").toLowerCase();
        const away = String(f.teams?.away?.name || "").toLowerCase();
        return home.includes(teamQ) || away.includes(teamQ);
      });

      if (matchesTeam.length === 0) {
        teamPlaysToday = false;
        message = `Ese equipo no juega hoy.`;
        teamInfo = { name: String(team || "").trim() };

        return res.json({
          status: "success",
          leagues,
          defaultLeagueId,
          matches: [],
          sections: [],
          events: [],
          teamPlaysToday,
          teamInfo,
          message,
        });
      }

      // Si juega hoy: devolvemos solo sus fixtures (normalmente 1)
      scopedFixtures = matchesTeam;
      teamPlaysToday = true;

      // info mínima del equipo (la que exista en DB hoy)
      // si coincidió con home/away, devolvemos ese objeto
      const sample = matchesTeam[0];
      const home = sample.teams?.home?.name || "";
      const away = sample.teams?.away?.name || "";
      const homeLower = home.toLowerCase();
      const awayLower = away.toLowerCase();
      const side = homeLower.includes(teamQ)
        ? "home"
        : awayLower.includes(teamQ)
          ? "away"
          : null;

      teamInfo =
        side && sample.teams?.[side]
          ? {
              id: sample.teams[side].id,
              name: sample.teams[side].name,
              logo: sample.teams[side].logo,
            }
          : { name: String(team || "").trim() };

      // Nota: aquí NO aplicamos filtro por leagueId (porque el usuario buscó un equipo específico)
    }

    // --- MODO NORMAL (sin team) ---
    else {
      scopedFixtures =
        leagueId == 0
          ? priorityFixtures
          : priorityFixtures.filter(
              (f) => String(f.league?.id) === String(leagueId),
            );
    }

    scopedFixtures = uniqueByFixtureId(scopedFixtures);

    // 5) LiveMatches en 1 sola query
    const fixtureIds = scopedFixtures.map((f) => f.fixtureId);
    const liveMatches = await LiveMatch.find({
      fixtureId: { $in: fixtureIds },
    }).lean();

    const liveMap = new Map(liveMatches.map((m) => [m.fixtureId, m]));

    // 6) merge + filtro status bucket (si aplica)
    let matches = [];
    for (const fx of scopedFixtures) {
      const m = liveMap.get(fx.fixtureId) || buildLiveMatchFromFixture(fx);

      matches.push(m);
    }

    if (status !== "ALL") {
      if (status === "LIVE") {
        matches = matches.filter(isLive);
      } else if (status === "NS") {
        matches = matches.filter(isUpcoming);
      } else if (status === "FINISHED") {
        matches = matches.filter(isFinished);
      }
    }

    // 7) ordenar por UX
    if (status === "FINISHED") {
      matches.sort(
        (a, b) => new Date(b.fixture.date) - new Date(a.fixture.date),
      );
    } else {
      matches.sort(
        (a, b) => new Date(a.fixture.date) - new Date(b.fixture.date),
      );
    }

    // 8) sections + events desde back
    const sections = buildSections(matches, status);
    const events = buildEventMessages(matches);

    return res.json({
      status: "success",
      leagues,
      defaultLeagueId,
      matches,
      sections,
      events,
      teamPlaysToday, // undefined si no vino team; true/false si vino
      teamInfo,
      message,
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "An error was found. Please, try again!",
    });
  }
};

// --- Helper: LiveMatch “vacío” desde Fixture ---
function buildLiveMatchFromFixture(fixture) {
  return {
    fixtureId: fixture.fixtureId,
    fixture: {
      id: fixture.fixtureId,
      date: fixture.date,
      referee: fixture.referee,
      timezone: "UTC",
      status: fixture.status,
      venue: fixture.venue,
      periods: fixture.periods,
    },
    league: fixture.league,
    status: fixture.status,
    teams: fixture.teams,
    goals: fixture.goals,
    events: [],
    statistics: [],
    lineups: [],
    lineupsChecked: false,
    lastUpdated: new Date(),
  };
}

function uniqueByFixtureId(items = []) {
  const map = new Map();

  for (const it of items) {
    const id = it?.fixtureId ?? it?.fixture?.id;
    if (id == null) continue;

    const prev = map.get(id);

    // si no había uno, guardo
    if (!prev) {
      map.set(id, it);
      continue;
    }

    // criterio: preferir el que tenga lastUpdated más reciente (si existe)
    const prevTs = prev?.lastUpdated ? new Date(prev.lastUpdated).getTime() : 0;
    const currTs = it?.lastUpdated ? new Date(it.lastUpdated).getTime() : 0;

    if (currTs > prevTs) {
      map.set(id, it);
      continue;
    }

    // si ninguno tiene lastUpdated, preferir el que tenga más "carga" (events, stats)
    const prevScore =
      (Array.isArray(prev?.events) ? prev.events.length : 0) +
      (Array.isArray(prev?.statistics) ? prev.statistics.length : 0) +
      (Array.isArray(prev?.lineups) ? prev.lineups.length : 0);

    const currScore =
      (Array.isArray(it?.events) ? it.events.length : 0) +
      (Array.isArray(it?.statistics) ? it.statistics.length : 0) +
      (Array.isArray(it?.lineups) ? it.lineups.length : 0);

    if (currScore > prevScore) {
      map.set(id, it);
    }
  }

  return Array.from(map.values());
}

function isLive(m) {
  return LIVE_SHORT.has(m?.status?.short);
}

function isUpcoming(m) {
  return m?.status?.short === "NS";
}

function isFinished(m) {
  return FINISHED_SHORT.has(m?.status?.short);
}

function buildSections(matches, statusQ) {
  if (statusQ !== "ALL") {
    const titleMap = {
      LIVE: "EN VIVO",
      NS: "PRÓXIMOS",
      FINISHED: "FINALIZADOS",
    };

    return matches.length ? [{ title: titleMap[statusQ], data: matches }] : [];
  }

  return [
    { title: "EN VIVO", data: matches.filter(isLive) },
    { title: "PRÓXIMOS", data: matches.filter(isUpcoming) },
    { title: "FINALIZADOS", data: matches.filter(isFinished) },
  ].filter((s) => s.data.length);
}

// ✅ events ticker desde back (sin meter lógica pesada)
function buildEventMessages(matches) {
  const messages = [];

  for (const m of matches) {
    const home = m?.teams?.home?.name || "Local";
    const away = m?.teams?.away?.name || "Visitante";

    // goles y rojas (si hay events)
    if (Array.isArray(m.events)) {
      for (const ev of m.events) {
        if (ev?.type === "Goal") {
          const minute = `${ev.time?.elapsed ?? ""}${
            ev.time?.extra ? "+" + ev.time.extra : ""
          }'`;
          const player = ev.player?.name || "Jugador";
          const assist = ev.assist?.name ? ` (asist: ${ev.assist.name})` : "";
          messages.push(
            `⚽ ${minute} Gol de ${player}${assist} (${home} vs ${away})`,
          );
        }

        if (
          ev?.type === "Card" &&
          String(ev.detail).toLowerCase().includes("red")
        ) {
          const minute = `${ev.time?.elapsed ?? ""}'`;
          const player = ev.player?.name || "Jugador";
          messages.push(
            `🟥 ${minute} Roja para ${player} (${home} vs ${away})`,
          );
        }
      }
    }

    // fallback simple para partidos en vivo (si no hubo eventos)
    if (
      LIVE_SHORT.has(m?.status?.short) &&
      (!m.events || m.events.length === 0)
    ) {
      messages.push(
        `📊 En vivo: ${home} ${m.goals?.home ?? 0} - ${
          m.goals?.away ?? 0
        } ${away} (${m.status?.elapsed ?? 0}’)`,
      );
    }

    // finalizados
    if (FINISHED_SHORT.has(m?.status?.short)) {
      messages.push(
        `🔚 Final: ${home} ${m.goals?.home ?? 0} - ${
          m.goals?.away ?? 0
        } ${away}`,
      );
    }
  }

  // ✅ opcional: limitar a X mensajes para no inflar payload
  return messages.slice(0, 25);
}

const isLiveMatch = async (req, res) => {
  try {
    const { fixtureId } = req.params;

    if (!fixtureId) {
      return res.status(400).json({
        status: "error",
        message: "fixtureId es requerido",
      });
    }

    // 🔹 Buscar en base de datos
    const match = await LiveMatch.findOne({ fixtureId: fixtureId }).lean();
    if (!match) {
      // el partido no se encuentra en livematch porque no ha empezadp
      return res.json({
        status: "success",
        isLive: false,
      });
    }

    // 🔹 Evaluar estado
    const finishedStates = ["FT", "AET", "PEN"];
    const isFinished = finishedStates.includes(match.status?.short);

    return res.json({
      status: "success",
      isLive: isFinished, // ✅ true o false
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "An error was found. Please, try again!",
    });
  }
};

const getMatchesNationalDay = async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // Buscar fixtures del día
    const fixturesToday = await Fixture.find({
      date: { $gte: startOfDay, $lte: endOfDay },
    })
      .sort({ date: 1 })
      .lean();

    const matches = [];

    for (const fixture of fixturesToday) {
      // 🎯 FILTRO PRINCIPAL: solo selecciones nacionales
      const isNationalLeague =
        fixture.league?.type === "Cup" &&
        [
          "World",
          "Europe",
          "South America",
          "North America",
          "Africa",
          "Asia",
          "Oceania",
        ].includes(fixture.league?.country);

      // También podemos validar si ambos equipos son nacionales
      const isNationalTeams =
        fixture.teams?.home?.national === true &&
        fixture.teams?.away?.national === true;

      if (!isNationalLeague && !isNationalTeams) continue;

      // Buscar si ya está en LiveMatch
      let match = await LiveMatch.findOne({
        fixtureId: fixture.fixtureId,
      }).lean();

      // Si no existe → crear objeto “próximo partido”
      if (!match) {
        match = buildLiveMatchFromFixture(fixture);
      }

      matches.push(match);
    }

    // 🔄 Ordenar por hora
    matches.sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date));

    return res.json({
      status: "success",
      matches,
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "Error al obtener los partidos de selecciones nacionales",
    });
  }
};

const ratePlayer = async (req, res) => {
  try {
    const { fixtureId, playerId } = req.params;
    const { rate } = req.body;
    const { id: userId } = req.user;
    if (!fixtureId || !playerId || !rate) {
      return res.json({
        status: "error",
        message: "Parámetros requeridos: fixtureId, playerId y rate.",
      });
    }

    // 1️⃣ Buscar el partido en vivo
    const liveMatch = await LiveMatch.findOne({ fixtureId });
    if (!liveMatch) {
      return res.json({
        status: "error",
        message: "Partido no encontrado.",
      });
    }

    // 2️⃣ Buscar si ya existe una calificación previa del usuario
    let existing = await UserRating.findOne({
      user: userId,
      fixtureId,
      playerId,
    });

    if (existing) {
      existing.rate = rate; // actualizar calificación
      await existing.save();
    } else {
      existing = await UserRating.create({
        user: userId,
        fixtureId,
        playerId,
        rate,
      });
    }

    return res.json({
      status: "success",
      message: "Calificación registrada correctamente.",
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "An error was found. Please, try again",
    });
  }
};

const getPlayerUserRatings = async (req, res) => {
  try {
    const { fixtureId } = req.params;

    const ratings = await UserRating.aggregate([
      { $match: { fixtureId: Number(fixtureId) } },
      {
        $group: {
          _id: "$playerId",
          avg: { $avg: "$rate" },
          votes: { $sum: 1 },
        },
      },
    ]);

    const map = {};
    for (const r of ratings) {
      map[r._id] = {
        avg: Number(r.avg.toFixed(1)),
        votes: r.votes,
      };
    }

    return res.json({
      status: "success",
      ratings: map,
    });
  } catch (e) {
    return res.json({
      status: "error",
      message: "Error al obtener calificaciones de usuarios",
    });
  }
};

const getMatchesTodayFromLeague = async (req, res) => {
  try {
    const { leagueId } = req.params;

    if (isNaN(leagueId)) {
      return res.json({ status: "error", message: "leagueId inválido" });
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // Buscar fixtures del día de esa liga
    const fixturesToday = await Fixture.find({
      date: { $gte: startOfDay, $lte: endOfDay },
      leagueId: Number(leagueId),
    })
      .sort({ date: 1 })
      .lean();

    const matches = [];

    for (const fixture of fixturesToday) {
      const match = await LiveMatch.findOne({
        fixtureId: fixture.fixtureId,
        "status.short": { $in: LIVE_SHORT }, // ✅ solo los que están en vivo
      }).lean();

      if (match) matches.push(match); // solo agregamos si cumple
    }

    return res.json({
      status: "success",
      matches,
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "An error was found. Please, try again!",
    });
  }
};

module.exports = {
  getNextFixture,
  getPreviousFixturesByTeam,
  getFixturesLeague,
  getFixtureById,
  getPreMatchStats,
  getFixtureLineups,
  getLiveMatch,
  getMatchesDay,
  isLiveMatch,
  getMatchesNationalDay,
  ratePlayer,
  getPlayerUserRatings,
  getMatchesTodayFromLeague,
};
