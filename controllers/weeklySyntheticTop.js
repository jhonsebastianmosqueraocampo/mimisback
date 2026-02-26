const fs = require("fs");
const path = require("path");
const SyntheticVideo = require("../models/weekVideos");
const User = require("../models/user");

// ✅ GUARDAR NUEVO VIDEO
const save = async (req, res) => {
  try {
    const { week, fixtureA, fixtureB, userName } = req.body;

    if (!req.files?.video?.length) {
      return res.json({
        status: "error",
        message: "No video provided",
      });
    }

    const videoFile = req.files.video[0];
    const thumbFile = req.files.thumbail?.[0] || null;

    const userSynthetic = await User.findOne({nickName: userName}).lean();

    const newVideo = new SyntheticVideo({
      week,
      fixture: { teamA: fixtureA || "", teamB: fixtureB || "" },
      user: {
        _id: userSynthetic._id,
        name: userSynthetic.nickName,
      },
      video: `${videoFile.filename}`,
      thumbail: thumbFile ? `${thumbFile.filename}` : "",
      views: 0,
      favorites: 0,
    });

    await newVideo.save();

    return res.json({
      status: "success",
      message: "Video saved successfully",
    });
  } catch (error) {
    console.log(error);
    return res.json({
      status: "error",
      message: "An error occurred while saving video",
    });
  }
};

// ✅ OBTENER TODOS LOS VIDEOS
const videos = async (req, res) => {
  try {
    const userId = req.user?.id;

    const allVideos = await SyntheticVideo.find()
      .sort({ week: -1, createdAt: -1 })
      .lean();

    const videosWithFavoriteFlag = allVideos.map((v) => ({
      ...v,
      isFavorite: userId
        ? v.favorites.some((uid) => uid.toString() === userId)
        : false,
    }));

    return res.json({
      status: "success",
      videos: videosWithFavoriteFlag,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "Error fetching videos",
    });
  }
};

// ✅ OBTENER TODOS LOS VIDEOS DE UNA SEMANA
const getWeekVideo = async (req, res) => {
  try {
    const { week } = req.params;
    const userId = req.user?.id;

    // 🔥 1. Obtener videos ordenados por favoritos
    const videos = await SyntheticVideo.find({ week })
      .sort({ favorites: -1 })
      .lean();

    if (!videos.length) {
      return res.json({
        status: "error",
        message: "No videos found for this week",
      });
    }

    // 🔥 2. Formatear respuesta
    const videosTop = videos.map((v) => {
      const isFavorite = userId
        ? v.likedBy?.some(
            (u) => u.toString() === userId.toString()
          )
        : false;

      return {
        id: v._id.toString(),
        video: v.video,
        thumbail: v.thumbail,
        user: v.user
          ? {
              id: v.user._id?.toString() || "",
              name: v.user.name || "",
            }
          : null,
        fixture: v.fixture || { teamA: "", teamB: "" },
        views: v.views ?? 0,
        favorites: v.favorites ?? 0,
        isFavorite,
        date: v.createdAt,
        week: v.week,
      };
    });

    return res.json({
      status: "success",
      videos: videosTop,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "Error fetching weekly videos",
    });
  }
};

// ✅ ELIMINAR VIDEO
const deleteWeekVideo = async (req, res) => {
  try {
    const { id } = req.params;
    const video = await SyntheticVideo.findById(id);

    if (!video) {
      return res.status(404).json({
        status: "error",
        message: "Video not found",
      });
    }

    // Eliminar archivos físicos
    const videoPath = path.join(__dirname, "..", video.video);
    const thumbPath = path.join(__dirname, "..", video.thumbail);

    if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    if (video.thumbail && fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);

    await video.deleteOne();

    return res.status(200).json({
      status: "success",
      message: "Video deleted successfully",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: "error",
      message: "Error deleting video",
    });
  }
};

// ✅ ACTUALIZAR VIDEO / THUMBNAIL / SEMANA
const updateWeekVideo = async (req, res) => {
  try {
    const { id } = req.params;
    const { week, fixtureA, fixtureB, userId, userName } = req.body;

    const videoDoc = await SyntheticVideo.findById(id);
    if (!videoDoc) {
      return res.json({
        status: "error",
        message: "Video not found",
      });
    }

    const newVideo = req.files?.video?.[0];
    const newThumb = req.files?.thumbail?.[0];

    // 📹 Actualizar video
    if (newVideo) {
      const oldVideoPath = path.join(__dirname, "..", videoDoc.video);
      if (fs.existsSync(oldVideoPath)) fs.unlinkSync(oldVideoPath);
      videoDoc.video = `/media/synthetic/${newVideo.filename}`;
    }

    // 🖼 Actualizar thumbnail
    if (newThumb) {
      const oldThumbPath = path.join(__dirname, "..", videoDoc.thumbail);
      if (videoDoc.thumbail && fs.existsSync(oldThumbPath))
        fs.unlinkSync(oldThumbPath);
      videoDoc.thumbail = `/media/synthetic/${newThumb.filename}`;
    }

    // 📆 Otros datos opcionales
    if (week) videoDoc.week = week;
    if (fixtureA || fixtureB)
      videoDoc.fixture = {
        teamA: fixtureA || videoDoc.fixture.teamA,
        teamB: fixtureB || videoDoc.fixture.teamB,
      };

    if (userId || userName)
      videoDoc.user = {
        _id: userId || videoDoc.user._id,
        name: userName || videoDoc.user.name,
      };

    await videoDoc.save();

    return res.json({
      status: "success",
      message: "Video updated successfully",
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "An error occurred while updating video",
    });
  }
};

const setFavorite = async (req, res) => {
  try {
    const { videoId } = req.params;
    const userId = req.user.id;

    const video = await SyntheticVideo.findById(videoId);
    if (!video) {
      return res.json({
        status: "error",
        message: "Video not found",
      });
    }

    const week = video.week;

    const alreadyFav = video.likedBy.some(
      (id) => id.toString() === userId
    );

    // 📊 votos actuales del usuario esta semana
    const userVotes = await SyntheticVideo.countDocuments({
      week,
      likedBy: userId,
    });

    // ❌ límite SOLO al intentar dar like
    if (userVotes >= 3) {
      return res.json({
        status: "error",
        message: "Límite de 3 votos por semana alcanzado",
        canVote: false,
        votesUsed: userVotes,
      });
    }

    // 🔄 toggle favorito
    let update;
    let voteDelta;

    if (alreadyFav) {
      // 💔 quitar like
      update = {
        $pull: { likedBy: userId },
        $inc: { favorites: -1 },
      };
      voteDelta = -1;
    } else {
      // ❤️ dar like
      update = {
        $addToSet: { likedBy: userId },
        $inc: { favorites: 1 },
      };
      voteDelta = 1;
    }

    const updatedVideo = await SyntheticVideo.findByIdAndUpdate(
      videoId,
      update,
      { new: true }
    );

    // 🛡 seguridad extra
    if (updatedVideo.favorites < 0) {
      updatedVideo.favorites = 0;
      await updatedVideo.save();
    }

    const finalVotes = userVotes + voteDelta;

    return res.json({
      status: "success",
      videoId,
      isFavorite: !alreadyFav,
      favorites: updatedVideo.favorites,
      votesUsed: Math.max(0, finalVotes),
      canVote: finalVotes < 3,
    });
  } catch (error) {
    console.error(error);
    return res.json({
      status: "error",
      message: "Error updating video",
    });
  }
};

const registerView = async (req, res) => {
  try {
    const { videoId } = req.params;

    const video = await SyntheticVideo.findById(videoId);
    if (!video) {
      return res.json({
        status: "error",
        message: "Video not found",
      });
    }

    // 📊 registrar vista
    video.views += 1;
    await video.save();

    return res.json({
      status: "success",
      message: "View registered successfully",
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "Error registering view",
    });
  }
};

const getImage = async (req, res) => {
  try {
    const { filename } = req.params;
    const imagePath = path.join(__dirname, "..", "media", "synthetic", filename);
    res.sendFile(imagePath);
  } catch (error) {
    return res.status(404).json({
      status: "error",
      message: "Image not found",
    });
  }
};

const getVideo = async (req, res) => {
  try {
    const { filename } = req.params;
    const videoPath = path.join(__dirname, "..", "media", "synthetic", filename);
    res.sendFile(videoPath);
  } catch (error) {
    return res.status(404).json({
      status: "error",
      message: "Video not found",
    });
  }
};

module.exports = {
  save,
  videos,
  getWeekVideo,
  deleteWeekVideo,
  updateWeekVideo,
  setFavorite,
  registerView,
  getImage,
  getVideo,
};
