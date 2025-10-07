const PlayerSeasons = require("../models/PlayerSeasons");
const axios = require("axios");
require("dotenv").config();

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_URL = process.env.API_URL;

const getPlayerSeasons = async (req, res) => {
  const { playerId } = req.params;

  if (!playerId || isNaN(playerId)) {
    return res.status(400).json({ status: "error", message: "Invalid playerId" });
  }

  try {
    const cached = await PlayerSeasons.findOne({ playerId }).lean();
    if (cached) {
      const seasonsDesc = [...(cached.seasons || [])].sort((a, b) => b - a);
      return res.json({ status: "success", source: "cache", seasons: seasonsDesc });
    }

    const { data } = await axios.get(`${API_URL}/players/seasons`, {
      params: { player: playerId },
      headers: { "x-apisports-key": API_KEY },
    });

    const seasons = Array.isArray(data?.response) ? data.response : [];
    const seasonsDesc = [...seasons].sort((a, b) => b - a);

    await PlayerSeasons.findOneAndUpdate(
      { playerId },
      { seasons: seasonsDesc, fetchedAt: new Date() },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.json({ status: "success", source: "api", seasons: seasonsDesc });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "Error obteniendo temporadas del jugador",
    });
  }
};

module.exports = {
  getPlayerSeasons,
};
