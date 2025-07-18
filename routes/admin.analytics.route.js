import {
  getCourseCompletionRates,
  getRevenueData,
  getTopContent,
  getUserGrowth,
} from "../controller/admin.analytics.controller.js";
import { Router } from "express";
const router = Router();
import { authorizedRoles, isLoggedIn } from "../middleware/auth.middleware.js";

router
  .route("/getUserGrowth")
  .post(isLoggedIn, authorizedRoles("ADMIN"), getUserGrowth);

router
  .route("/getTopContent")
  .post(isLoggedIn, authorizedRoles("ADMIN"), getTopContent);

router
  .route("/getRevenueData")
  .post(isLoggedIn, authorizedRoles("ADMIN"), getRevenueData);

router
  .route("/getCompletionRate")
  .post(isLoggedIn, authorizedRoles("ADMIN"), getCourseCompletionRates);


export default router;
