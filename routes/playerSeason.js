const { Router } = require("express");

const router = Router();

const playerSeasonsController = require("../controllers/playerSeasons");
const middleware = require("../middlewares/auth");

router.get('/getplayerSeasons/:playerId', middleware.auth, playerSeasonsController.getPlayerSeasons);

module.exports = router;