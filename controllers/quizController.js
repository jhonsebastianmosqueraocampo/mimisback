const QuizDay = require("../models/QuizDay");
const User = require("../models/user");
const UserQuizProgress = require("../models/UserQuizProgress");
const { uploadToR2 } = require("../config/r2");

function todayKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function sanitizeQuestionForUser(q) {
  return {
    _id: q._id,
    questionText: q.questionText,
    videoUrl: q.videoUrl,
    posterUrl: q.posterUrl,
    options: q.options,
  };
}

const upsertQuizDay = async (req, res) => {
  try {
    const { dateKey, isPublished = "true" } = req.body;

    if (!dateKey) {
      return res.status(400).json({
        status: "error",
        message: "dateKey required",
      });
    }

    // Reconstruir preguntas desde FormData
    const questions = [];

    Object.keys(req.body).forEach((key) => {
      const match = key.match(/^questions\[(\d+)\]\[(.+)\]$/);

      if (match) {
        const index = Number(match[1]);
        const field = match[2];

        if (!questions[index]) {
          questions[index] = {
            questionText: "",
            options: [],
            correctIndex: 0,
          };
        }

        if (field.startsWith("options")) {
          const optMatch = field.match(/options\]\[(\d+)\]/);
          if (optMatch) {
            const optIndex = Number(optMatch[1]);
            questions[index].options[optIndex] = req.body[key];
          }
        } else {
          questions[index][field] = req.body[key];
        }
      }
    });

    if (questions.length > 5) {
      return res.status(400).json({
        status: "error",
        message: "Máximo 5 preguntas",
      });
    }

    const files = req.files || [];

    // 🔥 Subir videos a R2
    const processedQuestions = await Promise.all(
      questions.map(async (q, index) => {
        const file = files[index];

        let videoUrl = null;

        if (file) {
          videoUrl = await uploadToR2({
            buffer: file.buffer,
            mimetype: file.mimetype,
            folder: "quiz/videos",
            filename: file.originalname,
          });
        }

        return {
          questionText: q.questionText,
          options: q.options.map((o) => ({ label: o })),
          correctIndex: Number(q.correctIndex),
          videoUrl,
        };
      })
    );

    const doc = await QuizDay.findOneAndUpdate(
      { dateKey },
      {
        dateKey,
        questions: processedQuestions,
        isPublished: isPublished === "true",
        createdBy: req.user.id,
      },
      { new: true, upsert: true }
    );

    return res.json({
      status: "success",
      quizDay: doc,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: "error",
      message: "Server error",
    });
  }
};

/**
 * USER: obtener quiz del día + progreso + siguiente pregunta
 */
const getTodayQuiz = async (req, res) => {
  try {
    const dateKey = req.query.dateKey || todayKey();

    const quizDay = await QuizDay.findOne({ dateKey, isPublished: true });
    if (!quizDay) {
      return res.json({
        status: "success",
        dateKey,
        status: "no_quiz",
        message: "No hay preguntas para hoy.",
      });
    }

    const progress = await UserQuizProgress.findOneAndUpdate(
      { user: req.user.id, dateKey },
      { $setOnInsert: { user: req.user.id, dateKey, answers: [], score: 0 } },
      { new: true, upsert: true },
    );

    const total = quizDay.questions.length;
    const answeredCount = progress.answers.length;
    const nextIndex = answeredCount; // lineal
    const completed = answeredCount >= total && total > 0;

    const nextQuestion = completed ? null : quizDay.questions[nextIndex];

    return res.json({
      status: "success",
      dateKey,
      status: completed ? "completed" : "in_progress",
      total,
      answeredCount,
      score: progress.score,
      nextIndex, // 0-based
      nextQuestion: nextQuestion ? sanitizeQuestionForUser(nextQuestion) : null,
    });
  } catch (e) {
    return res
      .status(500)
      .json({ status: "error", message: "Server error", error: String(e) });
  }
};

/**
 * USER: responder una pregunta
 * body: { dateKey, questionId, selectedIndex }
 */
const answerQuestion = async (req, res) => {
  try {
    const { dateKey, questionId, selectedIndex } = req.body;
    if (!dateKey || !questionId || typeof selectedIndex !== "number") {
      return res.status(400).json({
        status: "error",
        message: "dateKey, questionId, selectedIndex required",
      });
    }
    if (selectedIndex < 0 || selectedIndex > 3) {
      return res
        .status(400)
        .json({ status: "error", message: "selectedIndex must be 0..3" });
    }

    const quizDay = await QuizDay.findOne({ dateKey, isPublished: true });
    if (!quizDay)
      return res
        .status(404)
        .json({ status: "error", message: "Quiz day not found" });

    const q = quizDay.questions.id(questionId);
    if (!q)
      return res
        .status(404)
        .json({ status: "error", message: "Question not found" });

    const progress = await UserQuizProgress.findOneAndUpdate(
      { user: req.user.id, dateKey },
      { $setOnInsert: { user: req.user.id, dateKey, answers: [], score: 0 } },
      { new: true, upsert: true },
    );

    // Evitar doble respuesta
    const already = progress.answers.some(
      (a) => String(a.questionId) === String(questionId),
    );
    if (already) {
      return res
        .status(409)
        .json({ status: "error", message: "Question already answered" });
    }

    // Validar que esté respondiendo la “siguiente” (flujo lineal)
    const expectedIndex = progress.answers.length;
    const expectedQuestion = quizDay.questions[expectedIndex];
    if (
      !expectedQuestion ||
      String(expectedQuestion._id) !== String(questionId)
    ) {
      return res.status(400).json({
        status: "error",
        message: "You must answer the current next question",
      });
    }

    const isCorrect = selectedIndex === q.correctIndex;

    progress.answers.push({
      questionId: q._id,
      selectedIndex,
      isCorrect,
      answeredAt: new Date(),
    });

    if (isCorrect) {
      progress.score += 1;
    }

    const total = quizDay.questions.length;
    if (progress.answers.length >= total) {
      progress.completedAt = new Date();

      const user = await User.findById(req.user.id);

      if (user) {
        const amount = progress.score;
        user.xp += amount;

        user.pointsHistory.push({
          action: "quiz_daily",
          points: amount,
        });

        user.calculateLevel();
        await user.save();
      }
    }

    await progress.save();

    const completed = progress.answers.length >= total;
    const nextIndex = progress.answers.length;
    const nextQuestion = completed ? null : quizDay.questions[nextIndex];

    return res.json({
      status: "success",
      isCorrect,
      score: progress.score,
      answeredCount: progress.answers.length,
      total,
      status: completed ? "completed" : "in_progress",
      nextIndex,
      nextQuestion: nextQuestion ? sanitizeQuestionForUser(nextQuestion) : null,
    });
  } catch (e) {
    return res.status(500).json({ message: "Server error", error: String(e) });
  }
};

/**
 * USER: videos del día (para sección “ver videos” sin pregunta)
 */
const getVideosForDay = async (req, res) => {
  try {
    const dateKey = req.query.dateKey || todayKey();
    const quizDay = await QuizDay.findOne({ dateKey, isPublished: true });
    if (!quizDay) return res.json({ status: "success", dateKey, videos: [] });

    const videos = quizDay.questions.map((q) => ({
      id: q._id,
      videoUrl: q.videoUrl,
      posterUrl: q.posterUrl,
      title: "Gol destacado",
    }));

    return res.json({ status: "success", dateKey, videos });
  } catch (e) {
    return res
      .status(500)
      .json({ status: "error", message: "Server error", error: String(e) });
  }
};

module.exports = {
  upsertQuizDay,
  getTodayQuiz,
  answerQuestion,
  getVideosForDay,
};
