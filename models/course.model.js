import { Schema } from "mongoose"; // Only import Schema, not model

// --- NEW: Define a schema for individual questions ---
// Note: This sub-schema does NOT need to be exported, as it's directly nested.
const questionSchema = new Schema(
  {
    question: {
      type: String,
      required: [true, "Question text is required"],
      trim: true,
    },
    options: {
      type: [String], // Array of strings for multiple-choice options
      required: [true, "Options are required"],
      validate: {
        validator: function (v) {
          return Array.isArray(v) && v.length >= 2; // Must have at least 2 options
        },
        message: (props) => `${props.path} must contain at least two options!`,
      },
    },
    correctAnswer: {
      type: String, // Stores the exact text of the correct option
      required: [true, "Correct answer is required"],
    },
    points: {
      // Optional: Points awarded for answering this question correctly
      type: Number,
      default: 1,
      min: [0, "Points cannot be negative"],
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt to each question
  }
);

// --- NEW: Define a schema for a quiz, which contains multiple questions ---
// Note: This sub-schema does NOT need to be exported, as it's directly nested.
const quizSchema = new Schema(
  {
    title: {
      type: String,
      required: [true, "Quiz title is required"],
      trim: true,
      minLength: [3, "Quiz title must be at least 3 characters long"],
      maxLength: [100, "Quiz title cannot exceed 100 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxLength: [500, "Quiz description cannot exceed 500 characters"],
    },
    questions: [questionSchema], // Array of questions using the questionSchema
    totalPoints: {
      // Derived from sum of question points (can be calculated on the fly or pre-calculated)
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt to each quiz
  }
);

const courseSchema = new Schema(
  {
    title: {
      type: String,
      required: [true, "title is required"],
      minLength: [5, "title must be atleast 5 character long"],
      maxLength: [50, "title should be less than 50 character"],
      // unique: [true, "title is already given"], // Removed unique for now, see explanation below
      trim: true,
    },
    description: {
      type: String,
      required: [true, "description is required"],
      minLength: [8, "description must be atleast 8 character long"],
      maxLength: [500, "description should be less than 500 character"],
    },
    createdBy: {
      type: String, // If this is a user ID, consider `Schema.Types.ObjectId, ref: 'User'`
      required: true,
    },
    category: {
      type: String,
      required: [true, "category is required"],
    },
    price: {
      type: Number,
      required: true,
    },
    expiry: { // This seems like "access expiry for a purchased course", might be better in MyCourse
      type: Number, // Consider `Date` type if it's a date
      required: true,
    },
    numberOfLectures: {
      type: Number,
      default: 0,
    },
    thumbnail: {
      public_id: {
        type: String,
        required: true,
      },
      secure_url: {
        type: String,
        required: true,
      },
    },
    lectures: [
      {
        name: String,
        description: String,
        lecture: {
          public_id: String,
          secure_url: String,
        },
      },
    ],

    quizzes: [quizSchema], // Array of quizzes using the quizSchema
    courseSequence: [
      {
        type: { // 'type' field is a keyword, better to use 'contentType' or 'itemType'
          type: String,
          enum: ["video", "quiz"], // Enforce type to be either 'video' or 'quiz'
          required: true,
        },
        contentId: {
          // This will store the _id of the lecture or quiz
          type: Schema.Types.ObjectId, // This assumes lecture and quiz _ids are unique across their arrays
          required: true,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Pre-save hook to ensure correctAnswer is one of the options for each question within each quiz
courseSchema.pre("save", function (next) {
  // Use a standard function to correctly bind 'this'
  this.quizzes.forEach((quiz) => {
    quiz.questions.forEach((question) => {
      // Check if correctAnswer is present AND if it's included in options
      if (question.correctAnswer && !question.options.includes(question.correctAnswer)) {
        const err = new Error(
          `Validation Error: Correct answer '${question.correctAnswer}' for question '${question.question}' is not one of the provided options.`
        );
        return next(err); // Pass error to stop saving
      }
    });
  });
  next(); // Continue with saving
});

// Export the main courseSchema directly using a named export
export { courseSchema };

