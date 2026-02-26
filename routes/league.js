const { Router } = require("express");

const router = Router();

const leagueController = require("../controllers/league");
const leagueStandingsController = require("../controllers/leagueStandings");
const cupStandingsController = require("../controllers/cupStandings");
const friendlyStandingsController = require("../controllers/friendlyStandings");
const leagueStatsController = require("../controllers/leagueStats");
const middleware = require("../middlewares/auth");

router.get("/leagues", middleware.auth, leagueController.leagues);
router.get("/getLeague/:id", middleware.auth, leagueController.leagueById);
router.get("/leaguesfromcountry/:country", middleware.auth, leagueController.leaguesFromCountry);
router.get("/leaguesByTeam/:teamId/:season", middleware.auth, leagueController.leaguesByTeam);
router.get("/getLeagueStandings/:leagueId/:season", leagueStandingsController.getLeagueStandings);
router.get("/getCupStandings/:leagueId/:season", middleware.auth, cupStandingsController.getCupStandings);
router.get("/getFriendlyStandings/:teamId/:season",  middleware.auth, friendlyStandingsController.getFriendlyStandings);
router.get("/getleagueStats/:leagueId/:season", middleware.auth, leagueStatsController.listLeagueStats);

module.exports = router;