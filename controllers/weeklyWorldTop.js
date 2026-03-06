const WorldVideo = require("../models/weekWorldVideo");
const { uploadToR2, deleteFromR2 } = require("../config/r2");

const save = async (req, res) => {
  try {
    const { week, leagueName } = req.body;

    if (!req.files?.video?.length) {
      return res.json({
        status: "error",
        message: "No video provided",
      });
    }

    const videoFile = req.files.video[0];
    const thumbFile = req.files?.thumbail?.[0] || null;

    const videoUrl = await uploadToR2({
      buffer: videoFile.buffer,
      mimetype: videoFile.mimetype,
      folder: "world/videos",
      filename: videoFile.originalname,
    });

    let thumbUrl = "";

    if (thumbFile) {
      thumbUrl = await uploadToR2({
        buffer: thumbFile.buffer,
        mimetype: thumbFile.mimetype,
        folder: "world/thumbs",
        filename: thumbFile.originalname,
      });
    }

    const newVideo = new WorldVideo({
      week,
      leagueName: (leagueName || "").trim(),
      video: videoUrl,
      thumbail: thumbUrl,
    });

    await newVideo.save();

    return res.status(200).json({
      status: "success",
      message: "Video saved successfully",
      video: newVideo,
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "Error saving video",
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

    if (video.video) {
      await deleteFromR2(video.video);
    }

    if (video.thumbail) {
      await deleteFromR2(video.thumbail);
    }

    await video.deleteOne();

    return res.status(200).json({
      status: "success",
      message: "Video deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "Error deleting video",
    });
  }
};

const updateWeekVideo = async (req, res) => {
  try {
    const { id } = req.params;
    const { week, leagueName } = req.body;

    const videoDoc = await WorldVideo.findById(id);
    if (!videoDoc) {
      return res.status(404).json({
        status: "error",
        message: "Video not found",
      });
    }

    const newVideo = req.files?.video?.[0];
    const newThumb = req.files?.thumbail?.[0];

    if (newVideo) {
      if (videoDoc.video) {
        await deleteFromR2(videoDoc.video);
      }

      const newVideoUrl = await uploadToR2({
        buffer: newVideo.buffer,
        mimetype: newVideo.mimetype,
        folder: "world/videos",
        filename: newVideo.originalname,
      });

      videoDoc.video = newVideoUrl;
    }

    if (newThumb) {
      if (videoDoc.thumbail) {
        await deleteFromR2(videoDoc.thumbail);
      }

      const newThumbUrl = await uploadToR2({
        buffer: newThumb.buffer,
        mimetype: newThumb.mimetype,
        folder: "world/thumbs",
        filename: newThumb.originalname,
      });

      videoDoc.thumbail = newThumbUrl;
    }

    if (week) videoDoc.week = week;
    if (typeof leagueName === "string") {
      videoDoc.leagueName = leagueName.trim();
    }

    await videoDoc.save();

    return res.status(200).json({
      status: "success",
      message: "Video updated successfully",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: "error",
      message: "Error updating video",
    });
  }
};

module.exports = {
  save,
  videos,
  getWeekVideo,
  deleteWeekVideo,
  updateWeekVideo,
};
