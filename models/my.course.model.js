import { Schema } from "mongoose"; // Only import Schema, not model

const myCourseSchema = new Schema(
  {
    userId: {
      // Changed type from String to Schema.Types.ObjectId
      // This is crucial for proper Mongoose referencing and ensures userId
      // is an actual ObjectId linking to a User document.
      type: String,
      ref: 'User', // Reference to the 'User' model (will be resolved on the current connection)
      required: [true, "user id is required to store user course progress"],
      unique: [true, "user id must be unique"], // A user should only have one MyCourse document
    },
    myPurchasedCourses: [
      {
        courseId: {
          // Changed type from String to Schema.Types.ObjectId
          // This is crucial for proper Mongoose referencing.
          type: String,
          ref: 'Course', // Reference to the 'Course' model (will be resolved on the current connection)
          required: true,
        },
        lectureProgress: [
          {
            lectureId: {
              type: String, // You might want this to be ObjectId if lectures are separate documents
              required: true,
            },
            marked: {
              type: Boolean,
              default: false,
            },
            notes: [
              {
                type: String,
                maxlength: [200, "write note less than 200 character"],
                trim: true,
              },
            ],
          },
        ],
        quizScores: [
          {
            quizId: {
              type: String, // You might want this to be ObjectId if quizzes are separate documents
              required: true,
            },
            score: {
              // Points obtained by the user in this quiz attempt
              type: Number,
              required: true,
              default: 0,
            },
            totalPoints: {
              // Total possible points for the quiz
              type: Number,
              required: true,
            },
            submittedAt: {
              type: Date,
              default: Date.now,
            },
            // Optionally, you could store user's answers for review
            // userAnswers: [
            //   {
            //     questionId: String,
            //     submittedAnswer: String,
            //     isCorrect: Boolean,
            //   }
            // ],
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
export { myCourseSchema };

// REMOVE these lines - We no longer export the model directly
// const MyCourse = model("MyCourse", myCourseSchema);
// export default MyCourse;