// utils/translations.ts
export type SupportedLanguage = "en" | "hi" | "mr";

// Updated interface to support both string and function
export interface NotificationTranslation {
  title: string;
  body: string | ((param: string) => string); // ← Changed this
}

// Translation dictionary
const translations: Record<
  string,
  Record<SupportedLanguage, NotificationTranslation>
> = {
  VEHICLE_SEARCHED: {
    en: {
      title: "Your vehicle was searched",
      body: (reg: string) =>
        `Someone searched your vehicle with registration number ${reg}. They may try to contact you.`,
    },
    hi: {
      title: "आपके वाहन को खोजा गया",
      body: (reg: string) =>
        `किसी ने आपके वाहन को पंजीकरण संख्या ${reg} के साथ खोजा है। वे आपसे संपर्क करने का प्रयास कर सकते हैं।`,
    },
    mr: {
      title: "तुमचे वाहन शोधले गेले",
      body: (reg: string) =>
        `कोणीतरी तुमचे वाहन नोंदणी क्रमांक ${reg} सह शोधले आहे. ते तुमच्याशी संपर्क साधण्याचा प्रयत्न करू शकतात.`,
    },
  },
  ALERT_HIGH: {
    en: {
      title: "High Priority Alert",
      body: "You have received a high priority alert regarding your vehicle.",
    },
    hi: {
      title: "उच्च प्राथमिकता अलर्ट",
      body: "आपको अपने वाहन के संबंध में उच्च प्राथमिकता अलर्ट प्राप्त हुआ है।",
    },
    mr: {
      title: "उच्च प्राधान्य इशारा",
      body: "तुम्हाला तुमच्या वाहनासंदर्भात उच्च प्राधान्य इशारा मिळाला आहे.",
    },
  },
  ALERT_LOW: {
    en: {
      title: "Low Priority Alert",
      body: "You have received a low priority alert regarding your vehicle.",
    },
    hi: {
      title: "कम प्राथमिकता अलर्ट",
      body: "आपको अपने वाहन के संबंध में कम प्राथमिकता अलर्ट प्राप्त हुआ है।",
    },
    mr: {
      title: "कमी प्राधान्य इशारा",
      body: "तुम्हाला तुमच्या वाहनासंदर्भात कमी प्राधान्य इशारा मिळाला आहे.",
    },
  },
  ALERT_ACKNOWLEDGED: {
    en: {
      title: "Your alert has been acknowledged",
      body: (reg: string) =>
        `Your alert regarding vehicle ${reg} has been acknowledged by the owner.`,
    },
    hi: {
      title: "आपके अलर्ट की पुष्टि हो गई है",
      body: (reg: string) =>
        `वाहन ${reg} के संबंध में आपके अलर्ट की मालिक द्वारा पुष्टि की गई है।`,
    },
    mr: {
      title: "तुमचा इशारा मान्य करण्यात आला",
      body: (reg: string) =>
        `वाहन ${reg} संदर्भात तुमचा इशारा मालकाने मान्य केला आहे.`,
    },
  },
  CALL: {
    en: {
      title: "Missed Call Alert",
      body: "You missed a call. Caller details are not available for privacy reasons.",
    },
    hi: {
      title: "मिस्ड कॉल अलर्ट",
      body: "आपकी एक कॉल छूट गई। गोपनीयता कारणों से कॉलर विवरण उपलब्ध नहीं है।",
    },
    mr: {
      title: "मिस्ड कॉल इशारा",
      body: "तुम्ही एक कॉल चुकवला. गोपनीयतेच्या कारणांसाठी कॉलर तपशील उपलब्ध नाहीत.",
    },
  },
};

/**
 * Get translated notification content
 * Returns the final string values (not functions)
 */
export const getTranslation = (
  type: string,
  language: SupportedLanguage = "en",
  params?: any,
): { title: string; body: string } => {
  // ← Changed return type to always be strings
  const notificationType = translations[type];

  if (!notificationType) {
    // Fallback to English if type not found
    return {
      title: "Notification",
      body: "You have a new notification",
    };
  }

  const translation = notificationType[language] || notificationType["en"];

  // Handle dynamic content (e.g., registration number)
  if (typeof translation.body === "function") {
    return {
      title: translation.title,
      body: translation.body(params || ""),
    };
  }

  return {
    title: translation.title,
    body: translation.body,
  };
};
