import mongoose, { Document, Schema } from "mongoose";

export interface INotifications extends Document {
  userId: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId | null;
  type: "VEHICLE_SEARCHED" | "ALERT_HIGH" | "ALERT_LOW" | "CALL" | "ALERT_ACKNOWLEDGED";
  title: string | null;
  body: string | null;
  isRead: boolean;
  registrationNumber: string | null;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotifications>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    senderId:{
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null,
    },
    type: { 
      type: String,
      enum: ["VEHICLE_SEARCHED", "ALERT_HIGH","ALERT_LOW", "CALL", "ALERT_ACKNOWLEDGED"],
      required: true,
    },
    title: {
      type: String,
      default: null,
    },
    body: {
      type: String,
      default: null,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    registrationNumber: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

export const NotificationModel = mongoose.model<INotifications>(
  "notifications",
  NotificationSchema
);
