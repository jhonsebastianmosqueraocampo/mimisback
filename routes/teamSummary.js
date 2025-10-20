const { Router } = require("express");

const router = Router();

const teamSummaryController = require("../controllers/teamSummary");
const middleware = require("../middlewares/auth");

router.get("/getInfo/:teamId/:leagueId/:season", middleware.auth, teamSummaryController.getTeamSummary);

module.exports = router;