const axios = require("axios");
const { getCurrentSeason } = require("../helper/getCurrentSeason.js");
const TeamSummary = require("../models/teamSummary");
const ApiFootballCall = require("../models/apifootballCals.js");
require("dotenv").config();

const API_URL = process.env.API_URL;
const API_KEY = process.env.API_FOOTBALL_KEY;

const getTeamSummary = async (req, res) => {
  try {
    const { leagueId, teamId } = req.params;
    let { season } = req.params;

    const userId = req.user?.id || null;

    if (
      isNaN(Number(leagueId)) ||
      !teamId ||
      isNaN(Number(teamId)) ||
      isNaN(Number(season))
    ) {
      return res.status(400).json({
        success: false,
        message: "Parámetros requeridos: leagueId, teamId y season son requeridos",
      });
    }

    if (Number(season) === 0) {
      season = await getCurrentSeason({ leagueId: Number(leagueId), userId });
    }

    // Helper para loguear (success/error)
    const logApiCall = async ({
      endpoint,
      start,
      response,
      error,
      source = "manual",
      costUnit = 1,
    }) => {
      try {
        if (response) {
          await ApiFootballCall.create({
            endpoint,
            method: "GET",
            source,
            user: userId,
            apiProvider: "api-football",
            costUnit,
            statusCode: response.status,
            success: true,
            responseTimeMs: Date.now() - start,
            remainingRequests:
              response.headers?.["x-ratelimit-requests-remaining"] ||
              response.headers?.["x-requests-remaining"] ||
              null,
          });
        } else {
          await ApiFootballCall.create({
            endpoint,
            method: "GET",
            source,
            user: userId,
            apiProvider: "api-football",
            costUnit,
            statusCode: error?.response?.status || 500,
            success: false,
            responseTimeMs: Date.now() - start,
            remainingRequests:
              error?.response?.headers?.["x-ratelimit-requests-remaining"] ||
              error?.response?.headers?.["x-requests-remaining"] ||
              null,
            errorMessage: error?.message || "Unknown error",
          });
        }
      } catch (e) {
        // No romper el flujo si falla el log
        console.warn("⚠️ No se pudo guardar ApiFootballCall:", e.message);
      }
    };

    // 1️⃣ Cache: verificar si ya existe y fue actualizado hace menos de 1h
    const existing = await TeamSummary.findOne({
      leagueId: Number(leagueId),
      teamId: Number(teamId),
      season: Number(season),
    });

    if (
      existing &&
      existing.lastUpdated &&
      Date.now() - existing.lastUpdated.getTime() < 60 * 60 * 1000
    ) {
      return res.json({ status: "success", summary: existing });
    }

    // 2️⃣ Standings
    let standing = null;
    try {
      const start = Date.now();
      const standingsRes = await axios.get(`${API_URL}/standings`, {
        headers: { "x-apisports-key": API_KEY },
        params: { league: leagueId, season },
      });

      await logApiCall({
        endpoint: "/standings",
        start,
        response: standingsRes,
      });

      const leagueData = standingsRes.data.response?.[0]?.league;
      standing = leagueData?.standings?.[0]?.find(
        (t) => t.team.id === Number(teamId)
      );
    } catch (err) {
      await logApiCall({
        endpoint: "/standings",
        start: Date.now(), // fallback si no capturaste start
        error: err,
      });
      console.warn("⚠️ No se pudo obtener standings:", err.message);
    }

    // 3️⃣ Jugador clave — Impact Score balanceado
    let topPlayer = null;
    try {
      const start = Date.now();
      const playersRes = await axios.get(`${API_URL}/players`, {
        headers: { "x-apisports-key": API_KEY },
        params: { team: teamId, league: leagueId, season },
      });

      await logApiCall({
        endpoint: "/players",
        start,
        response: playersRes,
      });

      const players = playersRes.data.response || [];
      if (players.length > 0) {
        const weights = {
          G: { saves: 2.0, cleanSheets: 3.0, rating: 1.2, games: 0.2 },
          D: { tackles: 1.5, duels: 1.0, passes: 0.5, rating: 1.2 },
          M: { assists: 2.0, passes: 1.0, duels: 0.8, rating: 1.2 },
          F: { goals: 3.0, assists: 2.0, rating: 1.2, duels: 0.5 },
        };

        const perMatch = (value, games) => (games > 0 ? value / games : 0);

        const scoredPlayers = players
          .map((p) => {
            const s = p.statistics?.[0];
            if (!s) return null;

            const games = s.games?.appearences || 0;
            const pos = (s.games?.position || "M")[0];
            const w = weights[pos] || weights.M;
            const rating = parseFloat(s.games?.rating) || 0;

            const goals = s.goals?.total || 0;
            const assists = s.goals?.assists || 0;
            const tackles = s.tackles?.total || 0;
            const interceptions = s.tackles?.interceptions || 0;
            const duelsTotal = s.duels?.total || 0;
            const duelsWon = s.duels?.won || 0;
            const accuracy = parseFloat(s.passes?.accuracy) || 0;
            const saves = s.goals?.saves || 0;
            const conceded = s.goals?.conceded || 0;

            const cleanSheet = conceded === 0 && pos === "G" ? 1 : 0;

            let score =
              perMatch(goals, games) * (w.goals || 0) +
              perMatch(assists, games) * (w.assists || 0) +
              perMatch(tackles + interceptions, games) * (w.tackles || 0) +
              perMatch(duelsWon / (duelsTotal || 1), games) * (w.duels || 0) +
              (accuracy * (w.passes || 0)) / 100 +
              rating * (w.rating || 0) +
              games * (w.games || 0) +
              perMatch(saves, games) * (w.saves || 0) +
              cleanSheet * (w.cleanSheets || 0);

            if (games < 3 && rating > 8) score *= 0.7;
            if (games < 5) score *= 0.85;

            return {
              id: p.player.id,
              name: p.player.name,
              photo: p.player.photo,
              position: s.games?.position,
              games,
              rating,
              goals,
              assists,
              score: Number(score.toFixed(2)),
            };
          })
          .filter(Boolean);

        scoredPlayers.sort((a, b) => b.score - a.score);
        topPlayer = scoredPlayers[0];
      }
    } catch (err) {
      await logApiCall({
        endpoint: "/players",
        start: Date.now(),
        error: err,
      });
      console.warn("⚠️ No se pudo calcular jugador clave:", err.message);
    }

    // 4️⃣ Próximo partido
    let nextMatch = null;
    try {
      const start = Date.now();
      const nextFixtureRes = await axios.get(`${API_URL}/fixtures`, {
        headers: { "x-apisports-key": API_KEY },
        params: { team: teamId, league: leagueId, season, next: 1 },
      });

      await logApiCall({
        endpoint: "/fixtures",
        start,
        response: nextFixtureRes,
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
      await logApiCall({
        endpoint: "/fixtures",
        start: Date.now(),
        error: err,
      });
      console.warn("⚠️ No se pudo obtener el próximo partido:", err.message);
    }

    // 5️⃣ Forma reciente
    let recentForm = [];
    try {
      const start = Date.now();
      const lastMatchesRes = await axios.get(`${API_URL}/fixtures`, {
        headers: { "x-apisports-key": API_KEY },
        params: { team: teamId, league: leagueId, season, last: 5 },
      });

      await logApiCall({
        endpoint: "/fixtures",
        start,
        response: lastMatchesRes,
      });

      recentForm = (lastMatchesRes.data.response || []).map((f) => {
        const isHome = f.teams.home.id === Number(teamId);
        const win =
          (isHome && f.goals.home > f.goals.away) ||
          (!isHome && f.goals.away > f.goals.home);
        const draw = f.goals.home === f.goals.away;
        return win ? "W" : draw ? "D" : "L";
      });
    } catch (err) {
      await logApiCall({
        endpoint: "/fixtures",
        start: Date.now(),
        error: err,
      });
      console.warn("⚠️ No se pudo obtener recentForm:", err.message);
    }

    // 6️⃣ Progreso de temporada
    let seasonProgress = [];
    try {
      const start = Date.now();
      const fixturesRes = await axios.get(`${API_URL}/fixtures`, {
        headers: { "x-apisports-key": API_KEY },
        params: { team: teamId, league: leagueId, season },
      });

      await logApiCall({
        endpoint: "/fixtures",
        start,
        response: fixturesRes,
      });

      const finishedFixtures = (fixturesRes.data.response || [])
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
      await logApiCall({
        endpoint: "/fixtures",
        start: Date.now(),
        error: err,
      });
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
            position: topPlayer.position,
            goals: topPlayer.goals,
            assists: topPlayer.assists,
            rating: topPlayer.rating,
            games: topPlayer.games,
            impactScore: topPlayer.score,
          }
        : null,
      nextMatch,
      seasonProgress,
      lastUpdated: new Date(),
    };

    // 8️⃣ Guardar o actualizar
    const saved = await TeamSummary.findOneAndUpdate(
      { leagueId: Number(leagueId), teamId: Number(teamId), season: Number(season) },
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