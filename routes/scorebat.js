const { Router } = require("express");
const router = Router();

const scorebatController = require("../controllers/scorebat");
const middleware = require("../middlewares/auth");

router.get("/team/:teamName", scorebatController.getVideosByTeam);
router.get("/fixture/:homeTeam/:awayTeam", middleware.auth, scorebatController.getVideosByFixture);
// router.get("/player/:playerName", middleware.auth, scorebatController.getVideosByPlayer);
router.get("/tournament/:tournamentName", middleware.auth, scorebatController.getVideosByTournament);

module.exports = router;