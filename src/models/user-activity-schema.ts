import mongoose, { Document, Schema } from "mongoose";

export interface IUserActivity extends Document {
  userId: mongoose.Types.ObjectId;
  type:
    | "LOGIN"
    | "LOGOUT"
    | "VEHICLE_SEARCHED"
    | "ALERT"
    | "MISSED_CALL"
    | "RECEIVED_CALL"
    | "CALL"
    | "FAILED_CALL"
    | "VEHICLE_ADDED"
    | "VEHICLE_REMOVED"
    | "DELETE_ACCOUNT";
  title: string | null;
  registrationNumber: string | null;
  createdAt: Date;
}

const UserActivitySchema = new Schema<IUserActivity>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    registrationNumber:{
      type: String,
      default: null,
    },
    type: {
      type: String,
      enum: [
        "LOGIN",
        "LOGOUT",
        "VEHICLE_SEARCHED",
        "ALERT",
        "CALL",
        "MISSED_CALL",
        "RECEIVED_CALL",
        "FAILED_CALL",
        "VEHICLE_ADDED",
        "VEHICLE_REMOVED",
        "DELETE_ACCOUNT",
      ],
      required: true,
    },
    title: {
        type: String,
        default: null,
    },
  },
  { timestamps: true }
);

export const userActivityModel = mongoose.model<IUserActivity>(
  "UserActivity",
  UserActivitySchema
);
