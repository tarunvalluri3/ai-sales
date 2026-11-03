# WhatsApp Embedded Signup (v4) and per-business templates

Production readiness item 6, 2026-11-03.
- Code: `lib/whatsapp-embedded-signup-rules.ts` (pure, tested), `lib/whatsapp-embedded-signup.ts`, `lib/whatsapp-template-sync.ts`, `app/(dashboard)/dashboard/whatsapp/*`.
- Built entirely without live Meta calls: every Graph request is mocked in `npm run test:whatsapp-embedded-signup`.
- **The first real signup is the first end-to-end test.**

Meta's docs were read on 2026-11-03. Embedded Signup **v2/v3 were deprecated on 2026-10-15**. You get v4 by creating a **new** Facebook Login for Business configuration with products selected.

## How a customer connects

1. On **Dashboard → WhatsApp**, the owner (org admin, on an active trial or Growth/Scale) clicks **Connect with Facebook**.
2. Meta's popup runs. The owner logs in, picks or creates the business portfolio and WhatsApp Business Account (WABA), then adds and verifies a phone number. In v4 the phone number comes first.
3. The browser gets a one-time `code` (valid 30 s) and Meta's `WA_EMBEDDED_SIGNUP` message with `waba_id` and `phone_number_id`. Our server then does every Graph call server-to-server:

   1. `GET /oauth/access_token` (client_id, client_secret, code) exchanges the code for a business token.
   2. `GET /<WABA_ID>/phone_numbers` confirms the chosen number belongs to that WABA.
   3. `POST /<WABA_ID>/subscribed_apps` sends this WABA's webhooks to us.
   4. `POST /<PHONE_NUMBER_ID>/register` with `{ messaging_product: "whatsapp", pin }` and a random 6-digit PIN that we store encrypted.

4. The token and PIN are stored **encrypted** (`META_TOKEN_ENCRYPTION_KEY`, the same as Instagram tokens). The connection row records `onboarding_method = embedded_signup` and the last step reached.
5. If a step after the exchange fails, the number shows the step's message and a **Finish setup** button. It retries with the stored token, because the code can't be reused. Meta allows at most 10 register attempts per number in 72 hours.
6. On success, our five appointment templates are **submitted to the business's own WABA** automatically.
7. The owner still has to **add a payment method in WhatsApp Manager**, per Meta's docs. We can't do that for them.

Failure states the owner can see:
- the popup was closed (and at which step, when Meta says);
- Meta reported an error (its message);
- the code was expired or rejected;
- the number isn't in the chosen WABA;
- the subscribe failed;
- the register failed, hit its rate limit, or hit an existing two-step PIN (the owner turns that off in WhatsApp Manager, then presses Finish setup);
- the number is already connected to another business on our platform.

The manual token form is still there under "Connect manually instead", and is the only option when Embedded Signup isn't configured.

## Templates per business

Templates belong to each business's WABA, so every business needs its own approved copy.

- **Submitted:** automatically after signup, or with **Submit for approval** on the WhatsApp page. Only templates the WABA doesn't already have are sent: category UTILITY, positional `{{1}}`-`{{3}}` with example values, language `WHATSAPP_TEMPLATE_LANGUAGE` (default `en`). The bodies are in `lib/whatsapp-templates.ts`.
- **Status:** shown per template on the WhatsApp page (approved, waiting for review, rejected with reason, couldn't submit with Meta's message). It is updated by:
  - the `message_template_status_update` webhook (fast path);
  - a scheduler job every 6 hours (`whatsapp_template_sync`);
  - the **Refresh status** button.
- **Rejected templates are not resubmitted automatically.** Meta refuses a duplicate name, so a rejected template needs reworded copy (a code change) or a new name.
- **Sending uses the configured names.** Set each `WHATSAPP_TEMPLATE_APPOINTMENT_*` to the suggested name (`appointment_confirmed`, `appointment_declined`, `appointment_cancelled`, `appointment_reminder`, `appointment_expired`) so sends use what was submitted. A business whose copy isn't approved yet gets a visible "not sent" failure for notices outside the 24-hour window, never a silent drop.

## What you must configure in Meta

1. **Become a Tech Provider** (or Solution Partner). Meta requires this for Embedded Signup.
   - Complete **Business Verification** for your business portfolio.
   - Solution Partners also need a credit line; Tech Providers don't.
2. **App:** use the existing Meta app (`META_APP_ID`) and add the **WhatsApp** product.
3. **Permissions with Advanced Access, through App Review:** `whatsapp_business_management` and `whatsapp_business_messaging`.
   - Each needs a written description and a screen recording: one of creating a message template, one of sending a message.
   - The app must be in **Live** mode.
4. **Facebook Login for Business → Configurations → Create:**
   - Choose the **WhatsApp Embedded Signup** variation and select the WhatsApp (Cloud API) product. That makes it v4.
   - Select only the assets and permissions needed.
   - Put the configuration id in `WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID`.
5. **Facebook Login for Business → Settings → Client OAuth settings.** Set these to Yes: Client OAuth login, Web OAuth login, Enforce HTTPS, Embedded Browser OAuth Login, Use Strict Mode for redirect URIs, Login with the JavaScript SDK.
   - Add `aipilot.waveswebstudio.in` (and any HTTPS staging domain you test on) to **Allowed Domains for the JavaScript SDK** and to **Valid OAuth Redirect URIs** (`https://aipilot.waveswebstudio.in/`).
   - Only HTTPS domains work, so localhost won't.
6. **Webhooks**, WhatsApp Business Account object:
   - Callback `https://aipilot.waveswebstudio.in/api/webhooks/whatsapp` with `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
   - Subscribe to `messages`, which includes delivery `statuses`, and `message_template_status_update`.
   - Subscribe to `account_update` too: Meta's docs list it as a prerequisite, since it fires when a customer finishes signup. We don't act on it yet, so it's logged or ignored.
   - `WHATSAPP_APP_SECRET` must be this app's secret, which signs the webhooks.
7. **Server env:** `META_APP_ID`, `META_APP_SECRET`, `META_TOKEN_ENCRYPTION_KEY` (32 bytes, already used for Instagram), `WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_TEMPLATE_LANGUAGE=en`, and the five `WHATSAPP_TEMPLATE_APPOINTMENT_*` names.
   - `META_GRAPH_VERSION` defaults to `v26.0`.
8. **First live test:**
   - On a production or staging HTTPS domain, connect a fresh number (one not on the WhatsApp app). Check that the number shows Connected, that `whatsapp_embedded_signup_complete` is in the logs, and that the five templates show "Waiting for Meta's review".
   - Send a WhatsApp message to the number and get the AI reply.

## Known gaps

- The manual connection path still uses Graph `v21.0`; Embedded Signup uses `META_GRAPH_VERSION` (default v26.0).
- `account_update` webhooks aren't processed.
- The scheduler sync covers 50 connected businesses per run.
- Business-token expiry isn't stated in the docs we read. A revoked or expired token surfaces as a send `auth` failure ("Reconnect WhatsApp"), as with manual tokens.
