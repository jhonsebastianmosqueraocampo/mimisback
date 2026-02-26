const { Router } = require("express");

const router = Router();

const fixtureController = require("../controllers/fixture");
const featuredPlayersController = require("../controllers/featuredPlayers");
const middleware = require("../middlewares/auth");

router.get("/nextMatch/:teamId", middleware.auth, fixtureController.getNextFixture);
router.get("/previousMatches/:teamId/:season", middleware.auth, fixtureController.getPreviousFixturesByTeam);
router.get("/fixturesLeague/:leagueId/:season", middleware.auth, fixtureController.getFixturesLeague);
router.get("/fixtureById/:fixtureId", middleware.auth, fixtureController.getFixtureById);
router.get("/featuredPlayers/:fixtureId", middleware.auth, featuredPlayersController.getFeaturedPlayersByFixture);
router.get("/preMatchStats/:fixtureId", middleware.auth, fixtureController.getPreMatchStats);
router.get("/fixtureLineup/:fixtureId", middleware.auth, fixtureController.getFixtureLineups);
router.get("/liveMatch/:fixtureId", middleware.auth, fixtureController.getLiveMatch);
router.get("/getMatchesDay", middleware.auth, fixtureController.getMatchesDay);
router.get("/getMatchesTodayFromLeague/:leagueId", middleware.auth, fixtureController.getMatchesTodayFromLeague);
router.get("/isLiveMatch/:fixtureId", middleware.auth, fixtureController.isLiveMatch);
router.get("/getMatchesNationalDay", middleware.auth, fixtureController.getMatchesNationalDay);
router.post("/ratePlayer/:fixtureId/:playerId", middleware.auth, fixtureController.ratePlayer);
router.get("/player-ratings/:fixtureId", middleware.auth, fixtureController.getPlayerUserRatings);

module.exports = router;