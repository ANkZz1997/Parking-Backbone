import cron from "node-cron";
import { userModel } from "../models/user-schema";
import { deletedEmailModel } from "../models/deleted-email-schema";

export const startDeletionCron = () => {
  cron.schedule("8 0 * * *", async () => {
    const overdueUsers = await userModel.find({
      "deletionState.status": "PENDING_DELETION",
      "deletionState.scheduledAt": { $lte: new Date() },
    });

    for (const user of overdueUsers) {
      try {
        await deletedEmailModel.updateOne(
          { email: user.email },
          {
            $setOnInsert: {
              email: user.email,
              userId: user._id,
              deletedAt: new Date(),
            },
          },
          { upsert: true }
        );

        await userModel.updateOne(
          { _id: user._id },
          {
            $set: {
              "deletionState.status": "DELETED",
              "deletionState.completedAt": new Date(),
              isActive: false,
              fcmToken: [],
            },
          }
        );
      } catch (err) {
        console.error(`[CRON] Failed to finalize user ${user._id}:`, err);
      }
    }
  });
};