const PlayerSeasons = require("../models/PlayerSeasons");
const ApiFootballCall = require("../models/apifootballCals.js");
const axios = require("axios");
require("dotenv").config();

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_URL = process.env.API_URL;

const getPlayerSeasons = async (req, res) => {
  const { playerId } = req.params;
  const userId = req.user.id;

  if (!playerId || isNaN(playerId)) {
    return res
      .status(400)
      .json({ status: "error", message: "Invalid playerId" });
  }

  try {
    const cached = await PlayerSeasons.findOne({ playerId }).lean();
    const now = new Date();

    // --- Validar caché (TTL = 24 horas) ---
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

    /* ===========================
       🔹 LLAMADO A API-FOOTBALL
    ============================ */

    const start = Date.now();
    let response;

    try {
      response = await axios.get(`${API_URL}/players/seasons`, {
        params: { player: playerId },
        headers: { "x-apisports-key": API_KEY },
      });

      await ApiFootballCall.create({
        endpoint: "/players/seasons",
        method: "GET",
        source: "manual",
        user: userId || null,
        apiProvider: "api-football",
        costUnit: 1,
        statusCode: response.status,
        success: true,
        responseTimeMs: Date.now() - start,
        remainingRequests:
          response.headers?.["x-ratelimit-requests-remaining"] || null,
      });
    } catch (err) {
      await ApiFootballCall.create({
        endpoint: "/players/seasons",
        method: "GET",
        source: "manual",
        user: userId || null,
        apiProvider: "api-football",
        costUnit: 1,
        statusCode: err.response?.status || 500,
        success: false,
        responseTimeMs: Date.now() - start,
        remainingRequests:
          err.response?.headers?.["x-ratelimit-requests-remaining"] || null,
        errorMessage: err.message,
      });

      return res.json({
        status: "error",
        message: "Error consultando temporadas en API-Football",
      });
    }

    const data = response.data;

    const seasons = Array.isArray(data?.response) ? data.response : [];
    const seasonsDesc = [...seasons].sort((a, b) => b - a);

    // --- Guardar / actualizar en DB ---
    await PlayerSeasons.findOneAndUpdate(
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
    return res.json({
      status: "error",
      message: "Error obteniendo temporadas del jugador",
    });
  }
};

module.exports = {
  getPlayerSeasons,
};
