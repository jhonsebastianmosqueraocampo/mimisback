const { Router } = require("express");
const multer = require("multer");
const router = Router();

const userNewsController = require("../controllers/userNews.js");
const middleware = require("../middlewares/auth");

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 6 * 1024 * 1024 }, // 6MB
});

router.get("/getNews", middleware.auth, userNewsController.getNews);
router.delete("/deleteNew/:id", middleware.auth, userNewsController.deleteNew);
router.post("/createNew", middleware.auth, upload.any(), userNewsController.createNew);
router.put("/editNew/:id", middleware.auth, upload.any(), userNewsController.editNew);
router.get("/getGeneralNews", middleware.auth, userNewsController.getGeneralNews);
router.get("/getUserNew/:id", middleware.auth, userNewsController.getUserNew);

module.exports = router;