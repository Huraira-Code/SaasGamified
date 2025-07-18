import { Schema } from "mongoose"; // Only import Schema, not model

const messageSchema = new Schema({
  sender: {
    type: Schema.Types.ObjectId,
    ref: "User", // References the User model within the current tenant's DB
    required: true,
  },
  content: {
    type: String,
    required: true,
    trim: true, // Good practice for string content
  },
  chatroomId: {
    type: Schema.Types.ObjectId,
    ref: "Chatroom", // References the Chatroom model within the current tenant's DB
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true, // Adding timestamps here will also give you createdAt/updatedAt
                    // which can be useful even with a separate 'timestamp' field.
                    // If 'timestamp' is strictly for when the message was *sent*,
                    // and 'createdAt' is for when it was *recorded*, you can keep both.
});

// Export the schema directly using a named export
export { messageSchema };

// REMOVE THESE LINES - We no longer export the model directly
// const Message = model("Message", messageSchema);
// export default Message;