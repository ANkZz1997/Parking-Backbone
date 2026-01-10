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
      (v: any) => v._id?.toString() === vehicleId
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
      { new: true, upsert: true }
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
              }
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
      }
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
      }
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

    const checkData = await userInfoModel
      .findOne({
        userId: { $ne: userId },
        vehicle: {
          $elemMatch: { vehicleRegistration },
        },
      })
      .populate("userId")
      .lean();

    if (!checkData) {
      return BADREQUEST(res, "Vehicle not found");
    }

    const { fullName, image } = checkData.userId as any;

    return OK(res, { fullName, image });
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
        "firstName lastName fullName email phoneNumber deviceType fcmToken referralCode alertBalance callBalance"
      )
      .lean()) as any;

    if (!userData) {
      return BADREQUEST(res, "User not found");
    }

    const vehicleSearched = await userActivityModel.find({
      userId,
      type: "VEHICLE_SEARCHED",
    });
    const timesContacted = 0;
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
      { new: true, upsert: true }
    );

    return OK(res, settings);
  } catch (e: any) {
    console.error(e);
    if (e?.message) return BADREQUEST(res, e.message);
    return INTERNAL_SERVER_ERROR(res);
  }
};
