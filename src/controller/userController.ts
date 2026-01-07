import { Request, Response } from "express";
import { BADREQUEST, INTERNAL_SERVER_ERROR, OK } from "../utils/response";
import { userInfoModel } from "../models/user-info-schema";
import { userModel } from "../models/user-schema";
import { userActivityModel } from "../models/user-activity-schema";
import { userSettingsModel } from "../models/user-setting-schema";

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

export const addUpdateUserInfo = async (req: Request, res: Response) => {
  try {
    const { wheelType, vehicleRegistration, emergencyContact } = req.body;
    const { userId: id } = req.user as any;

    const reg = vehicleRegistration.trim().toUpperCase();

    const existingVehicle = await userInfoModel.findOne({
      "vehicle.vehicleRegistration": reg,
    });

    if (existingVehicle) {
      return BADREQUEST(res, "Vehicle already registered");
    }

    let userInfo = await userInfoModel.findOne({ userId: id });

    if (!userInfo) {
      userInfo = await userInfoModel.create({
        userId: id,
        emergencyContact,
        vehicle: [
          {
            wheelType,
            vehicleRegistration: reg,
            isVerified: true,
          },
        ],
      });

      await userActivityModel.create({
        userId: id,
        type: "VEHICLE_ADDED",
        title: "You have added a new vehicle",
      });

      return OK(res, userInfo);
    }

    const already = userInfo.vehicle.some((v) => v.vehicleRegistration === reg);

    if (already) {
      return BADREQUEST(res, "You have already added this vehicle");
    }

    userInfo.vehicle.push({
      wheelType,
      vehicleRegistration: reg,
      isVerified: true,
    });

    await userActivityModel.create({
      userId: id,
      type: "VEHICLE_ADDED",
      title: "You have updated your vehicle details.",
    });

    if (emergencyContact) userInfo.emergencyContact = emergencyContact;

    await userInfo.save();

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
