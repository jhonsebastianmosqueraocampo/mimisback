const axios = require("axios");
const FriendlyStanding = require("../models/FriendlyStanding");
require("dotenv").config();

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_URL = process.env.API_URL;

const getFriendlyStandings = async (req, res) => {
  const teamId = parseInt(req.params.teamId, 10);
  const season = parseInt(req.params.season, 10);

  if (!teamId || isNaN(teamId)) {
    return res.status(400).json({ status: "error", message: "Invalid teamId" });
  }
  if (!season || isNaN(season)) {
    return res.status(400).json({ status: "error", message: "Invalid season" });
  }

  try {
    // Verificar si ya existen fixtures recientes en la base de datos
    const existingFixtures = await FriendlyStanding.find({
      $or: [{ "teams.home.id": teamId }, { "teams.away.id": teamId }],
      "league.season": season,
      "league.name": { $regex: /friendlies/i },
    }).sort({ date: 1 });

    const now = new Date();
    const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const recentlyUpdated = existingFixtures.some(
      (f) => f.lastUpdate > threeHoursAgo
    );

    if (existingFixtures.length > 0 && recentlyUpdated) {
      return res.json({
        status: "success",
        standings: existingFixtures,
      });
    }

    // Obtener datos desde la API externa
    const { data } = await axios.get(`${API_URL}/fixtures`, {
      headers: { "x-apisports-key": API_KEY },
      params: {
        team: teamId,
        season,
      },
    });

    const fixtures = data.response;

    // Filtrar los amistosos por nombre
    const friendlyFixtures = fixtures.filter((fixture) =>
      fixture.league.name.toLowerCase().includes("friendlies")
    );

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
            standings: league.standings,
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
    }

    // Consultar de nuevo tras actualizar/insertar
    const updatedFixtures = await FriendlyStanding.find({
      $or: [{ "teams.home.id": teamId }, { "teams.away.id": teamId }],
      "league.season": season,
      "league.name": { $regex: /friendlies/i },
    }).sort({ date: 1 });

    res.json({
      status: "success",
      standings: updatedFixtures,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "An error was found. Please, try again",
    });
  }
};

module.exports = { getFriendlyStandings };