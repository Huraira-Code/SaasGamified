import { Router } from "express";
const router = Router();
import {
  authorizedRoles,
  isLoggedIn,
} from "../middleware/auth.middleware.js";
import { createAnnouncement, getAllAnnouncements } from "../controller/announcement.controller.js";



router
  .route("/")
  .get(getAllAnnouncements)
  .post(
    isLoggedIn,
    authorizedRoles("ADMIN"),
    createAnnouncement
  )
  
export default router;
