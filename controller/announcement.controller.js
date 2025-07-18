// Import Schema instead of Model
import { announcementSchema } from "../models/announcement.model.js";

import AppError from "../utils/error.utils.js"; // Assuming correct path
import asyncHandler from "../middleware/asyncHandler.middleware.js"; // Assuming correct path

// --- HELPER FUNCTION TO GET DYNAMIC ANNOUNCEMENT MODEL ---
const getAnnouncementModel = (req) => {
  if (!req.dbConnection) {
    throw new AppError('Database connection not established for this request.', 500);
  }
  return req.dbConnection.model('Announcement', announcementSchema);
};
// --- END HELPER FUNCTION ---

/**
 * @CREATE_ANNOUNCEMENT
 * @ROUTE @POST {{url}}/:databaseName/api/v1/announcements
 * @ACCESS Private (Admin only, assumed via auth middleware)
 */
export const createAnnouncement = asyncHandler(async (req, res, next) => {
  const Announcement = getAnnouncementModel(req); // Get dynamic Announcement model

  // 1. Destructure the expected fields from the request body
  const { title, content, announcementCategory } = req.body;

  // 2. Basic validation to ensure required fields are present
  if (!title || !content || !announcementCategory) {
    return next(
      new AppError("Please provide all required fields: title, content, and announcementCategory.", 400)
    );
  }

  try {
    // 3. Create a new announcement instance for the current tenant's database
    const newAnnouncement = new Announcement({
      title,
      content,
      announcementCategory,
    });

    // 4. Save the new announcement to the database
    const savedAnnouncement = await newAnnouncement.save();

    // 5. Respond with the created announcement and a success message
    res.status(201).json({
      success: true,
      message: "Announcement created successfully.",
      data: savedAnnouncement,
    });
  } catch (error) {
    // 6. Comprehensive error handling
    if (error.name === "ValidationError") {
      // Handle Mongoose validation errors (e.g., enum mismatch, maxlength exceeded)
      const messages = Object.values(error.errors).map(val => val.message);
      return next(
        new AppError(`Validation Error: ${messages.join(', ')}`, 400)
      );
    }

    // Handle other potential errors (e.g., database connection issues)
    console.error("Error creating announcement:", error); // Log the error for debugging
    return next(new AppError("An unexpected error occurred while saving the announcement.", 500));
  }
});


/**
 * @GET_ALL_ANNOUNCEMENTS
 * @ROUTE @GET {{url}}/:databaseName/api/v1/announcements
 * @ACCESS Public or Private (depending on your application's needs)
 */
export const getAllAnnouncements = asyncHandler(async (req, res, next) => {
  const Announcement = getAnnouncementModel(req); // Get dynamic Announcement model

  try {
    // 1. Fetch all announcements from the dynamically connected database
    // 2. Sort the results to show the most recent announcements first
    const announcements = await Announcement.find({}).sort({ createdAt: -1 });

    // 3. Respond with the count and the data
    res.status(200).json({
      success: true,
      count: announcements.length,
      data: announcements,
    });
  } catch (error) {
    // 4. Handle any potential server errors
    console.error("Error fetching announcements:", error); // Log for debugging
    return next(new AppError("Failed to fetch announcements.", 500)); // Consistent error handling
  }
});