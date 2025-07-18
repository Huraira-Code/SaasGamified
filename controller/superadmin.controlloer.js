import { superAdminDashboardSchema } from "../models/admin.model.js"; // Corrected to named import and added .js extension
import bcrypt from "bcryptjs"; // Still imported, but its `compare` function is not used for direct password check
import jwt from "jsonwebtoken"; // For generating a JSON Web Token (optional, but recommended for auth)
// --- Super Admin Sign-in Controller ---
import { stripe } from "../app.js"; // stripe instance remains global from app.js

const getSuperAdminDashboardModel = (req) => {
  if (!req.dbConnection) {
    throw new AppError(
      "Database connection not established for this request.",
      500
    );
  }
  // 'User' is the name of your Mongoose model, userSchema is the imported schema definition
  return req.dbConnection.model(
    "SuperAdminDashboard",
    superAdminDashboardSchema
  );
};

const superAdminSignIn = async (req, res) => {
  console.log("mera 2");
  const { email, password } = req.body;
  const SuperAdminDashboard = getSuperAdminDashboardModel(req); // Get dynamic User model
  // 1. Basic validation
  if (!email || !password) {
    return res
      .status(400)
      .json({ message: "Please enter both email and password." });
  }

  try {
    // 2. Find the Super Admin dashboard document
    // Assuming there's only one SuperAdminDashboard document that holds all super admin, admin, and payment data.
    const dashboard = await SuperAdminDashboard.findOne();
    console.log("dashboard", dashboard);
    if (!dashboard) {
      // This case means no super admin data exists in the database.
      // In a real application, you might have an initial setup route to create the first super admin.
      return res.status(404).json({
        message: "Super Admin data not found. Please initialize the system.",
      });
    }

    const superAdmin = dashboard.superAdmin;

    // 3. Check if the provided email matches the super admin email
    if (superAdmin.email !== email) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    // 4. --- CRITICAL SECURITY WARNING: DIRECT PASSWORD MATCH ---
    // You have requested to directly match the password.
    // This is EXTREMELY INSECURE. In a production environment, you MUST hash passwords
    // (e.g., using bcrypt) and compare the hash, not the plain text.
    // If superAdmin.passwordHash contains a hashed password, this comparison will FAIL.
    // This assumes superAdmin.passwordHash is currently storing a plain-text password.
    const isMatch = password === superAdmin.passwordHash; // Direct string comparison

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    // 5. Authentication successful
    // Optional: Generate a JWT token for session management
    // Make sure to set a strong secret key in your environment variables
    const token = jwt.sign(
      {
        id: superAdmin._id,
        email: superAdmin.email,
        role: "superAdmin",
      },
      process.env.JWT_SECRET_KEY, // Use an environment variable for the secret
      { expiresIn: "10h" } // Token expires in 1 hour
    );

    // 6. Update last login timestamp
    await dashboard.save(); // Save the updated dashboard document

    // 7. Send success response
    res.status(200).json({
      message: "Super Admin signed in successfully!",
      token, // Send the token to the client
      superAdmin: {
        email: superAdmin.email,
      },
    });
  } catch (error) {
    console.error("Super Admin Sign-in Error:", error);
    res.status(500).json({ message: "Server error during sign-in." });
  }
};

// --- Add Admin Controller ---
// --- Add Admin Controller ---
const addAdmin = async (req, res) => {
  const { email, password, lmsname } = req.body;
  const SuperAdminDashboard = getSuperAdminDashboardModel(req); // Get dynamic User model

  // 1. Basic validation
  if (!email || !password || !lmsname) {
    return res.status(400).json({
      message:
        "Please provide email, password, and LMS name for the new admin.",
    });
  }

  try {
    // In a real application, this route should be protected by authentication
    // and authorization (e.g., only a logged-in super admin can add new admins).

    const dashboard = await SuperAdminDashboard.findOne();

    if (!dashboard) {
      return res.status(404).json({
        message: "Super Admin dashboard data not found. Cannot add admin.",
      });
    }

    // Check if an admin with this email already exists
    const adminExists = dashboard.admins.some((admin) => admin.lmsname === lmsname);
    if (adminExists) {
      return res
        .status(409)
        .json({ message: "Admin with this LMS already exists." });
    }

    // --- CRITICAL SECURITY WARNING: HASH PASSWORD FOR NEW ADMIN ---
    // Even if you're not hashing the super admin password, it is HIGHLY recommended
    // to hash passwords for new admins. For demonstration, we'll store it as is
    // to match your current explicit instruction, but this is a security risk.
    // const hashedPassword = await bcrypt.hash(password, 10); // Use this in production!

    const newAdmin = {
      // Mongoose will add an _id to this subdocument automatically
      email: email,
      passwordHash: password, // Storing plain password as per your current instruction (INSECURE!)
      // In production, use: passwordHash: hashedPassword,
      lmsname: lmsname,
      payments: [new Date()], // Initialize with today's date for the first payment
    };

    dashboard.admins.push(newAdmin);
    await dashboard.save();

    res
      .status(201)
      .json({ message: "Admin added successfully!", admin: newAdmin });
  } catch (error) {
    console.error("Error adding admin:", error);
    res.status(500).json({ message: "Server error while adding admin." });
  }
};

// --- Get All Admins Controller ---
const getAllAdmins = async (req, res) => {
  const SuperAdminDashboard = getSuperAdminDashboardModel(req); // Get dynamic model

  try {
    const dashboard = await SuperAdminDashboard.findOne();

    if (!dashboard) {
      // If no dashboard exists, there are no admins
      return res
        .status(200)
        .json({ message: "No admin data found.", admins: [] });
    }

    // Return the array of admins
    res.status(200).json({
      message: "Admins retrieved successfully!",
      admins: dashboard.admins,
    });
  } catch (error) {
    console.error("Error retrieving admins:", error);
    res.status(500).json({ message: "Server error while retrieving admins." });
  }
};

// --- Toggle Admin Status Controller ---
const toggleAdminStatus = async (req, res) => {
  const { adminId, status } = req.body; // Expect adminId and the new status (true/false)
  const SuperAdminDashboard = getSuperAdminDashboardModel(req); // Get dynamic model

  // 1. Basic validation
  if (!adminId || typeof status !== "boolean") {
    return res.status(400).json({
      message:
        "Please provide a valid admin ID and a boolean status (true/false).",
    });
  }

  try {
    const dashboard = await SuperAdminDashboard.findOne();

    if (!dashboard) {
      return res.status(404).json({
        message:
          "Super Admin dashboard data not found. Cannot update admin status.",
      });
    }

    // Find the admin by ID
    const adminToUpdate = dashboard.admins.id(adminId); // Mongoose subdocument .id() method

    if (!adminToUpdate) {
      return res.status(404).json({ message: "Admin not found." });
    }

    // Update the status
    adminToUpdate.status = status;

    // Save the updated dashboard document
    await dashboard.save();

    res.status(200).json({
      message: `Admin status updated successfully for ${
        adminToUpdate.lmsname || adminToUpdate.email
      }.`,
      admin: adminToUpdate,
    });
  } catch (error) {
    console.error("Error toggling admin status:", error);
    res
      .status(500)
      .json({ message: "Server error while updating admin status." });
  }
};

const createCheckoutSession = async (req, res) => {
  // We now expect 'amount' and 'currency'
  const { email, password, lmsname } = req.body;
  const successObject = encodeURIComponent(
    JSON.stringify({ email, password, lmsname })
  );

  console.log(process.env.FRONT_URL);
  // Basic validation for required fields
  if (!email || !password || !lmsname) {
    return res.status(400).json({
      message:
        "Missing required fields for checkout session (email, password, lmsname, amount, currency, quantity).",
    });
  }

  // --- SECURITY NOTE: In a real application, you must validate 'amount' on the backend.
  // For example, if you have a fixed one-time price of $200, you would check:
  // if (amount !== 20000 || currency !== 'pkr') { return res.status(400).json({ message: "Invalid amount or currency." }); }
  // Or fetch it from a secure configuration.

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          // Using price_data for inline pricing
          price_data: {
            currency: "pkr", // 'pkr'
            unit_amount: 2000000, // Amount in cents (e.g., 20000 for 200.00 PKR)
            product_data: {
              name: "LMS Monthly Purchase", // Display name on Stripe Checkout
              description:
                "Ednova Gamified Learning Management System - Monthly Access",
              // You can also add images here if you have them:
              // images: ['https://example.com/lms-logo.png'],
            },
            // Removed 'recurring' object as this is now a one-time payment
          },
          quantity: 1, // Should be 1 for a single purchase
        },
      ],
      mode: "payment", // Set to 'payment' for one-time payments
      // These URLs should be configured to your frontend's success and cancel pages
      // For production, use actual domain names.
      success_url: `${process.env.FRONT_URL}/adminPaymentSuccess/${successObject}`, // Replace with your actual success URL
      cancel_url: `${process.env.FRONT_URL}`,
      customer_email: email, // Pre-fill customer email
      metadata: {
        // Pass relevant data to the webhook for later use
        adminEmail: email,
        adminPassword: password, // WARNING: Storing plain password in metadata is INSECURE.
        // In a real app, you'd generate a temporary token or use a secure method
        // to link the payment to the admin creation process, or hash the password here.
        lmsname: lmsname,
      },
    });

    res.status(200).json({ sessionUrl: session.url });
  } catch (error) {
    console.error("Error creating Stripe Checkout Session:", error);
    // Log specific Stripe error details if available
    if (error.raw) {
      console.error("Stripe raw error details:", error.raw);
    }
    if (error.type) {
      console.error("Stripe error type:", error.type);
    }
    if (error.statusCode) {
      console.error("Stripe status code:", error.statusCode);
    }
    res.status(500).json({ message: "Failed to create checkout session." });
  }
};

const checkTenantStatus = async (req, res) => {
  console.log("Checking tenant status..." , req.params);
  const { tenantId: rawTenantId } = req.params; // Get the tenantId from the URL
  const lmsName = rawTenantId.replace(/_/g, ' '); // Convert underscores to spaces

  const SuperAdminDashboard = getSuperAdminDashboardModel(req); // Get dynamic model

  try {
    const dashboard = await SuperAdminDashboard.findOne();

    if (!dashboard) {
      return res.status(404).json({ valid: false, message: "No admin configuration found." });
    }

    const admin = dashboard.admins.find(admin => admin.lmsname.toLowerCase() === lmsName.toLowerCase());

    if (!admin) {
      return res.status(404).json({ valid: false, message: "Tenant (LMS) not found." });
    }

    if (!admin.status) {
      // Tenant found but status is OFF (payment not paid)
      return res.status(200).json({ valid: true, status: false, message: "Payment for this LMS is not paid. Please contact admin." });
    }

    // Tenant found and status is ON
    return res.status(200).json({ valid: true, status: true, message: "Tenant is active." });

  } catch (error) {
    console.error("Error checking tenant status:", error);
    res.status(500).json({ message: "Server error while checking tenant status." });
  }
};


export {
  superAdminSignIn,
  addAdmin,
  getAllAdmins,
  toggleAdminStatus,
  createCheckoutSession,
  checkTenantStatus
};
