import { Router } from "express";
const router = Router();
import {
  isLoggedIn,
  isPurchasedCourse,
} from "../middleware/auth.middleware.js";
import {
  addNote,
  deleteNote,
  getMyAllCourses,
  getMyCourseLectureProgress,
  submitQuizAnswers,
  updateLectureMark,
} from "../controller/my.course.controller.js";

router.route("/").get(isLoggedIn, getMyAllCourses);

router
  .route("/:courseId")
  .get(isLoggedIn, isPurchasedCourse, getMyCourseLectureProgress)
  .post(isLoggedIn, isPurchasedCourse, addNote)
  .put(isLoggedIn, isPurchasedCourse, updateLectureMark)
  .delete(isLoggedIn, isPurchasedCourse, deleteNote);

// Route for submitting quiz answers
router.route('/:courseId/quizzes/:quizId/submit')
  .post(isLoggedIn, submitQuizAnswers); // Assuming 'isLoggedIn' middleware checks user authentication
export default router;
