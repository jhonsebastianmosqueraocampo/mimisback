const Short = require("../models/short");
const { PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { s3 } = require("../config/r2");

// ==========================================
// 1. Obtener todos los Shorts
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
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};

// ==========================================
// 2. Crear un Short
// ==========================================
const create = async (req, res) => {
  try {
    const { descripcion } = req.body;

    if (!req.files?.video?.[0]) {
      return res.json({
        status: "error",
        message: "No video provided",
      });
    }

    const videoFile = req.files.video[0];
    const thumbFile = req.files.thumbnail?.[0];

    // Generar nombres únicos
    const videoKey = `videos/shorts/${Date.now()}-${videoFile.originalname}`;
    const thumbKey = thumbFile
      ? `thumbnails/shorts/${Date.now()}-${thumbFile.originalname}`
      : null;

    // Subir video
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: videoKey,
        Body: videoFile.buffer,
        ContentType: videoFile.mimetype,
      })
    );

    // Subir thumbnail
    if (thumbFile) {
      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: thumbKey,
          Body: thumbFile.buffer,
          ContentType: thumbFile.mimetype,
        })
      );
    }

    const videoUrl = `https://media.mimisfutbol.com/${videoKey}`;
    const thumbUrl = thumbKey
      ? `https://media.mimisfutbol.com/${thumbKey}`
      : "";

    const newShort = new Short({
      video: videoUrl,
      thumbnail: thumbUrl,
      descripcion,
      favoritos: 0,
      comentarios: [],
    });

    await newShort.save();

    return res.json({
      status: "success",
      short: newShort,
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "Upload failed",
    });
  }
};

// ==========================================
// 3. Obtener un Short por ID
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
// 4. Eliminar Short
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
// 5. Actualizar Short
// ==========================================
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { descripcion } = req.body;

    const shortDoc = await Short.findById(id);
    if (!shortDoc) {
      return res.status(404).json({
        status: "error",
        message: "Short not found",
      });
    }

    const newVideo = req.files?.video?.[0];
    const newThumb = req.files?.thumbnail?.[0];

    // =========================
    // ACTUALIZAR VIDEO
    // =========================
    if (newVideo) {
      const videoKey = `videos/shorts/${Date.now()}-${newVideo.originalname}`;

      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: videoKey,
          Body: newVideo.buffer,
          ContentType: newVideo.mimetype,
        })
      );

      // Opcional: eliminar el anterior de R2
      if (shortDoc.video) {
        const oldKey = shortDoc.video.split("media.mimisfutbol.com/")[1];

        if (oldKey) {
          await s3.send(
            new DeleteObjectCommand({
              Bucket: process.env.R2_BUCKET,
              Key: oldKey,
            })
          );
        }
      }

      shortDoc.video = `https://media.mimisfutbol.com/${videoKey}`;
    }

    // =========================
    // ACTUALIZAR THUMBNAIL
    // =========================
    if (newThumb) {
      const thumbKey = `thumbnails/shorts/${Date.now()}-${newThumb.originalname}`;

      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: thumbKey,
          Body: newThumb.buffer,
          ContentType: newThumb.mimetype,
        })
      );

      if (shortDoc.thumbnail) {
        const oldThumbKey = shortDoc.thumbnail.split("media.mimisfutbol.com/")[1];

        if (oldThumbKey) {
          await s3.send(
            new DeleteObjectCommand({
              Bucket: process.env.R2_BUCKET,
              Key: oldThumbKey,
            })
          );
        }
      }

      shortDoc.thumbnail = `https://media.mimisfutbol.com/${thumbKey}`;
    }

    // =========================
    // ACTUALIZAR DESCRIPCIÓN
    // =========================
    if (descripcion) {
      shortDoc.descripcion = descripcion;
    }

    await shortDoc.save();

    return res.json({
      status: "success",
      short: shortDoc,
    });

  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};

// ==========================================
//  6. Agregar comentario
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
// 7. Incrementar favoritos
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
      // UNLIKE
      short.likedBy.pull(userId);
      short.favoritos = Math.max(0, short.favoritos - 1);
    } else {
      // LIKE
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

module.exports = {
  shorts,
  create,
  short,
  deleteShort,
  update,
  comentario,
  favorito
};
