const NotificationSetting = require('../models/NotificationSetting')

const saveNotificationSettings = async (req, res) => {
  try {
    const userId = req.user.id;

    const { teamMode, teams, playerMode, players } = req.body;

    const settings = await NotificationSetting.findOneAndUpdate(
      { user: userId },
      {
        teamMode,
        teams,
        playerMode,
        players,
      },
      {
        new: true,
        upsert: true,
      },
    );

    return res.json({
      status: "success",
      settings,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: error.message,
    });
  }
};

const getNotificationSettings = async (req, res) => {
  try {
    const userId = req.user.id;

    const settings = await NotificationSetting.findOne({ user: userId });

    return res.json({
      status: "success",
      settings,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: error.message,
    });
  }
};

module.exports = {
    saveNotificationSettings,
    getNotificationSettings
}