const { Router } = require("express");

const router = Router();

const syntheticMatchController = require("../controllers/syntheticMatch");
const middleware = require("../middlewares/auth");

router.get("/getMatches", middleware.auth, syntheticMatchController.getSyntheticMatch);
router.post("/saveMatches", middleware.auth, syntheticMatchController.saveSyntheticMatch);

module.exports = router;