import cloudinary from "cloudinary";
import fs from "fs/promises"; // Using promise-based fs for async operations
// import Course from "../models/course.model.js"; // REMOVE THIS
// import User from "../models/user.model.js";     // REMOVE THIS
import mongoose from "mongoose"; // Keep this for ObjectId validation, but use req.dbConnection.Types.ObjectId where possible

// Import Schemas instead of Models
import { courseSchema } from "../models/course.model.js";
import { userSchema } from "../models/user.model.js"; // For user lookups in `getAllUsers`

import asyncHandler from "../middleware/asyncHandler.middleware.js";
import AppError from "../utils/error.utils.js";
// cloudinaryConfig is likely run in app.js, no need to import here just for setup

// --- HELPER FUNCTIONS TO GET DYNAMIC MODELS ---
const getCourseModel = (req) => {
  if (!req.dbConnection) {
    throw new AppError(
      "Database connection not established for this request.",
      500
    );
  }
  return req.dbConnection.model("Course", courseSchema);
};

const getUserModel = (req) => {
  if (!req.dbConnection) {
    throw new AppError(
      "Database connection not established for this request.",
      500
    );
  }
  return req.dbConnection.model("User", userSchema);
};
// --- END HELPER FUNCTIONS ---

/**
 * @CREATE_COURSE
 * @ROUTE @POST {{url}}/:databaseName/api/v1/courses/
 * @ACCESS admin
 */
export const createCourse = asyncHandler(async (req, res, next) => {
  const Course = getCourseModel(req); // Get dynamic Course model

  const { title, description, createdBy, category, price, expiry } = req.body;
  // console.log(req.body); // For debugging
  // console.log(req.file); // For debugging

  if (!title || !description || !createdBy || !category || !price || !expiry) {
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (err) {
        console.error("Error cleaning up file:", err);
      }
    }
    return next(new AppError("All fields are required", 400)); // Changed 409 to 400 for bad request
  }
  // console.log("c"); // Debug log

  // Check if course with this title already exists in THIS tenant's database
  const isCourseExist = await Course.findOne({ title });
  if (isCourseExist) {
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (err) {
        console.error("Error cleaning up file:", err);
      }
    }
    return next(
      new AppError(
        "Title is already used in another course in this tenant.",
        400
      )
    );
  }
  // console.log("b"); // Debug log

  let thumbnailData = {
    public_id: "default", // Placeholder, will be updated
    secure_url:
      "https://www.careerguide.com/career/wp-content/uploads/2020/01/coding-programming-working-macbook-royalty-free-thumbnail.jpg",
  };

  let uploadedThumbnailPublicId; // To track public_id for cleanup on DB error

  if (req.file) {
    try {
      // console.log("Entering Cloudinary upload block. req.file:", req.file); // Debug log
      const result = await cloudinary.v2.uploader.upload(req.file.path, {
        folder: "lms", // Your Cloudinary folder
        width: 250,
        height: 200,
        crop: "fill",
      });

      // console.log("Cloudinary Upload Result:", result); // Debug log
      // console.log("mera pareesa"); // Debug log

      if (result) {
        // console.log("abc"); // Debug log
        thumbnailData.public_id = result.public_id;
        thumbnailData.secure_url = result.secure_url;
        uploadedThumbnailPublicId = result.public_id; // Store for potential rollback
      }

      // Remove local file (will not work on Vercel)
      await fs.unlink(req.file.path); // Use fs.unlink instead of fs.rmSync (promise-based)
    } catch (uploadError) {
      // Clean up local file on upload error
      if (req.file) {
        try {
          await fs.unlink(req.file.path);
        } catch (err) {
          console.error("Error cleaning up file:", err);
        }
      }
      console.error("Cloudinary Upload Error:", uploadError);
      return next(
        new AppError(
          "Course thumbnail upload failed: " + uploadError.message,
          500
        )
      );
    }
  }

  // console.log("a"); // Debug log

  const course = await Course.create({
    title,
    description,
    createdBy,
    category,
    price,
    expiry, // expiry in months
    thumbnail: thumbnailData,
  });

  if (!course) {
    // If course creation fails in DB, attempt to delete uploaded Cloudinary image
    if (uploadedThumbnailPublicId) {
      try {
        await cloudinary.v2.uploader.destroy(uploadedThumbnailPublicId);
        console.log("Cleaned up Cloudinary thumbnail due to DB save failure.");
      } catch (cloudinaryErr) {
        console.error(
          "Failed to clean up Cloudinary thumbnail:",
          cloudinaryErr
        );
      }
    }
    return next(new AppError("Course creation failed. Please try again.", 400));
  }

  res.status(201).json({
    // 201 for resource creation
    success: true,
    message: "Course created successfully",
    course,
  });
});

/**
 * @GET_ALL_COURSES
 * @ROUTE @GET {{url}}/:databaseName/api/v1/courses
 * @ACCESS public
 */
export const getAllCourses = asyncHandler(async (req, res, next) => {
  const Course = getCourseModel(req); // Get dynamic Course model

  const query = req.query;

  let courses = [];
  if (Object.keys(query).length !== 0 && (query.category || query.instructor)) {
    // Ensure query params exist and are relevant
    const categories = query.category ? query.category.split(",") : [];
    const instructors = query.instructor ? query.instructor.split(",") : [];

    const findQuery = {};
    if (categories.length > 0) findQuery.category = { $in: categories };
    if (instructors.length > 0) findQuery.createdBy = { $in: instructors };

    courses = await Course.find(findQuery).select("-lectures");
  } else {
    courses = await Course.find().select("-lectures");
  }

  if (!courses || courses.length === 0) {
    // Check if courses array is empty
    return next(new AppError("No courses found matching criteria.", 404)); // Use 404 for not found
  }

  res.status(200).json({
    success: true,
    message: "Courses fetched successfully",
    courses,
  });
});

/**
 * @GET_ALL_USERS (Moved from admin.dashboard.controller.js)
 * @ROUTE @GET {{url}}/:databaseName/api/v1/admin/dashboard/users (or a dedicated user admin route)
 * @ACCESS admin
 */
export const getAllUsers = asyncHandler(async (req, res, next) => {
  const User = getUserModel(req); // Get dynamic User model

  console.log("Fetching all users for admin dashboard...");
  // Fetch all users from the dynamically connected database
  const users = await User.find().select("-password -__v -refreshToken");

  if (!users || users.length === 0) {
    return next(new AppError("No users found in this database.", 404));
  }

  res.status(200).json({
    success: true,
    message: "All users fetched successfully",
    users,
  });
});

/**
 * @UPDATE_COURSE
 * @ROUTE @PUT {{url}}/:databaseName/api/v1/courses/?courseId='
 * @ACCESS admin
 */
export const updateCourse = asyncHandler(async (req, res, next) => {
  const Course = getCourseModel(req); // Get dynamic Course model

  // console.log("abc"); // Debug log
  const { courseId } = req.query; // Assuming courseId is a query parameter

  if (!courseId) {
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (err) {
        console.error("Error cleaning up file:", err);
      }
    }
    return next(new AppError("Course ID is required for update.", 400));
  }

  // Find course to update and get current thumbnail public_id
  const course = await Course.findById(courseId).select("+thumbnail.public_id"); // Explicitly select public_id for deletion

  if (!course) {
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (err) {
        console.error("Error cleaning up file:", err);
      }
    }
    return next(new AppError("Course not found with the provided ID.", 404));
  }

  // Update provided fields in the request body
  for (const key in req.body) {
    // Only update if the key exists in the schema and is not 'thumbnail' (handled separately)
    if (
      Object.prototype.hasOwnProperty.call(req.body, key) &&
      key !== "thumbnail" &&
      key in course
    ) {
      course[key] = req.body[key];
    }
  }

  if (req.file) {
    try {
      // Destroy old thumbnail on Cloudinary if it exists
      if (course.thumbnail && course.thumbnail.public_id) {
        await cloudinary.v2.uploader.destroy(course.thumbnail.public_id);
      }

      const result = await cloudinary.v2.uploader.upload(req.file.path, {
        folder: "lms",
        width: 250,
        height: 200,
        crop: "fill",
      });

      if (result) {
        course.thumbnail.public_id = result.public_id;
        course.thumbnail.secure_url = result.secure_url;
      }

      // Remove local file (will not work on Vercel)
      await fs.unlink(req.file.path);
    } catch (error) {
      // If Cloudinary upload or local file cleanup fails
      if (req.file) {
        try {
          await fs.unlink(req.file.path);
        } catch (err) {
          console.error("Error cleaning up file:", err);
        }
      }
      return next(new AppError("Course thumbnail update failed.", 500));
    }
  }

  await course.save(); // Save the updated course document

  res.status(200).json({
    success: true,
    message: "Course updated successfully",
    course,
  });
});

/**
 * @DELETE_COURSE
 * @ROUTE @DELETE {{url}}/:databaseName/api/v1/courses/?courseId='
 * @ACCESS admin
 */
export const deleteCourse = asyncHandler(async (req, res, next) => {
  const Course = getCourseModel(req); // Get dynamic Course model

  const { courseId } = req.query; // Assuming courseId is a query parameter

  if (!courseId) {
    return next(new AppError("Course ID is required for deletion.", 400));
  }

  // Find and delete the course
  const course = await Course.findById(courseId);

  if (!course) {
    return next(new AppError("Course not found with this ID.", 404));
  }

  // Delete associated thumbnail from Cloudinary
  if (course.thumbnail && course.thumbnail.public_id) {
    try {
      await cloudinary.v2.uploader.destroy(course.thumbnail.public_id);
    } catch (cloudinaryError) {
      console.warn(
        "Cloudinary cleanup failed for course thumbnail:",
        cloudinaryError
      );
    }
  }

  // Delete the course document itself
  await course.deleteOne(); // Use deleteOne() on the document instance

  res.status(200).json({
    success: true,
    message: "Course deleted successfully",
  });
});

/**
 * @GET_LECTURES_BY_COURSE_ID
 * @ROUTE @GET {{url}}/:databaseName/api/v1/courses/:courseId
 * @ACCESS public (or purchasedCourse only if content is restricted)
 */
export const getLecturesByCourseId = asyncHandler(async (req, res, next) => {
  const Course = getCourseModel(req); // Get dynamic Course model

  const { courseId } = req.params;

  if (!courseId) {
    return next(new AppError("Course ID is required.", 400));
  }

  const course = await Course.findById(courseId);

  if (!course) {
    return next(new AppError("Course not found with this ID.", 404));
  }

  res.status(200).json({
    success: true,
    message: "course lectures fetch successfully",
    lectures: course.lectures,
    title: course.title,
    course: course,
    // Avoid sending the entire 'course' object if only lectures are needed
  });
});

export const getCloudinarySignature = asyncHandler(async (req, res, next) => {
  console.log("mera munna 2");
  try {
    const timestamp = Math.round(new Date().getTime() / 1000);
    const apiSecret = cloudinary.config().api_secret;

    if (!apiSecret) {
      return next(new AppError("Cloudinary API Secret not configured.", 500));
    }

    // Parameters for the direct upload from the client
    const params = {
      timestamp: timestamp,
      folder: "lms", // This should match the folder you want on Cloudinary
      resource_type: "video", // Specify "video" if primarily for videos, or "auto"
      // Add any other upload parameters you need, e.g., 'eager', 'transformation', etc.
    };

    const signature = cloudinary.utils.api_sign_request(
      { timestamp: timestamp, folder: "lms" },
      apiSecret
    );

    res.status(200).json({
      success: true,
      signature: signature,
      timestamp: timestamp,
      cloudname: cloudinary.config().cloud_name,
      apiKey: cloudinary.config().api_key,
      folder: params.folder,
      resource_type: params.resource_type,
    });
  } catch (error) {
    console.error("Error generating Cloudinary signature:", error);
    return next(new AppError("Failed to generate Cloudinary signature.", 500));
  }
});

/**
 * @ADD_LECTURE_INTO_COURSE_BY_ID
 * @ROUTE @POST {{url}}/:databaseName/api/v1/courses/:courseId
 * @ACCESS admin
 */
export const addLectureIntoCourseById = asyncHandler(async (req, res, next) => {
  const Course = getCourseModel(req); // Get dynamic Course model

  const { courseId } = req.params;
  // Now, expect Cloudinary details directly from the client's request body
  const { name, description, lecturePublicId, lectureSecureUrl } = req.body;

  // Validate that all necessary fields, including Cloudinary details, are present
  if (!name || !description || !lecturePublicId || !lectureSecureUrl) {
    // No need to unlink files, as the file isn't processed by this backend endpoint anymore
    return next(
      new AppError(
        "All fields (name, description, lecturePublicId, lectureSecureUrl) are required for lecture.",
        400
      )
    );
  }

  const lectureData = {
    name,
    description,
    lecture: {
      public_id: lecturePublicId,
      secure_url: lectureSecureUrl,
    },
  };
  // No need for 'uploadedVideoPublicId' for server-side cleanup here,
  // as the upload was direct from client to Cloudinary.

  // Find the course and add the new lecture
  const updatedCourse = await Course.findByIdAndUpdate(
    courseId,
    {
      $push: { lectures: lectureData }, // $push adds to array
      $inc: { numberOfLectures: 1 }, // Increment lecture count
    },
    { new: true } // Return the updated document
  );

  if (!updatedCourse) {
    // If course not found or update fails.
    // Cloudinary video cleanup: This is more complex. If the DB update fails,
    // the Cloudinary asset is orphaned. You could implement a separate
    // API endpoint for deletion and have the client call it on DB failure,
    // or set up a Cloudinary webhook to your server for failed DB writes.
    // For simplicity, we'll leave it as is, assuming DB update usually succeeds.
    return next(
      new AppError("Course not found or lecture could not be added.", 404)
    );
  }

  res.status(200).json({
    success: true,
    message: "Lecture added to course successfully",
    course: updatedCourse, // Optionally send updated course details
  });
});

/**
 * @UPDATE_LECTURE_FROM_COURSE_BY_ID
 * @ROUTE @PUT {{url}}/:databaseName/api/v1/courses/:courseId?lectureId=''
 * @ACCESS admin
 */
export const updateLectureIntoCourseById = asyncHandler(async (req, res, next) => {
  const Course = getCourseModel(req); // Get dynamic Course model

  const { courseId } = req.params;
  const { lectureId } = req.query; // lectureId from query parameter

  // Destructure updated lecture data from req.body
  // lecturePublicId and lectureSecureUrl will be present ONLY if a new video is uploaded by client
  const { name, description, lecturePublicId, lectureSecureUrl } = req.body;

  console.log("updateLectureIntoCourseById - req.query:", req.query); // Debug log
  console.log("updateLectureIntoCourseById - req.params:", req.params); // Debug log
  console.log("updateLectureIntoCourseById - req.body:", req.body); // Debug log

  if (!courseId || !lectureId) {
    // No req.file to clean up here anymore
    return next(new AppError("Course ID or Lecture ID is missing.", 400));
  }

  // Find the course
  const course = await Course.findById(courseId);

  if (!course) {
    return next(new AppError("Course not found.", 404));
  }

  // Find the specific lecture within the course
  const lectureToUpdate = course.lectures.id(lectureId); // Use Mongoose subdocument .id() method
  if (!lectureToUpdate) {
    return next(new AppError("Lecture not found in this course.", 404));
  }

  // Store the old public_id if a new video is being provided
  let oldPublicId = lectureToUpdate.lecture?.public_id;

  // Update lecture fields
  if (name !== undefined) {
    lectureToUpdate.name = name;
  }
  if (description !== undefined) {
    lectureToUpdate.description = description;
  }

  // Handle video update (only if new lecturePublicId and lectureSecureUrl are provided)
  if (lecturePublicId && lectureSecureUrl) {
    try {
      // If there was an old video, destroy it from Cloudinary
      if (oldPublicId) {
        await cloudinary.v2.uploader.destroy(oldPublicId, {
          resource_type: "video",
        });
        console.log(`Old Cloudinary video (ID: ${oldPublicId}) deleted.`);
      }

      // Update the lecture's video details with the new ones from the frontend
      lectureToUpdate.lecture = {
        public_id: lecturePublicId,
        secure_url: lectureSecureUrl,
      };
    } catch (error) {
      console.error("Error updating lecture video in Cloudinary:", error);
      // It's crucial to decide how to handle this. If Cloudinary deletion/update fails
      // but DB save might succeed, you could have orphaned Cloudinary assets or
      // inconsistent data. For now, we'll return an error.
      return next(
        new AppError("Lecture video update failed: " + error.message, 500)
      );
    }
  }
  // If lecturePublicId and lectureSecureUrl are NOT provided,
  // the existing lecture.public_id and lecture.secure_url remain unchanged.
  // The frontend should only send these if a new file was uploaded.

  await course.save(); // Save the parent course document to persist changes

  res.status(200).json({
    success: true,
    message: "Lecture updated successfully",
    lecture: lectureToUpdate, // Send back the updated lecture details
  });
});

/**
 * @REMOVE_LECTURE_FROM_COURSE_BY_ID
 * @ROUTE @DELETE {{url}}/:databaseName/api/v1/courses/:courseId/lectures/:lectureId
 * @ACCESS admin
 */
export const removeLectureFromCourseById = asyncHandler(
  async (req, res, next) => {
    const Course = getCourseModel(req); // Get dynamic Course model

    const { courseId } = req.params; // Changed: lectureId from params
    const { lectureId } = req.body; // <--- CHANGE IS HERE

    console.log(req.params);
    console.log(req.query);
    if (!courseId || !lectureId) {
      return next(new AppError("Course ID or Lecture ID is missing.", 400));
    }

    const course = await Course.findById(courseId);

    if (!course) {
      return next(new AppError("Course not found with this ID.", 404));
    }

    const lectureToRemove = course.lectures.id(lectureId);
    if (!lectureToRemove) {
      return next(new AppError("Lecture not found in this course.", 404));
    }

    // Delete associated video from Cloudinary
    if (lectureToRemove.lecture && lectureToRemove.lecture.public_id) {
      try {
        await cloudinary.v2.uploader.destroy(
          lectureToRemove.lecture.public_id,
          { resource_type: "video" }
        );
      } catch (cloudinaryError) {
        console.warn("Cloudinary video cleanup failed:", cloudinaryError);
      }
    }

    // Remove the lecture from the array and decrement count
    course.lectures.pull(lectureId); // Use .pull() method
    course.numberOfLectures -= 1; // Decrement count manually

    await course.save(); // Save the parent course document

    res.status(200).json({
      success: true,
      message: "Lecture successfully removed from this course",
    });
  }
);

/**
 * @GET_FILTER_LIST
 * @ROUTE @GET {{url}}/:databaseName/api/v1/course/filters
 * @ACCESS public
 */
export const getFilterList = asyncHandler(async (req, res, next) => {
  const Course = getCourseModel(req); // Get dynamic Course model

  const filterList = await Course.aggregate([
    {
      $group: {
        _id: null,
        categories: {
          $addToSet: "$category",
        },
        instructors: {
          $addToSet: "$createdBy",
        },
      },
    },
    {
      $project: {
        _id: 0,
      },
    },
  ]);

  // filterList[0] might be undefined if no courses exist
  res.status(200).json(filterList[0] || { categories: [], instructors: [] });
});

/**
 * @ADD_NEW_QUIZ_TO_COURSE
 * @ROUTE @POST {{url}}/:databaseName/api/v1/courses/:courseId/quizzes
 * @BODY { title: String, description: String (optional), questions: [{ question: String, options: [String], correctAnswer: String, points: Number (optional) }] }
 * @ACCESS admin
 */
export const addNewQuizToCourse = asyncHandler(async (req, res, next) => {
  const Course = getCourseModel(req); // Get dynamic Course model

  const { courseId } = req.params;
  const { title, description, questions } = req.body;

  if (!title) {
    return next(new AppError("Quiz title is required.", 400));
  }

  // Basic validation for questions array if provided
  if (questions && !Array.isArray(questions)) {
    return next(new AppError("Questions must be an array.", 400));
  }
  if (questions && questions.length > 0) {
    for (const q of questions) {
      if (
        !q.question ||
        !q.options ||
        !Array.isArray(q.options) ||
        q.options.length < 2 ||
        !q.correctAnswer
      ) {
        return next(
          new AppError(
            "Each question must have a question text, at least two options, and a correct answer.",
            400
          )
        );
      }
      if (!q.options.includes(q.correctAnswer)) {
        return next(
          new AppError(
            `Correct answer '${q.correctAnswer}' for question '${q.question}' is not one of the provided options.`,
            400
          )
        );
      }
    }
  }

  const quizData = {
    title,
    description: description || "",
    questions: questions || [],
    totalPoints: questions
      ? questions.reduce((sum, q) => sum + (q.points || 1), 0)
      : 0,
  };

  const updatedCourse = await Course.updateOne(
    { _id: courseId },
    {
      $push: { quizzes: quizData },
    }
  );

  if (updatedCourse.modifiedCount === 0) {
    return next(
      new AppError("Course not found or quiz could not be added.", 404)
    );
  }

  res.status(201).json({
    success: true,
    message: "New quiz added to course successfully",
  });
});

/**
 * @GET_ALL_QUIZZES_FOR_COURSE
 * @ROUTE @GET {{url}}/:databaseName/api/v1/courses/:courseId/quizzes
 * @ACCESS public
 */
export const getAllQuizzesForCourse = asyncHandler(async (req, res, next) => {
  const Course = getCourseModel(req); // Get dynamic Course model

  const { courseId } = req.params;

  const course = await Course.findById(courseId).select("quizzes");

  if (!course) {
    return next(new AppError("Course not found with this ID", 404));
  }

  res.status(200).json({
    success: true,
    message: "Quizzes fetched successfully",
    quizzes: course.quizzes,
  });
});

/**
 * @GET_SINGLE_QUIZ_BY_ID
 * @ROUTE @GET {{url}}/:databaseName/api/v1/courses/:courseId/quizzes/:quizId
 * @ACCESS public
 */
export const getSingleQuizById = asyncHandler(async (req, res, next) => {
  const Course = getCourseModel(req); // Get dynamic Course model

  const { courseId, quizId } = req.params;

  // Find the course and project only the matching quiz using $elemMatch
  const course = await Course.findOne(
    { _id: courseId, "quizzes._id": quizId },
    { "quizzes.$": 1 } // Project only the matched element of the array
  );

  if (!course || !course.quizzes || course.quizzes.length === 0) {
    return next(new AppError("Course or Quiz not found", 404));
  }

  res.status(200).json({
    success: true,
    message: "Quiz fetched successfully",
    quiz: course.quizzes[0], // The matched quiz will be the first element
  });
});

/**
 * @UPDATE_QUIZ_DETAILS_BY_ID
 * @ROUTE @PUT {{url}}/:databaseName/api/v1/courses/:courseId/quizzes/:quizId
 * @BODY { title: String, description: String }
 * @ACCESS admin
 */
export const updateQuizDetailsById = asyncHandler(async (req, res, next) => {
  const Course = getCourseModel(req); // Get dynamic Course model

  const { courseId, quizId } = req.params;
  const { title, description } = req.body;

  if (!courseId || !quizId) {
    return next(new AppError("Course ID or Quiz ID is missing", 400));
  }

  if (!title && !description) {
    return next(new AppError("No update data provided for the quiz.", 400));
  }

  const updatedCourse = await Course.updateOne(
    { _id: courseId, "quizzes._id": quizId },
    {
      $set: {
        // Use object spread for conditional updates
        ...(title && { "quizzes.$.title": title }),
        ...(description && { "quizzes.$.description": description }),
      },
    }
  );

  if (updatedCourse.modifiedCount === 0) {
    return next(
      new AppError("Course not found or quiz could not be updated.", 404)
    );
  }

  res.status(200).json({
    success: true,
    message: "Quiz details updated successfully",
  });
});

/**
 * @DELETE_QUIZ_FROM_COURSE
 * @ROUTE @DELETE {{url}}/:databaseName/api/v1/courses/:courseId/quizzes/:quizId
 * @ACCESS admin
 */
export const deleteQuizFromCourse = asyncHandler(async (req, res, next) => {
  const Course = getCourseModel(req); // Get dynamic Course model

  const { courseId, quizId } = req.params;

  if (!courseId || !quizId) {
    return next(new AppError("Course ID or Quiz ID is missing", 400));
  }

  // Find the course to get the quiz details before deleting for XP adjustment
  const course = await Course.findById(courseId).select("quizzes");
  if (!course) {
    return next(new AppError("Course not found.", 404));
  }

  const quizToRemove = course.quizzes.id(quizId);
  if (!quizToRemove) {
    return next(new AppError("Quiz not found in this course.", 404));
  }

  // Remove the quiz and update the course
  const updatedCourse = await Course.updateOne(
    { _id: courseId },
    {
      $pull: { quizzes: { _id: quizId } },
    }
  );

  if (updatedCourse.modifiedCount === 0) {
    return next(
      new AppError(
        "Course not found or quiz could not be removed (quiz ID might be incorrect).",
        404
      )
    );
  }

  res.status(200).json({
    success: true,
    message: "Quiz successfully removed from this course",
  });
});

/**
 * @ADD_QUESTION_TO_QUIZ
 * @ROUTE @POST {{url}}/:databaseName/api/v1/courses/:courseId/quizzes/:quizId/questions
 * @BODY { question: String, options: [String], correctAnswer: String, points: Number (optional) }
 * @ACCESS admin
 */
export const addQuestionToQuiz = asyncHandler(async (req, res, next) => {
  const Course = getCourseModel(req); // Get dynamic Course model

  const { courseId, quizId } = req.params;
  const { question, options, correctAnswer, points } = req.body;

  if (
    !question ||
    !options ||
    !Array.isArray(options) ||
    options.length < 2 ||
    !correctAnswer
  ) {
    return next(
      new AppError(
        "Question text, at least two options, and the correct answer are all required for the question.",
        400
      )
    );
  }
  if (!options.includes(correctAnswer)) {
    return next(
      new AppError(
        "The correct answer must be one of the provided options.",
        400
      )
    );
  }

  const questionData = {
    question,
    options,
    correctAnswer,
    points: points || 1,
  };

  // Find the course and then the specific quiz to push the question into
  const updatedCourse = await Course.updateOne(
    { _id: courseId, "quizzes._id": quizId },
    {
      $push: { "quizzes.$.questions": questionData }, // Use positional operator to push into the found quiz's questions array
      $inc: { "quizzes.$.totalPoints": questionData.points || 1 }, // Increment total points for the quiz
    }
  );

  if (updatedCourse.modifiedCount === 0) {
    return next(
      new AppError(
        "Course or Quiz not found, or question could not be added.",
        404
      )
    );
  }

  res.status(201).json({
    // 201 for resource creation
    success: true,
    message: "Question added to quiz successfully",
  });
});

/**
 * @GET_ALL_QUESTIONS_FOR_QUIZ
 * @ROUTE @GET {{url}}/:databaseName/api/v1/courses/:courseId/quizzes/:quizId/questions
 * @ACCESS public
 */
export const getAllQuestionsForQuiz = asyncHandler(async (req, res, next) => {
  const Course = getCourseModel(req); // Get dynamic Course model

  const { courseId, quizId } = req.params;

  const course = await Course.findOne(
    { _id: courseId, "quizzes._id": quizId },
    { "quizzes.questions.$": 1, "quizzes.title": 1 } // Project only the questions and title of the matching quiz
  );

  if (!course || !course.quizzes || course.quizzes.length === 0) {
    return next(new AppError("Course or Quiz not found", 404));
  }

  res.status(200).json({
    success: true,
    message: "Questions fetched successfully",
    quizTitle: course.quizzes[0].title,
    questions: course.quizzes[0].questions,
  });
});

/**
 * @UPDATE_QUESTION_IN_QUIZ
 * @ROUTE @PUT {{url}}/:databaseName/api/v1/courses/:courseId/quizzes/:quizId/questions/:questionId
 * @BODY { question: String, options: [String], correctAnswer: String, points: Number }
 * @ACCESS admin
 */
export const updateQuestionInQuiz = asyncHandler(async (req, res, next) => {
  const Course = getCourseModel(req); // Get dynamic Course model

  const { courseId, quizId, questionId } = req.params;
  const { question, options, correctAnswer, points } = req.body;

  if (!courseId || !quizId || !questionId) {
    return next(
      new AppError("Course ID, Quiz ID, or Question ID is missing", 400)
    );
  }

  if (!question && !options && !correctAnswer && points === undefined) {
    return next(new AppError("No update data provided for the question.", 400));
  }

  const course = await Course.findById(courseId);

  if (!course) {
    return next(new AppError("Course not found", 404));
  }

  const quiz = course.quizzes.id(quizId); // Use Mongoose subdocument .id()
  if (!quiz) {
    return next(new AppError("Quiz not found in this course", 404));
  }

  const questionToUpdate = quiz.questions.id(questionId); // Use Mongoose subdocument .id()
  if (!questionToUpdate) {
    return next(new AppError("Question not found in this quiz", 404));
  }

  const oldPoints = questionToUpdate.points; // Store old points before update

  // Update question fields if provided
  if (question) questionToUpdate.question = question;
  if (options) {
    if (!Array.isArray(options) || options.length < 2) {
      return next(
        new AppError("Options must be an array with at least two items.", 400)
      );
    }
    questionToUpdate.options = options;
  }
  if (correctAnswer) questionToUpdate.correctAnswer = correctAnswer;
  if (points !== undefined) questionToUpdate.points = points;

  // Re-validate correctAnswer if options or correctAnswer changed
  if (
    (options || correctAnswer) && // Only validate if relevant fields changed
    !questionToUpdate.options.includes(questionToUpdate.correctAnswer)
  ) {
    return next(
      new AppError(
        "The updated correct answer must be one of the provided options.",
        400
      )
    );
  }

  // Update totalPoints in quiz if points changed for the question
  if (points !== undefined && oldPoints !== questionToUpdate.points) {
    quiz.totalPoints =
      quiz.totalPoints - oldPoints + (questionToUpdate.points || 0); // Ensure points is a number
  }

  await course.save(); // Save the parent course document

  res.status(200).json({
    success: true,
    message: "Question updated successfully",
  });
});

/**
 * @DELETE_QUESTION_FROM_QUIZ
 * @ROUTE @DELETE {{url}}/:databaseName/api/v1/courses/:courseId/quizzes/:quizId/questions/:questionId
 * @ACCESS admin
 */
export const deleteQuestionFromQuiz = asyncHandler(async (req, res, next) => {
  const Course = getCourseModel(req); // Get dynamic Course model

  const { courseId, quizId, questionId } = req.params;

  if (!courseId || !quizId || !questionId) {
    return next(
      new AppError("Course ID, Quiz ID, or Question ID is missing", 400)
    );
  }

  const course = await Course.findById(courseId);

  if (!course) {
    return next(new AppError("Course not found", 404));
  }

  const quiz = course.quizzes.id(quizId);
  if (!quiz) {
    return next(new AppError("Quiz not found in this course", 404));
  }

  const questionToRemove = quiz.questions.id(questionId);
  if (!questionToRemove) {
    return next(new AppError("Question not found in this quiz", 404));
  }

  // Subtract points of the removed question from quiz's totalPoints
  quiz.totalPoints -= questionToRemove.points || 0; // Ensure subtraction is based on a number
  // Remove the question from the array
  quiz.questions.pull(questionId); // Use .pull() method

  await course.save(); // Save the parent course document

  res.status(200).json({
    success: true,
    message: "Question removed from quiz successfully",
  });
});

/**
 * @GET_COURSE_SEQUENCE
 * @ROUTE @GET {{url}}/:databaseName/api/v1/courses/:courseId/sequence
 * @ACCESS loggedIn, purchasedCourse
 */
export const getCourseSequence = asyncHandler(async (req, res, next) => {
  const Course = getCourseModel(req); // Get dynamic Course model

  const { courseId } = req.params;

  // Find the course and select the necessary fields
  const course = await Course.findById(courseId).select(
    "lectures quizzes courseSequence title"
  );

  if (!course) {
    return next(new AppError("Course not found.", 404));
  }

  // Create maps for quick lookup of lecture and quiz details
  const lectureMap = new Map(
    course.lectures.map((lecture) => [
      lecture._id.toString(),
      {
        name: lecture.name,
        description: lecture.description,
        // You might want to include secure_url here if the user is authorized to view it
        // lectureUrl: lecture.lecture.secure_url,
      },
    ])
  );

  const quizMap = new Map(
    course.quizzes.map((quiz) => [
      quiz._id.toString(),
      {
        title: quiz.title,
        description: quiz.description,
        totalPoints: quiz.totalPoints,
      },
    ])
  );

  const structuredSequence = course.courseSequence.map((item) => {
    const contentId = item.contentId.toString(); // Convert ObjectId to string for map lookup
    if (item.type === "video") {
      const lectureDetails = lectureMap.get(contentId);
      if (lectureDetails) {
        return {
          type: "video",
          id: contentId,
          ...lectureDetails,
        };
      }
    } else if (item.type === "quiz") {
      const quizDetails = quizMap.get(contentId);
      if (quizDetails) {
        return {
          type: "quiz",
          id: contentId,
          ...quizDetails,
        };
      }
    }
    // Handle cases where contentId might not be found (e.g., deleted lecture/quiz)
    return {
      type: item.type, // Renamed to 'itemType' in schema, but using 'type' from existing data
      id: contentId,
      name: "Content Not Found",
      description: "This item might have been removed.",
    };
  });

  res.status(200).json({
    success: true,
    message: "Course sequence fetched successfully",
    courseTitle: course.title,
    sequence: structuredSequence,
  });
});

/**
 * @UPDATE_COURSE_SEQUENCE
 * @ROUTE @PUT {{url}}/:databaseName/api/v1/courses/:courseId/sequence
 * @BODY { sequence: [{ type: String ('video' | 'quiz'), contentId: String }] }
 * @ACCESS admin
 */
export const updateCourseSequence = asyncHandler(async (req, res, next) => {
  const Course = getCourseModel(req); // Get dynamic Course model
  console.log("mera kumi kamal ka", Course);
  // console.log("abc"); // Debug log
  const { courseId } = req.params;
  const { sequence: newSequence } = req.body;

  if (!Array.isArray(newSequence)) {
    return next(new AppError("Sequence must be an array of objects.", 400));
  }

  const course = await Course.findById(courseId).select("lectures quizzes");
  console.log("Course found:", course); // Debug log
  if (!course) {
    return next(new AppError("Course not found.", 404));
  }

  // Pre-fetch all valid lecture and quiz IDs for efficient validation
  const validLectureIds = new Set(
    course.lectures.map((lec) => lec._id.toString())
  );
  const validQuizIds = new Set(
    course.quizzes.map((quiz) => quiz._id.toString())
  );

  console.log("mera 2", validLectureIds, validQuizIds); // Debug log
  // Validate each item in the new sequence
  for (const item of newSequence) {
    console.log("Validating sequence item:", item); // Debug log
    // Ensure all required fields for a sequence item are present
    // if (!item.type || !item.contentId) {
    //   console.log("Invalid sequence item:", item); // Debug log
    //   return next(
    //     new AppError(
    //       "Each sequence item must have a 'type' and 'contentId'.",
    //       400
    //     )
    //   );
    // }
    // // Validate 'type' enum
    // if (!["video", "quiz"].includes(item.type)) {
    //   console.log("Invalid type in sequence item:", item.type); // Debug log
    //   return next(
    //     new AppError(
    //       `Invalid type '${item.type}'. Type must be 'video' or 'quiz'.`,
    //       400
    //     )
    //   );
    // }
    // // Validate contentId format (Mongoose ObjectId)
    // if (!req.dbConnection.Types.ObjectId.isValid(item.contentId)) {

    //   console.log("Invalid contentId format:", item.contentId); // Debug log
    //   return next(
    //     new AppError(`Invalid contentId format: ${item.contentId}`, 400)
    //   );
    // }
    console.log("Content error:", item); // Debug log
    const contentIdStr = item.contentId;
    console.log("Content ID:", contentIdStr); // Debug log
    // Validate if contentId actually exists in the course's lectures or quizzes
    if (item.type === "video" && !validLectureIds.has(contentIdStr)) {
      return next(
        new AppError(
          `Lecture with ID ${item.contentId} not found in this course.`,
          400
        )
      );
    }
    if (item.type === "quiz" && !validQuizIds.has(contentIdStr)) {
      return next(
        new AppError(
          `Quiz with ID ${item.contentId} not found in this course.`,
          400
        )
      );
    }
    console.log("Item is valid:", item); // Debug log
  }

  console.log("All sequence items are valid. Proceeding to update..."); // Debug log
  newSequence.forEach((item) => {
    console.log("dhgs", item.type);
    if (!mongoose.Types.ObjectId.isValid(item.contentId)) {
      console.error("❌ Invalid contentId:", item.contentId);
    } else {
      const objectId = new mongoose.Types.ObjectId(item.contentId);
      console.log("✅ Converted ObjectId:", objectId);
    }
  });

  // If all validations pass, update the course sequence
  course.courseSequence = newSequence.map((item) => ({
    type: item.type,
    contentId: new mongoose.Types.ObjectId(item.contentId), // Convert to ObjectId before saving
  }));

  await course.save();

  res.status(200).json({
    success: true,
    message: "Course sequence updated successfully",
  });
});
