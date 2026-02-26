const { Router } = require("express");

const router = Router();

const predictionController = require("../controllers/predictions");
const middleware = require("../middlewares/auth");

router.get("/upcoming", predictionController.getUpcomingPredictionsOdds);

module.exports = router;