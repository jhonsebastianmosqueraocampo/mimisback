const ApiFootballCall = require("../models/apifootballCals.js");
const StoreUser = require("../models/storeUser.js");

const isAdminRole = (storeUser) => storeUser.role === "admin";

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

const requireAuth = (req) => {
  if (!req.user?.id) {
    const err = new Error("Missing auth");
    err.code = 401;
    throw err;
  }
};

const apiCalls = async (req, res) => {
  try {
    const storeUser = await getStoreUserOrFail(req);

    if (!isAdminRole(storeUser)) {
      return res
        .status(403)
        .json({ status: "error", message: "bad permissions" });
    }
    const calls = await  ApiFootballCall.find();
    return res.json({
      status: 'success',
      calls
    })
  } catch (error) {
    return res.json({
      status: "error",
      message: "An error was found. Please try again",
    });
  }
};

module.exports = {
  apiCalls
}