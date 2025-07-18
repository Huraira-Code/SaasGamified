// server/config/db.config.js
import mongoose from "mongoose";

// This function is for your main, default database connection (e.g., 'ednova')
async function connectToDB() {
  try {
    const { connection } = await mongoose.connect(
      "mongodb+srv://huraira:Usama10091@cluster0.hnawam1.mongodb.net/"
    ); // MONGO_URL should have a specific DB name

    if (connection) {
      console.log(
        "Connected to default DB: " + connection.host + " / " + connection.name
      );
    }
  } catch (error) {
    console.log("Default DB connection error: ", error);
    process.exit(1); // Exit if the primary connection fails
  }
}

export default connectToDB;
