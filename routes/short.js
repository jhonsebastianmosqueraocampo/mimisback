const { Router } = require("express");
const router = Router();
const multer = require("multer");

const shortController = require("../controllers/short");
const middleware = require("../middlewares/auth");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
});

router.get("/", middleware.auth, shortController.shorts);
router.post("/short", middleware.auth, upload.fields([{ name: "video", maxCount: 1 },{ name: "thumbnail", maxCount: 1 }]), shortController.create);
router.get("/short/:id", middleware.auth, shortController.short);
router.delete("/short/:id", middleware.auth, shortController.deleteShort);
router.put("/short/:id", middleware.auth, upload.fields([{ name: "video", maxCount: 1 },{ name: "thumbnail", maxCount: 1 }]), shortController.update);
router.post("/comentario/:id", middleware.auth, shortController.comentario);
router.post("/favorito/:id", middleware.auth, shortController.favorito);

module.exports = router;