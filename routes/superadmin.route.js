import { Router } from "express";
import {
  addAdmin,
  checkAdminExists,
  checkTenantStatus,
  createCheckoutSession,
  getAllAdmins,
  superAdminSignIn,
  toggleAdminStatus,
} from "../controller/superadmin.controlloer.js";
const router = Router();

router.route("/login").post(superAdminSignIn);
router.route("/getalladmin").post(getAllAdmins);
router.route("/toggleAdminStatus").post(toggleAdminStatus);
router.route("/createAdmin").post(addAdmin);
router.route("/create-checkout-session").post(createCheckoutSession);
router.get("/status/:tenantId", checkTenantStatus);
router.get("/checkAdminExist", checkAdminExists);

export default router;
