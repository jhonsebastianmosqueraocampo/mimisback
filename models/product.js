const { Schema, model } = require("mongoose");

const StoreConfigSchema = new Schema({
  storeId: {
    type: Schema.Types.ObjectId,
    ref: "Store",
    required: true,
  },
  size: String,
  price: Number,
  stock: Number,
});

const VariantSchema = new Schema({
  color: String,
  colorHex: String,
  images: [String],
  storeConfigs: [StoreConfigSchema],
});

const ProductSchema = new Schema(
  {
    name: String,
    description: String,
    category: String,
    variants: [VariantSchema],
  },
  { timestamps: true }
);

module.exports = model("Product", ProductSchema);
