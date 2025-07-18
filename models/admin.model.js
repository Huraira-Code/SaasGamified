import { Schema } from "mongoose"; // Only import Schema, not model

const superAdminDashboardSchema = new Schema({
  superAdmin: {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
  },
  admins: [
    {
      email: {
        type: String,
        required: true,
        unique: true, // Ensures unique emails within this array
        lowercase: true,
        trim: true,
      },
      passwordHash: {
        type: String,
        required: true,
        // IMPORTANT: Store securely hashed passwords.
      },
      lmsname: {
        type: String,
        required: true,
        trim: true,
      },
      payments: [
        {
          type: Date, // Stores only the date of payment for this specific admin's LMS
          required: true,
        },
      ],
      // NEW FIELD: Status for the LMS system (true for ON, false for OFF)
      status: {
        type: Boolean,
        default: true, // Default to ON when a new admin is added
      },
    },
  ],
});

export { superAdminDashboardSchema };
