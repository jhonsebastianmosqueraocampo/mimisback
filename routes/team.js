const { Router } = require("express");

const router = Router();

const teamController = require("../controllers/team");
const middleware = require("../middlewares/auth");

router.get("/teams/:leagueId/:season", teamController.teams);
router.get("/getTeam/:teamId", middleware.auth, teamController.getTeam);
router.get("/teamStats/:teamId/:season", teamController.getTeamPlayerStats);
router.get("/teamStats/:teamId/:season/:leagueId", middleware.auth, teamController.getTeamPlayerStatsByLeague);
router.get("/squad/:teamId", middleware.auth, teamController.getSquad);
router.get("/search/:name", teamController.search);

module.exports = router;