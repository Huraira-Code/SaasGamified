import { Schema } from "mongoose"; // Only import Schema, not model

const chatroomSchema = new Schema({
  name: {
    type: String,
    // Consider making name required, or providing a default based on participants
    // required: [true, "Chatroom name is required"],
    trim: true,
  },
  participants: [
    {
      type: Schema.Types.ObjectId,
      ref: "User", // This will correctly reference the User model within the current tenant's DB
    },
  ],
  unreadCounts: [
    {
      user: {
        type: Schema.Types.ObjectId,
        ref: "User", // This will correctly reference the User model within the current tenant's DB
      },
      count: {
        type: Number,
        default: 0,
      },
    },
  ],
}, {
  timestamps: true, // Adding timestamps is generally good practice for chatrooms
});

// Export the schema directly using a named export
export { chatroomSchema };

// REMOVE THESE LINES - We no longer export the model directly
// const Chatroom = model("Chatroom", chatroomSchema);
// export default Chatroom;