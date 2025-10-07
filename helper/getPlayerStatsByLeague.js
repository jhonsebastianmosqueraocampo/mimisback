const axios = require("axios");
const TeamPlayerStatByLeague = require("../models/TeamPlayerStatByLeague");
require("dotenv").config();

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_URL = process.env.API_URL;

const getPlayerStats = async (teamId, leagueId, season) => {
  let stats = [];
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  try {
    stats = await TeamPlayerStatByLeague.findOne({
      teamId,
      leagueId,
      season,
    }).lean();

    if (!(stats && stats.lastUpdate > oneDayAgo)) {
      const { data } = await axios.get(`${API_URL}/players`, {
        headers: { "x-apisports-key": API_KEY },
        params: {
          team: teamId,
          league: leagueId,
          season,
        },
      });

      const playerStats = data.response;

      stats = await TeamPlayerStatByLeague.findOneAndUpdate(
        { teamId, leagueId, season },
        {
          teamId,
          leagueId,
          season,
          lastUpdate: new Date(),
          players: playerStats,
        },
        { upsert: true, new: true }
      ).lean();
    }
    return stats
  } catch (error) {
    return [];
  }
};

const getBestRatedTeamPlayer = (teamPlayersStats) => {
  let bestDoc = null;
  let bestRating = -Infinity;
  try {
      for (const player of teamPlayersStats.players) {
        for (const stat of player.statistics) {
          const rating = parseFloat(stat.games.rating || 0);
          if (!isNaN(rating) && rating > bestRating) {
            bestRating = rating;
            bestDoc = player;
          }
        }
      }
    return bestDoc;
  } catch (error) {
    return []
  }

}

module.exports = {
  getPlayerStats,
  getBestRatedTeamPlayer
};
