import cloudinary from "cloudinary";
import fs from "fs"; // This will not work on Vercel's ephemeral filesystem
import crypto, { verify } from "crypto";
// import { userSchema } from "../models/user.model.js"; // REMOVE THIS LINE
// import { myCourseSchema } from "../models/my.course.model.js"; // Assuming you have this schema
// REMOVE THIS LINE

// IMPORT SCHEMAS INSTEAD OF MODELS
import { userSchema } from "../models/user.model.js";
import { myCourseSchema } from "../models/my.course.model.js"; // Assuming you have this schema

import asyncHandler from "../middleware/asyncHandler.middleware.js";
import AppError from "../utils/error.utils.js";
import {
  forgotPasswordMail,
  registerMail,
  verifyUserMail,
} from "../utils/mail.utils.js";
import { badgesSchema } from "../models/badges.model.js";

const cookieOptions = {
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  sameSite: "lax", // More relaxed than "none" but still prevents CSRF in most cases
  secure: true, // Allow over HTTP (not HTTPS) – NOT secure, use only for local development
  httpOnly: true, // Allows access from JavaScript – not recommended, but workable
  path: "/",

};
// --- HELPER FUNCTION TO GET DYNAMIC MODELS ---
const getUserModel = (req) => {
  if (!req.dbConnection) {
    throw new AppError(
      "Database connection not established for this request.",
      500
    );
  }
  // 'User' is the name of your Mongoose model, userSchema is the imported schema definition
  return req.dbConnection.model("User", userSchema);
};

const getMyCourseModel = (req) => {
  if (!req.dbConnection) {
    throw new AppError(
      "Database connection not established for this request.",
      500
    );
  }
  return req.dbConnection.model("MyCourse", myCourseSchema);
};

const getBadgeModel = (req) => {
  if (!req.dbConnection) {
    throw new AppError(
      "Database connection not established for this request.",
      500
    );
  }
  return req.dbConnection.model("Badges", badgesSchema);
};
// --- END HELPER FUNCTIONS ---

/**
 * @REGISTER
 * @ROUTE @POST
 * @ACCESS public {{url}}/:databaseName/api/v1/user/register
 */

export const register = asyncHandler(async (req, res, next) => {
  const User = getUserModel(req); // Get dynamic User model
  const MyCourse = getMyCourseModel(req); // Get dynamic MyCourse model

  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    if (req.file) fs.rmSync(`uploads/${req.file.filename}`); // Vercel: This will fail
    return next(new AppError("all fields are required", 400));
  }

  if (password.length < 8) {
    if (req.file) fs.rmSync(`uploads/${req.file.filename}`); // Vercel: This will fail
    return next(new AppError("password must be atleast 8 char long", 400));
  }

  if (name.length < 3 || name.length > 30) {
    if (req.file) fs.rmSync(`uploads/${req.file.filename}`); // Vercel: This will fail
    return next(new AppError("name must atlesast 5 char and not more than 50"));
  }

  const isUserExist = await User.findOne({ email });
  const isNameExist = await User.findOne({ name });

  if (isUserExist) {
    if (req.file) fs.rmSync(`uploads/${req.file.filename}`); // Vercel: This will fail
    return next(new AppError("please enter another email address", 400));
  }

  if (isNameExist) {
    if (req.file) fs.rmSync(`uploads/${req.file.filename}`); // Vercel: This will fail
    return next(
      new AppError("please enter another name this name is already taken", 400)
    );
  }
  const user = await User.create({
    name,
    email,
    password,
    avatar: {
      public_id: email, // Consider a more unique ID if email changes or for privacy
      secure_url:
        "https://cdn3.iconfinder.com/data/icons/avatars-round-flat/33/man5-512.png",
    },
  });

  if (!user) {
    return next(
      new AppError("User registration failed, please try again", 400)
    );
  }

  // uploading user avatar on cloudinary
  if (req.file) {
    try {
      const result = await cloudinary.v2.uploader.upload(req.file.path, {
        folder: "lms",
        width: 200,
        height: 200,
        crop: "fill",
        gravity: "faces",
      });

      if (result) {
        user.avatar.public_id = result.public_id;
        user.avatar.secure_url = result.secure_url;
      }

      // removing avatar image from server - Vercel: This will fail as filesystem is ephemeral
      fs.rmSync(`uploads/${req.file.filename}`);
    } catch (error) {
      // It's crucial to handle Cloudinary upload errors properly.
      // If the user was created but avatar failed, you might want to delete the user or log the error.
      return next(new AppError("File uploading error: " + error.message, 500));
    }
  }

  await user.save();
  user.password = undefined; // Remove password before sending response

  const token = await user.generateAuthToken(); // Assuming this method exists on userSchema

  res.cookie("token", token, cookieOptions);
  // registerMail(email); // Ensure this utility also handles dynamic environments if needed

  // Create MyCourse entry for the newly registered user in the same tenant database
  await new MyCourse({
    userId: user._id.toString(),
    myPurchasedCourses: [],
  }).save();

  res.status(201).json({
    // 201 for resource creation
    success: true,
    message: "user registered successfully",
  });
});

/**
 * @LOGIN
 * @ROUTE @POST
 * @ACCESS public {{url}}/:databaseName/api/v1/user/login
 */

export const adminRegister = asyncHandler(async (req, res, next) => {
  // IMPORTANT: This controller assumes the admin is being registered within a specific tenant database.
  // The tenant connection should be established by middleware before this controller runs (e.g., via a tenantId in the URL).
  const User = getUserModel(req); // Get dynamic User model for the specific tenant
  const MyCourse = getMyCourseModel(req); // Get dynamic MyCourse model for the specific tenant

  // Destructure admin details from request body
  const { name, email, password } = req.body;

  // 1. Basic validation
  if (!name || !email || !password) {
    // If a file was uploaded but validation fails, clean it up (Vercel note still applies)
    if (req.file) fs.rmSync(`uploads/${req.file.filename}`);
    return next(
      new AppError(
        "All fields (name, email, password) are required for admin registration.",
        400
      )
    );
  }

  // 2. Password length validation
  if (password.length < 8) {
    if (req.file) fs.rmSync(`uploads/${req.file.filename}`);
    return next(
      new AppError("Admin password must be at least 8 characters long.", 400)
    );
  }

  // 3. Name length validation
  if (name.length < 3 || name.length > 50) {
    // Adjusted max length to 50 as per common practice
    if (req.file) fs.rmSync(`uploads/${req.file.filename}`);
    return next(
      new AppError(
        "Admin name must be at least 3 characters and not more than 50 characters long.",
        400
      )
    );
  }

  // 4. Check if admin user with this email already exists in this tenant
  const isUserExist = await User.findOne({ email });
  if (isUserExist) {
    if (req.file) fs.rmSync(`uploads/${req.file.filename}`);
    return next(
      new AppError(
        "An admin user with this email already exists in this LMS.",
        400
      )
    );
  }

  // 5. Create the new admin user
  const adminUser = await User.create({
    name,
    email,
    password, // Password will be hashed by Mongoose pre-save hook if configured
    role: "ADMIN", // Assign 'admin' role (assuming your User schema has a 'role' field)
    avatar: {
      public_id: email, // Consider a more unique ID like user._id or a UUID
      secure_url:
        "https://cdn3.iconfinder.com/data/icons/avatars-round-flat/33/man5-512.png", // Default avatar
    },
  });

  if (!adminUser) {
    return next(
      new AppError("Admin registration failed, please try again.", 400)
    );
  }

  // 6. Handle avatar upload to Cloudinary (if a file is provided)
  if (req.file) {
    try {
      const result = await cloudinary.v2.uploader.upload(req.file.path, {
        folder: "lms_admin_avatars", // Dedicated folder for admin avatars
        width: 200,
        height: 200,
        crop: "fill",
        gravity: "faces",
      });

      if (result) {
        adminUser.avatar.public_id = result.public_id;
        adminUser.avatar.secure_url = result.secure_url;
      }

      // Remove avatar image from server (Vercel: This will fail as filesystem is ephemeral)
      fs.rmSync(`uploads/${req.file.filename}`);
    } catch (error) {
      console.error("Cloudinary upload error for admin avatar:", error);
      // It's crucial to handle Cloudinary upload errors properly.
      // If the admin user was created but avatar failed, you might want to log the error
      // and proceed, or delete the user if avatar is critical.
      // For now, we'll just log and let the registration proceed with default avatar.
      // return next(new AppError("Admin avatar uploading error: " + error.message, 500));
    }
  }

  await adminUser.save(); // Save user with updated avatar URL if uploaded
  adminUser.password = undefined; // Remove password before sending response

  // 7. Removed token generation and cookie setting as per request.
  // const token = await adminUser.generateAuthToken();
  // res.cookie("token", token, cookieOptions);

  // 8. Send registration email (if registerMail utility is available)
  // registerMail(email);

  // 9. Create MyCourse entry for the newly registered admin (if applicable)
  // This assumes admins also need a MyCourse document in their tenant database.
  // If not, remove this block.
  await new MyCourse({
    userId: adminUser._id.toString(),
    myPurchasedCourses: [],
  }).save();

  // 10. Send success response
  res.status(201).json({
    success: true,
    message: "Admin registered successfully for this LMS!",
    adminUser, // Return admin user details (excluding password)
    // Token is no longer returned
  });
});

export const login = asyncHandler(async (req, res, next) => {
  const User = getUserModel(req); // Get dynamic User model

  const { email, password } = req.body;

  if (!email || !password) {
    return next(new AppError("email and password are required to login", 400));
  }

  // Select password field explicitly if it's set to select: false in schema
  const user = await User.findOne({ email }).select("+password");

  if (!user) {
    return next(new AppError("invalid email or password", 400));
  }

  const verifyPassword = await user.comparePassword(password); // Assuming this method exists on userSchema

  if (!verifyPassword) {
    return next(new AppError("invalid email or password", 400));
  }

  user.password = undefined; // Remove password before sending response
  console.log("User Data", user); // Logging user object (consider removing sensitive data)
  const token = await user.generateAuthToken(); // Assuming this method exists on userSchema
  console.log("Generated Token:", token); // Log the generated token for debugging
  res.cookie("token", token, cookieOptions);
  console.log("loging user", user); // Logging user object (consider removing sensitive data)
  res.status(200).json({
    success: true,
    message: "login successfully",
    role: user.role,
    verify: user.verfiy, // Assuming 'verfiy' is a field in your user schema
  });
});

/**
 * @LOGOUT
 * @ROUTE @GET
 * @ACCESS login user only  {{url}}/:databaseName/api/v1/user/logout
 */

export const logout = asyncHandler(async (req, res, next) => {
  // Clear cookie options should match the set cookie options
  res.cookie("token", "", { maxAge: 0, ...cookieOptions });
  // res.clearCookie("token"); // This line is redundant if maxAge: 0 and other options match

  res.status(200).json({
    success: true,
    message: "logout successfully",
  });
});

/**
 * @USER_DETAILS
 * @ROUTE @GET
 * @ACCESS login user only  {{url}}/:databaseName/api/v1/user/me
 */

export const getLoggedInUserDetails = asyncHandler(async (req, res, next) => {
  const User = getUserModel(req); // Get dynamic User model

  // req.user.id is populated by the 'isLoggedIn' middleware.
  // Ensure that 'isLoggedIn' middleware also uses req.dbConnection
  const { id } = req.user;

  if (!id) {
    return next(new AppError("User ID not found in request.user", 401));
  }

  const user = await User.findById(id).populate("BadgesID"); // Populate BadgesID if it's a ref to another collection

  if (!user) {
    return next(new AppError("User not found in this database", 404)); // Change 401 to 404 if user ID is valid but not found
  }

  res.status(200).json({
    success: true,
    message: "User details",
    user,
  });
});

/**
 * @FORGOT_PASSWORD
 * @ROUTE @POST
 * @ACCESS public  {{url}}/:databaseName/api/v1/user/reset
 */

export const VerifyRejistration = asyncHandler(async (req, res, next) => {
  const User = getUserModel(req); // Get dynamic User model

  const { email } = req.body;

  if (!email) {
    return next(new AppError("email is required!", 400));
  }

  const user = await User.findOne({ email });

  if (!user) {
    // For security, don't reveal if email exists or not
    return next(
      new AppError(
        "If a user with that email exists, a password reset email has been sent.",
        200
      )
    );
  }
  console.log("user", user);
  const resetToken = user.generateVerifyEmailToken(); // Assuming this method exists on userSchema

  // Construct the reset link including the dynamic databaseName
  const resetTokenLink = resetToken;

  try {
    await verifyUserMail(email, resetTokenLink); // Ensure mail utility can handle this URL
  } catch (error) {
    user.forgotPasswordToken = undefined;
    user.forgotPasswordExpiry = undefined;
    await user.save({ validateBeforeSave: false }); // Save without re-validating password
    console.error("Verify email send error:", error);
    return next(
      new AppError(`Email could not be sent. Please try again later.`, 500)
    );
  }

  await user.save(); // Save user with the token and expiry (assuming `generateForgotPasswordToken` updates these fields)
  res.status(200).json({
    success: true,
    message: "Verify request sent to user mail",
  });
});

export const CompleteVerification = asyncHandler(async (req, res, next) => {
  console.log("CompleteVerification called with params:", req.params);
  const User = getUserModel(req); // Get dynamic User model

  const { resetToken } = req.params;

  const hashedToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
  console.log("Hashed Token:", hashedToken); // Log the hashed token for debugging
  const user = await User.findOne({
    verifyEmailToken: hashedToken,
    verifyEmailExpiry: { $gt: Date.now() },
  });

  if (!user) {
    return next(new AppError("invalid user or token is expire", 400));
  }

  user.verfiy = true; // Mongoose pre-save hook should handle hashing
  user.forgotPasswordToken = undefined;
  user.forgotPasswordExpiry = undefined;

  await user.save();

  res.status(200).json({
    success: true,
    message: "Verification successfully",
    role: user.role, // Return user role if needed
  });
});

export const forgotPassword = asyncHandler(async (req, res, next) => {
  const User = getUserModel(req); // Get dynamic User model

  const { email } = req.body;

  if (!email) {
    return next(new AppError("email is required!", 400));
  }

  const user = await User.findOne({ email });

  if (!user) {
    // For security, don't reveal if email exists or not
    return next(
      new AppError(
        "If a user with that email exists, a password reset email has been sent.",
        200
      )
    );
  }

  const resetToken = user.generateForgotPasswordToken(); // Assuming this method exists on userSchema

  // Construct the reset link including the dynamic databaseName
  const resetTokenLink = resetToken;

  try {
    await forgotPasswordMail(email, resetTokenLink); // Ensure mail utility can handle this URL
  } catch (error) {
    user.forgotPasswordToken = undefined;
    user.forgotPasswordExpiry = undefined;
    await user.save({ validateBeforeSave: false }); // Save without re-validating password
    console.error("Forgot password email send error:", error);
    return next(
      new AppError(`Email could not be sent. Please try again later.`, 500)
    );
  }

  await user.save(); // Save user with the token and expiry (assuming `generateForgotPasswordToken` updates these fields)
  res.status(200).json({
    success: true,
    message: "Forgot password request sent to user mail",
  });
});

/**
 * @RESET_PASSWORD
 * @ROUTE @POST
 * @ACCESS public {{url}}/:databaseName/api/v1/user/reset/:resetToken
 */

export const resetPassword = asyncHandler(async (req, res, next) => {
  const User = getUserModel(req); // Get dynamic User model

  const { password, confirmPassword } = req.body;
  const { resetToken } = req.params;

  if (!password || !confirmPassword) {
    return next(
      new AppError("password and confirm password are required", 400)
    );
  }

  if (password !== confirmPassword) {
    return next(
      new AppError("password and confirm password are not match", 400)
    );
  }

  const hashedToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  const user = await User.findOne({
    forgotPasswordToken: hashedToken,
    forgotPasswordExpiry: { $gt: Date.now() },
  });

  if (!user) {
    return next(new AppError("invalid user or token is expire", 400));
  }

  user.password = password; // Mongoose pre-save hook should handle hashing
  user.forgotPasswordToken = undefined;
  user.forgotPasswordExpiry = undefined;

  await user.save();

  res.status(200).json({
    success: true,
    message: "password reset successfully",
  });
});

/**
 * @CHANGE_PASSWORD
 * @ROUTE @POST
 * @ACCESS  logged in user only  {{url}}/:databaseName/api/v1/user/change-password
 */

export const changePassword = asyncHandler(async (req, res, next) => {
  const User = getUserModel(req); // Get dynamic User model

  const { oldPassword, newPassword } = req.body;
  const { id } = req.user; // req.user populated by isLoggedIn middleware

  if (!oldPassword || !newPassword) {
    return next(new AppError("all field are required", 400));
  }

  if (oldPassword === newPassword) {
    // Use strict equality
    return next(new AppError("new password match old password", 400));
  }

  const user = await User.findById(id).select("+password"); // Select password explicitly

  const verifyPassword = await user.comparePassword(oldPassword); // Assuming this method exists

  if (!verifyPassword) {
    return next(new AppError("old password not match", 400));
  }

  user.password = newPassword; // Mongoose pre-save hook should hash this
  await user.save();

  user.password = undefined; // Remove password from response

  res.status(200).json({
    success: true,
    message: "password changed successfully",
  });
});

/**
 * @UPDATE_PROFILE
 * @ROUTE @PUT (changed from POST for RESTful principles)
 * @ACCESS  logged in user only  {{url}}/:databaseName/api/v1/user/me
 */

export const updateProfile = asyncHandler(async (req, res, next) => {
  const User = getUserModel(req); // Get dynamic User model

  const { id } = req.user; // req.user populated by isLoggedIn middleware

  const user = await User.findById(id);

  if (!user) {
    if (req.file) fs.rmSync(`uploads/${req.file.filename}`); // Vercel: This will fail
    return next(new AppError("user not found", 404)); // 404 if user doesn't exist
  }

  // Update fields dynamically
  for (const key in req.body) {
    if (Object.prototype.hasOwnProperty.call(req.body, key) && key in user) {
      // Safer check
      user[key] = req.body[key];
    }
  }

  if (req.file) {
    try {
      // Destroy old avatar on Cloudinary if it exists
      if (user.avatar && user.avatar.public_id) {
        await cloudinary.v2.uploader.destroy(user.avatar.public_id);
      }

      // Upload new avatar
      const result = await cloudinary.v2.uploader.upload(req.file.path, {
        folder: "lms",
        width: 200,
        height: 200,
        crop: "fill",
        gravity: "faces",
      });

      if (result) {
        user.avatar.public_id = result.public_id;
        user.avatar.secure_url = result.secure_url;

        // Remove temp file - Vercel: This will fail
        fs.rmSync(`uploads/${req.file.filename}`);
      }
    } catch (error) {
      // In case of error during file operations, clean up any remaining temp files
      if (req.file && fs.existsSync(req.file.path)) {
        // Check if file still exists before trying to remove
        fs.rmSync(req.file.path);
      }
      return next(
        new AppError("Updating profile avatar error: " + error.message, 500)
      );
    }
  }

  await user.save(); // Save the updated user

  res.status(200).json({
    success: true,
    message: "profile updated successfully",
    user,
  });
});

/**
 * @VIEW_PROFILE
 * @ROUTE @GET
 * @ACCESS  logged in user only  {{url}}/:databaseName/api/v1/user/my-profile
 */
export const viewProfile = asyncHandler(async (req, res, next) => {
  const User = getUserModel(req); // Get dynamic User model
  const { id } = req.user;
  const Badges = getBadgeModel(req); // Get dynamic Badges model
  const user = await User.findById(id).populate("BadgesID"); // Populate BadgesID if it's a ref

  if (!user) {
    return next(new AppError("User not found in this database.", 404)); // Use 404 for not found
  }

  res.status(200).json({
    success: true,
    message: "Profile fetched successfully.",
    user,
  });
});

/**
 * @VIEW_LEADERS
 * @ROUTE @GET
 * @ACCESS public (or restricted based on your needs) {{url}}/:databaseName/api/v1/user/leaderBoard
 * @description Fetches all users and sorts them by XP in descending order.
 */
export const viewLeaders = asyncHandler(async (req, res, next) => {
  const User = getUserModel(req); // Get dynamic User model

  try {
    const leaders = await User.find({})
      .sort({ XP: -1 }) // Assuming 'XP' is a field in your User schema
      .populate("BadgesID"); // Populate badges if it's a ref

    res.status(200).json({
      success: true,
      message: "Leaderboard fetched successfully.",
      leaders,
    });
  } catch (error) {
    console.error("Error fetching leaders:", error);
    return next(new AppError("Failed to fetch leaderboard data.", 500));
  }
});
