const axios = require("axios");
const { getCurrentSeason } = require("../helper/getCurrentSeason.js");
const TeamSummary = require("../models/teamSummary");
require("dotenv").config();

const API_URL = process.env.API_URL;
const API_KEY = process.env.API_FOOTBALL_KEY;

const getTeamSummary = async (req, res) => {
  try {
    const { leagueId, teamId } = req.params;
    let { season } = req.params;

    if (!leagueId || !teamId || !season) {
      return res.status(400).json({
        success: false,
        message:
          "Parámetros requeridos: leagueId, teamId y season son requeridos",
      });
    }

    if (season === 0) {
      season = await getCurrentSeason({ leagueId: leagueId });
    }

    // 1️⃣ Verificar si ya existe y fue actualizado hace menos de 1h
    const existing = await TeamSummary.findOne({ leagueId, teamId, season });
    if (
      existing &&
      Date.now() - existing.lastUpdated.getTime() < 60 * 60 * 1000
    ) {
      return res.json({ status: "success", summary: existing });
    }

    // 2️⃣ Obtener standings
    let standing = null;
    try {
      const standingsRes = await axios.get(`${API_URL}/standings`, {
        headers: { "x-apisports-key": API_KEY },
        params: { league: leagueId, season },
      });

      const leagueData = standingsRes.data.response?.[0]?.league;
      standing = leagueData?.standings?.[0]?.find(
        (t) => t.team.id === Number(teamId)
      );
    } catch (err) {
      console.warn("⚠️ No se pudo obtener standings:", err.message);
    }

    // 3️⃣ Jugador clave (mejorado)
    let topPlayer = null;
    try {
      const playersRes = await axios.get(`${API_URL}/players`, {
        headers: { "x-apisports-key": API_KEY },
        params: { team: teamId, league: leagueId, season },
      });

      const players = playersRes.data.response || [];

      if (players.length > 0) {
        const scoredPlayers = players.map((p) => {
          const stats = p.statistics?.[0];
          const goals = stats?.goals?.total || 0;
          const assists = stats?.goals?.assists || 0;
          const games = stats?.games?.appearences || 0;
          const rating = parseFloat(stats?.games?.rating) || 0;

          // Cálculo ponderado de impacto
          const score = goals * 4 + assists * 3 + rating * 2 + games * 0.1;

          return {
            id: p.player.id,
            name: p.player.name,
            photo: p.player.photo,
            goals,
            assists,
            rating,
            games,
            score,
          };
        });

        // Ordenar por score total
        scoredPlayers.sort((a, b) => b.score - a.score);
        topPlayer = scoredPlayers[0];
      }
    } catch (err) {
      console.warn("⚠️ No se pudo calcular jugador clave:", err.message);
    }

    // 4️⃣ Próximo partido
    let nextMatch = null;
    try {
      const nextFixtureRes = await axios.get(`${API_URL}/fixtures`, {
        headers: { "x-apisports-key": API_KEY },
        params: { team: teamId, league: leagueId, season, next: 1 },
      });

      const nextFixture = nextFixtureRes.data.response?.[0];
      if (nextFixture) {
        nextMatch = {
          opponent:
            nextFixture.teams.home.id === Number(teamId)
              ? nextFixture.teams.away.name
              : nextFixture.teams.home.name,
          date: nextFixture.fixture.date,
          home: nextFixture.teams.home.id === Number(teamId),
        };
      }
    } catch (err) {
      console.warn("⚠️ No se pudo obtener el próximo partido:", err.message);
    }

    // 5️⃣ Forma reciente
    let recentForm = [];
    try {
      const lastMatchesRes = await axios.get(`${API_URL}/fixtures`, {
        headers: { "x-apisports-key": API_KEY },
        params: { team: teamId, league: leagueId, season, last: 5 },
      });

      recentForm = lastMatchesRes.data.response.map((f) => {
        const isHome = f.teams.home.id === Number(teamId);
        const win =
          (isHome && f.goals.home > f.goals.away) ||
          (!isHome && f.goals.away > f.goals.home);
        const draw = f.goals.home === f.goals.away;
        return win ? "W" : draw ? "D" : "L";
      });
    } catch (err) {
      console.warn("⚠️ No se pudo obtener recentForm:", err.message);
    }

    // 6️⃣ Progreso de temporada
    let seasonProgress = [];
    try {
      const fixturesRes = await axios.get(`${API_URL}/fixtures`, {
        headers: { "x-apisports-key": API_KEY },
        params: { team: teamId, league: leagueId, season },
      });

      const finishedFixtures = fixturesRes.data.response
        .filter((f) => ["FT", "AET", "PEN"].includes(f.fixture.status.short))
        .sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date));

      let totalPoints = 0;
      for (const [i, f] of finishedFixtures.entries()) {
        const isHome = f.teams.home.id === Number(teamId);
        const win =
          (isHome && f.goals.home > f.goals.away) ||
          (!isHome && f.goals.away > f.goals.home);
        const draw = f.goals.home === f.goals.away;

        if (win) totalPoints += 3;
        else if (draw) totalPoints += 1;

        seasonProgress.push({
          matchday: i + 1,
          points: totalPoints,
          opponent: isHome ? f.teams.away.name : f.teams.home.name,
          result: win ? "W" : draw ? "D" : "L",
          score: `${f.goals.home}-${f.goals.away}`,
          date: f.fixture.date,
          position: standing?.rank || null,
        });
      }
    } catch (err) {
      console.warn("⚠️ No se pudo calcular seasonProgress:", err.message);
    }

    // 7️⃣ Crear objeto final
    const summaryData = {
      leagueId: Number(leagueId),
      teamId: Number(teamId),
      season: Number(season),
      name: standing?.team?.name || "Desconocido",
      logoUrl: standing?.team?.logo || null,
      position: standing?.rank || 0,
      points: standing?.points || 0,
      played: standing?.all?.played || 0,
      wins: standing?.all?.win || 0,
      draws: standing?.all?.draw || 0,
      losses: standing?.all?.lose || 0,
      goalsFor: standing?.all?.goals?.for || 0,
      goalsAgainst: standing?.all?.goals?.against || 0,
      recentForm,
      topPlayer: topPlayer
        ? {
            name: topPlayer.name,
            photo: topPlayer.photo,
            goals: topPlayer.goals,
            assists: topPlayer.assists,
            rating: topPlayer.rating,
            games: topPlayer.games,
          }
        : null,
      nextMatch,
      seasonProgress,
      lastUpdated: new Date(),
    };

    // 8️⃣ Guardar o actualizar
    const saved = await TeamSummary.findOneAndUpdate(
      { leagueId, teamId, season },
      { $set: summaryData },
      { upsert: true, new: true }
    );

    return res.json({ status: "success", summary: saved });
  } catch (err) {
    console.error("❌ Error en getTeamSummary:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Error interno del servidor",
    });
  }
};

module.exports = {
  getTeamSummary,
};
