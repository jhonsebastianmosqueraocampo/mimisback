const { Schema, model } = require("mongoose");

const AnswerSchema = new Schema(
  {
    questionId: { type: Schema.Types.ObjectId, required: true },
    selectedIndex: { type: Number, required: true, min: 0, max: 3 },
    isCorrect: { type: Boolean, required: true },
    answeredAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const UserQuizProgressSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    dateKey: { type: String, required: true, index: true }, // "YYYY-MM-DD"
    answers: { type: [AnswerSchema], default: [] },
    score: { type: Number, default: 0 },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Un progreso por usuario por día
UserQuizProgressSchema.index({ user: 1, dateKey: 1 }, { unique: true });

module.exports = model("UserQuizProgress", UserQuizProgressSchema);