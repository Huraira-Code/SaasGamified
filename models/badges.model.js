import { Schema } from "mongoose"; // Only import Schema, not model

const badgesSchema = new Schema(
  {
    title: {
      type: String,
      required: [true, "Badge title is required"], // Added more descriptive message
      trim: true,
      maxlength: [50, "Title cannot be more than 50 characters."],
    },
    content: {
      type: String,
      required: [true, "Badge content is required."], // Added more descriptive message
      maxlength: [200, "Content cannot be more than 200 characters."],
    },
    BadgesUrl: { // This seems like it should be `badgeUrl` (camelCase)
      type: String,
      required: [true, "Badge URL is required"], // Badges likely need an image/icon URL
    },
    XP: {
      type: Number,
      required: [true, "XP value for badge is required"], // Badges typically grant XP
      default: 0, // A default value if not provided
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt timestamps
  }
);

// Export the schema directly using a named export
export { badgesSchema };

// REMOVE THESE LINES - We no longer export the model directly
// const Badges = model("Badges", badgesSchema);
// export default Badges;