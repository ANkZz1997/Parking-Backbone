import express from "express";
import {
  addUpdateUserInfo,
  deleteVehicle,
  getUserNotifications,
  getUserSettings,
  getVehicleById,
  initiateAlert,
  initiateCall,
  logout,
  readNotifications,
  searchVehicle,
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

router.get("/initiate-call", initiateCall);

router.post("/initiate-alert", initiateAlert);



// User Profile

router.get("/home", userHome);

router.get("/activity", userActivity);

router.get("/settings", getUserSettings);

router.post("/settings", updateUserSettings);

router.post("/logout", logout);


// Notification

router.get("/notifications", getUserNotifications)

router.post("/notifications", readNotifications)


export default router;
