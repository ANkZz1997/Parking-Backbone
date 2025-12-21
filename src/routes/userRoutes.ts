import express from "express";
import {
  addUpdateUserInfo,
  deleteVehicle,
  getUserSettings,
  searchVehicle,
  userActivity,
  userData,
  userProfile,
} from "../controller/userController";

const router = express.Router();

// Manager Vehicles
router.get("/userInfo", userData);

router.post("/userInfo", addUpdateUserInfo);

router.delete("/delete-vehicle", deleteVehicle);

router.post("/search-vehicle", searchVehicle);

// User Profile

router.get("/profile", userProfile);

router.get("/activity", userActivity);

router.get("/settings", getUserSettings);

export default router;
