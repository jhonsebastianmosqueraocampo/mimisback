const PlayerCareer = require("../models/PlayerCareer");
const axios = require("axios");
const { getCurrentSeason } = require("../helper/getCurrentSeason.js");
require("dotenv").config();

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_URL = process.env.API_URL;

const getPlayerCareer = async (req, res) => {
  const { playerId } = req.params;
  let { season } = req.params;

  if (!playerId || isNaN(playerId)) {
    return res
      .status(400)
      .json({ status: "error", message: "Invalid playerId" });
  }
  if (!season || isNaN(season)) {
    return res
      .status(400)
      .json({ status: "error", message: "Invalid season" });
  }

  if (season === 0) {
    season = await getCurrentSeason({ playerId: playerId });
  }

  try {
    let career = await PlayerCareer.findOne({ playerId, season }).lean();
    const now = new Date();

    // --- 1️⃣ Verificar si existe y si aún está vigente (menos de 24h desde la última actualización) ---
    if (career) {
      const lastUpdated = new Date(career.updatedAt || 0);
      const diffHours = (now - lastUpdated) / (1000 * 60 * 60);

      if (diffHours < 24) {
        return res.json({
          status: "success",
          updated: false,
          career,
        });
      }
    }

    // --- 2️⃣ Consultar API si está desactualizado ---
    const { data } = await axios.get(`${API_URL}/players`, {
      params: { id: playerId, season },
      headers: { "x-apisports-key": API_KEY },
    });

    if (!data.response || data.response.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Jugador no encontrado",
      });
    }

    const playerData = data.response[0];

    // --- 3️⃣ Mapear trayectoria ---
    const mappedHistory = playerData.statistics.map((stat) => ({
      league: {
        id: stat.league.id,
        name: stat.league.name,
        country: stat.league.country,
        season: stat.league.season,
      },
      team: {
        id: stat.team.id,
        name: stat.team.name,
        logo: stat.team.logo,
      },
      games: stat.games,
      goals: stat.goals,
      cards: stat.cards,
    }));

    // --- 4️⃣ Guardar o actualizar en DB ---
    const updatedCareer = await PlayerCareer.findOneAndUpdate(
      { playerId, season },
      {
        playerId,
        name: playerData.player.name,
        nationality: playerData.player.nationality,
        photo: playerData.player.photo,
        season,
        updatedAt: new Date(),
        history: mappedHistory,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.json({
      status: "success",
      updated: true,
      career: updatedCareer,
    });
  } catch (error) {
    console.error("❌ Error en getPlayerCareer:", error.message);
    res.json({
      status: "error",
      message: "Error obteniendo trayectoria del jugador",
    });
  }
};

module.exports = {
  getPlayerCareer,
};
