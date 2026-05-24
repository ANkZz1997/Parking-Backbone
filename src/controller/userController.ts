import { Request, Response } from "express";
import {
  BADREQUEST,
  INTERNAL_SERVER_ERROR,
  OK,
  TOO_MANY_REQUESTS,
} from "../utils/response";
import { userInfoModel } from "../models/user-info-schema";
import { userModel } from "../models/user-schema";
import { userActivityModel } from "../models/user-activity-schema";
import { userSettingsModel } from "../models/user-setting-schema";
import { PlatformSettingModel } from "../models/platform-settings-schema";
import { successfulReferralModel } from "../models/successful-referral.schema";
import { NotificationService } from "../utils/fcm";
import { NotificationModel } from "../models/notification-schema";
import { makeNonce } from "../middleware/zego-middle";
import { callModel } from "../models/call-schema";
import { v4 as uuidv4 } from "uuid";
import { getTranslation } from "../utils/translations";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { reportModel } from "../models/report-schema";
import mongoose from "mongoose";

dayjs.extend(utc);
dayjs.extend(timezone);

// Manage Vehicles *********************************************

export const userData = async (req: Request, res: Response) => {
  try {
    const { userId: id } = req.user as any;

    const userInfo = await userInfoModel.findOne({ userId: id });

    return OK(res, userInfo);
  } catch (e: any) {
    console.error(e);
    if (e?.message) return BADREQUEST(res, e.message);
    return INTERNAL_SERVER_ERROR(res);
  }
};

export const getVehicleById = async (req: Request, res: Response) => {
  try {
    const { vehicleId } = req.query;
    const { userId: id } = req.user as any;

    const userInfo = await userInfoModel.findOne({ userId: id });

    const vehicle = userInfo?.vehicle.find(
      (v: any) => v._id?.toString() === vehicleId,
    );

    if (!vehicle) {
      return BADREQUEST(res, "Vehicle not found");
    }

    const vehicleSearched = await userActivityModel
      .find({
        userId: id,
        registrationNumber: vehicle.vehicleRegistration,
        type: "VEHICLE_SEARCHED",
      })
      .sort({ createdAt: -1 });

    const responseData = {
      plateNumber: vehicle.vehicleRegistration,
      vehicleType: vehicle.wheelType,
      contactPhone: userInfo?.emergencyContact || "",
      searches: vehicleSearched.length,
      contactRequests: 0,
      lastSearched: vehicleSearched[0]?.createdAt || null,
      createdAt: vehicle.createdAt,
    };

    return OK(res, responseData);
  } catch (e: any) {
    console.error(e);
    if (e?.message) return BADREQUEST(res, e.message);
    return INTERNAL_SERVER_ERROR(res);
  }
};

export const addUpdateUserInfo = async (req: Request, res: Response) => {
  try {
    const { wheelType, vehicleRegistration, emergencyContact, referralCode } =
      req.body;
    const { userId: id } = req.user as any;

    const reg = vehicleRegistration.trim().toUpperCase();

    // === ENSURE VEHICLE UNIQUE (DB INDEX STILL REQUIRED) ===
    const existingVehicle = await userInfoModel
      .findOne({ "vehicle.vehicleRegistration": reg })
      .populate("userId", "deletionState");

    if (existingVehicle) {
      const ownerStatus = (existingVehicle.userId as any)?.deletionState
        ?.status;

      if (ownerStatus === "DELETED") {
        // Fully deleted — remove old vehicle entry so new user can claim it
        await userInfoModel.updateOne(
          { "vehicle.vehicleRegistration": reg },
          { $pull: { vehicle: { vehicleRegistration: reg } } },
        );
        // Fall through — allow registration below
      } else {
        // ACTIVE or PENDING_DELETION — block registration
        return BADREQUEST(res, "Vehicle already registered");
      }
    }

    // === UPSERT USER INFO ===
    let userInfo = await userInfoModel.findOneAndUpdate(
      { userId: id },
      { $setOnInsert: { userId: id, modelUseCount: 0 } },
      { new: true, upsert: true },
    );

    const MAX_VEHICLES = parseInt(process.env.MAX_VEHICLES_PER_USER || "3");
    if (userInfo.vehicle && userInfo.vehicle.length >= MAX_VEHICLES) {
      return BADREQUEST(
        res,
        `Maximum ${MAX_VEHICLES} vehicles allowed per account`,
      );
    }

    // === REFERRAL LOGIC (FIRST USE ONLY) ===
    if (userInfo.modelUseCount === 0 && referralCode) {
      const referringUser = await userModel.findOne({
        referralCode: referralCode.trim().toUpperCase(),
      });

      if (referringUser) {
        const platformSettings =
          (await PlatformSettingModel.findOne({})) || (0 as any);
        if (platformSettings) {
          const referralCount = await successfulReferralModel.countDocuments({
            referredBy: referringUser._id,
          });

          if (referralCount < platformSettings?.maxReferralAllowed) {
            await successfulReferralModel.create({
              referredBy: referringUser._id,
              referredTo: id,
              rewardEarned: platformSettings.rewardPerReferral,
            });

            await userModel.updateOne(
              { _id: referringUser._id },
              {
                $inc: {
                  coinEarned: platformSettings.rewardPerReferral,
                },
              },
            );
          }
        }
      }
    }

    // === ATOMIC USER INFO UPDATE ===
    await userInfoModel.updateOne(
      { userId: id },
      {
        $set: {
          emergencyContact: emergencyContact || userInfo.emergencyContact,
        },
        $push: {
          vehicle: {
            wheelType,
            vehicleRegistration: reg,
            isVerified: true,
          },
        },
        $inc: { modelUseCount: 1 },
      },
    );

    // Fire-and-forget
    userActivityModel.create({
      userId: id,
      type: "VEHICLE_ADDED",
      title: "You have added a new vehicle",
    });

    return OK(res, userInfo);
  } catch (e: any) {
    console.error(e);
    if (e?.message) return BADREQUEST(res, e.message);
    return INTERNAL_SERVER_ERROR(res);
  }
};

export const deleteVehicle = async (req: Request, res: Response) => {
  try {
    const { id: vehicleId } = req.query;
    const { userId } = req.user as any;

    const updateResult = await userInfoModel.updateOne(
      { userId },
      {
        $pull: {
          vehicle: { _id: vehicleId },
        },
      },
    );

    if (updateResult.modifiedCount === 0) {
      return BADREQUEST(res, "Vehicle not found");
    }

    await userActivityModel.create({
      userId: userId,
      type: "VEHICLE_REMOVED",
      title: "You have removed a vehicle.",
    });

    return OK(res, {}, "Deleted Successfully");
  } catch (e: any) {
    console.error(e);
    if (e?.message) return BADREQUEST(res, e.message);
    return INTERNAL_SERVER_ERROR(res);
  }
};

export const searchVehicle = async (req: Request, res: Response) => {
  try {
    const { vehicleRegistration } = req.body;
    const { userId } = req.user as any;

    await userActivityModel.create({
      userId,
      type: "VEHICLE_SEARCHED",
      title: `You have searched ${vehicleRegistration}`,
      registrationNumber: vehicleRegistration,
    });

    const checkData = (await userInfoModel
      .findOne({
        userId: { $ne: userId },
        vehicle: { $elemMatch: { vehicleRegistration } },
      })
      .populate("userId")
      .lean()) as any;

    if (!checkData) return BADREQUEST(res, "Vehicle not found");

    const ownerDeletionStatus = (checkData.userId as any)?.deletionState
      ?.status;
    if (
      ownerDeletionStatus === "PENDING_DELETION" ||
      ownerDeletionStatus === "DELETED"
    ) {
      return BADREQUEST(res, "Vehicle not found");
    }

    const { fullName, image, _id, blockedUsers } = checkData.userId as any;

    const receiverSettings = await userSettingsModel.findOne({ userId: _id });
    if (receiverSettings?.profileVisibility === false) {
      return BADREQUEST(res, "Vehicle not found");
    }

    // Check if owner has blocked the searcher
    const isBlocked =
      blockedUsers?.some(
        (id: mongoose.Types.ObjectId) => String(id) === String(userId),
      ) ?? false;

    // Notifications
    const language = receiverSettings?.preferredLanguage || "en";
    const translation = getTranslation(
      "VEHICLE_SEARCHED",
      language,
      vehicleRegistration,
    );
    const englishTranslation = getTranslation(
      "VEHICLE_SEARCHED",
      "en",
      vehicleRegistration,
    );

    await NotificationModel.create({
      userId: _id,
      type: "VEHICLE_SEARCHED",
      title: englishTranslation.title,
      body: englishTranslation.body,
      registrationNumber: vehicleRegistration,
    });

    if (
      checkData?.userId?.fcmToken.length &&
      receiverSettings?.notifications !== false
    ) {
      NotificationService(
        checkData?.userId?.fcmToken,
        "VEHICLE_SEARCHED",
        null,
        translation.title,
        translation.body,
        language,
      );
    }

    // Rate limit config
    const DAILY_CALL_LIMIT = parseInt(process.env.DAILY_CALL_LIMIT || "2");
    const DAILY_ALERT_LIMIT = parseInt(process.env.DAILY_ALERT_LIMIT || "3");
    const RESET_HOUR = parseInt(process.env.CALL_LIMIT_RESET_HOUR || "1");

    const nowIST = dayjs().tz("Asia/Kolkata");

    // Call window — resets at RESET_HOUR (e.g. 1 AM IST)
    let windowStart = nowIST
      .hour(RESET_HOUR)
      .minute(0)
      .second(0)
      .millisecond(0);
    if (nowIST.hour() < RESET_HOUR)
      windowStart = windowStart.subtract(1, "day");

    let nextReset = nowIST.hour(RESET_HOUR).minute(0).second(0).millisecond(0);
    if (nowIST.hour() >= RESET_HOUR) nextReset = nextReset.add(1, "day");

    // Alert window — resets at midnight IST
    const alertWindowStart = nowIST.startOf("day").toDate();

    // Fetch both limits in parallel
    const [callsInWindow, alertsSentToday] = await Promise.all([
      callModel.countDocuments({
        callerId: userId,
        receiverId: _id,
        status: { $in: ["ANSWERED", "ENDED"] },
        createdAt: { $gte: windowStart.toDate() },
      }),
      NotificationModel.countDocuments({
        senderId: userId,
        userId: _id,
        type: { $in: ["ALERT_HIGH", "ALERT_LOW"] },
        createdAt: { $gte: alertWindowStart },
      }),
    ]);

    return OK(res, {
      fullName,
      image,
      userId: _id,
      isBlocked,
      callLimit: {
        limit: DAILY_CALL_LIMIT,
        used: callsInWindow,
        exceeded: callsInWindow >= DAILY_CALL_LIMIT,
        resetAt: nextReset.toISOString(),
      },
      alertLimit: {
        limit: DAILY_ALERT_LIMIT,
        used: alertsSentToday,
        exceeded: alertsSentToday >= DAILY_ALERT_LIMIT,
      },
    });
  } catch (e: any) {
    console.error(e);
    if (e?.message) return BADREQUEST(res, e.message);
    return INTERNAL_SERVER_ERROR(res);
  }
};

export const initiateAlert = async (req: Request, res: Response) => {
  try {
    const { userId } = req.user as any;
    const { priorityHigh, receiverId } = req.body;

    const receiverData = (await userModel
      .findById(receiverId)
      .select("fcmToken")
      .lean()) as any;

    if (!receiverData) {
      return BADREQUEST(res, "Receiver not found");
    }

    // Get receiver's language preference
    const receiverSettings = await userSettingsModel.findOne({
      userId: receiverId,
    });
    const language = receiverSettings?.preferredLanguage || "en";

    // Get translation for FCM
    const notificationType = priorityHigh ? "ALERT_HIGH" : "ALERT_LOW";
    const translation = getTranslation(notificationType, language);

    // ✅ ALWAYS store in English in database
    const englishTranslation = getTranslation(notificationType, "en");

    await NotificationModel.create({
      userId: receiverData?._id,
      type: notificationType,
      title: englishTranslation.title, // ← Always English
      body: englishTranslation.body, // ← Always English
      senderId: userId,
    });

    // Send FCM in user's preferred language
    if (
      receiverData?.fcmToken?.length &&
      receiverSettings?.notifications !== false
    ) {
      NotificationService(
        receiverData?.fcmToken,
        notificationType,
        null,
        translation.title,
        translation.body,
        language,
      );
    }

    return OK(res, {});
  } catch (e: any) {
    console.error(e);
    if (e?.message) return BADREQUEST(res, e.message);
    return INTERNAL_SERVER_ERROR(res);
  }
};

export const initiateCall = async (req: Request, res: Response) => {
  try {
    const { userId } = req.user as any;
    const data = makeNonce(userId);
    return OK(res, {
      ...data,
    });
  } catch (e: any) {
    console.error(e);
    if (e?.message) return BADREQUEST(res, e.message);
    return INTERNAL_SERVER_ERROR(res);
  }
};

export const updateCallStatus = async (req: Request, res: Response) => {
  try {
    console.log("🔍 Full query:", req.query);
    console.log("🔍 Full body:", req.body);
    const { userId } = req.user as any;
    const {
      receiverId,
      callId,
      status = "INITIATED",
      registrationNumber = null, // ✅ moved here
    } = req.query as {
      receiverId?: string;
      callId?: string;
      status?: string;
      registrationNumber?: string;
    };

    if (status == "INITIATED" && receiverId) {
      const newCall = await callModel.create({
        callId: uuidv4(),
        callerId: userId,
        receiverId: receiverId,
        status: "INITIATED",
        registrationNumber: registrationNumber ?? null,
      });
      console.log("💾 Saved plate:", newCall.registrationNumber);

      return OK(res, { callId: newCall.callId });
    }

    const callData = await callModel.findOne({ callId });

    if (!callData) {
      return BADREQUEST(res, "Call not found");
    }

    if (status === "ANSWERED") {
      await callModel.updateOne(
        { callId },
        {
          status: "ANSWERED",
          answeredAt: new Date(),
          startedAt: new Date(),
        },
      );

      userActivityModel.create({
        userId: userId,
        type: "CALL",
        title: "Calling activity recorded",
      });

      userActivityModel.create({
        userId: callData.receiverId,
        type: "RECEIVED_CALL",
        title: "Calling activity recorded",
      });
    } else if (status === "ENDED") {
      const call = (await callModel.findOne({ callId })) as any;

      const endedAt = new Date();
      const duration = call.startedAt
        ? Math.floor((endedAt.getTime() - call.startedAt.getTime()) / 1000)
        : 0;

      await callModel.updateOne(
        { callId },
        {
          status: "ENDED",
          endedAt,
          durationInSeconds: duration,
        },
      );
    } else if (status === "FAILED") {
      await callModel.updateOne(
        { callId },
        {
          status: "FAILED",
          failureReason: "User did not answer",
          endedAt: new Date(),
        },
      );

      userActivityModel.create({
        userId: userId,
        type: "FAILED_CALL",
        title: "Calling activity recorded",
      });

      const userData = await userModel
        .findById(callData.receiverId)
        .select("fcmToken");

      if (!userData) {
        return BADREQUEST(res, "Receiver not found");
      }

      // Get receiver's language preference
      const receiverSettings = await userSettingsModel.findOne({
        userId: callData?.receiverId,
      });
      const language = receiverSettings?.preferredLanguage || "en";

      // Get translation for FCM
      const translation = getTranslation("CALL", language);

      // Send FCM in user's preferred language
      NotificationService(
        userData?.fcmToken,
        "CALL",
        null,
        translation.title,
        translation.body,
        language,
      );
    } else {
      throw new Error("Invalid call status");
    }

    return OK(res, {});
  } catch (e: any) {
    console.error(e);
    if (e?.message) return BADREQUEST(res, e.message);
    return INTERNAL_SERVER_ERROR(res);
  }
};

export const getCallRecords = async (req: Request, res: Response) => {
  try {
    const { userId } = req.user as any;
    const userObjectId = new mongoose.Types.ObjectId(userId);

    let { page = 1, limit = 20, direction } = req.query;

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(50, Math.max(1, Number(limit)));

    const baseFilter: any = {
      $or: [{ callerId: userObjectId }, { receiverId: userObjectId }],
      status: { $in: ["ANSWERED", "ENDED"] },
    };

    if (direction === "outgoing") {
      delete baseFilter.$or;
      baseFilter.callerId = userObjectId;
    } else if (direction === "incoming") {
      delete baseFilter.$or;
      baseFilter.receiverId = userObjectId;
    }

    const [calls, totalData, reportedCallIds] = await Promise.all([
      callModel
        .find(baseFilter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .populate("callerId", "fullName")
        .populate("receiverId", "fullName")
        .lean(),

      callModel.countDocuments(baseFilter),

      // ✅ returns UUID strings — matches call.callId field
      reportModel.distinct("callId", { reportedBy: userId }),
    ]);

    // ✅ Set of UUID strings, compared against call.callId (not call._id)
    const reportedSet = new Set(reportedCallIds.map(String));

    const records = calls.map((call: any) => {
      const isOutgoing = call.callerId?._id?.toString() === userId.toString();
      const plateNumber = call.registrationNumber ?? null;

      const otherParty = isOutgoing ? call.receiverId : call.callerId;
      const otherName: string = otherParty?.fullName || "Unknown";
      const initials = otherName
        .trim()
        .split(" ")
        .slice(0, 2)
        .map((w: string) => w[0]?.toUpperCase() ?? "")
        .join("");

      // ✅ compare UUID string to UUID string
      const alreadyReported = reportedSet.has(call.callId);

      return {
        _id: call._id,
        callId: call.callId,
        direction: isOutgoing ? "outgoing" : "incoming",
        registrationNumber: plateNumber,
        otherPartyInitials: initials,
        otherPartyName: otherName,
        startedAt: call.startedAt || null,
        endedAt: call.endedAt || null,
        durationInSeconds: call.durationInSeconds || 0,
        status: call.status,
        createdAt: call.createdAt,
        canReport: !isOutgoing, // only incoming calls — receiver reports caller
        reported: alreadyReported,
      };
    });

    return OK(res, {
      calls: records,
      totalData,
      page: pageNum,
      limit: limitNum,
      hasNext: totalData > pageNum * limitNum,
      hasPrevious: pageNum > 1,
    });
  } catch (e: any) {
    console.error(e);
    if (e?.message) return BADREQUEST(res, e.message);
    return INTERNAL_SERVER_ERROR(res);
  }
};

export const reportCall = async (req: Request, res: Response) => {
  try {
    const { userId } = req.user as any;
    const { callId, reason, additionalText, customReason } = req.body;

    // ✅ accept both field names from frontend
    const extraText: string | null =
      (additionalText || customReason)?.trim() || null;

    const validReasons = ["SPAM", "ABUSIVE", "OTHER"];
    if (!reason || !validReasons.includes(reason)) {
      return BADREQUEST(res, "Invalid report reason");
    }

    // ✅ find by UUID callId field
    const callData = await callModel.findOne({ callId });
    if (!callData) {
      return BADREQUEST(res, "Call not found");
    }

    if (String(callData.receiverId) !== String(userId)) {
      return BADREQUEST(res, "Only the call receiver can report this call");
    }

    const callerId = callData.callerId;

    // duplicate check — uses same UUID callId, consistent
    const existingReport = await reportModel.findOne({
      reportedBy: userId,
      callId,
    });
    if (existingReport) {
      // ✅ 409 so frontend can show "already reported" state
      return res
        .status(409)
        .json({ success: false, message: "Already reported" });
    }

    await reportModel.create({
      reportedBy: userId,
      reportedUser: callerId,
      callId, // UUID string
      reason,
      additionalText: extraText, // ✅ unified, trimmed
    });

    await userModel.updateOne(
      { _id: userId, blockedUsers: { $ne: callerId } },
      { $push: { blockedUsers: callerId } },
    );

    await userActivityModel.create({
      userId,
      type: "CALL",
      title: `Reported and blocked a caller`,
    });

    return OK(res, { message: "Caller has been blocked and report submitted" });
  } catch (e: any) {
    console.error(e);
    if (e?.message) return BADREQUEST(res, e.message);
    return INTERNAL_SERVER_ERROR(res);
  }
};

// Manage Vehicles *********************************************

export const userHome = async (req: Request, res: Response) => {
  try {
    const { userId } = req.user as any;
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const userData = (await userModel
      .findById(userId)
      .select(
        "firstName lastName fullName email phoneNumber deviceType fcmToken referralCode alertBalance callBalance createdAt",
      )
      .lean()) as any;

    if (!userData) return BADREQUEST(res, "User not found");

    const [
      unreadNotifications,
      vehicleSearched,
      timesContacted,
      vehicleInfo,
      recentCalls,
    ] = await Promise.all([
      NotificationModel.countDocuments({ userId, isRead: false }),

      userActivityModel.countDocuments({ userId, type: "VEHICLE_SEARCHED" }),

      userActivityModel.countDocuments({ userId, type: "RECEIVED_CALL" }),

      userInfoModel.findOne({ userId }).lean(),

      // ── Latest 3 ANSWERED/ENDED calls (outgoing OR incoming) ──
      callModel
        .find({
          $or: [{ callerId: userObjectId }, { receiverId: userObjectId }],
          status: { $in: ["ANSWERED", "ENDED"] },
        })
        .sort({ createdAt: -1 })
        .limit(3)
        .populate("callerId", "fullName")
        .populate("receiverId", "fullName")
        .lean(),
    ]);

    console.log("🕐 Most recent call createdAt check:");
    const checkCall = (await callModel
      .findOne({ receiverId: userObjectId })
      .sort({ createdAt: -1 })
      .lean()) as any;
    console.log(
      "Latest call:",
      checkCall?.createdAt,
      "| plate:",
      checkCall?.registrationNumber,
      "| status:",
      checkCall?.status,
    );

    // ── Shape each recent call for the home screen ──
    const recentCallRecords = recentCalls.map((call: any) => {
      const isOutgoing = call.callerId?._id?.toString() === userId.toString();
      const otherParty = isOutgoing ? call.receiverId : call.callerId;
      const otherName: string = otherParty?.fullName || "Unknown";
      const initials = otherName
        .trim()
        .split(" ")
        .slice(0, 2)
        .map((w: string) => w[0]?.toUpperCase() ?? "")
        .join("");

      return {
        _id: call._id,
        callId: call.callId,
        direction: isOutgoing ? "outgoing" : "incoming",
        registrationNumber: call.registrationNumber || null,
        otherPartyInitials: initials,
        otherPartyName: otherName,
        startedAt: call.startedAt || call.createdAt,
        endedAt: call.endedAt || null,
        durationInSeconds: call.durationInSeconds || 0,
        status: call.status,
      };
    });

    return OK(res, {
      ...userData,
      vehicleSearched,
      timesContacted,
      vehicleRegistered: vehicleInfo?.vehicle.length || 0,
      memberSince: userData?.createdAt || null,
      unreadNotifications,
      recentCalls: recentCallRecords, // ✅ new
    });
  } catch (e: any) {
    console.error(e);
    if (e?.message) return BADREQUEST(res, e.message);
    return INTERNAL_SERVER_ERROR(res);
  }
};

export const userActivity = async (req: Request, res: Response) => {
  try {
    const { userId } = req.user as any;
    let { type = "ALL", page = 1, limit = 20 } = req.query;

    if (
      !["CALL", "ALERT", "VEHICLE_SEARCHED", "ALL"].includes(type as string)
    ) {
      return BADREQUEST(res, "Invalid activity type");
    }

    const pageNum = Number(page);
    const limitNum = Number(limit);

    let activity = [];
    let totalData = 0;

    if (type === "ALL") {
      activity = await userActivityModel
        .find({ userId })
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean();

      totalData = await userActivityModel.countDocuments({ userId });
    } else {
      activity = await userActivityModel
        .find({ userId, type })
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean();

      totalData = await userActivityModel.countDocuments({ userId, type });
    }

    return OK(res, {
      activity,
      totalData,
      page: pageNum,
      limit: limitNum,
      hasNext: totalData > pageNum * limitNum,
      hasPrevious: pageNum > 1,
    });
  } catch (e: any) {
    console.error(e);
    if (e?.message) return BADREQUEST(res, e.message);
    return INTERNAL_SERVER_ERROR(res);
  }
};

export const getUserSettings = async (req: Request, res: Response) => {
  try {
    const { userId } = req.user as any;

    const settings = await userSettingsModel.findOne({ userId });

    if (!settings) {
      const newSettings = await userSettingsModel.create({ userId });
      return OK(res, newSettings);
    }

    return OK(res, settings);
  } catch (e: any) {
    console.error(e);
    if (e?.message) return BADREQUEST(res, e.message);
    return INTERNAL_SERVER_ERROR(res);
  }
};

export const updateUserSettings = async (req: Request, res: Response) => {
  try {
    const {
      notifications = true,
      emailAlerts = true,
      smsAlerts = true,
      profileVisibility = true,
      preferredLanguage = "en", // NEW FIELD
    } = req.body as any;
    const { userId } = req.user as any;

    // Validate language
    if (!["en", "hi", "mr"].includes(preferredLanguage)) {
      return BADREQUEST(res, "Invalid language. Supported: en, hi, mr");
    }

    const settings = await userSettingsModel.findOneAndUpdate(
      { userId },
      {
        $set: {
          notifications,
          emailAlerts,
          smsAlerts,
          profileVisibility,
          preferredLanguage,
        },
      },
      { new: true, upsert: true },
    );

    return OK(res, settings);
  } catch (e: any) {
    console.error(e);
    if (e?.message) return BADREQUEST(res, e.message);
    return INTERNAL_SERVER_ERROR(res);
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    const { userId } = req.user as any;
    const { fcmToken } = req.body as any;

    if (!fcmToken) {
      return BADREQUEST(res, "FCM Token is required");
    }

    await userModel.updateOne(
      { _id: userId },
      { $pull: { fcmToken: fcmToken } },
    );

    return OK(res, {});
  } catch (e: any) {
    console.error(e);
    if (e?.message) return BADREQUEST(res, e.message);
    return INTERNAL_SERVER_ERROR(res);
  }
};

export const deleteAccount = async (req: Request, res: Response) => {
  try {
    const { userId } = req.user as any;

    await userModel.updateOne(
      { _id: userId },
      {
        $set: {
          "deletionState.status": "PENDING_DELETION",
          "deletionState.requestedAt": new Date(),
          "deletionState.scheduledAt": dayjs().add(2, "minutes").toDate(),
          fcmToken: [],
          isActive: false,
        },
      },
    );

    await userActivityModel.create({
      userId,
      type: "DELETE_ACCOUNT",
      title:
        "Account deletion requested. Will be permanently deleted in 2 minutes.",
    });

    return OK(res, {
      message:
        "Your account will be permanently deleted in 2 minutes. Log back in to cancel.",
    });
  } catch (e: any) {
    console.error(e);
    if (e?.message) return BADREQUEST(res, e.message);
    return INTERNAL_SERVER_ERROR(res);
  }
};

// Notification Management ************************************

export const getUserNotifications = async (req: Request, res: Response) => {
  try {
    const { userId } = req.user as any;
    let { page = 1, limit = 20 } = req.query;

    const pageNum = Number(page);
    const limitNum = Number(limit);

    // Fetch user's language preference
    const userSettings = await userSettingsModel.findOne({ userId });
    const userLanguage = userSettings?.preferredLanguage || "en";

    const notifications = await NotificationModel.find({ userId })
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    const totalData = await NotificationModel.countDocuments({ userId });
    const unreadNotifications =
      (await NotificationModel.countDocuments({ userId, isRead: false })) || 0;

    // Translate each notification to user's current language (only for response)
    const translatedNotifications = notifications.map((notification) => {
      const translation = getTranslation(
        notification.type,
        userLanguage,
        notification.registrationNumber || "",
      );

      return {
        ...notification,
        title: translation.title, // Translated for response only
        body: translation.body, // Translated for response only
      };
    });

    return OK(res, {
      notifications: translatedNotifications,
      totalData,
      unreadNotifications,
      readNotification: totalData - unreadNotifications,
      page: pageNum,
      limit: limitNum,
      hasNext: totalData > pageNum * limitNum,
      hasPrevious: pageNum > 1,
    });
  } catch (e: any) {
    console.error(e);
    if (e?.message) return BADREQUEST(res, e.message);
    return INTERNAL_SERVER_ERROR(res);
  }
};

export const readNotifications = async (req: Request, res: Response) => {
  try {
    const { notificationId } = req.body as any;
    const { userId } = req.user as any;

    let notifications;
    if (notificationId) {
      notifications = await NotificationModel.findOneAndUpdate(
        { _id: notificationId },
        { $set: { isRead: true } },
        { new: true },
      );

      if (
        notifications?.type === "ALERT_HIGH" ||
        notifications?.type === "ALERT_LOW"
      ) {
        // Get sender's language preference
        const senderSettings = await userSettingsModel.findOne({
          userId: notifications?.senderId,
        });
        const language = senderSettings?.preferredLanguage || "en";

        // Get translation for FCM
        const translation = getTranslation(
          "ALERT_ACKNOWLEDGED",
          language,
          notifications?.registrationNumber,
        );

        // ✅ ALWAYS store in English in database
        const englishTranslation = getTranslation(
          "ALERT_ACKNOWLEDGED",
          "en",
          notifications?.registrationNumber,
        );

        await NotificationModel.create({
          userId: notifications?.senderId,
          type: "ALERT_ACKNOWLEDGED",
          title: englishTranslation.title, // ← Always English
          body: englishTranslation.body, // ← Always English
          registrationNumber: notifications?.registrationNumber,
        });

        const findFCM = (await userModel
          .findById(notifications?.senderId)
          .select("fcmToken")
          .lean()) as any;

        // Send FCM in user's preferred language
        if (findFCM?.fcmToken?.length) {
          NotificationService(
            findFCM?.fcmToken,
            "ALERT_ACKNOWLEDGED",
            null,
            translation.title, // ← User's language for push
            translation.body, // ← User's language for push
            language,
          );
        }
      }
    } else {
      throw new Error("Notification ID is required");
    }

    return OK(res, notifications);
  } catch (e: any) {
    console.error(e);
    if (e?.message) return BADREQUEST(res, e.message);
    return INTERNAL_SERVER_ERROR(res);
  }
};
