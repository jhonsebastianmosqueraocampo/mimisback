const axios = require("axios");
const Fixture = require("../models/fixture");
const PreMatchStats = require("../models/PreMatchStats");
const Lineup = require("../models/Lineup.js");
const LiveMatch = require("../models/LiveMatch.js");
const { PRIORITY_COUNTRIES, PRIORITY_TOURNAMENTS } = require("../data/leaguesPriority");
require("dotenv").config();
const dayjs = require("dayjs");

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_URL = process.env.API_URL;

const getNextFixture = async (req, res) => {
  const { teamId } = req.params;

  if (!teamId) {
    return res.json({
      status: "error",
      message: "Invalid teamId",
    });
  }

  try {
    const existingFixture = await Fixture.findOne({
      $or: [
        { "teams.home.id": Number(teamId) },
        { "teams.away.id": Number(teamId) },
      ],
      date: { $gte: new Date() },
    }).sort({ date: 1 });

    if (existingFixture) {
      return res.json({
        status: "success",
        fixture: existingFixture,
      });
    }

    const response = await axios.get(`${API_URL}/fixtures`, {
      params: {
        team: teamId,
        next: 1,
      },
      headers: {
        "x-apisports-key": API_KEY,
      },
    });

    const fixture = response.data.response[0];

    if (!fixture) {
      return res.json({
        status: "error",
        message: "No match found",
      });
    }

    await Fixture.create({
      fixtureId: fixture.fixture.id,
      leagueId: fixture.league.name,
      season: fixture.league.season,
      date: fixture.fixture.date,
      referee: fixture.fixture.referee,
      venue: {
        id: fixture.fixture.venue.id,
        name: fixture.fixture.venue.name,
        city: fixture.fixture.venue.city,
      },
      teams: {
        home: {
          id: fixture.teams.home.id,
          name: fixture.teams.home.name,
          logo: fixture.teams.home.logo,
        },
        away: {
          id: fixture.teams.away.id,
          name: fixture.teams.away.name,
          logo: fixture.teams.away.logo,
        },
      },
      league: {
        id: fixture.league.id,
        name: fixture.league.name,
        season: fixture.league.season,
        logo: fixture.league.logo,
        round: fixture.league.round,
      },
    });

    return res.json({
      status: "success",
      fixture,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "An error occurred. Try again.",
    });
  }
};

const getPreviousFixturesByTeam = async (req, res) => {
  const { teamId, season } = req.params;

  if (!teamId || !season) {
    return res.json({
      status: "error",
      message: "Invalid teamId or season",
    });
  }

  try {
    const lastStored = await Fixture.findOne({
      $or: [{ "teams.home.id": teamId }, { "teams.away.id": teamId }],
      season: Number(season),
      "status.short": "FT",
    }).sort({ date: -1 });

    const now = dayjs();
    const lastDate = lastStored ? dayjs(lastStored.date) : null;
    const shouldUpdate = !lastStored || now.diff(lastDate, "day") > 3;

    if (shouldUpdate) {
      const response = await axios.get(`${API_URL}/fixtures`, {
        params: {
          team: teamId,
          season,
        },
        headers: {
          "x-apisports-key": API_KEY,
        },
      });

      const fixtures = response.data.response;

      for (const f of fixtures) {
        const exists = await Fixture.findOne({
          fixtureId: f.fixture.id,
        });

        if (!exists) {
          const newFixture = new Fixture({
            fixtureId: f.fixture.id,
            leaguId: f.league.id,
            season: season,
            date: f.fixture.date,
            referee: f.fixture.referee,
            status: {
              long: f.fixture.status.long,
              short: f.fixture.status.short,
              elapsed: f.fixture.status.elapsed,
              extra: f.fixture.status.extra,
            },
            venue: {
              id: f.fixture.venue.id,
              name: f.fixture.venue.name,
              city: f.fixture.venue.city,
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
              home: f.goals.home,
              away: f.goals.away,
            },
            league: {
              id: f.league.id,
              name: f.league.name,
              season: f.league.season,
              logo: f.league.logo,
              round: f.league.round,
            },
          });

          await newFixture.save();
        }
      }
    }

    const finishedFixtures = await Fixture.find({
      $or: [{ "teams.home.id": teamId }, { "teams.away.id": teamId }],
      season: Number(season),
      "status.short": "FT",
    }).sort({ date: -1 });

    const upcomingFixtures = await Fixture.find({
      $or: [{ "teams.home.id": teamId }, { "teams.away.id": teamId }],
      season: Number(season),
      "status.short": { $nin: ["FT", "CANC", "PST"] },
    }).sort({ date: 1 });

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
  const leagueId = parseInt(req.params.leagueId, 10);
  const season = parseInt(req.params.season, 10);

  if (!leagueId || !season) {
    return res.json({
      status: "error",
      message: "Invalid leagueId or season",
    });
  }

  try {
    const lastStored = await Fixture.findOne({
      leagueId: Number(leagueId),
      season: Number(season),
    }).sort({ lastUpdated: -1 });

    const now = dayjs();
    const lastUpdate = lastStored ? dayjs(lastStored.lastUpdated) : null;
    const shouldUpdate = !lastStored || now.diff(lastUpdate, "day") >= 1;

    if (shouldUpdate) {
      const response = await axios.get(`${API_URL}/fixtures`, {
        params: {
          league: leagueId,
          season,
        },
        headers: {
          "x-apisports-key": API_KEY,
        },
      });

      const fixtures = response.data.response;

      await Fixture.deleteMany({
        leagueId,
        season,
      });

      const newFixtures = fixtures.map((f) => ({
        fixtureId: f.fixture.id,
        leagueId,
        season,
        date: f.fixture.date,
        referee: f.fixture.referee,
        status: {
          long: f.fixture.status.long,
          short: f.fixture.status.short,
          elapsed: f.fixture.status.elapsed,
          extra: f.fixture.status.extra,
        },
        venue: {
          id: f.fixture.venue.id,
          name: f.fixture.venue.name,
          city: f.fixture.venue.city,
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
          home: f.goals.home,
          away: f.goals.away,
        },
        league: {
          id: f.league.id,
          name: f.league.name,
          season: f.league.season,
          logo: f.league.logo,
          round: f.league.round,
        },
      }));

      await Fixture.insertMany(newFixtures);
    }

    const finishedFixtures = await Fixture.find({
      leagueId,
      season,
      "status.short": "FT",
    }).sort({ date: -1 });

    const upcomingFixtures = await Fixture.find({
      leagueId,
      season,
      "status.short": { $nin: ["FT", "CANC", "PST"] },
    }).sort({ date: 1 });

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

const getFixtureById = async (req, res) => {
  const fixtureId = parseInt(req.params.fixtureId, 10);
  if (isNaN(fixtureId)) {
    return res.json({ status: "error", message: "Invalid fixtureId" });
  }

  try {
    const fixture = await Fixture.findOne({ fixtureId }).lean();
    return res.json({
      status: "success",
      fixture,
    });
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

    // 1. Buscar en DB
    let stats = await PreMatchStats.findOne({ fixtureId });
    if (stats && new Date() - stats.lastUpdated < 2 * 60 * 60 * 1000) {
      return res.json({ status: "success", stats });
    }

    // 2. Consultar fixture
    const fixtureRes = await axios.get(`${API_URL}/fixtures?id=${fixtureId}`, {
      headers: { "x-apisports-key": API_KEY },
    });
    const fixture = fixtureRes.data.response[0];

    if (!fixture) {
      return res.json({
        status: "error",
        message: "Fixture no encontrado",
      });
    }

    const fixtureDate = new Date(fixture.fixture.date);
    const now = new Date();

    // 3. Si el fixture ya pasó y no tenemos datos previos en DB
    if (fixtureDate < now && !stats) {
      return res.json({
        status: "not_found",
        message:
          "Estadísticas previas no disponibles porque el partido ya terminó",
      });
    }

    // 4. Si el fixture ya pasó pero hay algo en DB → devolver eso
    if (fixtureDate < now && stats) {
      return res.json({
        status: "success",
        stats,
      });
    }

    // 5. Fixture futuro → generar estadísticas previas
    const homeId = fixture.teams.home.id;
    const awayId = fixture.teams.away.id;
    const season = fixture.league.season;

    // ---- Head-to-head ----
    const h2hRes = await axios.get(
      `${API_URL}/fixtures/headtohead?h2h=${homeId}-${awayId}`,
      { headers: { "x-apisports-key": API_KEY } }
    );

    // enriquecer cada partido con sus goleadores
    const headToHeadWithGoals = await Promise.all(
      h2hRes.data.response.map(async (f) => {
        const eventsRes = await axios.get(
          `${API_URL}/fixtures/events?fixture=${f.fixture.id}`,
          { headers: { "x-apisports-key": API_KEY } }
        );

        const goals = eventsRes.data.response
          .filter((ev) => ev.type === "Goal")
          .map((ev) => ({
            minute: ev.time.elapsed,
            scorer: ev.player.name,
            assist: ev.assist?.name || null,
            teamId: ev.team.id,
          }));

        return { ...f, goalscorers: goals };
      })
    );

    // ---- Últimos partidos ----
    const homeRecent = await axios.get(
      `${API_URL}/fixtures?team=${homeId}&last=5`,
      { headers: { "x-apisports-key": API_KEY } }
    );
    const awayRecent = await axios.get(
      `${API_URL}/fixtures?team=${awayId}&last=5`,
      { headers: { "x-apisports-key": API_KEY } }
    );

    // ---- Promedios ----
    const getAverages = async (fixtures) => {
      let total = { possession: 0, shots: 0, passes: 0 };
      let count = fixtures.length;

      for (const f of fixtures) {
        const statsRes = await axios.get(
          `${API_URL}/fixtures/statistics?fixture=${f.fixture.id}`,
          { headers: { "x-apisports-key": API_KEY } }
        );
        const teamStats = statsRes.data.response.find(
          (s) => s.team.id === f.teams.home.id || s.team.id === f.teams.away.id
        );

        if (teamStats) {
          total.possession += parseInt(
            teamStats.statistics.find((s) => s.type === "Ball Possession")
              ?.value || 0
          );
          total.shots += parseInt(
            teamStats.statistics.find((s) => s.type === "Total Shots")?.value ||
              0
          );
          total.passes += parseInt(
            teamStats.statistics.find((s) => s.type === "Passes Accurate")
              ?.value || 0
          );
        }
      }

      return {
        possession: (total.possession / count).toFixed(1),
        shots: (total.shots / count).toFixed(1),
        passes: (total.passes / count).toFixed(1),
      };
    };

    const homeAvg = await getAverages(homeRecent.data.response);
    const awayAvg = await getAverages(awayRecent.data.response);

    // ---- Top jugadores ----
    const homePlayers = await axios.get(
      `${API_URL}/players?team=${homeId}&season=${season}`,
      { headers: { "x-apisports-key": API_KEY } }
    );
    const awayPlayers = await axios.get(
      `${API_URL}/players?team=${awayId}&season=${season}`,
      { headers: { "x-apisports-key": API_KEY } }
    );

    const getTop = (players, type) =>
      players
        .map((p) => ({
          id: p.player.id,
          name: p.player.name,
          value:
            type === "goals"
              ? p.statistics[0].goals.total
              : p.statistics[0].goals.assists,
        }))
        .filter((p) => p.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);

    const topScorersHome = getTop(homePlayers.data.response, "goals");
    const topScorersAway = getTop(awayPlayers.data.response, "goals");
    const topAssistsHome = getTop(homePlayers.data.response, "assists");
    const topAssistsAway = getTop(awayPlayers.data.response, "assists");

    // ---- Armar objeto final ----
    const preMatchStats = {
      fixtureId,
      homeTeamId: homeId,
      awayTeamId: awayId,
      headToHead: headToHeadWithGoals,
      homeRecent: homeRecent.data.response,
      awayRecent: awayRecent.data.response,
      homeAverages: homeAvg,
      awayAverages: awayAvg,
      topScorers: { home: topScorersHome, away: topScorersAway },
      topAssisters: { home: topAssistsHome, away: topAssistsAway },
      lastUpdated: new Date(),
    };

    if (stats) {
      await PreMatchStats.updateOne({ fixtureId }, preMatchStats);
    } else {
      await PreMatchStats.create(preMatchStats);
    }

    return res.json({ status: "success", stats: preMatchStats });
  } catch (error) {
    console.error(error);
    return res.json({
      status: "error",
      message: "An error was found. Please, try again",
    });
  }
};

const getFixtureLineups = async (req, res) => {
  try {
    const { fixtureId } = req.params;

    // Buscar en DB
    let lineup = await Lineup.findOne({ fixtureId });
    if (lineup && new Date() - lineup.lastUpdated < 2 * 60 * 60 * 1000) {
      return res.json({ status: "success", lineup });
    }

    // Consultar API
    const apiRes = await axios.get(
      `${API_URL}/fixtures/lineups?fixture=${fixtureId}`,
      {
        headers: { "x-apisports-key": API_KEY },
      }
    );

    if (!apiRes.data.response || apiRes.data.response.length === 0) {
      return res.json({
        status: "not_found",
        message: "No hay alineaciones disponibles",
      });
    }

    const newLineup = {
      fixtureId: Number(fixtureId),
      lineups: apiRes.data.response.map((l) => ({
        team: {
          id: l.team.id,
          name: l.team.name,
          logo: l.team.logo,
          coach: {
            id: l.coach.id,
            name: l.coach.name,
            photo: l.coach.photo,
          },
          formation: l.formation,
        },
        startXI: l.startXI.map((p) => ({
          id: p.player.id,
          name: p.player.name,
          number: p.player.number,
          pos: p.player.pos,
          grid: p.player.grid,
        })),
        substitutes: l.substitutes.map((p) => ({
          id: p.player.id,
          name: p.player.name,
          number: p.player.number,
          pos: p.player.pos,
          grid: p.player.grid,
        })),
      })),
      lastUpdated: new Date(),
    };

    if (lineup) {
      await Lineup.updateOne({ fixtureId }, newLineup);
    } else {
      await Lineup.create(newLineup);
    }

    return res.json({ status: "success", lineup: newLineup });
  } catch (error) {
    return res.json({
      status: "error",
      message: "Error al obtener alineaciones",
    });
  }
};

function applySubstitutionsToTeam(team, events) {
  const start = [...team.startXI];
  const subs = [...team.substitutes];

  const subsEvents = events.filter((ev) => {
    const t = (ev.type || "").toLowerCase();
    const d = (ev.detail || "").toLowerCase();
    return t === "subst" || d.includes("substitution");
  });

  subsEvents.forEach((ev) => {
    const outId = ev?.player?.id;
    const inId = ev?.assist?.id;
    const inName = ev?.assist?.name || "Jugador";
    const outIndex = start.findIndex((p) => p.id === outId);

    // suplente que entra
    let subIn = subs.find((s) => s.id === inId);
    if (!subIn) {
      subIn = {
        id: inId || Math.floor(Math.random() * 1000000),
        name: inName,
        number: 0,
        pos: "",
        grid: "3:3",
      };
    }

    if (outIndex >= 0) {
      const grid = start[outIndex].grid || "3:3";
      start[outIndex] = { ...subIn, grid, isSub: true };
    } else {
      start.push({ ...subIn, grid: "3:3", isSub: true });
    }
  });

  return { ...team, startXI: start };
}

const getLiveMatch = async (req, res) => {
  try {
    const { fixtureId } = req.params;

    // 1) Ver si existe en DB
    const existing = await LiveMatch.findOne({ fixtureId: Number(fixtureId) });

    if (existing) {
      // Si ya terminó, devolver directamente lo que hay en DB
      if (existing.status?.short === "FT") {
        return res.json({ status: "success", live: existing });
      }

      // TTL: si fue actualizado hace <30s, devolver lo que hay
      if (Date.now() - new Date(existing.lastUpdated).getTime() < 30 * 1000) {
        return res.json({ status: "success", live: existing });
      }
    }

    // 2) Consultar fixture actual en la API
    const fixtureRes = await axios.get(`${API_URL}/fixtures?id=${fixtureId}`, {
      headers: { "x-apisports-key": API_KEY },
    });
    const fx = fixtureRes.data.response?.[0];
    if (!fx) {
      return res.json({
        status: "not_found",
        message: "Fixture no encontrado",
      });
    }

    // Si el fixture ya acabó y tenemos algo en DB, devolver lo que ya está guardado
    if (fx.fixture.status.short === "FT" && existing) {
      return res.json({ status: "success", live: existing });
    }

    // 3) Obtener info en vivo de API
    const [eventsRes, statsRes, lineupsRes] = await Promise.all([
      axios.get(`${API_URL}/fixtures/events?fixture=${fixtureId}`, {
        headers: { "x-apisports-key": API_KEY },
      }),
      axios.get(`${API_URL}/fixtures/statistics?fixture=${fixtureId}`, {
        headers: { "x-apisports-key": API_KEY },
      }),
      axios.get(`${API_URL}/fixtures/lineups?fixture=${fixtureId}`, {
        headers: { "x-apisports-key": API_KEY },
      }),
    ]);

    const events = eventsRes.data.response || [];
    const statistics = statsRes.data.response || [];
    const lineupsRaw = lineupsRes.data.response || [];

    // Normalizar lineups
    const lineups = lineupsRaw.map((l) => ({
      team: {
        id: l.team.id,
        name: l.team.name,
        logo: l.team.logo,
        coach: {
          id: l.coach?.id,
          name: l.coach?.name,
          photo: l.coach?.photo,
        },
        formation: l.formation,
      },
      startXI: (l.startXI || []).map((p) => ({
        id: p.player.id,
        name: p.player.name,
        number: p.player.number,
        pos: p.player.pos,
        grid: p.player.grid,
      })),
      substitutes: (l.substitutes || []).map((p) => ({
        id: p.player.id,
        name: p.player.name,
        number: p.player.number,
        pos: p.player.pos,
        grid: p.player.grid || "3:3",
      })),
    }));

    // Aplicar cambios de sustituciones
    let liveLineups = lineups;
    if (lineups.length === 2) {
      const homeId = fx.teams.home.id;
      const awayId = fx.teams.away.id;

      const homeIdx = lineups.findIndex((t) => t.team.id === homeId);
      const awayIdx = lineups.findIndex((t) => t.team.id === awayId);

      if (homeIdx >= 0) {
        liveLineups[homeIdx] = applySubstitutionsToTeam(
          lineups[homeIdx],
          events.filter((e) => e.team?.id === homeId)
        );
      }
      if (awayIdx >= 0) {
        liveLineups[awayIdx] = applySubstitutionsToTeam(
          lineups[awayIdx],
          events.filter((e) => e.team?.id === awayId)
        );
      }
    }

    // 4) Construir documento
    const liveDoc = {
      fixtureId: Number(fixtureId),
      league: {
        id: fx.league.id,
        name: fx.league.name,
        country: fx.league.country,
        logo: fx.league.logo,
        season: fx.league.season,
        round: fx.league.round,
      },
      status: {
        long: fx.fixture.status.long,
        short: fx.fixture.status.short,
        elapsed: fx.fixture.status.elapsed || 0,
      },
      teams: {
        home: {
          id: fx.teams.home.id,
          name: fx.teams.home.name,
          logo: fx.teams.home.logo,
        },
        away: {
          id: fx.teams.away.id,
          name: fx.teams.away.name,
          logo: fx.teams.away.logo,
        },
      },
      goals: {
        home: fx.goals.home ?? 0,
        away: fx.goals.away ?? 0,
      },
      events: events.map((e) => ({
        time: { elapsed: e.time?.elapsed, extra: e.time?.extra },
        team: { id: e.team?.id, name: e.team?.name, logo: e.team?.logo },
        player: { id: e.player?.id, name: e.player?.name },
        assist: { id: e.assist?.id, name: e.assist?.name },
        type: e.type,
        detail: e.detail,
        comments: e.comments,
      })),
      statistics: (statistics || []).map((s) => ({
        team: { id: s.team?.id, name: s.team?.name, logo: s.team?.logo },
        statistics: (s.statistics || []).map((it) => ({
          type: it.type,
          value: it.value,
        })),
      })),
      lineups: liveLineups,
      lastUpdated: new Date(),
    };

    // 5) Guardar en DB
    if (existing) {
      await LiveMatch.updateOne({ fixtureId: Number(fixtureId) }, liveDoc);
    } else {
      await LiveMatch.create(liveDoc);
    }

    return res.json({ status: "success", live: liveDoc });
  } catch (err) {
    return res.json({
      status: "error",
      message: "No se pudo obtener datos en vivo",
    });
  }
};

const getMatchesDay = async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // Fixtures del día ordenados por hora
    const fixturesToday = await Fixture.find({
      date: { $gte: startOfDay, $lte: endOfDay },
    })
      .sort({ date: 1 })
      .lean();

    const matches = [];

    for (const fixture of fixturesToday) {
      // 🔎 Aplicar el mismo filtro que en el cron
      const isPriority =
        PRIORITY_COUNTRIES.includes(fixture.league?.country) ||
        PRIORITY_TOURNAMENTS.some((name) =>
          fixture.league?.name.toLowerCase().includes(name.toLowerCase())
        );
      if (!isPriority) continue;

      // Buscar si ya está en LiveMatch
      let match = await LiveMatch.findOne({
        fixtureId: fixture.fixtureId,
      }).lean();

      // Si no existe → próximo partido (pero priority)
      if (!match) {
        match = buildLiveMatchFromFixture(fixture);
      }

      matches.push(match);
    }

    return res.json({
      status: "success",
      matches,
    });
  } catch (error) {
    console.error("❌ Error en getMatchesDay:", error);
    return res.status(500).json({
      status: "error",
      message: "An error was found. Please, try again!",
    });
  }
};

// --- Helper: construye un objeto LiveMatch “vacío” desde Fixture ---
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
    events: [], // sin eventos porque no ha empezado
    statistics: [], // sin estadísticas porque no ha empezado
    lineups: [], // sin alineaciones aún
    lastUpdated: new Date(),
  };
}

module.exports = {
  getNextFixture,
  getPreviousFixturesByTeam,
  getFixturesLeague,
  getFixtureById,
  getPreMatchStats,
  getFixtureLineups,
  getLiveMatch,
  getMatchesDay,
};
