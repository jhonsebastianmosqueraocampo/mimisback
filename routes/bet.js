const { Router } = require("express");

const router = Router();

const betController = require("../controllers/bet");
const middleware = require("../middlewares/auth");

router.post("/create", middleware.auth, betController.create);
router.get("/infoBetId/:betId", middleware.auth, betController.infoBetId);
router.get("/infoLiveBetId/:betId", middleware.auth, betController.infoLiveBetId);
router.get("/infoCode/:code", middleware.auth, betController.infoCode);
router.post("/joinBet/:betId", middleware.auth, betController.joinBet);
router.get("/myBets", middleware.auth, betController.myBets);
router.get("/betSetResults/:betId", middleware.auth, betController.betSetResults);

module.exports = router;