const axios = require("axios");
require("dotenv").config();
const TeamLeague = require("../models/teamLeague");

const API_URL = process.env.API_URL;
const API_KEY = process.env.API_KEY;

const getLeaguesByTeam = async (teamId, season) => {
  if (!teamId || !season || isNaN(teamId) || isNaN(season)) {
    throw new Error("Invalid teamId or season");
  }

  const existingLeagues = await TeamLeague.find({
    "team.id": teamId,
    season,
  });

  const now = new Date();
  const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);

  if (
    existingLeagues.length > 0 &&
    existingLeagues[0].lastUpdate &&
    existingLeagues[0].lastUpdate > eightDaysAgo
  ) {
    return existingLeagues;
  }

  const response = await axios.get(`${API_URL}/leagues`, {
    headers: { "x-apisports-key": API_KEY },
    params: { team: teamId, season },
  });

  const leagues = response.data.response;

  if (!leagues || leagues.length === 0) {
    return [];
  }

  // Limpia las ligas viejas
  await TeamLeague.deleteMany({
    "team.id": teamId,
    season,
  });

  // Guarda las nuevas
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
      lastUpdate: new Date(),
    };

    const saved = await TeamLeague.create(data);
    savedLeagues.push(saved);
  }

  return savedLeagues;
};

module.exports = {
    getLeaguesByTeam
}