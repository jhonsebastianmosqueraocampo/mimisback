const { Router } = require("express");

const router = Router();

const analysisController = require("../controllers/analysis");
const middleware = require("../middlewares/auth");

router.post("/seasonTeam/:season/:teamId", middleware.auth, analysisController.seasonTeamAnalysis);
router.post("/fixture/:fixtureId", middleware.auth, analysisController.fixtureAnalysis);
router.post("/player/:playerId", middleware.auth, analysisController.playerAnalysis);

module.exports = router;