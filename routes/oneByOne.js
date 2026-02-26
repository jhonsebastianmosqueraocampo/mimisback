const { Router } = require("express");

const router = Router();

const oneByOneController = require("../controllers/oneByOne.js");
const middleware = require("../middlewares/auth");

router.post("/save", middleware.auth, oneByOneController.create);
router.get("/getOneByOne", middleware.auth, oneByOneController.getList);
router.get("/getOne/:oneByOneId", middleware.auth, oneByOneController.getOne);
router.delete("/deleteOneByOne/:oneByOneId", middleware.auth, oneByOneController.deleteItem);
router.put("/edit/:oneByOneId", middleware.auth, oneByOneController.updateItem);

module.exports = router;