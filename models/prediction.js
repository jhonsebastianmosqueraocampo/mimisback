const { Schema, model } = require("mongoose");

const Tally3Schema = new Schema(
  { home: Number, away: Number, total: Number },
  { _id: false }
);

const Avg3Schema = new Schema(
  { home: String, away: String, total: String },
  { _id: false }
);

const GoalsLeagueSchema = new Schema(
  {
    for: {
      total: Tally3Schema,
      average: Avg3Schema
    },
    against: {
      total: Tally3Schema,
      average: Avg3Schema
    }
  },
  { _id: false }
);

const FixturesLeagueSchema = new Schema(
  {
    played: Tally3Schema,
    wins: Tally3Schema,
    draws: Tally3Schema,
    loses: Tally3Schema
  },
  { _id: false }
);

const Last5Schema = new Schema(
  {
    form: String,
    att: String, 
    def: String,
    goals: {
      for: { total: Number, average: String }, 
      against: { total: Number, average: String }
    }
  },
  { _id: false }
);

const TeamLeagueSummarySchema = new Schema(
  {
    fixtures: FixturesLeagueSchema,
    goals: GoalsLeagueSchema,
    form: String
  },
  { _id: false }
);

const TeamInPredictionSchema = new Schema(
  {
    id: Number,
    name: String,
    logo: String,
    last_5: Last5Schema,
    league: TeamLeagueSummarySchema
  },
  { _id: false }
);

const H2HSchema = new Schema(
  {
    fixture: {
      id: Number,
      date: Date,
      timestamp: Number,
      venue: {
        name: String,
        city: String
      },
      status: { long: String, short: String, elapsed: Number }
    },
    teams: {
      home: { id: Number, name: String, logo: String, winner: Boolean },
      away: { id: Number, name: String, logo: String, winner: Boolean }
    },
    goals: { home: Number, away: Number }
  },
  { _id: false }
);

const PredictionSchema = new Schema(
  {
    fixtureId: { type: Number, required: true, unique: true },

    league: {
      id: Number,
      name: String,
      country: String,
      logo: String,
      flag: String,
      season: Number
    },

    fixture: {
      id: Number,
      date: Date,
      timestamp: Number,
      timezone: String,
      venue: { id: Number, name: String, city: String },
      status: { long: String, short: String, elapsed: Number }
    },

    teams: {
      home: TeamInPredictionSchema,
      away: TeamInPredictionSchema
    },

    comparison: {
      form: { home: String, away: String },
      att: { home: String, away: String },
      def: { home: String, away: String },
      poisson_distribution: { home: String, away: String },
      h2h: { home: String, away: String },
      goals: { home: String, away: String },
      total: { home: String, away: String }
    },

    predictions: {
      winner: { id: Number, name: String, comment: String },
      win_or_draw: Boolean,
      under_over: String,
      goals: { home: String, away: String },
      advice: String,
      percent: { home: String, draw: String, away: String }
    },

    h2h: [H2HSchema],

    cachedAt: { type: Date, default: Date.now },
    lastUpdated: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

module.exports = model("Prediction", PredictionSchema, "predictions");