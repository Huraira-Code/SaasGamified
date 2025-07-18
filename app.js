import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import Stripe from "stripe";
import { config } from "dotenv";
import mongoose from "mongoose"; // Import mongoose for graceful shutdown and types

// Your existing connectToDB.js connects to a *default* database.
// If you want to use the global mongoose.connection for some "master" data,
// keep this. If all data will be tenant-specific, you might remove it.
// For now, let's keep it to 'ednova' as your default.
import connectToDB from "./config/db.config.js";

// Import your new dynamic database middleware
import dynamicDbMiddleware from "./middleware/dynamicDb.middleware.js";

config(); // Load environment variables from .env

// Call the default connection first (e.g., to 'ednova')
// This sets up mongoose.connection, which some parts of your app might implicitly use.
connectToDB();

// Ensure Cloudinary config is loaded
import "./config/cloudinary.config.js";

const app = express();

// Initialize Stripe
export const stripe = Stripe(process.env.STRIPE_SECRET);

// --- Core Express Middleware ---
const corsOptions = {
  origin: ["https://ednova.netlify.app", process.env.FRONT_URL],
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ['set-cookie']

};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors(corsOptions));

// --- IMPORTANT: Dynamic Database Middleware Application ---
// We need to apply the dynamicDbMiddleware *before* your actual API routes.
// The pattern `/:databaseName/api/v1` captures the database name.
// All routes that need dynamic database selection should be nested under this pattern.
app.use("/:databaseName/api/v1", dynamicDbMiddleware);

// importing all routes
import errorMiddleware from "./middleware/error.middleware.js";
import courseRoutes from "./routes/course.route.js";
import myCourseRoutes from "./routes/my.course.route.js";
import paymentRoutes from "./routes/payment.route.js";
import userRoutes from "./routes/user.routes.js";
// import chatRoutes from "./routes/chat.route.js";
import AdminRoutes from "./routes/admin.dashboard.route.js";
import Announcement from "./routes/announcement.route.js";
import Badges from "./routes/badges.route.js";
import superAdmin from "./routes/superadmin.route.js";
import adminAnalyticsRoute from "./routes/admin.analytics.route.js";

// --- Adjusting Routes for Dynamic Database Structure ---
// Now, your routes will be mounted relative to '/:databaseName/api/v1'
// Inside your route files (e.g., user.routes.js), you'll access req.dbConnection
// instead of the global mongoose.connection.

// Set routes to base url (now dynamic)
app.use("/:databaseName/api/v1/user", userRoutes);
app.use("/:databaseName/api/v1/course", courseRoutes);
app.use("/:databaseName/api/v1/payment", paymentRoutes);
app.use("/:databaseName/api/v1/my-course", myCourseRoutes);
// app.use("/:databaseName/api/v1/chat", chatRoutes);
app.use("/:databaseName/api/v1/admin", AdminRoutes);
app.use("/:databaseName/api/v1/announcement", Announcement);
app.use("/:databaseName/api/v1/badges", Badges);
app.use("/:databaseName/api/v1/superadmin", superAdmin);
app.use("/:databaseName/api/v1/user", userRoutes);
app.use("/:databaseName/api/v1/adminAnalytics", adminAnalyticsRoute);

// --- Default/Root Route ---
// This route will handle requests like "yourdomain.com/" or "yourdomain.com/status"
// It does NOT use the dynamic database.
app.get("/", (req, res) => {
  res.send("Welcome to the main API entry point!");
});

// page not found (for any other routes not matched)
app.all("*", (req, res) => {
  res.status(404).send("Oops! 404 error. Page not found.");
});

// handle error and send response
app.use(errorMiddleware);

// --- Server Startup Logic (for local development) ---
const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server is running locally on port: ${PORT}`);
    console.log(`Test with URLs like:`);
    console.log(`  http://localhost:${PORT}/ednova/api/v1/user/profile`);
  });
}

// --- Graceful Shutdown (for local development) ---
// This will close all connections when the Node.js process receives a termination signal.
// On Vercel, this is less critical as functions are ephemeral, but good for local.
process.on("SIGINT", async () => {
  console.log("Closing all MongoDB connections...");
  // Close the global connection from connectToDB()
  if (mongoose.connection.readyState === 1) {
    // 1 means connected
    await mongoose.connection.close();
    console.log("Default MongoDB connection closed.");
  }
  // Also consider adding logic here to close connections stored in dbConnections
  // (though in serverless, these are typically cleaned up with the function instance)
  console.log("Exiting process.");
  process.exit(0);
});

// Export the Express app instance. This is crucial for Vercel.
export default app;
