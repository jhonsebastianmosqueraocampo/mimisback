const StoreUser = require("../models/storeUser");
const Store = require("../models/store");
const Product = require("../models/product");
const Order = require("../models/order");
const User = require("../models/user");
const jwt = require("../services/jwt");
const bcrypt = require("bcrypt");
const { sendInviteEmail } = require("../services/mailer");
const path = require("path");
const fs = require("fs");
const { sendStatusEmail } = require("../services/mailer");

/* ================= HELPERS ================= */

const generateRandomCode = (length = 8) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < length; i++)
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
};

const requireStoreUser = (req) => {
  if (!req.user?.id) throw new Error("Missing storeUser auth");
};

const requireAppUser = (req) => {
  if (!req.user?.id) throw new Error("Missing app user auth");
};

const requireAuth = (req) => {
  if (!req.user?.id) {
    const err = new Error("Missing auth");
    err.code = 401;
    throw err;
  }
};

const getStoreUserOrFail = async (req) => {
  requireAuth(req);
  const storeUser = await StoreUser.findById(req.user.id);
  if (!storeUser) {
    const err = new Error("StoreUser not found");
    err.code = 401;
    throw err;
  }
  return storeUser;
};

const isAdminRole = (storeUser) => storeUser.role === "admin";
const isStoreManagerRole = (storeUser) => storeUser.role === "store";

/** Obtiene IDs de tiendas del store manager */
const getMyStoreIds = async (storeUserId) => {
  const stores = await Store.find({ owner: storeUserId }).select("_id");
  return stores.map((s) => String(s._id));
};

/** Verifica si un store pertenece al store manager */
const assertStoreOwnership = async ({ storeId, storeUserId }) => {
  const store = await Store.findOne({ _id: storeId, owner: storeUserId });
  if (!store) {
    const err = new Error("Store not found or not owned by user");
    err.code = 403;
    throw err;
  }
  return store;
};

/* ================= helpers images ================= */
// arma URL local para servir archivos (luego será GCS)
const toLocalImageUrl = (req, filename) => {
  return filename;
};

// agrupa req.files por fieldname
const groupFilesByField = (files = []) => {
  const map = {};
  for (const f of files) {
    if (!map[f.fieldname]) map[f.fieldname] = [];
    map[f.fieldname].push(f);
  }
  return map;
};

/* ================= AUTH / ONBOARDING (WEB) ================= */

/**
 * ADMIN WEB: genera código para invitar/crear un StoreUser (gestor tienda).
 */
const generateCode = async (req, res) => {
  try {
    const storeUser = await getStoreUserOrFail(req);

    if (!isAdminRole(storeUser)) {
      return res
        .status(403)
        .json({ status: "error", message: "bad permissions" });
    }

    const { email } = req.body;
    if (!email) {
      return res
        .status(400)
        .json({ status: "error", message: "email is required" });
    }

    let code = generateRandomCode();
    while (await StoreUser.findOne({ code })) {
      code = generateRandomCode();
    }

    await StoreUser.create({
      email,
      code,
      role: "store", // 👈 el dueño/gestor de tienda (web)
      isRegister: false,
    });

    try {
      await sendInviteEmail({ to: email, code });
    } catch (mailError) {
      console.error("❌ Email send failed:", mailError);
      return res.json({
        status: "success",
        message: "Code generated but email failed",
      });
    }

    return res.json({
      status: "success",
      message: "Code generated successfully",
    });
  } catch (error) {
    console.log(error);
    return res.json({
      status: "error",
      message: "Internal server error. Please, try again",
    });
  }
};

/**
 * WEB STORE MANAGER: completa registro usando el código.
 * Esto activa la cuenta de StoreUser (role store).
 */
const completeStoreUserRegistration = async (req, res) => {
  try {
    const { code, nickName, password, company, phone, phoneSecondary, nit } =
      req.body;

    if (!code || !nickName || !password) {
      return res.status(400).json({
        status: "error",
        message: "code, nickName and password are required",
      });
    }

    // ✅ VALIDACIÓN DEL CÓDIGO
    const user = await StoreUser.findOne({
      code,
      isRegister: false,
      role: "store",
    });

    if (!user) {
      return res.status(400).json({
        status: "error",
        message: "Invalid or already used code",
      });
    }

    user.nickName = nickName;
    user.password = await bcrypt.hash(password, 10);
    user.company = company ?? user.company;
    user.phone = phone ?? user.phone;
    user.phoneSecondary = phoneSecondary ?? user.phoneSecondary;
    user.nit = nit ?? user.nit;

    // ✅ si usas multer: upload.single("companyLogo")
    if (req.file?.filename) {
      user.companyLogo = req.file.filename;
    }

    user.isRegister = true;
    await user.save();
    const token = jwt.generateAccessToken(user);
    return res.json({
      status: "success",
      message: "Store user registered successfully",
      user,
      token,
    });
  } catch (error) {
    return res.json({ status: "error", message: "Internal server error" });
  }
};

/**
 * WEB (admin/store): login StoreUser
 */
const login = async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({
        status: "error",
        message: "Identifier and password are required",
      });
    }

    const user = await StoreUser.findOne({
      $or: [{ nickName: identifier }, { email: identifier }],
    });

    if (!user) {
      return res.status(404).json({
        status: "error",
        message: "User not found",
      });
    }

    if (!user.isRegister) {
      return res.status(403).json({
        status: "error",
        message: "User not registered",
      });
    }

    const validatePassword = await bcrypt.compare(password, user.password);
    if (!validatePassword) {
      return res.status(401).json({
        status: "error",
        message: "User or password incorrect",
      });
    }

    const token = jwt.generateAccessToken(user);
    return res.json({ status: "success", token });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};

/* ================= STORES (WEB store manager) ================= */

/** WEB STORE MANAGER: crear tienda */
const registerStore = async (req, res) => {
  try {
    const storeUser = await getStoreUserOrFail(req);

    if (!isStoreManagerRole(storeUser) && !isAdminRole(storeUser)) {
      return res
        .status(403)
        .json({ status: "error", message: "bad permissions" });
    }

    const { name, phone } = req.body;
    if (!name)
      return res
        .status(400)
        .json({ status: "error", message: "name is required" });

    let parsedLocation;

    if (!req.body.location) {
      return res.status(400).json({
        status: "error",
        message: "location is required",
      });
    }

    try {
      parsedLocation = JSON.parse(req.body.location);
    } catch {
      return res.status(400).json({
        status: "error",
        message: "invalid location format",
      });
    }

    if (
      !parsedLocation ||
      parsedLocation.type !== "Point" ||
      !Array.isArray(parsedLocation.coordinates) ||
      parsedLocation.coordinates.length !== 2
    ) {
      return res.status(400).json({
        status: "error",
        message: "invalid location structure",
      });
    }

    const [lng, lat] = parsedLocation.coordinates;

    if (
      typeof lat !== "number" ||
      typeof lng !== "number" ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return res.status(400).json({
        status: "error",
        message: "invalid latitude or longitude",
      });
    }

    const imageUrl = req.file?.filename ? req.file.filename : undefined;

    const store = await Store.create({
      owner: storeUser._id,
      name,
      phone,
      location: {
        type: "Point",
        coordinates: [lng, lat],
      },
      image: imageUrl,
    });

    return res.json({ status: "success", store });
  } catch (error) {
    return res
      .status(error.code || 500)
      .json({ status: "error", message: "Internal server error" });
  }
};

const editStore = async (req, res) => {
  try {
    const storeUser = await getStoreUserOrFail(req);

    if (!isStoreManagerRole(storeUser) && !isAdminRole(storeUser)) {
      return res
        .status(403)
        .json({ status: "error", message: "bad permissions" });
    }

    const { storeId } = req.params;

    const store = await Store.findById(storeId);
    if (!store) {
      return res
        .status(404)
        .json({ status: "error", message: "Store not found" });
    }

    // 🔐 Si no es admin, debe ser dueño
    if (
      !isAdminRole(storeUser) &&
      String(store.owner) !== String(storeUser._id)
    ) {
      return res
        .status(403)
        .json({ status: "error", message: "Store not owned by user" });
    }

    const { name, phone } = req.body;

    // 🔹 Validar nombre
    if (name !== undefined) {
      if (String(name).trim().length < 3) {
        return res.status(400).json({
          status: "error",
          message: "Invalid store name",
        });
      }
      store.name = String(name).trim();
    }

    // 🔹 Teléfono opcional
    if (phone !== undefined) {
      store.phone = String(phone).trim();
    }

    // 🔥 Ubicación (GeoJSON)
    if (req.body.location) {
      let parsedLocation;

      try {
        parsedLocation = JSON.parse(req.body.location);
      } catch {
        return res.status(400).json({
          status: "error",
          message: "Invalid location format",
        });
      }

      if (
        !parsedLocation ||
        parsedLocation.type !== "Point" ||
        !Array.isArray(parsedLocation.coordinates) ||
        parsedLocation.coordinates.length !== 2
      ) {
        return res.status(400).json({
          status: "error",
          message: "Invalid location structure",
        });
      }

      const [lng, lat] = parsedLocation.coordinates;

      if (
        typeof lat !== "number" ||
        typeof lng !== "number" ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180
      ) {
        return res.status(400).json({
          status: "error",
          message: "Invalid latitude or longitude",
        });
      }

      store.location = {
        type: "Point",
        coordinates: [lng, lat], // ⚠ SIEMPRE [lng, lat]
      };
    }

    // 🖼 Imagen opcional
    if (req.file?.filename) {
      store.image = req.file.filename;
    }

    await store.save();

    return res.json({
      status: "success",
      store,
    });
  } catch (error) {
    console.error(error);
    return res.status(error.code || 500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};

/** WEB STORE MANAGER: actualizar tienda (solo si es dueño) */
const updateStore = async (req, res) => {
  try {
    const storeUser = await getStoreUserOrFail(req);

    // 🔐 Solo admin o store manager
    if (!isStoreManagerRole(storeUser) && !isAdminRole(storeUser)) {
      return res
        .status(403)
        .json({ status: "error", message: "bad permissions" });
    }

    const { storeId } = req.params;

    const store = await Store.findById(storeId);
    if (!store) {
      return res
        .status(404)
        .json({ status: "error", message: "Store not found" });
    }

    // Si no es admin, debe ser dueño
    if (!isAdminRole(storeUser)) {
      if (String(store.owner) !== String(storeUser._id)) {
        return res
          .status(403)
          .json({ status: "error", message: "Store not owned by user" });
      }
    }

    const { name, phone } = req.body;

    // Actualizar campos simples
    if (name !== undefined) {
      if (String(name).trim().length < 3) {
        return res.status(400).json({
          status: "error",
          message: "Invalid store name",
        });
      }
      store.name = String(name).trim();
    }

    if (phone !== undefined) {
      store.phone = String(phone).trim();
    }

    // Actualizar ubicación si viene
    if (req.body.location) {
      let parsedLocation;

      try {
        parsedLocation = JSON.parse(req.body.location);
      } catch {
        return res.status(400).json({
          status: "error",
          message: "Invalid location format",
        });
      }

      if (
        !parsedLocation ||
        parsedLocation.type !== "Point" ||
        !Array.isArray(parsedLocation.coordinates) ||
        parsedLocation.coordinates.length !== 2
      ) {
        return res.status(400).json({
          status: "error",
          message: "Invalid location structure",
        });
      }

      const [lng, lat] = parsedLocation.coordinates;

      if (
        typeof lat !== "number" ||
        typeof lng !== "number" ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180
      ) {
        return res.status(400).json({
          status: "error",
          message: "Invalid latitude or longitude",
        });
      }

      store.location = {
        type: "Point",
        coordinates: [lng, lat],
      };
    }

    // 🖼 Imagen opcional
    if (req.file?.filename) {
      store.image = req.file.filename;
    }

    await store.save();

    return res.json({
      status: "success",
      store,
    });
  } catch (error) {
    console.error(error);

    return res.status(error.code || 500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};

/** WEB STORE MANAGER: eliminar tienda (solo si es dueño) */
const deleteStore = async (req, res) => {
  try {
    const storeUser = await getStoreUserOrFail(req);
    if (!isStoreManagerRole(storeUser) && !isAdminRole(storeUser)) {
      return res
        .status(403)
        .json({ status: "error", message: "bad permissions" });
    }

    const { storeId } = req.params;

    if (!isAdminRole(storeUser)) {
      await assertStoreOwnership({ storeId, storeUserId: req.user.id });
    }

    await Store.deleteOne({ _id: storeId });
    return res.json({ status: "success", message: "Store deleted" });
  } catch (error) {
    return res
      .status(error.code || 500)
      .json({ status: "error", message: "Internal server error" });
  }
};

/* ================= PRODUCTS (APP + WEB) ================= */

/** APP: listar productos global paginado */
const productsList = async (req, res) => {
  try {
    const page = Math.max(Number(req.params.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);

    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);

    if (
      isNaN(lat) ||
      isNaN(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return res.status(400).json({
        status: "error",
        message: "Invalid coordinates",
      });
    }

    // 🔥 1️⃣ Buscar tiendas a 20km
    const nearbyStores = await Store.find({
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [lng, lat],
          },
          $maxDistance: 20000, // 20km
        },
      },
    })
      .select("_id name")
      .lean();

    if (!nearbyStores.length) {
      return res.json({
        status: "success",
        page,
        limit,
        total: 0,
        totalPages: 0,
        hasNext: false,
        products: [],
      });
    }

    const storeIds = nearbyStores.map((s) => s._id);

    const storeNameById = new Map(
      nearbyStores.map((s) => [String(s._id), s.name]),
    );

    // 🔥 2️⃣ Filtro por tiendas cercanas
    const filter = {
      "variants.storeConfigs.storeId": { $in: storeIds },
    };

    const [products, total] = await Promise.all([
      Product.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter),
    ]);

    const enriched = products.map((p) => ({
      ...p,
      id: String(p._id),
      _id: undefined,
      variants: (p.variants || []).map((v) => ({
        ...v,
        storeConfigs: (v.storeConfigs || [])
          .filter((sc) => storeNameById.has(String(sc.storeId))) // 🔥 solo tiendas cercanas
          .map((sc) => ({
            ...sc,
            storeId: String(sc.storeId),
            storeName: storeNameById.get(String(sc.storeId)),
          })),
      })),
    }));

    const totalPages = Math.max(Math.ceil(total / limit), 1);

    return res.json({
      status: "success",
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      products: enriched,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};

const productsOwner = async (req, res) => {
  try {
    const storeUser = await getStoreUserOrFail(req);
    if (storeUser.role !== "admin" && storeUser.role !== "store") {
      return res
        .status(403)
        .json({ status: "error", message: "bad permissions" });
    }

    const stores = await Store.find({ owner: storeUser._id }).select("_id");
    const storeIds = stores.map((s) => s._id);

    const products = await Product.find({
      "variants.storeConfigs.storeId": { $in: storeIds },
    }).sort({ createdAt: -1 });

    return res.json({ status: "success", products });
  } catch (e) {
    return res
      .status(500)
      .json({ status: "error", message: "Internal server error" });
  }
};

/** APP: productos por categoría paginado */
const productsByCategory = async (req, res) => {
  try {
    const { category, page } = req.params;
    const limit = 10;

    const products = await Product.find({ category })
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * limit)
      .limit(limit);

    return res.json({ status: "success", products });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: "error", message: "Internal server error" });
  }
};

/**
 * WEB: listar productos de una tienda (paginado)
 * Se filtra por storeId dentro de variants.storeConfigs.storeId
 */
const productsByStore = async (req, res) => {
  try {
    requireStoreUser(req);
    if (!isStoreManagerRole(req) && !isAdmin(req)) {
      return res
        .status(403)
        .json({ status: "error", message: "bad permissions" });
    }

    const { storeId, page } = req.params;
    const limit = 10;

    if (!isAdmin(req)) {
      await assertStoreOwnership({ storeId, storeUserId: req.user.id });
    }

    const products = await Product.find({
      "variants.storeConfigs.storeId": storeId,
    })
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * limit)
      .limit(limit);

    return res.json({ status: "success", products });
  } catch (error) {
    console.error(error);
    return res
      .status(error.code || 500)
      .json({ status: "error", message: "Internal server error" });
  }
};

/**
 * WEB: eliminar producto (solo si pertenece a alguna tienda del dueño)
 * Nota: si un producto está compartido por varias tiendas, esto lo borraría global.
 * Si quieres multi-tienda real, mejor “desvincular storeConfigs” en vez de borrar.
 */
const deleteProduct = async (req, res) => {
  try {
    requireStoreUser(req);
    if (!isStoreManagerRole(req) && !isAdmin(req)) {
      return res
        .status(403)
        .json({ status: "error", message: "bad permissions" });
    }

    const { productId } = req.params;

    if (!isAdmin(req)) {
      const myStoreIds = await getMyStoreIds(req.user.id);
      const canTouch = await Product.findOne({
        _id: productId,
        "variants.storeConfigs.storeId": { $in: myStoreIds },
      }).select("_id");

      if (!canTouch) {
        return res
          .status(403)
          .json({ status: "error", message: "Not allowed for this product" });
      }
    }

    await Product.deleteOne({ _id: productId });
    return res.json({ status: "success", message: "Product deleted" });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: "error", message: "Internal server error" });
  }
};

const createProduct = async (req, res) => {
  try {
    const storeUser = await getStoreUserOrFail(req);

    const { name, description, category } = req.body;
    if (!name || !category) {
      return res.status(400).json({
        status: "error",
        message: "name and category are required",
      });
    }

    let variants = [];
    try {
      variants = JSON.parse(req.body.variants || "[]");
    } catch {
      return res.status(400).json({
        status: "error",
        message: "variants must be valid JSON",
      });
    }

    if (!Array.isArray(variants) || variants.length === 0) {
      return res.status(400).json({
        status: "error",
        message: "variants is required",
      });
    }

    /* ================= OWNERSHIP VALIDATION ================= */

    // 1) recolectar storeIds únicos
    const storeIds = [
      ...new Set(
        variants.flatMap((v) =>
          (v.storeConfigs || []).map((sc) => String(sc.storeId)),
        ),
      ),
    ];

    if (storeIds.length === 0) {
      return res.status(400).json({
        status: "error",
        message: "storeId is required in variants.storeConfigs",
      });
    }

    // 2) validar que TODAS las tiendas sean del usuario
    const ownedStores = await Store.find({
      _id: { $in: storeIds },
      owner: storeUser._id,
    })
      .select("_id")
      .lean();

    if (ownedStores.length !== storeIds.length) {
      return res.status(403).json({
        status: "error",
        message: "You are not the owner of one or more stores",
      });
    }

    /* ================= BUILD PRODUCT ================= */

    const filesByField = groupFilesByField(req.files);

    const finalVariants = variants.map((v, idx) => {
      const newFiles = filesByField[`variantImages_${idx}`] || [];
      const newUrls = newFiles.map((f) => toLocalImageUrl(req, f.filename));

      return {
        color: v.color,
        colorHex: v.colorHex,
        images: [...(v.existingImages || []), ...newUrls],
        storeConfigs: (v.storeConfigs || []).map((s) => ({
          storeId: s.storeId,
          size: s.size,
          price: Number(s.price),
          stock: Number(s.stock),
        })),
      };
    });

    const product = await Product.create({
      name: name.trim(),
      description: (description || "").trim(),
      category,
      variants: finalVariants,
    });

    return res.json({ status: "success", product });
  } catch (error) {
    return res.status(error.code || 500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};

/** WEB: actualizar producto (misma validación de pertenencia) */
const updateProduct = async (req, res) => {
  try {
    const storeUser = await getStoreUserOrFail(req);
    const { productId } = req.params;

    const product = await Product.findById(productId);
    if (!product) {
      return res
        .status(404)
        .json({ status: "error", message: "Product not found" });
    }

    /* ================= OWNERSHIP VALIDATION (PRODUCT CURRENT) ================= */

    // Tiendas actuales del producto (DB)
    const currentStoreIds = [
      ...new Set(
        (product.variants || []).flatMap((v) =>
          (v.storeConfigs || []).map((sc) => String(sc.storeId)),
        ),
      ),
    ];

    if (currentStoreIds.length === 0) {
      return res.status(400).json({
        status: "error",
        message: "Product has no store configs",
      });
    }

    // Debe ser dueño de TODAS las tiendas actuales donde existe el producto
    const ownedCurrent = await Store.find({
      _id: { $in: currentStoreIds },
      owner: storeUser._id,
    })
      .select("_id")
      .lean();

    if (ownedCurrent.length !== currentStoreIds.length) {
      return res.status(403).json({
        status: "error",
        message: "You are not the owner of this product stores",
      });
    }

    /* ================= PARSE + OWNERSHIP VALIDATION (PAYLOAD) ================= */

    let variants = [];
    try {
      variants = JSON.parse(req.body.variants || "[]");
    } catch {
      return res
        .status(400)
        .json({ status: "error", message: "variants must be valid JSON" });
    }

    if (!Array.isArray(variants) || variants.length === 0) {
      return res
        .status(400)
        .json({ status: "error", message: "variants is required" });
    }

    // storeIds que vienen en el body (para evitar que metan tiendas ajenas)
    const payloadStoreIds = [
      ...new Set(
        variants.flatMap((v) =>
          (v.storeConfigs || []).map((sc) => String(sc.storeId)),
        ),
      ),
    ];

    if (payloadStoreIds.length === 0) {
      return res.status(400).json({
        status: "error",
        message: "storeId is required in variants.storeConfigs",
      });
    }

    const ownedPayload = await Store.find({
      _id: { $in: payloadStoreIds },
      owner: storeUser._id,
    })
      .select("_id")
      .lean();

    if (ownedPayload.length !== payloadStoreIds.length) {
      return res.status(403).json({
        status: "error",
        message:
          "You are not the owner of one or more stores in the update payload",
      });
    }

    /* ================= BUILD FINAL VARIANTS ================= */

    const filesByField = groupFilesByField(req.files);

    const finalVariants = variants.map((v, idx) => {
      const newFiles = filesByField[`variantImages_${idx}`] || [];
      const newUrls = newFiles.map((f) => toLocalImageUrl(req, f.filename));

      return {
        color: v.color,
        colorHex: v.colorHex,
        images: [...(v.existingImages || []), ...newUrls],
        storeConfigs: (v.storeConfigs || []).map((s) => ({
          storeId: s.storeId,
          size: s.size,
          price: Number(s.price),
          stock: Number(s.stock),
        })),
      };
    });

    /* ================= UPDATE FIELDS ================= */

    if (req.body.name) product.name = req.body.name.trim();
    if (req.body.description !== undefined)
      product.description = (req.body.description || "").trim();
    if (req.body.category) product.category = req.body.category;

    product.variants = finalVariants;

    await product.save();

    return res.json({ status: "success", product });
  } catch (error) {
    console.error(error);
    return res.status(error.code || 500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};

/* ================= ORDERS (APP + WEB) ================= */

/** APP: crear pedido (user app) */
const createOrders = async (req, res) => {
  try {
    requireAppUser(req);

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ status: "error", message: "Unauthorized" });
    }

    const { orders, address } = req.body;

    if (!address) {
      return res.status(400).json({
        status: "error",
        message: "address is required",
      });
    }

    if (!Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({
        status: "error",
        message: "orders must be a non-empty array",
      });
    }

    const createdOrders = [];

    for (const [idx, o] of orders.entries()) {
      if (!o?.storeId) {
        return res.status(400).json({
          status: "error",
          message: `orders[${idx}].storeId is required`,
        });
      }

      if (!Array.isArray(o.items) || o.items.length === 0) {
        return res.status(400).json({
          status: "error",
          message: `orders[${idx}].items must be a non-empty array`,
        });
      }

      const store = await Store.findById(o.storeId);
      if (!store) {
        return res.status(404).json({
          status: "error",
          message: `Store not found: ${o.storeId}`,
        });
      }

      let orderItems = [];
      let orderTotal = 0;

      for (const it of o.items) {
        if (!it.productId || !it.color || !it.size) {
          return res.status(400).json({
            status: "error",
            message: "Invalid item structure",
          });
        }

        const product = await Product.findById(it.productId);
        if (!product) {
          return res.status(404).json({
            status: "error",
            message: `Product not found: ${it.productId}`,
          });
        }

        const variant = product.variants.find((v) => v.color === it.color);

        if (!variant) {
          return res.status(400).json({
            status: "error",
            message: `Variant not found for color: ${it.color}`,
          });
        }

        const cfg = variant.storeConfigs.find(
          (c) => String(c.storeId) === String(o.storeId) && c.size === it.size,
        );

        if (!cfg) {
          return res.status(400).json({
            status: "error",
            message: `Config not found for storeId=${o.storeId} size=${it.size}`,
          });
        }

        const qty = Number(it.quantity);
        if (!Number.isFinite(qty) || qty <= 0) {
          return res.status(400).json({
            status: "error",
            message: "Quantity must be greater than 0",
          });
        }

        if (cfg.stock < qty) {
          return res.status(400).json({
            status: "error",
            message: `Not enough stock for ${product.name}`,
          });
        }

        // descontar stock
        cfg.stock -= qty;
        await product.save();

        const price = Number(it.price ?? cfg.price);

        orderTotal += price * qty;

        orderItems.push({
          productId: it.productId,
          name: it.name ?? product.name,
          color: it.color,
          colorHex: it.colorHex,
          size: it.size,
          price,
          quantity: qty,
          storeId: o.storeId,
        });
      }

      const created = await Order.create({
        user: userId,
        store: o.storeId,
        items: orderItems, // 🔥 ahora es array
        address,
        totalPoints: orderTotal,
        status: "pending",
      });

      createdOrders.push(created);
    }

    const totalPoints = createdOrders.reduce(
      (acc, o) => acc + (o.totalPoints || 0),
      0,
    );

    const user = await User.findById(userId);

    if (user.points < totalPoints) {
      return res.status(400).json({
        status: "error",
        message: "No tienes suficientes puntos para redimir",
      });
    }

    user.pointsHistory.push({
      action: "Redención tienda",
      points: -totalPoints, // negativo porque es gasto
    });

    user.points -= totalPoints;

    await user.save();

    return res.json({
      status: "success",
      message: "Orders created",
      totalPoints,
      orders: createdOrders,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};

/** APP: pedidos del usuario app */
const userOrders = async (req, res) => {
  try {
    requireAppUser(req);

    const orders = await Order.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .lean();

    const purchases = orders.map((o) => ({
      id: String(o._id),
      status: o.status,
      date: (o.orderDate || o.createdAt || new Date()).toISOString(),
      totalPoints: Number(o.totalPoints || 0),
      items: Array.isArray(o.items)
        ? o.items.map((it) => ({
            id: String(it.productId || ""),
            name: it.name || "",
            color: it.color || "",
            size: it.size || "",
            quantity: Number(it.quantity || 0),
            price: Number(it.price || 0),
          }))
        : [],
    }));

    return res.json({ status: "success", purchases });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: "error", message: "Internal server error" });
  }
};

/** WEB: pedidos de una tienda (dueño o admin) */
const productsOrders = async (req, res) => {
  try {
    requireStoreUser(req);
    if (!isStoreManagerRole(req) && !isAdmin(req)) {
      return res
        .status(403)
        .json({ status: "error", message: "bad permissions" });
    }

    const { storeId, page } = req.params;
    const limit = 10;

    if (!isAdmin(req)) {
      await assertStoreOwnership({ storeId, storeUserId: req.user.id });
    }

    const orders = await Order.find({ store: storeId })
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * limit)
      .limit(limit);

    return res.json({ status: "success", orders });
  } catch (error) {
    console.error(error);
    return res
      .status(error.code || 500)
      .json({ status: "error", message: "Internal server error" });
  }
};

const productsOwnerOrders = async (req, res) => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) {
      return res.json({ status: "error", message: "Unauthorized" });
    }

    const stores = await Store.find({ owner: ownerId }).select("_id");
    const storeIds = stores.map((s) => s._id);

    if (storeIds.length === 0) {
      return res.json({ status: "success", orders: [] });
    }

    const ordersDb = await Order.find({ store: { $in: storeIds } })
      .sort({ createdAt: -1 })
      .populate({ path: "user", select: "nickName email" })
      .lean();

    const orders = ordersDb.map((o) => {
      const userLabel =
        o.user?.nickName || o.user?.email || String(o.user || "");

      // 🔥 NORMALIZAR ITEMS (soporta array o objeto viejo)
      const items = Array.isArray(o.items) ? o.items : o.items ? [o.items] : [];

      // 👉 Tomamos el primer producto (tu UI solo muestra uno)
      const firstItem = items[0] || {};

      return {
        id: String(o._id),
        orderDate: o.orderDate
          ? new Date(o.orderDate).toISOString()
          : new Date(o.createdAt).toISOString(),
        deliveredDate: o.deliveredDate
          ? new Date(o.deliveredDate).toISOString()
          : undefined,
        product: {
          name: firstItem.name || "",
          color: firstItem.color || "",
          colorHex: firstItem.colorHex || undefined,
          size: firstItem.size || "",
        },
        address: o.address || "",
        user: userLabel,
        status: o.status,
      };
    });

    return res.json({ status: "success", orders });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: "error", message: "Internal server error" });
  }
};

const orderDetail = async (req, res) => {
  try {
    const storeUser = await getStoreUserOrFail(req);
    if (!isStoreManagerRole(storeUser) && !isAdminRole(storeUser)) {
      return res
        .status(403)
        .json({ status: "error", message: "bad permissions" });
    }

    const { orderId } = req.params;

    const orderDb = await Order.findById(orderId)
      .populate({ path: "user", select: "nickName email" })
      .lean();

    if (!orderDb) {
      return res.status(404).json({
        status: "error",
        message: "Order not found",
      });
    }

    // 🔥 Normalizar items (soporta datos antiguos)
    const items = Array.isArray(orderDb.items)
      ? orderDb.items
      : orderDb.items
        ? [orderDb.items]
        : [];

    const userLabel =
      orderDb.user?.nickName ||
      orderDb.user?.email ||
      String(orderDb.user || "");

    const order = {
      id: String(orderDb._id),
      user: userLabel,
      items: items.map((item) => ({
        name: item.name || "",
        color: item.color || "",
        colorHex: item.colorHex || undefined,
        size: item.size || "",
        price: item.price || 0,
        quantity: item.quantity || 0,
      })),
      totalPoints: orderDb.totalPoints || 0,
      status: orderDb.status,
      address: orderDb.address || "",
      orderDate: orderDb.orderDate
        ? new Date(orderDb.orderDate).toISOString()
        : new Date(orderDb.createdAt).toISOString(),
      deliveredDate: orderDb.deliveredDate
        ? new Date(orderDb.deliveredDate).toISOString()
        : undefined,
    };

    return res.json({ status: "success", order });
  } catch (error) {
    return res
      .status(500)
      .json({ status: "error", message: "Internal server error" });
  }
};

/** WEB: cambiar estado de pedido (dueño o admin) */
const updateOrderStatus = async (req, res) => {
  try {
    const storeUser = await getStoreUserOrFail(req);
    if (!isStoreManagerRole(storeUser) && !isAdminRole(storeUser)) {
      return res
        .status(403)
        .json({ status: "error", message: "bad permissions" });
    }

    const { orderId } = req.params;
    const { status } = req.body;

    const allowed = [
      "pending",
      "confirmed",
      "in_transit",
      "delivered",
      "cancelled",
    ];
    if (!allowed.includes(status)) {
      return res
        .status(400)
        .json({ status: "error", message: "Invalid status" });
    }

    const order = await Order.findById(orderId)
      .populate({
        path: "user",
        select: "nickName email",
      })
      .lean();
    if (!order)
      return res
        .status(404)
        .json({ status: "error", message: "Order not found" });

    // Validar propiedad si no es admin
    if (!isAdminRole(storeUser)) {
      await assertStoreOwnership({
        storeId: order.store,
        storeUserId: req.user.id,
      });
    }

    order.status = status;

    if (status === "delivered") {
      order.deliveredDate = new Date();
    }

    await order.save();

    await sendStatusEmail(order.user.email, status);

    return res.json({ status: "success", order });
  } catch (error) {
    console.error(error);
    return res
      .status(error.code || 500)
      .json({ status: "error", message: "Internal server error" });
  }
};

/** APP: eliminar pedido (cliente) - solo si está pending */
const deleteOrder = async (req, res) => {
  try {
    requireAppUser(req);

    const { orderId } = req.params;
    const order = await Order.findOne({ _id: orderId, user: req.user.id });
    if (!order)
      return res
        .status(404)
        .json({ status: "error", message: "Order not found" });

    if (order.status !== "pending") {
      return res.status(400).json({
        status: "error",
        message: "Only pending orders can be deleted",
      });
    }

    await Order.deleteOne({ _id: orderId });
    return res.json({ status: "success", message: "Order deleted" });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: "error", message: "Internal server error" });
  }
};

const createAdmin = async (req, res) => {
  try {
    const { nickName, password, email } = req.body;

    if (!nickName || !password) {
      return res.status(400).json({
        status: "error",
        message: "nickName and password are required",
      });
    }

    // ⚠️ Evitar múltiples admins
    const existingAdmin = await StoreUser.findOne({ role: "admin" });
    if (existingAdmin) {
      return res.status(403).json({
        status: "error",
        message: "Admin already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const admin = await StoreUser.create({
      nickName,
      email: email ?? null,
      password: hashedPassword,
      role: "admin",
      isRegister: true,
    });

    return res.json({
      status: "success",
      message: "Admin created successfully",
      user: {
        id: admin._id,
        nickName: admin.nickName,
        role: admin.role,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};

const checkUserRole = async (req, res) => {
  try {
    const { id } = req.user;

    if (!id) {
      return res.status(400).json({
        status: "error",
        message: "error fetching data",
      });
    }

    // ⚠️ Evitar múltiples admins
    const user = await StoreUser.findById(id);
    if (!user) {
      return res.status(403).json({
        status: "error",
      });
    }

    const role = user.role ?? "";
    console.log(role);

    return res.json({
      status: "success",
      isAdmin: role === "admin" ? true : false,
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};

const storesOwner = async (req, res) => {
  try {
    const storeUser = await getStoreUserOrFail(req);
    if (storeUser.role !== "admin" && storeUser.role !== "store") {
      return res
        .status(403)
        .json({ status: "error", message: "bad permissions" });
    }

    const stores = await Store.find({ owner: storeUser._id });

    return res.json({ status: "success", stores });
  } catch (e) {
    return res
      .status(500)
      .json({ status: "error", message: "Internal server error" });
  }
};

const profile = async (req, res) => {
  try {
    const storeUser = await getStoreUserOrFail(req);
    if (storeUser.role !== "admin" && storeUser.role !== "store") {
      return res
        .status(403)
        .json({ status: "error", message: "bad permissions" });
    }

    const profile = await StoreUser.findById(storeUser._id).select(
      "-password -__v",
    );
    const stores = await Store.find({ owner: storeUser._id });

    return res.json({ status: "success", profile, stores });
  } catch (e) {
    return res
      .status(500)
      .json({ status: "error", message: "Internal server error" });
  }
};

const editProfile = async (req, res) => {
  try {
    const storeUser = await getStoreUserOrFail(req);
    if (storeUser.role !== "admin" && storeUser.role !== "store") {
      return res
        .status(403)
        .json({ status: "error", message: "bad permissions" });
    }

    const userId = storeUser.id;

    const allowed = ["nit", "phone", "phoneSecondary"]; // agrega los que quieras permitir
    const updates = {};

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates[key] = String(req.body[key]).trim();
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        status: "error",
        message: "No valid fields to update",
      });
    }

    const updated = await StoreUser.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true, runValidators: true, select: "-password -__v" },
    );

    return res.json({ status: "success", profile: updated });
  } catch (error) {
    return res
      .status(500)
      .json({ status: "error", message: "Internal server error" });
  }
};

const getImage = async (req, res) => {
  try {
    const { filename } = req.params;
    const imagePath = path.join(__dirname, "..", "images", filename);
    res.sendFile(imagePath);
  } catch (error) {
    return res.status(404).json({
      status: "error",
      message: "Image not found",
    });
  }
};

module.exports = {
  // web/admin
  generateCode,
  completeStoreUserRegistration,
  login,

  // web/store
  registerStore,
  editStore,
  updateStore,
  deleteStore,

  // products
  createProduct,
  productsList,
  productsByCategory,
  productsByStore,
  deleteProduct,
  updateProduct,
  productsOwner,

  // orders
  createOrders,
  userOrders,
  productsOrders,
  updateOrderStatus,
  deleteOrder,
  orderDetail,
  productsOwnerOrders,

  createAdmin,
  checkUserRole,
  storesOwner,

  profile,
  editProfile,
  getImage,
};
