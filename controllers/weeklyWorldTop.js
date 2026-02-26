const fs = require("fs");
const path = require("path");
const WorldVideo = require("../models/weekWorldVideo");

const save = async (req, res) => {
  try {
    const { week } = req.body;

    // Verificar que exista al menos un video
    if (!req.files || !req.files.video || req.files.video.length === 0) {
      return res.json({
        status: "error",
        message: "No video provided",
      });
    }

    // Archivos cargados
    const videoFile = req.files.video[0];
    const thumbFile = req.files.thumbail && req.files.thumbail.length > 0
      ? req.files.thumbail[0]
      : null;

    // Crear nuevo registro
    const newVideo = new WorldVideo({
      week, // ejemplo: "14/11/2025"
      video: `${videoFile.filename}`,
      thumbail: thumbFile ? `${thumbFile.filename}` : "",
    });

    await newVideo.save();

    return res.status(200).json({
      status: "success",
      message: "Video and thumbnail saved successfully",
      video: newVideo,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "An error occurred while saving video",
    });
  }
};

const videos = async (req, res) => {
  try {
    const allVideos = await WorldVideo.find().sort({ week: -1 }).lean();

    const videosTop = allVideos.map((v) => ({
      id: v._id.toString(),
      ...v,
    }));

    return res.json({
      status: "success",
      videos: videosTop,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "An error was found. Please, try again",
    });
  }
};

const getWeekVideo = async (req, res) => {
  try {
    const { week } = req.params;
    const video = await WorldVideo.findOne({ week });
    if (!video) {
      return res.status(404).json({
        status: "error",
        message: "Video not found for this week",
      });
    }
    return res.status(200).json({
      status: "success",
      video,
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "An error was found. Please, try again",
    });
  }
};

const deleteWeekVideo = async (req, res) => {
  try {
    const { id } = req.params;
    const video = await WorldVideo.findById(id);

    if (!video) {
      return res.status(404).json({
        status: "error",
        message: "Video not found",
      });
    }

    // Eliminar archivo del sistema
    const videoPath = path.join(__dirname, "..", video.video);
    if (fs.existsSync(videoPath)) {
      fs.unlinkSync(videoPath);
    }

    // Eliminar thumbnail si existe
    if (video.thumbail) {
      const thumbPath = path.join(__dirname, "..", video.thumbail);
      if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
    }

    await video.deleteOne();

    return res.status(200).json({
      status: "success",
      message: "Video deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "An error was found. Please, try again",
    });
  }
};

const updateWeekVideo = async (req, res) => {
  try {
    const { id } = req.params;
    const { week } = req.body;

    const videoDoc = await WorldVideo.findById(id);
    if (!videoDoc) {
      return res.status(404).json({
        status: "error",
        message: "Video not found",
      });
    }

    // 📁 Archivos cargados
    const newVideo = req.files?.video?.[0];
    const newThumb = req.files?.thumbail?.[0];

    // 🧩 Actualizar video si se envió uno nuevo
    if (newVideo) {
      const oldVideoPath = path.join(__dirname, "..", "media", "world", videoDoc.video);
      if (fs.existsSync(oldVideoPath)) {
        fs.unlinkSync(oldVideoPath);
      }
      videoDoc.video = `${newVideo.filename}`;
    }

    // 🖼 Actualizar thumbnail si se envió uno nuevo
    if (newThumb) {
      if (videoDoc.thumbail) {
        const oldThumbPath = path.join(__dirname, "..", "media", "world", videoDoc.thumbail);
        if (fs.existsSync(oldThumbPath)) {
          fs.unlinkSync(oldThumbPath);
        }
      }
      videoDoc.thumbail = `${newThumb.filename}`;
    }

    // 📆 Actualizar fecha de semana si llega
    if (week) videoDoc.week = week;

    await videoDoc.save();

    return res.status(200).json({
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

const getImage = async (req, res) => {
  try {
    const { filename } = req.params;
    const imagePath = path.join(__dirname, "..", "media", "world", filename);
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
    const videoPath = path.join(__dirname, "..", "media", "world", filename);
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
  getImage,
  getVideo,
};