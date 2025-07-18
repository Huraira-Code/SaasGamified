import { Router } from "express";
const router = Router();
import {
  authorizedRoles,
  isLoggedIn,
} from "../middleware/auth.middleware.js";
import { upload } from "../middleware/multer.middleware.js";
import { createBadges, deleteBadge, getAllBadges } from "../controller/badges.controller.js";



router
  .route("/")
  .get(getAllBadges)
  .post(
    isLoggedIn,
    authorizedRoles("ADMIN"),
    upload.single("badge"),
    createBadges
  )

  router
    .route("/:id")
    .delete(
        isLoggedIn,
        authorizedRoles("ADMIN"),
        deleteBadge
    );
  
export default router;
