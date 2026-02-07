import express from "express";
import {
  addUpdateUserInfo,
  deleteAccount,
  deleteVehicle,
  getUserNotifications,
  getUserSettings,
  getVehicleById,
  initiateAlert,
  initiateCall,
  logout,
  readNotifications,
  searchVehicle,
  updateCallStatus,
  updateUserSettings,
  userActivity,
  userData,
  userHome,
} from "../controller/userController";
import { initializeApp } from "firebase-admin";

const router = express.Router();

// Manager Vehicles
router.get("/userInfo", userData);

router.get("/vehicleById", getVehicleById);

router.post("/userInfo", addUpdateUserInfo);

router.delete("/delete-vehicle", deleteVehicle);

router.post("/search-vehicle", searchVehicle);

router.route("/initiate-call").get(initiateCall).patch(updateCallStatus);

router.post("/initiate-alert", initiateAlert);

// User Profile

router.get("/home", userHome);

router.get("/activity", userActivity);

router.route("/settings").get(getUserSettings).post(updateUserSettings);

router.post("/logout", logout);

router.delete("/delete-account", deleteAccount)

// Notification

router
  .route("/notifications")
  .get(getUserNotifications)
  .post(readNotifications);

export default router;
