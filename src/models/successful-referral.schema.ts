import mongoose, { Document, Schema } from "mongoose";

export interface ISuccessfulReferral extends Document {
  referredBy?: mongoose.Types.ObjectId;
  referredTo?: mongoose.Types.ObjectId;
  rewardEarned?: number;
}

const SuccessfulReferralSchema = new Schema<ISuccessfulReferral>(
  {
    referredBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    referredTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    rewardEarned: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

export const successfulReferralModel = mongoose.model<ISuccessfulReferral>(
  "successfulReferral",
  SuccessfulReferralSchema
);
