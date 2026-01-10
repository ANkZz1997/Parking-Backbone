import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { userModel } from "../models/user-schema";
import { BADREQUEST, INTERNAL_SERVER_ERROR, OK } from "../utils/response";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";

dotenv.config();

//************************ MAIN CONTROLLER ******************************

import crypto from "crypto";
import { userInfoModel } from "../models/user-info-schema";
import { userActivityModel } from "../models/user-activity-schema";
import { userSettingsModel } from "../models/user-setting-schema";
import { platform } from "os";
import { PlatformSettingModel } from "../models/platform-settings-schema";

export const socialLogin = async (req: Request, res: Response) => {
  try {
    let {
      firstName,
      lastName,
      fullName,
      email,
      phoneNumber = null,
      fcmToken = "",
      deviceType,
    } = req.body;

    if (!["ANDROID", "IOS", "WEB"].includes(deviceType)) {
      throw new Error("Invalid device type");
    }

    if (deviceType === "ANDROID") {
      if (!firstName || !lastName || !email || !fcmToken) {
        throw new Error(
          "For Android: Firstname, Lastname, Email, and FCM-Token are required"
        );
      }
      fullName = `${firstName} ${lastName}`;
    } else {
      if (!email || !fcmToken) {
        throw new Error("For iOS/Web: Email and FCM-Token are required");
      }
      firstName = "Apple";
      lastName = "User";
      fullName = "Apple User";
    }

    let user = await userModel.findOne({
      email,
      isBlocked: false,
      isDeleted: false,
    });

    // === GENERATE UNIQUE REFERRAL CODE ===
    const generateUniqueReferral = async () => {
      let code;
      let exists = true;

      while (exists) {
        code = crypto.randomBytes(4).toString("hex").toUpperCase(); // e.g., "A3F92CDE"
        const found = await userModel.findOne({ referralCode: code });
        if (!found) exists = false;
      }

      return code;
    };

    // === CREATE USER IF NOT EXIST ===
    if (!user) {
      const referralCode = await generateUniqueReferral();

      user = await userModel.create({
        firstName,
        lastName,
        fullName,
        email,
        deviceType,
        fcmToken: [fcmToken],
        phoneNumber,
        referralCode, // NEW FIELD
        vehicle: [],
        emergencyContact: null,
      });

      await userSettingsModel.findOneAndUpdate(
        { userId: user._id },
        { $setOnInsert: { userId: user._id } },
        { new: true, upsert: true }
      );

      await userInfoModel.create({
        userId: user._id,
        emergencyContact: null,
        modelUseCount: 0,
        vehicle: [],
      });
    }

    // === UPDATE FCM TOKEN ===
    if (!user.fcmToken.includes(fcmToken)) {
      user.fcmToken.push(fcmToken);
      await user.save();
    }

    // === JWT ===
    const token = jwt.sign(
      { userId: user._id.toString(), email },
      process.env.JWT_SECRET || "123",
      { expiresIn: "365d" }
    );

    userActivityModel.create({
      userId: user._id,
      type: "LOGIN",
      title: "You have successfully logged in",
    });

    const responseUser = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      deviceType: user.deviceType,
      fcmToken: user.fcmToken,
      referralCode: user.referralCode, // RETURN REFERRAL CODE
      alertBalance: user.alertBalance,
      callBalance: user.callBalance,
      token,
    };

    return OK(res, responseUser);
  } catch (e: any) {
    if (e?.message) return BADREQUEST(res, e.message);
    return INTERNAL_SERVER_ERROR(res);
  }
};

// ********************** TEST Controllers ******************************

export const registerUser = async (req: Request, res: Response) => {
  try {
    const {
      firstName,
      lastName,
      fullName,
      email,
      phoneNumber = null,
      fcmToken,
      deviceType,
      password,
    } = req.body;

    if (!firstName || !lastName || !email || !password) {
      throw new Error("First Name, Last Name, Password & Email are required");
    }

    const checkExist = await userModel.findOne({ email });

    if (checkExist) {
      throw new Error("Email already exist");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const data = await userModel.create({
      firstName,
      lastName,
      fullName,
      email,
      phoneNumber,
      fcmToken,
      deviceType,
      password: hashedPassword,
    });

    return OK(res, { ...data, password: null });
  } catch (e: any) {
    if (e?.message) {
      return BADREQUEST(res, e.message);
    }

    return INTERNAL_SERVER_ERROR(res);
  }
};

export const loginUser = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      throw new Error("Email and Password are required");
    }
    const user = await userModel.findOne({ email });
    if (!user) {
      throw new Error("Invalid email or password");
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new Error("Invalid email or password");
    }
    const userData = user.toObject();
    // delete userData?.password;

    return OK(res, {
      message: "Login Successful",
      user: userData,
    });
  } catch (e: any) {
    if (e?.message) {
      return BADREQUEST(res, e.message);
    }
    return INTERNAL_SERVER_ERROR(res);
  }
};
