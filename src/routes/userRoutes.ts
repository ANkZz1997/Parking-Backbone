import express from "express";
import {
  addUpdateUserInfo,
  deleteVehicle,
  getUserSettings,
  getVehicleById,
  searchVehicle,
  updateUserSettings,
  userActivity,
  userData,
  userHome,
} from "../controller/userController";

const router = express.Router();

// Manager Vehicles
router.get("/userInfo", userData);

router.get("/vehicleById", getVehicleById);

router.post("/userInfo", addUpdateUserInfo);

router.delete("/delete-vehicle", deleteVehicle);

router.post("/search-vehicle", searchVehicle);

// User Profile

router.get("/home", userHome);

router.get("/activity", userActivity);

router.get("/settings", getUserSettings);

router.post("/settings", updateUserSettings);

export default router;
