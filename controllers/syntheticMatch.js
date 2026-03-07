const SyntheticMatch = require("../models/syntheticMatch");
const User = require("../models/user");

const {
  sendInviteSyntheticEmail,
  approveInviteSyntheticEmail,
  rejectInviteSyntheticEmail,
} = require("../services/mailer");

const toClient = (m) => ({
  ...m.toObject(),
  id: String(m._id),
  _id: undefined,
});

/* =========================
   CREATE INVITATION
========================= */

const createInvitation = async (req, res) => {
  try {
    const userId = req.user.id;

    // evitar múltiples invitaciones pendientes
    const existing = await SyntheticMatch.findOne({
      user: userId,
      status: "invitation",
    });

    if (existing) {
      return res.json({
        status: "error",
        message: "Ya tienes una invitación pendiente.",
      });
    }

    // validar regla 8 días
    const lastMatch = await SyntheticMatch.findOne({
      user: userId,
      status: { $in: ["scheduled", "finished"] },
    }).sort({ scheduledAt: -1 });

    if (lastMatch?.scheduledAt) {
      const diffDays =
        (Date.now() - new Date(lastMatch.scheduledAt)) /
        (1000 * 60 * 60 * 24);

      if (diffDays < 8) {
        return res.json({
          status: "error",
          message:
            "Debes esperar 8 días para volver a solicitar un partido.",
        });
      }
    }

    const match = await SyntheticMatch.create({
      user: userId,
      status: "invitation",
    });

    const user = await User.findById(userId);
    await sendInviteSyntheticEmail({ user });

    return res.json({
      status: "success",
      match: toClient(match),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};

/* =========================
   GET ALL
========================= */

const getAll = async (req, res) => {
  try {
    const matches = await SyntheticMatch.find()
      .populate("user", "nickName email")
      .sort({ createdAt: -1 });

    return res.json({
      status: "success",
      matches: matches.map(toClient),
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};

/* =========================
   APPROVE
========================= */

const approve = async (req, res) => {
  try {
    const { id } = req.params;
    const { location, scheduledAt, liveUrl, homeTeam, awayTeam } = req.body;

    const match = await SyntheticMatch.findById(id).populate("user");

    if (!match) {
      return res.status(404).json({
        status: "error",
        message: "Match not found",
      });
    }

    if (match.status !== "invitation") {
      return res.json({
        status: "error",
        message: "Solo se pueden aprobar invitaciones",
      });
    }

    match.status = "scheduled";
    match.location = location;
    match.scheduledAt = scheduledAt;
    match.liveUrl = liveUrl;
    match.homeTeam = homeTeam;
    match.awayTeam = awayTeam;

    await match.save();

    await approveInviteSyntheticEmail({
      user: match.user,
      match,
    });

    return res.json({ status: "success" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};

/* =========================
   REJECT
========================= */

const reject = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const match = await SyntheticMatch.findById(id).populate("user");

    if (!match) {
      return res.status(404).json({
        status: "error",
        message: "Match not found",
      });
    }

    if (match.status !== "invitation") {
      return res.json({
        status: "error",
        message: "Solo invitaciones pueden rechazarse",
      });
    }

    match.status = "rejected";
    match.rejectionReason = reason;

    await match.save();

    await rejectInviteSyntheticEmail({
      user: match.user,
      reason,
    });

    return res.json({ status: "success" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};

/* =========================
   FINISH MATCH
========================= */

const finishMatch = async (req, res) => {
  try {
    const { id } = req.params;
    const { score, youtubeUrl } = req.body;

    const match = await SyntheticMatch.findById(id);

    if (!match) {
      return res.status(404).json({
        status: "error",
        message: "Match not found",
      });
    }

    if (match.status !== "scheduled") {
      return res.json({
        status: "error",
        message: "Solo partidos programados pueden finalizarse",
      });
    }

    match.status = "finished";
    match.score = score;
    match.youtubeUrl = youtubeUrl;

    await match.save();

    return res.json({ status: "success" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};

module.exports = {
  createInvitation,
  getAll,
  approve,
  reject,
  finishMatch,
};