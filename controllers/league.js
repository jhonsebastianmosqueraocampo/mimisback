const axios = require("axios");
const { getLeagueFromCountry } = require("../helper/getLeagueFromCountry");
const League = require("../models/league");
const TeamLeague = require("../models/teamLeague");
require("dotenv").config();

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_URL = process.env.API_URL;

const leagues = async (req, res) => {
  try {
    const leagues = await League.find().lean();
    return res.json({
      status: "success",
      leagues,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "An error was found. Try again",
    });
  }
};

const leaguesFromCountry = async (req, res) => {
  const { country } = req.params;
  try {
    const leagues = await getLeagueFromCountry(country);
    return res.json({
      status: "success",
      leagues,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "An error was found. Try again",
    });
  }
};

const leaguesByTeam = async (req, res) => {
  const teamId = parseInt(req.params.teamId, 10);
  const season = parseInt(req.params.season, 10);

  if (isNaN(teamId) || !teamId || isNaN(season) || !season) {
    return res
      .status(400)
      .json({ status: "error", message: "Invalid teamId or season" });
  }

  try {
    const existingLeagues = await TeamLeague.find({
      "team.id": teamId,
      season: season,
    });

    if (existingLeagues.length > 0) {
      const now = new Date();
      const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);

      const lastUpdated = existingLeagues[0].lastUpdate;

      if (lastUpdated && lastUpdated > eightDaysAgo) {
        return res.json({
          status: "success",
          leagues: existingLeagues,
        });
      }
    }

    const response = await axios.get(`${API_URL}/leagues`, {
      headers: { "x-apisports-key": API_KEY },
      params: { team: teamId, season },
    });

    const leagues = response.data.response;

    if (!leagues || leagues.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "No leagues found for this team and season",
      });
    }

    await TeamLeague.deleteMany({
      "team.id": teamId,
      season: season,
    });

    const savedLeagues = [];

    for (const item of leagues) {
      const data = {
        team: {
          id: teamId,
        },
        league: {
          id: item.league.id,
          name: item.league.name,
          logo: item.league.logo,
          leagueType: item.league.type,
        },
        season,
      };

      const saved = await TeamLeague.create(data);
      savedLeagues.push(saved);
    }

    return res.json({
      status: "success",
      leagues: savedLeagues,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "An error was found",
    });
  }
};

const leagueById = async (req, res) => {
  const id = parseInt(req.params.id, 10);

  if (isNaN(id) || !id) {
    return res
      .status(400)
      .json({ status: "error", message: "Invalid id or season" });
  }

  try {
    const existingLeague = await League.findOne({
      "league.id": id
    });

    if (existingLeague) {
      const now = new Date();
      const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);

      const lastUpdated = existingLeague.lastUpdate;

      if (lastUpdated > eightDaysAgo) {
        return res.json({
          status: "success",
          league: existingLeague,
        });
      }
    }

    const response = await axios.get(`${API_URL}/leagues`, {
      headers: { "x-apisports-key": API_KEY },
      params: { id },
    });

    const {league, country} = response.data.response[0];

    if (!response.data.response[0]) {
      return res.status(404).json({
        status: "error",
        message: "No league found",
      });
    }

    const objectLeague = {
      league,
      country
    }

    const newLeague = new League(objectLeague)
    await newLeague.save()

    return res.json({
      status: "success",
      league: objectLeague,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "An error was found",
    });
  }
};

module.exports = {
  leagues,
  leaguesFromCountry,
  leaguesByTeam,
  leagueById
};
