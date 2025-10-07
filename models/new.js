const { Schema, model } = require("mongoose");

const NewsSchema = new Schema({
    theme: { type: String, required: true },
    title: { type: String, required: true },
    url: { type: String, required: true, unique: true },
    source: { type: String },
    publishedAt: { type: String },
  },
  { timestamps: true }
);

module.exports = model("New", NewsSchema, 'news');