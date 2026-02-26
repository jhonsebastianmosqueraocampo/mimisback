const { Router } = require("express");
const router = Router();
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const shortController = require("../controllers/short");
const middleware = require("../middlewares/auth");

// Crear carpeta media/shorts si no existe
const uploadDir = path.join(__dirname, "..", "media", "shorts");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configuración de multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "media/shorts");
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${Date.now()}${ext}`);
  },
});

const upload = multer({ storage });

router.get("/", middleware.auth, shortController.shorts);
router.post("/short", middleware.auth, upload.fields([{ name: "video", maxCount: 1 },{ name: "thumbnail", maxCount: 1 }]), shortController.create);
router.get("/short/:id", middleware.auth, shortController.short);
router.delete("/short/:id", middleware.auth, shortController.deleteShort);
router.put("/short/:id", middleware.auth, upload.fields([{ name: "video", maxCount: 1 },{ name: "thumbnail", maxCount: 1 }]), shortController.update);
router.post("/comentario/:id", middleware.auth, shortController.comentario);
router.post("/favorito/:id", middleware.auth, shortController.favorito);
router.get("/image/:filename", shortController.getImage);
router.get("/video/:filename", shortController.getVideo);

module.exports = router;