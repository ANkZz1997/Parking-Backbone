import { Request, Response } from "express";
import { BADREQUEST, INTERNAL_SERVER_ERROR, OK } from "../utils/response";
import { userInfoModel } from "../models/user-info-schema";


export const addUpdateUserInfo = async (req: Request, res: Response) => {
    try {
        const { wheelType, vehicleRegistration, emergencyContact } = req.body;
        const { userId: id } = req.user as any;

        const reg = vehicleRegistration.trim().toUpperCase();

        const existingVehicle = await userInfoModel.findOne({
            "vehicle.vehicleRegistration": reg,
        });

        if (existingVehicle) {
            return BADREQUEST(res, "Vehicle already registered by another user");
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

            return OK(res, userInfo);
        }

        const already = userInfo.vehicle.some(
            (v) => v.vehicleRegistration === reg
        );

        if (already) {
            return BADREQUEST(res, "You have already added this vehicle");
        }

        userInfo.vehicle.push({
            wheelType,
            vehicleRegistration: reg,
            isVerified: true,
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
                    vehicle: { _id: vehicleId }
                }
            }
        );

        if (updateResult.modifiedCount === 0) {
            return BADREQUEST(res, "Vehicle not found");
        }

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

        const checkData = await userInfoModel.findOne({
            userId: { $ne: userId },
            vehicle: {
                $elemMatch: { vehicleRegistration }
            }
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

