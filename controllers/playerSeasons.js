const PlayerSeasons = require("../models/PlayerSeasons");
const axios = require("axios");
require("dotenv").config();

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_URL = process.env.API_URL;

const getPlayerSeasons = async (req, res) => {
  const { playerId } = req.params;

  if (!playerId || isNaN(playerId)) {
    return res
      .status(400)
      .json({ status: "error", message: "Invalid playerId" });
  }

  try {
    const cached = await PlayerSeasons.findOne({ playerId }).lean();
    const now = new Date();

    // --- 1️⃣ Validar caché (TTL = 24 horas) ---
    if (cached) {
      const lastFetched = new Date(cached.fetchedAt || 0);
      const diffHours = (now - lastFetched) / (1000 * 60 * 60);

      if (diffHours < 24) {
        const seasonsDesc = [...(cached.seasons || [])].sort((a, b) => b - a);
        return res.json({
          status: "success",
          updated: false,
          source: "cache",
          seasons: seasonsDesc,
        });
      }
    }

    // --- 2️⃣ Consultar API si está desactualizado o no existe ---
    const { data } = await axios.get(`${API_URL}/players/seasons`, {
      params: { player: playerId },
      headers: { "x-apisports-key": API_KEY },
    });

    const seasons = Array.isArray(data?.response) ? data.response : [];
    const seasonsDesc = [...seasons].sort((a, b) => b - a);

    // --- 3️⃣ Guardar / actualizar en DB ---
    const updated = await PlayerSeasons.findOneAndUpdate(
      { playerId },
      { seasons: seasonsDesc, fetchedAt: now },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.json({
      status: "success",
      updated: true,
      source: "api",
      seasons: seasonsDesc,
    });
  } catch (error) {
    console.error("❌ Error en getPlayerSeasons:", error.message);
    return res.status(500).json({
      status: "error",
      message: "Error obteniendo temporadas del jugador",
    });
  }
};

module.exports = {
  getPlayerSeasons,
};
