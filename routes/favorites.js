const { Router } = require("express");

const router = Router();

const favoritesController = require("../controllers/favorites");
const middleware = require("../middlewares/auth");

router.post("/saveFavorites", middleware.auth, favoritesController.saveFavorites);
router.get("/getFavorites", middleware.auth, favoritesController.getFavorites);

module.exports = router;