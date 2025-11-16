import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  firstName: string;
  lastName: string;
  fullName: string;
  image: string;
  email: string;
  phoneNumber: string;
  fcmToken: string[];
  deviceType: string;
  isActive: boolean;
  isBlocked: boolean;
  isDeleted: boolean;
  token: string;
  password: string;
}

const VehicleSchema = new Schema(
  {
    wheelType: {
      type: Number,
      enum: [2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20],
      required: true,
    },
    vehicleNumber: {
      type: String,
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

const UserSchema: Schema = new Schema<IUser>(
  {
    firstName: {
      type: String,
      required: true,
    },
    lastName: {
      type: String,
      required: true,
    },
    fullName: {
      type: String,
      required: true,
    },
    image :{
      type: String,
      default: null
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    phoneNumber: {
      type: String,
      default: null
    },
    fcmToken: {
      type: [String],
      default: []
    },
    deviceType: {
      type: String,
      enum: ["IOS", "ANDROID", "WEB"],
      required: true
    },
    isActive: {
      type: Boolean,
      default: false
    },
    isBlocked: {
      type: Boolean,
      default: false
    },
    isDeleted: {
      type: Boolean,
      default: false
    },
    token: {type: String},
    password: { type: String },
  },
  { timestamps: true }
);

export const userModel = mongoose.model<IUser>('User', UserSchema);
