import express, { Application, Request, Response } from "express";
import mongoose from "mongoose";
import cors from "cors";
import path from "path";
import dotenv from "dotenv";
import authRoutes from "./routes/authRoutes";
import userRoutes from "./routes/userRoutes";

import auth from "./middleware/auth-middleware";
import checkAuth from "./middleware/auth-middleware";
import { initializeFirebase } from "./utils/fcm";

dotenv.config();

const app: Application = express();
initializeFirebase();
app.use(express.json());

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PATCH", "DELETE", "PUT"],
    credentials: true,
  })
);

app.use("/api/auth", authRoutes);
app.use("/api/user", checkAuth, userRoutes);

const PORT = process.env.PORT || 5000;

const MONGO_URI = process.env.MONGO_URI as string;

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected");
    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  })
  .catch((err: Error) => {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  });
