import mongoose, { Document, Schema } from 'mongoose';

export interface IUserInfo extends Document {
  userId: mongoose.Types.ObjectId;
  emergencyContact: string | null;
  vehicle: {
    wheelType: number;
    vehicleRegistration: string;
    isVerified: boolean;
  }[];
}

const VehicleSchema = new Schema(
  {
    wheelType: {
      type: Number,
      enum: [2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20],
      required: true,
    },
    vehicleRegistration: {
      type: String,
      required: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
  },
);

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
    vehicle: {
      type: [VehicleSchema],
      default: [],
    },
  },
  { timestamps: true }
);


UserInfoSchema.index(
  { "vehicle.vehicleRegistration": 1 },
  { unique: true, sparse: true }
);

export const userInfoModel = mongoose.model<IUserInfo>('UserInfo', UserInfoSchema);
