import mongoose, { Document, Schema } from "mongoose";

export interface IUserSettings extends Document {
  userId: mongoose.Types.ObjectId;
  notifications: boolean;
  emailAlerts: boolean;
  smsAlerts: boolean;
  profileVisibility: boolean;
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
  },
  { timestamps: true }
);

export const userSettingsModel = mongoose.model<IUserSettings>(
  "UserSettings",
  UserSettingsSchema
);
