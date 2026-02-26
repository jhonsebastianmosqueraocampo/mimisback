const { Schema, model } = require("mongoose");

const OrderItemSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
  name: String,
  color: String,
  colorHex: String,
  size: String,
  price: Number,
  quantity: Number,
  storeId: { type: Schema.Types.ObjectId, ref: "Store" },
});


const OrderSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    store: {
      type: Schema.Types.ObjectId,
      ref: "Store",
      required: true,
    },
    items: [OrderItemSchema],
    totalPoints: Number,
    status: {
      type: String,
      enum: ["pending", "confirmed", "in_transit", "delivered", "cancelled"],
      default: "pending",
    },
    address: String,
    orderDate: {
      type: Date,
      default: Date.now,
    },
    deliveredDate: Date,
  },
  { timestamps: true }
);

module.exports = model("Order", OrderSchema);
