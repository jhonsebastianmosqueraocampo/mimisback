const { Router } = require("express");

const router = Router();

const teamController = require("../controllers/team");
const middleware = require("../middlewares/auth");

router.get("/teams/:leagueId/:season", middleware.auth, teamController.teams);
router.get("/getTeam/:teamId", middleware.auth, teamController.getTeam);
router.get("/teamStats/:teamId/:season", middleware.auth, teamController.getTeamPlayerStats);
router.get("/teamStats/:teamId/:season/:leagueId", middleware.auth, teamController.getTeamPlayerStatsByLeague);
router.get("/squad/:teamId", teamController.getSquad);

module.exports = router;