const { Router } = require("express");
const multer = require("multer");

const router = Router();

const weeklyWorldTopController = require("../controllers/weeklyWorldTop");
const middleware = require("../middlewares/auth");

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

// ENDPOINTS
router.post(
  "/save",
  middleware.auth,
  upload.fields([
    { name: "video", maxCount: 1 },
    { name: "thumbail", maxCount: 1 },
  ]),
  weeklyWorldTopController.save
);

router.get("/videos", middleware.auth, weeklyWorldTopController.videos);
router.get("/weekVideo/:week", middleware.auth, weeklyWorldTopController.getWeekVideo);
router.delete("/weekVideo/:id", middleware.auth, weeklyWorldTopController.deleteWeekVideo);

router.put(
  "/weekVideo/:id",
  middleware.auth,
  upload.fields([
    { name: "video", maxCount: 1 },
    { name: "thumbail", maxCount: 1 },
  ]),
  weeklyWorldTopController.updateWeekVideo
);

module.exports = router;