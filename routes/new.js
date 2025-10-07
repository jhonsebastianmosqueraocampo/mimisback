const { Router } = require("express");

const router = Router();

const newController = require("../controllers/new");
const middleware = require("../middlewares/auth");

router.get("/listNews/:team", middleware.auth, newController.getNewsForTeam);
router.get("/rumorNews/:teamId", middleware.auth, newController.getRumorNewsForTeam);
router.get("/playerNews/:playerId", middleware.auth, newController.getPlayerNews);
router.get("/leagueNews/:leagueId", newController.getLeagueNews);
router.get("/coachNews/:coachId", newController.getCoachNews);

module.exports = router;