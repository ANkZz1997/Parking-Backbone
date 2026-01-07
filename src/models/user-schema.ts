import mongoose, { Document, Schema } from "mongoose";

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
  callBalance: number;
  alertBalance: number;
  referralCode?: string;
}

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
    image: {
      type: String,
      default: null,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phoneNumber: {
      type: String,
      default: null,
    },
    fcmToken: {
      type: [String],
      default: [],
    },
    deviceType: {
      type: String,
      enum: ["IOS", "ANDROID", "WEB"],
      required: true,
    },
    callBalance: {
      type: Number,
      default: 0,
    },
    alertBalance: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    token: { type: String },
    password: { type: String },
    referralCode: { type: String },
  },
  { timestamps: true }
);

export const userModel = mongoose.model<IUser>("User", UserSchema);
