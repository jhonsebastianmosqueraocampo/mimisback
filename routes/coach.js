const { Router } = require("express");

const router = Router();

const coachController = require("../controllers/coach");
const middleware = require("../middlewares/auth");

router.get("/coachesByLeague/:leagueId/:season", middleware.auth, coachController.getCoachesByLeague);
router.get("/getCoachByTeam/:teamId", middleware.auth, coachController.getCoachByTeam);
router.get("/getCoachInfo/:coachId/:season", middleware.auth, coachController.getCoachInfo);
router.get("/search/:name", middleware.auth, coachController.search);

module.exports = router;