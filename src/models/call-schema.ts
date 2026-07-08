import { Schema, model } from "mongoose";

const CallSchema = new Schema(
  {
    callId: { type: String, required: true, unique: true },

    callerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    receiverId: { type: Schema.Types.ObjectId, ref: "User" },

    // ✅ NEW — captured at call-creation time, used as fallback in getCallRecords
    callerNameSnapshot: { type: String, default: null },
    receiverNameSnapshot: { type: String, default: null },

    status: {
      type: String,
      enum: ["INITIATED", "RINGING", "ANSWERED", "ENDED", "FAILED", "MISSED"],
      default: "INITIATED",
    },

    startedAt: { type: Date },
    answeredAt: { type: Date },
    endedAt: { type: Date },

    durationInSeconds: { type: Number, default: 0 },

    failureReason: { type: String },
    registrationNumber: { type: String, default: null },
  },
  { timestamps: true },
);

export const callModel = model("Call", CallSchema);