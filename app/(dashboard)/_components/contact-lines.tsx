import {
  GENERAL_EMAIL,
  PHONE_PRIMARY,
  PHONE_WHATSAPP,
  SUPPORT_EMAIL,
} from "@/lib/site-contact";

const LINK = "font-medium text-ds-accent hover:text-ds-accent-strong";

/** Both emails and both phones as `<p>` lines, matching the existing Grievance Officer cards. */
export function ContactLines({ includeGeneral = true }: { includeGeneral?: boolean }) {
  return (
    <>
      <p>
        Email (support, grievances, data requests):{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className={LINK}>
          {SUPPORT_EMAIL}
        </a>
      </p>
      {includeGeneral ? (
        <p>
          Email (general and business enquiries):{" "}
          <a href={`mailto:${GENERAL_EMAIL}`} className={LINK}>
            {GENERAL_EMAIL}
          </a>
        </p>
      ) : null}
      <p>
        Phone:{" "}
        <a href={PHONE_PRIMARY.tel} className={LINK}>
          {PHONE_PRIMARY.display}
        </a>
      </p>
      <p>
        Phone / WhatsApp:{" "}
        <a href={PHONE_WHATSAPP.tel} className={LINK}>
          {PHONE_WHATSAPP.display}
        </a>{" "}
        ·{" "}
        <a href={PHONE_WHATSAPP.whatsapp} className={LINK}>
          Message on WhatsApp
        </a>
      </p>
    </>
  );
}
