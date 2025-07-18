

import { userSchema } from '../models/user.model.js';
import { courseSchema } from '../models/course.model.js';
import { paymentSchema } from '../models/payment.model.js';

import AppError from '../utils/error.utils.js';
import { myCourseSchema } from '../models/my.course.model.js';

// Utility to get dynamic models
const getModel = (req, name, schema) => {
  if (!req.dbConnection) {
    throw new AppError("Database connection not established for this request.", 500);
  }
  return req.dbConnection.model(name, schema);
};

// User Growth Analytics
export const getUserGrowth = async (req, res) => {
  try {
    const User = getModel(req, "User", userSchema);
    const { fromDate, toDate } = req.body;

    const query = {};
    if (fromDate && toDate) {
      query.createdAt = {
        $gte: new Date(fromDate),
        $lte: new Date(toDate),
      };
    }

    const users = await User.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
    ]);

    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getRevenueData = async (req, res) => {
  try {
    const Payment = getModel(req, "Payment", paymentSchema);

    const { fromDate, toDate } = req.body;

    const matchQuery = {};
    if (fromDate && toDate) {
      matchQuery.createdAt = {
        $gte: new Date(fromDate),
        $lte: new Date(toDate),
      };
    }

    const revenue = await Payment.aggregate([
      { $match: matchQuery }, // Apply initial date filtering here
      {
        $unwind: "$purchasedCourse", // Deconstruct the purchasedCourse array
      },
      // IMPORTANT: Add this stage to convert courseId string to ObjectId
      {
        $addFields: {
          "purchasedCourse.courseIdObjectId": { $toObjectId: "$purchasedCourse.courseId" }
        }
      },
      {
        $unwind: "$purchasedCourse.purchaseDetails", // Deconstruct the purchaseDetails array
      },
      {
        $lookup: {
          from: "courses", // The name of your courses collection in MongoDB
          localField: "purchasedCourse.courseIdObjectId", // Use the newly created ObjectId field
          foreignField: "_id",
          as: "courseInfo",
        },
      },
      {
        $unwind: "$courseInfo", // Deconstruct the courseInfo array
      },
      {
        $group: {
          _id: {
            year: { $year: "$purchasedCourse.purchaseDetails.purchaseDate" },
            month: { $month: "$purchasedCourse.purchaseDetails.purchaseDate" },
            day: { $dayOfMonth: "$purchasedCourse.purchaseDetails.purchaseDate" },
          },
          totalRevenue: { $sum: "$courseInfo.price" },
          totalPurchases: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
    ]);

    res.json(revenue);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getTopContent = async (req, res) => {
  try {
    const Payment = getModel(req, "Payment", paymentSchema);
    // const Course = getModel(req, "Course", courseSchema); // Not strictly needed here

    const topCourses = await Payment.aggregate([
      { $unwind: "$purchasedCourse" },
      // Add a stage to convert the string courseId to ObjectId
      {
        $addFields: {
          "purchasedCourse.courseIdObjectId": { $toObjectId: "$purchasedCourse.courseId" }
        }
      },
      {
        $group: {
          // Now group by the newly created ObjectId field
          _id: "$purchasedCourse.courseIdObjectId",
          purchaseCount: { $sum: 1 }
        }
      },
      { $sort: { purchaseCount: -1 } },
      { $limit: 4 },
      {
        $lookup: {
          from: "courses", // Make sure this is the exact collection name
          localField: "_id", // This _id is now an ObjectId due to the $group
          foreignField: "_id",
          as: "course"
        }
      },
      { $unwind: "$course" }, // This will deconstruct the course array
      {
        $project: {
          title: "$course.title",
          purchaseCount: 1,
          _id: 0 // Optionally exclude the _id if not needed in the final output
        }
      }
    ]);

    res.json(topCourses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// New Controller: getCourseCompletionRates
export const getCourseCompletionRates = async (req, res) => {
  try {
    // Assuming MyCourse model is available via getModel
    const MyCourse = getModel(req, "MyCourse", myCourseSchema);
    // Assuming Course model is also available (not directly used in this aggregation)
    // const Course = getModel(req, "Course", courseSchema);

    const { fromDate, toDate } = req.body;

    const matchQuery = {};
    if (fromDate && toDate) {
      matchQuery.createdAt = { // Filter MyCourse documents by their creation date
        $gte: new Date(fromDate),
        $lte: new Date(toDate),
      };
    }

    const completionRates = await MyCourse.aggregate([
      { $match: matchQuery }, // Filter MyCourse documents by date range
      { $unwind: "$myPurchasedCourses" }, // Deconstruct the array of purchased courses for each user
      // Convert courseId to ObjectId for lookup, as it's defined as String in myCourseSchema
      {
        $addFields: {
          "myPurchasedCourses.courseIdObjectId": { $toObjectId: "$myPurchasedCourses.courseId" }
        }
      },
      {
        $lookup: {
          from: "courses", // The name of your courses collection (usually 'courses' for a 'Course' model)
          localField: "myPurchasedCourses.courseIdObjectId", // Use the converted ObjectId
          foreignField: "_id",
          as: "courseDetails",
        },
      },
      { $unwind: "$courseDetails" }, // Deconstruct the courseDetails array (assuming one match per courseId)
      {
        // Calculate completed lectures for each purchased course
        $addFields: {
          "completedLecturesCount": {
            $size: {
              $filter: {
                input: "$myPurchasedCourses.lectureProgress",
                as: "lp",
                cond: "$$lp.marked", // Filter where marked is true
              },
            },
          },
          "totalCourseLectures": { $size: "$courseDetails.lectures" }, // Explicitly get total lectures from Course schema
        }
      },
      {
        // Calculate if the course is 100% completed
        $addFields: {
          "isCourseCompleted": {
            $and: [
              { $eq: ["$completedLecturesCount", "$totalCourseLectures"] }, // Check if completed count equals total lectures count
              { $gt: ["$totalCourseLectures", 0] } // Ensure course has lectures to avoid false positives for empty courses
            ]
          }
        }
      },
      // --- RE-ENABLED FINAL AGGREGATION STAGES ---
      {
        $group: {
          _id: "$courseDetails._id", // Group by course ID
          courseTitle: { $first: "$courseDetails.title" }, // Get the course title
          totalEnrollments: { $sum: 1 }, // Count total times this course was purchased/enrolled
          totalCompletions: {
            $sum: {
              $cond: ["$isCourseCompleted", 1, 0], // Sum 1 if completed, 0 otherwise
            },
          },
        },
      },
      {
        $project: {
          _id: 0, // Exclude _id from final output
          courseId: "$_id",
          courseTitle: 1,
          totalEnrollments: 1,
          totalCompletions: 1,
          completionRate: {
            $cond: [
              { $gt: ["$totalEnrollments", 0] }, // Avoid division by zero
              { $multiply: [{ $divide: ["$totalCompletions", "$totalEnrollments"] }, 100] }, // Calculate rate as percentage
              0, // If no enrollments, rate is 0
            ],
          },
        },
      },
      { $sort: { completionRate: -1 } }, // Sort by completion rate descending
      // --- END RE-ENABLED FINAL AGGREGATION STAGES ---
    ]);

    res.json(completionRates); // Send the final aggregated output
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};