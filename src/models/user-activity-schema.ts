import mongoose, { Document, Schema } from "mongoose";

export interface IUserActivity extends Document {
  userId: mongoose.Types.ObjectId;
  type:
    | "LOGIN"
    | "LOGOUT"
    | "VEHICLE_SEARCHED"
    | "ALERT"
    | "CALL"
    | "VEHICLE_ADDED"
    | "VEHICLE_REMOVED"
    | "DELETE_ACCOUNT";
  title: string | null;
}

const UserActivitySchema = new Schema<IUserActivity>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: [
        "LOGIN",
        "LOGOUT",
        "VEHICLE_SEARCHED",
        "ALERT",
        "CALL",
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
