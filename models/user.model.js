import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { Schema } from "mongoose"; // Only import Schema, not model
import { type } from "os";

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "name is required"],
      minLength: [3, "name must atleast 3 character"],
      maxLength: [20, "name should not greater than 20 charcter"],
      lowercase: true,
      trim: true,
    },
    email: {
      type: String,
      required: [true, "email is required"],
      unique: true, // MongoDB will enforce uniqueness at the collection level per database
      trim: true,
    },
    biopic: {
      type: String,
    },
    password: {
      type: String,
      required: [true, "password is required"],
      minLength: [8, "password must be atlest 8 character"],
      select: false,
    },
    role: {
      type: String,
      // You had 'anum' - it should be 'enum'
      enum: ["USER", "ADMIN"],
      default: "USER",
    },
    avatar: {
      public_id: {
        type: String,
        required: true,
      },
      secure_url: {
        type: String,
        required: true,
      },
    },
    XP: {
      type: Number,
      default: 0, // Added a default value as XP often starts at 0
    },
    verfiy: {
      type: Boolean,
      default: false, // Default to false, assuming users are not verified initially
    },

    BadgesID: [
      {
        type: Schema.Types.ObjectId,
        ref: "Badges", // Ensure you have a 'Badges' schema/model definition
      },
    ],
    verifyEmailToken: String,
    verifyEmailExpiry: Date,
    forgotPasswordToken: String,
    forgotPasswordExpiry: Date,
  },
  {
    timestamps: true,
  }
);

// Pre-save hook for password hashing
userSchema.pre("save", async function (next) {
  // Only hash if the password field is modified (e.g., on creation or update)
  if (!this.isModified("password")) {
    return next();
  }
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Instance methods for the user schema
userSchema.methods = {
  generateAuthToken: function () {
    // Use 'function' keyword for 'this' context
    return jwt.sign(
      { id: this._id, role: this.role, email: this.email }, // Added email to token payload for convenience
      process.env.JWT_SECRET_KEY,
      { expiresIn: process.env.JWT_EXPIRY }
    );
  },
  comparePassword: async function (plainPassword) {
    // Use 'function' keyword for 'this' context
    return await bcrypt.compare(plainPassword, this.password);
  },
  generateForgotPasswordToken: function () {
        console.log("me2222")

    // Use 'function' keyword for 'this' context
    const resetToken = crypto.randomBytes(20).toString("hex");

    this.forgotPasswordToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    this.forgotPasswordExpiry = Date.now() + 15 * 60 * 1000; // 15 minutes expiry

    return resetToken;
  },

  generateVerifyEmailToken: function () {
    console.log("me2222")
    // Use 'function' keyword for 'this' context
    const resetToken = crypto.randomBytes(20).toString("hex");

    this.verifyEmailToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    this.verifyEmailExpiry = Date.now() + 15 * 60 * 1000; // 15 minutes expiry

    return resetToken;
  },
};

// Export the schema directly using a named export
export { userSchema };

// REMOVE THE LINE BELOW - We no longer export the model directly
// const User = model("User", userSchema);
// export default User;
