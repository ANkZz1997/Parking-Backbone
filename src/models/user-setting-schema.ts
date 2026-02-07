import mongoose, { Document, Schema } from "mongoose";

export interface IUserSettings extends Document {
  userId: mongoose.Types.ObjectId;
  notifications: boolean;
  emailAlerts: boolean;
  smsAlerts: boolean;
  profileVisibility: boolean;
  preferredLanguage: "en" | "hi" | "mr";
}

const UserSettingsSchema = new Schema<IUserSettings>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    notifications: {
      type: Boolean,
      default: true,
    },
    emailAlerts: {
      type: Boolean,
      default: true,
    },
    smsAlerts: {
      type: Boolean,
      default: true,
    },
    profileVisibility: {
      type: Boolean,
      default: true,
    },
    preferredLanguage: {
      type: String,
      enum: ["en", "hi", "mr"],
      default: "en",
    },
  },
  { timestamps: true },
);

export const userSettingsModel = mongoose.model<IUserSettings>(
  "UserSettings",
  UserSettingsSchema,
);
