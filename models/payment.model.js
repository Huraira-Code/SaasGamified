import { Schema } from "mongoose"; // Only import Schema, not model

const paymentSchema = new Schema(
  {
    userId: {
      type: String, // CRUCIAL CHANGE: Use ObjectId for referencing users
      ref: "User", // Reference to the User model
      required: [true, "user id is required for payment"],
      unique: [true, "user id must be unique"], // A user typically has one payment document
    },
    purchasedCourse: [
      {
        courseId: {
          type: String, // CRUCIAL CHANGE: Use ObjectId for referencing courses
          ref: "Course", // Reference to the Course model
          required: [true, "course id is required for payment"],
        },
        purchaseDetails: [
          {
            purchaseDate: {
              type: Date,
              required: true,
            },
            expirationDate: {
              type: Date,
              required: true,
            },
            // Optionally add more details like:
            // stripeSessionId: String,
            // amountPaid: Number,
            // currency: String,
          },
        ],
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Export the schema directly using a named export
export { paymentSchema };

// REMOVE THESE LINES - We no longer export the model directly
// const Payment = model("Payment", paymentSchema);
// export default Payment;
