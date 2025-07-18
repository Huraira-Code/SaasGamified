import { Router } from "express";
const router = Router();
import {
  authorizedRoles,
  isLoggedIn,
  isPurchasedCourse,
} from "../middleware/auth.middleware.js";
import { upload } from "../middleware/multer.middleware.js";
import {
  addLectureIntoCourseById,
  createCourse,
  deleteCourse,
  getAllCourses,
  getLecturesByCourseId,
  removeLectureFromCourseById,
  updateCourse,
  updateLectureIntoCourseById,
  getFilterList,
  getAllUsers,
  addNewQuizToCourse,
  getAllQuizzesForCourse,
  getSingleQuizById,
  updateQuizDetailsById,
  deleteQuizFromCourse,
  addQuestionToQuiz,
  getAllQuestionsForQuiz,
  updateQuestionInQuiz,
  deleteQuestionFromQuiz,
  getCourseSequence,
  updateCourseSequence,
} from "../controller/course.controller.js";

router.route("/filters").get(getFilterList);

router
  .route("/")
  .get(getAllCourses)
  .post(
    isLoggedIn,
    authorizedRoles("ADMIN"),
    upload.single("thumbnail"),
    createCourse
  )
  .put(
    isLoggedIn,
    authorizedRoles("ADMIN"),
    upload.single("thumbnail"),
    updateCourse
  )
  .delete(isLoggedIn, authorizedRoles("ADMIN"), deleteCourse);

router.route("/getallUser").post(getAllUsers);

router
  .route("/:courseId")
  .get(isLoggedIn, isPurchasedCourse, getLecturesByCourseId)
  .post(
    isLoggedIn,
    authorizedRoles("ADMIN"),
    upload.single("lecture"),
    addLectureIntoCourseById
  )
  .put(
    isLoggedIn,
    authorizedRoles("ADMIN"),
    upload.single("lecture"),
    updateLectureIntoCourseById
  )
  .delete(isLoggedIn, authorizedRoles("ADMIN"), removeLectureFromCourseById);
router
  .route("/getIndiviualCourse/:courseId")
  .get(isLoggedIn, getLecturesByCourseId);

// Routes for managing quizzes within a course
router
  .route("/courses/:courseId/quizzes")
  .post(isLoggedIn, authorizedRoles("ADMIN"), addNewQuizToCourse) // Admin can add new quizzes
  .get(getAllQuizzesForCourse); // Public access to view all quizzes for a course

router
  .route("/courses/:courseId/quizzes/:quizId")
  .get(getSingleQuizById) // Public access to view a single quiz
  .put(isLoggedIn, authorizedRoles("ADMIN"), updateQuizDetailsById) // Admin can update quiz details
  .delete(isLoggedIn, authorizedRoles("ADMIN"), deleteQuizFromCourse); // Admin can delete a quiz

// --- Question Routes within a Quiz ---

// Routes for managing questions within a specific quiz
router
  .route("/courses/:courseId/quizzes/:quizId/questions")
  .post(isLoggedIn, authorizedRoles("ADMIN"), addQuestionToQuiz) // Admin can add questions to a quiz
  .get(getAllQuestionsForQuiz); // Public access to view all questions for a quiz

router
  .route("/courses/:courseId/quizzes/:quizId/questions/:questionId")
  .put(isLoggedIn, authorizedRoles("ADMIN"), updateQuestionInQuiz) // Admin can update a question
  .delete(isLoggedIn, authorizedRoles("ADMIN"), deleteQuestionFromQuiz); // Admin can delete a question

  router
  .route("/:courseId/sequence")
  .get(isLoggedIn, isPurchasedCourse, getCourseSequence) // User must be logged in and have purchased the course
  .put(isLoggedIn, authorizedRoles("ADMIN"), updateCourseSequence); // Only admin can update the sequence

export default router;
