import express from 'express';
import { getPolicies, loginUser, registerUser, socialLogin, appleSocialLogin } from '../controller/authController';


const router = express.Router();


// Test Routes For Gudiya
router.post('/register', registerUser);
router.post('/login',loginUser);


// Real Routes
router.post("/socialLogin", socialLogin)
router.post("/appleSocialLogin", appleSocialLogin)

router.get("/policies", getPolicies);

export default router;