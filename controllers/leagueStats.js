const { getLeagueStats } = require("../helper/leagueStatsAll");
require("dotenv").config();

const listLeagueStats = async (req, res) => {
  const { leagueId, season } = req.params;

  if (!leagueId || isNaN(leagueId)) {
    return res
      .status(400)
      .json({ status: "error", message: "Invalid leagueId" });
  }
  if (!season || isNaN(season)) {
    return res.status(400).json({ status: "error", message: "Invalid season" });
  }

  try {
    const statsAll = await getLeagueStats(leagueId, season)
    return res.json({ status: "success", stats: statsAll });
  } catch (error) {
    return res.json({ status: "error", message: "Server error" });
  }
};


module.exports = {
    listLeagueStats
}