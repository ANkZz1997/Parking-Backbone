import express from 'express';
import { addUpdateUserInfo, deleteVehicle, searchVehicle } from '../controller/userController';


const router = express.Router();


// Real Routes
router.post("/userInfo", addUpdateUserInfo)
router.delete("/delete-vehicle", deleteVehicle)
router.post("/search-vehicle", searchVehicle)


export default router;
