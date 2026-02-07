// utils/fcm.ts
import admin from "firebase-admin";
import { configDotenv } from "dotenv";
import { SupportedLanguage } from "./translations";

configDotenv();

/**
 * Initialize Firebase Admin SDK
 */
export const initializeFirebase = () => {
  try {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
      throw new Error("Missing Firebase service account credentials");
    }

    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

    // Fix multiline private key issue
    serviceAccount.private_key = serviceAccount.private_key.replace(
      /\\\\\\\\\\\\\\\\n/g,
      "\\\\\\\\n",
    );

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log("✅ Firebase Admin initialized");
    }
  } catch (error) {
    console.error("❌ Error initializing Firebase:", error);
    throw error;
  }
};

/**
 * Send FCM notifications with language support
 */
export const NotificationService = async (
  fcms: string[],
  type: string,
  referenceId?: any,
  title?: string,
  body?: string,
  language: SupportedLanguage = "en", // NEW PARAMETER
) => {
  if (!fcms?.length) return;

  const PUSH_BATCH_SIZE = 500;

  const payloads = fcms.filter(Boolean).map((token) => ({
    token,
    notification: {
      title: title,
      body: body,
    },
    data: {
      type,
      referenceId: referenceId ? JSON.stringify(referenceId) : "",
      language, // Include language in data payload
    },
  }));

  console.log(
    `🚀 Sending push notifications in ${Math.ceil(
      payloads.length / PUSH_BATCH_SIZE,
    )} batch(es) [Language: ${language}]`,
  );

  for (let i = 0; i < payloads.length; i += PUSH_BATCH_SIZE) {
    const batch = payloads.slice(i, i + PUSH_BATCH_SIZE);

    // Fire & forget (fast, non-blocking)
    admin
      .messaging()
      .sendEach(batch)
      .catch((err) => {
        console.error("❌ Push notification batch failed:", err);
      });
  }
};
