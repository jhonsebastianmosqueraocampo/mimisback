const cron = require("node-cron");
const New = require("../models/new");

const startNewsCleanup = async () => {
  cron.schedule("0 3 * * *", async () => {
    try {
      const result = await New.deleteMany({});
      console.log(`[CRON] Noticias eliminadas: ${result.deletedCount}`);
    } catch (err) {
      console.error("[CRON] Error eliminando noticias:", err.message);
    }
  });
};

module.exports = startNewsCleanup;