const axios = require("axios");
require("dotenv").config();

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_URL = process.env.API_URL;

const getLatestSeasonWithData = async (leagueId) => {
  try {
    const leagueRes = await axios.get(`${API_URL}/leagues`, {
      headers: {
        "x-apisports-key": API_KEY,
      },
      params: { id: leagueId },
    });

    const seasons = leagueRes.data?.response?.[0]?.seasons;
    if (!seasons) return null;

    const sortedSeasons = seasons.map((s) => s.year).sort((a, b) => b - a).slice(0, 3);

    for (const season of sortedSeasons) {
      const teamRes = await axios.get(`${API_URL}/teams`, {
        headers: {
          "x-apisports-key": API_KEY,
        },
        params: {
          league: leagueId,
          season: season,
        },
      });

      if (teamRes.data?.response?.length > 0) {
        return season;
      }
    }

    return null;
  } catch (error) {
    return null;
  }
};

module.exports = {
  getLatestSeasonWithData,
};
