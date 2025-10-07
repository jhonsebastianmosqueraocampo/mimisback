const { Router } = require("express");

const router = Router();

const playerController = require("../controllers/player");
const middleware = require("../middlewares/auth");

router.get("/playersByTeam/:teamId", middleware.auth, playerController.getPlayersByTeam);
router.get("/infoPlayer/:playerId/:season", middleware.auth, playerController.infoPlayer);

module.exports = router;