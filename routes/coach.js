const { Router } = require("express");

const router = Router();

const coachController = require("../controllers/coach");
const middleware = require("../middlewares/auth");

router.get("/coachesByLeague/:leagueId/:season", middleware.auth, coachController.getCoachesByLeague);
router.get("/getCoachByTeam/:teamId", middleware.auth, coachController.getCoachByTeam);
router.get("/getCoachInfo/:coachId/:season", coachController.getCoachInfo);

module.exports = router;