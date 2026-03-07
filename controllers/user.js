const User = require("../models/user");
const validator = require("validator");
const bcrypt = require("bcrypt");
const jwt = require("../services/jwt");
const { sendInviteSyntheticEmail } = require("../services/mailer");

const getUser = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).select("-password").lean();
    return res.json({
      status: "success",
      user,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "An error was found. Please, try again",
    });
  }
};

const getUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password").lean();

    const now = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);

    // Agregar campo activo dinámico
    const usersWithStatus = users.map((user) => {
      const isActive =
        user.lastActivity && new Date(user.lastActivity) >= sevenDaysAgo;

      return {
        ...user,
        active: isActive,
      };
    });

    const totalUsers = users.length;
    const activeUsers = usersWithStatus.filter((u) => u.active).length;
    const inactiveUsers = totalUsers - activeUsers;

    const totalPointsGenerated = users.reduce(
      (acc, u) => acc + (u.points || 0),
      0,
    );

    const totalPointsRedeemed = users.reduce(
      (acc, u) => acc + (u.redeemed || 0),
      0,
    );

    return res.json({
      status: "success",
      metrics: {
        totalUsers,
        activeUsers,
        inactiveUsers,
        totalPointsGenerated,
        totalPointsRedeemed,
      },
      users: usersWithStatus,
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "An error was found. Please, try again",
    });
  }
};

const register = async (req, res) => {
  try {
    //validar campos vacios e incorrectos
    if (req.body.nickName && req.body.email && req.body.password) {
      const nickNameValidator =
        !validator.isEmpty(req.body.nickName.trim()) &&
        validator.isLength(req.body.nickName.trim(), { min: 3, max: 35 });
      const emailValidator =
        !validator.isEmpty(req.body.email.trim()) &&
        validator.isEmail(req.body.email.trim());
      const passwordValidator =
        !validator.isEmpty(req.body.password.trim()) &&
        validator.isLength(req.body.password.trim(), { min: 3, max: 35 });
      if (!nickNameValidator || !emailValidator || !passwordValidator) {
        return res.json({
          status: "error",
          message: "An error was found while testing the fields",
        });
      }
    } else {
      return res.json({
        status: "error",
        message: "An error was found while testing the fields",
      });
    }

    const userValidator = await User.find({ email: req.body.email });

    if (userValidator.length >= 1) {
      return res.json({
        status: "error",
        message: "A same email was found",
      });
    }
    const { email, nickName, password } = req.body;
    const userData = {
      email,
      nickName,
      password,
    };
    const entidad = new User(userData);
    entidad.password = await bcrypt.hash(req.body.password, 10);
    const accessToken = jwt.generateAccessToken(entidad);
    const refreshToken = jwt.generateRefreshToken(entidad);
    entidad.refreshToken = refreshToken;
    const user = await entidad.save();

    return res.json({
      status: "success",
      user: {
        id: user._id,
        nickName: user.nickName,
        email: user.email,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "An errow was found",
    });
  }
};

const login = async (req, res) => {
  try {
    if (req.body.password) {
      let emailValidator = false;
      const passwordValidator =
        !validator.isEmpty(req.body.password.trim()) &&
        validator.isLength(req.body.password.trim(), { min: 3, max: 255 });
      if (req.body.email) {
        emailValidator =
          !validator.isEmpty(req.body.email.trim()) &&
          validator.isEmail(req.body.email.trim());
        if (!emailValidator || !passwordValidator) {
          return res.status(400).json({
            status: "error",
            message: "Fields have no passed the test",
          });
        }
      }
    } else {
      return res.json({
        status: "error",
        message: "Fields have no passed the test",
      });
    }

    const user = await User.findOne({ email: req.body.email });

    if (user.authProvider === "google") {
      return res.json({
        status: "error",
        message: "An error was found. Please, try again",
      });
    }

    if (!user) {
      return res.status(400).json({
        status: "error",
        message: "User or password incorrect",
      });
    } else {
      const validatePassword = await bcrypt.compare(
        req.body.password,
        user.password,
      );
      if (!validatePassword) {
        return res.status(400).json({
          status: "error",
          message: "User or password incorrect",
        });
      } else {
        const accessToken = jwt.generateAccessToken(user);
        const refreshToken = jwt.generateRefreshToken(user);
        user.refreshToken = refreshToken;
        await user.save();
        return res.status(200).json({
          status: "success",
          user: {
            id: user._id,
            nickName: user.nickName,
            email: user.email,
          },
          accessToken,
          refreshToken,
        });
      }
    }
  } catch (error) {
    return res.json({
      status: "error",
      message: "An error occurred. Try again",
    });
  }
};

const authGoogle = async (req, res) => {
  try {
    const { email, name, picture, googleId } = req.body;

    if (!email || !name || !googleId) {
      return res.status(400).json({
        status: "error",
        message: "Missing required Google user data",
      });
    }

    let user = await User.findOne({ email });
    let isNewUser = false;

    if (!user) {
      user = new User({
        email,
        nickName: name,
        password: "",
        authProvider: "google",
        favoriteTeams: [],
        favoritePlayers: [],
        favoriteTournaments: [],
      });

      isNewUser = true;
    }

    const accessToken = jwt.generateAccessToken(user);
    const refreshToken = jwt.generateRefreshToken(user);
    user.refreshToken = refreshToken;

    await user.save();

    return res.json({
      status: "success",
      user: {
        id: user._id,
        nickName: user.nickName,
        email: user.email,
      },
      isNewUser,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "An error occurred during Google authentication",
    });
  }
};

const refresh = async (req, res) => {
  const { token } = req.body;
  if (!token)
    return res.json({
      status: "error",
      message: "no token provided",
    });
  try {
    const payload = jwt.refresh(token);
    const user = await User.findById(payload.id);
    if (!user || user.refreshToken !== token)
      return res.json({ status: "error", message: "Login" });
    const newAccessToken = jwt.generateAccessToken(user);
    res.json({ accessToken: newAccessToken });
  } catch (error) {
    return res.json({
      status: "error",
      message: "An error was found",
    });
  }
};

const getUserFromRefreshToken = async (req, res) => {
  const { token } = req.body;
  if (!token)
    return res.json({
      status: "error",
      message: "no token provided",
    });
  try {
    const payload = jwt.refresh(token);
    // const user = await User.findById(payload.id).select("-password -refreshToken -authProvider"); // revisar por qué falla
    const user = await User.findById(payload.id).select("-password");
    if (!user || user.refreshToken !== token)
      return res.json({ status: "error", message: "Login" });
    const access_token = jwt.generateAccessToken(user);
    res.json({
      user,
      access_token,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "An error was found",
    });
  }
};

const updateNotificationsToken = async (req, res) => {
  const { updateNotificationsToken } = req.body;
  try {
    const userId = req.user.id;
    await User.findByIdAndUpdate(userId, {
      pushToken: updateNotificationsToken,
    });
    res.json({ status: "success", message: "token updated" });
  } catch (error) {
    console.log(error);
    return res.json({
      status: "error",
      message: "An error was found",
    });
  }
};

const updatePoints = async (req, res) => {
  const { rewardType } = req.body;
  const userId = req.user.id;
  let points = 0;
  try {
    switch (rewardType) {
      case "video":
        points = 50;
        break;
      case "streaming":
        points = 100;
        break;
      case "recommended":
        points = 100;
        break;
      case "timeOnline":
        points = 100;
        break;
      default:
        points = 0;
        break;
    }
    if (!userId || typeof points !== "number") {
      return res.json({
        status: "error",
        message: "userId and point are required",
      });
    }
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $inc: { points } },
      { new: true },
    );

    if (!updatedUser) {
      return res.json({ status: "error", message: "User wasnt found" });
    }

    return res.json({
      status: "success",
      user: updatedUser,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "An error occurred. Try again",
    });
  }
};

const updateNickName = async (req, res) => {
  const { nickName } = req.body;
  const userId = req.user.id;

  if (!nickName) {
    return res.json({ status: "error", message: "nickName es required" });
  }

  try {
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { nickName },
      { new: true },
    );

    if (!updatedUser) {
      return res.json({ status: "error", message: "User not found" });
    }

    res.json({ status: "success", user: updatedUser });
  } catch (error) {
    console.error(error);
    res.json({ status: "error", message: "Internal server error" });
  }
};

const updatePassword = async (req, res) => {
  const { password } = req.body;
  const userId = req.user.id;

  if (!password) {
    return res.json({ status: "error", message: "password is required" });
  }

  try {
    const newPassword = await bcrypt.hash(password, 10);
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { password: newPassword },
      { new: true },
    );

    if (!updatedUser) {
      return res.json({ status: "error", message: "User not found" });
    }

    res.json({ status: "success", user: updatedUser });
  } catch (error) {
    res.json({ status: "error", message: "Internal server error" });
  }
};

const addPoints = async (req, res) => {
  try {
    const { amount, xpAmount = 0, action = "Acción manual" } = req.body;
    const userId = req.user.id;

    if (amount <= 0)
      return res.status(400).json({ message: "Cantidad inválida" });

    const user = await User.findById(userId);
    if (!user)
      return res.status(404).json({ message: "Usuario no encontrado" });

    user.points += amount;

    if (xpAmount > 0) {
      user.xp += xpAmount;
    }

    user.pointsHistory.push({
      action,
      points: amount,
    });

    user.calculateLevel();

    await user.save();

    return res.json({
      status: "success",
      points: user.points,
      xp: user.xp,
      level: user.level,
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "An error was found. Please, try again!",
    });
  }
};

const redeemPoints = async (req, res) => {
  try {
    const { amount, action = "Redención tienda" } = req.body;
    const userId = req.user.id;

    if (amount <= 0)
      return res.status(400).json({ message: "Cantidad inválida" });

    const updatedUser = await User.findOneAndUpdate(
      {
        _id: userId,
        points: { $gte: amount },
      },
      {
        $inc: {
          points: -amount,
          redeemed: amount,
        },
        $push: {
          pointsHistory: {
            action,
            points: -amount,
            date: new Date(),
          },
        },
      },
      { new: true },
    );

    if (!updatedUser) {
      return res.status(400).json({
        message: "No tienes suficientes puntos",
      });
    }

    return res.json({
      status: "success",
      points: updatedUser.points,
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "An error was found. Please, try again!",
    });
  }
};

const getPoints = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);
    if (!user)
      return res.status(404).json({ message: "Usuario no encontrado" });
    return res.json({
      status: "success",
      points: user.points,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "An error was found. Please, try again!",
    });
  }
};

const getLimitAdsPerDay = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user)
      return res.status(404).json({ message: "Usuario no encontrado" });

    const wasReset = user.checkAndResetAdsLimit();

    if (wasReset) await user.save();

    return res.json({
      status: "success",
      limit: user.limitAdsPerDay,
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "An error was found. Please, try again!",
    });
  }
};

const descountLimitAdsPerDayAndAddPoint = async (req, res) => {
  try {
    const userId = req.user.id;
    const { from } = req.params;
    const user = await User.findById(userId);
    if (!user)
      return res
        .status(404)
        .json({ status: "error", message: "Usuario no encontrado" });

    user.checkAndResetAdsLimit();
    await user.save();

    const updateData = {
      $inc: {
        limitAdsPerDay: -1,
        points: 5,
        xp: 5,
      },
      $push: {
        pointsHistory: {
          action:
            from === "game"
              ? "Video recompensado (Juego)"
              : "Video recompensado",
          points: 5,
          date: new Date(),
        },
      },
    };

    const updatedUser = await User.findOneAndUpdate(
      {
        _id: userId,
        limitAdsPerDay: { $gt: 0 },
      },
      updateData,
      { new: true },
    );

    if (!updatedUser) {
      return res.status(400).json({
        message: "Has alcanzado el límite diario",
      });
    }

    updatedUser.calculateLevel();
    await updatedUser.save();
    console.log(updatedUser)
    return res.json({
      status: "success",
      limit: updatedUser.limitAdsPerDay,
      points: updatedUser.points,
      xp: updatedUser.xp,
      level: updatedUser.level,
      fromGame: updatedUser.fromGame,
    });
  } catch (error) {
    console.log(error)
    return res.status(500).json({
      status: "error",
      message: "An error was found. Please, try again!",
    });
  }
};

const invitationSyntheticMatch = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user)
      return res
        .status(404)
        .json({ status: "error", message: "Usuario no encontrado" });

    const now = new Date();
    const eightDaysAgo = new Date();
    eightDaysAgo.setDate(now.getDate() - 8);

    const recentMatch = user.syntheticMatches?.find(
      (m) =>
        ["INVITED", "CONFIRMED", "PLAYED"].includes(m.type) &&
        m.createdAt >= eightDaysAgo,
    );

    if (recentMatch) {
      return res.status(400).json({
        status: "error",
        message: "Solo puedes programar un partido contra MIMIS cada 8 días.",
      });
    }

    // Registrar nueva invitación
    user.syntheticMatches.push({
      type: "INVITED",
      createdAt: new Date(),
    });

    await user.save();

    try {
      await sendInviteSyntheticEmail({ user });
    } catch (mailError) {
      return res.json({
        status: "error",
        message: "No se ha podido enviar el correo",
      });
    }

    return res.json({
      status: "success",
      message: "Invitación enviada correctamente ⚽",
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "An error was found. Please, try again!",
    });
  }
};

module.exports = {
  register,
  login,
  authGoogle,
  refresh,
  getUserFromRefreshToken,
  updateNotificationsToken,
  updatePoints,
  updateNickName,
  updatePassword,
  addPoints,
  redeemPoints,
  getUser,
  getUsers,
  getPoints,
  getLimitAdsPerDay,
  descountLimitAdsPerDayAndAddPoint,
  invitationSyntheticMatch,
};
