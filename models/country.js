const { Schema, model } = require("mongoose");

const CountrySchema = new Schema({
  name: { type: String, required: true },
  code: { type: String },
  flag: { type: String }
});

module.exports = model("Country", CountrySchema, "countries");