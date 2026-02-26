const { Router } = require("express");

const router = Router();

const youtubeController = require("../controllers/youtube");
const middleware = require("../middlewares/auth");

router.get("/videosFavorites", middleware.auth, youtubeController.getYoutubeVideosFavorites);
router.get("/videos/:query", youtubeController.getYoutubeVideos);
router.get("/videosMatch/:teamA/:teamB/:query/:season?", middleware.auth, youtubeController.getYoutubeVideosMatch);
router.get("/videosTeam/:team/:query/:season?", middleware.auth, youtubeController.getYoutubeVideosTeam);
router.get("/videosPlayer/:player/:query/:season?", middleware.auth, youtubeController.getYoutubeVideosPlayer);

module.exports = router;