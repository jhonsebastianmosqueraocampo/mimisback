const Fixture = require("../models/fixture");
const { getPlayerStats, getBestRatedTeamPlayer } = require("../helper/getPlayerStatsByLeague");
require("dotenv").config();

const getFeaturedPlayersByFixture = async (req, res) => {
  const fixtureId = parseInt(req.params.fixtureId, 10);
  
    if (!fixtureId) {
      return res
        .status(400)
        .json({ status: "error", message: "Invalid parameters" });
    }
  
    try {
      const fixture = await Fixture.findOne({fixtureId}).lean()
      const leagueId = fixture.leagueId
      const season = fixture.season
      const teamHomeId = fixture.teams.home.id
      const teamAwayId = fixture.teams.away.id

      let statsHome = await getPlayerStats(teamHomeId, leagueId, season)
      let statsAway = await getPlayerStats(teamAwayId, leagueId, season)

      const featuredPlayerHome = getBestRatedTeamPlayer(statsHome)
      const featuredPlayerAway = getBestRatedTeamPlayer(statsAway)
  
      return res.json({
        status: "success",
        featuredHome: featuredPlayerHome,
        statsAway: featuredPlayerAway
      });
    } catch (error) {
      return res.status(500).json({
        status: "error",
        message: "An error was found. Please, try again",
      });
    }
}

module.exports = {
  getFeaturedPlayersByFixture
}