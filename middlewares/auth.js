const jwts = require("jwt-simple");
const moment = require("moment");
const User = require("../models/user");

const ACCESS_SECRET = process.env.ACCESS_SECRET;

const auth = async (req, res, next) => {
  if (!req.headers.authorization) {
    return res.status(400).json({
      status: "error",
      mensaje: "No se ha podido entrar a la ruta",
    });
  }
  const token = req.headers.authorization.replace(/['"]+/g, "");
  try {
    const payload = jwts.decode(token, ACCESS_SECRET);
    if (payload.exp <= moment().unix()) {
      return res.status(403).json({
        status: "error",
        mensaje: "Token expirado",
      });
    }
    req.user = payload;
    await User.findByIdAndUpdate(
      payload.id,
      { $set: { lastActivity: new Date() } },
      { new: false },
    );
  } catch (error) {
    return res.status(403).json({
      status: "error",
      mensaje: "Token invalido",
    });
  }
  next();
};

module.exports = {
  auth,
};
