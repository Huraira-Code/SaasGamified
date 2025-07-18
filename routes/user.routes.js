import { Router } from "express";
import { isLoggedIn } from "../middleware/auth.middleware.js";
import { upload } from "../middleware/multer.middleware.js";
import {
  adminRegister,
  changePassword,
  CompleteVerification,
  forgotPassword,
  getLoggedInUserDetails,
  login,
  logout,
  register,
  resetPassword,
  updateProfile,
  VerifyRejistration,
  viewLeaders,
  viewProfile,
} from "../controller/user.controller.js";

const router = Router();
router.route("/adminRegister").post(upload.single("avatar"), adminRegister);

router.route("/register").post(upload.single("avatar"), register);
router
  .route("/me")
  .get(isLoggedIn, getLoggedInUserDetails)
  .put(isLoggedIn, upload.single("avatar"), updateProfile);

router.route("/login").post(login);
router.route("/logout").get(isLoggedIn, logout);
router.route("/my-profile").get(isLoggedIn, viewProfile);
router.route("/leaderBoard").get(isLoggedIn, viewLeaders);
router.route("/verifyRejistration").post(VerifyRejistration);
router.route("/verificationComplete/:resetToken").post(CompleteVerification);
router.route("/reset").post(forgotPassword);
router.route("/reset/:resetToken").post(resetPassword);
router.route("/change-password").post(isLoggedIn, changePassword);

export default router;
