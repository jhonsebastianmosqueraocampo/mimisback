const { Router } = require("express");
const multer = require("multer");

const router = Router();

const weeklySyntheticTopController = require("../controllers/weeklySyntheticTop");
const middleware = require("../middlewares/auth");

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB (ajusta según necesidad)
});

// ENDPOINTS
router.post("/save", middleware.auth, upload.fields([{ name: "video", maxCount: 1 },{ name: "thumbail", maxCount: 1 }]), weeklySyntheticTopController.save);
router.get("/videos", middleware.auth, weeklySyntheticTopController.videos);
router.get("/weekVideo/:week", middleware.auth, weeklySyntheticTopController.getWeekVideo);
router.delete("/weekVideo/:id", middleware.auth, weeklySyntheticTopController.deleteWeekVideo);
router.put("/weekVideo/:id", middleware.auth,  upload.fields([{ name: "video", maxCount: 1 },{ name: "thumbail", maxCount: 1 }]), weeklySyntheticTopController.updateWeekVideo);
router.put("/setFavorite/:videoId", middleware.auth, weeklySyntheticTopController.setFavorite);
router.put("/registerView/:videoId", middleware.auth, weeklySyntheticTopController.registerView);

module.exports = router;