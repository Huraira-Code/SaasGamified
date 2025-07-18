// Import Schema instead of Model
import { badgesSchema } from "../models/badges.model.js";

import cloudinary from "cloudinary";
import fs from "fs/promises"; // Using the promise-based version of fs for async cleanup
import AppError from "../utils/error.utils.js";
import asyncHandler from "../middleware/asyncHandler.middleware.js"; // Assuming you want to use this for all handlers

// --- HELPER FUNCTION TO GET DYNAMIC BADGES MODEL ---
const getBadgesModel = (req) => {
  if (!req.dbConnection) {
    throw new AppError('Database connection not established for this request.', 500);
  }
  return req.dbConnection.model('Badges', badgesSchema);
};
// --- END HELPER FUNCTION ---

/**
 * @CREATE_BADGE
 * @ROUTE @POST {{url}}/:databaseName/api/v1/badges
 * @ACCESS Private (Admin only, assumed via auth middleware)
 */
export const createBadges = asyncHandler(async (req, res, next) => {
  const Badges = getBadgesModel(req); // Get dynamic Badges model

  // 1. Destructure the expected fields from the request body
  const { title, content, XP } = req.body;
  // console.log(req.body); // Keep for debugging if needed

  // 2. Basic validation to ensure required fields and file are present
  if (!title || !content || !XP) {
    // IMPORTANT: If req.file exists after a failed validation, clean it up.
    // fs.unlink is safer than fs.rmSync if the file might not exist.
    if (req.file) {
      try { await fs.unlink(req.file.path); } catch (err) { console.error("Error cleaning up file:", err); }
    }
    return next(new AppError("Please provide title, content, and XP.", 400));
  }

  if (!req.file) {
    return next(new AppError("A badge image file is required.", 400));
  }

  // Initializing newBadge without saving directly yet
  let newBadgeData = {
    title,
    content,
    XP,
    // BadgesUrl will be set after Cloudinary upload
  };

  let uploadedImagePublicId; // To store public_id for cleanup on error

  try {
    // 3. Upload the file to Cloudinary
    const result = await cloudinary.v2.uploader.upload(req.file.path, {
      folder: "lms/badges", // A dedicated folder for badges
      width: 150,
      height: 150,
      crop: "fill",
      gravity: "face", // Good for profile-like images
    });
    // console.log(result); // Keep for debugging if needed

    if (result) {
      newBadgeData.BadgesUrl = result.secure_url;
      // It's also good practice to save the public_id for future deletions
      uploadedImagePublicId = result.public_id; // Store for potential rollback
      // Ensure your badgesSchema has `public_id` field if you want to store it
      // newBadgeData.public_id = result.public_id; // Uncomment if your schema includes public_id
    }

    // 4. Remove the file from the local server - CRITICAL FOR VERCEL
    // This `fs.rm` operation will *fail* on Vercel's ephemeral filesystem.
    // For Vercel, you should use `multer` with `memoryStorage` and directly stream
    // the buffer to Cloudinary without saving to disk first.
    // For local development, this is fine if you configured multer to save to 'uploads'.
    await fs.rm(req.file.path);

  } catch (error) {
    // If Cloudinary upload fails, clean up local file and return an error
    if (req.file) {
      try { await fs.unlink(req.file.path); } catch (err) { console.error("Error cleaning up file after Cloudinary fail:", err); }
    }
    console.error("Error during Cloudinary upload for badge:", error);
    return next(
      new AppError("Badge image upload failed, please try again. " + error.message, 500)
    );
  }
  // console.log(newBadgeData); // Keep for debugging if needed

  try {
    // 5. Create and save the new badge to the dynamically connected database
    const savedBadge = await Badges.create(newBadgeData);
    // console.log(savedBadge); // Keep for debugging if needed

    // 6. Respond with the created badge and a success message
    res.status(201).json({
      success: true,
      message: "Badge created successfully.",
      data: savedBadge,
    });
  } catch (error) {
    // If database save fails, you might want to try to delete the uploaded image from Cloudinary
    if (uploadedImagePublicId) {
        try {
            await cloudinary.v2.uploader.destroy(uploadedImagePublicId);
            console.log("Cleaned up Cloudinary image due to DB save failure:", uploadedImagePublicId);
        } catch (cloudinaryErr) {
            console.error("Failed to clean up Cloudinary image after DB save error:", cloudinaryErr);
        }
    }

    // Handle potential database validation errors or other errors
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((val) => val.message);
      return next(new AppError(`Validation Error: ${messages.join(', ')}`, 400));
    }

    console.error("Error creating badge in DB:", error);
    return next(new AppError("An unexpected error occurred while saving the badge.", 500));
  }
});

/**
 * @GET_ALL_BADGES
 * @ROUTE @GET {{url}}/:databaseName/api/v1/badges
 * @ACCESS Public or Private (depending on your application's needs)
 */
export const getAllBadges = asyncHandler(async (req, res, next) => {
  const Badges = getBadgesModel(req); // Get dynamic Badges model

  try {
    // 1. Fetch all badges from the dynamically connected database
    // 2. Sort the results to show the most recent badges first
    const badges = await Badges.find({}).sort({ createdAt: -1 });

    // 3. Respond with the count and the data
    res.status(200).json({
      success: true,
      data: badges,
    });
  } catch (error) {
    // 4. Handle any potential server errors
    console.error("Error fetching badges:", error); // Log for debugging
    return next(new AppError("Failed to fetch badges.", 500)); // Consistent error handling
  }
});


/**
 * @DELETE_BADGE
 * @ROUTE @DELETE {{url}}/:databaseName/api/v1/badges/:id
 * @ACCESS Private (Admin only, assumed via auth middleware)
 */
export const deleteBadge = asyncHandler(async (req, res, next) => {
  const Badges = getBadgesModel(req); // Get dynamic Badges model

  const { id } = req.params;

  try {
    const badge = await Badges.findById(id);

    if (!badge) {
      return next(new AppError("Badge not found with this ID.", 404));
    }

    // If your badgesSchema now includes a `public_id` for Cloudinary images, use it.
    // Assuming `badge.BadgesUrl` might contain the Cloudinary URL from which public_id can be extracted.
    // OR, if you added `public_id` to your `badgesSchema`, use `badge.public_id`.
    if (badge.public_id) { // This depends on if you added public_id field to schema and saved it
      try {
        await cloudinary.v2.uploader.destroy(badge.public_id);
        console.log("Cloudinary image deleted:", badge.public_id);
      } catch (cloudinaryError) {
        console.warn("Could not delete Cloudinary image:", cloudinaryError.message);
        // Log but don't stop the process if Cloudinary delete fails (e.g., image already gone)
      }
    } else if (badge.BadgesUrl) {
      // If public_id is not stored, you might try to extract it from the URL
      // This is less reliable. Best to store public_id directly.
      const publicIdFromUrl = badge.BadgesUrl.split('/').pop().split('.')[0];
      if (publicIdFromUrl) {
          try {
              await cloudinary.v2.uploader.destroy(`lms/badges/${publicIdFromUrl}`); // Assuming the folder is part of the public ID
              console.log("Attempted Cloudinary image delete from URL:", publicIdFromUrl);
          } catch (urlCloudinaryError) {
              console.warn("Could not delete Cloudinary image from URL:", urlCloudinaryError.message);
          }
      }
    }


    await Badges.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Badge deleted successfully.",
    });
  } catch (error) {
    console.error("Error deleting badge:", error);
    // If the error is a CastError (e.g., invalid ID format), return 400
    if (error.name === 'CastError') {
        return next(new AppError("Invalid badge ID format.", 400));
    }
    return next(new AppError("Failed to delete the badge.", 500));
  }
});