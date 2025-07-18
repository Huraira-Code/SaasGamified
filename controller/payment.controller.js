// Import schemas instead of models
import { paymentSchema } from "../models/payment.model.js";
import { userSchema } from "../models/user.model.js";
import { courseSchema } from "../models/course.model.js"; // Assuming course.model.js now exports courseSchema
import { myCourseSchema } from "../models/my.course.model.js";

import { stripe } from "../app.js"; // stripe instance remains global from app.js
import asyncHandler from "../middleware/asyncHandler.middleware.js";
import AppError from "../utils/error.utils.js";
import { coursePurchasingMail } from "../utils/mail.utils.js";

// --- HELPER FUNCTIONS TO GET DYNAMIC MODELS ---
const getPaymentModel = (req) => {
  if (!req.dbConnection) {
    throw new AppError(
      "Database connection not established for this request.",
      500
    );
  }
  return req.dbConnection.model("Payment", paymentSchema);
};

const getUserModel = (req) => {
  if (!req.dbConnection) {
    throw new AppError(
      "Database connection not established for this request.",
      500
    );
  }
  return req.dbConnection.model("User", userSchema);
};

const getCourseModel = (req) => {
  if (!req.dbConnection) {
    throw new AppError(
      "Database connection not established for this request.",
      500
    );
  }
  return req.dbConnection.model("Course", courseSchema);
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
// --- END HELPER FUNCTIONS ---

/**
 * @CHECKOUT
 * @ROUTE @POST
 * @ACCESS login user only {{url}}/:databaseName/api/v1/checkout
 */

export const checkout = asyncHandler(async (req, res, next) => {
  const Payment = getPaymentModel(req); // Get dynamic Payment model

  const { amount, title, courseId, SchoolId } = req.body;
  console.log("his is the value", req.user.id);
  const id = req.user.id.toString(); // <--- Change made here  const { id } = req.user; // User ID from isLoggedIn middleware (authenticated for current tenant)
  console.log("after string converstion", id);
  // 1. Check if a payment record exists for this user in this tenant's database
  let paymentRecord = await Payment.findOne({ userId: id });
  console.log("Payment record found:", paymentRecord);
  if (!paymentRecord) {
    // If no payment record, create a new one
    paymentRecord = await Payment.create({
      userId: id,
      purchasedCourses: [],
    });
    // No need for paymentRecord.save() after create, it's already saved
  } else {
    // If payment record exists, check if course is already purchased and not expired
    const courseIndex = paymentRecord.purchasedCourse.findIndex(
      (item) => item.courseId.toString() === courseId // Ensure string comparison for ObjectId
    );

    if (courseIndex !== -1) {
      const isPurchasedAndValid = paymentRecord.purchasedCourse[
        courseIndex
      ].purchaseDetails.some((detail) => detail.expirationDate > Date.now());

      if (isPurchasedAndValid) {
        return next(
          new AppError(
            "You have already purchased this course and your access is still valid.",
            502
          )
        );
      }
    }
  }

  // Create Stripe Checkout Session
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "PKR", // Make sure this currency is supported by your Stripe account
          product_data: {
            name: title,
          },
          unit_amount: amount * 100, // Amount in smallest currency unit (e.g., cents)
        },
        quantity: 1,
      },
    ],
    // These URLs should include the dynamic databaseName to maintain context
    success_url: `${process.env.FRONT_URL}/${SchoolId}/paymentsuccess/${courseId}?tenant=${req.params.databaseName}`,
    cancel_url: `${process.env.FRONT_URL}/${SchoolId}/payment/failure?tenant=${req.params.databaseName}`,
    // You might also want to pass tenant info as metadata to the Stripe session
    metadata: {
      userId: id.toString(),
      courseId: courseId,
      databaseName: req.params.databaseName, // Pass database name to Stripe webhook if used
    },
  });

  res.status(200).json({ url: session.url });
});


export const checkoutSaas = asyncHandler(async (req, res, next) => {
  const Payment = getPaymentModel(req); // Get dynamic Payment model

  const { amount, title, courseId, SchoolId } = req.body;
  console.log("his is the value", req.user.id);
  const id = req.user.id.toString(); // <--- Change made here  const { id } = req.user; // User ID from isLoggedIn middleware (authenticated for current tenant)
  console.log("after string converstion", id);
  // 1. Check if a payment record exists for this user in this tenant's database
  let paymentRecord = await Payment.findOne({ userId: id });
  console.log("Payment record found:", paymentRecord);
  if (!paymentRecord) {
    // If no payment record, create a new one
    paymentRecord = await Payment.create({
      userId: id,
      purchasedCourses: [],
    });
    // No need for paymentRecord.save() after create, it's already saved
  } else {
    // If payment record exists, check if course is already purchased and not expired
    const courseIndex = paymentRecord.purchasedCourse.findIndex(
      (item) => item.courseId.toString() === courseId // Ensure string comparison for ObjectId
    );

    if (courseIndex !== -1) {
      const isPurchasedAndValid = paymentRecord.purchasedCourse[
        courseIndex
      ].purchaseDetails.some((detail) => detail.expirationDate > Date.now());

      if (isPurchasedAndValid) {
        return next(
          new AppError(
            "You have already purchased this course and your access is still valid.",
            502
          )
        );
      }
    }
  }

  // Create Stripe Checkout Session
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "PKR", // Make sure this currency is supported by your Stripe account
          product_data: {
            name: title,
          },
          unit_amount: amount * 100, // Amount in smallest currency unit (e.g., cents)
        },
        quantity: 1,
      },
    ],
    // These URLs should include the dynamic databaseName to maintain context
    success_url: `${process.env.FRONT_URL}/${SchoolId}/paymentsuccess/${courseId}?tenant=${req.params.databaseName}`,
    cancel_url: `${process.env.FRONT_URL}/${SchoolId}/payment/failure?tenant=${req.params.databaseName}`,
    // You might also want to pass tenant info as metadata to the Stripe session
    metadata: {
      userId: id.toString(),
      courseId: courseId,
      databaseName: req.params.databaseName, // Pass database name to Stripe webhook if used
    },
  });

  res.status(200).json({ url: session.url });
});


/**
 * @VERIFY
 * @ROUTE @POST
 * @ACCESS login user only {{url}}/:databaseName/api/v1/payment/verify?courseId=''
 */

export const verify = asyncHandler(async (req, res, next) => {
  const User = getUserModel(req); // Get dynamic User model
  const Course = getCourseModel(req); // Get dynamic Course model
  const MyCourse = getMyCourseModel(req); // Get dynamic MyCourse model
  const Payment = getPaymentModel(req); // Get dynamic Payment model

  const { id } = req.user; // User ID from isLoggedIn middleware
  const { courseId } = req.query; // Course ID from query params

  // 1. Fetch Course and User from the current tenant's database
  const course = await Course.findById(courseId).select("-lectures"); // Exclude lectures
  const user = await User.findById(id);

  if (!course || !user) {
    return next(new AppError("User or course does not exist.", 400));
  }

  if (user.role === "ADMIN") {
    return next(new AppError("Admin cannot purchase courses.", 502));
  }

  // 2. Fetch the Payment record for this user in this tenant's database
  let paymentRecord = await Payment.findOne({ userId: id });

  if (!paymentRecord) {
    // This case should ideally be handled during checkout, but defensively add it.
    // A payment record should already exist or be created by the checkout step.
    return next(
      new AppError(
        "No payment order found for this user. Please initiate checkout first.",
        400
      )
    );
  }

  // Calculate expiration date. Assuming 'course.expiry' is in months.
  const purchaseDate = Date.now();
  const expirationDate =
    purchaseDate + course.expiry * 30 * 24 * 60 * 60 * 1000; // Assuming 30 days per month

  const newPurchaseDetails = {
    purchaseDate: new Date(purchaseDate),
    expirationDate: new Date(expirationDate),
  };

  // 3. Find if the course is already in the purchasedCourses array
  const courseIndex = paymentRecord.purchasedCourse.findIndex(
    (item) => item.courseId.toString() === courseId // Ensure string comparison for ObjectId
  );

  if (courseIndex === -1) {
    // Course is not in the list, add it as a new entry
    paymentRecord.purchasedCourse.push({
      courseId,
      purchaseDetails: [newPurchaseDetails],
    });
  } else {
    // Course is already in the list, check for active purchase
    const isAlreadyPurchasedAndValid = paymentRecord.purchasedCourse[
      courseIndex
    ].purchaseDetails.some((detail) => detail.expirationDate > Date.now());

    if (isAlreadyPurchasedAndValid) {
      return next(
        new AppError(
          "You already have an active purchase for this course.",
          502
        )
      );
    } else {
      // Add new purchase details to the existing course entry
      paymentRecord.purchasedCourse[courseIndex].purchaseDetails.push(
        newPurchaseDetails
      );
    }
  }

  // 4. Send course purchasing email
  await coursePurchasingMail(user.email, {
    courseName: course.title,
    courseExpiry: course.expiry, // In months
    coursePrice: course.price,
    courseLink: `${process.env.FRONT_URL}/course/${courseId}?tenant=${req.params.databaseName}`, // Ensure tenant context for front-end link
  });

  // 5. Update MyCourse progress record for the user in this tenant's database
  let myCourseRecord = await MyCourse.findOne({ userId: id });

  if (!myCourseRecord) {
    // If no MyCourse record, create one
    myCourseRecord = await MyCourse.create({
      userId: id,
      myPurchasedCourses: [],
    });
  }

  // Check if course already exists in myPurchasedCourses before pushing
  const myCourseEntryIndex = myCourseRecord.myPurchasedCourses.findIndex(
    (item) => item.courseId.toString() === courseId
  );

  if (myCourseEntryIndex === -1) {
    myCourseRecord.myPurchasedCourses.push({
      courseId,
      lectureProgress: [], // Initialize empty progress
      quizScores: [], // Initialize empty quiz scores
    });
  } else {
    // If it exists, you might want to reset progress or handle it based on your logic
    // For now, if it exists, we assume a new purchase means existing progress is fine or needs reset
    // No explicit action here if it already exists, as we're just recording the purchase.
    // If you want to reset progress on re-purchase, add logic here.
  }

  // 6. Save updated records
  await paymentRecord.save();
  await myCourseRecord.save(); // Save the MyCourse record

  res.status(200).json({
    success: true,
    message: "Course successfully purchased and access granted.",
  });
});
