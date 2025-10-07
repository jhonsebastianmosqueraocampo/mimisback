const { Router } = require("express");

const router = Router();

const userController = require("../controllers/user");
const middleware = require("../middlewares/auth");

router.get("/getUser", middleware.auth, userController.getUser);
router.post("/register", userController.register);
router.post("/login", userController.login);
router.post("/authGoogle", userController.authGoogle);
router.post("/refresh", userController.refresh);
router.post("/getUserFromRefreshToken", userController.getUserFromRefreshToken);
router.post("/updateNotificationsToken", middleware.auth, userController.updateNotificationsToken);
router.get("/updatePoints", middleware.auth, userController.updatePoints);
router.get("/updateNickName", middleware.auth, userController.updateNickName);
router.get("/updatePoints", middleware.auth, userController.updatePoints);
router.get("/updatePassword", middleware.auth, userController.updatePassword);

module.exports = router;