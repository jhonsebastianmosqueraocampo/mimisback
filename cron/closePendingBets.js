const cron = require("node-cron");
const Bet = require("../models/bet");
const LiveMatch = require("../models/LiveMatch");
const User = require("../models/user");

const closePendingBets = async () => {
  // cron.schedule("0 * * * *", async () => {
  cron.schedule("* * * * *", async () => {
    console.log("🔁 Revisando apuestas pendientes...");

    try {
      const pendingBets = await Bet.find({ isFinished: false });

      if (pendingBets.length === 0) {
        console.log("✅ No hay apuestas pendientes por cerrar.");
        return;
      }

      for (const bet of pendingBets) {
        const fixture = await LiveMatch.findOne({ fixtureId: bet.fixtureId });
        if (!fixture) continue;

        // Solo cerrar si el partido terminó
        if (fixture.status.short !== "FT") continue;

        console.log(
          `⚽ Cerrando apuesta ${bet._id} del fixture ${fixture.fixtureId}`,
        );

        const totalPot = bet.stake * bet.users.length;
        let winners = [];

        // Evaluar resultados
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

          if (result === "WIN") winners.push(u.userId.toString());

          return { ...u, result };
        });

        const perWinnerReward =
          winners.length > 0 ? totalPot / winners.length : 0;

        // Actualizar puntos y estadísticas de usuarios
        for (const u of updatedUsers) {
          const user = await User.findById(u.userId);
          if (!user) continue;

          if (u.result === "WIN") {
            user.points += perWinnerReward;
            user.xp += Math.floor(perWinnerReward / 10);
            user.betsWon += 1;

            user.pointsHistory.push({
              action: `Ganó apuesta (${bet.betType})`,
              points: perWinnerReward,
            });
          } else {
            const lostPoints = Math.min(user.points, bet.stake);
            user.points -= lostPoints;
            user.betsLost += 1;

            user.pointsHistory.push({
              action: `Perdió apuesta (${bet.betType})`,
              points: -lostPoints,
            });
          }

          user.calculateLevel();
          await user.save();
        }

        await Bet.updateOne(
          { _id: bet._id },
          {
            $set: {
              users: updatedUsers,
              winner: winners,
              isFinished: true,
            },
          },
        );

        console.log(
          `✅ Apuesta ${bet._id} cerrada con ${winners.length} ganadores.`,
        );
      }
    } catch (err) {
      console.error("❌ Error al cerrar apuestas:", err.message);
    }
  });
};

module.exports = closePendingBets;
