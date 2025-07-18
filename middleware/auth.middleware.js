import { userSchema } from "../models/user.model.js";
import jwt from "jsonwebtoken";
import asyncHandler from "./asyncHandler.middleware.js";
import AppError from "../utils/error.utils.js";
import { paymentSchema } from "../models/payment.model.js";

const getUserModel = (req) => {
  if (!req.dbConnection) {
    throw new AppError("Database connection not established", 500);
  }
  return req.dbConnection.model("User", userSchema);
};

const getPaymentModel = (req) => {
  console.log("getPaymentModel called");
  if (!req.dbConnection) {
    throw new AppError("Database connection not established", 500);
  }
  return req.dbConnection.model("Payment", paymentSchema);
};

export const isLoggedIn = asyncHandler(async (req, res, next) => {
  const { token } = req.cookies;
  console.log(token)
  if (!token) {
    return next(
      new AppError("unauthorised user or token is expire. please login", 401)
    );
  }

  const decodeToken = await jwt.verify(token, process.env.JWT_SECRET_KEY);
  console.log("decode token", decodeToken);
  if (!decodeToken) {
    return next(
      new AppError("unauthorised user or token is expire. please login", 401)
    );
  }

  req.user = decodeToken;
  next();
});

export const authorizedRoles = (...roles) =>
  asyncHandler(async (req, res, next) => {
    const currentUserRole = req.user.role;
    console.log(currentUserRole);
    if (!roles.includes(currentUserRole)) {
      return next(
        new AppError("you do not have permission to aceess this route", 403)
      );
    }

    next();
  });

export const isPurchasedCourse = asyncHandler(async (req, res, next) => {
  console.log("isPurchasedCourse middleware called");
  const { id } = req.user;
  const { courseId } = req.params;

  const User = getUserModel(req);
  const Payment = getPaymentModel(req);

  const user = await User.findById(id);

  if (!user) {
    console.log("user not found", req.user);
    return next(new AppError("user not found", 401));
  }

  console.log("user found", req.user);
  if (user.role === "ADMIN") {
    console.log("user found 1", req.user);
    return next();
  }

  const payment = await Payment.findOne({ userId: id });

  if (!payment) {
    return next(new AppError(`you can't access this course`, 403));
  }

  const courseIndex = payment.purchasedCourse.findIndex(
    (item) => item.courseId === courseId
  );

  if (courseIndex === -1) {
    return next(new AppError(`you can't access this course`, 403));
  }

  const isPurchased = payment.purchasedCourse[courseIndex].purchaseDetails.find(
    (detail) => detail.expirationDate > Date.now()
  );

  if (isPurchased) {
    next();
  } else {
    return next(new AppError(`you can't access this course`, 403));
  }
});
