const { Router } = require("express");

const router = Router();

const youtubeController = require("../controllers/youtube");
const middleware = require("../middlewares/auth");

router.get("/videos/:season/:query", middleware.auth, youtubeController.getYoutubeVideos);

module.exports = router;