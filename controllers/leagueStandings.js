const axios = require("axios");
const LeagueStanding = require("../models/leagueStanding");
require("dotenv").config();

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_URL = process.env.API_URL;

const getLeagueStandings = async (req, res) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  if (isNaN(leagueId) || !leagueId) {
    return res.json({ status: "error", message: "Invalid leagueId" });
  }
  const season = parseInt(req.params.season, 10);
  if (isNaN(season) || !season) {
    return res.json({ status: "error", message: "Invalid season" });
  }

  try {
    let data = await LeagueStanding.findOne({ leagueId, season });

    const now = new Date();
    const oneHour = 1000 * 60 * 60;
    if (data && now - new Date(data.lastUpdate) < oneHour) {
      return res.json({ status: "success", standings: data.standings });
    }
    const response = await axios.get(`${API_URL}/standings`, {
      headers: { "x-apisports-key": API_KEY },
      params: { league: leagueId, season },
    });

    const apiData = response.data.response?.[0];
    if (!apiData || !apiData.league) {
      return res.status.json({ status: "error", message: "No data found" });
    }

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

    return res.json({ status: "success", standings: data.standings });
  } catch (error) {
    return res.json({ status: "error", message: "An error was found. Please, try again" });
  }
};

module.exports = { getLeagueStandings };