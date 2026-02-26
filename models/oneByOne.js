const { Schema, model } = require("mongoose");

/* ===============================
   SUBSCHEMAS
=============================== */

// Jugador en titular/suplente
const PlayerOneByOneSchema = new Schema(
  {
    playerId: Number,
    name: String,
    number: Number,
    pos: String,
    photo: String,
    grid: { type: String, default: null },
    isSub: Boolean,
  },
  { _id: false }
);

// Grupo de titulares/suplentes
const SquadOneByOneSchema = new Schema(
  {
    titulares: [PlayerOneByOneSchema],
    suplentes: [PlayerOneByOneSchema],
  },
  { _id: false }
);

// Rating del jugador
const PlayerRatingSchema = new Schema(
  {
    playerId: Number,
    teamId: Number,
    rating: Number,
    title: String,
    description: String,
  },
  { _id: false }
);

// Equipo
const TeamOneByOneSchema = new Schema(
  {
    teamId: Number,
    name: String,
    logo: String,
    winner: Boolean,
    players: SquadOneByOneSchema,
  },
  { _id: false }
);

/* ===============================
   MODELO PRINCIPAL
=============================== */

const OneByOneSchema = new Schema(
  {
    fixtureId: { type: Number, required: true },

    result: {
      home: { type: Number, required: true },
      away: { type: Number, required: true },
    },

    teams: {
      home: TeamOneByOneSchema,
      away: TeamOneByOneSchema,
    },

    playerRatings: [PlayerRatingSchema],
  },
  { timestamps: true }
);

module.exports = model("OneByOne", OneByOneSchema);