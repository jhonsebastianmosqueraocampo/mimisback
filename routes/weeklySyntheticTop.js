const { Router } = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const router = Router();

const weeklySyntheticTopController = require("../controllers/weeklySyntheticTop");
const middleware = require("../middlewares/auth");

// Crear carpeta media/synthetic si no existe
const uploadDir = path.join(__dirname, "..", "media", "synthetic");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configuración de multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "media/synthetic");
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${Date.now()}${ext}`);
  },
});

const upload = multer({ storage });

// ENDPOINTS
router.post("/save", middleware.auth, upload.fields([{ name: "video", maxCount: 1 },{ name: "thumbail", maxCount: 1 }]), weeklySyntheticTopController.save);
router.get("/videos", middleware.auth, weeklySyntheticTopController.videos);
router.get("/weekVideo/:week", middleware.auth, weeklySyntheticTopController.getWeekVideo);
router.delete("/weekVideo/:id", middleware.auth, weeklySyntheticTopController.deleteWeekVideo);
router.put("/weekVideo/:id", middleware.auth,  upload.fields([{ name: "video", maxCount: 1 },{ name: "thumbail", maxCount: 1 }]), weeklySyntheticTopController.updateWeekVideo);
router.put("/setFavorite/:videoId", middleware.auth, weeklySyntheticTopController.setFavorite);
router.put("/registerView/:videoId", middleware.auth, weeklySyntheticTopController.registerView);
router.get("/image/:filename", weeklySyntheticTopController.getImage);
router.get("/video/:filename", weeklySyntheticTopController.getVideo);

module.exports = router;