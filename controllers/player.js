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

  if (!playerId || isNaN(playerId)) {
    return res
      .status(400)
      .json({ status: "error", message: "Invalid playerId" });
  }
  if (!season || isNaN(season)) {
    return res.status(400).json({ status: "error", message: "Invalid season" });
  }

  if (season === 0) {
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
    console.error("❌ Error en infoPlayer:", error.message);
    return res.json({
      status: "error",
      message: "Server error",
    });
  }
};

module.exports = {
  getPlayersByTeam,
  infoPlayer,
};
