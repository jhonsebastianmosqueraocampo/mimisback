const PlayerCareer = require("../models/PlayerCareer");
const axios = require("axios");
require("dotenv").config();

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_URL = process.env.API_URL;

const getPlayerCareer = async (req, res) => {
  const { playerId, season } = req.params;

  if (!playerId || isNaN(playerId)) {
    return res
      .status(400)
      .json({ status: "error", message: "Invalid playerId" });
  }
  if (!season || isNaN(season)) {
    return res.status(400).json({ status: "error", message: "Invalid season" });
  }
  try {
    let career = await PlayerCareer.findOne({ playerId, season });
    if (career) {
      return res.json({
        status: "success",
        career,
      });
    }

    const { data } = await axios.get(`${API_URL}/players`, {
      params: { id: playerId, season },
      headers: { "x-apisports-key": API_KEY },
    });

    if (!data.response || data.response.length === 0) {
      return res.status(404).json({ message: "Jugador no encontrado" });
    }

    const playerData = data.response[0];
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

    career = await PlayerCareer.findOneAndUpdate(
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
      { upsert: true, new: true }
    );

    return res.json({
      status: "success",
      career,
    });
  } catch (error) {
    res.json({
      status: "error",
      message: "Error obteniendo trayectoria del jugador",
    });
  }
};

module.exports = {
  getPlayerCareer,
};
