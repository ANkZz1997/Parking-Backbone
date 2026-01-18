/**
 * Example of generating basic authentication token.
 */

import { generateToken04 } from "../utils/zego";

export function makeNonce(userId: any) {
  try {
    // Please modify appID to your own appId. appid is a number.
    // Example: 1234567890
    const appID = parseInt(process.env.ZEGO_APP_ID || "0", 10); // type: number

    // Please modify serverSecret to your own serverSecret. serverSecret is a string.
    // Example: 'sdfsdfsd323sdfsdf'
    const serverSecret = process.env.ZEGO_SERVER_SECRET || ""; // type: 32 byte length string
    // Please modify userId to the user's userId.
    const effectiveTimeInSeconds = 300; //type: number; unit: s; expiration time of token, in seconds.

    // When generating a basic authentication token, the payload should be set to an empty string.
    const payload = "";
    // Build token
    const token = generateToken04(
      appID,
      userId,
      serverSecret,
      effectiveTimeInSeconds,
      payload
    );
    return { token, effectiveTimeInSeconds };
  } catch (e) {
    console.error(e);
  }
}
