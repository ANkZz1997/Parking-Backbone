import express from 'express';
import { loginUser, registerUser, socialLogin } from '../controller/authController';


const router = express.Router();


// Test Routes For Gudiya
router.post('/register', registerUser);
router.post('/login',loginUser);


// Real Routes
router.post("/socialLogin", socialLogin)

export default router;