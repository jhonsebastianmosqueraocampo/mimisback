const { Router } = require("express");

const router = Router();

const betController = require("../controllers/bet");
const middleware = require("../middlewares/auth");

router.post("/create", middleware.auth, betController.create);
router.get("/infoBetId/:betId", middleware.auth, betController.infoBetId);
router.get("/infoCode/:code", middleware.auth, betController.infoCode);
router.post("/joinBet/:betId", middleware.auth, betController.joinBet);
router.post("/myBets", middleware.auth, betController.myBets);

module.exports = router;