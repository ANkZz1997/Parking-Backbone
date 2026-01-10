import mongoose, { Document, Schema } from "mongoose";

export interface IPlatformSetting extends Document {
  maxReferralAllowed?: number;
  rewardPerReferral?: number;
  weeklyCallRefreshed?: number;
  weeklyAlertRefreshed?: number;
}

const PlatformSettingSchema = new Schema<IPlatformSetting>(
  {
    maxReferralAllowed: {
      type: Number,
      default: 50,
    },
    rewardPerReferral: {
      type: Number,
      default: 5,
    },
    weeklyCallRefreshed: {
      type: Number,
      default: 5,
    },
    weeklyAlertRefreshed: {
      type: Number,
      default: 10,
    },
  },
  { timestamps: true }
);

export const PlatformSettingModel = mongoose.model<IPlatformSetting>(
  "platformSetting",
  PlatformSettingSchema
);
