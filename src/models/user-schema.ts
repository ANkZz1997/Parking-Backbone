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
  appleId?: string;                         
  authProviders?: ('GOOGLE' | 'APPLE')[];
}

const UserSchema: Schema = new Schema<IUser>(
  {
    firstName: {
      type: String,
      required: false,
      default: 'User',
    },
    lastName: {
      type: String,
      required: false,
      default: '',
    },
    fullName: {
      type: String,
      required: false,
      default: 'User',
    },
    image: {
      type: String,
      default: null,
    },
    email: {
      type: String,
      required: false,      // ✅ CHANGED — Apple users may not have email
      unique: true,
      sparse: true,         // ✅ ADD — allows multiple null emails without unique conflict
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
    appleId: {
      type: String,
      default: null,
      sparse: true,         // allows null for Google-only users
      index: true,          // fast lookup by appleId on login
    },
    authProviders: {
      type: [String],
      enum: ['GOOGLE', 'APPLE'],
      default: [],
    },
  },
  { timestamps: true },
);

export const userModel = mongoose.model<IUser>("User", UserSchema);
