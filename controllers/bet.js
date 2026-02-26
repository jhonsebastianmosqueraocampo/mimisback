const Bet = require("../models/bet");
const User = require("../models/user");
const PredictionOdds = require("../models/predictionOdds");
const Fixture = require("../models/fixture");
const LiveMatch = require("../models/LiveMatch");
const mongoose = require("mongoose");

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
    return res.json({
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
    });
  }
};

const infoLiveBetId = async (req, res) => {
  try {
    const { betId } = req.params;

    // 1️⃣ Validar ObjectId
    if (!mongoose.Types.ObjectId.isValid(betId)) {
      return res.status(400).json({
        status: "error",
        message: "betId inválido",
      });
    }

    // 2️⃣ Buscar apuesta
    const bet = await Bet.findById(betId).lean();
    if (!bet) {
      return res.status(404).json({
        status: "error",
        message: "Apuesta no encontrada",
      });
    }
    // 3️⃣ Buscar LiveMatch asociado
    const fixture = await LiveMatch.findOne({
      fixtureId: bet.fixtureId,
    }).lean();

    // 🔥 Agregamos liveMatch
    bet.liveMatch = fixture ?? null;

    if (!fixture) {
      return res.json({
        status: "success",
        bet,
      });
    }

    // 4️⃣ Si ya tiene ganador y está finalizado, devolver directo
    if (bet.winner?.length > 0 && fixture?.status?.short === "FT") {
      return res.json({
        status: "success",
        bet,
      });
    }

    // 5️⃣ Si terminó el partido → evaluar resultados
    if (fixture?.status?.short === "FT") {
      let winners = [];

      const updatedUsers = (bet.users ?? []).map((u) => {
        let result = "PENDING";

        if (bet.betType === "RESULT_1X2") {
          const finalResult =
            fixture.goals.home > fixture.goals.away
              ? "LOCAL"
              : fixture.goals.home < fixture.goals.away
                ? "AWAY"
                : "DRAW";

          result = u?.selection?.pick === finalResult ? "WIN" : "LOSE";
        }

        if (bet.betType === "EXACT_SCORE") {
          result =
            u?.selection?.home === fixture.goals.home &&
            u?.selection?.away === fixture.goals.away
              ? "WIN"
              : "LOSE";
        }

        if (bet.betType === "OVER_UNDER") {
          const totalGoals =
            (fixture.goals.home ?? 0) + (fixture.goals.away ?? 0);

          const condition =
            u?.selection?.side === "OVER"
              ? totalGoals > u?.selection?.line
              : totalGoals < u?.selection?.line;

          result = condition ? "WIN" : "LOSE";
        }

        if (result === "WIN") {
          winners.push(u.userId.toString());
        }

        return { ...u, result };
      });

      const normalizedUsers = updatedUsers.map((u) => ({
        ...u,
        result: winners.includes(u.userId.toString()) ? "WIN" : "LOSE",
      }));

      bet.users = normalizedUsers;
      bet.winner = winners;

      // 6️⃣ Persistir cambios
      await Bet.updateOne(
        { _id: bet._id },
        {
          $set: {
            users: normalizedUsers,
            winner: winners,
          },
        },
      );
    }

    return res.json({
      status: "success",
      bet,
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "Error obteniendo información de la apuesta",
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
      userSelection: currentUser?.selection || null,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "Error creando la apuesta",
    });
  }
};

const joinBet = async (req, res) => {
  console.log(req.body)
  try {
    const { betId } = req.params;
    const { pick, home, away, side, line } = req.body;

    const userId = req.user.id;
    const name = req.user.nickName;

    // 1️⃣ Validar ObjectId
    if (!mongoose.Types.ObjectId.isValid(betId)) {
      return res.status(400).json({
        status: "error",
        message: "betId inválido",
      });
    }

    const bet = await Bet.findById(betId);
    if (!bet) {
      return res.status(404).json({
        status: "error",
        message: "Apuesta no encontrada",
      });
    }

    // 3️⃣ Construir selection dinámicamente según tipo
    let selection = {};

    switch (bet.betType) {
      case "RESULT_1X2":
        const allowedPicks = ["LOCAL", "DRAW", "AWAY"];
        if (!allowedPicks.includes(pick)) {
          return res.status(400).json({
            status: "error",
            message: "Pick inválido",
          });
        }
        selection = { pick };
        break;

      case "EXACT_SCORE":
        if (typeof home !== "number" || typeof away !== "number") {
          return res.status(400).json({
            status: "error",
            message: "Debe enviar home y away como números",
          });
        }
        selection = { home, away };
        break;

      case "OVER_UNDER":
        const allowedSides = ["OVER", "UNDER"];
        if (!allowedSides.includes(side) || typeof line !== "number") {
          return res.status(400).json({
            status: "error",
            message: "Datos inválidos para OVER_UNDER",
          });
        }
        selection = { side, line };
        break;

      default:
        return res.status(400).json({
          status: "error",
          message: "Tipo de apuesta no válido",
        });
    }

    // 4️⃣ Verificar si el usuario ya existe en la apuesta
    const existingUser = bet.users.find(
      (u) => u.userId.toString() === userId.toString(),
    );

    if (existingUser) {
      existingUser.selection = selection;
      existingUser.result = "PENDING";
    } else {
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
    console.error("joinBet error:", error);
    return res.status(500).json({
      status: "error",
      message: "Error interno del servidor",
    });
  }
};

const myBets = async (req, res) => {
  try {
    const userId = req.user.id;

    const bets = await Bet.find({
      $or: [{ createdBy: userId }, { "users.userId": userId }],
    }).lean();

    if (!bets || bets.length === 0) {
      return res.json({ status: "success", bets: [] });
    }

    // 1️⃣ Obtener todos los fixtureIds
    const fixtureIds = bets.map((b) => b.fixtureId);

    // 2️⃣ Traer todos los LiveMatch en una sola query
    const fixtures = await LiveMatch.find({
      fixtureId: { $in: fixtureIds },
    }).lean();

    // 3️⃣ Crear mapa fixtureId → fixture
    const fixtureMap = new Map(fixtures.map((f) => [f.fixtureId, f]));

    const processed = [];

    for (let bet of bets) {
      const fixture = fixtureMap.get(bet.fixtureId) || null;

      // 🔥 Agregamos liveMatch al objeto
      bet.liveMatch = fixture;

      if (!fixture) {
        processed.push(bet);
        continue;
      }

      if (bet.winner?.length > 0 && fixture?.status?.short === "FT") {
        processed.push(bet);
        continue;
      }

      // 4️⃣ Si terminó el partido
      if (fixture?.status?.short === "FT") {
        let winners = [];

        const updatedUsers = bet.users.map((u) => {
          let result = "PENDING";

          if (bet.betType === "RESULT_1X2") {
            const finalResult =
              fixture.goals.home > fixture.goals.away
                ? "LOCAL"
                : fixture.goals.home < fixture.goals.away
                  ? "AWAY"
                  : "DRAW";

            result = u?.selection?.pick === finalResult ? "WIN" : "LOSE";
          }

          if (bet.betType === "EXACT_SCORE") {
            result =
              u?.selection?.home === fixture.goals.home &&
              u?.selection?.away === fixture.goals.away
                ? "WIN"
                : "LOSE";
          }

          if (bet.betType === "OVER_UNDER") {
            const totalGoals =
              (fixture.goals.home ?? 0) + (fixture.goals.away ?? 0);

            const condition =
              u?.selection?.side === "OVER"
                ? totalGoals > u?.selection?.line
                : totalGoals < u?.selection?.line;

            result = condition ? "WIN" : "LOSE";
          }

          if (result === "WIN") {
            winners.push(u.userId.toString());
          }

          return { ...u, result };
        });

        const normalizedUsers = updatedUsers.map((u) => ({
          ...u,
          result: winners.includes(u.userId.toString()) ? "WIN" : "LOSE",
        }));

        bet.users = normalizedUsers;
        bet.winner = winners;

        await Bet.updateOne(
          { _id: bet._id },
          {
            $set: {
              users: normalizedUsers,
              winner: winners, // 👈 corregido (era winners)
            },
          },
        );
      }

      processed.push(bet);
    }

    return res.json({
      status: "success",
      bets: processed,
    });
  } catch (error) {
    console.error("myBets error:", error);
    return res.status(500).json({
      status: "error",
      message: "Error obteniendo apuestas",
    });
  }
};

const betSetResults = async (req, res) => {
  try {
    const { betId } = req.params;
    const { betResume } = req.body; // [{ userId:'', winner:true/false }]

    if (!betId || !Array.isArray(betResume)) {
      return res.json({
        status: "error",
        message: "Parámetros inválidos. Se requiere betId y betResume válido.",
      });
    }

    // 1️⃣ Buscar la apuesta
    const bet = await Bet.findById(betId);
    if (!bet) {
      return res.json({
        status: "error",
        message: "Apuesta no encontrada",
      });
    }

    // 2️⃣ Calcular puntos totales del pozo
    const totalPot = bet.stake * bet.users.length;
    const winners = betResume.filter((r) => r.winner);
    const perWinnerReward = winners.length > 0 ? totalPot / winners.length : 0;

    // 3️⃣ Actualizar los resultados en el array de usuarios dentro de la apuesta
    bet.users = bet.users.map((u) => {
      const found = betResume.find(
        (r) => String(r.userId) === String(u.userId),
      );
      if (found) {
        u.result = found.winner ? "WIN" : "LOSE";
      }
      return u;
    });
    bet.winner = winners.map((w) => w.userId);
    bet.isFinished = true;
    // 4️⃣ Guardar cambios en la apuesta
    await bet.save();

    // 5️⃣ Actualizar puntos y estadísticas de los usuarios
    for (const userRes of betResume) {
      const user = await User.findById(userRes.userId);
      if (!user) continue;

      if (userRes.winner) {
        // 🏆 Ganó: sumar puntos y estadísticas
        user.points += perWinnerReward;
        user.xp += Math.floor(perWinnerReward / 10); // bonus XP proporcional
        user.betsWon += 1;
      } else {
        // ❌ Perdió: restar lo apostado y aumentar perdidas
        user.points = Math.max(0, user.points - bet.stake);
        user.betsLost += 1;
      }

      // 🔄 Recalcular nivel del usuario
      user.calculateLevel();

      await user.save();
    }

    return res.json({
      status: "success",
      message: "Resultados actualizados, puntos y estadísticas aplicadas.",
    });
  } catch (error) {
    console.error("❌ Error en betSetResults:", error);
    return res.json({
      status: "error",
      message: "Error al actualizar los resultados.",
    });
  }
};

module.exports = {
  create,
  infoBetId,
  infoLiveBetId,
  infoCode,
  joinBet,
  myBets,
  betSetResults,
};
