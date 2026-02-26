const OneByOne = require("../models/oneByOne");

const create = async (req, res) => {
  try {
    const body = req.body;
    if (!body || !body.fixtureId) {
      return res.json({
        status: "error",
        message: "Missing required fields",
      });
    }

    // Guardar
    const created = await OneByOne.create(body);

    return res.json({
      status: "success",
      oneByOne: created,
    });
  } catch (error) {
    console.log("Error creating OneByOne item:", error);
    return res.json({
      status: "error",
      message: "An error was found. Please, try again",
    });
  }
};

const getList = async (req, res) => {
  try {
    const list = await OneByOne.find()
      .sort({ createdAt: -1 })
      .lean(); // 👈 importante

    const formatted = list.map((item) => ({
      ...item,
      id: item._id,
      _id: undefined,
    }));

    return res.json({
      status: "success",
      oneByOneList: formatted,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "An error was found. Please, try again",
    });
  }
};

const getOne = async (req, res) => {
  try {
    const { oneByOneId } = req.params;

    if (!oneByOneId) {
      return res.json({
        status: "error",
        message: "Invalid ID",
      });
    }

    const item = await OneByOne.findById(oneByOneId).lean();

    if (!item) {
      return res.json({
        status: "error",
        message: "OneByOne item not found",
      });
    }

    const formatted = {
      ...item,
      id: item._id,
      _id: undefined,
    };

    return res.json({
      status: "success",
      oneByOne: formatted,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "An error was found. Please, try again",
    });
  }
};

const deleteItem = async (req, res) => {
  try {
    const { oneByOneId } = req.params;

    if (!oneByOneId) {
      return res.json({
        status: "error",
        message: "Invalid ID",
      });
    }

    const deleted = await OneByOne.findByIdAndDelete(oneByOneId);

    if (!deleted) {
      return res.json({
        status: "error",
        message: "OneByOne item not found",
      });
    }

    return res.json({
      status: "success",
      message: "OneByOne deleted successfully",
      oneByOne: deleted,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "An error was found. Please, try again",
    });
  }
};

const updateItem = async (req, res) => {
  try {
    const { oneByOneId } = req.params;
    const body = req.body;

    if (!oneByOneId) {
      return res.json({
        status: "error",
        message: "Invalid ID",
      });
    }

    const updated = await OneByOne.findByIdAndUpdate(oneByOneId, body, {
      new: true,
    });

    if (!updated) {
      return res.json({
        status: "error",
        message: "OneByOne item not found",
      });
    }

    return res.json({
      status: "success",
      oneByOne: updated,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "An error was found. Please, try again",
    });
  }
};

module.exports = {
  create,
  getList,
  getOne,
  deleteItem,
  updateItem,
};