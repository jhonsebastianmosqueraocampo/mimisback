const { Router } = require("express");

const router = Router();

const notificationController = require("../controllers/notification");
const middleware = require("../middlewares/auth");

router.post("/saveNotificationSettings", middleware.auth, notificationController.saveNotificationSettings);
router.get("/getNotificationSettings", middleware.auth, notificationController.getNotificationSettings);

module.exports = router;