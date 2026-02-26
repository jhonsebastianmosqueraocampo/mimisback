const Player = require("../models/player");
const axios = require("axios");
const { getCurrentSeason } = require("../helper/getCurrentSeason.js");
const LiveMatch = require("../models/LiveMatch.js");
const Fixture = require("../models/fixture");
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

  try {
    // 1️⃣ Buscar jugadores existentes del equipo
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

    // 2️⃣ Consultar API-Football si no hay datos o están vencidos
    const response = await axios.get(`${API_URL}/players/squads`, {
      headers: { "x-apisports-key": API_KEY },
      params: { team: teamId },
    });

    const playersItem = response.data.response;
    if (!playersItem || playersItem.length === 0) {
      return res.json({
        status: "error",
        message: "No players found",
      });
    }

    const playersList = playersItem[0].players || [];
    const teamInfo = playersItem[0].team;

    const updatedPlayers = [];

    // 3️⃣ Crear o actualizar cada jugador sin borrar los anteriores
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

      // pequeña espera entre iteraciones (opcional para evitar rate limits de DB)
      await new Promise((r) => setTimeout(r, 100));
    }

    return res.json({
      status: "success",
      players: updatedPlayers,
    });
  } catch (error) {
    console.error("❌ getPlayersByTeam error:", error.message);
    return res.json({
      status: "error",
      message: "An error was found. Try again",
    });
  }
};

const infoPlayer = async (req, res) => {
  const { playerId } = req.params;
  let { season } = req.params;

  if (isNaN(playerId) || isNaN(playerId)) {
    return res
      .status(400)
      .json({ status: "error", message: "Invalid playerId" });
  }
  if (!season || isNaN(season)) {
    return res.status(400).json({ status: "error", message: "Invalid season" });
  }

  if (season == 0) {
    season = await getCurrentSeason({ playerId: playerId });
  }

  try {
    let player = await Player.findOne({ playerId: Number(playerId) }).lean();
    const now = new Date();

    // --- 1️⃣ Determinar si el jugador está en actividad ---
    const teamId = player?.team?.id;
    let hasLive = false;
    let hasToday = false;

    if (teamId) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      // Buscar si el equipo tiene partido en vivo
      const liveMatches = await LiveMatch.find({
        $or: [{ "teams.home.id": teamId }, { "teams.away.id": teamId }],
        "status.short": { $in: LIVE_SHORT },
      }).lean();
      hasLive = liveMatches.length > 0;

      // Buscar si el equipo juega hoy
      const fixturesToday = await Fixture.find({
        $or: [{ "teams.home.id": teamId }, { "teams.away.id": teamId }],
        date: { $gte: startOfDay, $lte: endOfDay },
      }).lean();
      hasToday = fixturesToday.length > 0;
    }

    // --- 2️⃣ Definir frecuencia de actualización dinámica ---
    let maxAgeHours = 24;
    if (hasLive) maxAgeHours = 0.5; // 30 minutos si su equipo juega ahora
    else if (hasToday) maxAgeHours = 3; // cada 3 horas si juega hoy

    // --- 3️⃣ Validar si hay que actualizar ---
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

    // --- 4️⃣ Consultar la API ---
    const { data } = await axios.get(`${API_URL}/players`, {
      params: { id: playerId, season },
      headers: { "x-apisports-key": API_KEY },
    });

    if (!data.response || data.response.length === 0) {
      return res
        .status(404)
        .json({ status: "error", message: "Player not found" });
    }

    const apiPlayer = data.response[0].player;
    const apiStats = data.response[0].statistics;

    // --- 5️⃣ Construir y guardar objeto actualizado ---
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
        status: 'error',
        message: "Nombre requerido",
      });
    }

    const queryName = name.trim().toLowerCase();
    const regex = new RegExp(escapeRegex(queryName), "i");
    const now = new Date();
    const TTL_HOURS = 24;

    // 1️⃣ Buscar en BD (por name, firstname o lastname)
    const localPlayers = await Player.find({
      $or: [{ name: regex }, { firstname: regex }, { lastname: regex }],
    })
      .select("playerId name firstname lastname photo nationality updatedAt cachedAt")
      .lean();

    if (localPlayers.length) {
      // --- Prioridad avanzada ---
      const scoredPlayers = localPlayers.map((p) => {
        const nameLower = p.name?.toLowerCase() || "";
        const firstLower = p.firstname?.toLowerCase() || "";
        const lastLower = p.lastname?.toLowerCase() || "";

        let score = 0;

        // Exact match
        if (nameLower === queryName) score += 10;
        if (firstLower === queryName) score += 8;
        if (lastLower === queryName) score += 8;

        // Partial match (nombre dentro de otro)
        if (firstLower.split(" ").includes(queryName)) score += 5;
        if (nameLower.split(" ").includes(queryName)) score += 5;
        if (lastLower.split(" ").includes(queryName)) score += 5;

        return { ...p, score };
      });

      // Ordenar por prioridad (mayor score primero)
      scoredPlayers.sort((a, b) => b.score - a.score);

      // Si los datos son recientes, devolverlos
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

    // 2️⃣ Consultar API-Football
    const apiUrl = `${API_URL}/players/profiles?search=${encodeURIComponent(queryName)}`;
    const response = await axios.get(apiUrl, {
      headers: { "x-apisports-key": API_KEY },
    });

    let apiPlayers = Array.isArray(response?.data?.response)
      ? response.data.response
      : [];

    if (!apiPlayers.length) {
      return res.json({
        status: "error",
        message: `No se encontraron jugadores para "${queryName}"`,
      });
    }

    // 3️⃣ Procesar resultados de la API y asignar score igual que en DB
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

    // 4️⃣ Ordenar por relevancia
    cleanPlayers.sort((a, b) => b.score - a.score);

    // 5️⃣ Guardar / actualizar en BD
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
