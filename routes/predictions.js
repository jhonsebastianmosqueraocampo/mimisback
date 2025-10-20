const { Router } = require("express");

const router = Router();

const predictionsController = require("../controllers/predictions.js");
const middleware = require("../middlewares/auth");

router.get("/fixture/:fixtureId", middleware.auth, predictionsController.getFixturePrediction);

module.exports = router;