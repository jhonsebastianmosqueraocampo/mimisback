const Player = require("../models/player");
const axios = require("axios");
const { getCurrentSeason } = require("../helper/getCurrentSeason.js");
const LiveMatch = require("../models/LiveMatch.js");
const Fixture = require("../models/fixture");
const ApiFootballCall = require("../models/apifootballCals.js");
require("dotenv").config();

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_URL = process.env.API_URL;
const LIVE_SHORT = ["1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE"];

const CACHE_EXPIRATION_HOURS = 24;

const getPlayersByTeam = async (req, res) => {
  const { teamId } = req.params;

  if (!teamId || isNaN(teamId)) {
    return res.json({ status: "error", message: "Invalid or missing teamId" });
  }

  const userId = req.user?.id || null;

  try {
    // Buscar jugadores existentes del equipo
    const existingPlayers = await Player.find({ "team.id": teamId }).lean();

    if (existingPlayers.length > 0) {
      const cacheTime = new Date(existingPlayers[0].cachedAt).getTime();
      const isExpired =
        Date.now() - cacheTime > CACHE_EXPIRATION_HOURS * 60 * 60 * 1000;

      if (!isExpired) {
        return res.json({
          status: "success",
          players: existingPlayers,
        });
      }
    }

    /* ===========================
       🔹 LLAMADO A API-FOOTBALL
    ============================ */

    const start = Date.now();
    let response;

    try {
      response = await axios.get(`${API_URL}/players/squads`, {
        headers: { "x-apisports-key": API_KEY },
        params: { team: teamId },
      });

      await ApiFootballCall.create({
        endpoint: "/players/squads",
        method: "GET",
        source: "manual",
        user: userId,
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
        endpoint: "/players/squads",
        method: "GET",
        source: "manual",
        user: userId,
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
        message: "Error consultando jugadores en API-Football",
      });
    }

    const playersItem = response.data?.response;

    if (!playersItem || playersItem.length === 0) {
      return res.json({
        status: "error",
        message: "No players found",
      });
    }

    const playersList = playersItem[0].players || [];
    const teamInfo = playersItem[0].team;

    const updatedPlayers = [];

    // Crear o actualizar cada jugador sin borrar los anteriores
    for (const p of playersList) {
      const playerData = {
        playerId: p.id,
        name: p.name,
        age: p.age,
        photo: p.photo,
        team: {
          id: teamInfo.id,
          name: teamInfo.name,
          logo: teamInfo.logo,
        },
        cachedAt: new Date(),
      };

      const updated = await Player.findOneAndUpdate(
        { playerId: p.id, "team.id": teamInfo.id },
        { $set: playerData },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      updatedPlayers.push(updated);

      await new Promise((r) => setTimeout(r, 100));
    }

    return res.json({
      status: "success",
      players: updatedPlayers,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "An error was found. Try again",
    });
  }
};

const infoPlayer = async (req, res) => {
  const { playerId } = req.params;
  let { season } = req.params;
  const userId = req.user.id;

  if (isNaN(playerId) || isNaN(playerId)) {
    return res
      .status(400)
      .json({ status: "error", message: "Invalid playerId" });
  }

  if (isNaN(season)) {
    return res.status(400).json({ status: "error", message: "Invalid season" });
  }

  if (season == 0) {
    season = await getCurrentSeason({ playerId: playerId, userId });
  }

  try {
    let player = await Player.findOne({ playerId: Number(playerId) }).lean();
    const now = new Date();

    // --- Determinar si el jugador está en actividad ---
    const teamId = player?.team?.id;
    let hasLive = false;
    let hasToday = false;

    if (teamId) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      const liveMatches = await LiveMatch.find({
        $or: [{ "teams.home.id": teamId }, { "teams.away.id": teamId }],
        "status.short": { $in: LIVE_SHORT },
      }).lean();
      hasLive = liveMatches.length > 0;

      const fixturesToday = await Fixture.find({
        $or: [{ "teams.home.id": teamId }, { "teams.away.id": teamId }],
        date: { $gte: startOfDay, $lte: endOfDay },
      }).lean();
      hasToday = fixturesToday.length > 0;
    }

    // --- Frecuencia de actualización dinámica ---
    let maxAgeHours = 24;
    if (hasLive) maxAgeHours = 0.5;
    else if (hasToday) maxAgeHours = 3;

    // --- Validar si hay que actualizar ---
    const lastCached = player?.cachedAt ? new Date(player.cachedAt) : null;
    const diffHours = lastCached
      ? (now - lastCached) / (1000 * 60 * 60)
      : Infinity;

    const shouldUpdate = !player || diffHours >= maxAgeHours;

    if (!shouldUpdate && player) {
      return res.json({
        status: "success",
        updated: false,
        player,
      });
    }

    /* ===========================
       🔹 LLAMADO A API-FOOTBALL
    ============================ */

    const start = Date.now();
    let response;

    try {
      response = await axios.get(`${API_URL}/players`, {
        params: { id: playerId, season },
        headers: { "x-apisports-key": API_KEY },
      });

      await ApiFootballCall.create({
        endpoint: "/players",
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
        endpoint: "/players",
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
        message: "Error consultando jugador en API-Football",
      });
    }

    const data = response.data;

    if (!data.response || data.response.length === 0) {
      return res
        .status(404)
        .json({ status: "error", message: "Player not found" });
    }

    const apiPlayer = data.response[0].player;
    const apiStats = data.response[0].statistics;

    const newData = {
      playerId: apiPlayer.id,
      season: Number(season),
      firstname: apiPlayer.firstname,
      lastname: apiPlayer.lastname,
      name: apiPlayer.name,
      age: apiPlayer.age,
      birth: apiPlayer.birth,
      nationality: apiPlayer.nationality,
      height: apiPlayer.height,
      weight: apiPlayer.weight,
      injured: apiPlayer.injured,
      photo: apiPlayer.photo,
      team: apiStats?.[0]?.team || player?.team || null,
      statistics: apiStats,
      cachedAt: new Date(),
    };

    const updatedPlayer = await Player.findOneAndUpdate(
      { playerId: Number(playerId) },
      { $set: newData },
      { upsert: true, new: true }
    );

    return res.json({
      status: "success",
      updated: true,
      player: updatedPlayer,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "Server error",
    });
  }
};

const search = async (req, res) => {
  try {
    const { name } = req.params;
    if (!name || !name.trim()) {
      return res.status(400).json({
        status: "error",
        message: "Nombre requerido",
      });
    }

    const userId = req.user?.id || null;

    const queryName = name.trim().toLowerCase();
    const regex = new RegExp(escapeRegex(queryName), "i");
    const now = new Date();
    const TTL_HOURS = 24;

    // Buscar en BD (por name, firstname o lastname)
    const localPlayers = await Player.find({
      $or: [{ name: regex }, { firstname: regex }, { lastname: regex }],
    })
      .select("playerId name firstname lastname photo nationality updatedAt cachedAt")
      .lean();

    if (localPlayers.length) {
      const scoredPlayers = localPlayers.map((p) => {
        const nameLower = p.name?.toLowerCase() || "";
        const firstLower = p.firstname?.toLowerCase() || "";
        const lastLower = p.lastname?.toLowerCase() || "";

        let score = 0;
        if (nameLower === queryName) score += 10;
        if (firstLower === queryName) score += 8;
        if (lastLower === queryName) score += 8;

        if (firstLower.split(" ").includes(queryName)) score += 5;
        if (nameLower.split(" ").includes(queryName)) score += 5;
        if (lastLower.split(" ").includes(queryName)) score += 5;

        return { ...p, score };
      });

      scoredPlayers.sort((a, b) => b.score - a.score);

      const lastUpdated = Math.max(
        ...scoredPlayers.map((p) =>
          new Date(p.cachedAt || p.updatedAt || 0).getTime()
        )
      );

      const hours = (now.getTime() - lastUpdated) / (1000 * 60 * 60);

      if (hours < TTL_HOURS) {
        return res.json({
          status: "success",
          players: scoredPlayers,
        });
      }
    }

    /* ===========================
       🔹 LLAMADO A API-FOOTBALL
    ============================ */

    const start = Date.now();
    let response;

    try {
      const apiUrl = `${API_URL}/players/profiles?search=${encodeURIComponent(
        queryName
      )}`;

      response = await axios.get(apiUrl, {
        headers: { "x-apisports-key": API_KEY },
      });

      await ApiFootballCall.create({
        endpoint: "/players/profiles",
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
        endpoint: "/players/profiles",
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
        message: "Error al consultar jugadores en API-Football",
      });
    }

    let apiPlayers = Array.isArray(response?.data?.response)
      ? response.data.response
      : [];

    if (!apiPlayers.length) {
      return res.json({
        status: "error",
        message: `No se encontraron jugadores para "${queryName}"`,
      });
    }

    // Procesar resultados de la API y asignar score igual que en DB
    const cleanPlayers = [];
    const seenIds = new Set();

    for (const item of apiPlayers) {
      const p = item?.player;
      if (!p?.id || !p?.name || seenIds.has(p.id)) continue;
      seenIds.add(p.id);

      const nameLower = p.name?.toLowerCase() || "";
      const firstLower = p.firstname?.toLowerCase() || "";
      const lastLower = p.lastname?.toLowerCase() || "";

      let score = 0;
      if (nameLower === queryName) score += 10;
      if (firstLower === queryName) score += 8;
      if (lastLower === queryName) score += 8;
      if (firstLower.split(" ").includes(queryName)) score += 5;
      if (nameLower.split(" ").includes(queryName)) score += 5;
      if (lastLower.split(" ").includes(queryName)) score += 5;

      cleanPlayers.push({
        playerId: p.id,
        name: p.name,
        firstname: p.firstname,
        lastname: p.lastname,
        photo: p.photo,
        nationality: p.nationality,
        age: p.age,
        cachedAt: now,
        score,
      });
    }

    cleanPlayers.sort((a, b) => b.score - a.score);

    // Guardar / actualizar en BD
    const savedPlayers = [];
    for (const p of cleanPlayers) {
      const saved = await Player.findOneAndUpdate(
        { playerId: p.playerId },
        { $set: p },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).select("playerId name firstname lastname photo nationality");
      savedPlayers.push(saved);
    }

    return res.json({
      status: "success",
      players: cleanPlayers,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "Error al buscar jugadores. Intenta de nuevo.",
    });
  }
};

const escapeRegex = (text = "") => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

module.exports = {
  getPlayersByTeam,
  infoPlayer,
  search,
};
