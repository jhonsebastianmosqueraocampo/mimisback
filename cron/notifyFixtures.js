require("dotenv").config();
const cron = require("node-cron");
const Fixture = require("../models/fixture");
const User = require("../models/user");
const Favorite = require("../models/favorite");
const { sendPushNotification } = require("./pushService");

const notifyFixtures = async () => {
  cron.schedule("*/15 * * * *", async () => {
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 60 * 1000);

    const fixtures = await Fixture.find({
      date: { $gte: now, $lte: in30 },
      notified: false,
    });

    if (!fixtures.length) return;

    const favorites = await Favorite.find().populate("user");

    for (const fixture of fixtures) {
      for (const fav of favorites) {
        const user = fav.user;

        if (!user?.pushToken) continue;

        const isFavTeam =
          fav.equipos.includes(fixture.teams.home.name) ||
          fav.equipos.includes(fixture.teams.away.name);

        if (isFavTeam) {
          const msg = `${fixture.teams.home.name} vs ${fixture.teams.away.name} comienza pronto`;
          await sendPushNotification(user.pushToken, msg);
        }
      }

      fixture.notified = true;
      await fixture.save();
    }

    console.log(
      `🔔 Notificaciones enviadas para ${fixtures.length} partido(s)`
    );
  });
};

module.exports = notifyFixtures;
