const Player = require("../models/player");
const axios = require("axios");
require("dotenv").config();

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_URL = process.env.API_URL;

const CACHE_EXPIRATION_HOURS = 24;

const getPlayersByTeam = async (req, res) => {
  const { teamId } = req.params;
  if (isNaN(teamId)) {
    return res.json({ status: "error", message: "Invalid teamId" });
  }

  if (!teamId) {
    return res.json({ status: "error", message: "teamId is required" });
  }

  try {
    const existingPlayers = await Player.find({ "team.id": teamId }).lean();

    if (existingPlayers.length > 0) {
      const cacheTime = new Date(existingPlayers[0].cachedAt).getTime();
      const isExpired =
        Date.now() - cacheTime > CACHE_EXPIRATION_HOURS * 60 * 60 * 1000;
      const players = existingPlayers;
      if (!isExpired) {
        return res.json({
          status: "success",
          players,
        });
      }
    }

    const response = await axios.get(`${API_URL}/players/squads`, {
      headers: {
        "x-apisports-key": API_KEY,
      },
      params: {
        team: teamId,
      },
    });

    const playersItem = response.data.response;
    if (!playersItem || playersItem.length === 0) {
      return res.json({
        status: "error",
        message: "No players found",
      });
    }

    const toSave = playersItem[0].players.map((p) => {
      return {
        playerId: p.id,
        name: p.name,
        age: p.age,
        photo: p.photo,

        team: {
          id: playersItem[0].team.id,
          name: playersItem[0].team.name,
          logo: playersItem[0].team.logo,
        },

        cachedAt: new Date(),
      };
    });

    await Player.deleteMany({ "team.id": teamId });

    const players = await Player.insertMany(toSave);
    return res.json({
      status: "success",
      players,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "An error was found. Try again",
    });
  }
};

const infoPlayer = async (req, res) => {
  const { playerId, season } = req.params;

  if (!playerId || isNaN(playerId)) {
    return res.status(400).json({ status: "error", message: "Invalid playerId" });
  }
  if (!season || isNaN(season)) {
    return res.status(400).json({ status: "error", message: "Invalid season" });
  }

  try {
    let player = await Player.findOne({ playerId: Number(playerId) });

    if (player) {
      const diffHours = (Date.now() - new Date(player.cachedAt)) / (1000 * 60 * 60);
      if (diffHours < 2) {
        return res.json({ status: "success", player });
      }
    }

    const { data } = await axios.get(`${API_URL}/players`, {
      params: { id: playerId, season },
      headers: { "x-apisports-key": API_KEY },
    });

    if (!data.response || data.response.length === 0) {
      return res.status(404).json({ status: "error", message: "Player not found" });
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
      team: apiPlayer.team,
      statistics: apiStats,
      cachedAt: new Date(),
    };

    player = await Player.findOneAndUpdate(
      { playerId: Number(playerId) },
      { $set: newData },
      { upsert: true, new: true }
    );

    return res.json({ status: "success", player });

  } catch (error) {
    return res.json({ status: "error", message: "Server error" });
  }
};

module.exports = {
  getPlayersByTeam,
  infoPlayer
};
