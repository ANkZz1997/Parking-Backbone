import mongoose, { Date, Document, Schema } from "mongoose";

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
  deletedAt: Date;
  deletionState?: {
    status: "ACTIVE" | "PENDING_DELETION" | "DELETED";
    requestedAt: Date | null;
    scheduledAt: Date | null;
    completedAt: Date | null;
  };
  token: string;
  password: string;
  callBalance: number;
  alertBalance: number;
  coinEarned?: number;
  referralCode?: string;
  blockedUsers?: mongoose.Types.ObjectId[];
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
    coinEarned: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletionState: {
      status: {
        type: String,
        enum: ["ACTIVE", "PENDING_DELETION", "DELETED"],
        default: "ACTIVE",
      },
      requestedAt: { type: Date, default: null },
      scheduledAt: { type: Date, default: null },
      completedAt: { type: Date, default: null },
    },
    token: { type: String },
    password: { type: String },
    referralCode: { type: String },
    blockedUsers: {
      type: [{ type: Schema.Types.ObjectId, ref: "User" }],
      default: [],
    },
  },
  { timestamps: true },
);

export const userModel = mongoose.model<IUser>("User", UserSchema);
