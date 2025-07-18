import { myCourseSchema } from "../models/my.course.model.js"; // Assuming you have this schema

import { paymentSchema } from "../models/payment.model.js";
import asyncHandler from "../middleware/asyncHandler.middleware.js";
import AppError from "../utils/error.utils.js";
import { userSchema } from "../models/user.model.js";
import { badgesSchema } from "../models/badges.model.js";
import { courseSchema } from "../models/course.model.js"; // Assuming you have a function to get the Course model
/**
 * @GET_MY_COURSE_LIST
 * @ROUTE @GET
 * @ACCESS course purchased user only {{url}}/api/v1/my-courses
 */
const getPaymentModel = (req) => {
  console.log("getPaymentModel called");
  if (!req.dbConnection) {
    throw new AppError("Database connection not established", 500);
  }
  return req.dbConnection.model("Payment", paymentSchema);
};
const getUserModel = (req) => {
  if (!req.dbConnection) {
    throw new AppError("Database connection not established", 500);
  }
  return req.dbConnection.model("User", userSchema);
};
const getMyCourseModel = (req) => {
  if (!req.dbConnection) {
    throw new AppError("Database connection not established", 500);
  }
  return req.dbConnection.model("MyCourse", myCourseSchema);
};

const getCourseModel = (req) => {
  if (!req.dbConnection) {
    throw new AppError("Database connection not established", 500);
  }
  return req.dbConnection.model("Course", courseSchema);
};

const getMyBadgeModel = (req) => {
  if (!req.dbConnection) {
    throw new AppError("Database connection not established", 500);
  }
  return req.dbConnection.model("Badge", badgesSchema);
};

export const getMyAllCourses = asyncHandler(async (req, res, next) => {
  console.log("getMyAllCourses middleware called");

  const Payment = getPaymentModel(req);
  const { id } = req.user;

  const myPurchasedCourseList = await Payment.aggregate([
    {
      $match: {
        userId: id,
      },
    },
    {
      $unwind: "$purchasedCourse",
    },
    {
      $project: {
        _id: 0,
        courseId: {
          $toObjectId: "$purchasedCourse.courseId",
        },
      },
    },
    {
      $lookup: {
        from: "courses",
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
 * @ACCESS course purchased user only {{url}}/api/v1/my-courses/:courseId
 */

export const getMyCourseLectureProgress = asyncHandler(
  async (req, res, next) => {
    const { id } = req.user;
    const { courseId } = req.params;
    const MyCourse = getMyCourseModel(req);

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
 * @ACCESS course purchased user only {{url}}/api/v1/my-courses/:courseId/:lectureId
 */

export const addNote = asyncHandler(async (req, res, next) => {
  const { id } = req.user;
  const { note } = req.body;
  const { courseId } = req.params;
  const { lectureId } = req.query;
  const MyCourse = getMyCourseModel(req);

  const myCourse = await MyCourse.findOneAndUpdate(
    {
      userId: id,
      "myPurchasedCourses.courseId": courseId,
    },
    {
      $addToSet: {
        "myPurchasedCourses.$[elem].lectureProgress.$[subElem].notes": note,
      },
    },
    {
      arrayFilters: [
        { "elem.courseId": courseId },
        { "subElem.lectureId": lectureId },
      ],
      upsert: true,
      new: true,
    }
  );

  const courseIndex = myCourse.myPurchasedCourses.findIndex(
    (item) => item.courseId === courseId
  );

  const lectureIndex = myCourse.myPurchasedCourses[
    courseIndex
  ].lectureProgress.findIndex((item) => item.lectureId === lectureId);

  if (lectureIndex === -1) {
    myCourse.myPurchasedCourses[courseIndex].lectureProgress.push({
      lectureId,
      notes: [note],
    });

    await myCourse.save();
  }

  res.status(200).json({
    success: true,
    message: "note added successfully",
  });
});

/**
 * @UPDATE_LECTURE_CHECK_MARK
 * @ROUTE @PUT
 * @ACCESS course purchased user only {{url}}/api/v1/my-courses/:courseId/:lectureId
 */

export const updateLectureMark = asyncHandler(async (req, res, next) => {
  const { id } = req.user; // User ID from authenticated request
  const { checked, gainXP } = req.body; // 'checked' status of lecture, and XP gained/lost
  const { courseId } = req.params; // ID of the course
  const { lectureId } = req.query; // ID of the lecture

  // Get Mongoose models dynamically (assuming these functions are available)
  const MyCourse = getMyCourseModel(req);
  const User = getUserModel(req);
  const Badges = getMyBadgeModel(req);

  console.log(`Gain XP: ${gainXP}`);
  console.log(
    `User ID: ${id}, Checked: ${checked}, Course ID: ${courseId}, Lecture ID: ${lectureId}`
  );

  let myCourseDoc;
  let userDoc;
  let initialLectureMarkedStatus = null; // Store the status BEFORE update

  try {
    // 1. Find the MyCourse document for the user. If it doesn't exist, create it.
    // Initialize 'myPurchasedCourses' as an empty array if a new document is created.
    myCourseDoc = await MyCourse.findOne({ userId: id });

    if (!myCourseDoc) {
      myCourseDoc = await MyCourse.create({
        userId: id,
        myPurchasedCourses: [],
      });
      console.log(`New MyCourse document created for user ${id}`);
    }

    // 2. Find the course and lecture within the MyCourse document to get the initial status
    const existingCourseEntry = myCourseDoc.myPurchasedCourses.find(
      (item) => item.courseId.toString() === courseId.toString() // Ensure string comparison for IDs
    );

    if (existingCourseEntry) {
      const existingLectureEntry = existingCourseEntry.lectureProgress.find(
        (item) => item.lectureId.toString() === lectureId.toString() // Ensure string comparison for IDs
      );
      if (existingLectureEntry) {
        initialLectureMarkedStatus = existingLectureEntry.marked;
      }
    }

    // 3. Update the MyCourse document based on whether the course/lecture exists
    if (!existingCourseEntry) {
      // If the course doesn't exist for this user, add it along with the initial lecture progress
      await MyCourse.findOneAndUpdate(
        { userId: id },
        {
          $push: {
            myPurchasedCourses: {
              courseId: courseId,
              lectureProgress: [{ lectureId: lectureId, marked: checked }],
              quizScores: [], // Initialize quizScores for the new course
            },
          },
        },
        { new: true, runValidators: true }
      );
      console.log(
        `Course ${courseId} added with lecture ${lectureId} for user ${id}.`
      );
    } else {
      // If the course already exists, check if the lecture exists within it
      if (initialLectureMarkedStatus === null) {
        // Lecture not found in existing course's progress
        await MyCourse.findOneAndUpdate(
          {
            userId: id,
            "myPurchasedCourses.courseId": courseId, // Match the user and the specific course
          },
          {
            $push: {
              "myPurchasedCourses.$[elem].lectureProgress": {
                lectureId: lectureId,
                marked: checked,
              },
            },
          },
          {
            arrayFilters: [{ "elem.courseId": courseId }], // Filter to target the correct course array element
            new: true,
            runValidators: true,
          }
        );
        console.log(
          `Lecture ${lectureId} added to existing course ${courseId} for user ${id}.`
        );
      } else if (initialLectureMarkedStatus !== checked) {
        // Lecture exists, and its 'marked' status needs to change
        await MyCourse.findOneAndUpdate(
          {
            userId: id,
            "myPurchasedCourses.courseId": courseId,
            "myPurchasedCourses.lectureProgress.lectureId": lectureId, // Query to find the specific lecture
          },
          {
            $set: {
              "myPurchasedCourses.$[elem].lectureProgress.$[subElem].marked":
                checked,
            },
          },
          {
            arrayFilters: [
              { "elem.courseId": courseId }, // Filter for the specific course
              { "subElem.lectureId": lectureId }, // Filter for the specific lecture within the course
            ],
            new: true,
            runValidators: true,
          }
        );
        console.log(
          `Lecture ${lectureId} marked status updated from ${initialLectureMarkedStatus} to ${checked} for user ${id}.`
        );
      } else {
        console.log(
          `Lecture ${lectureId} status is already ${checked}. No change in marked status.`
        );
      }
    }

    // 4. Calculate actual XP change based on initial vs. final marked status
    // Re-fetch myCourseDoc to ensure we have the very latest state after all previous updates
    myCourseDoc = await MyCourse.findOne({ userId: id });
    const finalCourseEntry = myCourseDoc.myPurchasedCourses.find(
      (item) => item.courseId.toString() === courseId.toString()
    );
    let finalLectureMarkedStatus = null;
    if (finalCourseEntry) {
      const finalLectureEntry = finalCourseEntry.lectureProgress.find(
        (item) => item.lectureId.toString() === lectureId.toString()
      );
      if (finalLectureEntry) {
        finalLectureMarkedStatus = finalLectureEntry.marked;
      }
    }

    let actualXpChange = 0;
    // Determine if the lecture status actually flipped and apply XP accordingly
    if (initialLectureMarkedStatus !== finalLectureMarkedStatus) {
      // If final status is true and initial was false (or null for new entry), gain XP
      // If final status is false and initial was true, lose XP
      if (finalLectureMarkedStatus === true) {
        actualXpChange = gainXP;
      } else if (finalLectureMarkedStatus === false) {
        actualXpChange = -gainXP;
      }
    } else {
      console.log(
        "Lecture marked status did not change. No XP adjustment needed for this action."
      );
    }

    // 5. Update user's XP in the User model
    userDoc = await User.findByIdAndUpdate(
      id,
      { $inc: { XP: actualXpChange } }, // Increment/decrement XP by the calculated actualXpChange
      { new: true, runValidators: true } // Return the updated user document
    );
    if (!userDoc) {
      return next(new ErrorResponse("User not found for XP update.", 404));
    }
    console.log(
      `User ${id} XP updated by ${actualXpChange} to total ${userDoc.XP}.`
    );

    // 6. Badge Assignment and Removal Logic
    let badgeStatusChanges = []; // Array to store info about acquired/removed badges

    const allBadges = await Badges.find({}); // Fetch all available badges
    // Ensure 'BadgesID' exists as an array on the user document (or initialize it)
    const userCurrentBadgeIds = userDoc.BadgesID
      ? userDoc.BadgesID.map((badgeId) => badgeId.toString())
      : [];
    console.log("Current user badges (IDs):", userCurrentBadgeIds);

    let newBadgesToAwardIds = [];
    let badgesToPullIds = [];

    for (const badge of allBadges) {
      const badgeIdString = badge._id.toString();
      const userHasBadge = userCurrentBadgeIds.includes(badgeIdString);

      // Condition to Award Badge: User XP meets/exceeds badge requirement AND user doesn't already have the badge
      if (userDoc.XP >= badge.XP && !userHasBadge) {
        newBadgesToAwardIds.push(badge._id);
        badgeStatusChanges.push({ badge: badge, status: "acquired" });
        console.log(`User ${id} acquired badge: ${badge.title}`);
      }
      // Condition to Remove Badge: User XP drops below badge requirement AND user currently has the badge
      else if (userDoc.XP < badge.XP && userHasBadge) {
        badgesToPullIds.push(badge._id);
        badgeStatusChanges.push({ badge: badge, status: "removed" });
        console.log(`User ${id} removed badge: ${badge.title}`);
      }
    }

    // Perform updates to user's badges array only if there are changes
    if (newBadgesToAwardIds.length > 0 || badgesToPullIds.length > 0) {
      const updateQuery = {};
      if (newBadgesToAwardIds.length > 0) {
        // Use $addToSet to prevent duplicates if a badge is somehow added multiple times
        updateQuery.$addToSet = { BadgesID: { $each: newBadgesToAwardIds } };
      }
      if (badgesToPullIds.length > 0) {
        updateQuery.$pullAll = { BadgesID: badgesToPullIds };
      }

      await User.findByIdAndUpdate(
        id,
        updateQuery,
        { new: true, runValidators: true } // Return the updated user document (after badge changes)
      );
      console.log(`User ${id} badges collection updated.`);
    }

    console.log(
      "Final awarded/removed badges for response:",
      badgeStatusChanges
    );

    // Send success response
    res.status(200).json({
      success: true,
      message: `lecture ${checked ? "marked" : "unmarked"}`,
      XP: userDoc.XP, // Return the user's new total XP
      badgeStatusChanges: badgeStatusChanges, // Return information about acquired/removed badges
    });
  } catch (error) {
    console.error(`Error in updateLectureMark for user ${id}:`, error);
    return next(
      new ErrorResponse("Failed to update lecture mark or user progress.", 500)
    );
  }
});
/**
 * @DELETE_LECTURE_CHECK_MARK
 * @ROUTE @DELETE
 * @ACCESS course purchased user only {{url}}/api/v1/my-courses/:courseId/:lectureId
 */

export const deleteNote = asyncHandler(async (req, res, next) => {
  const { id } = req.user;
  const { noteIndex } = req.body;
  const { lectureId } = req.query;
  const { courseId } = req.params;
  console.log(noteIndex);
  const MyCourse = getMyCourseModel(req);
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

  const lectureIndex = myCourse.myPurchasedCourses[0].lectureProgress.findIndex(
    (item) => item.lectureId === lectureId
  );

  if (lectureIndex === -1) {
    return next(new AppError(`you don't have access to this course`, 400));
  }

  if (
    !myCourse.myPurchasedCourses[0].lectureProgress[lectureIndex].notes[
      noteIndex
    ]
  ) {
    return next(new AppError(`no note found on this note index`, 400));
  }

  myCourse.myPurchasedCourses[0].lectureProgress[lectureIndex].notes.splice(
    noteIndex,
    1
  );

  myCourse.save();

  res.status(200).json({
    success: true,
    message: "notes removed from lecture progress",
  });
});

// ... (Your existing controller functions like getLecturesByCourseId, addLectureIntoCourseById, etc.)

// --- NEW: Controller for submitting quiz answers ---

/**
 * @SUBMIT_QUIZ_ANSWERS
 * @ROUTE @POST
 * @ACCESS student/user {{url}}/api/v1/courses/:courseId/quizzes/:quizId/submit
 * @BODY { answers: [{ questionId: String, submittedAnswer: String }] }
 *
 * This controller handles the submission of quiz answers by a user.
 * It grades the quiz, calculates the score, and stores the result
 * in the user's `MyCourse` document. It also updates the user's XP
 * and checks for badge assignments or removals based on the new XP.
 */
export const submitQuizAnswers = asyncHandler(async (req, res, next) => {
  const { courseId, quizId } = req.params;
  const { answers } = req.body;
  const userId = req.user?.id; // Assuming req.user.id is populated by auth middleware
  const Course = getCourseModel(req);
  const MyCourse = getMyCourseModel(req);
  const User = getUserModel(req);
  const Badges = getMyBadgeModel(req);
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

  // Ensure 'quizScores' array exists before pushing
  if (!purchasedCourseEntry.quizScores) {
    purchasedCourseEntry.quizScores = [];
  }

  // Check if this quiz has already been submitted by the user for this course
  // You might want to allow re-submission and store multiple scores, or prevent it.
  // For simplicity, this example allows multiple submissions, but you could add
  // logic to update an existing score if you only want the latest attempt.
  const existingQuizSubmission = purchasedCourseEntry.quizScores.find(
    (scoreEntry) => scoreEntry.quizId.toString() === quizId
  );

  let xpChange = userObtainedScore; // XP gained from this quiz submission

  if (existingQuizSubmission) {
    // If the quiz was already submitted, calculate the difference in score
    // to adjust XP. This prevents double XP for re-submissions.
    xpChange = userObtainedScore - existingQuizSubmission.score;
    // Optional: Update the existing entry or add a new one (adding a new one for history)
    // If you want to update: existingQuizSubmission.score = userObtainedScore; etc.
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
  if (userObtainedScore !== 0) {
    // Only update XP if there's a change
    try {
      updatedUser = await User.findByIdAndUpdate(
        userId, // Use userId from auth middleware
        { $inc: { XP: userObtainedScore } },
        { new: true }
      );
      console.log(
        `User ${userId} XP updated by ${xpChange} after quiz submission.`
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
