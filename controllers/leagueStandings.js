const axios = require("axios");
const LeagueStanding = require("../models/leagueStanding");
const LiveMatch = require("../models/LiveMatch");
const Fixture = require("../models/fixture");
const { getCurrentSeason } = require("../helper/getCurrentSeason.js");
require("dotenv").config();

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_URL = process.env.API_URL;

const LIVE_SHORT = ["1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE"];

const getLeagueStandings = async (req, res) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  let season = parseInt(req.params.season, 10);

  if (!leagueId || isNaN(leagueId) || !season || isNaN(season)) {
    return res.json({ status: "error", message: "Invalid leagueId or season" });
  }

  if (season === 0) {
    season = await getCurrentSeason({ leagueId: leagueId });
  }

  try {
    let data = await LeagueStanding.findOne({ leagueId, season });
    const now = new Date();

    // --- 1️⃣ Detectar si hay partidos en vivo o próximos del día ---
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    // Partidos en vivo
    const liveMatches = await LiveMatch.find({
      "league.id": leagueId,
      "status.short": { $in: LIVE_SHORT },
    }).lean();
    const hasLive = liveMatches.length > 0;

    // Partidos del día (usando Fixture)
    const fixturesToday = await Fixture.find({
      "league.id": leagueId,
      date: { $gte: startOfDay, $lte: endOfDay },
    }).lean();
    const hasToday = fixturesToday.length > 0;

    // --- 2️⃣ Calcular frecuencia de actualización dinámica ---
    let maxAgeMinutes = 360; // 6h por defecto
    if (hasLive) maxAgeMinutes = 5; // cada 5 min si hay partidos activos
    else if (hasToday) maxAgeMinutes = 60; // cada hora si hay partidos programados hoy

    const lastUpdated = data ? new Date(data.lastUpdate) : null;
    const diffMinutes = lastUpdated
      ? (now - lastUpdated) / (1000 * 60)
      : Infinity;
    const shouldUpdate = !data || diffMinutes >= maxAgeMinutes;

    // --- 3️⃣ Si no es necesario actualizar, devolver cache ---
    if (!shouldUpdate && data) {
      return res.json({
        status: "success",
        updated: false,
        standings: data.standings,
        matches: liveMatches,
      });
    }

    // --- 4️⃣ Consultar la API ---
    const response = await axios.get(`${API_URL}/standings`, {
      headers: { "x-apisports-key": API_KEY },
      params: { league: leagueId, season },
    });

    const apiData = response.data.response?.[0];
    if (!apiData || !apiData.league) {
      return res.json({ status: "error", message: "No data found" });
    }

    // --- 5️⃣ Guardar / actualizar en DB ---
    const newEntry = {
      leagueId,
      season,
      league: {
        id: apiData.league.id,
        name: apiData.league.name,
        country: apiData.league.country,
        logo: apiData.league.logo,
        flag: apiData.league.flag,
      },
      standings: apiData.league.standings[0],
      lastUpdate: now,
    };

    if (data) {
      await LeagueStanding.updateOne({ _id: data._id }, newEntry);
      data = await LeagueStanding.findById(data._id);
    } else {
      data = await LeagueStanding.create(newEntry);
    }

    // --- 6️⃣ Responder ---
    return res.json({
      status: "success",
      updated: true,
      standings: data.standings,
      matches: liveMatches,
    });
  } catch (error) {
    console.error("❌ getLeagueStandings error:", error.message);
    return res.json({
      status: "error",
      message: "An error was found. Please, try again",
    });
  }
};

module.exports = { getLeagueStandings };
