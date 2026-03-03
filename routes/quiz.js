const { Router } = require("express");
const router = Router();

const multer = require("multer");

const storage = multer.memoryStorage();
const upload = multer({ storage });

const quizController = require("../controllers/quizController");
const middleware = require("../middlewares/auth");

router.post("/admin/day", middleware.auth, upload.any(), quizController.upsertQuizDay);
router.get("/today", middleware.auth, quizController.getTodayQuiz);
router.post("/answer", middleware.auth, quizController.answerQuestion);
router.get("/videos", middleware.auth, quizController.getVideosForDay);

module.exports = router;