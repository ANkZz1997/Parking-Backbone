import { Schema, model } from "mongoose";

const CallSchema = new Schema(
  {
    callId: { type: String, required: true, unique: true },

    callerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    receiverId: { type: Schema.Types.ObjectId, ref: "User", required: true },

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
  },
  { timestamps: true },
);

export const callModel = model("Call", CallSchema);
