const axios = require("axios");
const User = require("../models/user");
const Favorite = require("../models/favorite");
const Team = require("../models/team");
const League = require("../models/league");
const Player = require("../models/player");
const Coach = require("../models/coach");
require("dotenv").config();

const API_URL = process.env.API_URL;
const API_KEY = process.env.API_FOOTBALL_KEY;

const saveFavorites = async (req, res) => {
  const { id } = req.user;
  try {
    const user = await User.findById(id).lean();

    if (!user) {
      return res.json({
        status: "error",
        message: "No user found",
      });
    }

    const existing = await Favorite.findOne({ user: id });

    if (existing) {
      existing.equipos = req.body.equipos || [];
      existing.ligas = req.body.ligas || [];
      existing.jugadores = req.body.jugadores || [];
      existing.entrenadores = req.body.entrenadores || [];

      await existing.save();
    } else {
      await Favorite.create({
        user: id,
        equipos: req.body.equipos || [],
        ligas: req.body.ligas || [],
        jugadores: req.body.jugadores || [],
        entrenadores: req.body.entrenadores || [],
      });
    }

    return res.json({
      status: "success",
      message: "",
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "An error was found. Try again",
    });
  }
};

const getFavorites = async (req, res) => {
  const { id } = req.user;
  try {
    const user = await User.findById(id).lean();

    if (!user) {
      return res.json({
        status: "error",
        message: "No user found",
      });
    }

    const favorites = await Favorite.findOne({ user: id }).lean();

    if (!favorites) {
      return res.json({
        status: "error",
        message: "Favorites not found",
      });
    }

    const equipos = (
      await Team.find({ name: { $in: favorites.equipos } }).lean()
    ).map((equipo) => ({
      id: equipo.teamId,
      title: equipo.name,
      img: equipo.logo,
      pathTo: equipo.teamId,
    }));
    const ligas = (
      await League.find({
        "league.name": { $in: favorites.ligas },
      }).lean()
    ).map((liga) => ({
      id: liga.league.id,
      title: liga.league.name,
      img: liga.league.logo,
      pathTo: liga.league.id,
    }));
    const jugadores = (
      await Player.find({
        name: { $in: favorites.jugadores },
      }).lean()
    ).map((jugador) => ({
      id: jugador.playerId,
      title: jugador.name,
      img: jugador.photo,
      pathTo: jugador.playerId,
    }));
    const entrenadores = (
      await Coach.find({
        name: { $in: favorites.entrenadores },
      }).lean()
    ).map((entrendador) => ({
      id: entrendador.coachId,
      title: entrendador.name,
      img: entrendador.photo,
      pathTo: entrendador.coachId,
    }));
    return res.json({
      status: "success",
      message: "",
      equipos,
      ligas,
      jugadores,
      entrenadores,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "An error was found. Try again",
    });
  }
};

const getFavoritesStats = async (req, res) => {
  const { id } = req.user;
  const SEASON = new Date().getFullYear();
  const MAX_AGE_HOURS = 24;

  try {
    // 1️⃣ Buscar usuario
    const user = await User.findById(id).lean();
    if (!user) {
      return res.json({ status: "error", message: "Usuario no encontrado" });
    }

    // 2️⃣ Buscar favoritos
    const favorites = await Favorite.findOne({ user: id }).lean();
    if (!favorites || !favorites.equipos?.length) {
      return res.json({
        status: "error",
        message: "No se encontraron equipos favoritos",
      });
    }

    const results = [];

    // 3️⃣ Iterar sobre nombres de equipos favoritos
    for (const teamName of favorites.equipos) {
      let team = await Team.findOne({ name: teamName });

      // 4️⃣ Si no está en DB, buscarlo en la API y guardarlo
      if (!team) {
        console.log(`📡 Buscando "${teamName}" en la API...`);
        const searchRes = await axios.get(`${API_URL}/teams`, {
          headers: { "x-apisports-key": API_KEY },
          params: { search: teamName },
        });

        const found = searchRes.data.response?.[0];
        if (!found) {
          console.log(`⚠️ No se encontró el equipo "${teamName}"`);
          continue;
        }

        // Guardar en DB
        team = await Team.create({
          teamId: found.team.id,
          name: found.team.name,
          logo: found.team.logo,
          country: found.team.country,
          leagueId: found.team.league || null, // opcional si la API lo da
        });

        console.log(
          `✅ Guardado nuevo equipo en DB: ${team.name} (${team.teamId})`
        );
      }

      const teamId = team.teamId;

      // 5️⃣ Buscar estadísticas guardadas en DB
      let teamStats = await TeamPlayerStatByLeague.findOne({
        teamId,
        season: SEASON,
      });

      const needsUpdate =
        !teamStats ||
        !teamStats.lastUpdate ||
        (Date.now() - new Date(teamStats.lastUpdate).getTime()) /
          (1000 * 60 * 60) >
          MAX_AGE_HOURS;

      // 6️⃣ Si no hay datos o están desactualizados, pedirlos a la API
      if (needsUpdate) {
        console.log(
          `⏳ Actualizando estadísticas de jugadores del equipo ${team.name} (${teamId})`
        );

        const response = await axios.get(`${API_URL}/players`, {
          headers: { "x-apisports-key": API_KEY },
          params: { team: teamId, season: SEASON },
        });

        const apiData = response.data.response;

        if (!apiData || apiData.length === 0) {
          console.log(`⚠️ No se encontraron estadísticas para ${team.name}`);
          continue;
        }

        // Agrupar jugadores por liga
        const leagues = {};
        apiData.forEach((item) => {
          const leagueId = item.statistics[0].league.id;
          if (!leagues[leagueId]) {
            leagues[leagueId] = {
              leagueId,
              season: SEASON,
              lastUpdate: new Date(),
              players: [],
            };
          }
          leagues[leagueId].players.push({
            player: item.player,
            statistics: item.statistics,
          });
        });

        // Guardar o actualizar en DB
        for (const leagueId in leagues) {
          const data = leagues[leagueId];
          teamStats = await TeamPlayerStatByLeague.findOneAndUpdate(
            { teamId, leagueId: data.leagueId, season: SEASON },
            {
              teamId,
              leagueId: data.leagueId,
              season: SEASON,
              lastUpdate: new Date(),
              players: data.players,
            },
            { upsert: true, new: true }
          );
        }
      }

      // 7️⃣ Agregar al resultado
      results.push({
        teamId,
        teamName: team.name,
        logo: team.logo,
        country: team.country,
        players: teamStats?.players || [],
      });
    }

    // 8️⃣ Responder al cliente
    return res.json({
      status: "success",
      totalTeams: results.length,
      results,
    });
  } catch (error) {
    console.error("❌ Error en getFavoritesStats:", error.message);
    return res.json({
      status: "error",
      message: "Error al obtener estadísticas de equipos favoritos",
    });
  }
};

module.exports = {
  saveFavorites,
  getFavorites,
  getFavoritesStats,
};
