import nodemailer from "nodemailer";
import AppError from "./error.utils.js"; // Assuming AppError is a custom error class

/**
 * Sends an email using nodemailer.
 * This function is now Promise-based to allow awaiting its completion.
 * @param {string} email - The recipient's email address.
 * @param {string} subject - The subject of the email.
 * @param {string} message - The HTML content of the email.
 * @returns {Promise<Object>} A Promise that resolves with the mail info on success,
 * or rejects with an AppError on failure.
 */
async function mail(email, subject, message) {
  console.log("Sending email message...");

  // Create a nodemailer transporter instance
  const transporter = nodemailer.createTransport({
    host: 'smtp.resend.com',
    secure: true, // Use SSL/TLS
    port: 465,    // Standard secure SMTP port
    auth: {
      user: 'resend', // Your Resend API user (always 'resend' for Resend)
      pass: 're_4iswkmGe_Q7dVwrB6kF11E2UaLrrce2Cy', // Your Resend API key
    },
  });

  // Define email options
  const options = {
    from: "welcome@softhouze.com", // Sender's email address
    to: email,                     // Recipient's email address
    subject,                       // Email subject
    html: message,                 // HTML content of the email
  };

  // Return a new Promise to handle the asynchronous sendMail operation
  return new Promise((resolve, reject) => {
    transporter.sendMail(options, (err, info) => {
      if (err) {
        console.error("Error sending mail:", err);
        // Reject the Promise with an AppError, using err.message for more detail
        return reject(new AppError("Mail error: " + err.message, 400));
      }
      console.log("Email sent successfully:", info.response);
      resolve(info); // Resolve the Promise with the mail info
    });
  });
}

/**
 * Sends a registration confirmation email.
 * @param {string} email - The recipient's email address.
 */
export const registerMail = async (email) => {
  const subject = "🎉 Registration Complete! Welcome to Corsify";
  const message = "<h1>Welcome to Coursify! Your registration is complete.</h1>";
  try {
    await mail(email, subject, message);
    console.log("Registration email dispatched successfully.");
  } catch (error) {
    console.error("Failed to send registration email:", error);
    throw error; // Re-throw the error for upstream handling
  }
};

/**
 * Sends a password reset email with a provided link.
 * @param {string} email - The recipient's email address.
 * @param {string} link - The password reset link.
 */
export const forgotPasswordMail = async (email, link) => {
  const subject = "Password reset requested for your account";
  const message = `<p>You requested a password reset. Please click the link below to reset your password:</p><p><a href="${link}">${link}</a></p><p>If you did not request this, please ignore this email.</p>`;
  try {
    await mail(email, subject, message);
    console.log("Forgot password email dispatched successfully.");
  } catch (error) {
    console.error("Failed to send forgot password email:", error);
    throw error;
  }
};

/**
 * Sends a user verification email with a provided link.
 * @param {string} email - The recipient's email address.
 * @param {string} link - The verification link.
 */
export const verifyUserMail = async (email, link) => {
  const subject = "Verify Your Profile for Corsify";
  const message = `<p>Thank you for registering! Please click the link below to verify your email address:</p><p><a href="${link}">${link}</a></p><p>This link will expire soon.</p>`;
  try {
    await mail(email, subject, message);
    console.log("Verify user email dispatched successfully.");
  } catch (error) {
    console.error("Failed to send verify user email:", error);
    throw error;
  }
};

/**
 * Sends a course purchasing confirmation email with course details.
 * @param {string} email - The recipient's email address.
 * @param {Object} details - An object containing course details (courseName, courseExpiry, orderId, paymentId, coursePrice, courseLink).
 */
export const coursePurchasingMail = async (email, details) => {
  const subject = `Thank you for purchasing ${details.courseName} course!`;
  const message = `<!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Course Purchase Confirmation</title>
        <style>
          body {
            font-family: Verdana, Geneva, Tahoma, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f4f4f4;
            color: #333;
          }
          .container {
            background-color: #ffffff;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            max-width: 600px;
            margin: 0 auto;
          }
          h1 {
            color: #333;
            font-size: 24px;
            margin-bottom: 20px;
            text-align: center;
          }
          p {
            margin-bottom: 10px;
            padding-left: 5px;
            font-size: 17px;
            line-height: 1.5;
          }
          p strong {
            color: #000;
          }
          p span {
            color: orangered;
            font-weight: bold;
          }
          .button-container {
            text-align: center;
            margin-top: 30px;
          }
          a {
            display: inline-block;
            text-decoration: none;
            cursor: pointer;
            padding: 12px 25px;
            background: #28a745; /* A pleasant green */
            color: #ffffff;
            border-radius: 5px;
            font-size: 18px;
            font-weight: bold;
            transition: background-color 0.3s ease;
          }
          a:hover {
            background-color: #218838; /* Darker green on hover */
          }
          .footer {
            margin-top: 20px;
            font-size: 14px;
            color: #777;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Course Purchase Confirmation</h1>
          <p>Dear Valued Customer,</p>
          <p>Thank you for your recent purchase on Corsify! We are excited for you to start learning.</p>
          <p>Here are your course details:</p>
          <p><strong>Course:</strong> <span>${details.courseName}</span></p>
          <p><strong>Course Access:</strong> <span>${details.courseExpiry} months</span></p>
          <p><strong>Order ID:</strong> <span>${details.orderId}</span></p>
          <p><strong>Payment ID:</strong> <span>${details.paymentId}</span></p>
          <p><strong>Total Price:</strong> <span>${details.coursePrice}₹</span></p>

          <div class="button-container">
            <a href="${details.courseLink}">Start Learning Now</a>
          </div>

          <p class="footer">If you have any questions, please don't hesitate to contact our support team.</p>
          <p class="footer">Happy Learning!</p>
        </div>
      </body>
    </html>`;

  try {
    await mail(email, subject, message);
    console.log("Course purchasing email dispatched successfully.");
  } catch (error) {
    console.error("Failed to send course purchasing email:", error);
    throw error;
  }
};
