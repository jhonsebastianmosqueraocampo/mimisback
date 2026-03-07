const { Router } = require("express");
const router = Router();

const searchController = require("../controllers/search.js");
const middleware = require("../middlewares/auth");

router.get("/list", middleware.auth, searchController.searchGlobal);

module.exports = router;