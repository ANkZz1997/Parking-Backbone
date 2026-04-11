import mongoose, { Document, Schema } from "mongoose";

export interface IReport extends Document {
  reportedBy: mongoose.Types.ObjectId;   // person who was called (receiver)
  reportedUser: mongoose.Types.ObjectId; // the caller being reported
  callId: string | null;
  reason: "SPAM" | "ABUSIVE" | "OTHER";
  additionalText: string | null;
  createdAt: Date;
}

const ReportSchema = new Schema<IReport>(
  {
    reportedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reportedUser: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    callId: {
      type: String,
      default: null,
    },
    reason: {
      type: String,
      enum: ["SPAM", "ABUSIVE", "OTHER"],
      required: true,
    },
    additionalText: {
      type: String,
      default: null,
      maxlength: 300,
    },
  },
  { timestamps: true }
);

export const reportModel = mongoose.model<IReport>("Report", ReportSchema);