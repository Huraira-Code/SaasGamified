// Import Schemas instead of Models
import { userSchema } from "../models/user.model.js";
import { paymentSchema } from "../models/payment.model.js"; // Assuming you have this schema
import { courseSchema } from "../models/course.model.js"; // Assuming you have this schema
// myCourseSchema is imported in your original, but not directly used in these two functions.
// If other admin dashboard functions use it, keep it. Otherwise, you can remove it if not needed here.
// import { myCourseSchema } from "../models/my.course.model.js";

import asyncHandler from "../middleware/asyncHandler.middleware.js";
import AppError from "../utils/error.utils.js";

// --- HELPER FUNCTIONS TO GET DYNAMIC MODELS ---
const getUserModel = (req) => {
  if (!req.dbConnection) {
    throw new AppError('Database connection not established for this request.', 500);
  }
  return req.dbConnection.model('User', userSchema);
};

const getPaymentModel = (req) => {
  if (!req.dbConnection) {
    throw new AppError('Database connection not established for this request.', 500);
  }
  return req.dbConnection.model('Payment', paymentSchema);
};

const getCourseModel = (req) => {
  if (!req.dbConnection) {
    throw new AppError('Database connection not established for this request.', 500);
  }
  return req.dbConnection.model('Course', courseSchema);
};
// --- END HELPER FUNCTIONS ---


/**
 * @GET_COURSES_SELL_BY_USER (Dashboard summary of user purchases)
 * @ROUTE @GET {{url}}/:databaseName/api/v1/admin/dashboard/users-sell
 * @ACCESS admin only
 */

export const getCoursesSellByUser = asyncHandler(async (req, res, next) => {
  const User = getUserModel(req);       // Get dynamic User model
  const Payment = getPaymentModel(req); // Get dynamic Payment model
  const Course = getCourseModel(req);   // Get dynamic Course model
  console.log("Abc")
  // Fetch all users, payments, and courses from the current tenant's database
  // Select fields carefully to avoid pulling too much data
  const users = await User.find({}).select('_id email name avatar.secure_url');
  const payments = await Payment.find({});
  const courses = await Course.find({}).select('_id title lectures'); // Include lectures to filter for valid courses

  const totalUsers = users.length;
  const userCourses = [];

  // Create maps for efficient lookups
  const userMap = new Map(users.map(u => [u._id.toString(), u]));
  const courseMap = new Map(courses.map(c => [c._id.toString(), c]));

  payments.forEach((p) => {
    const userInfo = {
      userId: p.userId.toString(), // Ensure consistent string ID
      email: '',
      name: '',
      avatar: '',
      purchasedCourses: [],
    };

    const userDetails = userMap.get(p.userId.toString());
    if (userDetails) {
      userInfo.email = userDetails.email;
      userInfo.name = userDetails.name;
      userInfo.avatar = userDetails.avatar.secure_url;
    }

    p.purchasedCourse.forEach((c) => {
      c.purchaseDetails.forEach((item) => {
        // Check if expirationDate is in the future and course exists
        if (item.expirationDate > Date.now()) {
          const courseDetails = courseMap.get(c.courseId.toString());
          if (courseDetails) {
            userInfo.purchasedCourses.push({
              courseId: c.courseId.toString(),
              courseTitle: courseDetails.title,
              purchaseDate: item.purchaseDate,
              expirationDate: item.expirationDate, // Corrected typo
            });
          }
        }
      });
    });
    userCourses.push(userInfo);
  });

  res.status(200).json({
    success: true,
    message: "Fetched all users' course purchase information.",
    totalUsers,
    userCourses,
  });
});

/**
 * @GET_COURSES_SELL_BY_COURSE (Dashboard summary of course sales)
 * @ROUTE @GET {{url}}/:databaseName/api/v1/admin/dashboard/courses-sell
 * @ACCESS admin only
 */

export const getCoursesSellByCourse = asyncHandler(async (req, res, next) => {
  const Payment = getPaymentModel(req); // Get dynamic Payment model
  const Course = getCourseModel(req);   // Get dynamic Course model

  // Fetch all payments and courses from the current tenant's database
  const payments = await Payment.find({});
  const courses = await Course.find({});

  const totalCourses = courses.length;
  const sellCourses = [];

  // Create a map for efficient payment lookups by courseId
  const coursePurchaseCounts = new Map();

  payments.forEach(p => {
      p.purchasedCourse.forEach(item => {
          if (item.purchaseDetails && item.purchaseDetails.length > 0) {
              item.purchaseDetails.forEach(detail => {
                  if (detail.expirationDate && detail.expirationDate > Date.now()) {
                      const courseIdStr = item.courseId.toString();
                      coursePurchaseCounts.set(courseIdStr, (coursePurchaseCounts.get(courseIdStr) || 0) + 1);
                  }
              });
          }
      });
  });


  courses.forEach((c) => {
    const courseInfo = {
      _id: c._id.toString(),
      price: c.price,
      title: c.title,
      description: c.description,
      category: c.category,
      createdBy: c.createdBy,
      expiry: c.expiry,
      numberOfLectures: c.numberOfLectures,
      thumbnail: c.thumbnail,
      purchasedCourseByUser: coursePurchaseCounts.get(c._id.toString()) || 0, // Get count from map
    };
    sellCourses.push(courseInfo);
  });

  res.status(200).json({
    success: true,
    message: "Fetched all course sales information.",
    totalCourses,
    course: sellCourses,
  });
});


/**
 * @GET_USERS_WITH_CREATION_DATE (Get all users with their creation dates)
 * @ROUTE @GET {{url}}/:databaseName/api/v1/admin/dashboard/users
 * @ACCESS admin only
 */
export const getUsersWithCreationDate = asyncHandler(async (req, res, next) => {
  const User = getUserModel(req); // Get dynamic User model

  try {
    // Fetch all users with their name, email, and creation date
    // Sort by creation date (newest first)
    const users = await User.find({})
      .select('name email createdAt')
      .sort({ createdAt: -1 });

    // Format the response
    const formattedUsers = users.map(user => ({
      id: user._id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      createdDate: user.createdAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }),
      createdTime: user.createdAt.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      })
    }));

    res.status(200).json({
      success: true,
      message: "Fetched all users with creation dates",
      totalUsers: users.length,
      users: formattedUsers
    });

  } catch (error) {
    return next(new AppError('Failed to fetch users', 500));
  }
});