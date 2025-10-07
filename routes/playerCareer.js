const { Router } = require("express");

const router = Router();

const playerCareerController = require("../controllers/playerCareer");
const middleware = require("../middlewares/auth");

router.get("/getplayerCareer/:playerId/:season", middleware.auth, playerCareerController.getPlayerCareer);

module.exports = router;