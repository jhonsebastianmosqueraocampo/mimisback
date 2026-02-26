const { Router } = require("express");

const router = Router();

const nationalLeagueController = require("../controllers/nationalLeague");
const middleware = require("../middlewares/auth");

router.get("/getTournaments", middleware.auth, nationalLeagueController.getNationalLeagues);
router.get("/getTournamentsFromCountry/:country", middleware.auth, nationalLeagueController.getTournamentsFromCountry);

module.exports = router;