const { Router } = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const router = Router();

const userNewsController = require("../controllers/userNews.js");
const middleware = require("../middlewares/auth");

// Crear carpeta media/news si no existe
const uploadDir = path.join(__dirname, "..", "media", "news");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configuración de multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "media/news");
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${Date.now()}${ext}`);
  },
});

const upload = multer({ storage });

router.get("/getNews", middleware.auth, userNewsController.getNews);
router.delete("/deleteNew/:id", middleware.auth, userNewsController.deleteNew);
router.post("/createNew", middleware.auth, upload.any(), userNewsController.createNew);
router.put("/editNew/:id", middleware.auth, upload.any(), userNewsController.editNew);
router.get("/getGeneralNews", middleware.auth, userNewsController.getGeneralNews);
router.get("/getUserNew/:id", middleware.auth, userNewsController.getUserNew);
router.get("/image/:filename", userNewsController.getImage);

module.exports = router;