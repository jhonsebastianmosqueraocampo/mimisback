const { Schema, model } = require("mongoose");

const StoreSchema = new Schema({
    name: String,
    photo: String,
    phone1: Number,
    phone2: Number
})

const StoreUserSchema = new Schema(
  {
    nickName: String,
    email: String,
    company: String,
    nit: String,
    companyLogo: String,
    stores: [StoreSchema],
    phone: String,
    phoneSecondary: String,
    password: String,
    code: String,
    isRegister: Boolean,
    role: String
  },
  {
    timestamps: true,
  }
);

module.exports = model("StoreUser", StoreUserSchema);
