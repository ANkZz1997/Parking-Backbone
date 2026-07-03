import mongoose, { Document, Schema } from "mongoose";

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  firstName: string;
  lastName: string;
  fullName: string;
  image?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  fcmToken: string[];
  deviceType: "IOS" | "ANDROID" | "WEB";
  isActive: boolean;
  isBlocked: boolean;
  isDeleted: boolean;
  deletedAt?: Date | null;
  deletionState?: {
    status: "ACTIVE" | "PENDING_DELETION" | "DELETED";
    requestedAt: Date | null;
    scheduledAt: Date | null;
    completedAt: Date | null;
  };
  token?: string;
  password?: string;
  callBalance: number;
  alertBalance: number;
  coinEarned?: number;
  referralCode?: string;
  blockedUsers?: mongoose.Types.ObjectId[];
  googleId?: string;
  appleId?: string;
  authProviders?: ("GOOGLE" | "APPLE")[];
}

const UserSchema: Schema = new Schema<IUser>(
  {
    firstName: { type: String, required: false, default: "User" },
    lastName: { type: String, required: false, default: "" },
    fullName: { type: String, required: false, default: "User" },
    image: { type: String, default: null },

    email: {
      type: String,
      required: false,
      lowercase: true,
      trim: true,
      index: {
        unique: true,
        partialFilterExpression: { email: { $type: "string" } },
      },
    },

    phoneNumber: { type: String, default: null },
    fcmToken: { type: [String], default: [] },
    deviceType: {
      type: String,
      enum: ["IOS", "ANDROID", "WEB"],
      required: true,
    },
    callBalance: { type: Number, default: 0 },
    alertBalance: { type: Number, default: 0 },
    coinEarned: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    isBlocked: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
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

    googleId: {
      type: String,
      default: undefined,
      index: { unique: true, sparse: true },
    },

    appleId: {
      type: String,
      default: undefined,
      index: { unique: true, sparse: true },
    },

    authProviders: {
      type: [String],
      enum: ["GOOGLE", "APPLE"],
      default: [],
    },
  },
  { timestamps: true },
);

export const userModel = mongoose.model<IUser>("User", UserSchema);