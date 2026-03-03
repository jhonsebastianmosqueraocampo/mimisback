const { Schema, model } = require("mongoose");

const QuizOptionSchema = new Schema(
  {
    label: { type: String, required: true },     // "Mbappé"
    value: { type: String, default: "" },        // opcional: playerId o slug
  },
  { _id: false }
);

const QuizQuestionSchema = new Schema(
  {
    questionText: { type: String, default: "¿Quién marcó este gol?" },
    videoUrl: { type: String, required: true },
    posterUrl: { type: String, default: "" },
    options: { type: [QuizOptionSchema], validate: v => v.length === 4 },
    correctIndex: { type: Number, required: true, min: 0, max: 3 },
  },
  { _id: true, timestamps: false }
);

const QuizDaySchema = new Schema(
  {
    dateKey: { type: String, required: true, unique: true }, // "YYYY-MM-DD"
    questions: { type: [QuizQuestionSchema], default: [] },  // máximo 30
    isPublished: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

module.exports = model("QuizDay", QuizDaySchema);