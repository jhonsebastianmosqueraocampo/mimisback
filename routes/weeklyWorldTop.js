const { Router } = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const router = Router();

const weeklyWorldTopController = require("../controllers/weeklyWorldTop");
const middleware = require("../middlewares/auth");

// Crear carpeta media/world si no existe
const uploadDir = path.join(__dirname, "..", "media", "world");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configuración de multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "media/world");
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${Date.now()}${ext}`);
  },
});

const upload = multer({ storage });

// ENDPOINTS
router.post("/save", middleware.auth, upload.fields([{ name: "video", maxCount: 1 },{ name: "thumbail", maxCount: 1 }]), weeklyWorldTopController.save);
router.get("/videos", middleware.auth, weeklyWorldTopController.videos);
router.get("/weekVideo/:week", middleware.auth, weeklyWorldTopController.getWeekVideo);
router.delete("/weekVideo/:id", middleware.auth, weeklyWorldTopController.deleteWeekVideo);
router.put("/weekVideo/:id", middleware.auth,  upload.fields([{ name: "video", maxCount: 1 },{ name: "thumbail", maxCount: 1 }]), weeklyWorldTopController.updateWeekVideo);
router.get("/image/:filename", weeklyWorldTopController.getImage);
router.get("/video/:filename", weeklyWorldTopController.getVideo);

module.exports = router;