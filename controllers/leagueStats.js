const { getLeagueStats } = require("../helper/leagueStatsAll");
const { getCurrentSeason } = require("../helper/getCurrentSeason.js");
require("dotenv").config();

const listLeagueStats = async (req, res) => {
  const { leagueId } = req.params;
  let { season } = req.params;

  if (!leagueId || isNaN(leagueId)) {
    return res
      .status(400)
      .json({ status: "error", message: "Invalid leagueId" });
  }
  if (!season || isNaN(season)) {
    return res.status(400).json({ status: "error", message: "Invalid season" });
  }

  if (season === 0) {
    season = await getCurrentSeason({ leagueId: leagueId });
  }

  try {
    const statsAll = await getLeagueStats(leagueId, season);
    return res.json({ status: "success", stats: statsAll });
  } catch (error) {
    return res.json({ status: "error", message: "Server error" });
  }
};

module.exports = {
  listLeagueStats,
};
