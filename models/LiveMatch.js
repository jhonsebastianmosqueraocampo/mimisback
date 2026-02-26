const { Schema, model } = require("mongoose");

const EventSchema = new Schema(
  {
    time: {
      elapsed: Number, // minuto
      extra: Number, // agregado (opcional)
    },
    team: {
      id: Number,
      name: String,
      logo: String,
    },
    player: {
      id: Number,
      name: String,
    }, // normalmente jugador que “sale” en cambio o anota
    assist: {
      id: Number,
      name: String,
    }, // en cambios: quien “entra”; en gol: asistente
    type: String, // Goal, Card, subst, VAR, etc.
    detail: String, // Yellow Card, Substitution, etc.
    comments: String, // opcional
  },
  { _id: false }
);

const StatItemSchema = new Schema(
  {
    type: String, // e.g. Ball Possession, Total Shots
    value: Schema.Types.Mixed, // "55%" o número
  },
  { _id: false }
);

const TeamStatsSchema = new Schema(
  {
    team: {
      id: Number,
      name: String,
      logo: String,
    },
    statistics: [StatItemSchema],
  },
  { _id: false }
);

const PlayerLiveSchema = new Schema(
  {
    id: Number,
    name: String,
    number: Number,
    pos: String, // G, D, M, F
    grid: String, // "row:col" para posicionar
    photo: String,
    rating: Number,
    isSub: { type: Boolean, default: false }, // entró de cambio
  },
  { _id: false }
);

const TeamLineupSchema = new Schema(
  {
    team: {
      id: Number,
      name: String,
      logo: String,
      coach: {
        id: Number,
        name: String,
        photo: String,
      },
      formation: String,
    },
    startXI: [PlayerLiveSchema],
    substitutes: [PlayerLiveSchema],
  },
  { _id: false }
);

const LiveMatchSchema = new Schema({
  fixtureId: { type: Number, unique: true, required: true },
  fixture: {
    id: Number,
    referee: String,
    timezone: String,
    date: Date,
    timestamp: Number,
    periods: {
      first: Number,
      second: Number,
    },
    venue: {
      id: Number,
      name: String,
      city: String,
    },
    status: {
      long: String,
      short: String,
      elapsed: Number,
    },
  },

  league: {
    id: Number,
    name: String,
    country: String,
    logo: String,
    season: Number,
    round: String,
  },

  status: {
    long: String, // Match Finished, First Half, etc.
    short: String, // FT, 1H, HT, 2H, NS...
    elapsed: Number, // minuto actual (si aplica)
  },

  teams: {
    home: { id: Number, name: String, logo: String },
    away: { id: Number, name: String, logo: String },
  },

  goals: {
    home: Number,
    away: Number,
  },

  // Derivado de /fixtures/events
  events: [EventSchema],

  // Derivado de /fixtures/statistics (2 elementos: home & away)
  statistics: [TeamStatsSchema],

  // Derivado de /fixtures/lineups
  lineups: [TeamLineupSchema],

  lineupsChecked: { type: Boolean, default: false },

  lastUpdated: { type: Date, default: Date.now },
  finalizedAt: { type: Date, default: null },
});

module.exports = model("LiveMatch", LiveMatchSchema);
