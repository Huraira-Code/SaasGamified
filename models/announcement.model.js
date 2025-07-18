import { Schema } from "mongoose"; // Only import Schema, not model

const announcementSchema = new Schema(
  {
    title: {
      type: String,
      required: [true, "Announcement title is required."],
      trim: true,
      maxlength: [200, "Title cannot be more than 200 characters."],
    },
    content: {
      type: String,
      required: [true, "Announcement content is required."],
    },
    announcementCategory : {
        type : String ,
        enum : ["Technical Issues" , "General Guidance" , "Warning"],
        // You might want a default value here if appropriate
        // default: "General Guidance"
    }
  },
  {
    timestamps: true, // Adds createdAt and updatedAt timestamps
  }
);

// Export the schema directly using a named export
export { announcementSchema };

// REMOVE THESE LINES - We no longer export the model directly
// const Announcement = model("Announcement", announcementSchema);
// export default Announcement;