import mongoose, { Document, model, Schema } from "mongoose";

export interface IUserInfo extends Document {
  userId: mongoose.Types.ObjectId;
  emergencyContact: string | null;
  modelUseCount: number;
  vehicle: {
    wheelType: number;
    vehicleRegistration: string;
    isVerified: boolean;
    createdAt: Date;
  }[];
  createdAt: Date;
}

const VehicleSchema = new Schema({
  wheelType: {
    type: Number,
    enum: [2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20],
    required: true,
  },
  vehicleRegistration: {
    type: String,
    unique: true,
    required: true,
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
});

const UserInfoSchema = new Schema<IUserInfo>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    emergencyContact: {
      type: String,
      default: null,
    },
    modelUseCount: {
      type: Number,
      default: 0,
    },
    vehicle: {
      type: [VehicleSchema],
      default: [],
    },
  },
  { timestamps: true }
);

export const userInfoModel = mongoose.model<IUserInfo>(
  "UserInfo",
  UserInfoSchema
);
