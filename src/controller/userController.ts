import { Request, Response } from "express";
import { BADREQUEST, INTERNAL_SERVER_ERROR, OK } from "../utils/response";
import { userInfoModel } from "../models/user-info-schema";
import { userModel } from "../models/user-schema";
import { userActivityModel } from "../models/user-activity-schema";
import { userSettingsModel } from "../models/user-setting-schema";
import { platform } from "os";
import { PlatformSettingModel } from "../models/platform-settings-schema";
import { successfulReferralModel } from "../models/successful-referral.schema";
import { ref } from "process";
import { NotificationService } from "../utils/fcm";
import { NotificationModel } from "../models/notification-schema";
import { makeNonce } from "../middleware/zego-middle";
import { callModel } from "../models/call-schema";
import { v4 as uuidv4 } from "uuid";

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
    const existingVehicle = await userInfoModel.findOne({
      "vehicle.vehicleRegistration": reg,
    });

    if (existingVehicle) {
      return BADREQUEST(res, "Vehicle already registered");
    }

    // === UPSERT USER INFO ===
    let userInfo = await userInfoModel.findOneAndUpdate(
      { userId: id },
      { $setOnInsert: { userId: id, modelUseCount: 0 } },
      { new: true, upsert: true },
    );

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
      userId: userId,
      type: "VEHICLE_SEARCHED",
      title: `You have searched ${vehicleRegistration}`,
      registrationNumber: vehicleRegistration,
    });

    const checkData = (await userInfoModel
      .findOne({
        userId: { $ne: userId },
        vehicle: {
          $elemMatch: { vehicleRegistration },
        },
      })
      .populate("userId")
      .lean()) as any;

    if (!checkData) {
      return BADREQUEST(res, "Vehicle not found");
    }

    const { fullName, image, _id } = checkData.userId as any;

    //Initiate Notificaiton

    await NotificationModel.create({
      userId: checkData?.userId?._id,
      type: "VEHICLE_SEARCHED",
      title: "Your vehicle was searched",
      body: `Your vehicle with registration number ${vehicleRegistration} was just searched by a user.`,
      registrationNumber: vehicleRegistration,
    });

    if (checkData?.userId?.fcmToken.length) {
      NotificationService(
        checkData?.userId?.fcmToken,
        "VEHICLE_SEARCHED",
        null,
        "Your vehicle was searched",
        `Your vehicle with registration number ${vehicleRegistration} was just searched by a user.`,
      );
    }

    return OK(res, { fullName, image, userId: _id });
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

    const notifications = await NotificationModel.create({
      userId: receiverData?._id,
      type: priorityHigh ? "ALERT_HIGH" : "ALERT_LOW",
      title: priorityHigh ? "High Priority Alert" : "Low Priority Alert",
      body: priorityHigh
        ? "You have received a high priority alert."
        : "You have received a low priority alert.",
      senderId: userId,
    });

    if (receiverData?.fcmToken?.length) {
      NotificationService(
        receiverData?.fcmToken,
        priorityHigh ? "ALERT_HIGH" : "ALERT_LOW",
        null,
        priorityHigh ? "High Priority Alert" : "Low Priority Alert",
        priorityHigh
          ? "You have received a high priority alert."
          : "You have received a low priority alert.",
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
    const { receiverId, callId, status = "INITIATED" } = req.query;

    if (status == "INITIATED" && receiverId) {
      const newCall = await callModel.create({
        callId: uuidv4(),
        callerId: userId,
        receiverId: receiverId,
        status: "INITIATED",
      });

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

      NotificationService(
        userData?.fcmToken,
        "CALL",
        null,
        "Missed Call Alert",
        "You have missed a call.",
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

// Manage Vehicles *********************************************

export const userHome = async (req: Request, res: Response) => {
  try {
    const { userId } = req.user as any;

    const userData = (await userModel
      .findById(userId)
      .select(
        "firstName lastName fullName email phoneNumber deviceType fcmToken referralCode alertBalance callBalance createdAt",
      )
      .lean()) as any;

    if (!userData) {
      return BADREQUEST(res, "User not found");
    }

    const vehicleSearched = await userActivityModel.find({
      userId,
      type: "VEHICLE_SEARCHED",
    });
    const timesContacted = await userActivityModel.countDocuments({
      userId,
      type: "RECEIVED_CALL",
    });
    const vehicleRegistered = await userInfoModel.findOne({ userId });
    const memberSince = userData?.createdAt || null;

    return OK(res, {
      ...userData,
      vehicleSearched: vehicleSearched.length,
      timesContacted,
      vehicleRegistered: vehicleRegistered?.vehicle.length || 0,
      memberSince,
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
    } = req.body as any;
    const { userId } = req.user as any;

    const settings = await userSettingsModel.findOneAndUpdate(
      { userId },
      { $set: { notifications, emailAlerts, smsAlerts, profileVisibility } },
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

// Notification Management ************************************

export const getUserNotifications = async (req: Request, res: Response) => {
  try {
    const { userId } = req.user as any;
    let { page = 1, limit = 20 } = req.query;

    const pageNum = Number(page);
    const limitNum = Number(limit);

    const notifications = await NotificationModel.find({ userId })
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    const totalData = await NotificationModel.countDocuments({ userId });

    return OK(res, {
      notifications,
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

export const readNotifications = async (req: Request, res: Response) => {
  try {
    const { notificationId } = req.body as any;
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
        await NotificationModel.create({
          userId: notifications?.senderId,
          type: "ALERT_ACKNOWLEDGED",
          title: "Your alert has been acknowledged",
          body: `Your alert regarding vehicle ${notifications?.registrationNumber} has been acknowledged by the owner.`,
          registrationNumber: notifications?.registrationNumber,
        });

        const findFCM = (await userModel
          .findById(notifications?.senderId)
          .select("fcmToken")
          .lean()) as any;

        if (findFCM.length) {
          NotificationService(
            findFCM?.fcmToken,
            "ALERT_ACKNOWLEDGED",
            null,
            "Your alert has been acknowledged",
            `Your alert regarding vehicle ${notifications?.registrationNumber} has been acknowledged by the owner.`,
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
