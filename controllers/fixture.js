const axios = require("axios");
const Fixture = require("../models/fixture");
const PreMatchStats = require("../models/PreMatchStats");
const Lineup = require("../models/Lineup.js");
const LiveMatch = require("../models/LiveMatch.js");
const {
  PRIORITY_COUNTRIES,
  PRIORITY_TOURNAMENTS,
} = require("../data/leaguesPriority");
require("dotenv").config();
const dayjs = require("dayjs");
const { getCurrentSeason } = require("../helper/getCurrentSeason.js");

const FINISHED_SHORT = ["FT", "AET", "PEN", "AWD", "WO"];
const CANCELLED_SHORT = ["CANC", "ABD"];
const POSTPONED_SHORT = ["PST", "SUSP", "INT"];
const LIVE_SHORT = ["1H", "HT", "2H", "ET", "BT", "P", "LIVE"];

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_URL = process.env.API_URL;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getNextFixture = async (req, res) => {
  const { teamId } = req.params;

  if (!teamId || isNaN(Number(teamId))) {
    return res.json({
      status: "error",
      message: "Invalid teamId",
    });
  }

  try {
    const now = new Date();

    // 🟢 1️⃣ Buscar en BD el próximo partido FUTURO del equipo
    const existingFixture = await Fixture.findOne({
      $or: [
        { "teams.home.id": Number(teamId) },
        { "teams.away.id": Number(teamId) },
      ],
      "fixture.date": { $gte: now },
    })
      .sort({ "fixture.date": 1 })
      .lean();

    if (existingFixture) {
      return res.json({
        status: "success",
        from: "database",
        fixture: existingFixture,
      });
    }

    // 🟠 2️⃣ Si no está en la BD, consultar API-Football
    const response = await axios.get(`${API_URL}/fixtures`, {
      params: {
        team: teamId,
        next: 1, // pide el siguiente partido del equipo
      },
      headers: {
        "x-apisports-key": API_KEY,
      },
    });

    const fixture = response.data?.response?.[0];

    if (!fixture) {
      return res.json({
        status: "error",
        message: "No se encontró un próximo partido para este equipo",
      });
    }

    // 🔍 3️⃣ Validar que sea una fecha futura (a veces la API devuelve partido actual)
    const fixtureDate = new Date(fixture.fixture.date);
    if (fixtureDate < now) {
      return res.json({
        status: "error",
        message: "No hay partidos futuros disponibles",
      });
    }

    // 🧠 4️⃣ Evitar duplicados
    const exists = await Fixture.exists({ fixtureId: fixture.fixture.id });
    if (!exists) {
      await Fixture.create({
        fixtureId: fixture.fixture.id,
        date: fixture.fixture.date,
        timestamp: fixture.fixture.timestamp,
        referee: fixture.fixture.referee,
        venue: {
          id: fixture.fixture.venue?.id || null,
          name: fixture.fixture.venue?.name || "",
          city: fixture.fixture.venue?.city || "",
        },
        league: {
          id: fixture.league.id,
          name: fixture.league.name,
          country: fixture.league.country,
          logo: fixture.league.logo,
          round: fixture.league.round,
          season: fixture.league.season,
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
        goals: fixture.goals,
        status: fixture.fixture.status,
        lastUpdated: new Date(),
      });
    }

    // ✅ 5️⃣ Responder con el fixture obtenido
    return res.json({
      status: "success",
      from: "api",
      fixture,
    });
  } catch (error) {
    console.error("❌ Error en getNextFixture:", error.message);
    return res.json({
      status: "error",
      message: "Error al obtener el siguiente partido",
    });
  }
};

const getPreviousFixturesByTeam = async (req, res) => {
  const teamId = Number(req.params.teamId);
  let season = Number(req.params.season);

  if (season === 0) {
    season = await getCurrentSeason({ teamId: teamId });
  }

  if (!teamId || !season) {
    return res.json({ status: "error", message: "Invalid teamId or season" });
  }

  try {
    // 1) último terminado en BD (para decidir refresco)
    const lastStored = await Fixture.findOne({
      $or: [{ "teams.home.id": teamId }, { "teams.away.id": teamId }],
      "league.season": season,
      "status.short": { $in: FINISHED_SHORT },
    })
      .sort({ "fixture.date": -1 })
      .lean();

    const now = dayjs();
    const lastDate = lastStored
      ? dayjs(lastStored.fixture?.date || lastStored.date)
      : null;
    const shouldUpdate = !lastStored || now.diff(lastDate, "day") > 3; // ← ajustable

    // 2) refrescar desde API si corresponde
    if (shouldUpdate) {
      const { data } = await axios.get(`${API_URL}/fixtures`, {
        headers: { "x-apisports-key": API_KEY },
        params: { team: teamId, season },
      });

      const fixtures = data?.response || [];

      // preparar operaciones en bulk (upsert por fixtureId)
      const ops = fixtures.map((f) => {
        const doc = {
          fixtureId: f.fixture.id,
          // normaliza estructura con nodo fixture
          fixture: {
            id: f.fixture.id,
            date: f.fixture.date,
            timestamp: f.fixture.timestamp,
            referee: f.fixture.referee || null,
            venue: {
              id: f.fixture.venue?.id || null,
              name: f.fixture.venue?.name || "",
              city: f.fixture.venue?.city || "",
            },
            status: {
              long: f.fixture.status?.long || "",
              short: f.fixture.status?.short || "",
              elapsed: f.fixture.status?.elapsed ?? null,
            },
          },
          // liga
          league: {
            id: f.league.id,
            name: f.league.name,
            country: f.league.country,
            logo: f.league.logo,
            round: f.league.round,
            season: f.league.season,
          },
          // equipos
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
          lastUpdated: new Date(),
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

    // 3) consultar terminados (pasados), orden descendente por fecha
    const finishedFixtures = await Fixture.find({
      $or: [{ "teams.home.id": teamId }, { "teams.away.id": teamId }],
      "league.season": season,
      "status.short": { $in: FINISHED_SHORT },
    })
      .sort({ "fixture.date": -1 })
      .lean();

    // 4) consultar próximos (futuros o en vivo), orden ascendente por fecha
    const upcomingFixtures = await Fixture.find({
      $or: [{ "teams.home.id": teamId }, { "teams.away.id": teamId }],
      "league.season": season,
      $or: [
        // futuros (fecha/ts a partir de ahora)
        { "fixture.date": { $gte: new Date() } },
        { "fixture.timestamp": { $gte: Math.floor(Date.now() / 1000) } },
        // o en vivo (independiente de fecha por seguridad)
        { "fixture.status.short": { $in: LIVE_SHORT } },
        // o pospuestos (sigue siendo próximo en práctica)
        { "fixture.status.short": { $in: POSTPONED_SHORT } },
      ],
      // excluye definitivamente cancelados del listado de próximos
      "fixture.status.short": { $nin: CANCELLED_SHORT },
    })
      .sort({ "fixture.date": 1 })
      .lean();

    return res.json({
      status: "success",
      refreshed: shouldUpdate, // útil para logs/UX
      pastFixtures: finishedFixtures,
      upcomingFixtures,
    });
  } catch (error) {
    console.error(
      "getPreviousFixturesByTeam error:",
      error?.response?.data || error
    );
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

  if (season === 0) {
    season = await getCurrentSeason({ teamId: teamId });
  }

  try {
    // 1️⃣ Buscar último fixture actualizado en la liga
    const lastStored = await Fixture.findOne({
      leagueId,
      season,
    }).sort({ lastUpdated: -1 });

    const now = dayjs();
    const lastUpdate = lastStored ? dayjs(lastStored.lastUpdated) : null;

    // 2️⃣ Detectar si hay partidos activos o del día
    const activeFixtures = await Fixture.find({
      leagueId,
      season,
      "status.short": { $in: [...LIVE_SHORT, ...POSTPONED_SHORT] },
    });

    const hasLiveOrToday = activeFixtures.some((f) =>
      dayjs(f.date).isSame(now, "day")
    );

    // 3️⃣ Calcular si se debe actualizar
    const hoursDiff = lastUpdate ? now.diff(lastUpdate, "hour") : Infinity;
    const shouldUpdate =
      !lastStored ||
      (hasLiveOrToday && hoursDiff >= 0.08) || // 5 minutos
      (!hasLiveOrToday && hoursDiff >= 6); // 6 horas

    if (shouldUpdate) {
      console.log(
        `🔁 Actualizando fixtures de la liga ${leagueId} (${season})...`
      );

      const response = await axios.get(`${API_URL}/fixtures`, {
        params: { league: leagueId, season },
        headers: { "x-apisports-key": API_KEY },
      });

      const fixtures = response.data.response || [];
      if (!fixtures.length) {
        return res.json({
          status: "error",
          message: "No se encontraron partidos para esta liga",
        });
      }

      // 🔄 Actualización optimizada (sin borrar DB)
      const ops = fixtures.map((f) => ({
        updateOne: {
          filter: { fixtureId: f.fixture.id },
          update: {
            $set: {
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
                home: f.teams.home,
                away: f.teams.away,
              },
              goals: f.goals,
              league: {
                id: f.league.id,
                name: f.league.name,
                season: f.league.season,
                logo: f.league.logo,
                round: f.league.round,
              },
              lastUpdated: new Date(),
            },
          },
          upsert: true,
        },
      }));

      await Fixture.bulkWrite(ops, { ordered: false });
      console.log(
        `✅ Liga ${leagueId} actualizada (${fixtures.length} partidos)`
      );
    }

    // 4️⃣ Consultar desde DB — Partidos pasados, en vivo y próximos
    const finishedFixtures = await Fixture.find({
      leagueId,
      season,
      "status.short": { $in: FINISHED_SHORT },
    }).sort({ date: -1 });

    const liveFixtures = await Fixture.find({
      leagueId,
      season,
      "status.short": { $in: LIVE_SHORT },
    }).sort({ date: 1 });

    const upcomingFixtures = await Fixture.find({
      leagueId,
      season,
      "status.short": {
        $nin: [...FINISHED_SHORT, ...CANCELLED_SHORT],
      },
      date: { $gte: new Date() },
    }).sort({ date: 1 });

    const postponedFixtures = await Fixture.find({
      leagueId,
      season,
      "status.short": { $in: POSTPONED_SHORT },
    }).sort({ date: 1 });

    // 5️⃣ Responder al cliente
    return res.json({
      status: "success",
      updated: shouldUpdate,
      pastFixtures: finishedFixtures,
      liveFixtures,
      upcomingFixtures,
      postponedFixtures,
    });
  } catch (error) {
    console.error("❌ getFixturesLeague error:", error.message);
    return res.json({
      status: "error",
      message: "An error occurred while fetching fixtures",
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
    const now = dayjs();

    // 1️⃣ Buscar en DB
    let stats = await PreMatchStats.findOne({ fixtureId });

    // 2️⃣ Obtener fixture
    const fixtureRes = await axios.get(`${API_URL}/fixtures`, {
      headers: { "x-apisports-key": API_KEY },
      params: { id: fixtureId },
    });

    const fixture = fixtureRes.data?.response?.[0];
    if (!fixture) {
      return res.json({
        status: "error",
        message: "Fixture no encontrado",
      });
    }

    const fixtureDate = dayjs(fixture.fixture.date);
    const statusShort = fixture.fixture.status.short;
    const hoursUntil = fixtureDate.diff(now, "hour");

    // 3️⃣ Decidir frecuencia de actualización
    let maxAgeHours = 6;
    if (LIVE_SHORT.includes(statusShort)) maxAgeHours = 0.1; // cada 6 min
    else if (FINISHED_SHORT.includes(statusShort))
      maxAgeHours = Infinity; // no actualizar
    else if (hoursUntil <= 12) maxAgeHours = 1;
    else if (hoursUntil <= 48) maxAgeHours = 6;
    else maxAgeHours = 12;

    const lastUpdated = stats ? dayjs(stats.lastUpdated) : null;
    const shouldUpdate =
      !stats ||
      (maxAgeHours !== Infinity &&
        (!lastUpdated || now.diff(lastUpdated, "hour") >= maxAgeHours));

    // 4️⃣ Si no debe actualizar, devolver existente
    if (!shouldUpdate && stats) {
      return res.json({ status: "success", updated: false, stats });
    }

    // 5️⃣ Si ya terminó y no hay datos previos
    if (FINISHED_SHORT.includes(statusShort) && !stats) {
      return res.json({
        status: "not_found",
        message: "El partido ya terminó y no hay estadísticas previas",
      });
    }

    // 6️⃣ IDs base
    const homeId = fixture.teams.home.id;
    const awayId = fixture.teams.away.id;
    const season = fixture.league.season;

    // ---- HEAD TO HEAD ----
    const h2hRes = await axios.get(`${API_URL}/fixtures/headtohead`, {
      headers: { "x-apisports-key": API_KEY },
      params: { h2h: `${homeId}-${awayId}` },
    });

    const headToHeadWithGoals = [];
    for (const f of h2hRes.data.response) {
      await sleep(500); // espera medio segundo entre peticiones
      const evRes = await axios.get(`${API_URL}/fixtures/events`, {
        headers: { "x-apisports-key": API_KEY },
        params: { fixture: f.fixture.id },
      });
      const goals = evRes.data.response
        .filter((e) => e.type === "Goal")
        .map((e) => ({
          minute: e.time.elapsed,
          scorer: e.player.name,
          assist: e.assist?.name || null,
          teamId: e.team.id,
        }));
      headToHeadWithGoals.push({ ...f, goalscorers: goals });
    }

    // ---- ÚLTIMOS PARTIDOS ----
    await sleep(500);
    const homeRecent = await axios.get(`${API_URL}/fixtures`, {
      headers: { "x-apisports-key": API_KEY },
      params: { team: homeId, last: 5 },
    });

    await sleep(500);
    const awayRecent = await axios.get(`${API_URL}/fixtures`, {
      headers: { "x-apisports-key": API_KEY },
      params: { team: awayId, last: 5 },
    });

    // ---- PROMEDIOS ----
    const getAverages = async (fixtures) => {
      let total = { possession: 0, shots: 0, passes: 0 };
      let count = fixtures.length || 1;

      for (const f of fixtures) {
        await sleep(400); // evitar rate limit
        const sRes = await axios.get(`${API_URL}/fixtures/statistics`, {
          headers: { "x-apisports-key": API_KEY },
          params: { fixture: f.fixture.id },
        });

        const stat = sRes.data.response?.[0]?.statistics || [];
        const poss = parseInt(
          (
            stat.find((s) => s.type === "Ball Possession")?.value || "0"
          ).replace("%", "")
        );
        const shots = parseInt(
          stat.find((s) => s.type === "Total Shots")?.value || "0"
        );
        const passes = parseInt(
          stat.find((s) => s.type === "Passes Accurate")?.value || "0"
        );

        total.possession += poss;
        total.shots += shots;
        total.passes += passes;
      }

      return {
        possession: (total.possession / count).toFixed(1),
        shots: (total.shots / count).toFixed(1),
        passes: (total.passes / count).toFixed(1),
      };
    };

    const homeAvg = await getAverages(homeRecent.data.response);
    const awayAvg = await getAverages(awayRecent.data.response);

    // ---- JUGADORES DESTACADOS ----
    await sleep(500);
    const homePlayers = await axios.get(`${API_URL}/players`, {
      headers: { "x-apisports-key": API_KEY },
      params: { team: homeId, season },
    });

    await sleep(500);
    const awayPlayers = await axios.get(`${API_URL}/players`, {
      headers: { "x-apisports-key": API_KEY },
      params: { team: awayId, season },
    });

    const getTop = (players, key) =>
      players
        .map((p) => ({
          id: p.player.id,
          name: p.player.name,
          value:
            key === "goals"
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

    // ---- OBJETO FINAL ----
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

    return res.json({
      status: "success",
      updated: shouldUpdate,
      stats: preMatchStats,
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
    const { fixtureId } = req.params;
    const now = dayjs();

    // 1️⃣ Buscar en DB
    let lineup = await Lineup.findOne({ fixtureId });

    // 2️⃣ Obtener fixture desde API
    const fixtureRes = await axios.get(`${API_URL}/fixtures`, {
      headers: { "x-apisports-key": API_KEY },
      params: { id: fixtureId },
    });

    const fixture = fixtureRes.data?.response?.[0];
    if (!fixture) {
      return res.json({ status: "error", message: "Fixture no encontrado" });
    }

    const fixtureDate = dayjs(fixture.fixture.date);
    const statusShort = fixture.fixture.status.short;
    const hoursUntil = fixtureDate.diff(now, "hour");

    // 3️⃣ Calcular tiempo de actualización según estado
    let maxAgeHours = 6;
    if (LIVE_SHORT.includes(statusShort)) maxAgeHours = 0.1; // cada 6 min
    else if (FINISHED_SHORT.includes(statusShort))
      maxAgeHours = Infinity; // no actualizar
    else if (hoursUntil <= 3) maxAgeHours = 0.5; // 30 min antes del partido
    else if (hoursUntil <= 24) maxAgeHours = 3; // dentro del día → cada 3h
    else maxAgeHours = 12; // partidos lejanos

    const lastUpdated = lineup ? dayjs(lineup.lastUpdated) : null;
    const shouldUpdate =
      !lineup ||
      (maxAgeHours !== Infinity &&
        (!lastUpdated || now.diff(lastUpdated, "hour") >= maxAgeHours));

    // 4️⃣ Si no necesita actualizar, devolver lo que hay
    if (!shouldUpdate && lineup) {
      return res.json({ status: "success", updated: false, lineup });
    }

    // 5️⃣ Si el partido ya terminó y no hay alineaciones, salir
    if (FINISHED_SHORT.includes(statusShort) && !lineup) {
      return res.json({
        status: "not_found",
        message: "El partido ya terminó y no hay alineaciones",
      });
    }

    // 6️⃣ Obtener alineaciones desde API
    const apiRes = await axios.get(`${API_URL}/fixtures/lineups`, {
      headers: { "x-apisports-key": API_KEY },
      params: { fixture: fixtureId },
    });

    const response = apiRes.data.response;
    if (!response || response.length === 0) {
      return res.json({
        status: "not_found",
        message: "No hay alineaciones disponibles todavía",
      });
    }

    // 7️⃣ Procesar equipos secuencialmente (para no exceder límites)
    const enrichedLineups = [];
    for (const l of response) {
      // Consultar plantilla del equipo (squad)
      let squad = [];
      try {
        await sleep(400); // evitar rate-limit
        const squadRes = await axios.get(`${API_URL}/players/squads`, {
          headers: { "x-apisports-key": API_KEY },
          params: { team: l.team.id },
        });
        squad = squadRes.data.response?.[0]?.players || [];
      } catch (err) {
        console.warn(
          `⚠️ Error al obtener plantilla del equipo ${l.team.name}:`,
          err.message
        );
      }

      // Crear mapa { playerId: photo }
      const photoMap = squad.reduce((acc, p) => {
        acc[p.id] = p.photo || "";
        return acc;
      }, {});

      const teamLineup = {
        team: {
          id: l.team.id,
          name: l.team.name,
          logo: l.team.logo,
          coach: {
            id: l.coach.id,
            name: l.coach.name,
            photo: l.coach.photo || "",
          },
          formation: l.formation,
        },
        startXI: l.startXI.map((p) => ({
          id: p.player.id,
          name: p.player.name,
          number: p.player.number,
          pos: p.player.pos,
          grid: p.player.grid,
          photo: photoMap[p.player.id] || "",
        })),
        substitutes: l.substitutes.map((p) => ({
          id: p.player.id,
          name: p.player.name,
          number: p.player.number,
          pos: p.player.pos,
          grid: p.player.grid,
          photo: photoMap[p.player.id] || "",
        })),
      };

      enrichedLineups.push(teamLineup);
    }

    // 8️⃣ Guardar/actualizar en DB
    const newLineup = {
      fixtureId: Number(fixtureId),
      lineups: enrichedLineups,
      lastUpdated: new Date(),
    };

    if (lineup) {
      await Lineup.updateOne({ fixtureId }, newLineup);
    } else {
      await Lineup.create(newLineup);
    }

    return res.json({
      status: "success",
      updated: shouldUpdate,
      lineup: newLineup,
    });
  } catch (error) {
    console.error(
      "❌ Error en getFixtureLineups:",
      error.response?.data || error.message
    );
    return res.json({
      status: "error",
      message: "Error al obtener alineaciones o fotos de jugadores",
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
    const id = Number(fixtureId);

    if (isNaN(id)) {
      return res.json({ status: "error", message: "fixtureId inválido" });
    }

    // 1️⃣ Buscar en DB
    const live = await LiveMatch.findOne({ fixtureId: id }).lean();
    if (!live) {
      return res.json({
        status: "not_found",
        message: "No se encontró el partido en LiveMatch",
      });
    }

    // 2️⃣ Aplicar sustituciones
    let { lineups, events } = live;

    if (lineups?.length === 2 && events?.length) {
      const homeId = live.teams.home.id;
      const awayId = live.teams.away.id;

      const homeIdx = lineups.findIndex((t) => t.team.id === homeId);
      const awayIdx = lineups.findIndex((t) => t.team.id === awayId);

      if (homeIdx >= 0) {
        lineups[homeIdx] = applySubstitutionsToTeam(
          lineups[homeIdx],
          events.filter((e) => e.team?.id === homeId)
        );
      }
      if (awayIdx >= 0) {
        lineups[awayIdx] = applySubstitutionsToTeam(
          lineups[awayIdx],
          events.filter((e) => e.team?.id === awayId)
        );
      }
    }

    // 3️⃣ Ver si terminó
    const isFinished = ["FT", "AET", "PEN", "AWD", "WO"].includes(
      live.status?.short
    );

    return res.json({
      status: "success",
      live: { ...live, lineups },
      finished: isFinished,
      updatedAt: live.lastUpdated,
    });
  } catch (err) {
    console.error("❌ Error en getLiveMatch:", err.message);
    return res.json({
      status: "error",
      message: "Error al obtener datos del partido en vivo",
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
};
