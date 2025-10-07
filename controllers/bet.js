const Bet = require("../models/bet");
const PredictionOdds = require("../models/predictionOdds");
const Fixture = require("../models/fixture");

const create = async (req, res) => {
  try {
    const { fixtureId, stake, betType } = req.body;

    if (!fixtureId || !stake || !betType) {
      return res.status(400).json({
        status: "error",
        message: "fixtureId, stake y betType son obligatorios",
      });
    }

    const createdBy = req.user.nickName;
    const userId = req.user.id;

    if (!createdBy || !userId) {
      return res.status(401).json({
        status: "error",
        message: "Usuario no autenticado",
      });
    }

    // generar código de acceso único
    const accessCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    // si quieres que el creador aparezca como primer usuario (sin selección inicial)
    const user = {
      name: createdBy,
      userId,
      selection: {}, // vacío → aún no eligió apuesta
      result: "PENDING", // estado inicial
    };

    const bet = await Bet.create({
      createdBy,
      fixtureId,
      stake,
      betType,
      accessCode,
      users: [user], // 👈 creador ya dentro como usuario
    });

    return res.json({
      status: "success",
      betId: bet._id,
      accessCode,
    });
  } catch (error) {
    console.error("❌ Error creando la apuesta:", error);
    return res.status(500).json({
      status: "error",
      message: "Error creando la apuesta",
    });
  }
};

const infoBetId = async (req, res) => {
  try {
    const { betId } = req.params;
    if (!betId) {
      return res
        .status(400)
        .json({ status: "error", message: "Invalid betId" });
    }
    const bet = await Bet.findById(betId).lean();
    const fixtureId = bet.fixtureId;
    const predictionOdds = await PredictionOdds.findOne({
      fixtureId: fixtureId,
    }).lean();
    const fixture = await Fixture.findOne({ fixtureId: fixtureId }).lean();
    const predictionOddsItem = {
      fixture,
      ...predictionOdds,
    };
    const betInfo = {
      bet,
      predictionOdds: predictionOddsItem,
    };
    return res.json({
      status: "success",
      betInfo,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "Error creando la apuesta",
      betInfo: null,
    });
  }
};

const infoCode = async (req, res) => {
  try {
    const code = req.params;
    if (!code) {
      return res.status(400).json({ status: "error", message: "Invalid code" });
    }
    const bet = await Bet.findOne({ accessCode: code }).lean();
    const fixtureId = bet.fixtureId;
    const predictionOdds = await PredictionOdds.findOne({
      fixtureId: fixtureId,
    }).lean();
    const fixture = await Fixture.findOne({ fixtureId: fixtureId }).lean();
    const predictionOddsItem = {
      fixture,
      ...predictionOdds,
    };
    const betInfo = {
      bet,
      predictionOdds: predictionOddsItem,
    };

    const userId = req.user?.id;
    const currentUser = bet.users.find((u) => u.userId.toString() === userId);
    const alreadyBet = !!(
      currentUser?.selection && Object.keys(currentUser.selection).length > 0
    );

    return res.json({
      status: "success",
      betInfo,
      alreadyBet,
      userSelection: currentUser?.selection || null
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "Error creando la apuesta",
      betInfo: null,
    });
  }
};

const joinBet = async (req, res) => {
  try {
    const { betId } = req.params;
    const { selection } = req.body;

    if (!betId || !selection) {
      return res.status(400).json({
        status: "error",
        message: "betId y selection son obligatorios",
      });
    }

    const userId = req.user.id;
    const name = req.user.nickName;

    const bet = await Bet.findById(betId);
    if (!bet) {
      return res.status(404).json({
        status: "error",
        message: "Apuesta no encontrada",
      });
    }

    // Verificar si ya existe el usuario en esta mesa
    const existingUser = bet.users.find(
      (u) => u.userId.toString() === userId.toString()
    );

    if (existingUser) {
      // actualizar selección
      existingUser.selection = selection;
    } else {
      // agregar nuevo usuario
      bet.users.push({
        userId,
        name,
        selection,
        result: "PENDING",
      });
    }

    await bet.save();

    return res.json({
      status: "success",
      message: "Apuesta registrada correctamente",
    });
  } catch (error) {
    console.error("❌ Error en joinBet:", error);
    return res.status(500).json({
      status: "error",
      message: "Error guardando la apuesta",
    });
  }
};

const myBets = async (req, res) => {
  try {
    const userId = req.user.id;

    // Buscar apuestas creadas o donde el user participa
    const bets = await Bet.find({
      $or: [{ createdBy: userId }, { "users.userId": userId }],
    }).lean();

    if (!bets || bets.length === 0) {
      return res.json({ status: "success", bets: [] });
    }

    const processed = [];
    for (let bet of bets) {
      const fixture = await Fixture.findOne({ fixtureId: bet.fixtureId }).lean();
      if (!fixture) {
        processed.push(bet);
        continue;
      }

      // Validar si terminó el partido
      if (fixture.status.short === "FT") {
        let winners = [];

        // Evaluar selección de cada usuario
        const updatedUsers = bet.users.map((u) => {
          let result = "PENDING";

          if (bet.betType === "RESULT_1X2") {
            const finalResult =
              fixture.goals.home > fixture.goals.away
                ? "LOCAL"
                : fixture.goals.home < fixture.goals.away
                ? "AWAY"
                : "DRAW";

            result = u.selection.pick === finalResult ? "WIN" : "LOSE";
          }

          if (bet.betType === "EXACT_SCORE") {
            result =
              u.selection.home === fixture.goals.home &&
              u.selection.away === fixture.goals.away
                ? "WIN"
                : "LOSE";
          }

          if (bet.betType === "OVER_UNDER") {
            const totalGoals = fixture.goals.home + fixture.goals.away;
            const condition =
              u.selection.side === "OVER"
                ? totalGoals > u.selection.line
                : totalGoals < u.selection.line;

            result = condition ? "WIN" : "LOSE";
          }

          if (result === "WIN") {
            winners.push(u.userId.toString());
          }

          return { ...u, result };
        });

        // Si hay al menos un ganador
        if (winners.length > 0) {
          // Todos los que no estén en winners se marcan como LOSE
          const normalizedUsers = updatedUsers.map((u) => {
            if (winners.includes(u.userId.toString())) {
              return { ...u, result: "WIN" };
            } else {
              return { ...u, result: "LOSE" };
            }
          });

          bet.users = normalizedUsers;
          bet.winners = winners; // 👈 ahora es un array

          // Guardar cambios en DB
          await Bet.updateOne(
            { _id: bet._id },
            {
              $set: {
                users: normalizedUsers,
                winners: winners,
              },
            }
          );
        } else {
          // Nadie ganó => todos quedan en LOSE
          const normalizedUsers = updatedUsers.map((u) => ({
            ...u,
            result: "LOSE",
          }));

          bet.users = normalizedUsers;
          bet.winners = [];

          await Bet.updateOne(
            { _id: bet._id },
            {
              $set: {
                users: normalizedUsers,
                winners: [],
              },
            }
          );
        }
      }
      processed.push(bet);
    }

    return res.json({
      status: "success",
      bets: processed,
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "Error obteniendo apuestas",
    });
  }
};

module.exports = {
  create,
  infoBetId,
  infoCode,
  joinBet,
  myBets
};
