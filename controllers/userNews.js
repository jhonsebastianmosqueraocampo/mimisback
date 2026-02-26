const UserNew = require("../models/userNew");
const path = require("path");

// ================================
// 📌 1. Obtener *una noticia* por ID
// ================================
const getUserNew = async (req, res) => {
  try {
    const { id } = req.params;

    const found = await UserNew.findById(id);

    if (!found) {
      return res.json({
        status: "error",
        message: "Noticia no encontrada",
      });
    }

    return res.json({
      status: "success",
      news: found,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "Error interno del servidor",
    });
  }
};

// ======================================
// 📌 2. Todas las noticias globales (ordenadas por fecha)
// ======================================
const getGeneralNews = async (req, res) => {
  try {
    const newsDocs = await UserNew.find().sort({ fecha: -1 });

    const news = newsDocs.map((n) => {
      const obj = n.toObject();
      return {
        ...obj,
        id: obj._id,
        _id: undefined,
      };
    });

    return res.json({
      status: "success",
      news,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "Error interno del servidor",
    });
  }
};

// ================================
// 📌 3. Crear noticia
// ================================
const createNew = async (req, res) => {
  try {
    const userId = req.user.id;
    const userName = req.user.nickName;
    const {
      titulo,
      entidad,
      urlFotoPrincipal,
      desarrolloInicialNoticia,
      desarrolloFinalNoticia,
    } = req.body;

    // =========================
    // FOTO PRINCIPAL
    // =========================
    const fotoPrincipalFile = req.files.find(
      (f) => f.fieldname === "fotoPrincipal",
    );

    const fotoPrincipal = fotoPrincipalFile ? fotoPrincipalFile.filename : null;

    // =========================
    // CARRUSEL
    // =========================
    let carruselMeta = [];

    if (req.body.carruselFotos) {
      const parsed = JSON.parse(req.body.carruselFotos);

      carruselMeta = parsed.map((item) => {
        // buscar el archivo que corresponde a esta referencia
        const file = req.files.find((f) => f.fieldname === item.foto);

        return {
          foto: file ? file.filename : item.foto, // filename real
          url: item.url,
        };
      });
    }

    // =========================
    // GUARDAR NOTICIA
    // =========================
    const newNew = new UserNew({
      user: { id: userId, name: userName },
      titulo,
      entidad,
      fotoPrincipal,
      urlFotoPrincipal,
      desarrolloInicialNoticia,
      carruselFotos: carruselMeta,
      desarrolloFinalNoticia,
      fecha: new Date(),
    });

    await newNew.save();

    return res.json({
      status: "success",
      message: "Noticia creada correctamente",
      news: newNew,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: "error",
      message: "Error interno del servidor",
    });
  }
};

// ================================
// 📌 4. Editar noticia
// ================================
const editNew = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const existing = await UserNew.findById(id);

    if (!existing) {
      return res.json({
        status: "error",
        message: "Noticia no encontrada",
      });
    }

    // Seguridad: solo el dueño puede editar
    if (existing.user.id.toString() !== userId.toString()) {
      return res.json({
        status: "error",
        message: "No autorizado para editar esta noticia",
      });
    }

    const {
      titulo,
      entidad,
      urlFotoPrincipal,
      desarrolloInicialNoticia,
      desarrolloFinalNoticia,
    } = req.body;

    // =========================
    // FOTO PRINCIPAL
    // =========================
    let fotoPrincipal = existing.fotoPrincipal;

    const fotoPrincipalFile = req.files.find(
      (f) => f.fieldname === "fotoPrincipal",
    );

    if (fotoPrincipalFile) {
      fotoPrincipal = fotoPrincipalFile.filename;
    }

    // =========================
    // CARRUSEL
    // =========================
    let carruselFinal = [];

    if (req.body.carruselFotos) {
      const carruselMeta = JSON.parse(req.body.carruselFotos);

      carruselFinal = carruselMeta.map((item) => {
        const file = req.files.find((f) => f.fieldname === item.foto);

        return {
          foto: file ? file.filename : item.foto, // mantiene o reemplaza
          url: item.url,
        };
      });
    } else {
      // si no llega carruselFotos, mantenemos el existente
      carruselFinal = existing.carruselFotos;
    }

    // =========================
    // ACTUALIZAR NOTICIA
    // =========================
    const updated = await UserNew.findByIdAndUpdate(
      id,
      {
        titulo,
        entidad,
        fotoPrincipal,
        urlFotoPrincipal,
        desarrolloInicialNoticia,
        desarrolloFinalNoticia,
        carruselFotos: carruselFinal,
      },
      { new: true },
    );

    return res.json({
      status: "success",
      message: "Noticia actualizada correctamente",
      news: updated,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: "error",
      message: "Error interno del servidor",
    });
  }
};

// ================================
// 📌 5. Eliminar noticia
// ================================
const deleteNew = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // 1. Verificar si existe
    const existing = await UserNew.findById(id);

    if (!existing) {
      return res.json({
        status: "error",
        message: "Noticia no encontrada",
      });
    }

    // 2. Seguridad: solo el dueño puede eliminar
    if (existing.user.id.toString() !== userId.toString()) {
      return res.json({
        status: "error",
        message: "No autorizado para eliminar esta noticia",
      });
    }

    // 3. Eliminar noticia
    await UserNew.findByIdAndDelete(id);

    // 4. Obtener nuevamente TODAS las noticias del usuario
    const updatedNews = await UserNew.find({ "user.id": userId })
      .sort({ fecha: -1 })
      .lean();

    // 5. Respuesta final
    return res.json({
      status: "success",
      message: "Noticia eliminada correctamente",
      news: updatedNews,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "Error interno del servidor",
    });
  }
};

// ================================
// 📌 6. Noticias del usuario actual
// ================================
const getNews = async (req, res) => {
  try {
    const userId = req.user.id;

    const news = await UserNew.find({ "user.id": userId })
      .sort({ fecha: -1 })
      .lean();

    const formattedNews = news.map(({ _id, ...rest }) => ({
      id: _id.toString(),
      ...rest,
    }));

    return res.json({
      status: "success",
      news: formattedNews,
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "Error interno del servidor",
    });
  }
};

const getImage = async (req, res) => {
  try {
    const { filename } = req.params;
    const imagePath = path.join(__dirname, "..", "media", "news", filename);
    res.sendFile(imagePath);
  } catch (error) {
    return res.status(404).json({
      status: "error",
      message: "Image not found",
    });
  }
};

module.exports = {
  getNews,
  deleteNew,
  createNew,
  editNew,
  getGeneralNews,
  getUserNew,
  getImage
};
