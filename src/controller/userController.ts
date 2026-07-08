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

const VALID_WHEEL_TYPES = [2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20] as const;
type WheelType = (typeof VALID_WHEEL_TYPES)[number];

const normalizeRegistration = (value: any): string => {
  if (typeof value !== "string") return "";
  return value.trim().toUpperCase();
};

const normalizePagination = (page: any, limit: any) => {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(50, Math.max(1, Number(limit) || 20));
  return { pageNum, limitNum };
};

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
    const vehicleId = String(req.query.vehicleId || "");
    const { userId: id } = req.user as any;

    if (!vehicleId) {
      return BADREQUEST(res, "Vehicle ID is required");
    }

    const userInfo = await userInfoModel.findOne({ userId: id });

    if (!userInfo) {
      return BADREQUEST(res, "User info not found");
    }

    const vehicle = userInfo.vehicle.find(
      (v: any) => String(v._id) === vehicleId,
    );

    if (!vehicle) {
      return BADREQUEST(res, "Vehicle not found");
    }

    const vehicleCreatedAt = vehicle.createdAt
      ? new Date(vehicle.createdAt)
      : new Date(0);

    const searchQuery = {
      userId: { $ne: id },
      registrationNumber: vehicle.vehicleRegistration,
      type: "VEHICLE_SEARCHED",
      createdAt: { $gte: vehicleCreatedAt },
    };

    const [searches, lastSearchDoc, contactRequests] = await Promise.all([
      userActivityModel.countDocuments(searchQuery),
      userActivityModel.findOne(searchQuery).sort({ createdAt: -1 }),
      callModel.countDocuments({
        receiverId: id,
        registrationNumber: vehicle.vehicleRegistration,
        createdAt: { $gte: vehicleCreatedAt },
      }),
    ]);

    return OK(res, {
      plateNumber: vehicle.vehicleRegistration,
      vehicleType: vehicle.wheelType,
      contactPhone: userInfo?.emergencyContact || "",
      searches,
      contactRequests,
      lastSearched: lastSearchDoc?.createdAt || null,
      createdAt: vehicle.createdAt || null,
    });
  } catch (e: any) {
    console.error(e);
    if (e?.message) return BADREQUEST(res, e.message);
    return INTERNAL_SERVER_ERROR(res);
  }
};

export const addUpdateUserInfo = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();

  try {
    const { wheelType, vehicleRegistration, emergencyContact, referralCode } =
      req.body;
    const { userId: id } = req.user as any;

    if (!vehicleRegistration || wheelType === undefined || wheelType === null) {
      return BADREQUEST(res, "wheelType and vehicleRegistration are required");
    }

    const normalizedWheelType = Number(wheelType);
    if (
      !(VALID_WHEEL_TYPES as ReadonlyArray<number>).includes(
        normalizedWheelType,
      )
    ) {
      return BADREQUEST(res, "Invalid wheel type");
    }

    const reg = normalizeRegistration(vehicleRegistration);
    if (!reg) {
      return BADREQUEST(res, "Vehicle registration is required");
    }

    let updatedUserInfo: any = null;

    await session.withTransaction(async () => {
      const existingVehicleDoc = await userInfoModel
        .findOne({ "vehicle.vehicleRegistration": reg })
        .populate("userId", "deletionState")
        .session(session);

      if (existingVehicleDoc) {
        const ownerUserId = (existingVehicleDoc.userId as any)?._id;
        const ownerStatus = (existingVehicleDoc.userId as any)?.deletionState
          ?.status;

        if (String(ownerUserId) !== String(id) && ownerStatus !== "DELETED") {
          throw new Error("Vehicle already registered");
        }

        if (String(ownerUserId) !== String(id) && ownerStatus === "DELETED") {
          await userInfoModel.updateOne(
            { "vehicle.vehicleRegistration": reg },
            { $pull: { vehicle: { vehicleRegistration: reg } } },
            { session },
          );
        }
      }

      let userInfo = await userInfoModel.findOneAndUpdate(
        { userId: id },
        { $setOnInsert: { userId: id, modelUseCount: 0 } },
        { new: true, upsert: true, session },
      );

      if (!userInfo) {
        throw new Error("Failed to initialize user info");
      }

      const alreadyExistsForUser = userInfo.vehicle?.some(
        (v: any) => v.vehicleRegistration === reg,
      );

      if (alreadyExistsForUser) {
        throw new Error("Vehicle already added to your account");
      }

      const MAX_VEHICLES = parseInt(
        process.env.MAX_VEHICLES_PER_USER || "3",
        10,
      );
      if ((userInfo.vehicle?.length || 0) >= MAX_VEHICLES) {
        throw new Error(`Maximum ${MAX_VEHICLES} vehicles allowed per account`);
      }

      if (userInfo.modelUseCount === 0 && referralCode) {
        const referringUser = await userModel
          .findOne({
            referralCode: String(referralCode).trim().toUpperCase(),
          })
          .session(session);

        if (referringUser) {
          if (String(referringUser._id) === String(id)) {
            throw new Error("You can't use your own referral code");
          }

          const platformSettings = await PlatformSettingModel.findOne(
            {},
          ).session(session);

          if (platformSettings) {
            const alreadyRewarded = await successfulReferralModel
              .findOne({ referredTo: id })
              .session(session);

            if (!alreadyRewarded) {
              const referralCount = await successfulReferralModel
                .countDocuments({ referredBy: referringUser._id })
                .session(session);

              const maxAllowed = platformSettings.maxReferralAllowed ?? 0;
              const reward = platformSettings.rewardPerReferral ?? 0;

              if (referralCount < maxAllowed) {
                await successfulReferralModel.create(
                  [
                    {
                      referredBy: referringUser._id,
                      referredTo: id,
                      rewardEarned: reward,
                    },
                  ],
                  { session },
                );

                await userModel.updateOne(
                  { _id: referringUser._id },
                  { $inc: { coinEarned: reward } },
                  { session },
                );
              }
            }
          }
        }
      }

      const now = new Date();

      await userInfoModel.updateOne(
        { userId: id },
        {
          $set: {
            emergencyContact:
              emergencyContact !== undefined
                ? emergencyContact
                : userInfo.emergencyContact,
          },
          $push: {
            vehicle: {
              wheelType: normalizedWheelType,
              vehicleRegistration: reg,
              isVerified: true,
              createdAt: now,
            },
          },
          $inc: { modelUseCount: 1 },
        },
        { session },
      );

      await userActivityModel.create(
        [
          {
            userId: id,
            type: "VEHICLE_ADDED",
            title: "You have added a new vehicle",
            registrationNumber: reg,
          },
        ],
        { session },
      );

      updatedUserInfo = await userInfoModel
        .findOne({ userId: id })
        .session(session);
    });

    return OK(res, updatedUserInfo);
  } catch (e: any) {
    console.error(e);
    if (e?.code === 11000) return BADREQUEST(res, "Vehicle already registered");
    if (e?.message) return BADREQUEST(res, e.message);
    return INTERNAL_SERVER_ERROR(res);
  } finally {
    await session.endSession();
  }
};

export const deleteVehicle = async (req: Request, res: Response) => {
  try {
    const vehicleId = String(req.query.id || "");
    const { userId } = req.user as any;

    if (!vehicleId) {
      return BADREQUEST(res, "Vehicle ID is required");
    }

    if (!mongoose.isObjectIdOrHexString(vehicleId)) {
      return BADREQUEST(res, "Invalid vehicle ID");
    }

    const updateResult = await userInfoModel.updateOne(
      { userId },
      { $pull: { vehicle: { _id: vehicleId } } },
    );

    if (updateResult.modifiedCount === 0) {
      return BADREQUEST(res, "Vehicle not found");
    }

    await userActivityModel.create({
      userId,
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

    const reg = normalizeRegistration(vehicleRegistration);
    if (!reg) {
      return BADREQUEST(res, "Vehicle registration is required");
    }

    const candidateOwners = (await userInfoModel
      .find({
        userId: { $ne: userId },
        vehicle: { $elemMatch: { vehicleRegistration: reg } },
      })
      .populate("userId")
      .lean()) as any[];

    if (!candidateOwners.length) {
      return BADREQUEST(res, "Vehicle not found");
    }

    const validOwners = candidateOwners.filter((doc: any) => {
      const ownerStatus = doc?.userId?.deletionState?.status;
      return ownerStatus !== "PENDING_DELETION" && ownerStatus !== "DELETED";
    });

    if (!validOwners.length) {
      return BADREQUEST(res, "Vehicle not found");
    }

    const resolvedOwner = validOwners
      .map((doc: any) => {
        const matchingVehicle = (doc.vehicle || [])
          .filter((v: any) => v.vehicleRegistration === reg)
          .sort(
            (a: any, b: any) =>
              new Date(b.createdAt || 0).getTime() -
              new Date(a.createdAt || 0).getTime(),
          )[0];

        return { doc, matchingVehicle };
      })
      .filter((x: any) => x.matchingVehicle)
      .sort(
        (a: any, b: any) =>
          new Date(b.matchingVehicle.createdAt || 0).getTime() -
          new Date(a.matchingVehicle.createdAt || 0).getTime(),
      )[0];

    if (!resolvedOwner) {
      return BADREQUEST(res, "Vehicle not found");
    }

    const checkData = resolvedOwner.doc;
    const { fullName, image, _id } = checkData.userId as any;
    // ✅ blockedUsers destructure and isBlocked check removed —
    // reporting a user should stop them from contacting you,
    // not hide their vehicle from your own search.

    const receiverSettings = await userSettingsModel.findOne({ userId: _id });
    if (receiverSettings?.profileVisibility === false) {
      return BADREQUEST(res, "Vehicle not found");
    }

    await userActivityModel.create({
      userId,
      type: "VEHICLE_SEARCHED",
      title: `You have searched ${reg}`,
      registrationNumber: reg,
    });

    const language = receiverSettings?.preferredLanguage || "en";
    const translation = getTranslation("VEHICLE_SEARCHED", language, reg);
    const englishTranslation = getTranslation("VEHICLE_SEARCHED", "en", reg);

    await NotificationModel.create({
      userId: _id,
      type: "VEHICLE_SEARCHED",
      title: englishTranslation.title,
      body: englishTranslation.body,
      registrationNumber: reg,
    });

    if (
      checkData?.userId?.fcmToken?.length &&
      receiverSettings?.notifications !== false
    ) {
      NotificationService(
        checkData.userId.fcmToken,
        "VEHICLE_SEARCHED",
        null,
        translation.title,
        translation.body,
        language,
      );
    }

    const DAILY_CALL_LIMIT = parseInt(process.env.DAILY_CALL_LIMIT || "2", 10);
    const DAILY_ALERT_LIMIT = parseInt(
      process.env.DAILY_ALERT_LIMIT || "3",
      10,
    );
    const RESET_HOUR = parseInt(process.env.CALL_LIMIT_RESET_HOUR || "1", 10);

    const nowIST = dayjs().tz("Asia/Kolkata");

    let windowStart = nowIST
      .hour(RESET_HOUR)
      .minute(0)
      .second(0)
      .millisecond(0);
    if (nowIST.hour() < RESET_HOUR)
      windowStart = windowStart.subtract(1, "day");

    let nextReset = nowIST.hour(RESET_HOUR).minute(0).second(0).millisecond(0);
    if (nowIST.hour() >= RESET_HOUR) nextReset = nextReset.add(1, "day");

    const alertWindowStart = nowIST.startOf("day").toDate();

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
      isBlocked: false,
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
    const { priorityHigh, receiverId, registrationNumber } = req.body;

    if (!receiverId) {
      return BADREQUEST(res, "Receiver ID is required");
    }

    if (!registrationNumber) {
      // ✅ new validation
      return BADREQUEST(res, "Vehicle registration is required");
    }

    if (String(receiverId) === String(userId)) {
      return BADREQUEST(res, "You cannot alert yourself");
    }

    const receiverUser = (await userModel.findById(receiverId).lean()) as any;
    if (!receiverUser) {
      return BADREQUEST(res, "Receiver not found");
    }

    if (
      receiverUser?.deletionState?.status === "PENDING_DELETION" ||
      receiverUser?.deletionState?.status === "DELETED" ||
      receiverUser?.isActive === false
    ) {
      return BADREQUEST(res, "Receiver not found");
    }

    const receiverSettings = await userSettingsModel.findOne({
      userId: receiverId,
    });
    if (receiverSettings?.profileVisibility === false) {
      return BADREQUEST(res, "Receiver not found");
    }

    const isBlocked =
      receiverUser?.blockedUsers?.some(
        (blockedId: mongoose.Types.ObjectId) =>
          String(blockedId) === String(userId),
      ) ?? false;

    if (isBlocked) {
      return BADREQUEST(res, "Receiver not found");
    }

    const nowIST = dayjs().tz("Asia/Kolkata");
    const alertWindowStart = nowIST.startOf("day").toDate();
    const DAILY_ALERT_LIMIT = parseInt(
      process.env.DAILY_ALERT_LIMIT || "3",
      10,
    );

    const alertsSentToday = await NotificationModel.countDocuments({
      senderId: userId,
      userId: receiverId,
      type: { $in: ["ALERT_HIGH", "ALERT_LOW"] },
      createdAt: { $gte: alertWindowStart },
    });

    if (alertsSentToday >= DAILY_ALERT_LIMIT) {
      return TOO_MANY_REQUESTS(res, "Daily alert limit reached");
    }

    const language = receiverSettings?.preferredLanguage || "en";
    const notificationType = priorityHigh ? "ALERT_HIGH" : "ALERT_LOW";
    const translation = getTranslation(
      notificationType,
      language,
      registrationNumber,
    );
    const englishTranslation = getTranslation(
      notificationType,
      "en",
      registrationNumber,
    );

    await NotificationModel.create({
      userId: receiverId,
      type: notificationType,
      title: englishTranslation.title,
      body: englishTranslation.body,
      senderId: userId,
      registrationNumber, // ✅ new field, matches VEHICLE_SEARCHED pattern
    });

    if (
      receiverUser?.fcmToken?.length &&
      receiverSettings?.notifications !== false
    ) {
      NotificationService(
        receiverUser.fcmToken,
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
    const { userId } = req.user as any;

    const {
      receiverId,
      callId,
      status = "INITIATED",
      registrationNumber = null,
    } = req.query as {
      receiverId?: string;
      callId?: string;
      status?: string;
      registrationNumber?: string;
    };

    if (status === "INITIATED") {
      if (!receiverId) {
        return BADREQUEST(res, "Receiver ID is required");
      }

      if (String(receiverId) === String(userId)) {
        return BADREQUEST(res, "You cannot call yourself");
      }

      const receiverUser = (await userModel.findById(receiverId).lean()) as any;
      if (!receiverUser) {
        return BADREQUEST(res, "Receiver not found");
      }

      if (
        receiverUser?.deletionState?.status === "PENDING_DELETION" ||
        receiverUser?.deletionState?.status === "DELETED" ||
        receiverUser?.isActive === false
      ) {
        return BADREQUEST(res, "Receiver not found");
      }

      const receiverSettings = await userSettingsModel.findOne({
        userId: receiverId,
      });
      if (receiverSettings?.profileVisibility === false) {
        return BADREQUEST(res, "Receiver not found");
      }

      const isBlocked =
        receiverUser?.blockedUsers?.some(
          (blockedId: mongoose.Types.ObjectId) =>
            String(blockedId) === String(userId),
        ) ?? false;

      if (isBlocked) {
        return BADREQUEST(res, "Receiver not found");
      }

      // ✅ NEW — fetch caller's name for snapshot (receiver's fullName already
      // available from receiverUser fetched above)
      const callerUser = (await userModel
        .findById(userId)
        .select("fullName")
        .lean()) as any;

      const newCall = await callModel.create({
        callId: uuidv4(),
        callerId: userId,
        receiverId,
        status: "INITIATED",
        registrationNumber: normalizeRegistration(registrationNumber) || null,
        // ✅ NEW — permanent snapshot, survives future changes to either user
        callerNameSnapshot: callerUser?.fullName || null,
        receiverNameSnapshot: receiverUser?.fullName || null,
      });

      return OK(res, { callId: newCall.callId });
    }

    if (!callId) {
      return BADREQUEST(res, "Call ID is required");
    }

    const callData = await callModel.findOne({ callId });

    if (!callData) {
      return BADREQUEST(res, "Call not found");
    }

    if (
      String(callData.callerId) !== String(userId) &&
      String(callData.receiverId) !== String(userId)
    ) {
      return BADREQUEST(res, "Unauthorized call update");
    }

    if (status === "ANSWERED") {
      if (callData.status !== "INITIATED" && callData.status !== "RINGING") {
        return BADREQUEST(res, "Invalid call state transition");
      }

      await callModel.updateOne(
        { callId },
        {
          status: "ANSWERED",
          answeredAt: new Date(),
          startedAt: new Date(),
        },
      );

      await userActivityModel.create({
        userId,
        type: "CALL",
        title: "Calling activity recorded",
      });

      await userActivityModel.create({
        userId: callData.receiverId,
        type: "RECEIVED_CALL",
        title: "Calling activity recorded",
      });
    } else if (status === "ENDED") {
      if (callData.status !== "ANSWERED") {
        return BADREQUEST(res, "Invalid call state transition");
      }

      const endedAt = new Date();
      const duration = callData.startedAt
        ? Math.floor((endedAt.getTime() - callData.startedAt.getTime()) / 1000)
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
      if (["ENDED", "FAILED", "MISSED"].includes(callData.status)) {
        return BADREQUEST(res, "Invalid call state transition");
      }

      await callModel.updateOne(
        { callId },
        {
          status: "FAILED",
          failureReason: "User did not answer",
          endedAt: new Date(),
        },
      );

      await userActivityModel.create({
        userId,
        type: "FAILED_CALL",
        title: "Calling activity recorded",
      });

      const receiverSettings = await userSettingsModel.findOne({
        userId: callData.receiverId,
      });
      const language = receiverSettings?.preferredLanguage || "en";

      const userData = (await userModel
        .findById(callData.receiverId)
        .select("fcmToken")
        .lean()) as any;

      if (
        userData?.fcmToken?.length &&
        receiverSettings?.notifications !== false
      ) {
        const translation = getTranslation("CALL", language);

        NotificationService(
          userData.fcmToken,
          "CALL",
          null,
          translation.title,
          translation.body,
          language,
        );
      }
    } else {
      return BADREQUEST(res, "Invalid call status");
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
    const { pageNum, limitNum } = normalizePagination(page, limit);

    if (
      direction !== undefined &&
      !["incoming", "outgoing"].includes(String(direction))
    ) {
      return BADREQUEST(res, "Invalid direction");
    }

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
      reportModel.distinct("callId", { reportedBy: userId }),
    ]);

    const reportedSet = new Set(reportedCallIds.map(String));

    const records = calls.map((call: any) => {
      // ✅ Resolve ids without relying on populate succeeding
      const callerIdStr =
        typeof call.callerId === "object" && call.callerId?._id
          ? String(call.callerId._id)
          : String(call.callerId);

      const isOutgoing = callerIdStr === String(userId);
      const plateNumber = call.registrationNumber ?? null;

      const otherPartyPopulated = isOutgoing ? call.receiverId : call.callerId;
      const otherPartySnapshot = isOutgoing
        ? call.receiverNameSnapshot
        : call.callerNameSnapshot;

      // ✅ Fallback chain: live populate → stored snapshot → "Unknown"
      const otherName: string =
        (typeof otherPartyPopulated === "object" &&
          otherPartyPopulated?.fullName) ||
        otherPartySnapshot ||
        "Unknown";

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
        registrationNumber: plateNumber,
        otherPartyInitials: initials,
        otherPartyName: otherName,
        startedAt: call.startedAt || null,
        endedAt: call.endedAt || null,
        durationInSeconds: call.durationInSeconds || 0,
        status: call.status,
        createdAt: call.createdAt,
        canReport: !isOutgoing,
        reported: reportedSet.has(call.callId),
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

    const extraText: string | null =
      (additionalText || customReason)?.trim() || null;

    const validReasons = ["SPAM", "ABUSIVE", "OTHER"];
    if (!reason || !validReasons.includes(reason)) {
      return BADREQUEST(res, "Invalid report reason");
    }

    const callData = await callModel.findOne({ callId });
    if (!callData) {
      return BADREQUEST(res, "Call not found");
    }

    if (String(callData.receiverId) !== String(userId)) {
      return BADREQUEST(res, "Only the call receiver can report this call");
    }

    if (!["ANSWERED", "ENDED", "FAILED"].includes(callData.status)) {
      return BADREQUEST(res, "Call cannot be reported yet");
    }

    const existingReport = await reportModel.findOne({
      reportedBy: userId,
      callId,
    });

    if (existingReport) {
      return res
        .status(409)
        .json({ success: false, message: "Already reported" });
    }

    await reportModel.create({
      reportedBy: userId,
      reportedUser: callData.callerId,
      callId,
      reason,
      additionalText: extraText,
    });

    await userModel.updateOne(
      { _id: userId, blockedUsers: { $ne: callData.callerId } },
      { $push: { blockedUsers: callData.callerId } },
    );

    await userActivityModel.create({
      userId,
      type: "CALL",
      title: `Reported and blocked a caller`,
    });

    // Optional future enhancement:
    // const totalReports = await reportModel.countDocuments({ reportedUser: callData.callerId });
    // if (totalReports >= SOME_THRESHOLD) { ... deactivate user ... }

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

    const vehicleInfo = (await userInfoModel.findOne({ userId }).lean()) as any;
    const vehicles = vehicleInfo?.vehicle || [];
    const registrations = vehicles.map((v: any) => v.vehicleRegistration);

    const vehicleCreatedMap = new Map(
      vehicles.map((v: any) => [
        v.vehicleRegistration,
        new Date(v.createdAt || 0),
      ]),
    );

    const [unreadNotifications, recentCalls, timesContactedRaw, searchDocs] =
      await Promise.all([
        NotificationModel.countDocuments({ userId, isRead: false }),

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

        callModel.countDocuments({
          receiverId: userObjectId,
          status: {
            $in: ["INITIATED", "ANSWERED", "ENDED", "FAILED", "MISSED"],
          },
        }),

        registrations.length
          ? userActivityModel
              .find({
                userId: { $ne: userId },
                type: "VEHICLE_SEARCHED",
                registrationNumber: { $in: registrations },
              })
              .lean()
          : [],
      ]);

    const vehicleSearched = searchDocs.filter((doc: any) => {
      const vehicleCreatedMap = new Map<string, Date>(
        vehicles.map((v: any) => [
          String(v.vehicleRegistration),
          new Date(v.createdAt || 0),
        ]),
      );
    }).length;

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
      timesContacted: timesContactedRaw,
      vehicleRegistered: vehicles.length || 0,
      memberSince: userData?.createdAt || null,
      unreadNotifications,
      recentCalls: recentCallRecords,
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

    const { pageNum, limitNum } = normalizePagination(page, limit);

    const query = type === "ALL" ? { userId } : { userId, type };

    const [activity, totalData] = await Promise.all([
      userActivityModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      userActivityModel.countDocuments(query),
    ]);

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

    const user = (await userModel
      .findById(userId)
      .select("isActive deletionState")
      .lean()) as any;

    if (!user) {
      return BADREQUEST(res, "User not found");
    }

    if (
      user.isActive === false ||
      user?.deletionState?.status === "PENDING_DELETION" ||
      user?.deletionState?.status === "DELETED"
    ) {
      return BADREQUEST(res, "Account is not active");
    }

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
      preferredLanguage = "en",
    } = req.body as any;
    const { userId } = req.user as any;

    if (!["en", "hi", "mr"].includes(preferredLanguage)) {
      return BADREQUEST(res, "Invalid language. Supported: en, hi, mr");
    }

    const user = (await userModel
      .findById(userId)
      .select("isActive deletionState")
      .lean()) as any;

    if (!user) {
      return BADREQUEST(res, "User not found");
    }

    if (
      user.isActive === false ||
      user?.deletionState?.status === "PENDING_DELETION" ||
      user?.deletionState?.status === "DELETED"
    ) {
      return BADREQUEST(res, "Account is not active");
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

    if (fcmToken) {
      await userModel.updateOne({ _id: userId }, { $pull: { fcmToken } });
    }

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

    const existingUser = (await userModel
      .findById(userId)
      .select("deletionState")
      .lean()) as any;

    if (!existingUser) {
      return BADREQUEST(res, "User not found");
    }

    if (existingUser?.deletionState?.status === "PENDING_DELETION") {
      return OK(res, {
        message:
          "Your account is already scheduled for permanent deletion. Log back in to cancel.",
      });
    }

    await userModel.updateOne(
      { _id: userId },
      {
        $set: {
          "deletionState.status": "PENDING_DELETION",
          "deletionState.requestedAt": new Date(),
          "deletionState.scheduledAt": dayjs().add(14, "days").toDate(),
          fcmToken: [],
          isActive: false,
        },
      },
    );

    await userActivityModel.create({
      userId,
      type: "DELETE_ACCOUNT",
      title:
        "Account deletion requested. Will be permanently deleted in 14 days.",
    });

    return OK(res, {
      message:
        "Your account will be permanently deleted in 14 days. Log back in to cancel.",
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

    const { pageNum, limitNum } = normalizePagination(page, limit);

    const userSettings = await userSettingsModel.findOne({ userId });
    const userLanguage = userSettings?.preferredLanguage || "en";

    const [notifications, totalData, unreadNotifications] = await Promise.all([
      NotificationModel.find({ userId })
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      NotificationModel.countDocuments({ userId }),
      NotificationModel.countDocuments({ userId, isRead: false }),
    ]);

    const translatedNotifications = notifications.map((notification: any) => {
      const translation = getTranslation(
        notification.type,
        userLanguage,
        notification.registrationNumber || "",
      );

      return {
        ...notification,
        title: translation.title,
        body: translation.body,
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

    if (!notificationId) {
      return BADREQUEST(res, "Notification ID is required");
    }

    const notification = await NotificationModel.findOneAndUpdate(
      { _id: notificationId, userId, isRead: false },
      { $set: { isRead: true } },
      { new: true },
    );

    if (!notification) {
      const existingNotification = await NotificationModel.findOne({
        _id: notificationId,
        userId,
      });

      if (!existingNotification) {
        return BADREQUEST(res, "Notification not found");
      }

      return OK(res, existingNotification);
    }

    if (
      notification.type === "ALERT_HIGH" ||
      notification.type === "ALERT_LOW"
    ) {
      const senderSettings = await userSettingsModel.findOne({
        userId: notification.senderId,
      });
      const language = senderSettings?.preferredLanguage || "en";

      const translation = getTranslation(
        "ALERT_ACKNOWLEDGED",
        language,
        notification.registrationNumber,
      );

      const englishTranslation = getTranslation(
        "ALERT_ACKNOWLEDGED",
        "en",
        notification.registrationNumber,
      );

      await NotificationModel.create({
        userId: notification.senderId,
        type: "ALERT_ACKNOWLEDGED",
        title: englishTranslation.title,
        body: englishTranslation.body,
        registrationNumber: notification.registrationNumber,
      });

      const findFCM = (await userModel
        .findById(notification.senderId)
        .select("fcmToken")
        .lean()) as any;

      if (
        findFCM?.fcmToken?.length &&
        senderSettings?.notifications !== false
      ) {
        NotificationService(
          findFCM.fcmToken,
          "ALERT_ACKNOWLEDGED",
          null,
          translation.title,
          translation.body,
          language,
        );
      }
    }

    return OK(res, notification);
  } catch (e: any) {
    console.error(e);
    if (e?.message) return BADREQUEST(res, e.message);
    return INTERNAL_SERVER_ERROR(res);
  }
};
