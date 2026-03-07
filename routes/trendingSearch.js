const { Router } = require("express");

const router = Router();

const trendingController = require("../controllers/trendingSearch");
const middleware = require("../middlewares/auth");

router.get("/getTrending", middleware.auth, trendingController.getTrending);

module.exports = router;