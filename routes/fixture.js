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

module.exports = router;