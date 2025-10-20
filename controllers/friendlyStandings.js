const axios = require("axios");
const FriendlyStanding = require("../models/FriendlyStanding");
const { getCurrentSeason } = require("../helper/getCurrentSeason.js");
require("dotenv").config();

const API_URL = process.env.API_URL;
const API_KEY = process.env.API_FOOTBALL_KEY;

const FINISHED_SHORT = ["FT", "AET", "PEN", "AWD", "WO"];
const LIVE_SHORT = ["1H", "HT", "2H", "ET", "BT", "P", "LIVE"];
const POSTPONED_SHORT = ["PST", "SUSP", "INT"];

const getFriendlyStandings = async (req, res) => {
  const teamId = parseInt(req.params.teamId, 10);
  let season = parseInt(req.params.season, 10);

  if (!teamId || isNaN(teamId)) {
    return res.status(400).json({ status: "error", message: "Invalid teamId" });
  }
  if (!season || isNaN(season)) {
    return res.status(400).json({ status: "error", message: "Invalid season" });
  }

  if (season === 0) {
    season = await getCurrentSeason({ teamId: teamId });
  }

  try {
    // 1️⃣ Buscar en BD los amistosos existentes
    const existingFixtures = await FriendlyStanding.find({
      $or: [{ "teams.home.id": teamId }, { "teams.away.id": teamId }],
      "league.season": season,
      "league.name": { $regex: /friendlies/i },
    }).sort({ date: 1 });

    const now = dayjs();
    const lastUpdate = existingFixtures[0]?.lastUpdate
      ? dayjs(existingFixtures[0].lastUpdate)
      : null;

    // 2️⃣ Determinar estado de actividad
    const hasLive = existingFixtures.some((f) =>
      LIVE_SHORT.includes(f.status?.short)
    );
    const hasToday = existingFixtures.some((f) =>
      dayjs(f.date).isSame(now, "day")
    );

    // 3️⃣ Calcular cada cuánto actualizar
    let maxAgeHours = 12;
    if (hasLive) maxAgeHours = 0.1; // cada 6 minutos
    else if (hasToday) maxAgeHours = 2; // partidos del día
    else maxAgeHours = 12; // sin actividad

    const shouldUpdate =
      !existingFixtures.length ||
      !lastUpdate ||
      now.diff(lastUpdate, "hour") >= maxAgeHours;

    // 4️⃣ Si no requiere actualización, devolver BD
    if (!shouldUpdate && existingFixtures.length > 0) {
      return res.json({
        status: "success",
        updated: false,
        standings: existingFixtures,
      });
    }

    // 5️⃣ Obtener desde la API
    const { data } = await axios.get(`${API_URL}/fixtures`, {
      headers: { "x-apisports-key": API_KEY },
      params: {
        team: teamId,
        season,
      },
    });

    const fixtures = data.response || [];

    // 6️⃣ Filtrar amistosos
    const friendlyFixtures = fixtures.filter((fixture) =>
      fixture.league.name.toLowerCase().includes("friendlies")
    );

    // 7️⃣ Guardar/actualizar en DB de forma secuencial
    for (const fixture of friendlyFixtures) {
      const { fixture: f, league, teams, goals, score } = fixture;

      await FriendlyStanding.findOneAndUpdate(
        { fixtureId: f.id },
        {
          fixtureId: f.id,
          referee: f.referee,
          timezone: f.timezone,
          date: f.date,
          timestamp: f.timestamp,
          periods: f.periods,
          venue: {
            id: f.venue?.id,
            name: f.venue?.name,
            city: f.venue?.city,
          },
          status: {
            long: f.status?.long,
            short: f.status?.short,
            elapsed: f.status?.elapsed,
            extra: f.status?.extra ?? null,
          },
          league: {
            id: league.id,
            name: league.name,
            country: league.country,
            logo: league.logo,
            flag: league.flag,
            season: league.season,
            round: league.round,
          },
          teams,
          goals,
          score: {
            halftime: score.halftime || {},
            fulltime: score.fulltime || {},
            extratime: score.extratime || {},
            penalty: score.penalty || {},
          },
          lastUpdate: new Date(),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      // pequeño delay opcional (para seguridad frente al rate limit)
      await new Promise((r) => setTimeout(r, 250));
    }

    // 8️⃣ Consultar de nuevo tras actualizar
    const updatedFixtures = await FriendlyStanding.find({
      $or: [{ "teams.home.id": teamId }, { "teams.away.id": teamId }],
      "league.season": season,
      "league.name": { $regex: /friendlies/i },
    }).sort({ date: 1 });

    res.json({
      status: "success",
      updated: true,
      standings: updatedFixtures,
    });
  } catch (error) {
    console.error("❌ getFriendlyStandings error:", error.message);
    res.status(500).json({
      status: "error",
      message: "Error al obtener amistosos. Intenta nuevamente.",
    });
  }
};

module.exports = { getFriendlyStandings };
