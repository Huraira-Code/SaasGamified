// middleware/dynamicDb.middleware.js
import mongoose from "mongoose";

// A cache to store active database connections
const dbConnections = {};

// Ensure MONGO_BASE_URL is available
const MONGO_BASE_URL =
  "mongodb+srv://huraira:Usama10091@cluster0.hnawam1.mongodb.net/";

if (!MONGO_BASE_URL) {
  console.error(
    "ERROR: MONGO_BASE_URL is not defined in environment variables. Please set it in your .env file."
  );
  // In a serverless environment, you might not want to process.exit()
  // directly here, but rather throw an error or handle it gracefully
  // to allow the function to return a 500. For development, exit is okay.
  throw new Error("MONGO_BASE_URL environment variable is missing.");
}

async function dynamicDbMiddleware(req, res, next) {
  // We expect the first part of the URL path after the host to be the database name.
  // Example: ednoca.com/khanacademy/api/v1/user/profile
  // We need to parse the URL correctly depending on your desired structure.
  // If your API routes already start with /api/v1, then the database name
  // might be part of an earlier segment, or you need a different route pattern.

  // Let's assume you want something like:
  // yourdomain.com/:databaseName/api/v1/user/...
  // If so, the middleware needs to be applied to a route that captures :databaseName
  // at the start. For simplicity in this middleware, we'll assume the URL parameter
  // 'databaseName' is already exposed by the Express router.

  // The current app.js has routes like app.use("/api/v1/user", userRoutes);
  // This means the dynamicDbMiddleware needs to be placed *before* these routes
  // AND capture the databaseName.

  // Option 1: Database name is *before* /api/v1
  // e.g., /khanacademy/api/v1/user/...
  // This requires a change in your app.use() for routes.
  // We'll proceed with this more flexible option.

  // Get the database name from the URL params.
  // You'll need to define a route pattern like `/:databaseName/api/v1/*`
  // when using this middleware.
  const databaseName = req.params.databaseName;
  console.log("database name", databaseName);
  if (!databaseName) {
    console.error(
      "DynamicDbMiddleware: 'databaseName' not found in URL parameters. Check route setup."
    );
    // This indicates a misconfiguration in how the middleware is applied or the route structure.
    return res
      .status(500)
      .send("Server configuration error: Database name parameter missing.");
  }

  // --- IMPORTANT SECURITY: VALIDATE THE DATABASE NAME ---
  // DO NOT allow arbitrary database names directly from user input.
  // This is the most critical security step.
  // const allowedDatabaseNames = [
  //   "ednova",
  //   "khanacademy",
  //   "anothercourse",
  //   "test_db",
  //   "course_management_db",
  // ]; // Add all your valid database names
  // if (!allowedDatabaseNames.includes(databaseName)) {
  //   console.warn(
  //     `DynamicDbMiddleware: Attempted access to forbidden database: ${databaseName}`
  //   );
  //   return res
  //     .status(403)
  //     .send("Access to this database is forbidden or database does not exist.");
  // }

  // Check if a connection to this database already exists in our cache
  // Also check readyState to ensure the connection is still active (0 = disconnected)
  if (
    !dbConnections[databaseName] ||
    dbConnections[databaseName].readyState === 0
  ) {
    try {
      console.log(
        `DynamicDbMiddleware: Attempting to connect to database: ${databaseName}`
      );
      const connection = await mongoose.createConnection(
        `${MONGO_BASE_URL}${databaseName}`,
        {
          useNewUrlParser: true,
          useUnifiedTopology: true,
          // Add any other desired connection options here (e.g., serverSelectionTimeoutMS)
        }
      );
      console.log(
        `DynamicDbMiddleware: Successfully connected to database: ${databaseName}`
      );
      dbConnections[databaseName] = connection;

      // Optional: Handle connection events to clean up cache on disconnect
      connection.on("disconnected", () => {
        console.log(
          `DynamicDbMiddleware: Database connection disconnected for: ${databaseName}`
        );
        delete dbConnections[databaseName];
      });
      connection.on("error", (err) => {
        console.error(
          `DynamicDbMiddleware: Connection error for ${databaseName}:`,
          err
        );
        // Optionally remove from cache on serious errors
        delete dbConnections[databaseName];
      });
    } catch (error) {
      console.error(`: Error connecting to database ${databaseName}:`, error);
      // In production, avoid leaking sensitive error details
      return res
        .status(500)
        .send(`Server error: Could not connect to database ${databaseName}.`);
    }
  } else {
    console.log(
      `DynamicDbMiddleware: Using existing connection for database: ${databaseName}`
    );
  }

  // Attach the connection object to the request for route handlers
  req.dbConnection = dbConnections[databaseName];
  next(); // Proceed to the next middleware or route
}

export default dynamicDbMiddleware;
