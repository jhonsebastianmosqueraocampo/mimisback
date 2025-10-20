const axios = require("axios");
const GroupStanding = require("../models/groupStanding");
const CupStanding = require("../models/cupStanding");
const { getCurrentSeason } = require("../helper/getCurrentSeason");
require("dotenv").config();

const API_URL = process.env.API_URL;
const API_KEY = process.env.API_FOOTBALL_KEY;

// 🕒 Función auxiliar para obtener intervalo de refresco dinámico
const getRefreshInterval = (hasLiveMatches) => {
  return hasLiveMatches ? 5 * 60 * 1000 : 2 * 60 * 60 * 1000; // 5 min o 2h
};

const getCupStandings = async (req, res) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  let season = parseInt(req.params.season, 10);

  if (season === 0) {
    season = await getCurrentSeason({ leagueId: leagueId });
  }

  if (isNaN(leagueId) || !leagueId || isNaN(season) || !season) {
    return res.status(400).json({
      status: "error",
      message: "Invalid leagueId or season",
    });
  }

  try {
    const now = new Date();

    // Buscar la última actualización guardada
    const latestGroup = await GroupStanding.findOne({ leagueId, season }).sort({
      lastUpdate: -1,
    });
    const latestFixture = await CupStanding.findOne({ leagueId, season }).sort({
      lastUpdate: -1,
    });

    // 🟢 Detectar si hay partidos en vivo (para dar prioridad)
    const hasLiveMatches = await CupStanding.exists({
      leagueId,
      season,
      status: { $in: ["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT"] },
    });

    const REFRESH_INTERVAL = getRefreshInterval(hasLiveMatches);

    const groupRecent =
      latestGroup && now - latestGroup.lastUpdate < REFRESH_INTERVAL;
    const fixtureRecent =
      latestFixture && now - latestFixture.lastUpdate < REFRESH_INTERVAL;

    // ⚡ Si los datos son recientes, no llamar a la API
    if (groupRecent && fixtureRecent) {
      const groupPhase = await GroupStanding.find({ leagueId, season });
      const knockoutPhase = await CupStanding.find({ leagueId, season });
      return res.json({
        status: "success",
        hasGroupPhase: groupPhase.length > 0,
        groupPhase,
        knockoutPhase,
        updated: false, // indicador de que no se actualizó desde la API
      });
    }

    // 🏆 Obtener standings (fase de grupos)
    const standingsRes = await axios.get(`${API_URL}/standings`, {
      headers: { "x-apisports-key": API_KEY },
      params: { league: leagueId, season },
    });

    const standingsData = standingsRes.data.response;
    let groupPhase = [];

    if (
      standingsData.length > 0 &&
      Array.isArray(standingsData[0].league.standings)
    ) {
      const allGroups = standingsData[0].league.standings.flat();
      if (allGroups.length > 0) {
        groupPhase = allGroups;

        for (const team of allGroups) {
          await GroupStanding.updateOne(
            {
              leagueId,
              season,
              group: team.group,
              "team.id": team.team.id,
            },
            {
              leagueId,
              season,
              group: team.group,
              team: {
                id: team.team.id,
                name: team.team.name,
                logo: team.team.logo,
              },
              rank: team.rank,
              points: team.points,
              all: team.all,
              lastUpdate: now,
            },
            { upsert: true }
          );
        }
      }
    }

    // 🧩 Obtener fixtures (fase eliminatoria)
    const fixturesRes = await axios.get(`${API_URL}/fixtures`, {
      headers: { "x-apisports-key": API_KEY },
      params: { league: leagueId, season },
    });

    const fixtures = fixturesRes.data.response;

    for (const fixture of fixtures) {
      const matchData = {
        leagueId: fixture.league.id,
        season: fixture.league.season,
        round: fixture.league.round,
        date: fixture.fixture.date,
        homeTeam: {
          id: fixture.teams.home.id,
          name: fixture.teams.home.name,
          logo: fixture.teams.home.logo,
        },
        awayTeam: {
          id: fixture.teams.away.id,
          name: fixture.teams.away.name,
          logo: fixture.teams.away.logo,
        },
        goals: fixture.goals,
        score: fixture.score,
        status: fixture.fixture.status.short,
        lastUpdate: now,
      };

      await CupStanding.updateOne(
        {
          leagueId,
          season,
          round: fixture.league.round,
          "homeTeam.id": fixture.teams.home.id,
          "awayTeam.id": fixture.teams.away.id,
        },
        matchData,
        { upsert: true }
      );
    }

    // 🔁 Consultar datos actualizados desde la DB
    const knockoutPhase = await CupStanding.find({ leagueId, season });
    const groupPhaseFinal =
      groupPhase.length > 0
        ? await GroupStanding.find({ leagueId, season })
        : [];

    return res.json({
      status: "success",
      hasGroupPhase: groupPhaseFinal.length > 0,
      groupPhase: groupPhaseFinal,
      knockoutPhase,
      updated: true, // indicador de que sí se actualizó desde la API
      refreshInterval: hasLiveMatches ? "5m" : "2h", // info útil para logs o frontend
    });
  } catch (error) {
    console.error("Error in getCupStandings:", error?.response?.data || error);
    return res.json({
      status: "error",
      message: "An error was found. Please, try again!",
    });
  }
};

module.exports = { getCupStandings };
