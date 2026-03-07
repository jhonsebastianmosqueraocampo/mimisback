// cron.schedule("* * * * *", async () => {
require("dotenv").config();
const cron = require("node-cron");

const Fixture = require("../models/fixture");
const Favorite = require("../models/favorite");
const NotificationSetting = require("../models/NotificationSetting");

const { sendPushNotification } = require("./pushService");

const notifyFixtures = async () => {
  cron.schedule("*/15 * * * *", async () => {
    try {
      const now = new Date();
      const in30 = new Date(now.getTime() + 30 * 60 * 1000);

      const fixtures = await Fixture.find({
        date: { $gte: now, $lte: in30 },
        notified: false,
      });

      if (!fixtures.length) return;

      const favorites = await Favorite.find().populate("user");

      const settings = await NotificationSetting.find();

      const settingsMap = new Map();

      settings.forEach((s) => {
        settingsMap.set(String(s.user), s);
      });

      for (const fixture of fixtures) {
        const homeTeam = fixture?.teams?.home?.name;
        const awayTeam = fixture?.teams?.away?.name;

        if (!homeTeam || !awayTeam) continue;

        for (const fav of favorites) {
          const user = fav.user;

          if (!user?.pushToken) continue;

          const isFavTeam =
            fav.equipos.includes(homeTeam) ||
            fav.equipos.includes(awayTeam);

          if (!isFavTeam) continue;

          const userSettings = settingsMap.get(String(user._id));

          // si el usuario nunca configuró settings → se asume "todos"
          if (!userSettings) {
            const msg = `${homeTeam} vs ${awayTeam} comienza en 30 minutos ⚽`;
            await sendPushNotification(user.pushToken, msg);
            continue;
          }

          let allowNotification = false;

          // modo todos
          if (userSettings.teamMode === "todos") {
            allowNotification = true;
          }

          // modo personalizado
          if (userSettings.teamMode === "personalizado") {
            const teamTitles = userSettings.teams.map((t) => t.title);

            if (
              teamTitles.includes(homeTeam) ||
              teamTitles.includes(awayTeam)
            ) {
              allowNotification = true;
            }
          }

          if (!allowNotification) continue;

          const msg = `${homeTeam} vs ${awayTeam} comienza en 30 minutos ⚽`;

          await sendPushNotification(user.pushToken, msg);
        }

        fixture.notified = true;
        await fixture.save();
      }

      console.log(
        `🔔 Notificaciones enviadas para ${fixtures.length} partido(s)`
      );
    } catch (error) {
      console.error("❌ Error en notifyFixtures:", error);
    }
  });
};

module.exports = notifyFixtures;