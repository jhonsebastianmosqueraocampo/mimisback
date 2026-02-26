const Short = require("../models/short");
const path = require("path");
const fs = require("fs");

// ==========================================
// 📌 1. Obtener todos los Shorts
// ==========================================
const shorts = async (req, res) => {
  try {
    const userId = req.user?.id;

    const shorts = await Short.find()
      .sort({ fecha: -1 })
      .populate("comentarios.user", "nickName")
      .lean();

    const formattedShorts = shorts.map(({ _id, likedBy = [], ...rest }) => ({
      id: _id.toString(),
      ...rest,
      favoritos: rest.favoritos ?? likedBy.length,
      liked: userId ? likedBy.some((id) => id.toString() === userId) : false,
    }));

    return res.json({
      status: "success",
      shorts: formattedShorts,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};

// ==========================================
// 📌 2. Crear un Short
// ==========================================
const create = async (req, res) => {
  const { descripcion } = req.body;
  try {
    // Verificar que exista al menos un video
    if (!req.files || !req.files.video || req.files.video.length === 0) {
      console.log("No video file uploaded");
      return res.json({
        status: "error",
        message: "No video provided",
      });
    }

    // Archivos cargados
    const videoFile = req.files.video[0];
    const thumbFile =
      req.files.thumbnail && req.files.thumbnail.length > 0
        ? req.files.thumbnail[0]
        : null;

    const newShort = new Short({
      video: videoFile.filename,
      thumbnail: thumbFile ? thumbFile.filename : "",
      descripcion,
      favoritos: 0,
      comentarios: [],
    });

    await newShort.save();

    const short = {
      ...newShort.toObject(),
      id: newShort._id,
    };

    delete short._id.toString();

    return res.json({
      status: "success",
      short,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "Internal server error. Please, try again",
    });
  }
};

// ==========================================
// 📌 3. Obtener un Short por ID
// ==========================================
const short = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const shortItem = await Short.findById(id)
      .populate("comentarios.user", "nickName")
      .lean();

    if (!shortItem) {
      return res.status(404).json({
        status: "error",
        message: "Short not found",
      });
    }

    const liked = userId
      ? shortItem.likedBy?.some((uid) => uid.toString() === userId)
      : false;

    const { likedBy, ...rest } = shortItem;

    return res.json({
      status: "success",
      short: {
        id: shortItem._id.toString(),
        ...rest,
        favoritos: shortItem.favoritos ?? likedBy.length,
        liked,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};

// ==========================================
// 📌 4. Eliminar Short
// ==========================================
const deleteShort = async (req, res) => {
  try {
    const { id } = req.params;

    await Short.findByIdAndDelete(id);

    return res.json({
      status: "success",
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "Internal server error. Please, try again",
    });
  }
};

// ==========================================
// 📌 5. Actualizar Short
// ==========================================
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { descripcion } = req.body;

    const shortDoc = await Short.findById(id);
    if (!shortDoc) {
      return res.status(404).json({
        status: "error",
        message: "short not found",
      });
    }

    // 📁 Archivos cargados
    const newVideo = req.files?.video?.[0];
    const newThumb = req.files?.thumbail?.[0];

    // 🧩 Actualizar video si se envió uno nuevo
    if (newVideo) {
      const oldVideoPath = path.join(
        __dirname,
        "..",
        "media",
        "shorts",
        shortDoc.video,
      );
      if (fs.existsSync(oldVideoPath)) {
        fs.unlinkSync(oldVideoPath);
      }
      shortDoc.video = `${newVideo.filename}`;
    }

    // 🖼 Actualizar thumbnail si se envió uno nuevo
    if (newThumb) {
      if (shortDoc.thumbnail) {
        const oldThumbPath = path.join(
          __dirname,
          "..",
          "media",
          "shorts",
          shortDoc.thumbail,
        );
        if (fs.existsSync(oldThumbPath)) {
          fs.unlinkSync(oldThumbPath);
        }
      }
      shortDoc.thumbnail = `${newThumb.filename}`;
    }

    //Actualizar descripcion si llega
    if (descripcion) shortDoc.descripcion = descripcion;

    await shortDoc.save();
    return res.json({
      status: "success",
      short: shortDoc,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "Internal server error. Please, try again",
    });
  }
};

// ==========================================
// 📌 6. Agregar comentario
// ==========================================
const comentario = async (req, res) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;
    const userId = req.user.id; // viene desde el middleware auth

    const newComment = {
      user: userId,
      comment,
    };

    await Short.findByIdAndUpdate(
      id,
      { $push: { comentarios: newComment } },
      { new: true },
    );

    const updated = await Short.findById(id)
      .populate("comentarios.user", "nickName")
      .lean();

    return res.json({
      status: "success",
      short: updated,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "Internal server error. Please, try again",
    });
  }
};

// ==========================================
// 📌 7. Incrementar favoritos
// ==========================================
const favorito = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const short = await Short.findById(id);
    if (!short) {
      return res.status(404).json({
        status: "error",
        message: "Short not found",
      });
    }

    const alreadyLiked = short.likedBy.includes(userId);

    if (alreadyLiked) {
      // 🔽 UNLIKE
      short.likedBy.pull(userId);
      short.favoritos = Math.max(0, short.favoritos - 1);
    } else {
      // 🔼 LIKE
      short.likedBy.push(userId);
      short.favoritos += 1;
    }

    await short.save();

    return res.json({
      status: "success",
      liked: !alreadyLiked,
      favoritos: short.favoritos,
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};

const getImage = async (req, res) => {
  try {
    const { filename } = req.params;
    const imagePath = path.join(__dirname, "..", "media", "shorts", filename);
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
    const videoPath = path.join(__dirname, "..", "media", "shorts", filename);
    res.sendFile(videoPath);
  } catch (error) {
    return res.status(404).json({
      status: "error",
      message: "Video not found",
    });
  }
};

module.exports = {
  shorts,
  create,
  short,
  deleteShort,
  update,
  comentario,
  favorito,
  getImage,
  getVideo,
};
