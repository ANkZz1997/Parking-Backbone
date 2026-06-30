import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { userModel } from "../models/user-schema";
import { deletedEmailModel } from "../models/deleted-email-schema";
import { BADREQUEST, INTERNAL_SERVER_ERROR, OK } from "../utils/response";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { OAuth2Client } from "google-auth-library";
import appleSignin from "apple-signin-auth";

const googleClient = new OAuth2Client(process.env.GOOGLE_WEB_CLIENT_ID);

dotenv.config();

//************************ MAIN CONTROLLER ******************************

import crypto from "crypto";
import { userInfoModel } from "../models/user-info-schema";
import { userActivityModel } from "../models/user-activity-schema";
import { userSettingsModel } from "../models/user-setting-schema";
import { platform } from "os";
import { PlatformSettingModel } from "../models/platform-settings-schema";

export const socialLogin = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();

  try {
    let {
      firstName,
      lastName,
      fullName,
      email,
      idToken,
      phoneNumber = null,
      fcmToken = "",
      deviceType,
    } = req.body;

    if (!idToken) {
      throw new Error("Google ID token is required");
    }

    if (!["ANDROID", "IOS", "WEB"].includes(deviceType)) {
      throw new Error("Invalid device type");
    }

    let verifiedEmail: string;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_WEB_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      if (!payload || !payload.email) {
        throw new Error("Invalid Google token payload");
      }
      verifiedEmail = payload.email.toLowerCase().trim();
    } catch (err) {
      throw new Error("Google authentication failed: invalid or expired token");
    }

    const requestEmail = String(email || "")
      .trim()
      .toLowerCase();

    if (requestEmail && requestEmail !== verifiedEmail) {
      console.warn("Google email mismatch", {
        requestEmail,
        verifiedEmail,
      });
      throw new Error("Email mismatch");
    }
    const normalizedEmail = verifiedEmail;
    const normalizedFcmToken =
      typeof fcmToken === "string" ? fcmToken.trim() : "";

    if (!normalizedEmail) {
      throw new Error("Email is required");
    }

    if (deviceType === "ANDROID") {
      if (!firstName || !lastName || !normalizedFcmToken) {
        throw new Error(
          "For Android: Firstname, Lastname, Email, and FCM-Token are required",
        );
      }
      fullName =
        `${String(firstName).trim()} ${String(lastName).trim()}`.trim();
    } else {
      if (deviceType !== "WEB" && !normalizedFcmToken) {
        throw new Error("For iOS: Email and FCM-Token are required");
      }

      firstName = String(firstName || "").trim() || "User";
      lastName = String(lastName || "").trim() || "";
      fullName =
        String(fullName || "").trim() ||
        `${firstName} ${lastName}`.trim() ||
        "User";
    }

    let user = (await userModel.findOne({ email: normalizedEmail })) as any;

    if (user?.isBlocked) {
      throw new Error("Your account has been blocked");
    }

    if (user?.deletionState?.status === "PENDING_DELETION") {
      await userModel.updateOne(
        { _id: user._id },
        {
          $set: {
            "deletionState.status": "ACTIVE",
            "deletionState.requestedAt": null,
            "deletionState.scheduledAt": null,
            "deletionState.completedAt": null,
            isActive: true,
          },
        },
      );

      user = await userModel.findById(user._id);
    }

    if (user?.deletionState?.status === "DELETED") {
      throw new Error(
        "This account was permanently deleted and cannot be restored",
      );
    }

    if (!user) {
      const tombstoned = await deletedEmailModel.findOne({
        email: normalizedEmail,
      });

      if (tombstoned) {
        throw new Error(
          "An account with this email was permanently deleted and cannot be re-registered",
        );
      }

      const generateUniqueReferral = async () => {
        let code = "";
        let exists = true;

        while (exists) {
          code = crypto.randomBytes(4).toString("hex").toUpperCase();
          const found = await userModel
            .findOne({ referralCode: code })
            .session(session);
          if (!found) exists = false;
        }

        return code;
      };

      await session.withTransaction(async () => {
        const referralCode = await generateUniqueReferral();

        const createdUsers = await userModel.create(
          [
            {
              firstName,
              lastName,
              fullName,
              email: normalizedEmail,
              deviceType,
              fcmToken: normalizedFcmToken ? [normalizedFcmToken] : [],
              phoneNumber,
              referralCode,
            },
          ],
          { session },
        );

        user = createdUsers[0];

        await userSettingsModel.findOneAndUpdate(
          { userId: user._id },
          { $setOnInsert: { userId: user._id } },
          { new: true, upsert: true, session },
        );

        await userInfoModel.create(
          [
            {
              userId: user._id,
              emergencyContact: null,
              modelUseCount: 0,
              vehicle: [],
            },
          ],
          { session },
        );
      });
    }

    if (normalizedFcmToken) {
      await userModel.updateOne(
        { _id: user._id, fcmToken: { $ne: normalizedFcmToken } },
        { $push: { fcmToken: normalizedFcmToken } },
      );
      user = await userModel.findById(user._id);
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT configuration missing");
    }

    const token = jwt.sign(
      { userId: user._id.toString(), email: normalizedEmail },
      process.env.JWT_SECRET,
      { expiresIn: "365d" },
    );

    await userActivityModel.create({
      userId: user._id,
      type: "LOGIN",
      title: "You have successfully logged in",
    });

    return OK(res, {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      deviceType: user.deviceType,
      fcmToken: user.fcmToken,
      referralCode: user.referralCode,
      alertBalance: user.alertBalance,
      callBalance: user.callBalance,
      token,
    });
  } catch (e: any) {
    console.error(e);
    if (e?.code === 11000) return BADREQUEST(res, "Account already exists");
    if (e?.message) return BADREQUEST(res, e.message);
    return INTERNAL_SERVER_ERROR(res);
  } finally {
    await session.endSession();
  }
};

export const appleSocialLogin = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();

  try {
    let {
      identityToken, // JWT from Apple — always present
      authorizationCode,
      fullName, // only sent on FIRST Apple login, null on repeat
      email, // only sent on FIRST Apple login, null on repeat (hide my email too)
      fcmToken = "",
      deviceType,
      appleUserId, // user field from Apple response — stable unique ID
    } = req.body;

    if (!identityToken || !appleUserId) {
      throw new Error("Apple identity token and user ID are required");
    }

    if (!["ANDROID", "IOS", "WEB"].includes(deviceType)) {
      throw new Error("Invalid device type");
    }

    // ── Step 1: Verify Apple JWT ──────────────────────────────────────────
    let applePayload: any;
    try {
      applePayload = await appleSignin.verifyIdToken(identityToken, {
        audience: process.env.APPLE_BUNDLE_ID, // e.g. com.yourcompany.wayze
        ignoreExpiration: false,
      });
    } catch (err) {
      throw new Error("Apple authentication failed: invalid or expired token");
    }

    // applePayload.sub is the stable Apple User ID — matches appleUserId from client
    if (applePayload.sub !== appleUserId) {
      throw new Error("Apple user ID mismatch");
    }

    const normalizedFcmToken =
      typeof fcmToken === "string" ? fcmToken.trim() : "";

    // ── Step 2: Resolve email ─────────────────────────────────────────────
    // Apple only sends email on FIRST login. After that it's null.
    // applePayload.email may be a relay address (privaterelay.appleid.com)
    // if user chose "Hide My Email" — that's fine, we store it as-is.
    const appleEmail = applePayload.email
      ? applePayload.email.toLowerCase().trim()
      : null;

    const clientEmail = email ? String(email).toLowerCase().trim() : null;

    // Use verified payload email over client-sent email
    const resolvedEmail = appleEmail || clientEmail || null;

    // ── Step 3: Find existing account ────────────────────────────────────
    // Priority order for account linking:
    // 1. Match by appleId (returning Apple user)
    // 2. Match by email (Google user signing in with Apple for first time)
    // 3. No match → create new account

    let user = (await userModel.findOne({ appleId: appleUserId })) as any;

    if (!user && resolvedEmail) {
      // Check if a Google account exists with this email
      // This is the cross-provider linking scenario
      user = (await userModel.findOne({ email: resolvedEmail })) as any;

      if (user) {
        // Link Apple to existing Google account
        await userModel.updateOne(
          { _id: user._id },
          {
            $set: { appleId: appleUserId },
            $addToSet: { authProviders: "APPLE" },
          },
        );
        user = await userModel.findById(user._id);
        console.log(
          `✅ Linked Apple ID to existing Google account: ${resolvedEmail}`,
        );
      }
    }

    if (user?.isBlocked) {
      throw new Error("Your account has been blocked");
    }

    if (user?.deletionState?.status === "PENDING_DELETION") {
      await userModel.updateOne(
        { _id: user._id },
        {
          $set: {
            "deletionState.status": "ACTIVE",
            "deletionState.requestedAt": null,
            "deletionState.scheduledAt": null,
            "deletionState.completedAt": null,
            isActive: true,
          },
        },
      );
      user = await userModel.findById(user._id);
    }

    if (user?.deletionState?.status === "DELETED") {
      throw new Error(
        "This account was permanently deleted and cannot be restored",
      );
    }

    // ── Step 4: Create new account if no match found ──────────────────────
    if (!user) {
      if (resolvedEmail) {
        const tombstoned = await deletedEmailModel.findOne({
          email: resolvedEmail,
        });
        if (tombstoned) {
          throw new Error(
            "An account with this email was permanently deleted and cannot be re-registered",
          );
        }
      }

      // fullName is only available on first Apple login
      // On repeat logins with "Hide My Email", both email and fullName are null
      const parsedFirst = fullName?.givenName || "User";
      const parsedLast = fullName?.familyName || "";
      const parsedFull =
        [parsedFirst, parsedLast].filter(Boolean).join(" ") || "User";

      const generateUniqueReferral = async () => {
        let code = "";
        let exists = true;
        while (exists) {
          code = crypto.randomBytes(4).toString("hex").toUpperCase();
          const found = await userModel
            .findOne({ referralCode: code })
            .session(session);
          if (!found) exists = false;
        }
        return code;
      };

      await session.withTransaction(async () => {
        const referralCode = await generateUniqueReferral();

        const createdUsers = await userModel.create(
          [
            {
              firstName: parsedFirst,
              lastName: parsedLast,
              fullName: parsedFull,
              email: resolvedEmail, // may be null if "Hide My Email" + repeat login
              appleId: appleUserId, // ✅ always present and stable
              authProviders: ["APPLE"],
              deviceType,
              fcmToken: normalizedFcmToken ? [normalizedFcmToken] : [],
              phoneNumber: null,
              referralCode,
            },
          ],
          { session },
        );

        user = createdUsers[0];

        await userSettingsModel.findOneAndUpdate(
          { userId: user._id },
          { $setOnInsert: { userId: user._id } },
          { new: true, upsert: true, session },
        );

        await userInfoModel.create(
          [
            {
              userId: user._id,
              emergencyContact: null,
              modelUseCount: 0,
              vehicle: [],
            },
          ],
          { session },
        );
      });
    }

    // ── Step 5: Update FCM token ──────────────────────────────────────────
    if (normalizedFcmToken) {
      await userModel.updateOne(
        { _id: user._id, fcmToken: { $ne: normalizedFcmToken } },
        { $push: { fcmToken: normalizedFcmToken } },
      );
      user = await userModel.findById(user._id);
    }

    // ── Step 6: Sign JWT and return ───────────────────────────────────────
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT configuration missing");
    }

    const token = jwt.sign(
      { userId: user._id.toString(), email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "365d" },
    );

    await userActivityModel.create({
      userId: user._id,
      type: "LOGIN",
      title: "You have successfully logged in",
    });

    return OK(res, {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      deviceType: user.deviceType,
      fcmToken: user.fcmToken,
      referralCode: user.referralCode,
      alertBalance: user.alertBalance,
      callBalance: user.callBalance,
      token,
    });
  } catch (e: any) {
    console.error(e);
    if (e?.code === 11000) return BADREQUEST(res, "Account already exists");
    if (e?.message) return BADREQUEST(res, e.message);
    return INTERNAL_SERVER_ERROR(res);
  } finally {
    await session.endSession();
  }
};

export const getPolicies = async (req: Request, res: Response) => {
  try {
    const settings = await PlatformSettingModel.findOne();
    if (!settings) {
      throw new Error("Platform settings not found");
    }
    return OK(res, {
      termsAndConditions: settings.termsAndConditions,
      privacyPolicy: settings.privacyPolicy,
    });
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
      fcmToken = "",
      deviceType,
      password,
    } = req.body;

    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();
    const normalizedFcmToken =
      typeof fcmToken === "string" ? fcmToken.trim() : "";

    if (!firstName || !lastName || !normalizedEmail || !password) {
      throw new Error("First Name, Last Name, Password & Email are required");
    }

    if (!["ANDROID", "IOS", "WEB"].includes(deviceType)) {
      throw new Error("Invalid device type");
    }

    const checkExist = await userModel.findOne({ email: normalizedEmail });
    if (checkExist) {
      throw new Error("Email already exists");
    }

    const isTombstoned = await deletedEmailModel.findOne({
      email: normalizedEmail,
    });
    if (isTombstoned) {
      throw new Error(
        "An account with this email was permanently deleted and cannot be re-registered",
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const data = await userModel.create({
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      fullName:
        String(fullName || "").trim() ||
        `${String(firstName).trim()} ${String(lastName).trim()}`.trim(),
      email: normalizedEmail,
      phoneNumber,
      fcmToken: normalizedFcmToken ? [normalizedFcmToken] : [],
      deviceType,
      password: hashedPassword,
    });

    return OK(res, {
      _id: data._id,
      firstName: data.firstName,
      lastName: data.lastName,
      fullName: data.fullName,
      email: data.email,
      phoneNumber: data.phoneNumber,
      deviceType: data.deviceType,
    });
  } catch (e: any) {
    console.error(e);
    if (e?.code === 11000) return BADREQUEST(res, "Email already exists");
    if (e?.message) return BADREQUEST(res, e.message);
    return INTERNAL_SERVER_ERROR(res);
  }
};

export const loginUser = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();

    if (!normalizedEmail || !password) {
      throw new Error("Email and Password are required");
    }

    const user = (await userModel.findOne({ email: normalizedEmail })) as any;
    if (!user) {
      throw new Error("Invalid email or password");
    }

    if (user?.isBlocked) {
      throw new Error("Your account has been blocked");
    }

    if (user?.deletionState?.status === "DELETED") {
      throw new Error(
        "This account was permanently deleted and cannot be restored",
      );
    }

    if (user?.deletionState?.status === "PENDING_DELETION") {
      await userModel.updateOne(
        { _id: user._id },
        {
          $set: {
            "deletionState.status": "ACTIVE",
            "deletionState.requestedAt": null,
            "deletionState.scheduledAt": null,
            "deletionState.completedAt": null,
            isActive: true,
          },
        },
      );
    }

    if (!user.password) {
      throw new Error(
        "This account uses social login. Please continue with Google/Apple.",
      );
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new Error("Invalid email or password");
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT configuration missing");
    }

    const token = jwt.sign(
      { userId: user._id.toString(), email: normalizedEmail },
      process.env.JWT_SECRET,
      { expiresIn: "365d" },
    );

    await userActivityModel.create({
      userId: user._id,
      type: "LOGIN",
      title: "You have successfully logged in",
    });

    return OK(res, {
      message: "Login Successful",
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        deviceType: user.deviceType,
        referralCode: user.referralCode,
        alertBalance: user.alertBalance,
        callBalance: user.callBalance,
      },
      token,
    });
  } catch (e: any) {
    console.error(e);
    if (e?.message) {
      return BADREQUEST(res, e.message);
    }
    return INTERNAL_SERVER_ERROR(res);
  }
};
