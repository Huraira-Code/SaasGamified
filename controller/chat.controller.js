// Import Schemas instead of Models
import { myCourseSchema } from "../models/my.course.model.js";
import { paymentSchema } from "../models/payment.model.js"; // Assuming you have this schema
import { userSchema } from "../models/user.model.js";
import { badgesSchema } from "../models/badges.model.js"; // Assuming you have this schema
import { courseSchema } from "../models/course.model.js"; // Assuming you have this schema

import asyncHandler from "../middleware/asyncHandler.middleware.js";
import AppError from "../utils/error.utils.js";
// No direct mail utility import for this controller's functions shown here, but keep if needed elsewhere

// --- HELPER FUNCTIONS TO GET DYNAMIC MODELS ---
const getMyCourseModel = (req) => {
  if (!req.dbConnection) {
    throw new AppError('Database connection not established for this request.', 500);
  }
  return req.dbConnection.model('MyCourse', myCourseSchema);
};

const getPaymentModel = (req) => {
  if (!req.dbConnection) {
    throw new AppError('Database connection not established for this request.', 500);
  }
  return req.dbConnection.model('Payment', paymentSchema);
};

const getUserModel = (req) => {
  if (!req.dbConnection) {
    throw new AppError('Database connection not established for this request.', 500);
  }
  return req.dbConnection.model('User', userSchema);
};

const getBadgesModel = (req) => {
  if (!req.dbConnection) {
    throw new AppError('Database connection not established for this request.', 500);
  }
  return req.dbConnection.model('Badges', badgesSchema);
};

const getCourseModel = (req) => {
  if (!req.dbConnection) {
    throw new AppError('Database connection not established for this request.', 500);
  }
  return req.dbConnection.model('Course', courseSchema);
};
// --- END HELPER FUNCTIONS ---


/**
 * @GET_MY_COURSE_LIST
 * @ROUTE @GET
 * @ACCESS course purchased user only {{url}}/:databaseName/api/v1/my-courses
 */

export const getMyAllCourses = asyncHandler(async (req, res, next) => {
  const Payment = getPaymentModel(req); // Get dynamic Payment model
  const Course = getCourseModel(req);   // Get dynamic Course model (for lookup)

  const { id } = req.user; // User ID from auth middleware

  // Mongoose Aggregation Pipeline (careful with 'from' field)
  // 'from' field in $lookup should match the actual collection name in MongoDB.
  // Mongoose pluralizes model names to get collection names.
  // If your Course model is named 'Course', its collection is likely 'courses'.
  // If your Payment model is named 'Payment', its collection is likely 'payments'.

  const myPurchasedCourseList = await Payment.aggregate([
    {
      $match: {
        userId: req.dbConnection.Types.ObjectId(id), // Convert string ID to ObjectId for aggregation $match
      },
    },
    {
      $unwind: "$purchasedCourse",
    },
    {
      $project: {
        _id: 0,
        // Ensure courseId is an ObjectId for $lookup to work correctly
        courseId: {
          $toObjectId: "$purchasedCourse.courseId",
        },
      },
    },
    {
      $lookup: {
        from: Course.collection.name, // Use Course.collection.name for correct collection name (e.g., 'courses')
        localField: "courseId",
        foreignField: "_id",
        as: "purchasedCourses",
        pipeline: [
          {
            $project: {
              title: 1,
              thumbnail: 1,
            },
          },
        ],
      },
    },
    {
      $project: {
        purchasedCourses: {
          $first: "$purchasedCourses",
        },
      },
    },
    {
      $group: {
        _id: null,
        courseList: {
          $push: "$purchasedCourses",
        },
      },
    },
    {
      $project: {
        _id: 0,
        courseList: 1, // Project courseList explicitly
      },
    },
  ]);

  res.status(200).json({
    success: true,
    courseList: myPurchasedCourseList[0]?.courseList || [],
  });
});

/**
 * @GET_MY_COURSE_LECTURE_PROGRESS
 * @ROUTE @GET
 * @ACCESS course purchased user only {{url}}/:databaseName/api/v1/my-courses/:courseId
 */

export const getMyCourseLectureProgress = asyncHandler(
  async (req, res, next) => {
    const MyCourse = getMyCourseModel(req); // Get dynamic MyCourse model

    const { id } = req.user;
    const { courseId } = req.params;

    const myCourseProgress = await MyCourse.findOne(
      { userId: id },
      {
        myPurchasedCourses: {
          $elemMatch: {
            courseId: courseId,
          },
        },
      }
    );

    // Handle case where myCourseProgress or myPurchasedCourses[0] might be null/undefined
    if (!myCourseProgress || !myCourseProgress.myPurchasedCourses || myCourseProgress.myPurchasedCourses.length === 0) {
        return next(new AppError("Course progress not found for this user/course.", 404));
    }

    console.log("kumi meri jaan", myCourseProgress);
    res.status(200).json({
      success: true,
      courseProgress: myCourseProgress.myPurchasedCourses[0],
    });
  }
);

/**
 * @ADD_NOTE_INTO_LECTURE
 * @ROUTE @POST
 * @ACCESS course purchased user only {{url}}/:databaseName/api/v1/my-courses/:courseId/:lectureId
 */

export const addNote = asyncHandler(async (req, res, next) => {
  const MyCourse = getMyCourseModel(req); // Get dynamic MyCourse model

  const { id } = req.user;
  const { note } = req.body;
  const { courseId } = req.params;
  const { lectureId } = req.query; // lectureId from query

  if (!note) {
    return next(new AppError("Note content is required", 400));
  }

  // Use findOneAndUpdate to atomically add or update the note
  const myCourse = await MyCourse.findOneAndUpdate(
    {
      userId: id,
      "myPurchasedCourses.courseId": courseId,
    },
    {
      // $addToSet ensures no duplicate notes (if 'note' is exactly the same string)
      // If you want to allow duplicate notes, use $push instead of $addToSet
      // This path is for adding to an existing lectureProgress entry
      $addToSet: {
        "myPurchasedCourses.$[elem].lectureProgress.$[subElem].notes": note,
      },
    },
    {
      arrayFilters: [
        { "elem.courseId": courseId },
        { "subElem.lectureId": lectureId },
      ],
      new: true, // Return the updated document
    }
  );

  // If the initial findOneAndUpdate didn't find/update (e.g., lectureProgress for lectureId didn't exist)
  if (!myCourse) {
      return next(new AppError("MyCourse record not found for this user/course.", 404));
  }

  const courseIndex = myCourse.myPurchasedCourses.findIndex(
    (item) => item.courseId.toString() === courseId // Ensure string comparison for ObjectId
  );

  if (courseIndex === -1) { // This case should ideally be caught by findOneAndUpdate failing to find courseId
      return next(new AppError("Course not found in user's purchased courses list.", 404));
  }

  // Check if lectureProgress for this lectureId exists, if not, push a new entry
  const lectureProgressArray = myCourse.myPurchasedCourses[courseIndex].lectureProgress;
  const lectureIndex = lectureProgressArray.findIndex((item) => item.lectureId === lectureId);

  if (lectureIndex === -1) {
    lectureProgressArray.push({
      lectureId,
      marked: false, // Default to not marked
      notes: [note],
    });
    await myCourse.save(); // Save changes after pushing new lecture progress entry
  }
  // If lectureIndex is NOT -1, the $addToSet in findOneAndUpdate successfully added the note,
  // so no further action is needed or a second save.

  res.status(200).json({
    success: true,
    message: "Note added successfully",
  });
});

/**
 * @UPDATE_LECTURE_CHECK_MARK
 * @ROUTE @PUT
 * @ACCESS course purchased user only {{url}}/:databaseName/api/v1/my-courses/:courseId/:lectureId
 */

export const updateLectureMark = asyncHandler(async (req, res, next) => {
  const MyCourse = getMyCourseModel(req); // Get dynamic MyCourse model
  const User = getUserModel(req);         // Get dynamic User model
  const Badges = getBadgesModel(req);     // Get dynamic Badges model

  const { id } = req.user; // User ID from authenticated request
  const { checked, gainXP } = req.body; // 'checked' status of lecture, and XP gained/lost
  const { courseId } = req.params; // ID of the course
  const { lectureId } = req.query; // ID of the lecture

  console.log(`Gain XP: ${gainXP}`);
  console.log(
    `User ID: ${id}, Checked: ${checked}, Course ID: ${courseId}, Lecture ID: ${lectureId}`
  );

  // Find the MyCourse document for the user
  let myCourse = await MyCourse.findOne({ userId: id });

  if (!myCourse) {
    // If MyCourse document doesn't exist, create it.
    // This scenario means a user purchased a course but no MyCourse document exists yet.
    myCourse = await MyCourse.create({ userId: id, myPurchasedCourses: [] });
  }

  // Find the relevant course within myPurchasedCourses
  const courseIndex = myCourse.myPurchasedCourses.findIndex(
    (item) => item.courseId.toString() === courseId
  );

  if (courseIndex === -1) {
    // If the course isn't in myPurchasedCourses, user hasn't purchased it (or record is missing)
    return next(new AppError("Course not found in user's purchased courses list.", 404));
  }

  const lectureProgressArray = myCourse.myPurchasedCourses[courseIndex].lectureProgress;
  let lectureIndex = lectureProgressArray.findIndex(
    (item) => item.lectureId === lectureId
  );
  console.log(`Lecture Index: ${lectureIndex}`);

  let xpChange = checked ? gainXP : -gainXP;
  console.log(`Calculated XP Change: ${xpChange}`);

  let updatedUser; // To hold the user document after XP update
  let badgeStatusChanges = []; // Array to store info about acquired/removed badges

  if (lectureIndex === -1) {
    console.log(
      "Marking for the first time: lecture not found in progress array."
    );
    // If the lecture is being marked for the first time, push new progress
    lectureProgressArray.push({
      lectureId,
      marked: checked,
    });
    await myCourse.save(); // Save changes to myCourse document

    // Adjust user's XP in the User model
    try {
      updatedUser = await User.findByIdAndUpdate(
        id,
        { $inc: { XP: xpChange } }, // Increment/decrement XP
        { new: true } // Return the updated user document
      );
      console.log(`User ${id} XP updated by ${xpChange} (first time mark).`);
    } catch (error) {
      console.error(`Error updating user XP for ${id}:`, error);
      return next(new AppError("Failed to update user XP", 500));
    }
  } else {
    console.log("Lecture progress already exists.");
    // If the lecture progress already exists, handle updates to 'marked' status
    const currentMarkedStatus = lectureProgressArray[lectureIndex].marked;
    console.log(
      `Current marked status: ${currentMarkedStatus}, New checked status: ${checked}`
    );

    // Only adjust XP and save if the marked status actually changed
    if (checked !== currentMarkedStatus) { // Use strict inequality
      console.log("Marked status changed, updating XP and lecture status.");
      // Update the 'marked' status in the local object before saving MyCourse
      lectureProgressArray[lectureIndex].marked = checked;
      await myCourse.save(); // Save the updated lecture progress in MyCourse

      // Adjust XP in User model
      try {
        updatedUser = await User.findByIdAndUpdate(
          id,
          { $inc: { XP: xpChange } },
          { new: true }
        );
        console.log(`User ${id} XP updated by ${xpChange} (status changed).`);
      } catch (error) {
        console.error(
          `Error updating user XP or lecture status for ${id}:`,
          error
        );
        return next(
          new AppError("Failed to update user XP or lecture status", 500)
        );
      }
    } else {
      console.log(
        "Marked status did not change, no XP adjustment needed for this action. Fetching user for badge checks."
      );
      // If the marked status didn't change, we still need to get the user's current XP for badge checks
      updatedUser = await User.findById(id); // Fetch current user document
    }
  }

  // --- Badge Assignment and Removal Logic ---
  if (updatedUser) {
    try {
      const allBadges = await Badges.find({}); // Fetch all available badges
      // Ensure 'BadgesID' exists as an array on the user document (or initialize it)
      const userCurrentBadgeIds = updatedUser.BadgesID
        ? updatedUser.BadgesID.map((id) => id.toString())
        : [];
      console.log("Current User Badges:", userCurrentBadgeIds);

      let newBadgesToAwardIds = [];
      let badgesToPullIds = [];

      for (const badge of allBadges) {
        const badgeIdString = badge._id.toString();
        const userHasBadge = userCurrentBadgeIds.includes(badgeIdString);

        // Condition to Award Badge
        if (updatedUser.XP >= badge.XP && !userHasBadge) {
          newBadgesToAwardIds.push(badge._id);
          badgeStatusChanges.push({ badge: badge, status: "acquired" });
          console.log(`User ${id} acquired badge: ${badge.title}`);
        }
        // Condition to Remove Badge (if XP drops below requirement AND user has the badge)
        else if (updatedUser.XP < badge.XP && userHasBadge) {
          badgesToPullIds.push(badge._id);
          badgeStatusChanges.push({ badge: badge, status: "removed" });
          console.log(`User ${id} removed badge: ${badge.title}`);
        }
      }

      // Perform updates to user's badges array only if there are changes
      if (newBadgesToAwardIds.length > 0 || badgesToPullIds.length > 0) {
        const updateQuery = {};
        if (newBadgesToAwardIds.length > 0) {
          updateQuery.$addToSet = { BadgesID: { $each: newBadgesToAwardIds } };
        }
        if (badgesToPullIds.length > 0) {
          updateQuery.$pullAll = { BadgesID: badgesToPullIds };
        }

        await User.findByIdAndUpdate(
          id,
          updateQuery,
          { new: true } // Return the updated user document (after badge changes)
        );
      }
    } catch (error) {
      console.error(`Error assigning/removing badges for user ${id}:`, error);
      // This error will be logged but won't stop the main lecture update response
    }
  }

  console.log("Final awarded/removed badges for response:", badgeStatusChanges);

  res.status(200).json({
    success: true,
    message: `lecture ${checked ? "marked" : "unmarked"}`,
    XP: updatedUser ? updatedUser.XP : null, // Return the user's new total XP
    badgeStatusChanges: badgeStatusChanges, // Return information about acquired/removed badges
  });
});

/**
 * @DELETE_NOTE_FROM_LECTURE
 * @ROUTE @DELETE
 * @ACCESS course purchased user only {{url}}/:databaseName/api/v1/my-courses/:courseId/:lectureId
 */

export const deleteNote = asyncHandler(async (req, res, next) => {
  const MyCourse = getMyCourseModel(req); // Get dynamic MyCourse model

  const { id } = req.user;
  const { noteIndex } = req.body;
  const { lectureId } = req.query;
  const { courseId } = req.params;

  console.log(`Deleting note at index ${noteIndex} for lecture ${lectureId} in course ${courseId} for user ${id}`);

  const myCourse = await MyCourse.findOne(
    { userId: id },
    {
      myPurchasedCourses: {
        $elemMatch: {
          courseId: courseId,
        },
      },
    }
  );

  if (!myCourse || !myCourse.myPurchasedCourses || myCourse.myPurchasedCourses.length === 0) {
    return next(new AppError("My course record not found or course not purchased.", 404));
  }

  const purchasedCourse = myCourse.myPurchasedCourses[0];

  const lectureIndex = purchasedCourse.lectureProgress.findIndex(
    (item) => item.lectureId === lectureId
  );

  if (lectureIndex === -1) {
    return next(new AppError(`Lecture progress not found for this lecture.`, 404));
  }

  const notesArray = purchasedCourse.lectureProgress[lectureIndex].notes;

  if (noteIndex === undefined || noteIndex < 0 || noteIndex >= notesArray.length) {
    return next(new AppError(`Invalid note index.`, 400));
  }

  // Remove the note at the specified index
  notesArray.splice(noteIndex, 1);

  await myCourse.save(); // Save the changes

  res.status(200).json({
    success: true,
    message: "Note removed from lecture progress successfully",
  });
});

/**
 * @SUBMIT_QUIZ_ANSWERS
 * @ROUTE @POST
 * @ACCESS student/user {{url}}/:databaseName/api/v1/courses/:courseId/quizzes/:quizId/submit
 * @BODY { answers: [{ questionId: String, submittedAnswer: String }] }
 *
 * This controller handles the submission of quiz answers by a user.
 * It grades the quiz, calculates the score, and stores the result
 * in the user's `MyCourse` document. It also updates the user's XP
 * and checks for badge assignments or removals based on the new XP.
 */
export const submitQuizAnswers = asyncHandler(async (req, res, next) => {
  const MyCourse = getMyCourseModel(req);   // Get dynamic MyCourse model
  const User = getUserModel(req);         // Get dynamic User model
  const Badges = getBadgesModel(req);     // Get dynamic Badges model
  const Course = getCourseModel(req);     // Get dynamic Course model

  const { courseId, quizId } = req.params;
  const { answers } = req.body;
  const userId = req.user?.id; // Assuming req.user.id is populated by auth middleware

  // 1. Basic input validation
  if (!userId) {
    return next(
      new AppError(
        "User not authenticated. Please log in to submit quizzes.",
        401
      )
    );
  }

  if (!answers || !Array.isArray(answers) || answers.length === 0) {
    return next(
      new AppError(
        "Quiz answers are required and must be provided as an array.",
        400
      )
    );
  }

  // 2. Retrieve the actual quiz from the Course model to get correct answers and points
  const course = await Course.findOne(
    { _id: courseId, "quizzes._id": quizId },
    { "quizzes.$": 1, courseSequence: 1 } // Also fetch courseSequence to identify quiz position
  );

  if (!course || !course.quizzes || course.quizzes.length === 0) {
    return next(
      new AppError(
        "Course or Quiz not found. Please ensure the course and quiz IDs are correct.",
        404
      )
    );
  }

  const quiz = course.quizzes[0];
  if (!quiz) {
    return next(
      new AppError("Quiz details could not be retrieved from the course.", 500)
    );
  }

  // Create a map for quick lookup of correct answers and points by questionId
  const correctQuestionsMap = new Map();
  let totalPossibleQuizPoints = 0;

  quiz.questions.forEach((q) => {
    correctQuestionsMap.set(q._id.toString(), q);
    totalPossibleQuizPoints += q.points || 1;
  });

  let userObtainedScore = 0;
  const detailedUserAnswers = []; // To store detailed user answers for review

  // 3. Grade each submitted answer
  for (const submittedAnswer of answers) {
    const questionInQuiz = correctQuestionsMap.get(submittedAnswer.questionId);

    if (questionInQuiz) {
      const isCorrect =
        questionInQuiz.correctAnswer.toLowerCase() ===
        (submittedAnswer.submittedAnswer || "").toLowerCase();

      if (isCorrect) {
        userObtainedScore += questionInQuiz.points || 1;
      }

      detailedUserAnswers.push({
        questionId: submittedAnswer.questionId,
        submittedAnswer: submittedAnswer.submittedAnswer,
        isCorrect: isCorrect,
        correctAnswer: questionInQuiz.correctAnswer,
      });
    } else {
      console.warn(
        `Submitted question ID ${submittedAnswer.questionId} not found in quiz ${quizId}`
      );
    }
  }

  // 4. Find or create the MyCourse document for the user
  let myCourse = await MyCourse.findOne({ userId });

  if (!myCourse) {
    myCourse = new MyCourse({ userId });
    await myCourse.save();
  }

  // 5. Find the specific purchased course entry within myPurchasedCourses
  let purchasedCourseEntry = myCourse.myPurchasedCourses.find(
    (entry) => entry.courseId.toString() === courseId // Ensure comparison is safe
  );

  // If the user hasn't started this specific course yet, add it
  if (!purchasedCourseEntry) {
    purchasedCourseEntry = {
      courseId: courseId,
      lectureProgress: [],
      quizScores: [],
    };
    myCourse.myPurchasedCourses.push(purchasedCourseEntry);
  }

  // Ensure 'quizScores' array exists before pushing (it should from schema but defensive check)
  if (!purchasedCourseEntry.quizScores) {
    purchasedCourseEntry.quizScores = [];
  }

  // Check if this quiz has already been submitted by the user for this course
  // You might want to allow re-submission and store multiple scores, or prevent it.
  // For simplicity, this example allows multiple submissions, but you could add
  // logic to update an existing score if you only want the latest attempt.
  // We will *add* a new submission record for each attempt.
  const existingQuizSubmission = purchasedCourseEntry.quizScores.find(
    (scoreEntry) => scoreEntry.quizId.toString() === quizId
  );

  // If the quiz was already submitted, calculate the difference in score for XP adjustment.
  // This prevents double XP for re-submissions if a user improves their score.
  let xpAdjustment = userObtainedScore; // XP gained from this quiz submission initially
  if (existingQuizSubmission) {
      // If you store multiple attempts, you might compare against the highest previous score
      // or just add the new score. Here, if the quiz was submitted before, we only add
      // the difference if the new score is higher.
      const highestPrevScore = purchasedCourseEntry.quizScores
                                .filter(s => s.quizId.toString() === quizId)
                                .reduce((max, s) => Math.max(max, s.score), 0);
      xpAdjustment = userObtainedScore - highestPrevScore;
      if (xpAdjustment < 0) xpAdjustment = 0; // Don't decrease XP for lower subsequent scores
  }

  // Add the new quiz score entry to the user's progress
  purchasedCourseEntry.quizScores.push({
    quizId: quizId,
    score: userObtainedScore,
    totalPoints: totalPossibleQuizPoints,
    submittedAt: new Date(),
    // userAnswers: detailedUserAnswers, // Uncomment if you add userAnswers array to schema
  });

  // Save the updated MyCourse document to persist the score
  await myCourse.save();

  let updatedUser; // To hold the user document after XP update
  let badgeStatusChanges = []; // Array to store info about acquired/removed badges

  // 6. Update user's XP in the User model
  if (xpAdjustment !== 0) { // Only update XP if there's a net change
    try {
      updatedUser = await User.findByIdAndUpdate(
        userId, // Use userId from auth middleware
        { $inc: { XP: xpAdjustment } }, // Increment/decrement XP
        { new: true } // Return the updated user document
      );
      console.log(
        `User ${userId} XP updated by ${xpAdjustment} after quiz submission.`
      );
    } catch (error) {
      console.error(`Error updating user XP for ${userId}:`, error);
      return next(new AppError("Failed to update user XP after quiz.", 500));
    }
  } else {
    // If no XP change, still fetch the user to check for badges (e.g., if their XP was already enough)
    updatedUser = await User.findById(userId);
  }

  // 7. Badge Assignment and Removal Logic (copied from updateLectureMark)
  if (updatedUser) {
    try {
      const allBadges = await Badges.find({});
      const userCurrentBadgeIds = updatedUser.BadgesID
        ? updatedUser.BadgesID.map((id) => id.toString())
        : [];

      let newBadgesToAwardIds = [];
      let badgesToPullIds = [];

      for (const badge of allBadges) {
        const badgeIdString = badge._id.toString();
        const userHasBadge = userCurrentBadgeIds.includes(badgeIdString);

        if (updatedUser.XP >= badge.XP && !userHasBadge) {
          newBadgesToAwardIds.push(badge._id);
          badgeStatusChanges.push({ badge: badge, status: "acquired" });
          console.log(`User ${userId} acquired badge: ${badge.title}`);
        } else if (updatedUser.XP < badge.XP && userHasBadge) {
          badgesToPullIds.push(badge._id);
          badgeStatusChanges.push({ badge: badge, status: "removed" });
          console.log(`User ${userId} removed badge: ${badge.title}`);
        }
      }

      if (newBadgesToAwardIds.length > 0 || badgesToPullIds.length > 0) {
        const updateQuery = {};
        if (newBadgesToAwardIds.length > 0) {
          updateQuery.$addToSet = { BadgesID: { $each: newBadgesToAwardIds } };
        }
        if (badgesToPullIds.length > 0) {
          updateQuery.$pullAll = { BadgesID: badgesToPullIds };
        }

        await User.findByIdAndUpdate(
          userId, // Use userId
          updateQuery,
          { new: true }
        );
      }
    } catch (error) {
      console.error(
        `Error assigning/removing badges for user ${userId}:`,
        error
      );
      // Log the error but don't prevent the quiz submission response
    }
  }
  console.log("heer", {
    success: true,
    message: "Quiz submitted successfully and score recorded!",
    quizId: quizId,
    yourScore: userObtainedScore,
    totalQuizPoints: totalPossibleQuizPoints,
    XP: updatedUser ? updatedUser.XP : null, // Include current XP in response
    badgeStatusChanges: badgeStatusChanges, // Include badge changes in response
    // detailedResults: detailedUserAnswers,
  });

  // 8. Send Response
  res.status(200).json({
    success: true,
    message: "Quiz submitted successfully and score recorded!",
    quizId: quizId,
    yourScore: userObtainedScore,
    totalQuizPoints: totalPossibleQuizPoints,
    XP: updatedUser ? updatedUser.XP : null, // Include current XP in response
    badgeStatusChanges: badgeStatusChanges, // Include badge changes in response
    // detailedResults: detailedUserAnswers,
  });
});