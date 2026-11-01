/**
 * Public contact details and canonical public URLs, in one place so the
 * footer, /contact, /privacy, /terms and /data-deletion cannot drift apart.
 * The address, GSTIN and legal name are deliberately NOT here -- they stay
 * as written on each page. Pure (no server-only): used by client-safe pages.
 */
export const SITE_URL = "https://aipilot.waveswebstudio.in";

export const SUPPORT_EMAIL = "support@waveswebstudio.in";
export const GENERAL_EMAIL = "contact@waveswebstudio.in";

export const PHONE_PRIMARY = { display: "+91 79815 96249", tel: "tel:+917981596249" };
export const PHONE_WHATSAPP = {
  display: "+91 63038 96249",
  tel: "tel:+916303896249",
  whatsapp: "https://wa.me/916303896249",
};

export const DATA_DELETION_STATUS_URL = `${SITE_URL}/data-deletion/status`;
